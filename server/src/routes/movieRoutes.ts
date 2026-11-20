import express, { Router } from 'express';
import { movieController } from '../controllers/movieController.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Base movies API health/info
router.get('/', movieController.info);

// Presigned direct browser upload session
router.post('/upload-request', uploadLimiter, movieController.initUpload);

// Fallback upload-part proxy when direct Cloudflare R2 browser upload hits CORS
router.post('/upload-part-proxy', express.raw({ type: '*/*', limit: '32mb' }), movieController.uploadPartProxy);

// Finalize multipart upload
router.post('/complete-upload', movieController.completeUpload);

// Abort incomplete upload
router.post('/abort-upload', movieController.abortUpload);

// Get current movie metadata for room
router.get('/:code', movieController.getMovie);

// Get short-lived presigned playback URL (members only)
router.get('/:code/playback-url', movieController.getPlaybackUrl);

// Delete movie from R2 and database (creator only)
router.delete('/:code', movieController.deleteMovie);

// Fast tab-closure or exit cleanup for room storage
router.post('/:code/cleanup', movieController.cleanupRoomStorage);

// Stale multipart uploads sweep
router.post('/cleanup-stale-storage', movieController.cleanupStaleStorage);

export const movieRoutes = router;
