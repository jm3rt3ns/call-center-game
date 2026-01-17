/**
 * Call Center Chaos - Game Core
 * Main game logic, state management, and game loop
 */

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Make game globally accessible for isometric rendering
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
        this.deltaTime = 0;
        
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
        
        // Create office
        this.office = new Office();
        
        // Create manager in center of workspace
        this.manager = new Manager(450, 400);
        
        // Create employees
        this.createEmployees();
        
        // Reset game state
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
        this.deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
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
        
        // Convert real time to work day time (20 min = 8 hours)
        const totalGameSeconds = CONFIG.game.gameDurationMinutes * 60;
        const workdayHours = 8;
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
        
        // Render employees
        for (const employee of this.employees) {
            employee.render(this.ctx);
        }
        
        // Render manager
        this.manager.render(this.ctx);
        
        // Render collision prompt
        if (this.showCollisionPrompt) {
            this.renderCollisionPrompt();
        }
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
        const remaining = Math.max(0, totalSeconds - this.gameTime);
        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}
