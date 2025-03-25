// WebSocket connection
let ws;
let playerId = null;
let isRacing = false;

// Three.js variables
let scene, camera, renderer;
let track, cars = [];
let finishLine;
let trackWidth = 100;
let trackLength = 2000;
let trackWalls = [];

// Game state
let gameState = 'menu'; // 'menu', 'waiting', 'countdown', 'racing', 'finished'

// Input handling
const keys = { up: false, down: false, left: false, right: false };
let inputs = { accelerate: 0, steer: 0 };

// DOM elements
const menuElement = document.getElementById('menu');
const gameElement = document.getElementById('game');
const countdownElement = document.getElementById('countdown');
const winnerElement = document.getElementById('winner');
const startButton = document.getElementById('startBtn');
const joinButton = document.getElementById('joinBtn');
const codeInput = document.getElementById('codeInput');

// Game UI elements
let speedometer;
let distanceIndicator;

// Initialize the game
function init() {
    initThreeJs();
    initGameUI();
    initEvents();
    
    // Resize handler
    window.addEventListener('resize', onWindowResize, false);
    
    // Start animation loop
    animate();
}

// Initialize Three.js scene
function initThreeJs() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 500, 2000); // Add fog for depth
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 30, -30);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('canvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Create track
    createTrack();
    
    // Create cars
    createCars();
    
    // Create environment
    createEnvironment();
}

// Create the race track
function createTrack() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(trackWidth, trackLength);
    const groundTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(10, 100);
    
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333, // Dark gray for asphalt
        roughness: 0.8,
        metalness: 0.2,
        map: groundTexture
    });
    
    track = new THREE.Mesh(groundGeometry, groundMaterial);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0, trackLength/2);
    track.receiveShadow = true;
    scene.add(track);
    
    // Road markings
    const centerLineGeometry = new THREE.PlaneGeometry(2, trackLength);
    const centerLineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.01, trackLength/2);
    scene.add(centerLine);
    
    // Add dashed lines
    for (let i = 0; i < 20; i++) {
        const dashGeometry = new THREE.PlaneGeometry(1, 20);
        const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const leftDash = new THREE.Mesh(dashGeometry, dashMaterial);
        leftDash.rotation.x = -Math.PI / 2;
        leftDash.position.set(-25, 0.01, i * 100 + 50);
        scene.add(leftDash);
        
        const rightDash = new THREE.Mesh(dashGeometry, dashMaterial);
        rightDash.rotation.x = -Math.PI / 2;
        rightDash.position.set(25, 0.01, i * 100 + 50);
        scene.add(rightDash);
    }
    
    // Side walls with collision detection
    const wallGeometry = new THREE.BoxGeometry(5, 5, trackLength);
    const wallTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(100, 1);
    
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xF0F0F0,
        map: wallTexture,
        roughness: 0.7
    });
    
    // Left wall
    const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
    leftWall.position.set(-trackWidth/2 - 2.5, 2.5, trackLength/2);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);
    trackWalls.push({
        mesh: leftWall,
        bounds: {
            minX: leftWall.position.x - 2.5,
            maxX: leftWall.position.x + 2.5,
            minZ: leftWall.position.z - trackLength/2,
            maxZ: leftWall.position.z + trackLength/2
        }
    });
    
    // Right wall
    const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
    rightWall.position.set(trackWidth/2 + 2.5, 2.5, trackLength/2);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);
    trackWalls.push({
        mesh: rightWall,
        bounds: {
            minX: rightWall.position.x - 2.5,
            maxX: rightWall.position.x + 2.5,
            minZ: rightWall.position.z - trackLength/2,
            maxZ: rightWall.position.z + trackLength/2
        }
    });
    
    // Finish line
    const finishGeometry = new THREE.PlaneGeometry(trackWidth, 10);
    const finishMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFFFFFF,
        side: THREE.DoubleSide
    });
    finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.02, trackLength);
    scene.add(finishLine);
    
    // Add checkerboard pattern to finish line
    const numCheckers = 10;
    const checkerSize = trackWidth / numCheckers;
    for (let i = 0; i < numCheckers; i++) {
        if (i % 2 === 0) continue; // Skip every other column
        
        const checkerGeometry = new THREE.PlaneGeometry(checkerSize, 10);
        const checkerMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const checker = new THREE.Mesh(checkerGeometry, checkerMaterial);
        checker.rotation.x = -Math.PI / 2;
        checker.position.set(-trackWidth/2 + i * checkerSize + checkerSize/2, 0.03, trackLength);
        scene.add(checker);
    }
}

// Create player cars
function createCars() {
    const carColors = [0xFF0000, 0x0000FF]; // Red and blue
    
    for (let i = 0; i < 2; i++) {
        // Car body
        const carGeometry = new THREE.BoxGeometry(4, 2, 8);
        const carMaterial = new THREE.MeshStandardMaterial({ 
            color: carColors[i],
            metalness: 0.7,
            roughness: 0.3
        });
        const car = new THREE.Mesh(carGeometry, carMaterial);
        
        // Important: Set initial direction correctly (facing forward along the track)
        car.position.set(i === 0 ? -15 : 15, 1, 20);
        car.rotation.y = 0; // Face along positive Z (toward finish line)
        car.castShadow = true;
        scene.add(car);
        
        // Add car roof
        const roofGeometry = new THREE.BoxGeometry(3.5, 1, 5);
        const roofMaterial = new THREE.MeshStandardMaterial({ 
            color: carColors[i],
            metalness: 0.6,
            roughness: 0.4
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, 1.5, 0);
        roof.castShadow = true;
        car.add(roof);
        
        // Add windshield
        const windshieldGeometry = new THREE.PlaneGeometry(3.5, 1.5);
        const windshieldMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333, 
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        windshield.position.set(0, 1.25, 2.5);
        car.add(windshield);
        
        // Headlights
        const headlightGeometry = new THREE.CircleGeometry(0.5, 16);
        const headlightMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xFFFFFF,
            emissive: 0xFFFF00,
            emissiveIntensity: 0.5
        });
        
        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.position.set(-1.5, 0.5, 4);
        leftHeadlight.rotation.y = Math.PI;
        car.add(leftHeadlight);
        
        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        rightHeadlight.position.set(1.5, 0.5, 4);
        rightHeadlight.rotation.y = Math.PI;
        car.add(rightHeadlight);
        
        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        
        const wheelPositions = [
            { x: -2, y: 0, z: -2 },
            { x: 2, y: 0, z: -2 },
            { x: -2, y: 0, z: 2 },
            { x: 2, y: 0, z: 2 }
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(pos.x, pos.y, pos.z);
            wheel.rotation.z = Math.PI / 2;
            car.add(wheel);
        });
        
        // Add car properties for physics
        car.userData = {
            velocity: 0,
            acceleration: 0,
            steering: 0,
            width: 4,
            length: 8,
            mass: 1000,
            colliding: false
        };
        
        // Add to cars array
        cars.push(car);
    }
}

// Create environment elements
function createEnvironment() {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light (sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;
    scene.add(directionalLight);
    
    // Add trees and scenery
    addScenery();
    
    // Add mountains in the background
    addMountains();
}

// Add trees and other scenery
function addScenery() {
    // Create trees along the track
    for (let i = 0; i < 50; i++) {
        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(1, 1.5, 8, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        
        // Tree foliage
        const foliageGeometry = new THREE.ConeGeometry(5, 10, 8);
        const foliageMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x2E8B57,
            roughness: 0.8 
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 9;
        
        // Tree group
        const tree = new THREE.Group();
        tree.add(trunk);
        tree.add(foliage);
        
        // Position trees randomly on either side of the track
        const side = Math.random() > 0.5 ? 1 : -1;
        const distance = 60 + Math.random() * 40; // Distance from track center
        const zPos = Math.random() * trackLength;
        
        tree.position.set(side * distance, 0, zPos);
        scene.add(tree);
    }
}

// Add mountains in the background
function addMountains() {
    const mountainGeometry = new THREE.ConeGeometry(200, 300, 4);
    const mountainMaterial = new THREE.MeshStandardMaterial({color: 0x888888,
        roughness: 1.0,
        flatShading: true
    });
    
    // Create several mountains in the background, only on the sides
    for (let i = 0; i < 10; i++) {
        const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
        const scale = 0.5 + Math.random() * 1.5;
        mountain.scale.set(scale, scale, scale);
        
        // Position mountains only on the sides
        const side = i % 2 === 0 ? -1 : 1; // Alternate left and right sides
        const distance = 700 + Math.random() * 300;
        const zOffset = Math.random() * trackLength; // Random position along track length
        
        mountain.position.x = side * distance;
        mountain.position.z = zOffset;
        mountain.position.y = -50 + Math.random() * 20;
        mountain.rotation.y = Math.random() * Math.PI * 2;
        
        scene.add(mountain);
    }
}

// Initialize game UI elements
function initGameUI() {
    // Create speedometer and distance indicator container
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.right = '10px';
    uiContainer.style.padding = '10px';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    uiContainer.style.color = 'white';
    uiContainer.style.borderRadius = '5px';
    uiContainer.style.display = 'none';
    uiContainer.style.zIndex = '100';
    uiContainer.id = 'gameUI';
    document.body.appendChild(uiContainer);
    
    // Create speedometer
    speedometer = document.createElement('div');
    speedometer.innerHTML = 'Speed: 0 km/h';
    speedometer.style.marginBottom = '5px';
    speedometer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.appendChild(speedometer);
    
    // Create distance indicator
    distanceIndicator = document.createElement('div');
    distanceIndicator.innerHTML = 'Distance to finish: 2000m';
    distanceIndicator.style.fontFamily = 'Arial, sans-serif';
    uiContainer.appendChild(distanceIndicator);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize event listeners
function initEvents() {
    // Button event listeners
    startButton.addEventListener('click', startGame);
    joinButton.addEventListener('click', joinGame);
    
    // Keyboard events
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
}

// Start new game
function startGame() {
    // Connect to WebSocket server
    connectToServer();
    
    // Send start request
    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ action: 'start' }));
    });
}

// Join existing game
function joinGame() {
    const code = codeInput.value.trim();
    if (code.length !== 4 || isNaN(parseInt(code))) {
        alert('Please enter a valid 4-digit code');
        return;
    }
    
    // Connect to WebSocket server
    connectToServer();
    
    // Send join request
    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ action: 'join', code }));
    });
}

// Connect to WebSocket server
function connectToServer() {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    // WebSocket message handler
    ws.addEventListener('message', handleWebSocketMessage);
    
    // WebSocket error handler
    ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        alert('Connection error. Please try again later.');
    });
    
    // WebSocket close handler
    ws.addEventListener('close', () => {
        if (gameState !== 'menu') {
            alert('Connection closed. Returning to menu.');
            resetGame();
        }
    });
}

// Handle WebSocket messages
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        
        switch (data.action) {
            case 'code':
                // Display the room code
                playerId = 0;
                gameState = 'waiting';
                menuElement.style.display = 'none';
                gameElement.style.display = 'block';
                countdownElement.textContent = `Waiting for opponent. Share this code: ${data.code}`;
                countdownElement.style.display = 'block';
                break;
                
            case 'joined':
                // Game joined, store player ID
                playerId = data.playerId;
                gameState = 'countdown';
                menuElement.style.display = 'none';
                gameElement.style.display = 'block';
                countdownElement.style.display = 'block';
                break;
                
            case 'countdown':
                // Update countdown display
                countdownElement.textContent = `Race starts in ${data.time}...`;
                break;
                
            case 'start':
                // Start the race
                gameState = 'racing';
                isRacing = true;
                countdownElement.textContent = 'GO!';
                document.getElementById('gameUI').style.display = 'block';
                setTimeout(() => {
                    countdownElement.style.display = 'none';
                }, 1000);
                break;
                
                case 'update':
                    // Update car positions
                    if (gameState === 'racing') {
                        data.cars.forEach((carData, index) => {
                            cars[index].position.x = carData.position.x;
                            cars[index].position.y = carData.position.y || 1; // Default height if not specified
                            cars[index].position.z = carData.position.z;
                            cars[index].rotation.y = carData.rotation;
                            
                            // Update car physics properties
                            cars[index].userData.velocity = carData.velocity;
                            cars[index].userData.acceleration = carData.acceleration || 0;
                            cars[index].userData.steering = carData.steering || 0;
                            cars[index].userData.colliding = carData.colliding || false;
                            
                            // Make the wheels rotate based on velocity for visual feedback
                            if (cars[index].children) {
                                cars[index].children.forEach(child => {
                                    // Check if this child is a wheel by its position
                                    // In your car model, wheels are positioned at y=0
                                    if (child.position.y === 0 && Math.abs(child.position.x) > 1) { // Likely a wheel
                                        child.rotation.x += carData.velocity * 0.01; // Rotate wheels proportionally to speed
                                    }
                                });
                            }
                            
                            // Update UI for player's car
                            if (index === playerId) {
                                // Update speedometer (convert to km/h)
                                const speedKmh = Math.round(carData.velocity * 3.6);
                                speedometer.innerHTML = `Speed: ${speedKmh} km/h`;
                                
                                // Update distance indicator
                                const distanceToFinish = Math.round(trackLength - carData.position.z);
                                distanceIndicator.innerHTML = `Distance to finish: ${distanceToFinish}m`;
                            }
                        });
                    }
                    break;
                
            case 'finish':
                // Display winner
                gameState = 'finished';
                isRacing = false;
                document.getElementById('gameUI').style.display = 'none';
                winnerElement.textContent = `Player ${data.winner + 1} wins!`;
                winnerElement.style.display = 'block';
                
                // Add reset button
                const resetButton = document.createElement('button');
                resetButton.textContent = 'Return to Menu';
                resetButton.style.marginTop = '10px';
                resetButton.addEventListener('click', resetGame);
                winnerElement.appendChild(resetButton);
                break;
                
            case 'error':
                // Display error message
                alert(data.message);
                break;
                
            case 'playerDisconnected':
                // Handle player disconnection
                alert('The other player disconnected.');
                if (gameState !== 'finished') {
                    gameState = 'finished';
                    isRacing = false;
                    document.getElementById('gameUI').style.display = 'none';
                    winnerElement.textContent = 'You win by default!';
                    winnerElement.style.display = 'block';
                    
                    // Add reset button
                    const resetButton = document.createElement('button');
                    resetButton.textContent = 'Return to Menu';
                    resetButton.style.marginTop = '10px';
                    resetButton.addEventListener('click', resetGame);
                    winnerElement.appendChild(resetButton);
                }
                break;
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

// Handle keyboard input (keydown)
function handleKeyDown(event) {
    if (!isRacing) return;
    
    const keyHandlers = {
        'ArrowUp': () => { keys.up = true; },
        'KeyW': () => { keys.up = true; },
        'ArrowDown': () => { keys.down = true; },
        'KeyS': () => { keys.down = true; },
        'ArrowLeft': () => { keys.left = true; },
        'KeyA': () => { keys.left = true; },
        'ArrowRight': () => { keys.right = true; },
        'KeyD': () => { keys.right = true; }
    };
    
    if (keyHandlers[event.code]) {
        keyHandlers[event.code]();
        sendInputUpdate();
        event.preventDefault(); // Prevent page scrolling
    }
}

// Handle keyboard input (keyup)
function handleKeyUp(event) {
    if (!isRacing) return;
    
    const keyHandlers = {
        'ArrowUp': () => { keys.up = false; },
        'KeyW': () => { keys.up = false; },
        'ArrowDown': () => { keys.down = false; },
        'KeyS': () => { keys.down = false; },
        'ArrowLeft': () => { keys.left = false; },
        'KeyA': () => { keys.left = false; },
        'ArrowRight': () => { keys.right = false; },
        'KeyD': () => { keys.right = false; }
    };
    
    if (keyHandlers[event.code]) {
        keyHandlers[event.code]();
        sendInputUpdate();
    }
}

// Send input update to server
function sendInputUpdate() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const accelerate = keys.up ? 1 : keys.down ? -1 : 0;
    const steer = keys.left ? 1 : keys.right ? -1 : 0;
    
    // Only send if inputs changed
    if (inputs.accelerate !== accelerate || inputs.steer !== steer) {
        inputs.accelerate = accelerate;
        inputs.steer = steer;
        
        ws.send(JSON.stringify({
            action: 'input',
            accelerate: accelerate,
            steer: steer
        }));
    }
}

// Reset game state
function resetGame() {
    // Close WebSocket connection
    if (ws) {
        ws.close();
    }
    
    // Reset variables
    playerId = null;
    isRacing = false;
    gameState = 'menu';
    
    // Reset UI
    menuElement.style.display = 'block';
    gameElement.style.display = 'none';
    countdownElement.style.display = 'none';
    winnerElement.style.display = 'none';
    winnerElement.innerHTML = '';
    document.getElementById('gameUI').style.display = 'none';
    
    // Reset car positions
    cars[0].position.set(-15, 1, 20);
    cars[0].rotation.y = 0;
    cars[1].position.set(15, 1, 20);
    cars[1].rotation.y = 0;
    
    // Reset inputs
    Object.keys(keys).forEach(key => keys[key] = false);
    inputs = { accelerate: 0, steer: 0 };
    
    // Reset camera
    camera.position.set(0, 30, -30);
    camera.lookAt(0, 0, 0);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update camera position if racing
    if (isRacing && playerId !== null) {
        const car = cars[playerId];
        
        // Position camera behind player's car
        const distance = 30;  // Camera distance
        const height = 15;    // Camera height
        const lookAheadDistance = 20; // Look ahead distance
        
        // Calculate camera position - always behind the car regardless of car rotation
        camera.position.x = car.position.x - Math.sin(car.rotation.y) * distance;
        camera.position.y = car.position.y + height;
        camera.position.z = car.position.z - Math.cos(car.rotation.y) * distance;
        
        // Calculate look-at point - slightly ahead of the car
        const lookAtX = car.position.x + Math.sin(car.rotation.y) * lookAheadDistance;
        const lookAtZ = car.position.z + Math.cos(car.rotation.y) * lookAheadDistance;
        
        camera.lookAt(lookAtX, car.position.y + 2, lookAtZ);
        
        // Apply visual effects for collisions
        if (car.userData.colliding) {
            // Add a subtle red tint to the renderer when colliding
            renderer.setClearColor(0xFF0000, 0.1);
        } else {
            renderer.setClearColor(scene.background);
        }
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Initialize the game when the page loads
window.addEventListener('load', init);