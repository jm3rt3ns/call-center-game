/**
 * Call Center Chaos - Office Layout
 * Handles the office map, pathfinding, and rendering of the environment
 */

class Office {
    constructor() {
        this.width = CONFIG.office.canvasWidth;
        this.height = CONFIG.office.canvasHeight;
        this.gridSize = CONFIG.office.gridSize;
        this.cols = Math.floor(this.width / this.gridSize);
        this.rows = Math.floor(this.height / this.gridSize);
        
        // Grid: 0 = walkable, 1 = wall, 2 = desk, 3 = break room, 4 = bathroom
        this.grid = [];
        this.desks = [];
        this.paths = [];
        
        this.initializeLayout();
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
            if (x < 8 || (x > 12 && x < 32) || x > 36) {
                this.grid[10][x] = 1;
            }
        }
        
        // Vertical wall separating break room from middle
        for (let y = 1; y < 10; y++) {
            if (y !== 5) { // Leave a door
                this.grid[y][15] = 1;
            }
        }
        
        // Vertical wall separating bathroom from middle
        for (let y = 1; y < 10; y++) {
            if (y !== 5) { // Leave a door
                this.grid[y][29] = 1;
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
        // Bathroom in top-right area
        this.bathroomBounds = {
            x1: 30, y1: 1,
            x2: 43, y2: 9
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
            x: 36 * this.gridSize,
            y: 4 * this.gridSize,
            gridX: 36,
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
    
    render(ctx) {
        // Draw floor
        ctx.fillStyle = CONFIG.office.colors.floor;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw grid cells based on type
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cellType = this.grid[y][x];
                const px = x * this.gridSize;
                const py = y * this.gridSize;
                
                switch (cellType) {
                    case 1: // Wall
                        ctx.fillStyle = CONFIG.office.colors.wall;
                        ctx.fillRect(px, py, this.gridSize, this.gridSize);
                        break;
                    case 2: // Desk
                        ctx.fillStyle = CONFIG.office.colors.desk;
                        ctx.fillRect(px + 1, py + 1, this.gridSize - 2, this.gridSize - 2);
                        break;
                    case 3: // Break room
                        ctx.fillStyle = CONFIG.office.colors.breakRoom;
                        ctx.fillRect(px, py, this.gridSize, this.gridSize);
                        break;
                    case 4: // Bathroom
                        ctx.fillStyle = CONFIG.office.colors.bathroom;
                        ctx.fillRect(px, py, this.gridSize, this.gridSize);
                        break;
                }
            }
        }
        
        // Draw coffee station
        ctx.fillStyle = CONFIG.office.colors.coffeeStation;
        ctx.fillRect(
            this.coffeeStation.x - 15,
            this.coffeeStation.y - 15,
            30, 30
        );
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('☕', this.coffeeStation.x, this.coffeeStation.y + 5);
        
        // Draw bathroom stall
        ctx.fillStyle = CONFIG.office.colors.bathroomStall;
        ctx.fillRect(
            this.bathroomStall.x - 15,
            this.bathroomStall.y - 15,
            30, 30
        );
        ctx.fillStyle = '#fff';
        ctx.fillText('🚻', this.bathroomStall.x, this.bathroomStall.y + 5);
        
        // Draw room labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '14px Arial';
        ctx.fillText('BREAK ROOM', 140, 90);
        ctx.fillText('BATHROOM', 730, 90);
        ctx.fillText('WORKSPACE', 450, 250);
        
        // Draw desk numbers
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Arial';
        this.desks.forEach((desk, index) => {
            ctx.fillText(`${index + 1}`, desk.x, desk.y + 3);
        });
    }
}
