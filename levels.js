/**
 * Call Center Chaos - Levels
 *
 * A level is a flat block of text: one character per grid cell, one line per
 * row. Edit the maps below in any text editor, or paint one in `editor.html`
 * and paste the result back here.
 *
 * Legend (see LEVEL_TILES):
 *   #  wall            .  floor            D  desk
 *   b  break room      t  bathroom
 *   C  coffee station  W  bathroom stall   M  manager spawn
 */

// Every paintable tile. `cell` is the numeric value the pathfinding grid uses:
// 0 floor, 1 wall, 2 desk, 3 break room, 4 bathroom.
const LEVEL_TILES = {
    '.': { id: 'floor',      name: 'Floor',          cell: 0, color: '#3d3d5c' },
    '#': { id: 'wall',       name: 'Wall',           cell: 1, color: '#1a1a2e' },
    'D': { id: 'desk',       name: 'Desk',           cell: 2, color: '#8b5a2b' },
    'b': { id: 'breakRoom',  name: 'Break room',     cell: 3, color: '#2d5a4a' },
    't': { id: 'bathroom',   name: 'Bathroom',       cell: 4, color: '#2a4a6a' },
    'C': { id: 'coffee',     name: 'Coffee station', cell: 3, color: '#a9713a', unique: true },
    'W': { id: 'toilet',     name: 'Bathroom stall', cell: 4, color: '#7aa8d8', unique: true },
    'M': { id: 'spawn',      name: 'Manager spawn',  cell: 0, color: '#ef4444', unique: true },
};

const LEVEL_FLOOR_CHAR = '.';

// Built-in levels. Add another entry and it shows up in the editor's list.
const LEVELS = [
    {
        id: 'call-floor',
        name: 'The Call Floor',
        map: [
            '########################################',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbCbbbbbbbbbbbb#ttttttttttWttttttttt#',
            '#bbbbbbbbbbbbbbbbb.tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#',
            '########..##################..##########',
            '#......................................#',
            '#...................M..................#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '#......................................#',
            '#......................................#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '#......................................#',
            '#......................................#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '#...DD.....DD.....DD.....DD.....DD.....#',
            '########################################',
        ].join('\n'),
    },
    {
        id: 'open-plan',
        name: 'Open Plan',
        map: [
            '##############################',
            '#bbbbbbbbb#ttttttttt#........#',
            '#bbbbbbbbb#ttttttttt#..DD.DD.#',
            '#bbbbCbbbbbttttWttttt..DD.DD.#',
            '#bbbbbbbbb#ttttttttt#........#',
            '#bbbbbbbbb#ttttttttt#........#',
            '#####.#########.########.#####',
            '#............................#',
            '#.........................M..#',
            '#..DD....DD....DD....DD......#',
            '#..DD....DD....DD....DD......#',
            '#............................#',
            '#............................#',
            '#..DD....DD....DD....DD......#',
            '#..DD....DD....DD....DD......#',
            '##############################',
        ].join('\n'),
    },
];

const DEFAULT_LEVEL_ID = 'call-floor';
const CUSTOM_LEVEL_STORAGE_KEY = 'callCenterChaos.customLevel';

/**
 * Reading, writing and validating the flat map text. Shared by the game and
 * the level editor so both agree on what a level means.
 */
const LevelFormat = {
    tileFor(char) {
        return LEVEL_TILES[char] || null;
    },

    /**
     * Turn map text into a rectangular array of rows of characters. Ragged
     * lines are padded with floor, unknown characters become floor, and every
     * substitution is reported in `warnings`.
     */
    parse(text) {
        const warnings = [];
        const lines = String(text == null ? '' : text)
            .replace(/\r/g, '')
            .split('\n')
            .filter((line, i, all) => line.trim() !== '' || (i > 0 && i < all.length - 1));

        while (lines.length && lines[0].trim() === '') lines.shift();
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

        if (lines.length === 0) {
            warnings.push('The map is empty.');
            return { cols: 0, rows: 0, cells: [], warnings };
        }

        const cols = lines.reduce((widest, line) => Math.max(widest, line.length), 0);
        const unknown = new Set();
        const cells = lines.map(line => {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const char = line[x] || LEVEL_FLOOR_CHAR;
                if (LEVEL_TILES[char]) {
                    row.push(char);
                } else {
                    if (char.trim() !== '') unknown.add(char);
                    row.push(LEVEL_FLOOR_CHAR);
                }
            }
            return row;
        });

        if (unknown.size) {
            warnings.push(`Unknown tile character(s) treated as floor: ${[...unknown].join(' ')}`);
        }
        if (lines.some(line => line.length !== cols)) {
            warnings.push(`Rows were not all ${cols} wide - the short ones were padded with floor.`);
        }

        return { cols, rows: cells.length, cells, warnings };
    },

    stringify(cells) {
        return cells.map(row => row.join('')).join('\n');
    },

    blank(cols, rows) {
        const cells = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
                row.push(edge ? '#' : LEVEL_FLOOR_CHAR);
            }
            cells.push(row);
        }
        return cells;
    },

    /**
     * Everything the game needs that is not just a tile: where the props are,
     * where the manager starts, and one entry per desk (contiguous runs of
     * `D` count as a single desk, so a 2x2 block seats one employee).
     */
    describe(parsed) {
        const problems = [];
        const found = {};
        for (let y = 0; y < parsed.rows; y++) {
            for (let x = 0; x < parsed.cols; x++) {
                const char = parsed.cells[y][x];
                const tile = LEVEL_TILES[char];
                if (tile && tile.unique) found[tile.id] = { x, y };
            }
        }

        const desks = this.findDesks(parsed);
        if (!found.coffee) problems.push('No coffee station (C) - employees will have nowhere to take a coffee break.');
        if (!found.toilet) problems.push('No bathroom stall (W) - employees will have nowhere to take a bathroom break.');
        if (!desks.length) problems.push('No desks (D) - nobody has anywhere to work.');

        return { desks, coffee: found.coffee || null, toilet: found.toilet || null, spawn: found.spawn || null, problems };
    },

    /** Flood-fill the desk tiles so each connected clump becomes one desk. */
    findDesks(parsed) {
        const seen = [];
        for (let y = 0; y < parsed.rows; y++) seen.push(new Array(parsed.cols).fill(false));

        const desks = [];
        for (let y = 0; y < parsed.rows; y++) {
            for (let x = 0; x < parsed.cols; x++) {
                if (seen[y][x] || parsed.cells[y][x] !== 'D') continue;

                const clump = [];
                const queue = [{ x, y }];
                seen[y][x] = true;
                while (queue.length) {
                    const at = queue.pop();
                    clump.push(at);
                    const neighbours = [
                        { x: at.x - 1, y: at.y }, { x: at.x + 1, y: at.y },
                        { x: at.x, y: at.y - 1 }, { x: at.x, y: at.y + 1 },
                    ];
                    for (const next of neighbours) {
                        if (next.x < 0 || next.y < 0 || next.x >= parsed.cols || next.y >= parsed.rows) continue;
                        if (seen[next.y][next.x] || parsed.cells[next.y][next.x] !== 'D') continue;
                        seen[next.y][next.x] = true;
                        queue.push(next);
                    }
                }

                // Sort so desks are numbered top-left to bottom-right, and seat
                // the employee at the clump's centre.
                const sumX = clump.reduce((total, c) => total + c.x, 0);
                const sumY = clump.reduce((total, c) => total + c.y, 0);
                desks.push({
                    gridX: sumX / clump.length,
                    gridY: sumY / clump.length,
                    tiles: clump,
                    top: Math.min(...clump.map(c => c.y)),
                    left: Math.min(...clump.map(c => c.x)),
                });
            }
        }

        desks.sort((a, b) => (a.top - b.top) || (a.left - b.left));
        return desks;
    },
};

/** The level the game should load: the editor's playtest map, else a built-in. */
function getActiveLevel() {
    try {
        const stored = window.localStorage.getItem(CUSTOM_LEVEL_STORAGE_KEY);
        if (stored && stored.trim()) {
            return { id: 'custom', name: 'Custom (from the level editor)', map: stored };
        }
    } catch (err) {
        // Private browsing or a file:// origin - fall through to the built-in.
    }
    return getLevelById(DEFAULT_LEVEL_ID);
}

function getLevelById(id) {
    return LEVELS.find(level => level.id === id) || LEVELS[0];
}
