import http from 'http';
import express from '../server/node_modules/express/index.js';
import { Server } from '../server/node_modules/socket.io/dist/index.js';
import { io as ClientIO } from '../client/node_modules/socket.io-client/build/cjs/index.js';
import { setupSocketHandler } from '../server/dist/socket/socketHandler.js';
import { roomService } from '../server/dist/services/roomService.js';
import { supabaseService } from '../server/dist/services/supabaseService.js';
import { config } from '../server/dist/config/index.js';

console.log('====================================================');
console.log('🧪 2GETHER PHASE 2 SUPABASE ROOM PERSISTENCE TEST');
console.log('====================================================\n');

console.log(`[Supabase Connection Mode] Live Supabase Project: ${config.hasSupabase}\n`);

// 1. Setup isolated test Socket.IO server
const app = express();
const httpServer = http.createServer(app);
const ioServer = new Server(httpServer, {
  cors: { origin: '*' }
});
setupSocketHandler(ioServer);

const TEST_PORT = 4224;
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

let passed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passed++;
  console.log(`✓ PASS: ${msg}`);
}

try {
  // --------------------------------------------------------------------------
  // TEST 1: Room Creation & Supabase Persistence
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Host Room Creation & Database Persistence ---');
  const hostSocket = createClientSocket();
  await new Promise((res) => hostSocket.on('connect', res));

  const hostUserId = `user_host_${Date.now()}`;
  const hostPlayerId = `p_host_${Date.now()}`;
  const hostProfileData = {
    colorScheme: 'sunset_pink',
    clothingColor: '#ec4899',
    hairColor: '#3b0764',
    skinColor: '#fbcfe8',
  };

  const createRes = await new Promise((resolve) => {
    hostSocket.emit('room:create', {
      userId: hostUserId,
      playerId: hostPlayerId,
      characterName: 'MoonlightHost',
      characterData: hostProfileData,
    }, resolve);
  });

  assert(createRes.success === true, 'Socket room:create response is successful');
  const roomCode = createRes.room.roomCode;
  assert(Boolean(roomCode && roomCode.length === 6), `Generated valid 6-char room code: ${roomCode}`);
  assert(createRes.player.isHost === true, 'Host player is marked as host');

  // Verify in live Supabase database
  await wait(300); // allow async DB write
  const dbRoom = await supabaseService.getRoomByCode(roomCode);
  assert(dbRoom !== null, 'Room successfully found in Supabase rooms table');
  assert(dbRoom.host_player_id === hostPlayerId, 'Supabase rooms.host_player_id matches host player ID');
  assert(dbRoom.status === 'WAITING', 'Supabase rooms.status is WAITING');
  assert(dbRoom.guest_player_id === null, 'Supabase rooms.guest_player_id is initially null');

  const hostProfile = await supabaseService.getProfile(hostUserId);
  assert(hostProfile !== null, 'Host profile saved in Supabase profiles table');
  assert(hostProfile.display_name === 'MoonlightHost', 'Supabase profile display_name matches');

  const membersAfterCreate = await supabaseService.getMembers(dbRoom.id);
  assert(membersAfterCreate.length === 1, 'Supabase room_members contains exactly 1 member');
  assert(membersAfterCreate[0].role === 'host', 'Host registered in room_members with role host');
  assert(membersAfterCreate[0].player_id === hostPlayerId, 'Host player_id in room_members matches');

  // --------------------------------------------------------------------------
  // TEST 2: Guest Joins Room & Supabase Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Guest Joining & Database Persistence ---');
  const guestSocket = createClientSocket();
  await new Promise((res) => guestSocket.on('connect', res));

  const guestUserId = `user_guest_${Date.now()}`;
  const guestPlayerId = `p_guest_${Date.now()}`;
  const guestProfileData = {
    colorScheme: 'golden_warmth',
    clothingColor: '#f59e0b',
    hairColor: '#451a03',
    skinColor: '#fed7aa',
  };

  const joinRes = await new Promise((resolve) => {
    guestSocket.emit('room:join', {
      roomCode,
      userId: guestUserId,
      playerId: guestPlayerId,
      characterName: 'StarlightGuest',
      characterData: guestProfileData,
    }, resolve);
  });

  assert(joinRes.success === true, 'Guest socket room:join response is successful');
  assert(joinRes.player.isHost === false, 'Guest player marked as non-host');

  // Verify in live Supabase database
  await wait(300);
  const dbRoomAfterJoin = await supabaseService.getRoomByCode(roomCode);
  assert(dbRoomAfterJoin.guest_player_id === guestPlayerId, 'Supabase rooms.guest_player_id updated with guest ID');
  assert(dbRoomAfterJoin.status === 'READY', 'Supabase rooms.status transitioned to READY');

  const guestProfile = await supabaseService.getProfile(guestUserId);
  assert(guestProfile !== null && guestProfile.display_name === 'StarlightGuest', 'Guest profile saved in Supabase profiles');

  const membersAfterJoin = await supabaseService.getMembers(dbRoom.id);
  assert(membersAfterJoin.length === 2, 'Supabase room_members contains exactly 2 members (Host + Guest)');
  assert(membersAfterJoin.some((m) => m.role === 'host' && m.player_id === hostPlayerId), 'Host member verified in DB');
  assert(membersAfterJoin.some((m) => m.role === 'guest' && m.player_id === guestPlayerId), 'Guest member verified in DB');

  // --------------------------------------------------------------------------
  // TEST 3: Strict Third-Player Rejection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Strict Third-Player Rejection (STRICTLY 2 Players) ---');
  const intruderSocket = createClientSocket();
  await new Promise((res) => intruderSocket.on('connect', res));

  const intruderRes = await new Promise((resolve) => {
    intruderSocket.emit('room:join', {
      roomCode,
      userId: `user_intruder_${Date.now()}`,
      playerId: `p_intruder_${Date.now()}`,
      characterName: 'Intruder',
      characterData: { colorScheme: 'sunset_pink' },
    }, resolve);
  });

  assert(intruderRes.success === false, 'Third player join was rejected');
  assert(intruderRes.error === 'ROOM_FULL', 'Rejection error code is strictly ROOM_FULL');

  // Confirm DB still has exactly 2 members
  const membersAfterIntruder = await supabaseService.getMembers(dbRoom.id);
  assert(membersAfterIntruder.length === 2, 'Supabase room_members strictly preserves 2 members count');

  // --------------------------------------------------------------------------
  // TEST 4: Room Lifecycle Status Transitions
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Room Lifecycle Status Transitions ---');
  // Transition to IN_THEATRE
  hostSocket.emit('theatre:enter');
  await wait(300);

  const dbRoomInTheatre = await supabaseService.getRoomByCode(roomCode);
  assert(dbRoomInTheatre.status === 'IN_THEATRE', 'Supabase rooms.status transitioned to IN_THEATRE');

  // Transition to WATCHING on play
  hostSocket.emit('movie:sync', {
    action: 'PLAY',
    currentTime: 10,
    timestamp: Date.now(),
  });
  await wait(300);

  const dbRoomWatching = await supabaseService.getRoomByCode(roomCode);
  assert(dbRoomWatching.status === 'WATCHING', 'Supabase rooms.status transitioned to WATCHING');

  // --------------------------------------------------------------------------
  // TEST 5: Browser Refresh & Reconnection (No Duplicates, Profile Restored)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Browser Refresh & Session Reconnection ---');
  // Disconnect guest socket
  guestSocket.disconnect();
  await wait(200);

  // New guest socket simulating page refresh
  const reconnectedGuestSocket = createClientSocket();
  await new Promise((res) => reconnectedGuestSocket.on('connect', res));

  const reconnectRes = await new Promise((resolve) => {
    reconnectedGuestSocket.emit('room:reconnect', {
      roomCode,
      playerId: guestPlayerId,
    }, resolve);
  });

  assert(reconnectRes.success === true, 'Guest successfully reconnected to room');
  assert(reconnectRes.player.playerId === guestPlayerId, 'Reconnected guest player identity preserved');
  assert(reconnectRes.player.characterName === 'StarlightGuest', 'Guest character profile restored from database');

  // Verify NO duplicate records created in Supabase
  await wait(300);
  const membersAfterReconnect = await supabaseService.getMembers(dbRoom.id);
  assert(membersAfterReconnect.length === 2, 'Supabase room_members still contains exactly 2 members (zero duplicate rows)');

  // --------------------------------------------------------------------------
  // TEST 6: Room Closure Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Room Closure Persistence ---');
  hostSocket.disconnect();
  reconnectedGuestSocket.disconnect();
  intruderSocket.disconnect();
  await wait(500);

  // Close room cleanly
  await supabaseService.closeRoom(roomCode);
  const dbRoomClosed = await supabaseService.getRoomByCode(roomCode);
  assert(dbRoomClosed.status === 'CLOSED', 'Supabase rooms.status is CLOSED upon closure');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} / ${total} PERSISTENCE INTEGRATION TESTS PASSED!`);
  console.log('====================================================\n');

  httpServer.close();
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test Suite Failed:', err);
  httpServer.close();
  process.exit(1);
}
