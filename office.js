/**
 * Call Center Chaos - Office Layout
 * Handles the office map, pathfinding, and rendering of the environment
 * Now with Isometric 2D Pixel Art style!
 */

class Office {
    constructor() {
        this.width = CONFIG.office.canvasWidth;
        this.height = CONFIG.office.canvasHeight;
        this.gridSize = CONFIG.office.gridSize;
        this.cols = Math.floor(this.width / this.gridSize);
        this.rows = Math.floor(this.height / this.gridSize);
        
        // Isometric settings
        this.tileWidth = CONFIG.office.tileWidth || 40;
        this.tileHeight = CONFIG.office.tileHeight || 20;
        this.offsetX = this.width / 2 + 50;  // Shift right to center view
        this.offsetY = 60;
        
        // Grid: 0 = walkable, 1 = wall, 2 = desk, 3 = break room, 4 = bathroom
        this.grid = [];
        this.desks = [];
        this.paths = [];
        
        this.initializeLayout();
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
    
    initializeLayout() {
        // Initialize empty grid
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = 0; // Default to walkable floor
            }
        }
        
        // Create walls around the perimeter
        this.createWalls();
        
        // Create rooms
        this.createBreakRoom();
        this.createBathroom();
        this.createWorkspace();
        
        // Create multiple paths between areas
        this.createPaths();
    }
    
    createWalls() {
        // Top and bottom walls
        for (let x = 0; x < this.cols; x++) {
            this.grid[0][x] = 1;
            this.grid[this.rows - 1][x] = 1;
        }
        // Left and right walls
        for (let y = 0; y < this.rows; y++) {
            this.grid[y][0] = 1;
            this.grid[y][this.cols - 1] = 1;
        }
        
        // Internal walls to create structure
        // Horizontal divider between top rooms and workspace
        for (let x = 0; x < this.cols; x++) {
            if (x < 8 || x > 12) {
                this.grid[10][x] = 1;
            }
        }
        
        // Vertical wall separating break room from bathroom
        for (let y = 1; y < 10; y++) {
            if (y !== 5) { // Leave a door at y=5
                this.grid[y][15] = 1;
            }
        }
        
        // Vertical wall separating bathroom from workspace corridor
        for (let y = 1; y < 10; y++) {
            if (y !== 5 && y !== 6) { // Leave a double-wide door at y=5 and y=6
                this.grid[y][28] = 1;
            }
        }
    }
    
    createBreakRoom() {
        // Break room in top-left area
        this.breakRoomBounds = {
            x1: 1, y1: 1,
            x2: 14, y2: 9
        };
        
        // Mark break room floor
        for (let y = this.breakRoomBounds.y1; y <= this.breakRoomBounds.y2; y++) {
            for (let x = this.breakRoomBounds.x1; x <= this.breakRoomBounds.x2; x++) {
                if (this.grid[y][x] === 0) {
                    this.grid[y][x] = 3; // Break room
                }
            }
        }
        
        // Coffee station position
        this.coffeeStation = {
            x: 4 * this.gridSize,
            y: 4 * this.gridSize,
            gridX: 4,
            gridY: 4
        };
    }
    
    createBathroom() {
        // Bathroom adjacent to break room (right side)
        this.bathroomBounds = {
            x1: 16, y1: 1,
            x2: 27, y2: 9
        };
        
        // Mark bathroom floor
        for (let y = this.bathroomBounds.y1; y <= this.bathroomBounds.y2; y++) {
            for (let x = this.bathroomBounds.x1; x <= this.bathroomBounds.x2; x++) {
                if (this.grid[y][x] === 0) {
                    this.grid[y][x] = 4; // Bathroom
                }
            }
        }
        
        // Bathroom stall position
        this.bathroomStall = {
            x: 22 * this.gridSize,
            y: 4 * this.gridSize,
            gridX: 22,
            gridY: 4
        };
    }
    
    createWorkspace() {
        // Create desk positions in the lower workspace area
        const deskStartY = 14;
        const deskSpacingX = 6;
        const deskSpacingY = 5;
        const desksPerRow = 5;
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < desksPerRow; col++) {
                const gridX = 5 + col * deskSpacingX;
                const gridY = deskStartY + row * deskSpacingY;
                
                // Create desk (2x2 grid cells)
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        if (gridY + dy < this.rows - 1 && gridX + dx < this.cols - 1) {
                            this.grid[gridY + dy][gridX + dx] = 2;
                        }
                    }
                }
                
                // Store desk center position
                this.desks.push({
                    x: (gridX + 1) * this.gridSize,
                    y: (gridY + 1) * this.gridSize,
                    gridX: gridX,
                    gridY: gridY,
                    occupied: false,
                    employeeIndex: -1
                });
            }
        }
    }
    
    createPaths() {
        // Mark multiple clear paths for navigation
        // Path 1: Left corridor (for break room access)
        for (let y = 1; y < this.rows - 1; y++) {
            if (this.grid[y][2] === 0) {
                this.paths.push({ x: 2, y: y });
            }
            if (this.grid[y][3] === 0) {
                this.paths.push({ x: 3, y: y });
            }
        }
        
        // Path 2: Center corridor
        for (let y = 1; y < this.rows - 1; y++) {
            for (let x = 20; x <= 24; x++) {
                if (this.grid[y][x] === 0) {
                    this.paths.push({ x: x, y: y });
                }
            }
        }
        
        // Path 3: Right corridor (for bathroom access)
        for (let y = 1; y < this.rows - 1; y++) {
            if (this.grid[y][this.cols - 3] === 0) {
                this.paths.push({ x: this.cols - 3, y: y });
            }
            if (this.grid[y][this.cols - 4] === 0) {
                this.paths.push({ x: this.cols - 4, y: y });
            }
        }
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
        const wallHeight = 25;
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
        const deskHeight = 12;
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
        this.drawPixelMonitor(ctx, iso.x, iso.y - deskHeight - 8);
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
        this.drawPixelCoffeeMachine(ctx, screenPos.x, screenPos.y - 15);
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
        this.drawPixelBathroom(ctx, screenPos.x, screenPos.y - 15);
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
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        
        // Break room label
        const breakRoomIso = this.toIso(7, 5);
        ctx.fillText('BREAK ROOM', breakRoomIso.x, breakRoomIso.y - 30);
        
        // Bathroom label (now adjacent to break room)
        const bathroomIso = this.toIso(22, 5);
        ctx.fillText('BATHROOM', bathroomIso.x, bathroomIso.y - 30);
        
        // Workspace label
        const workspaceIso = this.toIso(22, 20);
        ctx.fillText('WORKSPACE', workspaceIso.x, workspaceIso.y - 20);
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
