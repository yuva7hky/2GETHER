import { Router } from 'express';
import { profileController } from '../controllers/profileController.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, message: '2GETHER Profiles API online' });
});
router.get('/:id', profileController.getProfile);
router.post('/', profileController.upsertProfile);
router.patch('/:id', profileController.updateProfile);

export const profileRoutes = router;
