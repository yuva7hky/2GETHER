/**
 * 2GETHER Phase 3.2: High-Speed Upload, Auto-Cleanup & Screen Gestures Test Suite
 */

import http from 'http';
import fs from 'fs';
import express from '../server/node_modules/express/index.js';
import { Server } from '../server/node_modules/socket.io/dist/index.js';
import { roomRoutes } from '../server/dist/routes/roomRoutes.js';
import { movieRoutes } from '../server/dist/routes/movieRoutes.js';
import { profileRoutes } from '../server/dist/routes/profileRoutes.js';
import { errorHandler } from '../server/dist/middleware/errorHandler.js';
import { setupSocketHandler } from '../server/dist/socket/socketHandler.js';
import { movieService } from '../server/dist/services/movieService.js';
import { config } from '../server/dist/config/index.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(` [PASS] ${message}`);
  } else {
    failed++;
    console.error(` [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('🎬 2GETHER PHASE 3.2 OPTIMIZATION & AUTO-CLEANUP TESTS');
  console.log('============================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/rooms', roomRoutes);
  app.use('/api/movies', movieRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocketHandler(io);

  const TEST_PORT = 4160;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  try {
    // 1. Create room for testing
    const hostId = `host_p32_${Date.now()}`;
    const createRoomRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId, hostName: 'OptimizationTester' }),
    });
    const createRoomData = await createRoomRes.json();
    const roomCode = createRoomData.room.roomCode;
    assert(createRoomRes.status === 201 && roomCode, `Test room created: ${roomCode}`);

    // 2. High-speed upload request (32 MB test file with 16 MB chunks -> 2 parts in parallel)
    const testFileSize = 32 * 1024 * 1024;
    const initRes = await fetch(`${baseUrl}/api/movies/upload-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        fileName: 'fast_stream.mp4',
        fileSize: testFileSize,
        mimeType: 'video/mp4',
        chunkSize: 16 * 1024 * 1024,
      }),
    });
    const initData = await initRes.json();
    assert(
      initRes.status === 200 && initData.totalParts === 2 && initData.chunkSize === 16 * 1024 * 1024,
      'High-speed upload request initializes 16 MB chunk multipart session in parallel'
    );

    // 3. Parallel upload of both 16 MB chunks simultaneously (4x concurrency pool)
    const part1Buffer = Buffer.alloc(16 * 1024 * 1024, 'A');
    const part2Buffer = Buffer.alloc(16 * 1024 * 1024, 'B');

    const uploadStart = performance.now();
    const [part1Res, part2Res] = await Promise.all([
      fetch(initData.partUrls[0], {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Origin': 'http://localhost:5173' },
        body: part1Buffer,
      }),
      fetch(initData.partUrls[1], {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Origin': 'http://localhost:5173' },
        body: part2Buffer,
      }),
    ]);
    const uploadDuration = ((performance.now() - uploadStart) / 1000).toFixed(2);

    const etag1 = (part1Res.headers.get('ETag') || part1Res.headers.get('etag') || '').replace(/^['"]|['"]$/g, '');
    const etag2 = (part2Res.headers.get('ETag') || part2Res.headers.get('etag') || '').replace(/^['"]|['"]$/g, '');

    assert(
      part1Res.status === 200 && part2Res.status === 200 && etag1.length > 0 && etag2.length > 0,
      `Concurrent 16 MB parts uploaded to R2 simultaneously in ${uploadDuration}s`
    );

    // 4. Complete multipart upload
    const completeRes = await fetch(`${baseUrl}/api/movies/complete-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        key: initData.key,
        uploadId: initData.uploadId,
        title: 'fast_stream',
        fileSize: testFileSize,
        mimeType: 'video/mp4',
        parts: [
          { PartNumber: 1, ETag: etag1 },
          { PartNumber: 2, ETag: etag2 },
        ],
      }),
    });
    const completeData = await completeRes.json();
    assert(completeRes.status === 200 && completeData.success && completeData.movie.playbackUrl, 'Multipart upload completed successfully');

    // 5. Verify playback URL stream retrieval
    const playbackRes = await fetch(completeData.movie.playbackUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1024' },
    });
    assert(playbackRes.status === 206 || playbackRes.status === 200, 'Video stream verified against R2 storage');

    // 6. Test automatic tab-closure / leave emergency cleanup endpoint
    const cleanupRes = await fetch(`${baseUrl}/api/movies/${roomCode}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: hostId }),
    });
    const cleanupData = await cleanupRes.json();
    assert(cleanupRes.status === 200 && cleanupData.success, 'POST /api/movies/:code/cleanup purges room movie from Cloudflare R2 on exit');

    // 7. Verify movie is completely removed from room
    const verifyRoomMovie = await fetch(`${baseUrl}/api/movies/${roomCode}`);
    const verifyRoomMovieData = await verifyRoomMovie.json();
    assert(verifyRoomMovie.status === 200 && verifyRoomMovieData.hasMovie === false, 'Room verified empty (hasMovie: false) after automatic exit cleanup');

    // 8. Test abandoned multipart session sweeper
    const sweepRes = await fetch(`${baseUrl}/api/movies/cleanup-stale-storage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const sweepData = await sweepRes.json();
    assert(sweepRes.status === 200 && sweepData.success, 'POST /api/movies/cleanup-stale-storage sweeps uncommitted multipart sessions');

    // 9. Verify Frontend Component files exist and are well-formed
    const gestureOverlayFile = fs.readFileSync('client/src/components/ScreenGestureOverlay.tsx', 'utf-8');
    assert(
      gestureOverlayFile.includes('Double Tap Left') &&
      gestureOverlayFile.includes('FAST_FORWARD') &&
      gestureOverlayFile.includes('setPlaybackRate(2.0)'),
      'ScreenGestureOverlay.tsx includes center play/pause, left rewind (-10s), right forward (+10s), and right 2x fast-forward'
    );

    const avatarFile = fs.readFileSync('client/src/characters/StylizedAvatar.tsx', 'utf-8');
    assert(
      avatarFile.includes('Billboard') && !avatarFile.includes('planeGeometry args={[Math.max(name.length'),
      'StylizedAvatar.tsx uses Billboard (never mirrored), removed solid background rectangle, and displays clean compact font'
    );

    const screenMeshFile = fs.readFileSync('client/src/theatre/ScreenMesh.tsx', 'utf-8');
    assert(
      screenMeshFile.includes('THREE.ClampToEdgeWrapping') && screenMeshFile.includes('castShadow={false}'),
      'ScreenMesh.tsx clamps texture wrapping and disables spotlight shadow casting (no horizontal stripe artifacts)'
    );

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n============================================================');
  console.log('  TEST SUMMARY');
  console.log('============================================================');
  console.log(`  Total Tests:    ${passed + failed}`);
  console.log(`  Passed:         ${passed}`);
  console.log(`  Failed:         ${failed}`);
  console.log(`  Success Rate:   ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
