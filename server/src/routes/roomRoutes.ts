import { Router } from 'express';
import { roomController } from '../controllers/roomController.js';

const router = Router();

router.get('/:code', roomController.getRoom);
router.get('/:code/status', roomController.checkRoomStatus);

export const roomRoutes = router;
