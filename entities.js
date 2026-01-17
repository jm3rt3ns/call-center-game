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
        
        // Pathfinding
        this.path = [];
        this.currentPathIndex = 0;
        this.targetX = this.x;
        this.targetY = this.y;
        
        // Visual
        this.size = CONFIG.employee.size;
        this.color = CONFIG.employee.colors.working;
        
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
        // Update timers based on state
        this.updateTimers(deltaTime, game);
        
        // Update behavior based on state
        this.updateBehavior(deltaTime, game);
        
        // Update visual appearance
        this.updateAppearance(game);
        
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
            this.x = this.desk.x;
            this.y = this.desk.y;
        }
    }
    
    finishBreak(game) {
        if (this.state === EMPLOYEE_STATE.ON_COFFEE_BREAK) {
            this.needsCoffee = false;
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
        }
    }
    
    sendBackToDesk(game) {
        // Manager intercepts employee
        this.state = EMPLOYEE_STATE.FORCED_WORKING;
        this.forcedWorkTimer = CONFIG.employee.forcedReturnDuration;
        this.sanity += CONFIG.employee.forcedReturnSanityIncrease;
        this.productivity += CONFIG.employee.forcedReturnProductivityBoost;
        
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
    
    updateAppearance(game) {
        const colors = CONFIG.employee.colors;
        
        if (this.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            this.color = colors.critical;
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
        // Draw employee square
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
        
        // Draw border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
        
        // Draw sanity indicator (small bar above)
        const barWidth = this.size;
        const barHeight = 4;
        const barY = this.y - this.size / 2 - 8;
        
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        
        // Sanity fill (green to red)
        const sanityPercent = this.sanity / 100;
        const hue = (1 - sanityPercent) * 120; // 120 = green, 0 = red
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * sanityPercent, barHeight);
        
        // Draw state indicator
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
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
        ctx.fillText(indicator, this.x, this.y + 4);
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
    }
    
    update(deltaTime, game) {
        const seconds = deltaTime / 1000;
        
        // Calculate velocity based on input
        this.velocityX = 0;
        this.velocityY = 0;
        
        if (this.moveUp) this.velocityY -= 1;
        if (this.moveDown) this.velocityY += 1;
        if (this.moveLeft) this.velocityX -= 1;
        if (this.moveRight) this.velocityX += 1;
        
        // Normalize diagonal movement
        if (this.velocityX !== 0 && this.velocityY !== 0) {
            const factor = 1 / Math.sqrt(2);
            this.velocityX *= factor;
            this.velocityY *= factor;
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
        
        // Keep within bounds
        this.x = Math.max(this.size, Math.min(game.office.width - this.size, this.x));
        this.y = Math.max(this.size, Math.min(game.office.height - this.size, this.y));
    }
    
    checkCollisionWithEmployee(employee) {
        const dx = this.x - employee.x;
        const dy = this.y - employee.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (this.size + employee.size) / 2;
        
        return distance < minDistance;
    }
    
    render(ctx) {
        // Draw manager square (slightly larger)
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
        
        // Draw border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
        
        // Draw manager icon
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👔', this.x, this.y + 5);
        
        // Draw proximity circle (faint)
        ctx.beginPath();
        ctx.arc(this.x, this.y, CONFIG.employee.managerProximityRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
