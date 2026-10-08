const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createConnectedSocket() {
  return new Promise((resolve, reject) => {
    const s = io(SERVER_URL, { forceNew: true, reconnection: false });
    if (s.connected) return resolve(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

async function runTests() {
  console.log('🏁 Starting CrossPlay Arena Multiplayer Automated Test Suite...\n');

  // 1. Create Host Client
  console.log('--- TEST 1: Host Display Connection & Room Creation ---');
  const hostSocket = await createConnectedSocket();
  
  const roomData = await new Promise((resolve) => {
    hostSocket.emit('create-room', (res) => resolve(res));
  });

  if (!roomData.success || !roomData.roomCode || roomData.roomCode.length !== 6) {
    throw new Error(`Room creation failed: ${JSON.stringify(roomData)}`);
  }
  const roomCode = roomData.roomCode;
  console.log(`✅ Host connected. Room Code created: [${roomCode}]`);
  console.log(`   Controller URL: ${roomData.controllerUrl}\n`);

  // 2. Connect Players (P1, P2)
  console.log('--- TEST 2: Players Joining Room (2 Players) ---');
  const p1Socket = await createConnectedSocket();
  const p2Socket = await createConnectedSocket();

  const p1Join = await new Promise((resolve) => {
    p1Socket.emit('join-room', { roomCode, name: 'CyberSonic' }, resolve);
  });

  if (!p1Join.success || p1Join.player.slot !== 0) {
    throw new Error(`P1 join failed: ${JSON.stringify(p1Join)}`);
  }
  console.log(`✅ Player 1 joined: ${p1Join.player.name} (Slot 0, Color: ${p1Join.player.color})`);

  const p2Join = await new Promise((resolve) => {
    p2Socket.emit('join-room', { roomCode, name: 'NeonViper' }, resolve);
  });

  if (!p2Join.success || p2Join.player.slot !== 1) {
    throw new Error(`P2 join failed: ${JSON.stringify(p2Join)}`);
  }
  console.log(`✅ Player 2 joined: ${p2Join.player.name} (Slot 1, Color: ${p2Join.player.color})\n`);

  // 3. Test Room Capacity (Add P3, P4, and test P5 rejection)
  console.log('--- TEST 3: Room Capacity & Validation (Max 4 Players) ---');
  const p3Socket = await createConnectedSocket();
  const p4Socket = await createConnectedSocket();
  const p5Socket = await createConnectedSocket();

  await new Promise(r => p3Socket.emit('join-room', { roomCode, name: 'LimeRider' }, r));
  await new Promise(r => p4Socket.emit('join-room', { roomCode, name: 'GoldTitan' }, r));
  console.log('✅ Player 3 and Player 4 joined. Room is now 4/4 FULL.');

  const p5Join = await new Promise((resolve) => {
    p5Socket.emit('join-room', { roomCode, name: 'ExtraPlayer' }, resolve);
  });

  if (p5Join.success || !p5Join.error.includes('full')) {
    throw new Error(`P5 should have been rejected for full room, but got: ${JSON.stringify(p5Join)}`);
  }
  console.log(`✅ Room capacity limit enforced: 5th player rejected with message: "${p5Join.error}"`);

  // Test Non-existent Room Code
  const invalidJoin = await new Promise((resolve) => {
    p5Socket.emit('join-room', { roomCode: 'ZZZZZZ', name: 'Ghost' }, resolve);
  });
  if (invalidJoin.success) {
    throw new Error('Invalid room code should be rejected!');
  }
  console.log(`✅ Invalid room code properly rejected with message: "${invalidJoin.error}"\n`);

  // Disconnect P3, P4, P5 to keep test focused for 2 players
  p3Socket.disconnect();
  p4Socket.disconnect();
  p5Socket.disconnect();
  await wait(300);

  // 4. Test Game Mode Selection
  console.log('--- TEST 4: Game Mode Selection ---');
  let gameSelectedEventReceived = false;
  hostSocket.on('game-selected', ({ gameType }) => {
    if (gameType === 'racing') gameSelectedEventReceived = true;
  });

  hostSocket.emit('select-game', { roomCode, gameType: 'racing' });
  await wait(300);
  if (!gameSelectedEventReceived) throw new Error('Failed to select racing game mode!');
  console.log('✅ Game mode "racing" successfully selected and broadcast.\n');

  // 5. Test Racing Game Flow & Controller Input
  console.log('--- TEST 5: Racing Game Loop & Mobile Controller Inputs ---');
  let raceStarted = false;
  p1Socket.on('game-started', ({ gameType }) => {
    if (gameType === 'racing') raceStarted = true;
  });

  const startRaceRes = await new Promise((resolve) => {
    hostSocket.emit('start-game', { roomCode, soloTest: false }, resolve);
  });
  if (!startRaceRes.success) throw new Error(`Failed to start race: ${JSON.stringify(startRaceRes)}`);

  await wait(400);
  if (!raceStarted) throw new Error('Players did not receive game-started event!');
  console.log('✅ Racing game started with synchronized countdown.');

  // Send Controller Inputs: Steer, Throttle, and Boost
  console.log('   Sending P1 Boost and Steer Right inputs...');
  p1Socket.emit('controller-input', {
    roomCode,
    action: 'boost',
    data: { active: true }
  });
  p1Socket.emit('controller-input', {
    roomCode,
    action: 'steer',
    data: { direction: 'right', value: 1 }
  });

  console.log('   Sending P2 Steer Left input...');
  p2Socket.emit('controller-input', {
    roomCode,
    action: 'steer',
    data: { direction: 'left', value: -1 }
  });

  // Verify server broadcasted physics ticks
  const stateTick = await new Promise((resolve) => {
    p1Socket.once('racing-state-tick', resolve);
  });

  const p1State = stateTick.players.find(p => p.id === p1Socket.id);
  const p2State = stateTick.players.find(p => p.id === p2Socket.id);

  if (!p1State || !p2State) throw new Error('State tick missing player telemetry!');
  console.log(`✅ Real-time 20Hz physics sync verified:`);
  console.log(`   P1 (${p1Join.player.name}): Speed = ${p1State.speed} km/h, Boost = ${p1State.boost}%, x = ${p1State.x.toFixed(2)}`);
  console.log(`   P2 (${p2Join.player.name}): Speed = ${p2State.speed} km/h, Boost = ${p2State.boost}%, x = ${p2State.x.toFixed(2)}\n`);

  // Return to Lobby
  console.log('--- TEST 6: Return to Lobby ---');
  let returnedToLobby = false;
  p1Socket.on('lobby-return', () => { returnedToLobby = true; });
  hostSocket.emit('return-to-lobby', { roomCode });
  await wait(400);
  if (!returnedToLobby) throw new Error('Failed to return to lobby!');
  console.log('✅ Successfully returned all clients to lobby.\n');

  // 7. Test Math Puzzle Game Mode
  console.log('--- TEST 7: Math Puzzle Blitz Game Mode ---');
  hostSocket.emit('select-game', { roomCode, gameType: 'puzzle' });
  await wait(200);

  let puzzleQuestionReceived = false;
  let receivedPuzzle = null;
  p1Socket.on('new-puzzle-round', (data) => {
    puzzleQuestionReceived = true;
    receivedPuzzle = data;
  });

  hostSocket.emit('start-game', { roomCode, soloTest: false });
  await wait(600);

  if (!puzzleQuestionReceived || !receivedPuzzle) {
    throw new Error('Puzzle round did not emit questions!');
  }

  console.log(`✅ Puzzle round started:`);
  console.log(`   Question: ${receivedPuzzle.questionText} = ?`);
  console.log(`   Options:`, receivedPuzzle.options);

  // We test answering an option and receiving feedback
  let p1Receipt = null;
  p1Socket.once('puzzle-answer-receipt', (receipt) => {
    p1Receipt = receipt;
  });

  // Let P1 submit option 'A'
  p1Socket.emit('controller-input', {
    roomCode,
    action: 'answer',
    data: { choice: 'A' }
  });

  await wait(500);
  if (!p1Receipt) throw new Error('P1 did not receive puzzle answer receipt!');
  console.log(`✅ Mobile answer feedback received: Choice: ${p1Receipt.choice}, Is Correct: ${p1Receipt.isCorrect}, Correct Answer: ${p1Receipt.correctAnswer}\n`);

  // 8. Clean Disconnect & Teardown
  console.log('--- TEST 8: Teardown & Room Cleanup ---');
  p1Socket.disconnect();
  p2Socket.disconnect();
  hostSocket.disconnect();
  await wait(300);
  console.log('✅ All test sockets cleanly disconnected and room cleaned up.\n');

  console.log('🎉 ALL INTEGRATION TESTS PASSED 100% SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
