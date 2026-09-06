/**
 * Call Center Chaos - Game Configuration
 * Data-driven configuration for all game variables
 */

const CONFIG = {
    // ============================================
    // GAME SETTINGS (Configurable via Main Menu)
    // ============================================
    game: {
        numberOfEmployees: 10,      // Number of call center employees
        gameDurationMinutes: 5,     // Real-time duration of one workday
        revenueTarget: 2000,        // Pesos needed to win
        workdayStartHour: 8,        // 8:00 AM
        workdayEndHour: 17,         // 5:00 PM (9 hours total)

        // Global simulation speed. Everything driven by delta time - the
        // workday clock, employees, the manager, breaks, animations - runs at
        // this multiple of real time. 1.0 = original pace, 2.0 = double speed.
        speedMultiplier: 1.2,
        minSpeedMultiplier: 0.25,   // Clamp bounds, so a bad value can't stall
        maxSpeedMultiplier: 4,      // or fast-forward the sim into nonsense
    },

    // ============================================
    // EMPLOYEE SETTINGS
    // ============================================
    employee: {
        // Starting stats
        initialSanity: 50,          // Starting sanity (0-100)
        initialProductivity: 50,    // Starting productivity (0-100)
        
        // Sanity thresholds
        maxSanity: 100,             // Game over if any employee reaches this
        minSanity: 0,
        sanityWarningThreshold: 75, // Yellow warning indicator
        sanityCriticalThreshold: 90, // Red warning indicator
        
        // Productivity settings
        maxProductivity: 100,
        minProductivity: 10,
        
        // Break timing (in game seconds)
        coffeeBreakDuration: 30,    // 30 seconds real time
        bathroomBreakDuration: 30,  // 30 seconds real time
        
        // Break need rates (base intervals in game seconds)
        baseCoffeeNeedInterval: 120,    // Base time between needing coffee
        baseBathroomNeedInterval: 180,  // Base time between needing bathroom
        
        // How productivity affects break needs (higher productivity = more frequent needs)
        productivityBreakMultiplier: 0.5,  // Multiply interval by (1 - productivity/100 * this)
        
        // Action effects
        callRevenueMIN: 5,          // Min pesos per call
        callRevenueMax: 15,         // Max pesos per call
        callDuration: 5,            // Seconds per call
        
        // Break effects on stats
        breakSanityRecovery: 15,    // Sanity recovered per break
        breakProductivityLoss: 5,   // Productivity lost per break
        
        // Passive decay while working at desk
        passiveSanityIncrease: 0.3,     // Sanity ticks up per second while at desk
        passiveProductivityDecay: 0.15, // Productivity decays per second while at desk
        
        // Break timing randomization
        breakTimingRandomMin: 0.5,   // Minimum multiplier for break timing
        breakTimingRandomMax: 1.8,   // Maximum multiplier for break timing
        
        // Manager proximity effects
        managerProximityRadius: 80, // Pixels - manager's "fear aura"
        managerSanityIncrease: 0.5, // Sanity increase per second when manager nearby
        managerProductivityBoost: 0.3, // Productivity boost per second
        
        // Forced return to desk effects
        forcedReturnDuration: 60,   // Seconds employee must work after being sent back
        forcedReturnSanityIncrease: 10,
        forcedReturnProductivityBoost: 10,
        
        // Movement
        moveSpeed: 60,              // Pixels per second
        
        // Visual
        size: 24,                   // Size of employee square
        colors: {
            working: '#4ade80',     // Green - making calls
            needsCoffee: '#fbbf24', // Yellow - wants coffee
            needsBathroom: '#60a5fa', // Blue - needs bathroom
            onBreak: '#a78bfa',     // Purple - on break
            critical: '#ef4444',    // Red - high insanity
            fearful: '#fb923c',     // Orange - manager nearby
        }
    },

    // ============================================
    // MANAGER SETTINGS
    // ============================================
    manager: {
        moveSpeed: 120,             // Pixels per second (faster than employees)
        size: 28,                   // Slightly larger than employees
        color: '#ef4444',           // Red color for manager
        
        // Abilities
        coffeeDumpDuration: 60,     // Seconds coffee is unavailable
        bathroomCloseDuration: 60,  // Seconds bathroom is closed
        
        // Ability effects on employees
        coffeeDumpSanityIncrease: 5,    // Per affected employee
        coffeeDumpProductivityBoost: 10,
        bathroomCloseSanityIncrease: 8,
        bathroomCloseProductivityBoost: 12,
    },

    // ============================================
    // OFFICE LAYOUT
    // ============================================
    office: {
        // Canvas size
        canvasWidth: 1100,
        canvasHeight: 650,
        
        // Grid settings for pathfinding
        gridSize: 20,               // Size of each grid cell
        
        // Isometric settings. The office shrinks these to fit a large level
        // on screen, so they are the biggest a tile is ever drawn.
        isometric: true,            // Enable isometric view
        tileWidth: 40,              // Width of isometric tile
        tileHeight: 20,             // Height of isometric tile
        
        // Colors for office elements
        colors: {
            floor: '#3d3d5c',
            wall: '#1a1a2e',
            desk: '#8b5a2b',
            breakRoom: '#2d5a4a',
            bathroom: '#2a4a6a',
            path: '#4a4a6a',
            coffeeStation: '#6b4423',
            bathroomStall: '#1a3a5a',
        },
        
        // The floor plan itself - walls, desks, rooms and where the props sit -
        // is a level, not a setting. See levels.js and editor.html.
    },

    // ============================================
    // CAMERA
    // ============================================
    camera: {
        // How much closer than the old full-office view. 1 = the original
        // framing, 1.75 sits between a comfortable 1.5x and a tight 2x.
        // Only used when autoZoom is off - otherwise it is the ceiling the
        // automatic zoom works back from.
        zoom: 1.75,

        // A phone fits the whole floor plan into a few hundred pixels, which
        // leaves tiles the size of a fingernail. Rather than pick a zoom per
        // device, aim for a tile that is always a readable size on screen and
        // let the zoom fall out of it: the office already scaled itself to fit
        // the canvas, so this scales it back up to something you can see.
        autoZoom: true,
        tileTarget: {
            // Wanted on-screen tile width, as a fraction of the smaller side
            // of the view, clamped to these pixel bounds.
            fraction: 0.115,
            min: 40,
            max: 70,
        },
        minZoom: 1,
        maxZoom: 6,

        // How far a pinch is allowed to push the automatic zoom either way
        minUserZoom: 0.6,
        maxUserZoom: 2.2,
        
        // How hard the camera pulls toward the boss, per second. Higher is
        // snappier, lower drifts along behind him.
        smoothing: 4.5,
        
        // Screen pixels he can wander from the centre before the camera
        // bothers to move - keeps small shuffles from sliding the office.
        deadzoneX: 70,
        deadzoneY: 42,
        
        // Seconds of his movement to lead by, so the view opens up ahead of
        // him rather than behind
        lookAheadSeconds: 0.35,
        
        // Screen pixels to lift the focus off his feet, framing his body
        focusOffsetY: -48,
    },

    // ============================================
    // INPUT
    // ============================================
    input: {
        // Drag anywhere on the floor to steer. The stick appears where the
        // finger lands and the manager runs in the direction it is pushed.
        joystickRadius: 56,         // CSS px from the stick's centre to full tilt
        joystickDeadzone: 0.18,     // Fraction of the radius that reads as "no input"

        // A press that neither travels far nor lasts long is a tap, not a drag
        tapMaxTravel: 14,           // CSS px
        tapMaxDurationMs: 300,

        // How close a tap has to land to an employee to pick them, in CSS px.
        // Fingers are blunt, so this is deliberately larger than the sprite.
        tapRadius: 44,

        // How far the manager's voice carries when you tap someone back to
        // their desk, in world pixels. Matches his fear aura, so the rule is
        // the same one the game already draws on the floor.
        tapSendBackRadius: 80,
    },

    // ============================================
    // SPRITE PACKS
    // ============================================
    sprites: {
        enabled: true,              // false = always use the procedural pixel drawing
        basePath: 'assets/sprites/', // where packs.json lives
        
        // Which pack each actor type draws from (pack ids come from packs.json).
        // null falls back to the procedural pixel art in entities.js.
        actors: {
            manager: 'bad_office_manager',
            employee: null,
        },
        
        // On-screen size multiplier per actor, applied to the pack's frame size
        scale: {
            manager: 1.1,
            employee: 1.0,
        },
        
        // The manager steps off at a walk and breaks into a run once he has
        // been moving this long (ms). Movement speed itself is unchanged.
        walkToRunMs: 260,
        
        // ...and drops back to a walk whenever something (a wall, a desk)
        // holds him below this fraction of his full speed
        runThreshold: 0.6,
        
        // How long one-shot reaction animations hold before returning to idle (ms)
        reactionHoldMs: 250,
    },

    // ============================================
    // UI SETTINGS
    // ============================================
    ui: {
        updateInterval: 100,        // UI update frequency in ms
        animationSpeed: 1,          // Animation multiplier

        // There is no room for a column of employee cards on a phone, so the
        // panel becomes a deck holding only the people who matter right now -
        // the ones nearest the manager, with anyone critical pulled forward.
        deckCardCount: 2,

        // Everyone the manager is standing near, and everyone about to snap,
        // carries their name and bars over their head instead.
        overheadLabelRadius: 140,   // World pixels from the manager
        overheadAlwaysCritical: true,
    },

    // ============================================
    // SIMULATION SETTINGS
    // ============================================
    simulation: {
        tickRate: 60,               // Game updates per second
        randomSeed: null,           // Set for reproducible games (null = random)
    }
};

// Employee names pool for variety
const EMPLOYEE_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Casey",
    "Riley", "Quinn", "Avery", "Cameron", "Drew",
    "Jamie", "Peyton", "Reese", "Skyler", "Blake",
    "Charlie", "Frankie", "Hayden", "Jesse", "Kelly"
];

// Employee states
const EMPLOYEE_STATE = {
    WORKING: 'working',
    WALKING_TO_COFFEE: 'walkingToCoffee',
    WALKING_TO_BATHROOM: 'walkingToBathroom',
    ON_COFFEE_BREAK: 'onCoffeeBreak',
    ON_BATHROOM_BREAK: 'onBathroomBreak',
    WALKING_BACK: 'walkingBack',
    FORCED_WORKING: 'forcedWorking',  // Sent back by manager
    FEARFUL: 'fearful',               // Manager nearby
};

// Game states
const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    WIN: 'win',
    LOSE: 'lose',
};

// The active simulation speed, clamped to the configured bounds so a stray
// value from the menu (or a console tweak) can't break the game loop
function getSpeedMultiplier() {
    const speed = Number(CONFIG.game.speedMultiplier);
    if (!isFinite(speed) || speed <= 0) return 1;
    return Math.min(CONFIG.game.maxSpeedMultiplier,
                    Math.max(CONFIG.game.minSpeedMultiplier, speed));
}

// Utility function to get config value
function getConfig(path) {
    const keys = path.split('.');
    let value = CONFIG;
    for (const key of keys) {
        value = value[key];
        if (value === undefined) return undefined;
    }
    return value;
}

// Utility function to update config value
function setConfig(path, newValue) {
    const keys = path.split('.');
    let obj = CONFIG;
    for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = newValue;
}
