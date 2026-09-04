/**
 * Call Center Chaos - Level Editor
 *
 * Paints the same flat map text the game loads (see levels.js). The plan view
 * on the left, the map text on the right and the isometric preview are three
 * views of one array of characters - editing any of them updates the others.
 */

const EDITOR_DRAFT_KEY = 'callCenterChaos.editorDraft';

// Painting a one-per-level tile somewhere else has to clear the old one, so
// each of them knows what plain tile it leaves behind.
const UNIQUE_TILE_BASE = { C: 'b', W: 't', M: '.' };

const editor = {
    cells: [],
    selected: '#',
    tool: 'brush',
    undoStack: [],
    stroke: null,
};

const els = {
    grid: document.getElementById('grid-canvas'),
    preview: document.getElementById('preview-canvas'),
    palette: document.getElementById('palette'),
    picker: document.getElementById('level-picker'),
    cols: document.getElementById('level-cols'),
    rows: document.getElementById('level-rows'),
    text: document.getElementById('map-text'),
    stats: document.getElementById('level-stats'),
    problems: document.getElementById('level-problems'),
    status: document.getElementById('status'),
};

const gridCtx = els.grid.getContext('2d');
const previewCtx = els.preview.getContext('2d');

// ============================================
// LOADING AND SAVING
// ============================================

function init() {
    buildPalette();
    buildLevelPicker();

    const draft = readStorage(EDITOR_DRAFT_KEY);
    loadText(draft || LEVELS[0].map, { recordUndo: false });

    wireCanvas();
    wireControls();
    refreshPlaytestStatus();
}

function buildLevelPicker() {
    for (const level of LEVELS) {
        const option = document.createElement('option');
        option.value = level.id;
        option.textContent = level.name;
        els.picker.appendChild(option);
    }
    els.picker.addEventListener('change', () => {
        loadText(getLevelById(els.picker.value).map);
        setStatus(`Loaded "${getLevelById(els.picker.value).name}".`);
    });
}

function buildPalette() {
    Object.entries(LEVEL_TILES).forEach(([char, tile], index) => {
        const button = document.createElement('button');
        button.className = 'swatch';
        button.dataset.char = char;
        button.innerHTML = `<span class="chip" style="background:${tile.color}"></span>` +
            `<span>${tile.name}</span><span class="char">${index + 1} &middot; ${char}</span>`;
        button.addEventListener('click', () => selectTile(char));
        els.palette.appendChild(button);
    });
    selectTile(editor.selected);
}

function selectTile(char) {
    editor.selected = char;
    for (const swatch of els.palette.children) {
        swatch.classList.toggle('selected', swatch.dataset.char === char);
    }
}

/** Replace the whole level from map text. */
function loadText(text, { recordUndo = true } = {}) {
    const parsed = LevelFormat.parse(text);
    setCells(parsed.cells, { recordUndo, syncText: true });
}

/** Replace the whole level from a character grid. */
function setCells(cells, { recordUndo = true, syncText = true } = {}) {
    if (recordUndo) pushUndo();
    editor.cells = cells;
    els.cols.value = cells[0] ? cells[0].length : 0;
    els.rows.value = cells.length;
    if (syncText) els.text.value = LevelFormat.stringify(cells);
    saveDraft();
    redraw();
}

function pushUndo() {
    editor.undoStack.push(editor.cells.map(row => row.slice()));
    if (editor.undoStack.length > 60) editor.undoStack.shift();
}

function undo() {
    const previous = editor.undoStack.pop();
    if (!previous) return setStatus('Nothing left to undo.');
    setCells(previous, { recordUndo: false });
    setStatus('Undone.');
}

function saveDraft() {
    writeStorage(EDITOR_DRAFT_KEY, LevelFormat.stringify(editor.cells));
}

function readStorage(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (err) {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (err) {
        return false;
    }
}

// ============================================
// PAINTING
// ============================================

function cellSize() {
    const cols = editor.cells[0] ? editor.cells[0].length : 1;
    const available = Math.max(240, els.grid.parentElement.clientWidth - 32);
    return Math.max(6, Math.min(32, Math.floor(available / cols)));
}

function cellAt(event) {
    const rect = els.grid.getBoundingClientRect();
    const size = cellSize();
    const x = Math.floor((event.clientX - rect.left) / size);
    const y = Math.floor((event.clientY - rect.top) / size);
    if (y < 0 || y >= editor.cells.length) return null;
    if (x < 0 || x >= editor.cells[0].length) return null;
    return { x, y };
}

function wireCanvas() {
    els.grid.addEventListener('contextmenu', event => event.preventDefault());

    els.grid.addEventListener('pointerdown', event => {
        const at = cellAt(event);
        if (!at) return;
        els.grid.setPointerCapture(event.pointerId);

        // The right button always paints plain floor - it is the eraser.
        const char = event.button === 2 ? '.' : editor.selected;
        pushUndo();
        editor.stroke = { char, from: at, to: at, tool: toolFor(char) };

        if (editor.stroke.tool === 'brush') paint(at, char);
        if (editor.stroke.tool === 'fill') fillArea(at, char);
        redraw();
    });

    els.grid.addEventListener('pointermove', event => {
        const at = cellAt(event);
        if (!at) return;
        if (!editor.stroke) return;

        editor.stroke.to = at;
        if (editor.stroke.tool === 'brush') paint(at, editor.stroke.char);
        redraw();
    });

    const finish = () => {
        if (!editor.stroke) return;
        if (editor.stroke.tool === 'rect') {
            paintRect(editor.stroke.from, editor.stroke.to, editor.stroke.char);
        }
        editor.stroke = null;
        setCells(editor.cells, { recordUndo: false });
    };

    els.grid.addEventListener('pointerup', finish);
    els.grid.addEventListener('pointercancel', finish);
}

/** One-per-level tiles ignore the area tools - a rectangle of spawns is not a thing. */
function toolFor(char) {
    return LEVEL_TILES[char] && LEVEL_TILES[char].unique ? 'brush' : editor.tool;
}

function paint(at, char) {
    if (editor.cells[at.y][at.x] === char) return;
    if (LEVEL_TILES[char] && LEVEL_TILES[char].unique) clearUnique(char);
    editor.cells[at.y][at.x] = char;
}

function clearUnique(char) {
    const base = UNIQUE_TILE_BASE[char] || '.';
    for (let y = 0; y < editor.cells.length; y++) {
        for (let x = 0; x < editor.cells[y].length; x++) {
            if (editor.cells[y][x] === char) editor.cells[y][x] = base;
        }
    }
}

function paintRect(from, to, char) {
    const x1 = Math.min(from.x, to.x), x2 = Math.max(from.x, to.x);
    const y1 = Math.min(from.y, to.y), y2 = Math.max(from.y, to.y);
    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) editor.cells[y][x] = char;
    }
}

function fillArea(at, char) {
    const target = editor.cells[at.y][at.x];
    if (target === char) return;

    const queue = [at];
    while (queue.length) {
        const cell = queue.pop();
        if (cell.y < 0 || cell.y >= editor.cells.length) continue;
        if (cell.x < 0 || cell.x >= editor.cells[0].length) continue;
        if (editor.cells[cell.y][cell.x] !== target) continue;

        editor.cells[cell.y][cell.x] = char;
        queue.push({ x: cell.x - 1, y: cell.y }, { x: cell.x + 1, y: cell.y },
                   { x: cell.x, y: cell.y - 1 }, { x: cell.x, y: cell.y + 1 });
    }
}

function resize(cols, rows) {
    const resized = [];
    for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
            const existing = editor.cells[y] && editor.cells[y][x];
            const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
            row.push(existing || (edge ? '#' : '.'));
        }
        resized.push(row);
    }
    setCells(resized);
}

// ============================================
// DRAWING
// ============================================

function redraw() {
    drawGrid();
    drawPreview();
    drawStats();
}

function drawGrid() {
    const size = cellSize();
    const cols = editor.cells[0] ? editor.cells[0].length : 0;
    const rows = editor.cells.length;

    els.grid.width = cols * size;
    els.grid.height = rows * size;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const tile = LevelFormat.tileFor(editor.cells[y][x]);
            gridCtx.fillStyle = tile ? tile.color : '#3d3d5c';
            gridCtx.fillRect(x * size, y * size, size, size);
        }
    }

    // Grid lines, faint enough to paint over
    gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    gridCtx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
        gridCtx.beginPath();
        gridCtx.moveTo(x * size + 0.5, 0);
        gridCtx.lineTo(x * size + 0.5, rows * size);
        gridCtx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y * size + 0.5);
        gridCtx.lineTo(cols * size, y * size + 0.5);
        gridCtx.stroke();
    }

    // The rectangle being dragged out
    if (editor.stroke && editor.stroke.tool === 'rect') {
        const { from, to } = editor.stroke;
        const x1 = Math.min(from.x, to.x), x2 = Math.max(from.x, to.x);
        const y1 = Math.min(from.y, to.y), y2 = Math.max(from.y, to.y);
        gridCtx.strokeStyle = '#ffffff';
        gridCtx.lineWidth = 2;
        gridCtx.strokeRect(x1 * size, y1 * size, (x2 - x1 + 1) * size, (y2 - y1 + 1) * size);
    }
}

function drawPreview() {
    const text = LevelFormat.stringify(editor.cells);
    if (!text.trim()) {
        previewCtx.fillStyle = '#1a1a2e';
        previewCtx.fillRect(0, 0, els.preview.width, els.preview.height);
        return;
    }

    // Match the backing store to the size it is displayed at, so the preview
    // is as crisp as the game.
    const shown = Math.max(360, Math.floor(els.preview.parentElement.clientWidth - 32));
    if (els.preview.width !== shown) {
        els.preview.width = shown;
        els.preview.height = Math.round(shown * 0.6);
    }

    // Office reads the canvas size off CONFIG when it fits the view.
    const previousWidth = CONFIG.office.canvasWidth;
    const previousHeight = CONFIG.office.canvasHeight;
    CONFIG.office.canvasWidth = els.preview.width;
    CONFIG.office.canvasHeight = els.preview.height;

    let office = null;
    try {
        office = new Office(text);
        office.render(previewCtx);
    } catch (err) {
        previewCtx.fillStyle = '#1a1a2e';
        previewCtx.fillRect(0, 0, els.preview.width, els.preview.height);
        previewCtx.fillStyle = '#ffb457';
        previewCtx.font = '13px monospace';
        previewCtx.textAlign = 'center';
        previewCtx.fillText('This level cannot be drawn: ' + err.message,
            els.preview.width / 2, els.preview.height / 2);
    }

    CONFIG.office.canvasWidth = previousWidth;
    CONFIG.office.canvasHeight = previousHeight;

    // The game does not draw the spawn tile, so mark it here.
    if (office && office.managerSpawn) {
        const at = office.worldToScreen(office.managerSpawn.x, office.managerSpawn.y);
        previewCtx.fillStyle = '#ef4444';
        previewCtx.beginPath();
        previewCtx.arc(at.x, at.y - 6 * office.scale, 5 * office.scale, 0, Math.PI * 2);
        previewCtx.fill();
    }

    editor.preview = office;
}

function drawStats() {
    const parsed = LevelFormat.parse(LevelFormat.stringify(editor.cells));
    const described = LevelFormat.describe(parsed);

    const stats = [
        `${parsed.cols} x ${parsed.rows} tiles`,
        `${described.desks.length} desk${described.desks.length === 1 ? '' : 's'} (one employee each)`,
        `Coffee station: ${described.coffee ? 'placed' : 'missing'}`,
        `Bathroom stall: ${described.toilet ? 'placed' : 'missing'}`,
        `Manager spawn: ${described.spawn ? 'placed' : 'first free tile'}`,
    ];
    els.stats.innerHTML = stats.map(line => `<li>${line}</li>`).join('');

    const problems = described.problems.concat(reachabilityProblems(parsed, described));
    els.problems.innerHTML = problems.map(line => `<li>${line}</li>`).join('');
}

/**
 * Walls are easy to seal a room off with by accident, so flood-fill the floor
 * from the manager's start and report anything he could never walk to.
 */
function reachabilityProblems(parsed, described) {
    const walkable = (x, y) => {
        if (x < 0 || y < 0 || x >= parsed.cols || y >= parsed.rows) return false;
        const tile = LevelFormat.tileFor(parsed.cells[y][x]);
        return tile && tile.cell !== 1 && tile.cell !== 2;
    };

    let start = described.spawn;
    if (!start) {
        outer: for (let y = 0; y < parsed.rows; y++) {
            for (let x = 0; x < parsed.cols; x++) {
                if (walkable(x, y)) { start = { x, y }; break outer; }
            }
        }
    }
    if (!start) return ['There is no walkable floor at all.'];

    const seen = new Set();
    const queue = [start];
    seen.add(`${start.x},${start.y}`);
    while (queue.length) {
        const at = queue.pop();
        for (const next of [{ x: at.x - 1, y: at.y }, { x: at.x + 1, y: at.y },
                            { x: at.x, y: at.y - 1 }, { x: at.x, y: at.y + 1 }]) {
            const key = `${next.x},${next.y}`;
            if (seen.has(key) || !walkable(next.x, next.y)) continue;
            seen.add(key);
            queue.push(next);
        }
    }

    const problems = [];
    const reachable = (cell) => cell && seen.has(`${cell.x},${cell.y}`);
    if (described.coffee && !reachable(described.coffee)) {
        problems.push('The coffee station is walled off from the manager\'s start.');
    }
    if (described.toilet && !reachable(described.toilet)) {
        problems.push('The bathroom stall is walled off from the manager\'s start.');
    }

    const strandedDesks = described.desks.filter(desk =>
        !desk.tiles.some(tile => [{ x: tile.x - 1, y: tile.y }, { x: tile.x + 1, y: tile.y },
                                  { x: tile.x, y: tile.y - 1 }, { x: tile.x, y: tile.y + 1 }]
            .some(side => seen.has(`${side.x},${side.y}`))));
    if (strandedDesks.length) {
        problems.push(`${strandedDesks.length} desk(s) cannot be reached on foot.`);
    }

    return problems;
}

// ============================================
// CONTROLS
// ============================================

function wireControls() {
    for (const radio of document.querySelectorAll('input[name="tool"]')) {
        radio.addEventListener('change', () => { editor.tool = radio.value; });
    }

    document.getElementById('resize-level').addEventListener('click', () => {
        const cols = clampSize(els.cols.value);
        const rows = clampSize(els.rows.value);
        resize(cols, rows);
        setStatus(`Resized to ${cols} x ${rows}.`);
    });

    document.getElementById('blank-level').addEventListener('click', () => {
        const cols = clampSize(els.cols.value);
        const rows = clampSize(els.rows.value);
        setCells(LevelFormat.blank(cols, rows));
        setStatus('Started a blank level - walls around a bare floor.');
    });

    els.text.addEventListener('input', () => {
        const parsed = LevelFormat.parse(els.text.value);
        setCells(parsed.cells, { recordUndo: true, syncText: false });
        setStatus(parsed.warnings.join(' ') || 'Map text applied.');
    });

    document.getElementById('copy-text').addEventListener('click', async () => {
        const text = LevelFormat.stringify(editor.cells);
        try {
            await navigator.clipboard.writeText(text);
            setStatus('Map text copied - paste it into a map block in levels.js.');
        } catch (err) {
            els.text.select();
            setStatus('Could not reach the clipboard; the text is selected, press Ctrl+C.');
        }
    });

    document.getElementById('download-text').addEventListener('click', () => {
        const blob = new Blob([LevelFormat.stringify(editor.cells) + '\n'], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'level.txt';
        link.click();
        URL.revokeObjectURL(link.href);
        setStatus('Downloaded level.txt.');
    });

    document.getElementById('playtest').addEventListener('click', () => {
        const saved = writeStorage(CUSTOM_LEVEL_STORAGE_KEY, LevelFormat.stringify(editor.cells));
        if (!saved) return setStatus('This browser will not let the page store the level.');
        window.location.href = 'index.html';
    });

    document.getElementById('clear-playtest').addEventListener('click', () => {
        try {
            window.localStorage.removeItem(CUSTOM_LEVEL_STORAGE_KEY);
        } catch (err) {
            // Nothing stored means nothing to clear.
        }
        refreshPlaytestStatus();
        setStatus('The game is back on its built-in level.');
    });

    document.addEventListener('keydown', event => {
        const typing = event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT';
        if (typing) return;

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            return undo();
        }

        const keys = Object.keys(LEVEL_TILES);
        const asNumber = parseInt(event.key, 10);
        if (asNumber >= 1 && asNumber <= keys.length) return selectTile(keys[asNumber - 1]);

        const tools = { b: 'brush', r: 'rect', f: 'fill' };
        const tool = tools[event.key.toLowerCase()];
        if (tool) {
            editor.tool = tool;
            document.querySelector(`input[name="tool"][value="${tool}"]`).checked = true;
        }
    });

    window.addEventListener('resize', redraw);
}

function clampSize(value) {
    return Math.max(6, Math.min(120, parseInt(value, 10) || 20));
}

function refreshPlaytestStatus() {
    const stored = readStorage(CUSTOM_LEVEL_STORAGE_KEY);
    document.getElementById('clear-playtest').disabled = !stored;
}

function setStatus(message) {
    els.status.textContent = message;
}

init();
