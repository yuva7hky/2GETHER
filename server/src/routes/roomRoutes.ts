import { Router } from 'express';
import { roomController } from '../controllers/roomController.js';

const router = Router();

// Base rooms API health/info
router.get('/', roomController.info);

// REST room creation endpoints
router.post('/', roomController.createRoom);
router.post('/create', roomController.createRoom);

// Specific room operations
router.get('/:code', roomController.getRoom);
router.post('/:code/join', roomController.joinRoom);
router.get('/:code/status', roomController.checkRoomStatus);
router.get('/:code/members', roomController.getRoomMembers);
router.get('/:code/metadata', roomController.getRoomMetadata);

export const roomRoutes = router;
