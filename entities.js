/**
 * Call Center Chaos - Entities
 * Employee and Manager classes with behaviors and AI
 */

// ============================================
// EMPLOYEE CLASS
// ============================================
class Employee {
    constructor(index, name, desk) {
        this.index = index;
        this.name = name;
        this.desk = desk;
        
        // Position
        this.x = desk.x;
        this.y = desk.y;
        
        // Stats
        this.sanity = CONFIG.employee.initialSanity;
        this.productivity = CONFIG.employee.initialProductivity;
        
        // State
        this.state = EMPLOYEE_STATE.WORKING;
        this.previousState = EMPLOYEE_STATE.WORKING;
        
        // Timers
        this.coffeeNeedTimer = this.calculateCoffeeNeedTime();
        this.bathroomNeedTimer = this.calculateBathroomNeedTime();
        this.breakTimer = 0;
        this.callTimer = 0;
        this.forcedWorkTimer = 0;
        
        // Needs
        this.needsCoffee = false;
        this.needsBathroom = false;
        this.carryingCoffee = false;  // walking back from the coffee machine
        
        // Pathfinding
        this.path = [];
        this.currentPathIndex = 0;
        this.targetX = this.x;
        this.targetY = this.y;
        
        // Visual
        this.size = CONFIG.employee.size;
        this.color = CONFIG.employee.colors.working;
        
        // Sprite pack playback. Falls back to the procedural pixel drawing
        // below when no pack is assigned to the 'employee' actor.
        this.animator = new SpriteAnimator(
            spriteLibrary.forActor('employee'),
            (CONFIG.sprites && CONFIG.sprites.scale.employee) || 1
        );
        
        // Stats tracking
        this.callsMade = 0;
        this.revenueGenerated = 0;
        this.breaksTaken = 0;
    }
    
    calculateCoffeeNeedTime() {
        const base = CONFIG.employee.baseCoffeeNeedInterval;
        const multiplier = 1 - (this.productivity / 100) * CONFIG.employee.productivityBreakMultiplier;
        const randomMin = CONFIG.employee.breakTimingRandomMin || 0.5;
        const randomMax = CONFIG.employee.breakTimingRandomMax || 1.8;
        const randomFactor = randomMin + Math.random() * (randomMax - randomMin);
        return base * multiplier * randomFactor;
    }
    
    calculateBathroomNeedTime() {
        const base = CONFIG.employee.baseBathroomNeedInterval;
        const multiplier = 1 - (this.productivity / 100) * CONFIG.employee.productivityBreakMultiplier;
        const randomMin = CONFIG.employee.breakTimingRandomMin || 0.5;
        const randomMax = CONFIG.employee.breakTimingRandomMax || 1.8;
        const randomFactor = randomMin + Math.random() * (randomMax - randomMin);
        return base * multiplier * randomFactor;
    }
    
    update(deltaTime, game) {
        const previousX = this.x;
        
        // Update timers based on state
        this.updateTimers(deltaTime, game);
        
        // Update behavior based on state
        this.updateBehavior(deltaTime, game);
        
        // Update visual appearance
        this.updateAppearance(game);
        
        // Update sprite animation
        this.updateAnimation(deltaTime, this.x - previousX);
        
        // Clamp stats
        this.sanity = Math.max(CONFIG.employee.minSanity, Math.min(CONFIG.employee.maxSanity, this.sanity));
        this.productivity = Math.max(CONFIG.employee.minProductivity, Math.min(CONFIG.employee.maxProductivity, this.productivity));
        
        // Check for game over condition
        if (this.sanity >= CONFIG.employee.maxSanity) {
            return { gameOver: true, employee: this };
        }
        
        return { gameOver: false };
    }
    
    updateTimers(deltaTime, game) {
        const seconds = deltaTime / 1000;
        
        // Check manager proximity
        const managerDistance = this.getDistanceToManager(game.manager);
        const managerNearby = managerDistance < CONFIG.employee.managerProximityRadius;
        
        if (managerNearby && this.state === EMPLOYEE_STATE.WORKING) {
            // Manager proximity effect
            this.sanity += CONFIG.employee.managerSanityIncrease * seconds;
            this.productivity = Math.min(CONFIG.employee.maxProductivity, 
                this.productivity + CONFIG.employee.managerProductivityBoost * seconds);
            this.state = EMPLOYEE_STATE.FEARFUL;
        } else if (this.state === EMPLOYEE_STATE.FEARFUL && !managerNearby) {
            this.state = EMPLOYEE_STATE.WORKING;
        }
        
        // Only accumulate break needs when working
        if (this.state === EMPLOYEE_STATE.WORKING || this.state === EMPLOYEE_STATE.FEARFUL || this.state === EMPLOYEE_STATE.FORCED_WORKING) {
            // Passive sanity increase and productivity decay while sitting at desk
            const passiveSanityRate = CONFIG.employee.passiveSanityIncrease || 0.3;
            const passiveProductivityRate = CONFIG.employee.passiveProductivityDecay || 0.15;
            this.sanity += passiveSanityRate * seconds;
            this.productivity -= passiveProductivityRate * seconds;
            
            // Coffee need timer
            this.coffeeNeedTimer -= seconds;
            if (this.coffeeNeedTimer <= 0 && !this.needsCoffee) {
                this.needsCoffee = true;
            }
            
            // Bathroom need timer
            this.bathroomNeedTimer -= seconds;
            if (this.bathroomNeedTimer <= 0 && !this.needsBathroom) {
                this.needsBathroom = true;
            }
            
            // Call timer
            this.callTimer -= seconds;
            if (this.callTimer <= 0) {
                this.makeCall(game);
                this.callTimer = CONFIG.employee.callDuration;
            }
        }
        
        // Forced work timer
        if (this.state === EMPLOYEE_STATE.FORCED_WORKING) {
            this.forcedWorkTimer -= seconds;
            if (this.forcedWorkTimer <= 0) {
                this.state = EMPLOYEE_STATE.WORKING;
            }
        }
        
        // Break timer
        if (this.state === EMPLOYEE_STATE.ON_COFFEE_BREAK || this.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
            this.breakTimer -= seconds;
            if (this.breakTimer <= 0) {
                this.finishBreak(game);
            }
        }
    }
    
    updateBehavior(deltaTime, game) {
        const seconds = deltaTime / 1000;
        
        switch (this.state) {
            case EMPLOYEE_STATE.WORKING:
            case EMPLOYEE_STATE.FEARFUL:
                // Check if needs break and can take one
                if (this.state !== EMPLOYEE_STATE.FEARFUL) {
                    if (this.needsBathroom && !game.bathroomClosed) {
                        this.startWalkingTo('bathroom', game);
                    } else if (this.needsCoffee && !game.coffeeDumped) {
                        this.startWalkingTo('coffee', game);
                    }
                }
                break;
                
            case EMPLOYEE_STATE.WALKING_TO_COFFEE:
            case EMPLOYEE_STATE.WALKING_TO_BATHROOM:
            case EMPLOYEE_STATE.WALKING_BACK:
                this.moveAlongPath(seconds, game);
                break;
                
            case EMPLOYEE_STATE.ON_COFFEE_BREAK:
            case EMPLOYEE_STATE.ON_BATHROOM_BREAK:
                // Stay in place during break
                break;
                
            case EMPLOYEE_STATE.FORCED_WORKING:
                // Work at desk, handled in timer
                break;
        }
        
        // Handle blocked breaks (facilities unavailable)
        if (this.needsCoffee && game.coffeeDumped && this.state === EMPLOYEE_STATE.WORKING) {
            this.sanity += 0.1 * seconds; // Slowly increase insanity
        }
        if (this.needsBathroom && game.bathroomClosed && this.state === EMPLOYEE_STATE.WORKING) {
            this.sanity += 0.15 * seconds; // Faster increase for bathroom
        }
    }
    
    startWalkingTo(destination, game) {
        let targetX, targetY;
        
        if (destination === 'coffee') {
            this.carryingCoffee = false;
            targetX = game.office.coffeeStation.x;
            targetY = game.office.coffeeStation.y;
            this.state = EMPLOYEE_STATE.WALKING_TO_COFFEE;
        } else if (destination === 'bathroom') {
            targetX = game.office.bathroomStall.x;
            targetY = game.office.bathroomStall.y;
            this.state = EMPLOYEE_STATE.WALKING_TO_BATHROOM;
        } else {
            targetX = this.desk.x;
            targetY = this.desk.y;
            this.state = EMPLOYEE_STATE.WALKING_BACK;
        }
        
        this.path = game.office.findPath(this.x, this.y, targetX, targetY);
        this.currentPathIndex = 0;
        this.targetX = targetX;
        this.targetY = targetY;
    }
    
    moveAlongPath(seconds, game) {
        if (this.path.length === 0 || this.currentPathIndex >= this.path.length) {
            this.arriveAtDestination(game);
            return;
        }
        
        const target = this.path[this.currentPathIndex];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 5) {
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.path.length) {
                this.arriveAtDestination(game);
            }
            return;
        }
        
        const speed = CONFIG.employee.moveSpeed * seconds;
        this.x += (dx / distance) * speed;
        this.y += (dy / distance) * speed;
    }
    
    arriveAtDestination(game) {
        if (this.state === EMPLOYEE_STATE.WALKING_TO_COFFEE) {
            if (game.coffeeDumped) {
                // Coffee was dumped while walking
                this.startWalkingTo('desk', game);
                return;
            }
            this.state = EMPLOYEE_STATE.ON_COFFEE_BREAK;
            this.breakTimer = CONFIG.employee.coffeeBreakDuration;
            this.x = game.office.coffeeStation.x;
            this.y = game.office.coffeeStation.y;
        } else if (this.state === EMPLOYEE_STATE.WALKING_TO_BATHROOM) {
            if (game.bathroomClosed) {
                // Bathroom was closed while walking
                this.startWalkingTo('desk', game);
                return;
            }
            this.state = EMPLOYEE_STATE.ON_BATHROOM_BREAK;
            this.breakTimer = CONFIG.employee.bathroomBreakDuration;
            this.x = game.office.bathroomStall.x;
            this.y = game.office.bathroomStall.y;
        } else if (this.state === EMPLOYEE_STATE.WALKING_BACK) {
            this.state = EMPLOYEE_STATE.WORKING;
            this.carryingCoffee = false;
            this.x = this.desk.x;
            this.y = this.desk.y;
        }
    }
    
    finishBreak(game) {
        if (this.state === EMPLOYEE_STATE.ON_COFFEE_BREAK) {
            this.needsCoffee = false;
            this.carryingCoffee = true;
            this.coffeeNeedTimer = this.calculateCoffeeNeedTime();
        } else if (this.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
            this.needsBathroom = false;
            this.bathroomNeedTimer = this.calculateBathroomNeedTime();
        }
        
        // Break effects
        this.sanity -= CONFIG.employee.breakSanityRecovery;
        this.productivity -= CONFIG.employee.breakProductivityLoss;
        this.breaksTaken++;
        
        // Walk back to desk
        this.startWalkingTo('desk', game);
    }
    
    makeCall(game) {
        if (this.state === EMPLOYEE_STATE.WORKING || 
            this.state === EMPLOYEE_STATE.FEARFUL || 
            this.state === EMPLOYEE_STATE.FORCED_WORKING) {
            
            const revenue = CONFIG.employee.callRevenueMIN + 
                Math.floor(Math.random() * (CONFIG.employee.callRevenueMax - CONFIG.employee.callRevenueMIN + 1));
            
            // Productivity bonus
            const productivityBonus = 1 + (this.productivity - 50) / 100;
            const finalRevenue = Math.floor(revenue * productivityBonus);
            
            game.addRevenue(finalRevenue);
            this.callsMade++;
            this.revenueGenerated += finalRevenue;
            
            // Play call/cash sound occasionally
            if (typeof soundManager !== 'undefined' && Math.random() < 0.15) {
                soundManager.playCallSound();
            }
        }
    }
    
    sendBackToDesk(game) {
        // Manager intercepts employee
        this.state = EMPLOYEE_STATE.FORCED_WORKING;
        this.forcedWorkTimer = CONFIG.employee.forcedReturnDuration;
        this.sanity += CONFIG.employee.forcedReturnSanityIncrease;
        this.productivity += CONFIG.employee.forcedReturnProductivityBoost;
        this.carryingCoffee = false;
        
        // Teleport back to desk (for simplicity)
        this.x = this.desk.x;
        this.y = this.desk.y;
        this.path = [];
    }
    
    getDistanceToManager(manager) {
        if (!manager) return Infinity;
        const dx = this.x - manager.x;
        const dy = this.y - manager.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    isWalking() {
        return this.state === EMPLOYEE_STATE.WALKING_TO_COFFEE ||
               this.state === EMPLOYEE_STATE.WALKING_TO_BATHROOM ||
               this.state === EMPLOYEE_STATE.WALKING_BACK;
    }
    
    // Map the employee's state onto a sprite role and advance playback
    updateAnimation(deltaTime, dx) {
        if (!this.animator.available) return;
        
        if (dx !== 0) this.animator.setFacing(dx);
        
        let role = SPRITE_ROLE.IDLE;
        switch (this.state) {
            case EMPLOYEE_STATE.WORKING:
            case EMPLOYEE_STATE.FORCED_WORKING:
                role = SPRITE_ROLE.WORK;
                break;
            case EMPLOYEE_STATE.FEARFUL:
                role = SPRITE_ROLE.HURT;
                break;
            case EMPLOYEE_STATE.WALKING_TO_COFFEE:
            case EMPLOYEE_STATE.WALKING_TO_BATHROOM:
                role = SPRITE_ROLE.WALK;
                break;
            case EMPLOYEE_STATE.WALKING_BACK:
                role = this.carryingCoffee ? SPRITE_ROLE.CARRY : SPRITE_ROLE.WALK;
                break;
            case EMPLOYEE_STATE.ON_COFFEE_BREAK:
            case EMPLOYEE_STATE.ON_BATHROOM_BREAK:
                role = SPRITE_ROLE.WAIT;
                break;
        }
        
        this.animator.play(role);
        this.animator.update(deltaTime);
    }
    
    updateAppearance(game) {
        const colors = CONFIG.employee.colors;
        const wasNotCritical = this.color !== colors.critical;
        
        if (this.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            this.color = colors.critical;
            // Play alarm sound when first entering critical state
            if (wasNotCritical && typeof soundManager !== 'undefined') {
                soundManager.playCriticalAlarmSound();
            }
        } else if (this.state === EMPLOYEE_STATE.FEARFUL) {
            this.color = colors.fearful;
        } else if (this.state === EMPLOYEE_STATE.ON_COFFEE_BREAK || this.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
            this.color = colors.onBreak;
        } else if (this.needsBathroom) {
            this.color = colors.needsBathroom;
        } else if (this.needsCoffee) {
            this.color = colors.needsCoffee;
        } else {
            this.color = colors.working;
        }
    }
    
    render(ctx) {
        // Get isometric screen position
        const game = window.currentGame;
        let screenX = this.x;
        let screenY = this.y;
        
        if (game && game.office) {
            const screenPos = game.office.worldToScreen(this.x, this.y);
            screenX = screenPos.x;
            screenY = screenPos.y;
        }
        
        // Characters are drawn at fixed pixel sizes, so match whatever scale the
        // office fitted the level to
        const scale = (game && game.office) ? game.office.scale : 1;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);
        screenX = 0;
        screenY = 0;
        
        // Draw the sprite when a pack is loaded, otherwise the procedural art
        const usedSprite = this.animator.draw(ctx, screenX, screenY);
        if (!usedSprite) {
            this.drawPixelEmployee(ctx, screenX, screenY);
        }
        
        const headroom = usedSprite ? this.animator.drawnHeightAboveGround + 6 : 28;
        
        // The people who matter right now carry their whole card over their
        // head - on a phone there is no side panel to read them from
        if (this.showsOverheadCard(game)) {
            this.drawOverheadCard(ctx, screenX, screenY - headroom);
        } else {
            this.drawSanityBar(ctx, screenX, screenY - headroom);
        }
        
        ctx.restore();
    }
    
    /**
     * Whose stats float over their head: whoever the manager is standing near,
     * and anyone close enough to snapping that you want to know wherever they
     * are on the floor.
     */
    showsOverheadCard(game) {
        const ui = CONFIG.ui || {};
        if (ui.overheadAlwaysCritical !== false &&
            this.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            return true;
        }
        
        if (!game || !game.manager) return false;
        const radius = ui.overheadLabelRadius || 0;
        if (radius <= 0) return false;
        
        const dx = game.manager.x - this.x;
        const dy = game.manager.y - this.y;
        return dx * dx + dy * dy <= radius * radius;
    }
    
    drawSanityBar(ctx, x, y) {
        const barWidth = 20;
        const barHeight = 3;
        
        // Background
        ctx.fillStyle = '#222';
        ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
        
        // Sanity fill (green to red)
        const sanityPercent = this.sanity / 100;
        const hue = (1 - sanityPercent) * 120;
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(x - barWidth / 2, y, barWidth * sanityPercent, barHeight);
        
        // Border
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - barWidth / 2, y, barWidth, barHeight);
    }
    
    /**
     * Name, insanity, productivity and what they are doing, in a small pixel
     * plate above the sprite. Same information the side panel carries, put
     * where you are already looking.
     */
    drawOverheadCard(ctx, x, y) {
        const width = 46;
        const height = 25;
        const left = x - width / 2;
        const top = y - height;
        const critical = this.sanity >= CONFIG.employee.sanityCriticalThreshold;
        const warning = this.sanity >= CONFIG.employee.sanityWarningThreshold;
        
        ctx.save();
        
        // Plate
        ctx.fillStyle = 'rgba(10, 10, 20, 0.82)';
        ctx.fillRect(left, top, width, height);
        ctx.strokeStyle = critical ? '#ef4444' : (warning ? '#fbbf24' : 'rgba(148, 163, 184, 0.7)');
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        
        // Name, with the state's emblem beside it
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(this.name.slice(0, 8), left + 3, top + 3);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(this.overheadStateMark(), left + width - 3, top + 3);
        
        // Insanity, then productivity
        this.drawOverheadBar(ctx, left + 3, top + 12, width - 6, 4,
                             this.sanity / 100,
                             `hsl(${(1 - this.sanity / 100) * 120}, 80%, 50%)`);
        this.drawOverheadBar(ctx, left + 3, top + 18, width - 6, 4,
                             this.productivity / 100, '#60a5fa');
        
        ctx.restore();
    }
    
    drawOverheadBar(ctx, x, y, width, height, fraction, color) {
        const filled = Math.max(0, Math.min(1, fraction));
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width * filled, height);
    }
    
    /** One character for what they are up to, so the plate stays small. */
    overheadStateMark() {
        switch (this.state) {
            case EMPLOYEE_STATE.WALKING_TO_COFFEE:
            case EMPLOYEE_STATE.ON_COFFEE_BREAK:
                return 'COF';
            case EMPLOYEE_STATE.WALKING_TO_BATHROOM:
            case EMPLOYEE_STATE.ON_BATHROOM_BREAK:
                return 'WC';
            case EMPLOYEE_STATE.WALKING_BACK:
                return 'RET';
            case EMPLOYEE_STATE.FEARFUL:
                return 'FEAR';
            case EMPLOYEE_STATE.FORCED_WORKING:
                return 'FRCD';
            default:
                return 'CALL';
        }
    }
    
    drawPixelEmployee(ctx, x, y) {
        const baseColor = this.color;
        
        // Body (isometric cube shape)
        const bodyWidth = 14;
        const bodyHeight = 18;
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Legs (pixel style)
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(x - 5, y - 6, 4, 8);
        ctx.fillRect(x + 1, y - 6, 4, 8);
        
        // Body/torso
        ctx.fillStyle = baseColor;
        ctx.fillRect(x - 7, y - 16, 14, 12);
        
        // Shirt collar
        ctx.fillStyle = this.lightenColor(baseColor, 30);
        ctx.fillRect(x - 3, y - 17, 6, 2);
        
        // Arms
        ctx.fillStyle = baseColor;
        ctx.fillRect(x - 10, y - 14, 4, 8);
        ctx.fillRect(x + 6, y - 14, 4, 8);
        
        // Hands
        ctx.fillStyle = '#e8c8a8';
        ctx.fillRect(x - 10, y - 7, 4, 3);
        ctx.fillRect(x + 6, y - 7, 4, 3);
        
        // Head
        ctx.fillStyle = '#e8c8a8';
        ctx.fillRect(x - 5, y - 24, 10, 8);
        
        // Hair (varies by employee index)
        const hairColors = ['#3a2a1a', '#6a4a2a', '#2a1a0a', '#8a6a4a', '#1a1a2a'];
        ctx.fillStyle = hairColors[this.index % hairColors.length];
        ctx.fillRect(x - 5, y - 26, 10, 4);
        
        // Eyes (pixel dots)
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 3, y - 22, 2, 2);
        ctx.fillRect(x + 1, y - 22, 2, 2);
        
        // Mouth based on state
        if (this.state === EMPLOYEE_STATE.FEARFUL) {
            // Worried mouth
            ctx.fillRect(x - 2, y - 18, 4, 1);
            ctx.fillRect(x - 1, y - 17, 2, 1);
        } else if (this.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            // Angry mouth
            ctx.fillRect(x - 2, y - 18, 4, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 1, y - 18, 2, 1);
        } else {
            // Normal
            ctx.fillRect(x - 1, y - 18, 2, 1);
        }
        
        // State indicator icon above head
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        let indicator = '';
        switch (this.state) {
            case EMPLOYEE_STATE.WORKING:
            case EMPLOYEE_STATE.FORCED_WORKING:
                indicator = '📞';
                break;
            case EMPLOYEE_STATE.FEARFUL:
                indicator = '😰';
                break;
            case EMPLOYEE_STATE.WALKING_TO_COFFEE:
            case EMPLOYEE_STATE.ON_COFFEE_BREAK:
                indicator = '☕';
                break;
            case EMPLOYEE_STATE.WALKING_TO_BATHROOM:
            case EMPLOYEE_STATE.ON_BATHROOM_BREAK:
                indicator = '🚻';
                break;
        }
        ctx.fillText(indicator, x, y - 32);
        
        // Critical warning glow
        if (this.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 12, y - 28, 24, 32);
        }
    }
    
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
}

// ============================================
// MANAGER CLASS
// ============================================
class Manager {
    constructor(startX, startY) {
        this.x = startX;
        this.y = startY;
        this.size = CONFIG.manager.size;
        this.color = CONFIG.manager.color;
        this.speed = CONFIG.manager.moveSpeed;
        
        // Movement
        this.velocityX = 0;
        this.velocityY = 0;
        
        // Input state
        this.moveUp = false;
        this.moveDown = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        // Analog input from the touch stick, as a world-space direction whose
        // length is how hard it is being pushed
        this.analogX = 0;
        this.analogY = 0;
        
        // Sprite pack playback. Falls back to the procedural pixel drawing
        // below when no pack is assigned to the 'manager' actor.
        this.animator = new SpriteAnimator(
            spriteLibrary.forActor('manager'),
            (CONFIG.sprites && CONFIG.sprites.scale.manager) || 1
        );
        this.moving = false;
        this.movingMs = 0;      // ms spent moving, for the walk -> run ramp
        this.reactionHold = 0;  // ms a finished reaction pose is held for
    }
    
    update(deltaTime, game) {
        const seconds = deltaTime / 1000;
        const previousX = this.x;
        const previousY = this.y;
        
        // Calculate velocity based on input
        this.velocityX = 0;
        this.velocityY = 0;
        
        if (this.moveUp) this.velocityY -= 1;
        if (this.moveDown) this.velocityY += 1;
        if (this.moveLeft) this.velocityX -= 1;
        if (this.moveRight) this.velocityX += 1;
        
        // The stick adds to the keys rather than replacing them, so a phone
        // with a keyboard attached can use either without them fighting
        this.velocityX += this.analogX;
        this.velocityY += this.analogY;
        
        // Diagonals, and a stick pushed past the rim, would otherwise outrun a
        // straight line. A half-pushed stick keeps its half speed.
        const magnitude = Math.sqrt(this.velocityX * this.velocityX +
                                    this.velocityY * this.velocityY);
        if (magnitude > 1) {
            this.velocityX /= magnitude;
            this.velocityY /= magnitude;
        }
        
        // Apply speed
        const newX = this.x + this.velocityX * this.speed * seconds;
        const newY = this.y + this.velocityY * this.speed * seconds;
        
        // Collision detection with office
        if (game.office.isWalkablePixel(newX, this.y)) {
            this.x = newX;
        }
        if (game.office.isWalkablePixel(this.x, newY)) {
            this.y = newY;
        }
        
        // Keep within the level, which is its own size independent of the canvas
        this.x = Math.max(this.size, Math.min(game.office.worldWidth - this.size, this.x));
        this.y = Math.max(this.size, Math.min(game.office.worldHeight - this.size, this.y));
        
        this.updateAnimation(deltaTime, seconds, this.x - previousX, this.y - previousY);
    }
    
    /** Point the manager with the touch stick. (0, 0) lets go. */
    setAnalogMove(x, y) {
        this.analogX = x;
        this.analogY = y;
    }
    
    /**
     * Pick a locomotion animation. He steps off at a walk and breaks into a run
     * once he has been moving a moment, and drops back to a walk whenever a
     * wall or a desk holds him below full speed - measured from how far he
     * actually travelled this frame, not from the input. Reactions triggered by
     * playReaction() win until they end.
     */
    updateAnimation(deltaTime, seconds, dx, dy) {
        if (!this.animator.available) {
            this.moving = dx !== 0 || dy !== 0;
            return;
        }
        
        const travelled = Math.sqrt(dx * dx + dy * dy);
        const fullTravel = this.speed * seconds;
        const speedFraction = fullTravel > 0 ? travelled / fullTravel : 0;
        
        this.moving = travelled > 0.01;
        this.movingMs = this.moving ? this.movingMs + deltaTime : 0;
        
        if (dx !== 0) this.animator.setFacing(dx);
        
        if (this.reactionHold > 0) {
            this.reactionHold -= deltaTime;
        } else if (!this.animator.busy) {
            if (!this.moving) {
                this.animator.play(SPRITE_ROLE.IDLE);
            } else if (this.movingMs >= CONFIG.sprites.walkToRunMs &&
                       speedFraction >= CONFIG.sprites.runThreshold) {
                this.animator.play(SPRITE_ROLE.RUN);
            } else {
                this.animator.play(SPRITE_ROLE.WALK);
            }
        }
        
        this.animator.update(deltaTime);
    }
    
    // Play a one-shot reaction (yell, desk slam, pointed finger) and hold the
    // final pose briefly so it reads before locomotion takes over again.
    playReaction(role) {
        if (!this.animator.available) return;
        this.animator.playOnce(role, () => {
            this.reactionHold = CONFIG.sprites.reactionHoldMs;
            this.movingMs = 0;
        });
    }
    
    checkCollisionWithEmployee(employee) {
        const dx = this.x - employee.x;
        const dy = this.y - employee.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (this.size + employee.size) / 2;
        
        return distance < minDistance;
    }
    
    render(ctx) {
        // Get isometric screen position
        const game = window.currentGame;
        let screenX = this.x;
        let screenY = this.y;
        
        if (game && game.office) {
            const screenPos = game.office.worldToScreen(this.x, this.y);
            screenX = screenPos.x;
            screenY = screenPos.y;
        }
        
        // Characters are drawn at fixed pixel sizes, so match whatever scale the
        // office fitted the level to
        const scale = (game && game.office) ? game.office.scale : 1;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);
        
        // Fear aura on the floor, flattened to match the isometric tiles
        this.drawProximityAura(ctx, 0, 0);
        
        // Draw the sprite when a pack is loaded, otherwise the procedural art
        if (this.animator.available) {
            this.drawContactShadow(ctx, 0, 0);
            this.animator.draw(ctx, 0, 0);
            this.drawMarker(ctx, 0, 0);
        } else {
            this.drawPixelManager(ctx, 0, 0);
        }
        
        ctx.restore();
    }
    
    drawProximityAura(ctx, x, y) {
        const radius = CONFIG.employee.managerProximityRadius * 0.7;
        const flatten = CONFIG.office.tileHeight / CONFIG.office.tileWidth;
        const pulse = Math.sin(Date.now() / 400) * 0.05 + 0.15;
        
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, radius, radius * flatten, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.35})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(239, 68, 68, ${pulse + 0.1})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
    
    // Extras the sprite sheet doesn't carry, drawn under the character
    drawContactShadow(ctx, x, y) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // ...and over it, so the player can always pick themselves out of the crowd.
    // A chunky pixel chevron rather than an emoji, which would blur next to
    // the sprite art.
    drawMarker(ctx, x, y) {
        const bob = Math.round(Math.sin(Date.now() / 300) * 2);
        const top = Math.round(y - this.animator.drawnHeightAboveGround - 12) + bob;
        const left = Math.round(x);
        
        // 7px wide chevron pointing down, two pixels tall per step
        ctx.fillStyle = '#ef4444';
        for (let step = 0; step < 4; step++) {
            const halfWidth = 3 - step;
            ctx.fillRect(left - halfWidth, top + step * 2, halfWidth * 2 + 1, 2);
        }
        // Highlight along the top edge
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(left - 3, top, 7, 1);
    }
    
    drawPixelManager(ctx, x, y) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Legs (manager wears slacks)
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x - 5, y - 8, 4, 10);
        ctx.fillRect(x + 1, y - 8, 4, 10);
        
        // Shoes
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(x - 6, y, 5, 3);
        ctx.fillRect(x + 1, y, 5, 3);
        
        // Body (suit jacket)
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(x - 9, y - 20, 18, 14);
        
        // Suit lapels
        ctx.fillStyle = '#2a2a4a';
        ctx.beginPath();
        ctx.moveTo(x - 2, y - 20);
        ctx.lineTo(x - 5, y - 10);
        ctx.lineTo(x - 2, y - 10);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 20);
        ctx.lineTo(x + 5, y - 10);
        ctx.lineTo(x + 2, y - 10);
        ctx.closePath();
        ctx.fill();
        
        // Tie
        ctx.fillStyle = '#cc3333';
        ctx.fillRect(x - 2, y - 19, 4, 10);
        ctx.beginPath();
        ctx.moveTo(x - 2, y - 9);
        ctx.lineTo(x, y - 5);
        ctx.lineTo(x + 2, y - 9);
        ctx.closePath();
        ctx.fill();
        
        // Arms
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(x - 12, y - 18, 4, 10);
        ctx.fillRect(x + 8, y - 18, 4, 10);
        
        // Hands
        ctx.fillStyle = '#e8c8a8';
        ctx.fillRect(x - 12, y - 9, 4, 4);
        ctx.fillRect(x + 8, y - 9, 4, 4);
        
        // Head
        ctx.fillStyle = '#e8c8a8';
        ctx.fillRect(x - 6, y - 30, 12, 10);
        
        // Hair (slicked back manager style)
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x - 6, y - 32, 12, 4);
        ctx.fillRect(x - 7, y - 31, 2, 3);
        ctx.fillRect(x + 5, y - 31, 2, 3);
        
        // Eyebrows (stern)
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x - 5, y - 28, 4, 1);
        ctx.fillRect(x + 1, y - 28, 4, 1);
        
        // Eyes (stern look)
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 4, y - 26, 3, 2);
        ctx.fillRect(x + 1, y - 26, 3, 2);
        
        // Eye whites
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 3, y - 26, 1, 1);
        ctx.fillRect(x + 2, y - 26, 1, 1);
        
        // Frown
        ctx.fillStyle = '#8a6a5a';
        ctx.fillRect(x - 2, y - 22, 4, 1);
        
        // Manager label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('👔', x, y - 36);
        
        // Authority aura effect (subtle pulse)
        const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 14, y - 34, 28, 38);
    }
}
