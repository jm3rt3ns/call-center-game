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
        
        // Draw pixel art employee
        this.drawPixelEmployee(ctx, screenX, screenY);
        
        // Draw sanity indicator (small bar above)
        const barWidth = 20;
        const barHeight = 3;
        const barY = screenY - 28;
        
        // Background
        ctx.fillStyle = '#222';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
        
        // Sanity fill (green to red)
        const sanityPercent = this.sanity / 100;
        const hue = (1 - sanityPercent) * 120;
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * sanityPercent, barHeight);
        
        // Border
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX - barWidth / 2, barY, barWidth, barHeight);
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
        // Get isometric screen position
        const game = window.currentGame;
        let screenX = this.x;
        let screenY = this.y;
        
        if (game && game.office) {
            const screenPos = game.office.worldToScreen(this.x, this.y);
            screenX = screenPos.x;
            screenY = screenPos.y;
        }
        
        // Draw pixel art manager
        this.drawPixelManager(ctx, screenX, screenY);
        
        // Draw proximity circle (faint, in screen space)
        ctx.beginPath();
        ctx.arc(screenX, screenY - 10, CONFIG.employee.managerProximityRadius * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();
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
