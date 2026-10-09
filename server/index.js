const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Helper to determine primary local network IPv4 address
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalNetworkIp();

// Serve static files from client/public directory
const publicDir = path.join(__dirname, '../client/public');
app.use(express.static(publicDir));

// Route handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/controller', (req, res) => {
  res.sendFile(path.join(publicDir, 'controller.html'));
});

// System info endpoint (for LAN IP detection and controller links)
app.get('/api/info', (req, res) => {
  res.json({
    localIp: LOCAL_IP,
    port: PORT,
    controllerUrl: `http://${LOCAL_IP}:${PORT}/controller`
  });
});

/* ==========================================================================
   GAME STATE & ROOM MANAGEMENT
   ========================================================================== */

// Player themes and colors
const PLAYER_SLOTS = [
  { slot: 0, color: '#00f0ff', colorName: 'Cyan', name: 'Cyber Blue', carSkin: 'cyber-cyan' },
  { slot: 1, color: '#ff0077', colorName: 'Pink', name: 'Neon Ruby', carSkin: 'neon-ruby' },
  { slot: 2, color: '#00ff66', colorName: 'Lime', name: 'Toxic Lime', carSkin: 'toxic-lime' },
  { slot: 3, color: '#ffb700', colorName: 'Amber', name: 'Solar Gold', carSkin: 'solar-gold' }
];
const PLAYER_COLORS = PLAYER_SLOTS.map(s => s.color);

// Active rooms map: roomCode -> room object
const rooms = new Map();

// Generate unique 6-character room code (avoid ambiguous chars)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

// Generate random arithmetic puzzle question
function generateMathPuzzle(difficulty = 1) {
  const operations = ['+', '-', '*'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  let num1, num2, answer;

  if (op === '+') {
    num1 = Math.floor(Math.random() * 50) + 10;
    num2 = Math.floor(Math.random() * 50) + 10;
    answer = num1 + num2;
  } else if (op === '-') {
    num1 = Math.floor(Math.random() * 60) + 25;
    num2 = Math.floor(Math.random() * (num1 - 5)) + 5;
    answer = num1 - num2;
  } else {
    // Multiplication: single digit or small double digits
    num1 = Math.floor(Math.random() * 11) + 2;
    num2 = Math.floor(Math.random() * 12) + 2;
    answer = num1 * num2;
  }

  // Generate 3 unique plausible distractors
  const distractors = new Set();
  const variations = [-10, 10, -2, 2, -1, 1, -5, 5, -12, 12];

  for (const v of variations) {
    const fake = answer + v;
    if (fake > 0 && fake !== answer) {
      distractors.add(fake);
      if (distractors.size === 3) break;
    }
  }

  while (distractors.size < 3) {
    const fake = Math.max(1, answer + Math.floor(Math.random() * 20) - 10);
    if (fake !== answer) distractors.add(fake);
  }

  const allAnswers = [answer, ...Array.from(distractors)];
  // Shuffle options
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  const labels = ['A', 'B', 'C', 'D'];
  const options = {};
  let correctKey = 'A';

  labels.forEach((label, idx) => {
    options[label] = allAnswers[idx];
    if (allAnswers[idx] === answer) {
      correctKey = label;
    }
  });

  return {
    questionText: `${num1} ${op === '*' ? '×' : op} ${num2}`,
    options,
    correctAnswer: correctKey,
    correctValue: answer
  };
}

// Helper to format room data safely for broadcast
function serializeRoom(room) {
  return {
    code: room.code,
    state: room.state,
    selectedGame: room.selectedGame,
    playerCount: room.players.length,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      color: p.color,
      colorName: p.colorName,
      score: p.score,
      isHost: p.isHost,
      isReady: p.isReady,
      racing: {
        x: p.racing.x,
        lane: p.racing.lane,
        distance: p.racing.distance,
        speed: p.racing.speed,
        boost: p.racing.boost,
        isBoosting: p.racing.isBoosting,
        finished: p.racing.finished,
        finishRank: p.racing.finishRank
      },
      puzzle: {
        hasAnswered: p.puzzle.hasAnswered,
        isCorrect: p.puzzle.isCorrect,
        pointsGained: p.puzzle.pointsGained
      }
    })),
    racingState: {
      duration: room.racingState.duration,
      timeLeft: room.racingState.timeLeft,
      trackLength: room.racingState.trackLength,
      finishedCount: room.racingState.finishedCount
    },
    puzzleState: {
      duration: room.puzzleState.duration,
      timeLeft: room.puzzleState.timeLeft,
      currentRound: room.puzzleState.currentRound,
      roundActive: room.puzzleState.roundActive,
      currentQuestion: room.puzzleState.currentQuestion ? {
        questionText: room.puzzleState.currentQuestion.questionText,
        options: room.puzzleState.currentQuestion.options
      } : null,
      roundWinner: room.puzzleState.roundWinner
    }
  };
}

/* ==========================================================================
   SOCKET.IO REAL-TIME LOGIC
   ========================================================================== */

io.on('connection', (socket) => {
  console.log(`[Connect] Socket connected: ${socket.id}`);

  // Reference to current room for quick cleanup
  let currentRoomCode = null;
  let isDisplayHost = false;

  // 1. Host creates / registers a room on main display
  socket.on('create-room', (callback) => {
    const code = generateRoomCode();
    const newRoom = {
      code,
      hostSocketId: socket.id,
      state: 'LOBBY',
      selectedGame: 'racing',
      createdAt: Date.now(),
      players: [],
      racingState: {
        duration: 60,
        timeLeft: 60,
        trackLength: 1000,
        finishedCount: 0,
        timerInterval: null,
        simInterval: null
      },
      puzzleState: {
        duration: 120,
        timeLeft: 120,
        currentRound: 0,
        roundActive: false,
        timerInterval: null,
        roundTimeout: null,
        currentQuestion: null,
        roundWinner: null
      }
    };

    rooms.set(code, newRoom);
    currentRoomCode = code;
    isDisplayHost = true;
    socket.join(code);

    console.log(`[Room Created] Code: ${code} by Host: ${socket.id}`);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: code,
        localIp: LOCAL_IP,
        port: PORT,
        controllerUrl: `http://${LOCAL_IP}:${PORT}/controller?room=${code}`,
        room: serializeRoom(newRoom)
      });
    }
  });

  // 2. Mobile player joins a room
  socket.on('join-room', ({ roomCode, name }, callback) => {
    const code = (roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      console.warn(`[Join Failed] Room ${code} not found (Player: ${name})`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Room not found. Check code and try again.' });
      }
      return;
    }

    if (room.players.length >= 4) {
      console.warn(`[Join Failed] Room ${code} is full (4/4 players)`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Room is full (Maximum 4 players allowed).' });
      }
      return;
    }

    if (room.state !== 'LOBBY') {
      console.warn(`[Join Failed] Game in progress in room ${code}`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Game is currently in progress. Please wait for the lobby.' });
      }
      return;
    }

    // Determine available slot (0..3)
    const takenSlots = new Set(room.players.map(p => p.slot));
    let assignedSlot = 0;
    for (let s = 0; s < 4; s++) {
      if (!takenSlots.has(s)) {
        assignedSlot = s;
        break;
      }
    }

    const slotInfo = PLAYER_SLOTS[assignedSlot];
    const sanitizedName = (name || '').trim().substring(0, 16) || `Player ${assignedSlot + 1}`;

    const newPlayer = {
      id: socket.id,
      name: sanitizedName,
      slot: assignedSlot,
      color: slotInfo.color,
      colorName: slotInfo.colorName,
      carSkin: slotInfo.carSkin,
      score: 0,
      isHost: false,
      isReady: true,
      racing: {
        x: 0,
        lane: assignedSlot,
        distance: 0,
        speed: 0,
        boost: 100,
        isBoosting: false,
        steerInput: 0,
        throttleInput: 0,
        finished: false,
        finishRank: null,
        finishTime: null
      },
      puzzle: {
        hasAnswered: false,
        answer: null,
        isCorrect: false,
        pointsGained: 0
      }
    };

    room.players.push(newPlayer);
    currentRoomCode = code;
    isDisplayHost = false;
    socket.join(code);

    console.log(`[Player Joined] ${sanitizedName} (Slot ${assignedSlot + 1}) joined room ${code}`);

    // Response to the joining player
    if (typeof callback === 'function') {
      callback({
        success: true,
        player: newPlayer,
        room: serializeRoom(room)
      });
    }

    // Notify room of updated player list
    io.to(code).emit('room-update', serializeRoom(room));
    io.to(code).emit('player-joined', {
      player: newPlayer,
      playerCount: room.players.length
    });
  });

  // 3. Select game mode (Racing or Puzzle)
  socket.on('select-game', ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'LOBBY') return;

    if (['racing', 'puzzle'].includes(gameType)) {
      room.selectedGame = gameType;
      console.log(`[Game Selected] Room ${roomCode} mode set to: ${gameType}`);
      io.to(roomCode).emit('game-selected', { gameType, room: serializeRoom(room) });
    }
  });

  // 4. Start game event (triggered by host)
  socket.on('start-game', ({ roomCode, soloTest = false }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Requirement: 2-4 players. (soloTest flag allows testing with 0 or 1 player)
    if (room.players.length < 2 && !soloTest) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'At least 2 players required to start!' });
      }
      return;
    }

    // Dev Solo Test fallback: spawn a driver for the host if no remote players have joined
    if (soloTest && room.players.length === 0) {
      room.players.push({
        id: socket.id,
        name: 'Apex Racer',
        slot: 0,
        color: PLAYER_COLORS[0],
        score: 0,
        racing: {
          x: 0,
          speed: 0,
          speedKmh: 0,
          distance: 0,
          gear: 1,
          rpm: 1200,
          boost: 100,
          isBoosting: false,
          isDrifting: false,
          driftCharge: 0,
          miniTurbo: 0,
          isDrafting: false,
          steerInput: 0,
          throttleInput: 0,
          brakeInput: 0,
          finished: false,
          finishRank: null,
          finishTime: null,
          offRoad: false
        },
        puzzle: {
          hasAnswered: false,
          answer: null,
          isCorrect: false,
          pointsGained: 0
        }
      });
    }

    if (room.state !== 'LOBBY') {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Game already active!' });
      }
      return;
    }

    console.log(`[Game Starting] Room ${roomCode} starting game: ${room.selectedGame} (${room.players.length} players)`);

    if (room.selectedGame === 'racing') {
      initRacingGame(room);
    } else if (room.selectedGame === 'puzzle') {
      initPuzzleGame(room);
    }

    if (typeof callback === 'function') {
      callback({ success: true, gameType: room.selectedGame });
    }
  });

  // 5. Controller Input Handler (Steering, Boost, Puzzle Choices)
  socket.on('controller-input', ({ roomCode, action, data }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id) || (room.hostSocketId === socket.id ? room.players[0] : null);
    if (!player) return;

    if (room.state === 'RACING') {
      handleRacingInput(room, player, action, data);
    } else if (room.state === 'PUZZLE') {
      handlePuzzleInput(room, player, action, data);
    }
  });

  // 6. Return to Lobby / Play Again
  socket.on('return-to-lobby', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Clear any active game intervals
    cleanupGameIntervals(room);

    room.state = 'LOBBY';
    room.racingState.timeLeft = 60;
    room.racingState.finishedCount = 0;
    room.puzzleState.timeLeft = 120;
    room.puzzleState.currentRound = 0;
    room.puzzleState.roundActive = false;
    room.puzzleState.currentQuestion = null;
    room.puzzleState.roundWinner = null;

    // Reset player active flags
    room.players.forEach(p => {
      p.racing.distance = 0;
      p.racing.speed = 0;
      p.racing.boost = 100;
      p.racing.isBoosting = false;
      p.racing.finished = false;
      p.racing.finishRank = null;
      p.puzzle.hasAnswered = false;
      p.puzzle.answer = null;
      p.puzzle.isCorrect = false;
      p.puzzle.pointsGained = 0;
    });

    console.log(`[Return to Lobby] Room ${roomCode} reset to lobby`);
    io.to(roomCode).emit('lobby-return', serializeRoom(room));
  });

  // 7. Disconnection Cleanup
  socket.on('disconnect', () => {
    console.log(`[Disconnect] Socket disconnected: ${socket.id}`);

    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        if (isDisplayHost) {
          console.log(`[Host Left] Host closed room ${currentRoomCode}. Notifying players.`);
          io.to(currentRoomCode).emit('host-disconnected', { message: 'The host display has disconnected.' });
          cleanupGameIntervals(room);
          rooms.delete(currentRoomCode);
        } else {
          // Player disconnected
          const playerIdx = room.players.findIndex(p => p.id === socket.id);
          if (playerIdx !== -1) {
            const removedPlayer = room.players.splice(playerIdx, 1)[0];
            console.log(`[Player Left] ${removedPlayer.name} left room ${currentRoomCode}`);

            io.to(currentRoomCode).emit('player-left', {
              playerId: socket.id,
              playerName: removedPlayer.name,
              playerCount: room.players.length,
              room: serializeRoom(room)
            });

            // If game was running and only 0 or 1 player left, handle appropriately
            if (room.state !== 'LOBBY' && room.players.length < 2) {
              io.to(currentRoomCode).emit('game-interrupted', {
                message: 'Player left. Not enough players to continue.'
              });
            }

            // If room is now empty, delete it
            if (room.players.length === 0) {
              console.log(`[Room Cleaned] Room ${currentRoomCode} is empty, cleaning up.`);
              cleanupGameIntervals(room);
              rooms.delete(currentRoomCode);
            }
          }
        }
      }
    }
  });
});

/* ==========================================================================
   GAME MODES LOGIC IMPLEMENTATION
   ========================================================================== */

function cleanupGameIntervals(room) {
  if (room.racingState.timerInterval) clearInterval(room.racingState.timerInterval);
  if (room.racingState.simInterval) clearInterval(room.racingState.simInterval);
  if (room.puzzleState.timerInterval) clearInterval(room.puzzleState.timerInterval);
  if (room.puzzleState.roundTimeout) clearTimeout(room.puzzleState.roundTimeout);
  room.racingState.timerInterval = null;
  room.racingState.simInterval = null;
  room.puzzleState.timerInterval = null;
  room.puzzleState.roundTimeout = null;
}

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// RACING GAME (Pro 3D Circuit Racing Engine)
// --------------------------------------------------------------------------
const TRACK_LENGTH = 2400; // 2.4 km Grand Prix Circuit

// Dynamic curvature along track distance (meters)
function getTrackCurveAt(distance) {
  const d = distance % TRACK_LENGTH;
  if (d > 250 && d < 600) return 2.2;     // Sweeping right turn
  if (d >= 600 && d < 780) return -2.8;   // Chicane entry left
  if (d >= 780 && d < 950) return 2.8;    // Chicane exit right
  if (d >= 950 && d < 1300) return 0.0;   // High-speed back straight
  if (d >= 1300 && d < 1650) return -4.2; // Technical hairpin turn
  if (d >= 1650 && d < 1950) return 1.8;  // Rollercoaster hill sweep
  return 0.0; // Starting & home straights
}

function initRacingGame(room) {
  cleanupGameIntervals(room);
  room.state = 'RACING';
  room.racingState.duration = 60;
  room.racingState.timeLeft = 60;
  room.racingState.finishedCount = 0;
  room.racingState.trackLength = TRACK_LENGTH;

  // Stagger starting grid positions
  const numPlayers = room.players.length;
  room.players.forEach((p, idx) => {
    // Start side-by-side or staggered on grid
    const gridX = numPlayers > 1 ? ((idx % 2 === 0 ? -0.4 : 0.4)) : 0;
    const gridDist = 20 - (Math.floor(idx / 2) * 12); // Grid rows

    p.racing = {
      x: gridX,               // Lateral position (-1.0 to 1.0 on road)
      lane: p.slot,
      distance: gridDist,     // meters along track
      speed: 0,               // m/s
      speedKmh: 0,            // km/h
      rpm: 1000,              // 1000 - 8500 RPM
      gear: 1,                // 1st to 6th gear
      boost: 100,             // Nitro capacity (0-100)
      isBoosting: false,
      steerInput: 0,          // -1 (left) to 1 (right)
      throttleInput: 0,       // 0 to 1
      brakeInput: 0,          // 0 to 1
      isDrifting: false,      // Powerslide active
      driftCharge: 0,         // Mini-turbo boost charge
      miniTurbo: 0,           // Active mini-turbo boost timer
      isDrafting: false,      // Slipstream bonus
      offRoad: false,         // True if outside asphalt
      finished: false,
      finishRank: null,
      finishTime: null
    };
  });

  // Broadcast game start with synchronized countdown
  io.to(room.code).emit('game-started', {
    gameType: 'racing',
    trackLength: TRACK_LENGTH,
    room: serializeRoom(room)
  });

  // 60-Second Timed Race Clock
  room.racingState.timerInterval = setInterval(() => {
    room.racingState.timeLeft -= 1;

    io.to(room.code).emit('racing-time-tick', {
      timeLeft: room.racingState.timeLeft
    });

    if (room.racingState.timeLeft <= 0) {
      endRacingGame(room, 'TIME_UP');
    }
  }, 1000);

  // 25 FPS server simulation sync loop
  const TICK_RATE = 25;
  const DT = 1 / TICK_RATE;

  room.racingState.simInterval = setInterval(() => {
    let allFinished = true;

    // Check for slipstream drafting between cars
    room.players.forEach(p1 => {
      p1.racing.isDrafting = false;
      if (p1.racing.finished) return;

      room.players.forEach(p2 => {
        if (p1.id === p2.id || p2.racing.finished) return;
        const gap = p2.racing.distance - p1.racing.distance;
        const lateralDiff = Math.abs(p1.racing.x - p2.racing.x);
        // If trailing behind within 6 to 25 meters and in same slipstream pocket
        if (gap > 6 && gap < 28 && lateralDiff < 0.42) {
          p1.racing.isDrafting = true;
        }
      });
    });

    // Check lateral bumping collisions between cars
    for (let i = 0; i < room.players.length; i++) {
      for (let j = i + 1; j < room.players.length; j++) {
        const c1 = room.players[i].racing;
        const c2 = room.players[j].racing;
        if (c1.finished || c2.finished) continue;

        const distDiff = Math.abs(c1.distance - c2.distance);
        const xDiff = Math.abs(c1.x - c2.x);

        if (distDiff < 5.0 && xDiff < 0.32) {
          // Bumping collision! Push cars apart slightly
          const push = 0.08;
          if (c1.x < c2.x) {
            c1.x -= push;
            c2.x += push;
          } else {
            c1.x += push;
            c2.x -= push;
          }
          // Slight speed impact
          c1.speed *= 0.96;
          c2.speed *= 0.96;
        }
      }
    }

    room.players.forEach(player => {
      const r = player.racing;
      if (r.finished) return;

      allFinished = false;

      // Current road curvature
      const curve = getTrackCurveAt(r.distance);

      // Handle Drifting / Powerslide
      if (r.brakeInput > 0.2 && Math.abs(r.steerInput) > 0.35 && r.speed > 18) {
        r.isDrifting = true;
        r.driftCharge = Math.min(100, r.driftCharge + (45 * DT));
      } else {
        if (r.isDrifting) {
          // Released drift! If charged enough, award Mini-Turbo!
          if (r.driftCharge > 45) {
            r.miniTurbo = 1.6; // 1.6 second mini-turbo boost
          }
          r.isDrifting = false;
          r.driftCharge = 0;
        }
      }

      if (r.miniTurbo > 0) {
        r.miniTurbo = Math.max(0, r.miniTurbo - DT);
      }

      // Nitro handling
      if (r.isBoosting && r.boost > 0) {
        r.boost = Math.max(0, r.boost - (30 * DT)); // ~3.3s full tank duration
      } else {
        // Slow recharge
        r.boost = Math.min(100, r.boost + (12 * DT));
        r.isBoosting = false;
      }

      // Calculate Target Top Speed based on conditions (m/s)
      let baseMaxSpeed = 70; // ~252 km/h
      if (r.isBoosting) baseMaxSpeed = 92; // ~331 km/h (Nitrous)
      else if (r.miniTurbo > 0) baseMaxSpeed = 82; // ~295 km/h (Mini-Turbo)
      else if (r.isDrafting) baseMaxSpeed = 78; // ~280 km/h (Slipstream)

      // Off-road penalty (grass/sand)
      r.offRoad = Math.abs(r.x) > 1.25;
      if (r.offRoad) {
        baseMaxSpeed = Math.min(baseMaxSpeed, 25); // Capped at 90 km/h on grass
      }

      // Real Arcade Racing Dynamics: Acceleration only when player presses throttle!
      const throttle = Math.max(0, Math.min(1, r.throttleInput || 0));
      const brake = Math.max(0, Math.min(1, r.brakeInput || 0));
      const accelForce = (r.isBoosting ? 38 : (r.miniTurbo > 0 ? 30 : 20));

      if (brake > 0) {
        // Active Braking: Firm deceleration
        const brakePower = 34 * brake;
        r.speed = Math.max(0, r.speed - (brakePower * DT));
        // Reverse if holding brake while stopped
        if (r.speed === 0 && brake > 0.5) {
          r.speed = Math.max(-10, r.speed - (8 * DT));
        }
      } else if (throttle > 0) {
        // Accelerating
        const targetSpeed = baseMaxSpeed * throttle;
        if (r.speed < targetSpeed) {
          // Responsive torque curve: faster punch at low-to-mid speeds
          const torqueFactor = Math.max(0.45, 1.0 - (r.speed / baseMaxSpeed) * 0.55);
          r.speed += (accelForce * torqueFactor) * DT;
          if (r.speed > targetSpeed) r.speed = targetSpeed;
        } else {
          // Natural aerodynamic drag down to target speed
          r.speed -= (r.speed - targetSpeed) * (3.0 * DT);
        }
      } else {
        // Coasting deceleration (rolling friction)
        if (r.speed > 0) {
          r.speed = Math.max(0, r.speed - (8.5 * DT));
        } else if (r.speed < 0) {
          r.speed = Math.min(0, r.speed + (8.5 * DT));
        }
      }

      // Advance distance along track
      r.distance += Math.max(0, r.speed) * DT;
      r.speedKmh = Math.round(r.speed * 3.6);

      // Gear calculation (1st to 6th) & Engine RPM (1000 - 8500)
      const gearRanges = [0, 65, 115, 165, 215, 265, 360];
      let gear = 1;
      for (let g = 1; g <= 6; g++) {
        if (Math.abs(r.speedKmh) >= gearRanges[g - 1]) gear = g;
      }
      r.gear = gear;

      const gearMin = gearRanges[gear - 1];
      const gearMax = gearRanges[gear];
      const gearRatio = Math.max(0, Math.min(1, (Math.abs(r.speedKmh) - gearMin) / (gearMax - gearMin)));
      r.rpm = Math.round(1800 + gearRatio * 6400);

      // Responsive Speed-Scaled Steering Physics
      const forwardVelocity = Math.abs(r.speed);
      const steerResponsiveness = forwardVelocity < 1.0 ? 0 : Math.min(1.0, 0.4 + (forwardVelocity / 26));
      const steerMultiplier = (r.isDrifting ? 4.6 : 3.6) * steerResponsiveness;

      // Smooth interpolation for silky non-jittery steering
      r.currentSteer = r.currentSteer !== undefined ? r.currentSteer : 0;
      r.currentSteer += ((r.steerInput || 0) - r.currentSteer) * (18 * DT);

      r.x += r.currentSteer * steerMultiplier * DT;

      // Highway auto-center damping when driver lets go of steering
      if (Math.abs(r.steerInput || 0) < 0.05) {
        r.currentSteer *= (1 - 8 * DT);
      }

      // Gentle curve following (subtle road banking)
      if (Math.abs(curve) > 0.05 && forwardVelocity > 8) {
        r.x += curve * (forwardVelocity / 80) * (0.5 * DT);
      }

      // Guardrail barrier limits with arcade bounce-back (-1.82 to +1.82)
      const roadLimit = 1.82;
      if (r.x > roadLimit) {
        r.x = roadLimit;
        r.currentSteer = -0.3; // bounce away from right barrier
        r.speed = Math.max(0, r.speed - (14 * DT)); // wall brush friction
      } else if (r.x < -roadLimit) {
        r.x = -roadLimit;
        r.currentSteer = 0.3; // bounce away from left barrier
        r.speed = Math.max(0, r.speed - (14 * DT));
      }

      // Finish line check
      if (r.distance >= TRACK_LENGTH) {
        r.finished = true;
        r.distance = TRACK_LENGTH;
        room.racingState.finishedCount += 1;
        r.finishRank = room.racingState.finishedCount;
        r.finishTime = 60 - room.racingState.timeLeft;

        const placementPoints = [500, 300, 150, 50];
        const points = placementPoints[r.finishRank - 1] || 50;
        player.score += points;

        console.log(`[Race Finish] ${player.name} finished #${r.finishRank} (+${points} pts)`);

        io.to(room.code).emit('player-finished-race', {
          playerId: player.id,
          playerName: player.name,
          rank: r.finishRank,
          pointsGained: points,
          totalScore: player.score
        });
      }
    });

    // Broadcast high-fidelity racing telemetry to host display & mobile controllers
    io.to(room.code).emit('racing-state-tick', {
      players: room.players.map(p => ({
        id: p.id,
        slot: p.slot,
        name: p.name,
        color: p.color,
        x: p.racing.x,
        steerInput: p.racing.currentSteer || 0,
        distance: p.racing.distance,
        speed: p.racing.speedKmh,
        rpm: p.racing.rpm,
        gear: p.racing.gear,
        boost: Math.round(p.racing.boost),
        isBoosting: p.racing.isBoosting,
        isDrifting: p.racing.isDrifting,
        driftCharge: Math.round(p.racing.driftCharge),
        isDrafting: p.racing.isDrafting,
        offRoad: p.racing.offRoad,
        finished: p.racing.finished,
        finishRank: p.racing.finishRank
      }))
    });

    if (allFinished && room.players.length > 0) {
      endRacingGame(room, 'ALL_FINISHED');
    }
  }, 1000 / TICK_RATE);
}

function handleRacingInput(room, player, action, data) {
  const r = player.racing;
  if (!r || r.finished) return;

  switch (action) {
    case 'up':
      if (data && data.active === false) {
        r.throttleInput = 0;
      } else {
        r.throttleInput = 1;
        r.brakeInput = 0;
      }
      break;
    case 'down':
      if (data && data.active === false) {
        r.brakeInput = 0;
      } else {
        r.brakeInput = 1;
        r.throttleInput = 0;
      }
      break;
    case 'left':
      if (data && data.active === false) {
        if (r.steerInput < 0) r.steerInput = 0;
      } else {
        r.steerInput = -1;
      }
      break;
    case 'right':
      if (data && data.active === false) {
        if (r.steerInput > 0) r.steerInput = 0;
      } else {
        r.steerInput = 1;
      }
      break;
    case 'release':
      // release a direction or pedal: data: { control: 'steer' | 'throttle' | 'brake' }
      if (data?.control === 'steer') r.steerInput = 0;
      else if (data?.control === 'throttle') r.throttleInput = 0;
      else if (data?.control === 'brake') r.brakeInput = 0;
      else {
        r.steerInput = 0;
        r.throttleInput = 0;
        r.brakeInput = 0;
      }
      break;
    case 'steer':
      // data: { value: -1 to 1 }
      r.steerInput = typeof data?.value === 'number' ? Math.max(-1, Math.min(1, data.value)) : 0;
      break;
    case 'throttle':
      // data: { value: 0 to 1 }
      if (typeof data?.value === 'number') {
        if (data.value < 0) {
          r.brakeInput = Math.abs(data.value);
          r.throttleInput = 0;
        } else {
          r.throttleInput = data.value;
          r.brakeInput = 0;
        }
      }
      break;
    case 'brake':
      // data: { value: 0 to 1 }
      r.brakeInput = typeof data?.value === 'number' ? Math.max(0, Math.min(1, data.value)) : 0;
      break;
    case 'drift':
      if (data?.active) {
        r.brakeInput = 0.5;
      }
      break;
    case 'boost':
      if (data && data.active !== undefined) {
        r.isBoosting = Boolean(data.active) && r.boost > 10;
      } else {
        r.isBoosting = r.boost > 10;
        setTimeout(() => { if (r.isBoosting) r.isBoosting = false; }, 2000);
      }
      break;
  }
}

function endRacingGame(room, reason) {
  cleanupGameIntervals(room);
  room.state = 'GAME_OVER';

  // Any players who didn't reach the finish line get ranked by distance
  const unfinished = room.players.filter(p => !p.racing.finished);
  unfinished.sort((a, b) => b.racing.distance - a.racing.distance);
  unfinished.forEach(p => {
    room.racingState.finishedCount += 1;
    p.racing.finished = true;
    p.racing.finishRank = room.racingState.finishedCount;
    const placementPoints = [200, 100, 50, 25];
    const points = placementPoints[p.racing.finishRank - 1] || 25;
    p.score += points;
  });

  // Sort leaderboard by score descending
  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);

  console.log(`[Racing Game Over] Room ${room.code} ended (${reason}). Winner: ${leaderboard[0]?.name}`);

  io.to(room.code).emit('game-over', {
    gameType: 'racing',
    reason,
    leaderboard: leaderboard.map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      finishRank: p.racing.finishRank,
      distance: Math.round(p.racing.distance)
    }))
  });
}

// --------------------------------------------------------------------------
// PUZZLE GAME (2-minute timed math challenge)
// --------------------------------------------------------------------------
function initPuzzleGame(room) {
  cleanupGameIntervals(room);
  room.state = 'PUZZLE';
  room.puzzleState.duration = 120; // 2 minutes (120 seconds)
  room.puzzleState.timeLeft = 120;
  room.puzzleState.currentRound = 0;
  room.puzzleState.roundActive = false;
  room.puzzleState.roundWinner = null;

  // Broadcast game start
  io.to(room.code).emit('game-started', {
    gameType: 'puzzle',
    room: serializeRoom(room)
  });

  // Start 120-second game timer
  room.puzzleState.timerInterval = setInterval(() => {
    room.puzzleState.timeLeft -= 1;

    io.to(room.code).emit('puzzle-time-tick', {
      timeLeft: room.puzzleState.timeLeft
    });

    if (room.puzzleState.timeLeft <= 0) {
      endPuzzleGame(room, 'TIME_UP');
    }
  }, 1000);

  // Launch first puzzle round
  nextPuzzleRound(room);
}

function nextPuzzleRound(room) {
  if (room.state !== 'PUZZLE' || room.puzzleState.timeLeft <= 0) return;

  room.puzzleState.currentRound += 1;
  room.puzzleState.roundActive = true;
  room.puzzleState.roundWinner = null;

  // Reset player answer states for this round
  room.players.forEach(p => {
    p.puzzle.hasAnswered = false;
    p.puzzle.answer = null;
    p.puzzle.isCorrect = false;
    p.puzzle.pointsGained = 0;
  });

  // Generate fresh puzzle question
  const puzzle = generateMathPuzzle(room.puzzleState.currentRound);
  room.puzzleState.currentQuestion = puzzle;

  console.log(`[Puzzle Round ${room.puzzleState.currentRound}] ${puzzle.questionText} = ? (${puzzle.correctAnswer}: ${puzzle.correctValue})`);

  // Broadcast new question
  io.to(room.code).emit('new-puzzle-round', {
    round: room.puzzleState.currentRound,
    questionText: puzzle.questionText,
    options: puzzle.options,
    timeLeft: room.puzzleState.timeLeft
  });
}

function handlePuzzleInput(room, player, action, data) {
  if (!room.puzzleState.roundActive) return;
  if (action !== 'answer') return;

  const choice = (data.choice || '').toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(choice)) return;

  // If player already answered correctly or answered in this round
  if (player.puzzle.hasAnswered) return;

  player.puzzle.hasAnswered = true;
  player.puzzle.answer = choice;

  const currentQ = room.puzzleState.currentQuestion;
  const isCorrect = (choice === currentQ.correctAnswer);
  player.puzzle.isCorrect = isCorrect;

  // Notify controller of answer submission confirmation
  io.to(player.id).emit('puzzle-answer-receipt', {
    choice,
    isCorrect,
    correctAnswer: currentQ.correctAnswer
  });

  // Notify main display of player's response
  io.to(room.code).emit('player-answered', {
    playerId: player.id,
    playerName: player.name,
    choice,
    isCorrect
  });

  if (isCorrect) {
    // First to answer correctly gets 100 points
    if (!room.puzzleState.roundWinner) {
      room.puzzleState.roundWinner = player.id;
      player.score += 100;
      player.puzzle.pointsGained = 100;

      console.log(`[Puzzle Correct] ${player.name} answered FIRST! +100 PTS (Total: ${player.score})`);

      // Announce round winner to room
      io.to(room.code).emit('puzzle-round-won', {
        winnerId: player.id,
        winnerName: player.name,
        points: 100,
        correctAnswer: currentQ.correctAnswer,
        correctValue: currentQ.correctValue,
        scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
      });

      // Close this round and queue next question in 2.5 seconds
      room.puzzleState.roundActive = false;
      room.puzzleState.roundTimeout = setTimeout(() => {
        nextPuzzleRound(room);
      }, 2500);
    }
  } else {
    console.log(`[Puzzle Incorrect] ${player.name} guessed ${choice} (Incorrect)`);
    // If all players have answered incorrectly, reveal answer and advance
    const allAnswered = room.players.every(p => p.puzzle.hasAnswered);
    if (allAnswered) {
      room.puzzleState.roundActive = false;
      io.to(room.code).emit('puzzle-round-no-winner', {
        correctAnswer: currentQ.correctAnswer,
        correctValue: currentQ.correctValue
      });
      room.puzzleState.roundTimeout = setTimeout(() => {
        nextPuzzleRound(room);
      }, 2500);
    }
  }
}

function endPuzzleGame(room, reason) {
  cleanupGameIntervals(room);
  room.state = 'GAME_OVER';

  // Sort leaderboard by score descending
  const leaderboard = [...room.players].sort((a, b) => b.score - a.score);

  console.log(`[Puzzle Game Over] Room ${room.code} ended (${reason}). Winner: ${leaderboard[0]?.name}`);

  io.to(room.code).emit('game-over', {
    gameType: 'puzzle',
    reason,
    leaderboard: leaderboard.map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score
    }))
  });
}

// --------------------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  console.log(`
===========================================================
  🎮 MOBILE CONTROLLER MULTIPLAYER GAME PLATFORM
===========================================================
  📺 Main Display (TV/Monitor): http://localhost:${PORT}
  📱 Phone Controller Link:   http://${LOCAL_IP}:${PORT}/controller
  🌐 Server Network Binding:  http://${HOST}:${PORT}
===========================================================
  `);
});
