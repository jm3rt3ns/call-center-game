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
        workdayEndHour: 16,         // 4:00 PM (8 hours total)
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
        
        // Isometric settings
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
        
        // Room positions (will be calculated based on layout)
        // These are approximate centers for navigation
        rooms: {
            workspace: { x: 450, y: 350 },
            breakRoom: { x: 150, y: 100 },
            bathroom: { x: 440, y: 100 },
        }
    },

    // ============================================
    // UI SETTINGS
    // ============================================
    ui: {
        updateInterval: 100,        // UI update frequency in ms
        animationSpeed: 1,          // Animation multiplier
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
