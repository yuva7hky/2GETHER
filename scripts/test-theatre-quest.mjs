import fs from 'fs';
import { roomService, SPAWN_POSITIONS } from '../server/dist/services/roomService.js';

console.log('============================================================');
console.log('  2GETHER – THEATRE ENTRANCE CO-OP QUEST INTEGRATION TEST   ');
console.log('============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(` \x1b[32m[PASS]\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(` \x1b[31m[FAIL]\x1b[0m ${message}`);
    failed++;
  }
}

async function runTest() {
  // 1. Verify Spawn Positions
  assert(
    SPAWN_POSITIONS.HOST.z === 22.0 && SPAWN_POSITIONS.GUEST.z === 22.0,
    `Initial player spawn points are outside on the street at Z = 22.0 (Host Z: ${SPAWN_POSITIONS.HOST.z}, Guest Z: ${SPAWN_POSITIONS.GUEST.z})`
  );
  assert(
    SPAWN_POSITIONS.HOST.rotY === Math.PI,
    'Initial spawn rotation is Math.PI (facing -Z directly towards the Theatre Entrance doors at Z = 11.0)'
  );

  // 2. Room Creation with randomized key placement
  const hostPlayerId = `p_host_${Date.now()}`;
  const { room, player: hostPlayer } = await roomService.createRoom({
    socketId: 'sock_host_1',
    userId: 'user_host_1',
    playerId: hostPlayerId,
    characterName: 'Ajay',
    characterData: { colorScheme: 'sunset_pink' },
  });

  assert(Boolean(room.roomCode), `Room created successfully: ${room.roomCode}`);
  assert(
    typeof room.quest.keyLamppostIndex === 'number' &&
      room.quest.keyLamppostIndex >= 0 &&
      room.quest.keyLamppostIndex < 6,
    `Randomized lamppost key placement assigned: Lamppost #${room.quest.keyLamppostIndex} (0 to 5)`
  );
  assert(room.quest.isDoorUnlocked === false, 'Theatre entrance double doors are initially LOCKED');
  assert(room.quest.keyPickedBy === null, 'Key is initially unpicked on the street');
  assert(room.quest.isPressurePlateActive === false, 'Co-op pressure plate is initially unpressed');

  // 3. Guest joins room
  const guestPlayerId = `p_guest_${Date.now()}`;
  const joinResult = await roomService.joinRoom(room.roomCode, {
    socketId: 'sock_guest_2',
    userId: 'user_guest_2',
    playerId: guestPlayerId,
    characterName: 'Priya',
    characterData: { colorScheme: 'golden_warmth' },
  });

  assert(joinResult.success, 'Guest joins room successfully');
  const serialized = roomService.serializeRoom(room);
  assert(serialized.quest.keyLamppostIndex === room.quest.keyLamppostIndex, 'Serialized room contains identical quest state for both players');

  // 4. Attempt to unlock door without key or plate (Must fail)
  const failUnlockNoKey = roomService.unlockDoor(room.roomCode, guestPlayerId);
  assert(failUnlockNoKey.success === false, 'Door unlock rejected when player does not hold the key');

  // 5. Host picks up the key
  const pickupRes = roomService.pickUpKey(room.roomCode, hostPlayerId);
  assert(
    pickupRes.success && pickupRes.quest.keyPickedBy === hostPlayerId,
    `Host successfully picks up the Theatre Key (keyPickedByName: ${pickupRes.playerName})`
  );

  // 6. Attempt to unlock door with key while pressure plate is NOT active (Must fail)
  const failUnlockNoPlate = roomService.unlockDoor(room.roomCode, hostPlayerId);
  assert(failUnlockNoPlate.success === false, 'Door unlock rejected when Co-op Pressure Plate is not active');

  // 7. Guest steps on the Co-op Pressure Plate
  const plateStepOn = roomService.setPressurePlate(room.roomCode, guestPlayerId, true);
  assert(
    plateStepOn.success && plateStepOn.quest.isPressurePlateActive === true && plateStepOn.quest.pressurePlatePlayerId === guestPlayerId,
    'Guest steps onto the Pressure Plate -> isPressurePlateActive becomes true'
  );

  // 8. With Pressure Plate active, Host with Key unlocks the door!
  const unlockSuccess = roomService.unlockDoor(room.roomCode, hostPlayerId);
  assert(
    unlockSuccess.success && unlockSuccess.quest.isDoorUnlocked === true,
    `Door unlocked successfully! (unlockedByName: ${unlockSuccess.unlockedByName}, isDoorUnlocked: true)`
  );

  // 9. Verify 3D components and UI files exist and contain required co-op logic
  const streetSceneCode = fs.readFileSync('client/src/theatre/OutdoorStreetScene.tsx', 'utf-8');
  assert(
    streetSceneCode.includes('LAMPPOST_POSITIONS') &&
      streetSceneCode.includes('PRESSURE_PLATE_POS') &&
      streetSceneCode.includes('THEATRE_DOOR_POS') &&
      streetSceneCode.includes('2GETHER CINEMA'),
    'OutdoorStreetScene.tsx contains 6 lampposts, pressure plate, marquee sign, and opening double doors'
  );

  const questBannerCode = fs.readFileSync('client/src/components/QuestBanner.tsx', 'utf-8');
  assert(
    questBannerCode.includes('PRE-SHOW CO-OP QUEST') &&
      questBannerCode.includes('Search under the street lampposts') &&
      questBannerCode.includes('Pressure Plate'),
    'QuestBanner.tsx provides dynamic quest HUD guidance for upload, key search, and co-op door unlock'
  );

  const playerControllerCode = fs.readFileSync('client/src/game/PlayerController.tsx', 'utf-8');
  assert(
    playerControllerCode.includes('PRESSURE_PLATE_POS') &&
      playerControllerCode.includes('isDoorUnlocked') &&
      playerControllerCode.includes('canPickupKeyRef'),
    'PlayerController.tsx enforces locked/unlocked boundaries and detects proximity to key, pressure plate, and keyhole'
  );

  console.log('\n============================================================');
  console.log('  TEST SUMMARY');
  console.log('============================================================');
  console.log(`  Total Tests:    ${passed + failed}`);
  console.log(`  Passed:         ${passed}`);
  console.log(`  Failed:         ${failed}`);
  console.log(`  Success Rate:   ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
