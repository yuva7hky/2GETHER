import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { roomService } from '../services/roomService.js';

const createRoomSchema = z.object({
  userId: z.string().min(1),
  characterName: z.string().min(1).max(30),
  characterData: z.object({
    colorScheme: z.string(),
    clothingColor: z.string(),
    hairColor: z.string(),
    skinColor: z.string(),
    accessory: z.string().optional(),
  }),
});

const joinRoomSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  characterName: z.string().min(1).max(30),
  characterData: z.object({
    colorScheme: z.string(),
    clothingColor: z.string(),
    hairColor: z.string(),
    skinColor: z.string(),
    accessory: z.string().optional(),
  }),
});

export const roomController = {
  getRoom(req: Request, res: Response, next: NextFunction): void {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const room = roomService.getRoom(code);
      if (!room) {
        res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
        return;
      }

      res.json({
        success: true,
        room: roomService.serializeRoom(room),
      });
    } catch (err) {
      next(err);
    }
  },

  checkRoomStatus(req: Request, res: Response, next: NextFunction): void {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const room = roomService.getRoom(code);
      if (!room) {
        res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND', exists: false });
        return;
      }

      const isFull = room.players.size >= 2;
      res.json({
        success: true,
        exists: true,
        state: room.state,
        playerCount: room.players.size,
        isFull,
        canJoin: !isFull && room.state !== 'CLOSED',
      });
    } catch (err) {
      next(err);
    }
  },
};
