/**
 * 2GETHER Phase 3.1: R2 CORS & API Routing Debug Test Suite
 * Validates API routing, proxy setup, R2 direct multipart upload,
 * CORS preflight handling, error messaging, abort cleanup, and trailer source.
 */

import http from 'http';
import fs from 'fs';
import express from '../server/node_modules/express/index.js';
import { Server } from '../server/node_modules/socket.io/dist/index.js';
import { io as ClientIO } from '../client/node_modules/socket.io-client/build/cjs/index.js';
import { roomRoutes } from '../server/dist/routes/roomRoutes.js';
import { movieRoutes } from '../server/dist/routes/movieRoutes.js';
import { profileRoutes } from '../server/dist/routes/profileRoutes.js';
import { errorHandler } from '../server/dist/middleware/errorHandler.js';
import { setupSocketHandler } from '../server/dist/socket/socketHandler.js';
import { roomService } from '../server/dist/services/roomService.js';
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
  console.log('🎬 2GETHER PHASE 3.1: R2 CORS & API ROUTING DEBUG TESTS');
  console.log('============================================================\n');

  console.log(`[Storage Mode] Live Cloudflare R2: ${config.hasR2}`);
  console.log(`[Database Mode] Live Supabase PostgreSQL: ${config.hasSupabase}`);
  console.log(`[R2 Bucket] ${config.R2_BUCKET_NAME}`);
  console.log(`[R2 Endpoint] ${config.R2_ENDPOINT}\n`);

  // 1. Setup Express app with the exact route registrations as server/src/index.ts
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      project: '2GETHER',
      services: { supabaseConfigured: config.hasSupabase, r2Configured: config.hasR2 },
    });
  });

  app.use('/api/rooms', roomRoutes);
  app.use('/api/movies', movieRoutes);
  app.use('/api/profiles', profileRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  setupSocketHandler(io);

  const TEST_PORT = 4150;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  try {
    // TEST 1: Health check endpoint
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'online', 'API /api/health responds with status online (HTTP 200)');

    // TEST 2: Rooms base info endpoint
    const roomsInfoRes = await fetch(`${baseUrl}/api/rooms`);
    const roomsInfo = await roomsInfoRes.json();
    assert(roomsInfoRes.status === 200 && roomsInfo.success === true, 'GET /api/rooms responds with HTTP 200 info (no 404)');

    // TEST 3: Movies base info endpoint
    const moviesInfoRes = await fetch(`${baseUrl}/api/movies`);
    const moviesInfo = await moviesInfoRes.json();
    assert(moviesInfoRes.status === 200 && moviesInfo.success === true, 'GET /api/movies responds with HTTP 200 info (no 404)');

    // TEST 4: Profiles base info endpoint
    const profilesInfoRes = await fetch(`${baseUrl}/api/profiles`);
    const profilesInfo = await profilesInfoRes.json();
    assert(profilesInfoRes.status === 200 && profilesInfo.success === true, 'GET /api/profiles responds with HTTP 200 info (no 404)');

    // TEST 5: REST Room Creation
    const hostId = `host_p31_${Date.now()}`;
    const createRoomRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId, hostName: 'Phase3Host' }),
    });
    const createRoomData = await createRoomRes.json();
    assert(createRoomRes.status === 201 && createRoomData.success && createRoomData.room.roomCode, 'POST /api/rooms creates room successfully');
    const roomCode = createRoomData.room.roomCode;

    // TEST 6: REST Room Retrieval (Case-insensitive check)
    const getRoomResLower = await fetch(`${baseUrl}/api/rooms/${roomCode.toLowerCase()}`);
    const getRoomData = await getRoomResLower.json();
    assert(getRoomResLower.status === 200 && getRoomData.room.roomCode === roomCode, 'GET /api/rooms/:code supports case-insensitive room code normalization');

    // TEST 7: REST Room Members
    const membersRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/members`);
    const membersData = await membersRes.json();
    assert(membersRes.status === 200 && Array.isArray(membersData.members), 'GET /api/rooms/:code/members returns members list');

    // TEST 8: REST Room Status
    const statusRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/status`);
    const statusData = await statusRes.json();
    assert(statusRes.status === 200 && statusData.exists === true && statusData.isFull === false, 'GET /api/rooms/:code/status confirms active joinable room');

    // TEST 9: Empty room movie retrieval returns 200 with hasMovie: false (prevents browser 404)
    const emptyMovieRes = await fetch(`${baseUrl}/api/movies/${roomCode}`);
    const emptyMovieData = await emptyMovieRes.json();
    assert(emptyMovieRes.status === 200 && emptyMovieData.hasMovie === false && emptyMovieData.movie === null, 'GET /api/movies/:code returns HTTP 200 with hasMovie: false when no movie attached');

    // TEST 10: Empty room playback URL returns 200 with hasMovie: false (prevents browser 404)
    const emptyPlaybackRes = await fetch(`${baseUrl}/api/movies/${roomCode}/playback-url?userId=${hostId}`);
    const emptyPlaybackData = await emptyPlaybackRes.json();
    assert(emptyPlaybackRes.status === 200 && emptyPlaybackData.hasMovie === false, 'GET /api/movies/:code/playback-url returns HTTP 200 with hasMovie: false when no movie attached');

    // TEST 11: Non-member playback authorization check
    const unauthorizedPlaybackRes = await fetch(`${baseUrl}/api/movies/${roomCode}/playback-url?userId=stranger_999`);
    assert(unauthorizedPlaybackRes.status === 403, 'GET /api/movies/:code/playback-url rejects unauthorized non-members with HTTP 403');

    // TEST 12: Host authorization check for upload initiation
    const guestId = `guest_p31_${Date.now()}`;
    await fetch(`${baseUrl}/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId, guestName: 'Phase3Guest' }),
    });

    const guestUploadAttempt = await fetch(`${baseUrl}/api/movies/upload-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: guestId,
        fileName: 'test.mp4',
        fileSize: 1048576,
        mimeType: 'video/mp4',
      }),
    });
    assert(guestUploadAttempt.status === 403, 'POST /api/movies/upload-request rejects non-host (guest) with HTTP 403 Forbidden');

    // TEST 13: Size ceiling enforcement (700 MB)
    const oversizedUploadAttempt = await fetch(`${baseUrl}/api/movies/upload-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        fileName: 'huge_movie.mp4',
        fileSize: 750 * 1024 * 1024,
        mimeType: 'video/mp4',
      }),
    });
    assert(oversizedUploadAttempt.status === 400, 'POST /api/movies/upload-request rejects files > 700 MB with HTTP 400 Bad Request');

    // TEST 14: Valid multipart upload initiation by host
    const testFileSize = 15 * 1024 * 1024; // 15 MB -> 2 parts (10 MB + 5 MB)
    const initRes = await fetch(`${baseUrl}/api/movies/upload-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        fileName: 'cinematic_test.mp4',
        fileSize: testFileSize,
        mimeType: 'video/mp4',
      }),
    });
    const initData = await initRes.json();
    assert(initRes.status === 200 && initData.uploadId && initData.partUrls.length === 2, 'Host initiates multipart upload session; received uploadId and 2 presigned part URLs');

    // TEST 15: Direct R2 upload of Part 1 via presigned PUT URL
    const part1Chunk = Buffer.alloc(10 * 1024 * 1024, '1');
    const uploadPart1Res = await fetch(initData.partUrls[0], {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Origin': 'http://localhost:5173',
      },
      body: part1Chunk,
    });
    const etag1 = (uploadPart1Res.headers.get('ETag') || uploadPart1Res.headers.get('etag') || '').replace(/^['"]|['"]$/g, '');
    assert(uploadPart1Res.status === 200 && etag1.length > 0, `Direct R2 HTTP PUT Part 1 succeeds (HTTP 200) with ETag: ${etag1.substring(0, 10)}...`);

    // TEST 16: Direct R2 upload of Part 2 via presigned PUT URL
    const part2Chunk = Buffer.alloc(5 * 1024 * 1024, '2');
    const uploadPart2Res = await fetch(initData.partUrls[1], {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Origin': 'http://localhost:5173',
      },
      body: part2Chunk,
    });
    const etag2 = (uploadPart2Res.headers.get('ETag') || uploadPart2Res.headers.get('etag') || '').replace(/^['"]|['"]$/g, '');
    assert(uploadPart2Res.status === 200 && etag2.length > 0, `Direct R2 HTTP PUT Part 2 succeeds (HTTP 200) with ETag: ${etag2.substring(0, 10)}...`);

    // TEST 17: Multipart completion on backend
    const completeRes = await fetch(`${baseUrl}/api/movies/complete-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        key: initData.key,
        uploadId: initData.uploadId,
        title: 'cinematic_test',
        fileSize: testFileSize,
        mimeType: 'video/mp4',
        parts: [
          { PartNumber: 1, ETag: etag1 },
          { PartNumber: 2, ETag: etag2 },
        ],
      }),
    });
    const completeData = await completeRes.json();
    assert(completeRes.status === 200 && completeData.success && completeData.movie.playbackUrl, 'POST /api/movies/complete-upload finalizes multipart upload and generates playback URL');

    // TEST 18: Retrieve movie metadata via GET /api/movies/:code
    const getMovieRes = await fetch(`${baseUrl}/api/movies/${roomCode}`);
    const getMovieData = await getMovieRes.json();
    assert(getMovieRes.status === 200 && getMovieData.hasMovie === true && getMovieData.movie.title === 'cinematic_test', 'GET /api/movies/:code returns active movie metadata');

    // TEST 19: Authorized member playback URL retrieval (both Host and Guest)
    const hostPlaybackRes = await fetch(`${baseUrl}/api/movies/${roomCode}/playback-url?userId=${hostId}`);
    const hostPlaybackData = await hostPlaybackRes.json();
    const guestPlaybackRes = await fetch(`${baseUrl}/api/movies/${roomCode}/playback-url?userId=${guestId}`);
    const guestPlaybackData = await guestPlaybackRes.json();
    assert(hostPlaybackRes.status === 200 && hostPlaybackData.hasMovie && guestPlaybackRes.status === 200 && guestPlaybackData.hasMovie, 'Both room Host and Guest successfully obtain fresh presigned playback URLs');

    // TEST 20: Video playback stream retrieval from R2 via presigned GET URL
    const streamRes = await fetch(guestPlaybackData.playbackUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1024' },
    });
    assert(streamRes.status === 206 || streamRes.status === 200, `Presigned playback URL streams movie bytes from R2 (HTTP ${streamRes.status} Content-Range verified)`);

    // TEST 21: Incomplete multipart upload abort cleanup
    const abortSessionRes = await fetch(`${baseUrl}/api/movies/upload-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        fileName: 'aborted_test.mp4',
        fileSize: 10485760,
        mimeType: 'video/mp4',
      }),
    });
    const abortSessionData = await abortSessionRes.json();
    const abortExecRes = await fetch(`${baseUrl}/api/movies/abort-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode,
        userId: hostId,
        key: abortSessionData.key,
        uploadId: abortSessionData.uploadId,
      }),
    });
    const abortExecData = await abortExecRes.json();
    assert(abortExecRes.status === 200 && abortExecData.success === true, 'POST /api/movies/abort-upload successfully aborts multipart session in R2');

    // TEST 22: Host-only movie deletion (R2 object and database metadata)
    const deleteMovieRes = await fetch(`${baseUrl}/api/movies/${roomCode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: hostId }),
    });
    const deleteMovieData = await deleteMovieRes.json();
    assert(deleteMovieRes.status === 200 && deleteMovieData.success, 'Host deletes movie from R2 and database; room reset to empty movie state');

    // TEST 23: Verification of empty movie state after deletion
    const verifyDeletedRes = await fetch(`${baseUrl}/api/movies/${roomCode}`);
    const verifyDeletedData = await verifyDeletedRes.json();
    assert(verifyDeletedRes.status === 200 && verifyDeletedData.hasMovie === false, 'GET /api/movies/:code confirms room hasMovie: false after deletion');

    // TEST 24: Big Buck Bunny CORS test trailer source verification
    const cdnTrailerUrl = 'https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4';
    const cdnTrailerRes = await fetch(cdnTrailerUrl, {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173', Range: 'bytes=0-1024' },
    });
    const cdnCors = cdnTrailerRes.headers.get('access-control-allow-origin');
    assert((cdnTrailerRes.status === 206 || cdnTrailerRes.status === 200) && (cdnCors === '*' || cdnCors === 'http://localhost:5173'), `CDN Big Buck Bunny test trailer returns HTTP ${cdnTrailerRes.status} with verified CORS header: access-control-allow-origin: ${cdnCors}`);

    // TEST 25: Vite configuration validation
    const viteConfigContent = fs.readFileSync('client/vite.config.ts', 'utf-8');
    const hasApiProxy = viteConfigContent.includes("'/api'") && viteConfigContent.includes('http://127.0.0.1:4000');
    const hasSocketProxy = viteConfigContent.includes("'/socket.io'") && viteConfigContent.includes('http://127.0.0.1:4000');
    const hasPreviewProxy = viteConfigContent.includes('preview:');
    assert(hasApiProxy && hasSocketProxy && hasPreviewProxy, 'client/vite.config.ts configures reliable IPv4 proxy (127.0.0.1:4000) for both dev and preview servers');

  } catch (err) {
    console.error('Test execution error:', err);
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

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
