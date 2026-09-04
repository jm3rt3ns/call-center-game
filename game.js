/**
 * Call Center Chaos - Game Core
 * Main game logic, state management, and the 2D pixel-art render pass
 */

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Make game globally accessible for rendering
        window.currentGame = this;
        
        // Game state
        this.state = GAME_STATE.MENU;
        this.revenue = 0;
        this.gameTime = 0; // Real seconds elapsed
        this.workdayTime = 0; // In-game hours (0-8)
        
        // Entities
        this.office = null;
        this.manager = null;
        this.employees = [];
        
        // Ability states
        this.coffeeDumped = false;
        this.coffeeDumpTimer = 0;
        this.bathroomClosed = false;
        this.bathroomCloseTimer = 0;
        
        // Collision handling
        this.collidingEmployee = null;
        this.showCollisionPrompt = false;
        
        // Timing
        this.lastTime = 0;
        this.deltaTime = 0;     // Simulation delta - real delta x speedMultiplier
        this.realDeltaTime = 0; // Wall-clock delta for this frame, in ms
        this.speedMultiplier = getSpeedMultiplier();
        
        // Sound
        this.lastFootstepTime = 0;
        this.footstepInterval = 200; // ms between footsteps
        this.lastCallSoundTime = 0;
        this.callSoundInterval = 3000; // ms between call sounds
        
        // Stats for end screen
        this.stats = {
            totalCalls: 0,
            totalBreaks: 0,
            coffeesDumped: 0,
            bathroomsClosed: 0,
            employeesSentBack: 0,
        };
        
        // Game over info
        this.gameOverReason = '';
        this.insaneEmployee = null;
    }
    
    init() {
        // Set canvas size
        this.canvas.width = CONFIG.office.canvasWidth;
        this.canvas.height = CONFIG.office.canvasHeight;
        
        // Keep pixel art crisp - no smoothing when sprites are scaled up
        this.ctx.imageSmoothingEnabled = false;
        
        // Create office
        this.office = new Office();
        
        // Create manager in center of workspace
        this.manager = new Manager(450, 400);
        
        // Create employees
        this.createEmployees();
        
        // Reset game state
        this.speedMultiplier = getSpeedMultiplier();
        this.revenue = 0;
        this.gameTime = 0;
        this.workdayTime = 0;
        this.coffeeDumped = false;
        this.bathroomClosed = false;
        this.state = GAME_STATE.PLAYING;
        
        // Reset stats
        this.stats = {
            totalCalls: 0,
            totalBreaks: 0,
            coffeesDumped: 0,
            bathroomsClosed: 0,
            employeesSentBack: 0,
        };
    }
    
    createEmployees() {
        this.employees = [];
        const numEmployees = CONFIG.game.numberOfEmployees;
        
        // Shuffle names for variety
        const shuffledNames = [...EMPLOYEE_NAMES].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < numEmployees; i++) {
            const desk = this.office.getAssignedDesk(i);
            const name = shuffledNames[i % shuffledNames.length];
            const employee = new Employee(i, name, desk);
            
            // Slight randomization of initial stats
            employee.sanity = CONFIG.employee.initialSanity + (Math.random() - 0.5) * 20;
            employee.productivity = CONFIG.employee.initialProductivity + (Math.random() - 0.5) * 20;
            
            this.employees.push(employee);
        }
    }
    
    update(timestamp) {
        if (this.state !== GAME_STATE.PLAYING) return;
        
        // Calculate delta time
        if (this.lastTime === 0) {
            this.lastTime = timestamp;
        }
        this.realDeltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Everything downstream - the clock, employees, the manager, sprite
        // animation - is driven off this one delta, so scaling it here speeds
        // up or slows down the whole simulation uniformly
        this.deltaTime = this.realDeltaTime * this.speedMultiplier;
        
        // Cap delta time to prevent huge jumps
        if (this.deltaTime > 100) this.deltaTime = 100;
        
        // Update game time
        this.updateGameTime();
        
        // Check win/lose conditions
        if (this.checkEndConditions()) return;
        
        // Update ability timers
        this.updateAbilityTimers();
        
        // Update manager
        this.manager.update(this.deltaTime, this);
        
        // Update employees and check for collisions
        this.updateEmployees();
        
        // Check for manager-employee collisions
        this.checkCollisions();
    }
    
    updateGameTime() {
        const seconds = this.deltaTime / 1000;
        this.gameTime += seconds;
        
        // Convert real time to work day time (5 min = 9 hours, 8am to 5pm)
        const totalGameSeconds = CONFIG.game.gameDurationMinutes * 60;
        const workdayHours = 9; // 8am to 5pm
        this.workdayTime = (this.gameTime / totalGameSeconds) * workdayHours;
    }
    
    updateAbilityTimers() {
        const seconds = this.deltaTime / 1000;
        
        // Coffee dump timer
        if (this.coffeeDumped) {
            this.coffeeDumpTimer -= seconds;
            if (this.coffeeDumpTimer <= 0) {
                this.coffeeDumped = false;
                // Send employees walking to coffee back to desk
                this.employees.forEach(emp => {
                    if (emp.state === EMPLOYEE_STATE.WALKING_TO_COFFEE) {
                        // They can continue now
                    }
                });
            }
        }
        
        // Bathroom close timer
        if (this.bathroomClosed) {
            this.bathroomCloseTimer -= seconds;
            if (this.bathroomCloseTimer <= 0) {
                this.bathroomClosed = false;
            }
        }
    }
    
    updateEmployees() {
        for (const employee of this.employees) {
            const result = employee.update(this.deltaTime, this);
            
            if (result.gameOver) {
                this.insaneEmployee = result.employee;
                this.gameOverReason = `${result.employee.name} has gone insane and attacked you!`;
                this.endGame(false);
                return;
            }
        }
        
        // Update stats
        this.stats.totalCalls = this.employees.reduce((sum, emp) => sum + emp.callsMade, 0);
        this.stats.totalBreaks = this.employees.reduce((sum, emp) => sum + emp.breaksTaken, 0);
    }
    
    checkCollisions() {
        this.collidingEmployee = null;
        this.showCollisionPrompt = false;
        
        for (const employee of this.employees) {
            if (employee.isWalking() && this.manager.checkCollisionWithEmployee(employee)) {
                this.collidingEmployee = employee;
                this.showCollisionPrompt = true;
                break;
            }
        }
    }
    
    checkEndConditions() {
        // Check time
        const totalGameSeconds = CONFIG.game.gameDurationMinutes * 60;
        if (this.gameTime >= totalGameSeconds) {
            if (this.revenue >= CONFIG.game.revenueTarget) {
                this.endGame(true);
            } else {
                this.gameOverReason = 'The workday ended but you didn\'t meet your revenue target!';
                this.endGame(false);
            }
            return true;
        }
        
        return false;
    }
    
    endGame(won) {
        this.state = won ? GAME_STATE.WIN : GAME_STATE.LOSE;
        
        // The manager gloats, or goes down with the ship
        if (won) {
            this.manager.playReaction(SPRITE_ROLE.CELEBRATE);
        } else if (this.insaneEmployee) {
            this.manager.playReaction(SPRITE_ROLE.DEAD);
        } else {
            this.manager.playReaction(SPRITE_ROLE.FALL);
        }
        
        // Play appropriate sound
        if (typeof soundManager !== 'undefined') {
            if (won) {
                soundManager.playWinSound();
            } else {
                soundManager.playGameOverSound();
            }
        }
    }
    
    // ============================================
    // MANAGER ABILITIES
    // ============================================
    
    dumpCoffee() {
        if (this.coffeeDumped) return;
        
        this.coffeeDumped = true;
        this.coffeeDumpTimer = CONFIG.manager.coffeeDumpDuration;
        this.stats.coffeesDumped++;
        
        // Play coffee dump sound
        if (typeof soundManager !== 'undefined') {
            soundManager.playCoffeeDumpSound();
        }
        
        this.manager.playReaction(SPRITE_ROLE.ANGRY);
        
        // Affect all employees who need coffee
        this.employees.forEach(emp => {
            if (emp.needsCoffee || emp.state === EMPLOYEE_STATE.ON_COFFEE_BREAK) {
                emp.sanity += CONFIG.manager.coffeeDumpSanityIncrease;
                emp.productivity += CONFIG.manager.coffeeDumpProductivityBoost;
                
                // If on break, send back
                if (emp.state === EMPLOYEE_STATE.ON_COFFEE_BREAK) {
                    emp.startWalkingTo('desk', this);
                }
            }
        });
    }
    
    closeBathroom() {
        if (this.bathroomClosed) return;
        
        this.bathroomClosed = true;
        this.bathroomCloseTimer = CONFIG.manager.bathroomCloseDuration;
        this.stats.bathroomsClosed++;
        
        // Play bathroom close sound
        if (typeof soundManager !== 'undefined') {
            soundManager.playBathroomSound();
        }
        
        this.manager.playReaction(SPRITE_ROLE.SLAM);
        
        // Affect all employees who need bathroom
        this.employees.forEach(emp => {
            if (emp.needsBathroom || emp.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
                emp.sanity += CONFIG.manager.bathroomCloseSanityIncrease;
                emp.productivity += CONFIG.manager.bathroomCloseProductivityBoost;
                
                // If on break, send back
                if (emp.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
                    emp.startWalkingTo('desk', this);
                }
            }
        });
    }
    
    sendEmployeeBack() {
        if (this.collidingEmployee && this.collidingEmployee.isWalking()) {
            this.collidingEmployee.sendBackToDesk(this);
            this.stats.employeesSentBack++;
            this.collidingEmployee = null;
            this.showCollisionPrompt = false;
            
            this.manager.playReaction(SPRITE_ROLE.COMMAND);
            
            // Play send back sound
            if (typeof soundManager !== 'undefined') {
                soundManager.playSendBackSound();
            }
        }
    }
    
    addRevenue(amount) {
        this.revenue += amount;
    }
    
    // ============================================
    // RENDERING
    // ============================================
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render office
        this.office.render(this.ctx);
        
        // Render ability indicators
        this.renderAbilityIndicators();
        
        // Render characters back to front so the ones in front overlap
        // the ones behind them
        this.renderCharacters();
        
        // Render collision prompt
        if (this.showCollisionPrompt) {
            this.renderCollisionPrompt();
        }
        
        // Tint the whole scene to the time of day
        this.renderTimeOfDayTint();
    }
    
    renderCharacters() {
        const characters = [...this.employees, this.manager];
        // Depth in an isometric view runs along x + y
        characters.sort((a, b) => (a.x + a.y) - (b.x + b.y));
        
        for (const character of characters) {
            character.render(this.ctx);
        }
    }
    
    /**
     * Warm morning light, neutral midday, deep orange late afternoon, as a flat
     * wash over the finished frame.
     */
    renderTimeOfDayTint() {
        const workdayHours = CONFIG.game.workdayEndHour - CONFIG.game.workdayStartHour;
        const t = Math.max(0, Math.min(1, this.workdayTime / workdayHours));
        
        let color, alpha, mode;
        if (t < 0.35) {
            // Morning: warm amber haze laid over the scene, fading to nothing
            mode = 'source-over';
            color = 'rgb(255, 186, 112)';
            alpha = 0.18 * (1 - t / 0.35);
        } else if (t < 0.6) {
            // Midday: clear
            return;
        } else {
            // Afternoon into evening: multiply through a sunset orange, which
            // both warms and dims the office as the day runs out
            mode = 'multiply';
            color = 'rgb(255, 150, 92)';
            alpha = 0.45 * ((t - 0.6) / 0.4);
        }
        
        if (alpha <= 0.005) return;
        
        this.ctx.save();
        this.ctx.globalCompositeOperation = mode;
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }
    
    renderAbilityIndicators() {
        // Get isometric positions
        const coffeeScreen = this.office.worldToScreen(this.office.coffeeStation.x, this.office.coffeeStation.y);
        const bathroomScreen = this.office.worldToScreen(this.office.bathroomStall.x, this.office.bathroomStall.y);
        
        // Coffee dumped indicator
        if (this.coffeeDumped) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(coffeeScreen.x, coffeeScreen.y - 10, 30, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('❌ DUMPED', coffeeScreen.x, coffeeScreen.y - 35);
            this.ctx.font = 'bold 12px monospace';
            this.ctx.fillText(`${Math.ceil(this.coffeeDumpTimer)}s`, coffeeScreen.x, coffeeScreen.y + 25);
        }
        
        // Bathroom closed indicator
        if (this.bathroomClosed) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(bathroomScreen.x, bathroomScreen.y - 10, 30, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🚧 CLOSED', bathroomScreen.x, bathroomScreen.y - 35);
            this.ctx.font = 'bold 12px monospace';
            this.ctx.fillText(`${Math.ceil(this.bathroomCloseTimer)}s`, bathroomScreen.x, bathroomScreen.y + 25);
        }
    }
    
    renderCollisionPrompt() {
        // Get manager's isometric position
        const managerScreen = this.office.worldToScreen(this.manager.x, this.manager.y);
        
        // Pixel art style prompt box
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.fillRect(managerScreen.x - 70, managerScreen.y - 70, 140, 40);
        
        // Border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(managerScreen.x - 70, managerScreen.y - 70, 140, 40);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Press [SPACE] to', managerScreen.x, managerScreen.y - 55);
        this.ctx.fillText('send back to desk', managerScreen.x, managerScreen.y - 40);
    }
    
    // ============================================
    // GETTERS FOR UI
    // ============================================
    
    getFormattedWorkTime() {
        const hours = Math.floor(this.workdayTime);
        const minutes = Math.floor((this.workdayTime % 1) * 60);
        const displayHour = CONFIG.game.workdayStartHour + hours;
        const period = displayHour >= 12 ? 'PM' : 'AM';
        const hour12 = displayHour > 12 ? displayHour - 12 : displayHour;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
    
    getRemainingRealTime() {
        const totalSeconds = CONFIG.game.gameDurationMinutes * 60;
        // gameTime runs at speedMultiplier x real time, so the workday's
        // remaining seconds convert back to wall-clock seconds
        const remaining = Math.max(0, totalSeconds - this.gameTime) / this.speedMultiplier;
        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}
