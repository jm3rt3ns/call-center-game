/**
 * Call Center Chaos - Main Entry Point
 * Handles initialization, input, UI updates, and game loop
 */

// ============================================
// GLOBAL REFERENCES
// ============================================
let game = null;
let animationFrameId = null;

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const howToPlayScreen = document.getElementById('how-to-play-screen');
const gameScreen = document.getElementById('game-screen');
const winScreen = document.getElementById('win-screen');
const loseScreen = document.getElementById('lose-screen');
const canvas = document.getElementById('game-canvas');

// Config inputs
const configEmployees = document.getElementById('config-employees');
const configDuration = document.getElementById('config-duration');
const configTarget = document.getElementById('config-target');
const configSpeed = document.getElementById('config-speed');

// HUD elements
const hudRevenue = document.getElementById('hud-revenue');
const hudTarget = document.getElementById('hud-target');
const hudTime = document.getElementById('hud-time');
const hudRealTime = document.getElementById('hud-real-time');
const coffeeStatus = document.getElementById('coffee-status');
const bathroomStatus = document.getElementById('bathroom-status');
const employeeList = document.getElementById('employee-list');

// Level line on the main menu
const activeLevelName = document.getElementById('active-level-name');
const useBuiltInLevel = document.getElementById('use-built-in-level');

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(screenId) {
    // Nothing outside the end screens should keep an animation running
    if (screenId !== 'win-screen' && screenId !== 'lose-screen') {
        stopEndAnimation();
    }
    
    // Hide all screens
    mainMenu.classList.add('hidden');
    howToPlayScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    loseScreen.classList.add('hidden');
    
    // Show requested screen
    document.getElementById(screenId).classList.remove('hidden');
    
    if (screenId === 'main-menu') showActiveLevel();
}

// ============================================
// LEVEL
// ============================================

/**
 * The menu says which level will be played, and offers a way back to the
 * built-in one when the editor has left a playtest level behind.
 */
function showActiveLevel() {
    const level = getActiveLevel();
    activeLevelName.textContent = level.name;
    useBuiltInLevel.classList.toggle('hidden', level.id !== 'custom');
}

useBuiltInLevel.addEventListener('click', () => {
    try {
        window.localStorage.removeItem(CUSTOM_LEVEL_STORAGE_KEY);
    } catch (err) {
        // Nothing stored means nothing to clear.
    }
    showActiveLevel();
});

showActiveLevel();

// ============================================
// MENU HANDLERS
// ============================================
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('how-to-play').addEventListener('click', () => showScreen('how-to-play-screen'));
document.getElementById('back-to-menu').addEventListener('click', () => showScreen('main-menu'));
document.getElementById('win-menu').addEventListener('click', () => showScreen('main-menu'));
document.getElementById('lose-menu').addEventListener('click', () => showScreen('main-menu'));

async function startGame() {
    // Load sprite packs once, before the first game is built - entities read
    // the library in their constructors
    if (!spriteLibrary.ready) {
        const startButton = document.getElementById('start-game');
        const originalLabel = startButton.textContent;
        startButton.disabled = true;
        startButton.textContent = 'Loading sprites...';
        await spriteLibrary.loadAll(CONFIG.sprites.basePath);
        startButton.disabled = false;
        startButton.textContent = originalLabel;
    }
    
    // Initialize sound manager
    if (typeof soundManager !== 'undefined') {
        soundManager.init();
        soundManager.resume();
        soundManager.playClickSound();
    }
    
    // Apply config from menu
    CONFIG.game.numberOfEmployees = parseInt(configEmployees.value) || 10;
    CONFIG.game.gameDurationMinutes = parseInt(configDuration.value) || 5;
    CONFIG.game.revenueTarget = parseInt(configTarget.value) || 500;
    CONFIG.game.speedMultiplier = parseFloat(configSpeed.value) || CONFIG.game.speedMultiplier;
    
    // Update HUD target display
    hudTarget.textContent = CONFIG.game.revenueTarget;
    
    // Update canvas size for fullscreen
    CONFIG.office.canvasWidth = window.innerWidth - 250;
    CONFIG.office.canvasHeight = window.innerHeight - 90;
    
    // Initialize the 2D pixel-art game
    game = new Game(canvas);
    game.init();
    
    // Show game screen
    showScreen('game-screen');
    
    // Create employee status cards
    createEmployeeCards();
    
    // Start game loop
    game.lastTime = 0;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

// ============================================
// GAME LOOP
// ============================================
function gameLoop(timestamp = 0) {
    if (!game) return;
    
    // Update game logic
    game.update(timestamp);
    
    // Render game
    game.render();
    
    // Update UI
    updateUI();
    
    // Check for game end
    if (game.state === GAME_STATE.WIN) {
        showWinScreen();
        return;
    } else if (game.state === GAME_STATE.LOSE) {
        showLoseScreen();
        return;
    }
    
    // Continue loop
    animationFrameId = requestAnimationFrame(gameLoop);
}

// ============================================
// UI UPDATES
// ============================================
let lastRevenue = 0;

function updateUI() {
    if (!game || game.state !== GAME_STATE.PLAYING) return;
    
    // Update HUD with animation on revenue increase
    const currentRevenue = Math.floor(game.revenue);
    if (currentRevenue > lastRevenue) {
        hudRevenue.classList.remove('revenue-up');
        // Trigger reflow to restart animation
        void hudRevenue.offsetWidth;
        hudRevenue.classList.add('revenue-up');
    }
    lastRevenue = currentRevenue;
    hudRevenue.textContent = currentRevenue;
    hudTime.textContent = game.getFormattedWorkTime();
    hudRealTime.textContent = game.getRemainingRealTime();
    
    // Update status indicators
    if (game.coffeeDumped) {
        coffeeStatus.textContent = `☕ Coffee: DUMPED (${Math.ceil(game.coffeeDumpTimer)}s)`;
        coffeeStatus.style.background = 'rgba(239, 68, 68, 0.5)';
    } else {
        coffeeStatus.textContent = '☕ Coffee: Available';
        coffeeStatus.style.background = 'rgba(139, 69, 19, 0.5)';
    }
    
    if (game.bathroomClosed) {
        bathroomStatus.textContent = `🚻 Bathroom: CLOSED (${Math.ceil(game.bathroomCloseTimer)}s)`;
        bathroomStatus.style.background = 'rgba(239, 68, 68, 0.5)';
    } else {
        bathroomStatus.textContent = '🚻 Bathroom: Open';
        bathroomStatus.style.background = 'rgba(59, 130, 246, 0.5)';
    }
    
    // Update employee cards
    updateEmployeeCards();
}

function createEmployeeCards() {
    employeeList.innerHTML = '';
    
    game.employees.forEach((emp, index) => {
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.id = `emp-card-${index}`;
        card.innerHTML = `
            <div class="name">${emp.name}</div>
            <div class="stat-label">
                <span>Sanity</span>
                <span id="emp-sanity-${index}">50%</span>
            </div>
            <div class="stat-bar">
                <div class="stat-fill sanity-fill" id="emp-sanity-bar-${index}" style="width: 50%"></div>
            </div>
            <div class="stat-label">
                <span>Productivity</span>
                <span id="emp-prod-${index}">50%</span>
            </div>
            <div class="stat-bar">
                <div class="stat-fill productivity-fill" id="emp-prod-bar-${index}" style="width: 50%"></div>
            </div>
            <div class="status" id="emp-status-${index}">Working</div>
        `;
        employeeList.appendChild(card);
    });
}

function updateEmployeeCards() {
    game.employees.forEach((emp, index) => {
        const sanityText = document.getElementById(`emp-sanity-${index}`);
        const sanityBar = document.getElementById(`emp-sanity-bar-${index}`);
        const prodText = document.getElementById(`emp-prod-${index}`);
        const prodBar = document.getElementById(`emp-prod-bar-${index}`);
        const status = document.getElementById(`emp-status-${index}`);
        const card = document.getElementById(`emp-card-${index}`);
        
        if (!sanityText) return;
        
        // Update values
        const sanity = Math.floor(emp.sanity);
        const prod = Math.floor(emp.productivity);
        
        sanityText.textContent = `${sanity}%`;
        sanityBar.style.width = `${sanity}%`;
        prodText.textContent = `${prod}%`;
        prodBar.style.width = `${prod}%`;
        
        // Update status text
        let statusText = 'Working';
        switch (emp.state) {
            case EMPLOYEE_STATE.WORKING:
                statusText = '📞 Working';
                break;
            case EMPLOYEE_STATE.FEARFUL:
                statusText = '😰 Fearful';
                break;
            case EMPLOYEE_STATE.FORCED_WORKING:
                statusText = '😓 Forced Work';
                break;
            case EMPLOYEE_STATE.WALKING_TO_COFFEE:
                statusText = '🚶 → Coffee';
                break;
            case EMPLOYEE_STATE.WALKING_TO_BATHROOM:
                statusText = '🚶 → Bathroom';
                break;
            case EMPLOYEE_STATE.ON_COFFEE_BREAK:
                statusText = '☕ Coffee Break';
                break;
            case EMPLOYEE_STATE.ON_BATHROOM_BREAK:
                statusText = '🚻 Bathroom Break';
                break;
            case EMPLOYEE_STATE.WALKING_BACK:
                statusText = '🚶 Returning';
                break;
        }
        status.textContent = statusText;
        
        // Highlight card based on sanity
        if (sanity >= CONFIG.employee.sanityCriticalThreshold) {
            card.style.borderLeft = '3px solid #ef4444';
        } else if (sanity >= CONFIG.employee.sanityWarningThreshold) {
            card.style.borderLeft = '3px solid #fbbf24';
        } else {
            card.style.borderLeft = 'none';
        }
    });
}

// ============================================
// END SCREENS
// ============================================
let endAnimationFrameId = null;

/**
 * Play one of the manager's sprite roles, blown up, inside an end screen.
 * Does nothing when no sprite pack is loaded - the caller's emoji stands in.
 */
function playEndAnimation(container, role, scale = 4) {
    stopEndAnimation();
    
    const pack = spriteLibrary.forActor('manager');
    if (!pack) return false;
    
    const canvas = document.createElement('canvas');
    canvas.width = pack.frameWidth * scale;
    canvas.height = pack.frameHeight * scale;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const animator = new SpriteAnimator(pack, scale);
    animator.play(role, { force: true });
    
    let lastTime = 0;
    const step = (timestamp) => {
        const delta = lastTime ? timestamp - lastTime : 16;
        lastTime = timestamp;
        
        animator.update(delta);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animator.draw(ctx, canvas.width / 2, pack.origin.y * scale);
        
        endAnimationFrameId = requestAnimationFrame(step);
    };
    endAnimationFrameId = requestAnimationFrame(step);
    return true;
}

function stopEndAnimation() {
    if (endAnimationFrameId) {
        cancelAnimationFrame(endAnimationFrameId);
        endAnimationFrameId = null;
    }
}

function showWinScreen() {
    cancelAnimationFrame(animationFrameId);
    showScreen('win-screen');
    
    // The manager, insufferably pleased with himself
    const winAnimation = document.getElementById('win-animation');
    winAnimation.innerHTML = '';
    if (!playEndAnimation(winAnimation, SPRITE_ROLE.CELEBRATE)) {
        winAnimation.textContent = '\u{1F389}';
    }
    
    const winStats = document.getElementById('win-stats');
    winStats.innerHTML = `
        <div class="stat-row"><span>Final Revenue:</span><span>${Math.floor(game.revenue)} pesos</span></div>
        <div class="stat-row"><span>Target:</span><span>${CONFIG.game.revenueTarget} pesos</span></div>
        <div class="stat-row"><span>Total Calls Made:</span><span>${game.stats.totalCalls}</span></div>
        <div class="stat-row"><span>Breaks Taken:</span><span>${game.stats.totalBreaks}</span></div>
        <div class="stat-row"><span>Coffee Dumps:</span><span>${game.stats.coffeesDumped}</span></div>
        <div class="stat-row"><span>Bathroom Closures:</span><span>${game.stats.bathroomsClosed}</span></div>
        <div class="stat-row"><span>Employees Sent Back:</span><span>${game.stats.employeesSentBack}</span></div>
    `;
}

function showLoseScreen() {
    cancelAnimationFrame(animationFrameId);
    showScreen('lose-screen');
    
    document.getElementById('lose-reason').textContent = game.gameOverReason;
    
    // Show the manager going down - taken out by an employee, or just beaten
    // by the numbers
    const loseAnimation = document.getElementById('lose-animation');
    loseAnimation.innerHTML = '';
    loseAnimation.classList.remove('with-sprite');
    
    const role = game.insaneEmployee ? SPRITE_ROLE.DEAD : SPRITE_ROLE.FALL;
    if (playEndAnimation(loseAnimation, role)) {
        loseAnimation.classList.add('with-sprite');
        if (game.insaneEmployee) {
            const caption = document.createElement('div');
            caption.textContent = `Taken out by ${game.insaneEmployee.name}`;
            loseAnimation.appendChild(caption);
        }
    } else if (game.insaneEmployee) {
        loseAnimation.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 6rem; animation: shake 0.3s infinite;">😱</div>
                <div style="margin-top: 1rem; font-size: 1.5rem;">${game.insaneEmployee.name}</div>
            </div>
        `;
    } else {
        loseAnimation.innerHTML = '💸';
    }
    
    const loseStats = document.getElementById('lose-stats');
    loseStats.innerHTML = `
        <div class="stat-row"><span>Final Revenue:</span><span>${Math.floor(game.revenue)} pesos</span></div>
        <div class="stat-row"><span>Target:</span><span>${CONFIG.game.revenueTarget} pesos</span></div>
        <div class="stat-row"><span>Total Calls Made:</span><span>${game.stats.totalCalls}</span></div>
        <div class="stat-row"><span>Breaks Taken:</span><span>${game.stats.totalBreaks}</span></div>
    `;
}

// ============================================
// INPUT HANDLING
// ============================================
document.addEventListener('keydown', (e) => {
    if (!game || game.state !== GAME_STATE.PLAYING) return;
    
    // Resume audio context on first key press
    if (typeof soundManager !== 'undefined') {
        soundManager.resume();
    }
    
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            game.manager.moveUp = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.manager.moveDown = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.manager.moveLeft = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.manager.moveRight = true;
            break;
        case 'KeyC':
            game.dumpCoffee();
            break;
        case 'KeyB':
            game.closeBathroom();
            break;
        case 'Space':
            e.preventDefault();
            game.sendEmployeeBack();
            break;
    }
});

document.addEventListener('keyup', (e) => {
    if (!game || game.state !== GAME_STATE.PLAYING) return;
    
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            game.manager.moveUp = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.manager.moveDown = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.manager.moveLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.manager.moveRight = false;
            break;
    }
});

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('load', () => {
    // Set initial config values in menu
    configEmployees.value = CONFIG.game.numberOfEmployees;
    configDuration.value = CONFIG.game.gameDurationMinutes;
    configTarget.value = CONFIG.game.revenueTarget;
    configSpeed.value = CONFIG.game.speedMultiplier;
    configSpeed.min = CONFIG.game.minSpeedMultiplier;
    configSpeed.max = CONFIG.game.maxSpeedMultiplier;
    
    // Show main menu
    showScreen('main-menu');
});
