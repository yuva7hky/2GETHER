import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseService } from '../services/supabaseService.js';

const upsertProfileSchema = z.object({
  id: z.string().min(1, 'Profile ID is required'),
  display_name: z.string().min(1).max(50),
  avatar_config: z.object({
    colorScheme: z.string(),
    clothingColor: z.string(),
    hairColor: z.string(),
    skinColor: z.string(),
    accessory: z.string().optional(),
    eyeStyle: z.string().optional(),
  }),
});

const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar_config: z.object({
    colorScheme: z.string().optional(),
    clothingColor: z.string().optional(),
    hairColor: z.string().optional(),
    skinColor: z.string().optional(),
    accessory: z.string().optional(),
    eyeStyle: z.string().optional(),
  }).optional(),
});

export const profileController = {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const profile = await supabaseService.getProfile(id);

      if (!profile) {
        res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
        return;
      }

      res.json({
        success: true,
        profile,
      });
    } catch (err) {
      next(err);
    }
  },

  async upsertProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = upsertProfileSchema.parse(req.body);
      const profile = await supabaseService.upsertProfile(data);

      res.status(200).json({
        success: true,
        profile,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updates = updateProfileSchema.parse(req.body);

      const profile = await supabaseService.updateProfile(id, updates);
      if (!profile) {
        res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
        return;
      }

      res.json({
        success: true,
        profile,
      });
    } catch (err) {
      next(err);
    }
  },
};
