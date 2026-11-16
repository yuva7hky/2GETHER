import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { roomService } from '../services/roomService.js';
import { movieService, MAX_FILE_SIZE_BYTES } from '../services/movieService.js';

const uploadRequestSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().positive().max(MAX_FILE_SIZE_BYTES, 'Movie file size exceeds 700 MB limit'),
  mimeType: z.string().default('video/mp4'),
});

const completeUploadSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  key: z.string().min(1),
  uploadId: z.string().min(1),
  title: z.string().min(1),
  fileSize: z.number().positive(),
  parts: z.array(
    z.object({
      PartNumber: z.number().int().positive(),
      ETag: z.string().min(1),
    })
  ),
});

export const movieController = {
  async initUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = uploadRequestSchema.parse(req.body);
      const room = roomService.getRoom(data.roomCode);

      if (!room) {
        res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
        return;
      }

      // Creator-only check: only the host can initiate movie uploads
      if (room.hostId !== data.userId) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the room creator / host is permitted to upload movies.',
        });
        return;
      }

      const result = await movieService.initMultipartUpload(
        data.roomCode,
        data.fileName,
        data.fileSize,
        data.mimeType
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },

  async completeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = completeUploadSchema.parse(req.body);
      const room = roomService.getRoom(data.roomCode);

      if (!room) {
        res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
        return;
      }

      if (room.hostId !== data.userId) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the room creator / host is permitted to upload movies.',
        });
        return;
      }

      const { key, playbackUrl } = await movieService.completeMultipartUpload(
        data.key,
        data.uploadId,
        data.parts
      );

      const movieMetadata = {
        id: `movie-${Date.now()}`,
        roomCode: data.roomCode,
        title: data.title,
        r2Key: key,
        fileSize: data.fileSize,
        durationSeconds: 0,
        status: 'READY' as const,
        playbackUrl,
      };

      roomService.setRoomMovie(data.roomCode, movieMetadata);

      res.json({
        success: true,
        movie: movieMetadata,
      });
    } catch (err) {
      next(err);
    }
  },
};
