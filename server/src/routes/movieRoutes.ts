import express, { Router } from 'express';
import { movieController } from '../controllers/movieController.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Base movies API health/info
router.get('/', movieController.info);

// Presigned direct browser upload session
router.post('/upload-request', uploadLimiter, movieController.initUpload);

// Finalize multipart upload
router.post('/complete-upload', movieController.completeUpload);

// Abort incomplete upload
router.post('/abort-upload', movieController.abortUpload);

// Get current movie metadata for room
router.get('/:code', movieController.getMovie);

// Get short-lived presigned playback URL (members only)
router.get('/:code/playback-url', movieController.getPlaybackUrl);

// Video streaming route with HTTP range support
router.get('/:code/stream', movieController.streamMovie);

// Delete movie from R2 and database (creator only)
router.delete('/:code', movieController.deleteMovie);

// Fast tab-closure or exit cleanup for room storage (authenticated room members only)
router.post('/:code/cleanup', movieController.cleanupRoomStorage);

export const movieRoutes = router;
