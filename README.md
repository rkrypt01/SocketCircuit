# SocketCircuit - Multiplayer Car Racing Game

A simple real-time 3D car racing game built with Three.js and WebSockets.

**[Live Demo](https://socketcircuit.onrender.com)** - Try it out now!

![image](https://github.com/user-attachments/assets/c9fc19ba-741e-4412-aee9-393cb75d2888)


## Features

- Two-player multiplayer racing via WebSockets
- Easy connection with 4-digit room codes
- 2km straight track rendered in Three.js
- Real-time position synchronization

## Installation

```bash
# Clone repository
git clone https://github.com/rkrypt01
cd SocketCircuit

# Install dependencies
npm install

# Start server
npm start
```

Open `http://localhost:3000` in your browser.

## How to Play

1. **Start Race**: Click "Start New Race" and share the 4-digit code
2. **Join Race**: Enter code and click "Join Race"
3. **Controls**: WASD or Arrow keys
4. First player to finish the 2km track wins

## Technology

- Three.js for 3D rendering
- WebSockets for real-time multiplayer
- Node.js/Express backend
