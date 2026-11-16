import { Router } from 'express';
import { movieController } from '../controllers/movieController.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/upload-request', uploadLimiter, movieController.initUpload);
router.post('/complete-upload', movieController.completeUpload);

export const movieRoutes = router;
