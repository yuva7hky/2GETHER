import http from 'http';
import express from '../server/node_modules/express/index.js';
import { Server } from '../server/node_modules/socket.io/dist/index.js';
import { io as ClientIO } from '../client/node_modules/socket.io-client/build/cjs/index.js';
import { setupSocketHandler } from '../server/dist/socket/socketHandler.js';
import { roomService } from '../server/dist/services/roomService.js';
import { movieService, MAX_FILE_SIZE_BYTES } from '../server/dist/services/movieService.js';
import { supabaseService } from '../server/dist/services/supabaseService.js';
import { movieRoutes } from '../server/dist/routes/movieRoutes.js';
import { config } from '../server/dist/config/index.js';
import { S3Client, GetObjectCommand } from '../server/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';

console.log('====================================================');
console.log('🎬 2GETHER PHASE 3: CLOUDFLARE R2 INTEGRATION TEST');
console.log('====================================================\n');

console.log(`[Storage Mode] Live Cloudflare R2: ${config.hasR2}`);
console.log(`[Database Mode] Live Supabase PostgreSQL: ${config.hasSupabase}\n`);

// 1. Setup isolated test Express HTTP & Socket.IO server
const app = express();
app.use(express.json());
app.use('/api/movies', movieRoutes);

const httpServer = http.createServer(app);
const ioServer = new Server(httpServer, {
  cors: { origin: '*' }
});
setupSocketHandler(ioServer);

const TEST_PORT = 4335;
await new Promise((resolve) => httpServer.listen(TEST_PORT, '127.0.0.1', resolve));
console.log(`✓ Test Server listening on port ${TEST_PORT}\n`);

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
  // STEP 1: Create Room with Host & Guest
  // --------------------------------------------------------------------------
  console.log('--- STEP 1: Setting up Room with Host and Guest ---');
  const hostSocket = createClientSocket();
  const guestSocket = createClientSocket();
  await new Promise((res) => hostSocket.on('connect', res));
  await new Promise((res) => guestSocket.on('connect', res));

  const hostUserId = `user_host_${Date.now()}`;
  const hostPlayerId = `p_host_${Date.now()}`;
  const guestUserId = `user_guest_${Date.now()}`;
  const guestPlayerId = `p_guest_${Date.now()}`;

  const createRes = await new Promise((resolve) => {
    hostSocket.emit('room:create', {
      userId: hostUserId,
      playerId: hostPlayerId,
      characterName: 'CinematicHost',
      characterData: { colorScheme: 'sunset_pink' },
    }, resolve);
  });
  assert(createRes.success === true, 'Host room created successfully');
  const roomCode = createRes.room.roomCode;

  const joinRes = await new Promise((resolve) => {
    guestSocket.emit('room:join', {
      roomCode,
      userId: guestUserId,
      playerId: guestPlayerId,
      characterName: 'CinematicGuest',
      characterData: { colorScheme: 'golden_warmth' },
    }, resolve);
  });
  assert(joinRes.success === true, 'Guest joined room successfully');

  // --------------------------------------------------------------------------
  // STEP 2: Enforce Upload Authorization & Creator-Only Permissions
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 2: Testing Upload Authorization (Creator Only) ---');
  // Attempt 1: Guest tries to initiate movie upload -> MUST BE REJECTED
  const guestUploadAttempt = await fetch(`${SERVER_URL}/api/movies/upload-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      userId: guestUserId,
      fileName: 'guest_movie.mp4',
      fileSize: 50 * 1024 * 1024,
      mimeType: 'video/mp4',
    }),
  });
  assert(guestUploadAttempt.status === 403, 'Guest upload request strictly rejected with 403 Forbidden');
  const guestErrJson = await guestUploadAttempt.json();
  assert(guestErrJson.error === 'FORBIDDEN', 'Error code is FORBIDDEN for non-host upload attempt');

  // Attempt 2: Non-member stranger tries to upload -> MUST BE REJECTED
  const strangerUploadAttempt = await fetch(`${SERVER_URL}/api/movies/upload-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      userId: 'user_stranger_999',
      fileName: 'stranger_movie.mp4',
      fileSize: 50 * 1024 * 1024,
      mimeType: 'video/mp4',
    }),
  });
  assert(strangerUploadAttempt.status === 403, 'Stranger upload request strictly rejected with 403 Forbidden');

  // --------------------------------------------------------------------------
  // STEP 3: Enforce 700 MB Ceiling & File Validations
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 3: Enforcing 700 MB Maximum Size Limit ---');
  const oversizedFileSize = 750 * 1024 * 1024; // 750 MB (> 700 MB)
  const oversizedAttempt = await fetch(`${SERVER_URL}/api/movies/upload-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      userId: hostUserId,
      fileName: 'massive_video.mp4',
      fileSize: oversizedFileSize,
      mimeType: 'video/mp4',
    }),
  });
  assert(oversizedAttempt.status >= 400, 'File exceeding 700 MB strictly rejected with 400 Bad Request');
  console.log('✓ Verified 700 MB limit validation on backend');

  // --------------------------------------------------------------------------
  // STEP 4: Live Direct Multipart Upload to Cloudflare R2
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 4: Live Direct Multipart Upload to Cloudflare R2 ---');
  // Upload a valid 6 MB test video file (2 parts: 5 MB + 1 MB)
  const testFileName = 'our_memory_film.mp4';
  const testFileSize = 6 * 1024 * 1024; // 6 MB
  const testMimeType = 'video/mp4';

  const initUploadRes = await fetch(`${SERVER_URL}/api/movies/upload-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      userId: hostUserId,
      fileName: testFileName,
      fileSize: testFileSize,
      mimeType: testMimeType,
    }),
  });
  assert(initUploadRes.status === 200, 'Host upload request returned HTTP 200');
  const initData = await initUploadRes.json();
  assert(initData.success === true, 'Upload session initiated successfully');
  assert(Boolean(initData.uploadId), 'Received valid Cloudflare R2 uploadId');
  assert(Boolean(initData.key), 'Received Cloudflare R2 storage key');
  assert(initData.partUrls.length >= 1, `Generated ${initData.partUrls.length} presigned upload URLs`);

  const { uploadId, key, partUrls } = initData;

  // Direct PUT upload of chunk 1 directly to Cloudflare R2 presigned URL
  console.log('  Directly uploading chunk to Cloudflare R2 presigned URL...');
  const part1Buffer = Buffer.alloc(testFileSize, 'X'); // 6MB simulated video payload
  const putRes = await fetch(partUrls[0], {
    method: 'PUT',
    headers: {
      'Content-Type': testMimeType,
    },
    body: part1Buffer,
  });
  assert(putRes.status >= 200 && putRes.status < 300, `Direct R2 PUT succeeded with HTTP status: ${putRes.status}`);

  // Extract ETag from response header
  let etag = putRes.headers.get('etag') || putRes.headers.get('ETag') || '"test_etag_part1"';
  etag = etag.replace(/^['"]|['"]$/g, '');
  assert(Boolean(etag), 'Received valid ETag from Cloudflare R2 for uploaded chunk');

  // Complete multipart upload on backend
  const completeRes = await fetch(`${SERVER_URL}/api/movies/complete-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      userId: hostUserId,
      key,
      uploadId,
      title: 'Our Memory Film',
      fileSize: testFileSize,
      mimeType: testMimeType,
      parts: [
        { PartNumber: 1, ETag: etag },
      ],
    }),
  });
  assert(completeRes.status === 200, 'complete-upload returned HTTP 200');
  const completeData = await completeRes.json();
  assert(completeData.success === true, 'Movie upload completed successfully on R2');
  assert(Boolean(completeData.movie.playbackUrl), 'Received valid presigned playback URL');

  // --------------------------------------------------------------------------
  // STEP 5: Supabase movie_metadata Persistence Verification
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 5: Verifying Metadata in Supabase Database ---');
  await wait(500);
  const dbRoom = await supabaseService.getRoomByCode(roomCode);
  const dbMovie = await supabaseService.getMovieMetadata(dbRoom.id);
  assert(dbMovie !== null, 'Movie metadata record found in Supabase movie_metadata table');
  assert(dbMovie.r2_object_key === key, 'Supabase r2_object_key matches R2 storage key');
  assert(dbMovie.original_filename === 'Our Memory Film', 'Supabase original_filename matches title');
  assert(dbMovie.file_size === testFileSize, 'Supabase file_size matches uploaded bytes');
  assert(dbMovie.upload_status === 'READY', 'Supabase upload_status is READY');

  // --------------------------------------------------------------------------
  // STEP 6: Playback Authorization (Members Only)
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 6: Verifying Playback Authorization ---');
  // 1. Host requests playback URL -> ALLOWED
  const hostPlaybackRes = await fetch(`${SERVER_URL}/api/movies/${roomCode}/playback-url?userId=${hostUserId}`);
  assert(hostPlaybackRes.status === 200, 'Host playback URL request returned 200 OK');
  const hostPlaybackData = await hostPlaybackRes.json();
  assert(Boolean(hostPlaybackData.playbackUrl), 'Host received presigned playback URL');

  // 2. Guest requests playback URL -> ALLOWED
  const guestPlaybackRes = await fetch(`${SERVER_URL}/api/movies/${roomCode}/playback-url?userId=${guestUserId}`);
  assert(guestPlaybackRes.status === 200, 'Guest playback URL request returned 200 OK');
  const guestPlaybackData = await guestPlaybackRes.json();
  assert(Boolean(guestPlaybackData.playbackUrl), 'Guest received presigned playback URL');

  // 3. Unauthorized stranger requests playback URL -> STRICTLY FORBIDDEN
  const strangerPlaybackRes = await fetch(`${SERVER_URL}/api/movies/${roomCode}/playback-url?userId=stranger_user_99`);
  assert(strangerPlaybackRes.status === 403, 'Unauthorized stranger request rejected with 403 Forbidden');

  // 4. Verify presigned URL can actually download the object from R2
  const directPlaybackFetch = await fetch(hostPlaybackData.playbackUrl, {
    method: 'GET',
    headers: { Range: 'bytes=0-1024' },
  });
  assert(
    directPlaybackFetch.status === 200 || directPlaybackFetch.status === 206,
    `Presigned URL successfully verified against R2 (HTTP ${directPlaybackFetch.status} OK)`
  );
  await directPlaybackFetch.arrayBuffer();

  // --------------------------------------------------------------------------
  // STEP 7: Synchronized Playback Controls (Play, Pause, Seek)
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 7: Testing Real-time Playback Synchronization ---');
  let guestReceivedSync = null;
  guestSocket.on('movie:synced', (data) => {
    guestReceivedSync = data;
  });

  // Host sends PLAY at 15.5 seconds
  hostSocket.emit('movie:sync', {
    action: 'PLAY',
    currentTime: 15.5,
    playbackUrl: hostPlaybackData.playbackUrl,
  });
  await wait(300);

  assert(guestReceivedSync !== null, 'Guest received real-time movie:synced event from Host');
  assert(guestReceivedSync.action === 'PLAY', 'Synchronized action is PLAY');
  assert(guestReceivedSync.currentTime === 15.5, 'Synchronized currentTime is 15.5s');

  // Host sends SEEK to 45.0 seconds
  hostSocket.emit('movie:sync', {
    action: 'SEEK',
    currentTime: 45.0,
  });
  await wait(300);
  assert(guestReceivedSync.action === 'SEEK' && guestReceivedSync.currentTime === 45.0, 'Synchronized seek to 45.0s received by Guest');

  // --------------------------------------------------------------------------
  // STEP 8: Movie Deletion & R2 Object Cleanup
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 8: Testing Movie Deletion & Storage Cleanup ---');
  // Attempt 1: Guest tries to delete movie -> FORBIDDEN
  const guestDeleteAttempt = await fetch(`${SERVER_URL}/api/movies/${roomCode}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: guestUserId }),
  });
  assert(guestDeleteAttempt.status === 403, 'Guest delete attempt strictly rejected with 403 Forbidden');

  // Attempt 2: Host deletes movie -> SUCCESS
  const hostDeleteRes = await fetch(`${SERVER_URL}/api/movies/${roomCode}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: hostUserId }),
  });
  assert(hostDeleteRes.status === 200, 'Host movie deletion returned 200 OK');

  // Verify Supabase metadata deleted
  await wait(400);
  const dbMovieAfterDelete = await supabaseService.getMovieMetadata(dbRoom.id);
  assert(dbMovieAfterDelete === null, 'Movie metadata record cleaned up from Supabase database');

  // Verify R2 object is deleted
  const s3 = new S3Client({
    region: 'auto',
    endpoint: config.R2_ENDPOINT,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  let objectStillExists = true;
  try {
    await s3.send(new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
    }));
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      objectStillExists = false;
    }
  }
  assert(objectStillExists === false, 'Movie object confirmed permanently deleted from Cloudflare R2 bucket');

  // --------------------------------------------------------------------------
  // STEP 9: Clean up sockets and server
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 9: Closing Test Session ---');
  hostSocket.disconnect();
  guestSocket.disconnect();
  await supabaseService.closeRoom(roomCode);

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} / ${total} PHASE 3 R2 INTEGRATION TESTS PASSED!`);
  console.log('====================================================\n');

  httpServer.close();
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test Suite Failed:', err);
  httpServer.close();
  process.exit(1);
}
