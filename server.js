const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Create Express app
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Game constants
const TRACK_LENGTH = 2000;
const TRACK_WIDTH = 100;
const WALL_BOUNDARY = TRACK_WIDTH / 2 - 5; // Slightly inside the visual walls
const ACCELERATION = 60;
const DECELERATION = 40;
const BRAKE_DECELERATION = 80;
const MAX_SPEED = 120;
const MIN_SPEED = -30; // Max reverse speed
const STEER_SPEED = 2.5;
const FRICTION = 0.97; // Friction coefficient
const COLLISION_BOUNCE = 0.5; // How much to bounce on collision
const CAR_WIDTH = 4;
const CAR_LENGTH = 8;
const COUNTDOWN_TIME = 3;
const TICK_RATE = 60; // Hz
const TICK_INTERVAL = 1000 / TICK_RATE;

// Game rooms
const rooms = {};

// Generate a unique 4-digit code
function generateCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

// Check if two cars are colliding
function checkCarCollision(car1, car2) {
  // Calculate the distance between the centers of the cars
  const dx = car1.position.x - car2.position.x;
  const dz = car1.position.z - car2.position.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  // Simple collision detection based on minimum distance
  const minDistance = (CAR_WIDTH + CAR_LENGTH) / 2; // Average of car dimensions
  
  return distance < minDistance;
}

// Handle a collision between two cars
function handleCarCollision(car1, car2) {
  // Vector from car2 to car1
  const dx = car1.position.x - car2.position.x;
  const dz = car1.position.z - car2.position.z;
  
  // Normalize the vector
  const length = Math.sqrt(dx * dx + dz * dz);
  const nx = dx / length;
  const nz = dz / length;
  
  // Calculate the relative velocity in the direction of the collision
  const v1 = car1.velocity;
  const v2 = car2.velocity;
  
  // Simplified physics - transfer some momentum and create bounce effect
  car1.velocity = v1 * (1 - COLLISION_BOUNCE) + v2 * COLLISION_BOUNCE;
  car2.velocity = v2 * (1 - COLLISION_BOUNCE) + v1 * COLLISION_BOUNCE;
  
  // Push cars apart to prevent sticking
  const pushDistance = 0.5; // Units to push apart
  car1.position.x += nx * pushDistance;
  car1.position.z += nz * pushDistance;
  car2.position.x -= nx * pushDistance;
  car2.position.z -= nz * pushDistance;
  
  // Mark cars as colliding for visual effects
  car1.colliding = true;
  car2.colliding = true;
  
  // Reset collision state after a short time
  setTimeout(() => {
    car1.colliding = false;
    car2.colliding = false;
  }, 300);
}

// Check if car hit a wall boundary and prevent it from going out of bounds
function checkWallCollision(car) {
  let collided = false;
  
  // Check left and right walls
  if (car.position.x < -WALL_BOUNDARY) {
    car.position.x = -WALL_BOUNDARY;
    car.velocity *= 0.5; // Reduce speed on collision
    collided = true;
  } else if (car.position.x > WALL_BOUNDARY) {
    car.position.x = WALL_BOUNDARY;
    car.velocity *= 0.5; // Reduce speed on collision
    collided = true;
  }
  
  // Check start and end boundaries
  if (car.position.z < 0) {
    car.position.z = 0;
    car.velocity *= 0.5;
    collided = true;
  } else if (car.position.z > TRACK_LENGTH) {
    car.position.z = TRACK_LENGTH;
    car.velocity *= 0.5;
    collided = true;
  }
  
  if (collided && !car.colliding) {
    car.colliding = true;
    setTimeout(() => {
      car.colliding = false;
    }, 300);
  }
  
  return collided;
}

// Update car physics
function updateCar(car, dt) {
  // Apply acceleration based on input
  if (car.accelerate > 0) {
    // Forward acceleration
    car.velocity += ACCELERATION * car.accelerate * dt;
  } else if (car.accelerate < 0) {
    // Braking or reversing
    if (car.velocity > 0) {
      // Braking
      car.velocity += BRAKE_DECELERATION * car.accelerate * dt;
    } else {
      // Reversing
      car.velocity += DECELERATION * car.accelerate * dt;
    }
  } else {
    // Natural deceleration when no input
    if (Math.abs(car.velocity) < 1) {
      car.velocity = 0;
    } else if (car.velocity > 0) {
      car.velocity -= DECELERATION * dt;
    } else {
      car.velocity += DECELERATION * dt;
    }
  }
  
  // Apply friction
  car.velocity *= FRICTION;
  
  // Clamp velocity
  if (car.velocity > MAX_SPEED) car.velocity = MAX_SPEED;
  if (car.velocity < MIN_SPEED) car.velocity = MIN_SPEED;
  
  // Apply steering - only changes car direction, not camera
  if (car.steer !== 0) {
    // Steering effectiveness depends on speed
    const steerFactor = Math.min(1.0, Math.abs(car.velocity) / 30);
    car.rotation += car.steer * STEER_SPEED * steerFactor * dt;
  }
  
  // Update position based on velocity and rotation
  car.position.x += Math.sin(car.rotation) * car.velocity * dt;
  car.position.z += Math.cos(car.rotation) * car.velocity * dt;
  
  // Check wall collisions
  checkWallCollision(car);
  
  // Check if car has finished the race
  if (car.position.z >= TRACK_LENGTH && !car.finished) {
    car.finished = true;
    return true; // Race finished
  }
  
  return false; // Race continues
}

// Create a new game room
function createRoom() {
  const code = generateCode();
  
  const room = {
    code,
    players: [],
    cars: [
      {
        position: { x: -15, y: 1, z: 20 },
        rotation: 0,
        velocity: 0,
        accelerate: 0,
        steer: 0,
        colliding: false,
        finished: false
      },
      {
        position: { x: 15, y: 1, z: 20 },
        rotation: 0,
        velocity: 0,
        accelerate: 0,
        steer: 0,
        colliding: false,
        finished: false
      }
    ],
    state: 'waiting', // 'waiting', 'countdown', 'racing', 'finished'
    countdownTimer: null,
    gameTimer: null,
    winner: null
  };
  
  rooms[code] = room;
  return room;
}

// Start countdown for a room
function startCountdown(room) {
  let countdown = COUNTDOWN_TIME;
  room.state = 'countdown';
  
  // Broadcast countdown to all players
  broadcastToRoom(room, {
    action: 'countdown',
    time: countdown
  });
  
  room.countdownTimer = setInterval(() => {
    countdown--;
    
    if (countdown > 0) {
      broadcastToRoom(room, {
        action: 'countdown',
        time: countdown
      });
    } else {
      clearInterval(room.countdownTimer);
      startRace(room);
    }
  }, 1000);
}

// Start the race
function startRace(room) {
  room.state = 'racing';
  
  // Reset cars to starting position and ensure they face the right direction
  room.cars[0].position = { x: -15, y: 1, z: 20 };
  room.cars[0].rotation = 0; // Face forward down the track (positive Z)
  room.cars[0].velocity = 0;
  room.cars[0].finished = false;
  
  room.cars[1].position = { x: 15, y: 1, z: 20 };
  room.cars[1].rotation = 0; // Face forward down the track (positive Z)
  room.cars[1].velocity = 0;
  room.cars[1].finished = false;
  
  // Broadcast race start
  broadcastToRoom(room, {
    action: 'start'
  });
  
  // Start game loop
  const tickTime = 1 / TICK_RATE;
  let lastTime = Date.now();
  
  room.gameTimer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap delta time
    lastTime = now;
    
    // Update car physics
    let raceFinished = false;
    for (let i = 0; i < room.cars.length; i++) {
      if (updateCar(room.cars[i], dt)) {
        // Car has finished the race
        if (room.winner === null) {
          room.winner = i;
        }
        raceFinished = true;
      }
    }
    
    // Check for collisions between cars
    if (checkCarCollision(room.cars[0], room.cars[1])) {
      handleCarCollision(room.cars[0], room.cars[1]);
    }
    
    // Send update to all players
    broadcastToRoom(room, {
      action: 'update',
      cars: room.cars.map(car => ({
        position: car.position,
        rotation: car.rotation,
        velocity: car.velocity,
        colliding: car.colliding
      }))
    });
    
    // Check if race is finished
    if (raceFinished && room.state === 'racing') {
      endRace(room);
    }
  }, TICK_INTERVAL);
}

// End the race
function endRace(room) {
  room.state = 'finished';
  clearInterval(room.gameTimer);
  
  // Broadcast winner
  broadcastToRoom(room, {
    action: 'finish',
    winner: room.winner
  });
  
  // Clean up room after a delay
  setTimeout(() => {
    // Check if players are still connected before deleting room
    const playersConnected = room.players.some(p => p.readyState === WebSocket.OPEN);
    if (!playersConnected && rooms[room.code]) {
      delete rooms[room.code];
    }
  }, 60000); // Clean up after 1 minute
}

// Broadcast message to all players in a room
function broadcastToRoom(room, message) {
  const messageString = JSON.stringify(message);
  room.players.forEach(player => {
    if (player.readyState === WebSocket.OPEN) {
      player.send(messageString);
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.action) {
        case 'start':
          // Create a new room
          currentRoom = createRoom();
          playerId = 0; // First player is always player 0
          currentRoom.players[playerId] = ws;
          
          // Send room code to first player
          ws.send(JSON.stringify({
            action: 'code',
            code: currentRoom.code
          }));
          break;
          
        case 'join':
          // Join an existing room
          const room = rooms[data.code];
          if (!room) {
            ws.send(JSON.stringify({
              action: 'error',
              message: 'Room not found'
            }));
            return;
          }
          
          if (room.state !== 'waiting') {
            ws.send(JSON.stringify({
              action: 'error',
              message: 'Game already started'
            }));
            return;
          }
          
          if (room.players.length >= 2) {
            ws.send(JSON.stringify({
              action: 'error',
              message: 'Room is full'
            }));
            return;
          }
          
          // Join as second player
          currentRoom = room;
          playerId = 1;
          currentRoom.players[playerId] = ws;
          
          // Send joined message to new player
          ws.send(JSON.stringify({
            action: 'joined',
            playerId
          }));
          
          // Start the countdown
          startCountdown(currentRoom);
          break;
          
        case 'input':
          // Update player input
          if (!currentRoom || playerId === null || currentRoom.state !== 'racing') {
            return;
          }
          
          currentRoom.cars[playerId].accelerate = data.accelerate;
          currentRoom.cars[playerId].steer = data.steer;
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  ws.on('close', () => {
    // Handle player disconnect
    if (currentRoom && playerId !== null) {
      // Notify other player if they're still connected
      const otherPlayerId = 1 - playerId;
      const otherPlayer = currentRoom.players[otherPlayerId];
      
      if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) {
        otherPlayer.send(JSON.stringify({
          action: 'playerDisconnected'
        }));
      }
      
      // Clean up timers if no players left
      if (currentRoom.players.every(p => !p || p.readyState !== WebSocket.OPEN)) {
        if (currentRoom.countdownTimer) {
          clearInterval(currentRoom.countdownTimer);
        }
        if (currentRoom.gameTimer) {
          clearInterval(currentRoom.gameTimer);
        }
        
        // Remove room after a delay
        setTimeout(() => {
          if (rooms[currentRoom.code]) {
            delete rooms[currentRoom.code];
          }
        }, 10000);
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});