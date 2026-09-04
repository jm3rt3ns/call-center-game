/**
 * Call Center Chaos - Office Layout
 * Handles the office map, pathfinding, and rendering of the environment
 * Now with Isometric 2D Pixel Art style!
 */

class Office {
    /**
     * @param {string} [levelText] flat map text (see levels.js). Defaults to
     *   the editor's playtest level if there is one, otherwise the built-in.
     */
    constructor(levelText) {
        // Canvas the office is drawn into
        this.width = CONFIG.office.canvasWidth;
        this.height = CONFIG.office.canvasHeight;
        this.gridSize = CONFIG.office.gridSize;

        // Grid: 0 = walkable, 1 = wall, 2 = desk, 3 = break room, 4 = bathroom
        this.grid = [];
        this.desks = [];

        this.loadLevel(levelText);
    }

    loadLevel(levelText) {
        const level = typeof levelText === 'string' && levelText.trim()
            ? { id: 'custom', name: 'Custom', map: levelText }
            : getActiveLevel();

        this.levelName = level.name;
        this.levelText = level.map;

        const parsed = LevelFormat.parse(level.map);
        const described = LevelFormat.describe(parsed);
        this.levelWarnings = parsed.warnings.concat(described.problems);
        if (this.levelWarnings.length) {
            console.warn(`Level "${this.levelName}":\n  ` + this.levelWarnings.join('\n  '));
        }

        this.cols = parsed.cols;
        this.rows = parsed.rows;

        // The playable world in pixels - the canvas may be larger or smaller.
        this.worldWidth = this.cols * this.gridSize;
        this.worldHeight = this.rows * this.gridSize;

        // Tiles
        this.grid = parsed.cells.map(row => row.map(char => LevelFormat.tileFor(char).cell));

        // Desks - one per connected clump of desk tiles
        this.desks = described.desks.map((desk, index) => ({
            x: (desk.gridX + 0.5) * this.gridSize,
            y: (desk.gridY + 0.5) * this.gridSize,
            gridX: desk.gridX,
            gridY: desk.gridY,
            occupied: false,
            employeeIndex: index,
        }));

        if (!this.desks.length) {
            const fallback = this.firstWalkableCell();
            this.desks.push({
                x: (fallback.x + 0.5) * this.gridSize,
                y: (fallback.y + 0.5) * this.gridSize,
                gridX: fallback.x,
                gridY: fallback.y,
                occupied: false,
                employeeIndex: 0,
            });
        }

        // Props. A level missing one still loads; the fallback keeps the
        // employees walking to somewhere valid instead of off the map.
        this.coffeeStation = this.toStation(described.coffee, 3);
        this.bathroomStall = this.toStation(described.toilet, 4);

        const spawn = described.spawn || this.firstWalkableCell();
        this.managerSpawn = {
            x: (spawn.x + 0.5) * this.gridSize,
            y: (spawn.y + 0.5) * this.gridSize,
        };

        this.roomLabels = this.findRoomLabels();
        this.fitView();
    }

    toStation(cell, roomType) {
        const at = cell || this.firstCellOfType(roomType) || this.firstWalkableCell();
        return {
            x: (at.x + 0.5) * this.gridSize,
            y: (at.y + 0.5) * this.gridSize,
            gridX: at.x,
            gridY: at.y,
        };
    }

    firstCellOfType(type) {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y][x] === type) return { x, y };
            }
        }
        return null;
    }

    firstWalkableCell() {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.isWalkable(x, y)) return { x, y };
            }
        }
        return { x: 0, y: 0 };
    }

    /** Centre of mass of each room type, so the labels follow the level. */
    findRoomLabels() {
        const rooms = [
            { type: 3, text: 'BREAK ROOM' },
            { type: 4, text: 'BATHROOM' },
            { type: 0, text: 'WORKSPACE' },
        ];

        return rooms.map(room => {
            let count = 0, sumX = 0, sumY = 0;
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x] !== room.type) continue;
                    count++;
                    sumX += x;
                    sumY += y;
                }
            }
            if (!count) return null;
            return { text: room.text, gridX: sumX / count, gridY: sumY / count };
        }).filter(Boolean);
    }

    /**
     * Scale and centre the isometric view so the whole level is on screen,
     * whatever size the level and the window are.
     */
    fitView() {
        const baseTileWidth = CONFIG.office.tileWidth || 40;
        const baseTileHeight = CONFIG.office.tileHeight || 20;
        const margin = 24;

        const span = this.cols + this.rows;
        const wantedWidth = span * (baseTileWidth / 2);
        const wantedHeight = span * (baseTileHeight / 2) + this.wallHeightFor(1);

        this.scale = Math.min(
            1,
            (this.width - margin * 2) / Math.max(1, wantedWidth),
            (this.height - margin * 2) / Math.max(1, wantedHeight)
        );

        this.tileWidth = baseTileWidth * this.scale;
        this.tileHeight = baseTileHeight * this.scale;

        const drawnWidth = span * (this.tileWidth / 2);
        const drawnHeight = span * (this.tileHeight / 2) + this.wallHeight();
        this.offsetX = (this.width - drawnWidth) / 2 + this.rows * (this.tileWidth / 2);
        this.offsetY = (this.height - drawnHeight) / 2 + this.wallHeight();
    }

    wallHeightFor(scale) {
        return 25 * scale;
    }

    wallHeight() {
        return this.wallHeightFor(this.scale);
    }

    // Convert cartesian to isometric coordinates
    toIso(x, y) {
        return {
            x: (x - y) * (this.tileWidth / 2) + this.offsetX,
            y: (x + y) * (this.tileHeight / 2) + this.offsetY
        };
    }
    
    // Convert isometric back to cartesian (for click detection)
    fromIso(isoX, isoY) {
        const x = isoX - this.offsetX;
        const y = isoY - this.offsetY;
        return {
            x: (x / (this.tileWidth / 2) + y / (this.tileHeight / 2)) / 2,
            y: (y / (this.tileHeight / 2) - x / (this.tileWidth / 2)) / 2
        };
    }
    
    // Convert pixel position to isometric screen position
    worldToScreen(worldX, worldY) {
        const gridX = worldX / this.gridSize;
        const gridY = worldY / this.gridSize;
        return this.toIso(gridX, gridY);
    }
    
    // Convert screen position to world position
    screenToWorld(screenX, screenY) {
        const grid = this.fromIso(screenX, screenY);
        return {
            x: grid.x * this.gridSize,
            y: grid.y * this.gridSize
        };
    }
    
    isWalkable(gridX, gridY) {
        if (gridX < 0 || gridX >= this.cols || gridY < 0 || gridY >= this.rows) {
            return false;
        }
        const cell = this.grid[gridY][gridX];
        return cell !== 1 && cell !== 2; // Not wall or desk
    }
    
    isWalkablePixel(x, y) {
        const gridX = Math.floor(x / this.gridSize);
        const gridY = Math.floor(y / this.gridSize);
        return this.isWalkable(gridX, gridY);
    }
    
    getAssignedDesk(employeeIndex) {
        if (employeeIndex < this.desks.length) {
            return this.desks[employeeIndex];
        }
        // If more employees than desks, cycle through
        return this.desks[employeeIndex % this.desks.length];
    }
    
    // Simple A* pathfinding
    findPath(startX, startY, endX, endY) {
        const startGridX = Math.floor(startX / this.gridSize);
        const startGridY = Math.floor(startY / this.gridSize);
        const endGridX = Math.floor(endX / this.gridSize);
        const endGridY = Math.floor(endY / this.gridSize);
        
        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();
        
        const gScore = new Map();
        const fScore = new Map();
        
        const startKey = `${startGridX},${startGridY}`;
        const endKey = `${endGridX},${endGridY}`;
        
        openSet.push({ x: startGridX, y: startGridY });
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(startGridX, startGridY, endGridX, endGridY));
        
        while (openSet.length > 0) {
            // Find node with lowest fScore
            openSet.sort((a, b) => {
                const aKey = `${a.x},${a.y}`;
                const bKey = `${b.x},${b.y}`;
                return (fScore.get(aKey) || Infinity) - (fScore.get(bKey) || Infinity);
            });
            
            const current = openSet.shift();
            const currentKey = `${current.x},${current.y}`;
            
            if (current.x === endGridX && current.y === endGridY) {
                // Reconstruct path
                return this.reconstructPath(cameFrom, current);
            }
            
            closedSet.add(currentKey);
            
            // Check neighbors
            const neighbors = [
                { x: current.x - 1, y: current.y },
                { x: current.x + 1, y: current.y },
                { x: current.x, y: current.y - 1 },
                { x: current.x, y: current.y + 1 },
            ];
            
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                
                if (closedSet.has(neighborKey)) continue;
                if (!this.isWalkable(neighbor.x, neighbor.y)) continue;
                
                const tentativeGScore = (gScore.get(currentKey) || 0) + 1;
                
                const inOpenSet = openSet.some(n => n.x === neighbor.x && n.y === neighbor.y);
                
                if (!inOpenSet || tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor.x, neighbor.y, endGridX, endGridY));
                    
                    if (!inOpenSet) {
                        openSet.push(neighbor);
                    }
                }
            }
        }
        
        // No path found, return direct path
        return [{ x: endX, y: endY }];
    }
    
    heuristic(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }
    
    reconstructPath(cameFrom, current) {
        const path = [];
        let currentKey = `${current.x},${current.y}`;
        
        while (cameFrom.has(currentKey)) {
            path.unshift({
                x: current.x * this.gridSize + this.gridSize / 2,
                y: current.y * this.gridSize + this.gridSize / 2
            });
            current = cameFrom.get(currentKey);
            currentKey = `${current.x},${current.y}`;
        }
        
        return path;
    }
    
    /**
     * The rectangle the isometric scene actually covers on screen. The map is
     * a diamond that reaches well outside the canvas rectangle, so anything
     * that frames or backs the scene - the camera, the background fill - has
     * to work from these bounds rather than the canvas size.
     */
    sceneBounds() {
        if (this._sceneBounds) return this._sceneBounds;
        
        const halfTile = this.tileWidth / 2;
        const wallHeight = 25;   // matches drawIsometricWall
        const headroom = 48;     // room for sprites standing on the back row
        
        const corners = [
            this.toIso(0, 0),
            this.toIso(this.cols - 1, 0),
            this.toIso(0, this.rows - 1),
            this.toIso(this.cols - 1, this.rows - 1),
        ];
        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);
        
        this._sceneBounds = {
            left: Math.min(...xs) - halfTile,
            right: Math.max(...xs) + halfTile,
            top: Math.min(...ys) - wallHeight - headroom,
            bottom: Math.max(...ys) + this.tileHeight,
        };
        return this._sceneBounds;
    }
    
    render(ctx) {
        // Draw floor with isometric perspective
        this.renderIsometricFloor(ctx);
        
        // Draw grid cells based on type (sorted for proper depth)
        this.renderIsometricTiles(ctx);
        
        // Draw coffee station
        this.renderCoffeeStation(ctx);
        
        // Draw bathroom stall
        this.renderBathroomStall(ctx);
        
        // Draw room labels
        this.renderLabels(ctx);
    }
    
    renderIsometricFloor(ctx) {
        // Dark background behind the whole diamond, so a camera looking at any
        // corner of the map still sees office rather than empty canvas
        const bounds = this.sceneBounds();
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(
            bounds.left,
            bounds.top,
            bounds.right - bounds.left,
            bounds.bottom - bounds.top
        );
        
        // Draw base floor grid with pixel art style
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 1;
        
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y][x] !== 1) { // Don't draw under walls
                    this.drawIsometricTile(ctx, x, y, CONFIG.office.colors.floor, false);
                }
            }
        }
    }
    
    renderIsometricTiles(ctx) {
        // Render from back to front for proper depth
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cellType = this.grid[y][x];
                
                switch (cellType) {
                    case 1: // Wall
                        this.drawIsometricWall(ctx, x, y);
                        break;
                    case 2: // Desk
                        this.drawIsometricDesk(ctx, x, y);
                        break;
                    case 3: // Break room
                        this.drawIsometricTile(ctx, x, y, CONFIG.office.colors.breakRoom, false);
                        break;
                    case 4: // Bathroom
                        this.drawIsometricTile(ctx, x, y, CONFIG.office.colors.bathroom, false);
                        break;
                }
            }
        }
    }
    
    drawIsometricTile(ctx, gridX, gridY, color, raised = false) {
        const iso = this.toIso(gridX, gridY);
        const tw = this.tileWidth;
        const th = this.tileHeight;
        
        // Pixel art style - draw diamond shape for floor tile
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y);
        ctx.lineTo(iso.x + tw/2, iso.y + th/2);
        ctx.lineTo(iso.x, iso.y + th);
        ctx.lineTo(iso.x - tw/2, iso.y + th/2);
        ctx.closePath();
        ctx.fill();
        
        // Add pixel-art style highlights
        ctx.strokeStyle = this.lightenColor(color, 20);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y);
        ctx.lineTo(iso.x + tw/2, iso.y + th/2);
        ctx.stroke();
        
        ctx.strokeStyle = this.darkenColor(color, 20);
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y + th);
        ctx.lineTo(iso.x - tw/2, iso.y + th/2);
        ctx.stroke();
    }
    
    drawIsometricWall(ctx, gridX, gridY) {
        const iso = this.toIso(gridX, gridY);
        const tw = this.tileWidth;
        const th = this.tileHeight;
        const wallHeight = this.wallHeight();
        const baseColor = CONFIG.office.colors.wall;
        
        // Top face
        ctx.fillStyle = this.lightenColor(baseColor, 30);
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y - wallHeight);
        ctx.lineTo(iso.x + tw/2, iso.y + th/2 - wallHeight);
        ctx.lineTo(iso.x, iso.y + th - wallHeight);
        ctx.lineTo(iso.x - tw/2, iso.y + th/2 - wallHeight);
        ctx.closePath();
        ctx.fill();
        
        // Left face
        ctx.fillStyle = this.darkenColor(baseColor, 10);
        ctx.beginPath();
        ctx.moveTo(iso.x - tw/2, iso.y + th/2 - wallHeight);
        ctx.lineTo(iso.x, iso.y + th - wallHeight);
        ctx.lineTo(iso.x, iso.y + th);
        ctx.lineTo(iso.x - tw/2, iso.y + th/2);
        ctx.closePath();
        ctx.fill();
        
        // Right face
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(iso.x + tw/2, iso.y + th/2 - wallHeight);
        ctx.lineTo(iso.x, iso.y + th - wallHeight);
        ctx.lineTo(iso.x, iso.y + th);
        ctx.lineTo(iso.x + tw/2, iso.y + th/2);
        ctx.closePath();
        ctx.fill();
        
        // Pixel art edge highlights
        ctx.strokeStyle = this.lightenColor(baseColor, 50);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y - wallHeight);
        ctx.lineTo(iso.x + tw/2, iso.y + th/2 - wallHeight);
        ctx.stroke();
    }
    
    drawIsometricDesk(ctx, gridX, gridY) {
        const iso = this.toIso(gridX, gridY);
        const tw = this.tileWidth;
        const th = this.tileHeight;
        const deskHeight = 12 * this.scale;
        const baseColor = CONFIG.office.colors.desk;
        
        // Desktop (top face) - pixel art wooden desk
        ctx.fillStyle = this.lightenColor(baseColor, 20);
        ctx.beginPath();
        ctx.moveTo(iso.x, iso.y - deskHeight);
        ctx.lineTo(iso.x + tw/2 - 4, iso.y + th/2 - 2 - deskHeight);
        ctx.lineTo(iso.x, iso.y + th - 4 - deskHeight);
        ctx.lineTo(iso.x - tw/2 + 4, iso.y + th/2 - 2 - deskHeight);
        ctx.closePath();
        ctx.fill();
        
        // Wood grain lines (pixel art style)
        ctx.strokeStyle = this.darkenColor(baseColor, 15);
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(iso.x - tw/4 + i*5, iso.y - deskHeight + i*2);
            ctx.lineTo(iso.x + tw/4 - i*3, iso.y + th/3 - deskHeight + i*2);
            ctx.stroke();
        }
        
        // Left face
        ctx.fillStyle = this.darkenColor(baseColor, 20);
        ctx.beginPath();
        ctx.moveTo(iso.x - tw/2 + 4, iso.y + th/2 - 2 - deskHeight);
        ctx.lineTo(iso.x, iso.y + th - 4 - deskHeight);
        ctx.lineTo(iso.x, iso.y + th - 4);
        ctx.lineTo(iso.x - tw/2 + 4, iso.y + th/2 - 2);
        ctx.closePath();
        ctx.fill();
        
        // Right face
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(iso.x + tw/2 - 4, iso.y + th/2 - 2 - deskHeight);
        ctx.lineTo(iso.x, iso.y + th - 4 - deskHeight);
        ctx.lineTo(iso.x, iso.y + th - 4);
        ctx.lineTo(iso.x + tw/2 - 4, iso.y + th/2 - 2);
        ctx.closePath();
        ctx.fill();
        
        // Computer monitor (pixel art)
        this.drawScaled(ctx, this.drawPixelMonitor, iso.x, iso.y - deskHeight - 8 * this.scale);
    }
    
    drawPixelMonitor(ctx, x, y) {
        // Monitor body
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x - 6, y - 8, 12, 8);
        
        // Screen
        ctx.fillStyle = '#4a8a4a';
        ctx.fillRect(x - 5, y - 7, 10, 6);
        
        // Screen content (pixel lines)
        ctx.fillStyle = '#6aba6a';
        ctx.fillRect(x - 4, y - 6, 6, 1);
        ctx.fillRect(x - 4, y - 4, 4, 1);
        ctx.fillRect(x - 4, y - 2, 7, 1);
        
        // Stand
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(x - 2, y, 4, 3);
    }
    
    renderCoffeeStation(ctx) {
        const screenPos = this.worldToScreen(this.coffeeStation.x, this.coffeeStation.y);
        this.drawScaled(ctx, this.drawPixelCoffeeMachine, screenPos.x, screenPos.y - 15 * this.scale);
    }

    /** Draw one of the fixed-size pixel props at the level's current scale. */
    drawScaled(ctx, draw, x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(this.scale, this.scale);
        draw.call(this, ctx, 0, 0);
        ctx.restore();
    }
    
    drawPixelCoffeeMachine(ctx, x, y) {
        // Base/body of coffee machine
        ctx.fillStyle = '#4a3a2a';
        
        // Left face
        ctx.beginPath();
        ctx.moveTo(x - 12, y);
        ctx.lineTo(x - 12, y - 20);
        ctx.lineTo(x, y - 25);
        ctx.lineTo(x, y - 5);
        ctx.closePath();
        ctx.fill();
        
        // Right face
        ctx.fillStyle = '#6a5a4a';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y - 25);
        ctx.lineTo(x + 12, y - 20);
        ctx.lineTo(x + 12, y);
        ctx.closePath();
        ctx.fill();
        
        // Top
        ctx.fillStyle = '#7a6a5a';
        ctx.beginPath();
        ctx.moveTo(x, y - 25);
        ctx.lineTo(x + 12, y - 20);
        ctx.lineTo(x, y - 15);
        ctx.lineTo(x - 12, y - 20);
        ctx.closePath();
        ctx.fill();
        
        // Coffee pot
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(x - 4, y - 12, 8, 8);
        
        // Coffee inside
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - 3, y - 10, 6, 5);
        
        // Steam (pixel dots)
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x - 2, y - 28, 2, 2);
        ctx.fillRect(x + 1, y - 30, 2, 2);
        ctx.fillRect(x - 1, y - 33, 2, 2);
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('☕', x, y + 10);
    }
    
    renderBathroomStall(ctx) {
        const screenPos = this.worldToScreen(this.bathroomStall.x, this.bathroomStall.y);
        this.drawScaled(ctx, this.drawPixelBathroom, screenPos.x, screenPos.y - 15 * this.scale);
    }
    
    drawPixelBathroom(ctx, x, y) {
        // Bathroom stall walls
        ctx.fillStyle = '#2a3a4a';
        
        // Back wall
        ctx.fillRect(x - 15, y - 25, 30, 20);
        
        // Side panels
        ctx.fillStyle = '#3a4a5a';
        ctx.fillRect(x - 15, y - 25, 4, 25);
        ctx.fillRect(x + 11, y - 25, 4, 25);
        
        // Door
        ctx.fillStyle = '#4a5a6a';
        ctx.fillRect(x - 8, y - 22, 16, 22);
        
        // Door handle
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(x + 4, y - 12, 3, 2);
        
        // Toilet (simple pixel art)
        ctx.fillStyle = '#eaeaea';
        ctx.fillRect(x - 4, y - 8, 8, 6);
        ctx.fillStyle = '#dadadd';
        ctx.fillRect(x - 3, y - 7, 6, 4);
        
        // Tank
        ctx.fillStyle = '#dadada';
        ctx.fillRect(x - 3, y - 14, 6, 6);
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🚻', x, y + 10);
    }
    
    renderLabels(ctx) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `bold ${Math.max(9, Math.round(12 * this.scale))}px monospace`;
        ctx.textAlign = 'center';

        for (const label of this.roomLabels) {
            const iso = this.toIso(label.gridX, label.gridY);
            ctx.fillText(label.text, iso.x, iso.y - 30 * this.scale);
        }
    }
    
    // Color utility functions
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
}
