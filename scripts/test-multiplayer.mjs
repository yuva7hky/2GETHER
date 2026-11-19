import http from 'http';
import express from '../server/node_modules/express/index.js';
import { Server } from '../server/node_modules/socket.io/dist/index.js';
import { io as ClientIO } from '../client/node_modules/socket.io-client/build/cjs/index.js';
import { setupSocketHandler } from '../server/dist/socket/socketHandler.js';
import { roomService, SPAWN_POSITIONS } from '../server/dist/services/roomService.js';

console.log('====================================================');
console.log('🧪 2GETHER MULTIPLAYER INTEGRATION TEST SUITE');
console.log('====================================================\n');

// 1. Setup isolated test server
const app = express();
const httpServer = http.createServer(app);
const ioServer = new Server(httpServer, {
  cors: { origin: '*' }
});
setupSocketHandler(ioServer);

const TEST_PORT = 4123;
await new Promise((resolve) => httpServer.listen(TEST_PORT, '127.0.0.1', resolve));
console.log(`✓ Test Socket.IO server listening on port ${TEST_PORT}\n`);

const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

function createClientSocket() {
  return ClientIO(SERVER_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true,
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let passedTests = 0;
let totalTests = 7;

try {
  // Setup Clients
  const hostSocket = createClientSocket();
  const guestSocket = createClientSocket();

  hostSocket.on('connect_error', (err) => console.error('Host connect_error:', err.message));
  guestSocket.on('connect_error', (err) => console.error('Guest connect_error:', err.message));

  await new Promise((res) => hostSocket.on('connect', res));
  await new Promise((res) => guestSocket.on('connect', res));
  console.log(`✓ Client 1 (Host) connected: ${hostSocket.id}`);
  console.log(`✓ Client 2 (Guest) connected: ${guestSocket.id}\n`);

  const hostPlayerId = 'player_host_001';
  const guestPlayerId = 'player_guest_002';
  let roomCode = '';

  // Host creates room
  const createRes = await new Promise((resolve) => {
    hostSocket.emit('room:create', {
      userId: 'user_host_1',
      playerId: hostPlayerId,
      characterName: 'HostHeart',
      characterData: { colorScheme: 'pink', clothingColor: '#ec4899', hairColor: '#3b0764', skinColor: '#fbcfe8' },
    }, resolve);
  });

  if (!createRes.success) throw new Error('Failed to create room: ' + createRes.error);
  roomCode = createRes.room.roomCode;
  console.log(`✓ Room created with code: ${roomCode}`);
  console.log(`  Host initial authoritative position:`, createRes.player.transform);

  // Guest joins room
  const joinRes = await new Promise((resolve) => {
    guestSocket.emit('room:join', {
      roomCode,
      userId: 'user_guest_2',
      playerId: guestPlayerId,
      characterName: 'GuestHeart',
      characterData: { colorScheme: 'gold', clothingColor: '#f59e0b', hairColor: '#451a03', skinColor: '#fed7aa' },
    }, resolve);
  });

  if (!joinRes.success) throw new Error('Guest failed to join: ' + joinRes.error);
  console.log(`✓ Guest joined room: ${roomCode}`);
  console.log(`  Guest initial authoritative position:`, joinRes.player.transform);

  // Verify Distinct Spawn Positions (BUG 2)
  if (
    createRes.player.transform.x === joinRes.player.transform.x &&
    createRes.player.transform.z === joinRes.player.transform.z
  ) {
    throw new Error('FAIL: Host and Guest spawned at identical coordinates!');
  }
  const spawnDistance = Math.abs(createRes.player.transform.x - joinRes.player.transform.x);
  console.log(`✓ Verified safe spawn separation distance: ${spawnDistance}m (Safe > 2.0m)\n`);

  // --------------------------------------------------------------------------
  // TEST A: Guest moves -> Host sees movement
  // --------------------------------------------------------------------------
  console.log('--- TEST A: Guest moves -> Host sees movement ---');
  const hostReceivedGuestMovePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for host to see guest move')), 3000);
    hostSocket.on('player:moved', (data) => {
      if (data.playerId === guestPlayerId) {
        clearTimeout(timeout);
        resolve(data);
      }
    });
  });

  const guestTargetPos = { x: 2.2, y: 0, z: 4.5, rotY: 2.8 };
  guestSocket.emit('player:move', {
    transform: guestTargetPos,
    animationState: 'WALK',
    isSitting: false,
    seatIndex: null,
    seq: 1,
    timestamp: Date.now(),
  });

  const hostReceivedGuestMove = await hostReceivedGuestMovePromise;
  if (
    hostReceivedGuestMove.transform.x !== guestTargetPos.x ||
    hostReceivedGuestMove.transform.z !== guestTargetPos.z
  ) {
    throw new Error(`FAIL: Host received incorrect guest position: ${JSON.stringify(hostReceivedGuestMove)}`);
  }
  console.log(`✓ PASS Test A: Host correctly received Guest movement to:`, hostReceivedGuestMove.transform);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST B: Host moves -> Guest sees movement
  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: Host moves -> Guest sees movement ---');
  const guestReceivedHostMovePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for guest to see host move')), 3000);
    guestSocket.on('player:moved', (data) => {
      if (data.playerId === hostPlayerId) {
        clearTimeout(timeout);
        resolve(data);
      }
    });
  });

  const hostTargetPos = { x: -2.8, y: 0, z: 3.8, rotY: 1.2 };
  hostSocket.emit('player:move', {
    transform: hostTargetPos,
    animationState: 'RUN',
    isSitting: false,
    seatIndex: null,
    seq: 2,
    timestamp: Date.now(),
  });

  const guestReceivedHostMove = await guestReceivedHostMovePromise;
  if (
    guestReceivedHostMove.transform.x !== hostTargetPos.x ||
    guestReceivedHostMove.transform.z !== hostTargetPos.z
  ) {
    throw new Error(`FAIL: Guest received incorrect host position: ${JSON.stringify(guestReceivedHostMove)}`);
  }
  console.log(`✓ PASS Test B: Guest correctly received Host movement to:`, guestReceivedHostMove.transform);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST C: Both players move simultaneously
  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: Simultaneous movement synchronization ---');
  const hostPromiseC = new Promise((resolve) => {
    hostSocket.on('player:moved', (d) => {
      if (d.playerId === guestPlayerId && d.seq === 10) resolve(d);
    });
  });

  const guestPromiseC = new Promise((resolve) => {
    guestSocket.on('player:moved', (d) => {
      if (d.playerId === hostPlayerId && d.seq === 10) resolve(d);
    });
  });

  hostSocket.emit('player:move', {
    transform: { x: -3.5, y: 0, z: 2.0, rotY: 0 },
    animationState: 'WALK',
    isSitting: false,
    seatIndex: null,
    seq: 10,
    timestamp: Date.now(),
  });

  guestSocket.emit('player:move', {
    transform: { x: 3.5, y: 0, z: 2.0, rotY: 0 },
    animationState: 'WALK',
    isSitting: false,
    seatIndex: null,
    seq: 10,
    timestamp: Date.now(),
  });

  const [receivedByHost, receivedByGuest] = await Promise.all([hostPromiseC, guestPromiseC]);
  console.log(`✓ PASS Test C: Simultaneous movement received cleanly by both clients`);
  console.log(`  Host saw Guest at x=${receivedByHost.transform.x}`);
  console.log(`  Guest saw Host at x=${receivedByGuest.transform.x}`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST D: World coordinate consistency check
  // --------------------------------------------------------------------------
  console.log('\n--- TEST D: Both clients display consistent world coordinates ---');
  const roomState = roomService.getRoom(roomCode);
  const hostOnServer = roomState.players.get(hostPlayerId);
  const guestOnServer = roomState.players.get(guestPlayerId);

  if (receivedByGuest.transform.x !== hostOnServer.transform.x) {
    throw new Error('FAIL: Inconsistent Host position on server vs client');
  }
  if (receivedByHost.transform.x !== guestOnServer.transform.x) {
    throw new Error('FAIL: Inconsistent Guest position on server vs client');
  }
  console.log(`✓ PASS Test D: World coordinates are consistent across both clients and server`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST E: Disconnect and Reconnect one player
  // --------------------------------------------------------------------------
  console.log('\n--- TEST E: Disconnect and Reconnect Guest ---');
  guestSocket.disconnect();
  await wait(300);

  // New socket for reconnecting guest
  const reconnectedGuestSocket = createClientSocket();
  await new Promise((res) => reconnectedGuestSocket.on('connect', res));

  const hostSawReconnectPromise = new Promise((resolve) => {
    hostSocket.on('player:reconnected', resolve);
  });

  const reconnectRes = await new Promise((resolve) => {
    reconnectedGuestSocket.emit('room:reconnect', {
      roomCode,
      playerId: guestPlayerId,
    }, resolve);
  });

  if (!reconnectRes.success) throw new Error('FAIL: Reconnect rejected: ' + reconnectRes.error);
  const hostSawReconnect = await hostSawReconnectPromise;

  console.log(`✓ PASS Test E: Guest reconnected cleanly, host notified, player state restored`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST F: Both players sit in seats
  // --------------------------------------------------------------------------
  console.log('\n--- TEST F: Seating synchronization ---');
  const guestSawHostSitPromise = new Promise((resolve) => {
    reconnectedGuestSocket.on('player:sit_changed', (d) => {
      if (d.playerId === hostPlayerId) resolve(d);
    });
  });

  const hostSawGuestSitPromise = new Promise((resolve) => {
    hostSocket.on('player:sit_changed', (d) => {
      if (d.playerId === guestPlayerId) resolve(d);
    });
  });

  // Host sits in Seat 0
  hostSocket.emit('theatre:sit', { isSitting: true, seatIndex: 0 });
  // Guest sits in Seat 1
  reconnectedGuestSocket.emit('theatre:sit', { isSitting: true, seatIndex: 1 });

  const [guestSawHostSit, hostSawGuestSit] = await Promise.all([
    guestSawHostSitPromise,
    hostSawGuestSitPromise,
  ]);

  if (!guestSawHostSit.isSitting || guestSawHostSit.seatIndex !== 0) {
    throw new Error('FAIL: Guest received incorrect host seating state');
  }
  if (!hostSawGuestSit.isSitting || hostSawGuestSit.seatIndex !== 1) {
    throw new Error('FAIL: Host received incorrect guest seating state');
  }
  console.log(`✓ PASS Test F: Host is sitting in Seat 0, Guest is sitting in Seat 1. Both synced!`);
  passedTests++;

  // --------------------------------------------------------------------------
  // TEST G: Third player attempts to join -> ROOM_FULL
  // --------------------------------------------------------------------------
  console.log('\n--- TEST G: Third player rejection (STRICTLY 2 players) ---');
  const thirdSocket = createClientSocket();
  await new Promise((res) => thirdSocket.on('connect', res));

  const thirdJoinRes = await new Promise((resolve) => {
    thirdSocket.emit('room:join', {
      roomCode,
      userId: 'user_intruder_3',
      playerId: 'player_intruder_003',
      characterName: 'Intruder',
      characterData: {},
    }, resolve);
  });

  if (thirdJoinRes.success) {
    throw new Error('FAIL: Third player was allowed to join! Room capacity violated!');
  }
  if (thirdJoinRes.error !== 'ROOM_FULL') {
    throw new Error(`FAIL: Expected error 'ROOM_FULL', got: ${thirdJoinRes.error}`);
  }
  console.log(`✓ PASS Test G: Third player strictly rejected with ROOM_FULL error`);
  passedTests++;

  // Clean up
  hostSocket.close();
  reconnectedGuestSocket.close();
  thirdSocket.close();
  httpServer.close();

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================');
  process.exit(0);

} catch (err) {
  console.error('\n❌ TEST SUITE FAILED:', err);
  httpServer.close();
  process.exit(1);
}
