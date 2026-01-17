/**
 * Call Center Chaos - 3D Renderer
 * Three.js based 3D rendering system
 */

class Renderer3D {
    constructor(container) {
        this.container = container;
        this.width = window.innerWidth - 250;
        this.height = window.innerHeight - 90;
        
        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        
        // 3D objects
        this.floor = null;
        this.walls = [];
        this.desks = [];
        this.employeeMeshes = new Map();
        this.managerMesh = null;
        this.coffeeStation = null;
        this.bathroomStall = null;
        this.cityBuildings = [];
        this.clouds = [];
        this.windows = [];
        
        // Materials
        this.materials = {};
        
        // Animation
        this.animationMixers = [];
        
        this.init();
    }
    
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 150);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 1000);
        this.camera.position.set(25, 30, 35);
        this.camera.lookAt(15, 0, 15);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        
        // Initialize materials
        this.initMaterials();
        
        // Add lights
        this.addLights();
        
        // Create environment
        this.createSkybox();
        this.createCityBackground();
        this.createOfficeFloor();
        this.createOfficeWalls();
        this.createWindows();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    initMaterials() {
        // Floor material
        this.materials.floor = new THREE.MeshLambertMaterial({ 
            color: 0x6a6a9c,
            side: THREE.DoubleSide
        });
        
        // Wall material
        this.materials.wall = new THREE.MeshLambertMaterial({ 
            color: 0x4a4a6e 
        });
        
        // Desk material (wood)
        this.materials.desk = new THREE.MeshLambertMaterial({ 
            color: 0xb87333 
        });
        
        // Break room floor
        this.materials.breakRoom = new THREE.MeshLambertMaterial({ 
            color: 0x5d9a7a 
        });
        
        // Bathroom floor
        this.materials.bathroom = new THREE.MeshLambertMaterial({ 
            color: 0x5a8aaa 
        });
        
        // Glass material
        this.materials.glass = new THREE.MeshPhongMaterial({ 
            color: 0x88ccff,
            transparent: true,
            opacity: 0.3,
            shininess: 100
        });
        
        // Employee material (will be updated based on state)
        this.materials.employee = new THREE.MeshLambertMaterial({ 
            color: 0x4ade80 
        });
        
        // Manager material
        this.materials.manager = new THREE.MeshLambertMaterial({ 
            color: 0xef4444 
        });
        
        // Building materials
        this.materials.building = new THREE.MeshLambertMaterial({ 
            color: 0x3a4a5a 
        });
        
        // Coffee station
        this.materials.coffee = new THREE.MeshLambertMaterial({ 
            color: 0x6b4423 
        });
        
        // Bathroom stall
        this.materials.bathroomStall = new THREE.MeshLambertMaterial({ 
            color: 0x3a6a8a 
        });
    }
    
    addLights() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        // Main directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(30, 50, 30);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 100;
        sunLight.shadow.camera.left = -40;
        sunLight.shadow.camera.right = 40;
        sunLight.shadow.camera.top = 40;
        sunLight.shadow.camera.bottom = -40;
        this.scene.add(sunLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
        fillLight.position.set(-20, 20, -10);
        this.scene.add(fillLight);
        
        // Office ceiling lights
        for (let x = 5; x < 30; x += 10) {
            for (let z = 5; z < 25; z += 10) {
                const pointLight = new THREE.PointLight(0xffffee, 0.3, 15);
                pointLight.position.set(x, 8, z);
                this.scene.add(pointLight);
            }
        }
    }
    
    createSkybox() {
        // Simple gradient sky using a large sphere
        const skyGeo = new THREE.SphereGeometry(200, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    }
    
    createCityBackground() {
        // Create buildings in the distance
        const numBuildings = 30;
        
        for (let i = 0; i < numBuildings; i++) {
            const width = 3 + Math.random() * 6;
            const height = 10 + Math.random() * 40;
            const depth = 3 + Math.random() * 6;
            
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const material = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.6, 0.1, 0.2 + Math.random() * 0.2)
            });
            
            const building = new THREE.Mesh(geometry, material);
            building.position.set(
                -50 + i * 5 + Math.random() * 3,
                height / 2 - 10,
                -40 - Math.random() * 30
            );
            building.castShadow = true;
            building.receiveShadow = true;
            
            // Add windows to building
            this.addBuildingWindows(building, width, height, depth);
            
            this.scene.add(building);
            this.cityBuildings.push(building);
        }
    }
    
    addBuildingWindows(building, width, height, depth) {
        const windowGeom = new THREE.PlaneGeometry(0.8, 1.2);
        const windowRows = Math.floor(height / 3);
        const windowCols = Math.floor(width / 2);
        
        for (let row = 0; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
                const isLit = Math.random() > 0.4;
                const windowMat = new THREE.MeshBasicMaterial({
                    color: isLit ? 0xFFE4A0 : 0x1a2a3a
                });
                
                const windowMesh = new THREE.Mesh(windowGeom, windowMat);
                windowMesh.position.set(
                    -width/2 + 1 + col * 2,
                    -height/2 + 2 + row * 3,
                    depth/2 + 0.01
                );
                building.add(windowMesh);
            }
        }
    }
    
    createOfficeFloor() {
        // Main floor
        const floorGeom = new THREE.PlaneGeometry(50, 40);
        const floor = new THREE.Mesh(floorGeom, this.materials.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(15, 0, 15);
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.floor = floor;
        
        // Break room floor (different color)
        const breakRoomGeom = new THREE.PlaneGeometry(14, 9);
        const breakRoom = new THREE.Mesh(breakRoomGeom, this.materials.breakRoom);
        breakRoom.rotation.x = -Math.PI / 2;
        breakRoom.position.set(7, 0.01, 5);
        breakRoom.receiveShadow = true;
        this.scene.add(breakRoom);
        
        // Bathroom floor
        const bathroomGeom = new THREE.PlaneGeometry(12, 9);
        const bathroom = new THREE.Mesh(bathroomGeom, this.materials.bathroom);
        bathroom.rotation.x = -Math.PI / 2;
        bathroom.position.set(21, 0.01, 5);
        bathroom.receiveShadow = true;
        this.scene.add(bathroom);
    }
    
    createOfficeWalls() {
        const wallHeight = 10;
        const wallThickness = 0.3;
        const internalWallHeight = wallHeight * 0.6;
        const doorHeight = internalWallHeight;
        const doorWidth = 2;
        
        // Back wall (with windows)
        const backWallGeom = new THREE.BoxGeometry(50, wallHeight, wallThickness);
        const backWall = new THREE.Mesh(backWallGeom, this.materials.wall);
        backWall.position.set(15, wallHeight/2, -5);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        this.walls.push(backWall);
        
        // Left wall
        const leftWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, 40);
        const leftWall = new THREE.Mesh(leftWallGeom, this.materials.wall);
        leftWall.position.set(-10, wallHeight/2, 15);
        leftWall.castShadow = true;
        this.scene.add(leftWall);
        this.walls.push(leftWall);
        
        // Right wall
        const rightWall = new THREE.Mesh(leftWallGeom, this.materials.wall);
        rightWall.position.set(40, wallHeight/2, 15);
        rightWall.castShadow = true;
        this.scene.add(rightWall);
        this.walls.push(rightWall);
        
        // Internal wall between break room and bathroom (x=15 in grid, door at y=5)
        // Wall segment before door (y=1 to y=4)
        const internalWall1Geom = new THREE.BoxGeometry(wallThickness, internalWallHeight, 4);
        const internalWall1 = new THREE.Mesh(internalWall1Geom, this.materials.wall);
        internalWall1.position.set(14, internalWallHeight/2, 2.5);
        internalWall1.castShadow = true;
        this.scene.add(internalWall1);
        this.walls.push(internalWall1);
        
        // Wall segment after door (y=6 to y=9)
        const internalWall2Geom = new THREE.BoxGeometry(wallThickness, internalWallHeight, 4);
        const internalWall2 = new THREE.Mesh(internalWall2Geom, this.materials.wall);
        internalWall2.position.set(14, internalWallHeight/2, 7.5);
        internalWall2.castShadow = true;
        this.scene.add(internalWall2);
        this.walls.push(internalWall2);
        
        // Door frame between break room and bathroom
        this.createDoorFrame(14, 5, 'z', doorWidth, doorHeight);
        
        // Wall between bathroom and workspace (x=28 in grid, door at y=5,6)
        // Wall segment before door (y=1 to y=4)
        const bathroomWall1Geom = new THREE.BoxGeometry(wallThickness, internalWallHeight, 4);
        const bathroomWall1 = new THREE.Mesh(bathroomWall1Geom, this.materials.wall);
        bathroomWall1.position.set(27, internalWallHeight/2, 2.5);
        bathroomWall1.castShadow = true;
        this.scene.add(bathroomWall1);
        this.walls.push(bathroomWall1);
        
        // Wall segment after door (y=7 to y=9)
        const bathroomWall2Geom = new THREE.BoxGeometry(wallThickness, internalWallHeight, 3);
        const bathroomWall2 = new THREE.Mesh(bathroomWall2Geom, this.materials.wall);
        bathroomWall2.position.set(27, internalWallHeight/2, 8);
        bathroomWall2.castShadow = true;
        this.scene.add(bathroomWall2);
        this.walls.push(bathroomWall2);
        
        // Double door frame between bathroom and workspace
        this.createDoorFrame(27, 5.5, 'z', doorWidth * 1.5, doorHeight);
        
        // Horizontal divider wall between rooms and workspace (y=10 in grid)
        // Door opening at x=8-12, so we need wall segments on either side
        
        // Left segment (x=0 to x=7)
        const dividerWall1Geom = new THREE.BoxGeometry(8, internalWallHeight, wallThickness);
        const dividerWall1 = new THREE.Mesh(dividerWall1Geom, this.materials.wall);
        dividerWall1.position.set(3, internalWallHeight/2, 10);
        dividerWall1.castShadow = true;
        this.scene.add(dividerWall1);
        this.walls.push(dividerWall1);
        
        // Right segment (x=13 to x=28+)
        const dividerWall2Geom = new THREE.BoxGeometry(20, internalWallHeight, wallThickness);
        const dividerWall2 = new THREE.Mesh(dividerWall2Geom, this.materials.wall);
        dividerWall2.position.set(23, internalWallHeight/2, 10);
        dividerWall2.castShadow = true;
        this.scene.add(dividerWall2);
        this.walls.push(dividerWall2);
        
        // Door frame for main entrance to workspace
        this.createDoorFrame(10, 10, 'x', 5, doorHeight);
        
        // Ceiling - transparent so player can see inside
        const ceilingGeom = new THREE.PlaneGeometry(50, 40);
        const ceilingMat = new THREE.MeshLambertMaterial({ 
            color: 0xeeeeee,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.15
        });
        const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(15, wallHeight, 15);
        this.scene.add(ceiling);
    }
    
    createDoorFrame(x, z, orientation, width, height) {
        // Create a door frame to visually indicate door openings
        const frameThickness = 0.15;
        const frameDepth = 0.4;
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown wood color
        
        if (orientation === 'z') {
            // Door along z-axis (vertical walls like between rooms)
            // Left post
            const leftPostGeom = new THREE.BoxGeometry(frameThickness, height, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeom, frameMat);
            leftPost.position.set(x, height/2, z - width/2);
            this.scene.add(leftPost);
            
            // Right post
            const rightPost = new THREE.Mesh(leftPostGeom, frameMat);
            rightPost.position.set(x, height/2, z + width/2);
            this.scene.add(rightPost);
            
            // Top beam
            const topBeamGeom = new THREE.BoxGeometry(frameThickness, frameThickness, width + frameThickness);
            const topBeam = new THREE.Mesh(topBeamGeom, frameMat);
            topBeam.position.set(x, height, z);
            this.scene.add(topBeam);
        } else {
            // Door along x-axis (horizontal walls like divider)
            // Left post
            const leftPostGeom = new THREE.BoxGeometry(frameDepth, height, frameThickness);
            const leftPost = new THREE.Mesh(leftPostGeom, frameMat);
            leftPost.position.set(x - width/2, height/2, z);
            this.scene.add(leftPost);
            
            // Right post
            const rightPost = new THREE.Mesh(leftPostGeom, frameMat);
            rightPost.position.set(x + width/2, height/2, z);
            this.scene.add(rightPost);
            
            // Top beam
            const topBeamGeom = new THREE.BoxGeometry(width + frameThickness, frameThickness, frameThickness);
            const topBeam = new THREE.Mesh(topBeamGeom, frameMat);
            topBeam.position.set(x, height, z);
            this.scene.add(topBeam);
        }
    }
    
    createWindows() {
        // Large windows on back wall
        const windowWidth = 6;
        const windowHeight = 5;
        const numWindows = 5;
        
        for (let i = 0; i < numWindows; i++) {
            const windowGeom = new THREE.PlaneGeometry(windowWidth, windowHeight);
            const windowMesh = new THREE.Mesh(windowGeom, this.materials.glass);
            windowMesh.position.set(-5 + i * 10, 5, -4.8);
            this.scene.add(windowMesh);
            this.windows.push(windowMesh);
            
            // Window frame
            const frameGeom = new THREE.BoxGeometry(windowWidth + 0.4, windowHeight + 0.4, 0.2);
            const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5a });
            const frame = new THREE.Mesh(frameGeom, frameMat);
            frame.position.set(-5 + i * 10, 5, -4.9);
            this.scene.add(frame);
        }
    }
    
    createDesk(x, z, index) {
        const group = new THREE.Group();
        
        // Desk top
        const deskTopGeom = new THREE.BoxGeometry(2, 0.1, 1.2);
        const deskTop = new THREE.Mesh(deskTopGeom, this.materials.desk);
        deskTop.position.y = 0.75;
        deskTop.castShadow = true;
        deskTop.receiveShadow = true;
        group.add(deskTop);
        
        // Desk legs
        const legGeom = new THREE.BoxGeometry(0.1, 0.75, 0.1);
        const legPositions = [
            [-0.9, 0.375, -0.5],
            [0.9, 0.375, -0.5],
            [-0.9, 0.375, 0.5],
            [0.9, 0.375, 0.5]
        ];
        
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeom, this.materials.desk);
            leg.position.set(...pos);
            leg.castShadow = true;
            group.add(leg);
        });
        
        // Monitor
        const monitorGeom = new THREE.BoxGeometry(0.8, 0.5, 0.05);
        const monitorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
        const monitor = new THREE.Mesh(monitorGeom, monitorMat);
        monitor.position.set(0, 1.1, -0.3);
        monitor.castShadow = true;
        group.add(monitor);
        
        // Monitor screen
        const screenGeom = new THREE.PlaneGeometry(0.7, 0.4);
        const screenMat = new THREE.MeshBasicMaterial({ color: 0x4a8a4a });
        const screen = new THREE.Mesh(screenGeom, screenMat);
        screen.position.set(0, 1.1, -0.27);
        group.add(screen);
        
        // Monitor stand
        const standGeom = new THREE.BoxGeometry(0.1, 0.2, 0.1);
        const stand = new THREE.Mesh(standGeom, monitorMat);
        stand.position.set(0, 0.9, -0.3);
        group.add(stand);
        
        // Chair
        const chairGroup = this.createChair();
        chairGroup.position.set(0, 0, 0.8);
        group.add(chairGroup);
        
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.desks.push(group);
        
        return group;
    }
    
    createChair() {
        const group = new THREE.Group();
        const chairMat = new THREE.MeshLambertMaterial({ color: 0x2a2a4a });
        
        // Seat
        const seatGeom = new THREE.BoxGeometry(0.5, 0.05, 0.5);
        const seat = new THREE.Mesh(seatGeom, chairMat);
        seat.position.y = 0.45;
        group.add(seat);
        
        // Back
        const backGeom = new THREE.BoxGeometry(0.5, 0.5, 0.05);
        const back = new THREE.Mesh(backGeom, chairMat);
        back.position.set(0, 0.7, -0.25);
        group.add(back);
        
        // Leg
        const legGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
        const leg = new THREE.Mesh(legGeom, chairMat);
        leg.position.y = 0.2;
        group.add(leg);
        
        // Base
        const baseGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.03);
        const base = new THREE.Mesh(baseGeom, chairMat);
        base.position.y = 0.015;
        group.add(base);
        
        return group;
    }
    
    createCoffeeStation(x, z) {
        const group = new THREE.Group();
        
        // Counter
        const counterGeom = new THREE.BoxGeometry(1.5, 1, 0.8);
        const counter = new THREE.Mesh(counterGeom, this.materials.coffee);
        counter.position.y = 0.5;
        counter.castShadow = true;
        counter.receiveShadow = true;
        group.add(counter);
        
        // Coffee machine
        const machineGeom = new THREE.BoxGeometry(0.4, 0.5, 0.3);
        const machineMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const machine = new THREE.Mesh(machineGeom, machineMat);
        machine.position.set(0, 1.25, 0);
        machine.castShadow = true;
        group.add(machine);
        
        // Coffee pot
        const potGeom = new THREE.CylinderGeometry(0.1, 0.12, 0.2);
        const potMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
        const pot = new THREE.Mesh(potGeom, potMat);
        pot.position.set(0.4, 1.1, 0);
        group.add(pot);
        
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.coffeeStation = group;
        
        return group;
    }
    
    createBathroomStall(x, z) {
        const group = new THREE.Group();
        const stallMat = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
        
        // Back wall
        const backGeom = new THREE.BoxGeometry(1.5, 2, 0.1);
        const back = new THREE.Mesh(backGeom, stallMat);
        back.position.set(0, 1, -0.5);
        back.castShadow = true;
        group.add(back);
        
        // Side walls
        const sideGeom = new THREE.BoxGeometry(0.1, 2, 1);
        const leftSide = new THREE.Mesh(sideGeom, stallMat);
        leftSide.position.set(-0.75, 1, 0);
        leftSide.castShadow = true;
        group.add(leftSide);
        
        const rightSide = new THREE.Mesh(sideGeom, stallMat);
        rightSide.position.set(0.75, 1, 0);
        rightSide.castShadow = true;
        group.add(rightSide);
        
        // Door
        const doorGeom = new THREE.BoxGeometry(1.4, 1.8, 0.05);
        const door = new THREE.Mesh(doorGeom, stallMat);
        door.position.set(0, 0.9, 0.5);
        door.castShadow = true;
        group.add(door);
        
        // Toilet
        const toiletMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
        const bowlGeom = new THREE.CylinderGeometry(0.2, 0.25, 0.3);
        const bowl = new THREE.Mesh(bowlGeom, toiletMat);
        bowl.position.set(0, 0.3, -0.2);
        group.add(bowl);
        
        const tankGeom = new THREE.BoxGeometry(0.4, 0.4, 0.15);
        const tank = new THREE.Mesh(tankGeom, toiletMat);
        tank.position.set(0, 0.55, -0.4);
        group.add(tank);
        
        group.position.set(x, 0, z);
        this.scene.add(group);
        this.bathroomStall = group;
        
        return group;
    }
    
    createEmployee(employee) {
        const group = new THREE.Group();
        
        // Body
        const bodyGeom = new THREE.BoxGeometry(0.4, 0.6, 0.25);
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.getEmployeeColor(employee) });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.8;
        body.castShadow = true;
        group.add(body);
        group.bodyMesh = body;
        
        // Head
        const headGeom = new THREE.SphereGeometry(0.15);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xe8c8a8 });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 1.25;
        head.castShadow = true;
        group.add(head);
        
        // Hair
        const hairGeom = new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const hairColors = [0x3a2a1a, 0x6a4a2a, 0x2a1a0a, 0x8a6a4a, 0x1a1a2a];
        const hairMat = new THREE.MeshLambertMaterial({ 
            color: hairColors[employee.index % hairColors.length] 
        });
        const hair = new THREE.Mesh(hairGeom, hairMat);
        hair.position.y = 1.28;
        hair.rotation.x = Math.PI;
        group.add(hair);
        
        // Legs
        const legGeom = new THREE.BoxGeometry(0.12, 0.5, 0.12);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a5a });
        const leftLeg = new THREE.Mesh(legGeom, legMat);
        leftLeg.position.set(-0.1, 0.25, 0);
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeom, legMat);
        rightLeg.position.set(0.1, 0.25, 0);
        group.add(rightLeg);
        
        // Sanity indicator (floating bar above head)
        const indicatorGroup = new THREE.Group();
        
        const bgGeom = new THREE.PlaneGeometry(0.5, 0.08);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const bg = new THREE.Mesh(bgGeom, bgMat);
        indicatorGroup.add(bg);
        
        const fillGeom = new THREE.PlaneGeometry(0.48, 0.06);
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
        const fill = new THREE.Mesh(fillGeom, fillMat);
        fill.position.z = 0.001;
        indicatorGroup.add(fill);
        group.sanityFill = fill;
        group.sanityMat = fillMat;
        
        indicatorGroup.position.y = 1.6;
        group.add(indicatorGroup);
        group.indicator = indicatorGroup;
        
        this.scene.add(group);
        this.employeeMeshes.set(employee.index, group);
        
        return group;
    }
    
    createManager(manager) {
        const group = new THREE.Group();
        
        // Body (suit)
        const bodyGeom = new THREE.BoxGeometry(0.5, 0.7, 0.3);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a3a5a });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.85;
        body.castShadow = true;
        group.add(body);
        
        // Tie
        const tieGeom = new THREE.BoxGeometry(0.08, 0.4, 0.05);
        const tieMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
        const tie = new THREE.Mesh(tieGeom, tieMat);
        tie.position.set(0, 0.8, 0.15);
        group.add(tie);
        
        // Head
        const headGeom = new THREE.SphereGeometry(0.18);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xe8c8a8 });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 1.35;
        head.castShadow = true;
        group.add(head);
        
        // Hair (slicked back)
        const hairGeom = new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const hairMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
        const hair = new THREE.Mesh(hairGeom, hairMat);
        hair.position.y = 1.38;
        hair.rotation.x = Math.PI;
        group.add(hair);
        
        // Legs
        const legGeom = new THREE.BoxGeometry(0.14, 0.5, 0.14);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
        const leftLeg = new THREE.Mesh(legGeom, legMat);
        leftLeg.position.set(-0.12, 0.25, 0);
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeom, legMat);
        rightLeg.position.set(0.12, 0.25, 0);
        group.add(rightLeg);
        
        // Proximity aura
        const auraGeom = new THREE.RingGeometry(3, 3.1, 32);
        const auraMat = new THREE.MeshBasicMaterial({ 
            color: 0xef4444, 
            transparent: true, 
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const aura = new THREE.Mesh(auraGeom, auraMat);
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.05;
        group.add(aura);
        group.aura = aura;
        
        this.scene.add(group);
        this.managerMesh = group;
        
        return group;
    }
    
    getEmployeeColor(employee) {
        const colors = CONFIG.employee.colors;
        
        if (employee.sanity >= CONFIG.employee.sanityCriticalThreshold) {
            return new THREE.Color(colors.critical).getHex();
        } else if (employee.state === EMPLOYEE_STATE.FEARFUL) {
            return new THREE.Color(colors.fearful).getHex();
        } else if (employee.state === EMPLOYEE_STATE.ON_COFFEE_BREAK || 
                   employee.state === EMPLOYEE_STATE.ON_BATHROOM_BREAK) {
            return new THREE.Color(colors.onBreak).getHex();
        } else if (employee.needsBathroom) {
            return new THREE.Color(colors.needsBathroom).getHex();
        } else if (employee.needsCoffee) {
            return new THREE.Color(colors.needsCoffee).getHex();
        }
        return new THREE.Color(colors.working).getHex();
    }
    
    updateEmployee(employee) {
        const mesh = this.employeeMeshes.get(employee.index);
        if (!mesh) return;
        
        // Convert game coordinates to 3D position
        const x = employee.x / CONFIG.office.gridSize;
        const z = employee.y / CONFIG.office.gridSize;
        
        mesh.position.x = x;
        mesh.position.z = z;
        
        // Update color based on state
        const color = this.getEmployeeColor(employee);
        mesh.bodyMesh.material.color.setHex(color);
        
        // Update sanity bar
        const sanityPercent = employee.sanity / 100;
        mesh.sanityFill.scale.x = sanityPercent;
        mesh.sanityFill.position.x = (sanityPercent - 1) * 0.24;
        
        // Color sanity bar
        const hue = (1 - sanityPercent) * 0.33; // Green to red
        mesh.sanityMat.color.setHSL(hue, 0.8, 0.5);
        
        // Make indicator face camera
        mesh.indicator.lookAt(this.camera.position);
    }
    
    updateManager(manager) {
        if (!this.managerMesh) return;
        
        // Convert game coordinates to 3D position
        const x = manager.x / CONFIG.office.gridSize;
        const z = manager.y / CONFIG.office.gridSize;
        
        this.managerMesh.position.x = x;
        this.managerMesh.position.z = z;
        
        // Pulse the aura
        const pulse = Math.sin(Date.now() / 200) * 0.1 + 0.9;
        this.managerMesh.aura.material.opacity = 0.2 * pulse;
    }
    
    updateCamera(manager) {
        // Follow manager with smooth camera
        const targetX = manager.x / CONFIG.office.gridSize;
        const targetZ = manager.y / CONFIG.office.gridSize;
        
        // Smooth camera follow
        const cameraTargetX = targetX + 10;
        const cameraTargetZ = targetZ + 20;
        
        this.camera.position.x += (cameraTargetX - this.camera.position.x) * 0.05;
        this.camera.position.z += (cameraTargetZ - this.camera.position.z) * 0.05;
        
        this.camera.lookAt(targetX, 0, targetZ);
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.width = window.innerWidth - 250;
        this.height = window.innerHeight - 90;
        
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }
    
    dispose() {
        // Clean up Three.js resources
        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}
