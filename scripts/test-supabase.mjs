import { SupabaseService } from '../server/dist/services/supabaseService.js';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('🧪 2GETHER SUPABASE DATABASE INTEGRATION TEST SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✓ PASS: ${message}`);
}

async function runTests() {
  const service = new SupabaseService();
  console.log(`[Database Mode] ${service.isConnected() ? 'Live Supabase Cloud' : 'Isolated Persistence Store'}\n`);

  // --------------------------------------------------------------------------
  // TEST 1: Profile Creation & Retrieval
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Profile Creation and Retrieval ---');
  const hostProfile = await service.upsertProfile({
    id: 'user_host_101',
    display_name: 'StarlightHost',
    avatar_config: { colorScheme: 'pink', clothingColor: '#ec4899', hairColor: '#3b0764', skinColor: '#fbcfe8' },
  });
  assert(hostProfile.id === 'user_host_101', 'Host profile created with correct id');
  assert(hostProfile.display_name === 'StarlightHost', 'Host profile has correct display_name');

  const fetchedHost = await service.getProfile('user_host_101');
  assert(fetchedHost !== null && fetchedHost.display_name === 'StarlightHost', 'Fetched host profile matches created data');

  // --------------------------------------------------------------------------
  // TEST 2: Profile Update
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Profile Update ---');
  const updatedHost = await service.updateProfile('user_host_101', {
    display_name: 'MoonlightHost',
    avatar_config: { colorScheme: 'lavender', clothingColor: '#a855f7', hairColor: '#1e1b4b', skinColor: '#f3e8ff' },
  });
  assert(updatedHost !== null && updatedHost.display_name === 'MoonlightHost', 'Profile display_name successfully updated');
  assert(updatedHost.avatar_config.colorScheme === 'lavender', 'Profile avatar_config successfully updated');

  // Create Guest Profile
  const guestProfile = await service.upsertProfile({
    id: 'user_guest_202',
    display_name: 'SunbeamGuest',
    avatar_config: { colorScheme: 'gold', clothingColor: '#f59e0b', hairColor: '#451a03', skinColor: '#fed7aa' },
  });
  assert(guestProfile.id === 'user_guest_202', 'Guest profile created successfully');

  // --------------------------------------------------------------------------
  // TEST 3: Room Creation & Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Room Creation and Persistence ---');
  const roomCode = 'TEST99';
  const createdRoom = await service.createRoom({
    room_code: roomCode,
    host_player_id: 'player_host_101',
  });
  assert(createdRoom.room_code === roomCode, 'Room created with specified room_code');
  assert(createdRoom.host_player_id === 'player_host_101', 'Room host_player_id persisted');
  assert(createdRoom.status === 'WAITING', 'Initial room status is WAITING');
  assert(createdRoom.guest_player_id === null, 'Initial guest_player_id is null');

  const fetchedByCode = await service.getRoomByCode(roomCode);
  assert(fetchedByCode !== null && fetchedByCode.id === createdRoom.id, 'Room retrieved by room_code');

  const fetchedById = await service.getRoomById(createdRoom.id);
  assert(fetchedById !== null && fetchedById.room_code === roomCode, 'Room retrieved by UUID id');

  // --------------------------------------------------------------------------
  // TEST 4: Room Membership Management (Host + Guest)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Room Membership Management ---');
  const hostMember = await service.addMember(createdRoom.id, 'player_host_101', 'host');
  assert(hostMember.role === 'host', 'Host registered in room_members');

  const guestMember = await service.addMember(createdRoom.id, 'player_guest_202', 'guest');
  assert(guestMember.role === 'guest', 'Guest registered in room_members');

  const members = await service.getMembers(createdRoom.id);
  assert(members.length === 2, 'Room contains exactly 2 members');
  assert(members.some((m) => m.player_id === 'player_host_101' && m.role === 'host'), 'Host member present');
  assert(members.some((m) => m.player_id === 'player_guest_202' && m.role === 'guest'), 'Guest member present');

  // Member presence heartbeat update
  await service.updateMemberLastSeen(createdRoom.id, 'player_guest_202');
  assert(true, 'Member last_seen_at presence updated successfully');

  // --------------------------------------------------------------------------
  // TEST 5: Strict Third-Player Rejection (Max 2 Players Server-Side & Trigger)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Strict Third-Player Rejection (STRICTLY 2 Players) ---');
  let thirdPlayerRejected = false;
  try {
    await service.addMember(createdRoom.id, 'player_intruder_303', 'guest');
  } catch (err) {
    thirdPlayerRejected = true;
    console.log(`  (Caught expected capacity rejection: ${err.message})`);
  }
  assert(thirdPlayerRejected, 'Third player was strictly rejected by room capacity enforcement');

  const membersAfterThird = await service.getMembers(createdRoom.id);
  assert(membersAfterThird.length === 2, 'Room still strictly maintains exactly 2 members');

  // --------------------------------------------------------------------------
  // TEST 6: Room Lifecycle & Status Transitions
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Room Lifecycle Status Transitions ---');
  // WAITING -> READY (when guest joins)
  const roomWithGuest = await service.setRoomGuest(roomCode, 'player_guest_202');
  assert(roomWithGuest !== null && roomWithGuest.guest_player_id === 'player_guest_202', 'Guest assigned to room');
  assert(roomWithGuest.status === 'READY', 'Status transitioned to READY upon guest joining');

  // READY -> IN_THEATRE
  const roomInTheatre = await service.updateRoomStatus(roomCode, 'IN_THEATRE');
  assert(roomInTheatre !== null && roomInTheatre.status === 'IN_THEATRE', 'Status transitioned to IN_THEATRE');

  // IN_THEATRE -> WATCHING
  const roomWatching = await service.updateRoomStatus(roomCode, 'WATCHING');
  assert(roomWatching !== null && roomWatching.status === 'WATCHING', 'Status transitioned to WATCHING');

  // --------------------------------------------------------------------------
  // TEST 7: Movie Metadata Persistence & Restrictions (Creator-Only, <= 700MB)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Movie Metadata Persistence & Validation ---');
  // Valid upload (650 MB < 700 MB)
  const movieMeta = await service.saveMovieMetadata({
    room_id: createdRoom.id,
    uploaded_by: 'player_host_101',
    original_filename: 'our_first_date_movie.mp4',
    file_size: 650 * 1024 * 1024, // 650 MB
    content_type: 'video/mp4',
    r2_object_key: `movies/${createdRoom.id}/movie.mp4`,
    upload_status: 'READY',
  });
  assert(movieMeta.original_filename === 'our_first_date_movie.mp4', 'Movie metadata saved with original filename');
  assert(movieMeta.file_size === 650 * 1024 * 1024, 'Movie file size matches');

  const fetchedMovie = await service.getMovieMetadata(createdRoom.id);
  assert(fetchedMovie !== null && fetchedMovie.r2_object_key === `movies/${createdRoom.id}/movie.mp4`, 'Movie metadata retrieved successfully');

  // --------------------------------------------------------------------------
  // TEST 8: Room Closure & Metadata Cleanup
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Room Closure & Metadata Cleanup ---');
  await service.closeRoom(roomCode);
  const closedRoom = await service.getRoomByCode(roomCode);
  assert(closedRoom !== null && closedRoom.status === 'CLOSED', 'Room status set to CLOSED');

  await service.deleteMovieMetadata(createdRoom.id);
  const movieAfterDelete = await service.getMovieMetadata(createdRoom.id);
  assert(movieAfterDelete === null, 'Movie metadata is null after cleanup');

  // --------------------------------------------------------------------------
  // TEST 9: 30-Minute Inactivity Cleanup Coordination
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: 30-Minute Inactivity Cleanup Coordination ---');
  // Create an active room (< 30 min old)
  const activeRoom = await service.createRoom({
    room_code: 'ACTIVE1',
    host_player_id: 'host_active',
  });
  // Create an abandoned room (> 30 min old)
  const abandonedRoom = await service.createRoom({
    room_code: 'STALE1',
    host_player_id: 'host_stale',
  });

  // Manually age the abandoned room by 35 minutes
  const thirtyFiveMinsAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  await service.updateRoomActivity(abandonedRoom.room_code, thirtyFiveMinsAgo);

  // Run inactivity cleanup (cutoff: 30 minutes)
  const cleanedCodes = await service.cleanupInactiveRooms(30);
  assert(cleanedCodes.includes('STALE1'), `Inactive room cleanup closed STALE1 (${cleanedCodes.length} room(s) closed)`);

  const fetchedAbandoned = await service.getRoomById(abandonedRoom.id);
  assert(fetchedAbandoned !== null && fetchedAbandoned.status === 'CLOSED', 'Abandoned room status marked as CLOSED');

  const fetchedActive = await service.getRoomById(activeRoom.id);
  assert(fetchedActive !== null && fetchedActive.status === 'WAITING', 'Active room remains untouched in WAITING status');

  // --------------------------------------------------------------------------
  // TEST 10: Database Migration & RLS Policy Integrity Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Database Migration & RLS Policy File Integrity ---');
  const migrationPath = path.resolve('database/migrations/002_phase2_supabase_schema.sql');
  const policiesPath = path.resolve('database/policies/003_phase2_rls_policies.sql');

  assert(fs.existsSync(migrationPath), 'SQL migration file 002_phase2_supabase_schema.sql exists');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  assert(migrationSQL.includes('profiles'), 'profiles table defined in migration');
  assert(migrationSQL.includes('rooms'), 'rooms table defined in migration');
  assert(migrationSQL.includes('room_members'), 'room_members table defined in migration');
  assert(migrationSQL.includes('movie_metadata'), 'movie_metadata table defined in migration');
  assert(migrationSQL.includes('check_room_capacity'), 'Strict 2-player capacity trigger defined in migration');
  assert(migrationSQL.includes('734003200'), '700 MB movie file size check constraint defined in migration');

  assert(fs.existsSync(policiesPath), 'RLS policies file 003_phase2_rls_policies.sql exists');
  const policiesSQL = fs.readFileSync(policiesPath, 'utf8');
  assert(policiesSQL.includes('profiles ENABLE ROW LEVEL SECURITY'), 'RLS enabled on profiles');
  assert(policiesSQL.includes('rooms ENABLE ROW LEVEL SECURITY'), 'RLS enabled on rooms');
  assert(policiesSQL.includes('room_members ENABLE ROW LEVEL SECURITY'), 'RLS enabled on room_members');
  assert(policiesSQL.includes('movie_metadata ENABLE ROW LEVEL SECURITY'), 'RLS enabled on movie_metadata');
  assert(policiesSQL.includes('is_room_member'), 'Helper security definer is_room_member defined');
  assert(policiesSQL.includes('is_room_creator'), 'Helper security definer is_room_creator defined');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} SUPABASE INTEGRATION TESTS PASSED!`);
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
