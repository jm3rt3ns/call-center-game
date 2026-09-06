/**
 * Call Center Chaos - Main Entry Point
 * Handles initialization, input, UI updates, and game loop
 */

// ============================================
// GLOBAL REFERENCES
// ============================================
let game = null;
let animationFrameId = null;
let touchControls = null;

// Below this the side panel has nowhere to live, so the HUD, the employee
// cards and the controls switch to the phone layout
const COMPACT_LAYOUT_MAX_WIDTH = 900;
const COMPACT_LAYOUT_MAX_HEIGHT = 520;

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
const panelCount = document.getElementById('panel-count');

// Touch furniture
const joystick = document.getElementById('joystick');
const actionCoffee = document.getElementById('action-coffee');
const actionBathroom = document.getElementById('action-bathroom');

// Level line on the main menu
const activeLevelName = document.getElementById('active-level-name');
const useBuiltInLevel = document.getElementById('use-built-in-level');

// ============================================
// LAYOUT
// ============================================

/**
 * A phone, a narrow window, or a laptop in landscape with no vertical room -
 * anything that cannot spare 250px down the side for the employee panel.
 */
function isCompactLayout() {
    return window.innerWidth <= COMPACT_LAYOUT_MAX_WIDTH ||
           window.innerHeight <= COMPACT_LAYOUT_MAX_HEIGHT;
}

function applyLayoutClasses() {
    document.body.classList.toggle('compact-layout', isCompactLayout());
    document.body.classList.toggle('touch-input', isTouchDevice());
}

/**
 * How big the canvas may be. On a wide screen the panel and the HUD keep their
 * own space beside and above it, exactly as before. On a phone the office runs
 * edge to edge and the HUD, the deck and the buttons float over it - there is
 * not enough screen to give any of them a lane of their own.
 */
function computeCanvasSize() {
    applyLayoutClasses();
    
    // visualViewport is the part actually on screen once the browser chrome
    // and the keyboard have taken their cut
    const viewport = window.visualViewport;
    const width = Math.round(viewport ? viewport.width : window.innerWidth);
    const height = Math.round(viewport ? viewport.height : window.innerHeight);
    
    if (isCompactLayout()) {
        return { width: Math.max(240, width), height: Math.max(240, height) };
    }
    return {
        width: Math.max(320, width - 250),
        height: Math.max(240, height - 90),
    };
}

let resizeFrame = null;

/**
 * Rotating a phone, a browser hiding its address bar, or a window being dragged
 * about all land here. Coalesced into one frame so a drag-resize does not refit
 * the office on every pixel.
 */
function handleViewportChange() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        const size = computeCanvasSize();
        CONFIG.office.canvasWidth = size.width;
        CONFIG.office.canvasHeight = size.height;
        if (game) game.resize(size.width, size.height);
        refreshEmployeeDeck(true);
    });
}

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', handleViewportChange);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
}

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
        // A silent fallback reads as "the sprites are missing from the build",
        // so say so on screen when a pack does not come up.
        document.getElementById('sprite-warning')
            .classList.toggle('hidden', spriteLibrary.errors.length === 0);
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
    
    // Fit the office to whatever screen this is
    const size = computeCanvasSize();
    CONFIG.office.canvasWidth = size.width;
    CONFIG.office.canvasHeight = size.height;
    
    // Initialize the 2D pixel-art game
    game = new Game(canvas);
    game.init();
    
    // Show game screen
    showScreen('game-screen');
    
    // Gestures need the canvas laid out at its final size before they can
    // convert a touch into a point in the office
    if (!touchControls) {
        touchControls = new TouchControls(canvas, joystick, { getGame: () => game });
    }
    touchControls.reset();
    
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
    // A phone's HUD has no room for the full sentence, and a countdown that
    // gets cut off by an ellipsis is worse than no countdown at all
    const terse = document.body.classList.contains('compact-layout');
    
    if (game.coffeeDumped) {
        const left = `${Math.ceil(game.coffeeDumpTimer)}s`;
        coffeeStatus.textContent = terse ? `☕ ${left}` : `☕ Coffee: DUMPED (${left})`;
        coffeeStatus.style.background = 'rgba(239, 68, 68, 0.5)';
    } else {
        coffeeStatus.textContent = terse ? '☕ Coffee OK' : '☕ Coffee: Available';
        coffeeStatus.style.background = 'rgba(139, 69, 19, 0.5)';
    }
    
    if (game.bathroomClosed) {
        const left = `${Math.ceil(game.bathroomCloseTimer)}s`;
        bathroomStatus.textContent = terse ? `🚻 ${left}` : `🚻 Bathroom: CLOSED (${left})`;
        bathroomStatus.style.background = 'rgba(239, 68, 68, 0.5)';
    } else {
        bathroomStatus.textContent = terse ? '🚻 Open' : '🚻 Bathroom: Open';
        bathroomStatus.style.background = 'rgba(59, 130, 246, 0.5)';
    }
    
    updateActionButtons();
    
    // Update employee cards
    updateEmployeeCards();
}

/**
 * The two abilities live on the C and B keys, which a phone does not have.
 * The buttons carry their own cooldown so the player can see when they come
 * back without hunting through the HUD.
 */
function updateActionButtons() {
    if (actionCoffee) {
        const busy = game.coffeeDumped;
        actionCoffee.classList.toggle('busy', busy);
        actionCoffee.querySelector('.touch-label').textContent =
            busy ? `${Math.ceil(game.coffeeDumpTimer)}s` : 'Dump';
    }
    if (actionBathroom) {
        const busy = game.bathroomClosed;
        actionBathroom.classList.toggle('busy', busy);
        actionBathroom.querySelector('.touch-label').textContent =
            busy ? `${Math.ceil(game.bathroomCloseTimer)}s` : 'Close';
    }
}

/** Fire an ability from its on-screen button rather than its key. */
function bindActionButton(button, run) {
    if (!button) return;
    // pointerdown, not click: an ability should land the moment the thumb does,
    // and the canvas under it must not also read the press as a tap
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!game || game.state !== GAME_STATE.PLAYING) return;
        if (typeof soundManager !== 'undefined') soundManager.resume();
        run();
    });
}

bindActionButton(actionCoffee, () => game.dumpCoffee());
bindActionButton(actionBathroom, () => game.closeBathroom());

// Card elements, kept per employee so the per-frame update is a handful of
// property writes rather than a DOM query storm
let employeeCards = [];

// Which employees the deck is currently showing, so it only reshuffles when
// the cast actually changes
let deckMembers = '';
let deckCheckedAt = 0;

function createEmployeeCards() {
    employeeList.innerHTML = '';
    employeeCards = [];
    deckMembers = '';
    deckCheckedAt = 0;
    
    game.employees.forEach((emp, index) => {
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.id = `emp-card-${index}`;
        card.innerHTML = `
            <div class="name">${emp.name}</div>
            <div class="stat-label">
                <span>Sanity</span>
                <span class="emp-sanity">50%</span>
            </div>
            <div class="stat-bar">
                <div class="stat-fill sanity-fill emp-sanity-bar" style="width: 50%"></div>
            </div>
            <div class="stat-label">
                <span>Productivity</span>
                <span class="emp-prod">50%</span>
            </div>
            <div class="stat-bar">
                <div class="stat-fill productivity-fill emp-prod-bar" style="width: 50%"></div>
            </div>
            <div class="status emp-status">Working</div>
        `;
        employeeList.appendChild(card);
        
        employeeCards.push({
            card,
            sanityText: card.querySelector('.emp-sanity'),
            sanityBar: card.querySelector('.emp-sanity-bar'),
            prodText: card.querySelector('.emp-prod'),
            prodBar: card.querySelector('.emp-prod-bar'),
            status: card.querySelector('.emp-status'),
            border: '',
        });
    });
    
    refreshEmployeeDeck(true);
}

function statusTextFor(employee) {
    switch (employee.state) {
        case EMPLOYEE_STATE.WORKING: return '📞 Working';
        case EMPLOYEE_STATE.FEARFUL: return '😰 Fearful';
        case EMPLOYEE_STATE.FORCED_WORKING: return '😓 Forced Work';
        case EMPLOYEE_STATE.WALKING_TO_COFFEE: return '🚶 → Coffee';
        case EMPLOYEE_STATE.WALKING_TO_BATHROOM: return '🚶 → Bathroom';
        case EMPLOYEE_STATE.ON_COFFEE_BREAK: return '☕ Coffee Break';
        case EMPLOYEE_STATE.ON_BATHROOM_BREAK: return '🚻 Bathroom Break';
        case EMPLOYEE_STATE.WALKING_BACK: return '🚶 Returning';
        default: return 'Working';
    }
}

function updateEmployeeCards() {
    game.employees.forEach((emp, index) => {
        const refs = employeeCards[index];
        if (!refs) return;
        
        const sanity = Math.floor(emp.sanity);
        const prod = Math.floor(emp.productivity);
        
        refs.sanityText.textContent = `${sanity}%`;
        refs.sanityBar.style.width = `${sanity}%`;
        refs.prodText.textContent = `${prod}%`;
        refs.prodBar.style.width = `${prod}%`;
        refs.status.textContent = statusTextFor(emp);
        
        // Highlight card based on sanity
        let border = 'none';
        if (sanity >= CONFIG.employee.sanityCriticalThreshold) {
            border = '3px solid #ef4444';
        } else if (sanity >= CONFIG.employee.sanityWarningThreshold) {
            border = '3px solid #fbbf24';
        }
        if (border !== refs.border) {
            refs.card.style.borderLeft = border;
            refs.border = border;
        }
    });
    
    refreshEmployeeDeck();
}

/**
 * How much attention each employee deserves right now. Anyone about to snap
 * comes first however far away they are; after that it is whoever the manager
 * is closest to, since those are the people a tap can actually reach.
 */
function deckPriority(employee) {
    const manager = game.manager;
    const dx = manager.x - employee.x;
    const dy = manager.y - employee.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const critical = employee.sanity >= CONFIG.employee.sanityCriticalThreshold;
    
    // Distance beats everything else, with a big head start for the desperate
    return distance - (critical ? 100000 : 0);
}

/**
 * On a wide screen every employee has a card and the panel is a list. On a
 * phone there is no column to put them in, so the panel becomes a deck: only
 * the nearest couple of people are dealt face up, and the rest of the floor
 * reads its stats off the plates over their heads instead.
 *
 * @param {boolean} [force] rebuild even if the cast has not changed
 */
function refreshEmployeeDeck(force = false) {
    if (!game || !employeeCards.length) return;
    
    const compact = document.body.classList.contains('compact-layout');
    
    if (!compact) {
        if (force || deckMembers !== 'all') {
            employeeCards.forEach(refs => {
                refs.card.classList.remove('hidden');
                refs.card.style.order = '';
            });
            if (panelCount) panelCount.textContent = '';
            deckMembers = 'all';
        }
        return;
    }
    
    // Re-dealing the deck every frame would make it flicker as two employees
    // trade places, so settle it a few times a second
    const now = performance.now();
    if (!force && now - deckCheckedAt < 250) return;
    deckCheckedAt = now;
    
    // A landscape phone has room for one card and no more
    const configured = Math.max(1, (CONFIG.ui && CONFIG.ui.deckCardCount) || 2);
    const count = window.innerHeight <= 430 ? 1 : configured;
    const ranked = game.employees
        .map((employee, index) => ({ index, priority: deckPriority(employee) }))
        .sort((a, b) => a.priority - b.priority)
        .slice(0, count);
    
    const key = ranked.map(entry => entry.index).join(',');
    if (!force && key === deckMembers) return;
    deckMembers = key;
    
    const shown = new Set(ranked.map(entry => entry.index));
    employeeCards.forEach((refs, index) => {
        refs.card.classList.toggle('hidden', !shown.has(index));
        refs.card.style.order = '';
    });
    ranked.forEach((entry, rank) => {
        employeeCards[entry.index].card.style.order = String(rank);
    });
    
    if (panelCount) {
        panelCount.textContent = `nearest ${shown.size} of ${game.employees.length}`;
    }
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
    if (touchControls) touchControls.reset();
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
    if (touchControls) touchControls.reset();
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
    
    // Pick the layout the screen can actually hold before anything is drawn
    applyLayoutClasses();
    
    // Show main menu
    showScreen('main-menu');
});
