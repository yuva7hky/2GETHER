import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { roomService } from '../services/roomService.js';
import { supabaseService } from '../services/supabaseService.js';

const createRoomSchema = z.object({
  hostId: z.string().optional(),
  hostName: z.string().default('Host'),
  avatarConfig: z.any().optional(),
});

const joinRoomSchema = z.object({
  guestId: z.string().optional(),
  guestName: z.string().default('Guest'),
  avatarConfig: z.any().optional(),
});

export const roomController = {
  /**
   * Health check / info for rooms API
   */
  info(req: Request, res: Response): void {
    res.json({
      success: true,
      message: '2GETHER Rooms API online',
      activeRooms: roomService.getActiveRoomCount(),
    });
  },

  /**
   * Create a new room via REST
   */
  async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createRoomSchema.parse(req.body || {});
      const hostId = data.hostId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const result = await roomService.createRoom({
        socketId: '',
        userId: hostId,
        playerId: hostId,
        characterName: data.hostName,
        characterData: data.avatarConfig || {
          colorScheme: 'sunset_pink',
          clothingColor: '#ec4899',
          hairColor: '#3b0764',
          skinColor: '#fbcfe8',
        },
      });

      res.status(201).json({
        success: true,
        room: roomService.serializeRoom(result.room),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Join an existing room via REST
   */
  async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const data = joinRoomSchema.parse(req.body || {});
      const guestId = data.guestId || `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const result = await roomService.joinRoom(normalizedCode, {
        socketId: '',
        userId: guestId,
        playerId: guestId,
        characterName: data.guestName,
        characterData: data.avatarConfig || {
          colorScheme: 'golden_warmth',
          clothingColor: '#f59e0b',
          hairColor: '#451a03',
          skinColor: '#fed7aa',
        },
      });

      if (!result.success || !result.room) {
        const statusCode = result.error === 'ROOM_FULL' ? 409 : 404;
        res.status(statusCode).json({
          success: false,
          error: result.error || 'JOIN_FAILED',
        });
        return;
      }

      res.json({
        success: true,
        room: roomService.serializeRoom(result.room),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get room by code (in memory or restored from Supabase)
   */
  async getRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      let room = roomService.getRoom(normalizedCode);

      if (!room) {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom && dbRoom.status !== 'CLOSED') {
          room = await roomService.restoreRoomFromDb(dbRoom);
        }
      }

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

  async checkRoomStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const room = roomService.getRoom(normalizedCode);

      if (!room) {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom && dbRoom.status !== 'CLOSED') {
          const members = await supabaseService.getMembers(dbRoom.id);
          const isFull = members.length >= 2;
          res.json({
            success: true,
            exists: true,
            state: dbRoom.status,
            playerCount: members.length,
            isFull,
            canJoin: !isFull,
          });
          return;
        }
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

  async getRoomMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const dbRoom = await supabaseService.getRoomByCode(normalizedCode);

      if (dbRoom) {
        const members = await supabaseService.getMembers(dbRoom.id);
        res.json({
          success: true,
          roomCode: normalizedCode,
          members,
        });
        return;
      }

      const memoryRoom = roomService.getRoom(normalizedCode);
      if (memoryRoom) {
        const members = Array.from(memoryRoom.players.values()).map((p) => ({
          player_id: p.playerId,
          role: p.isHost ? 'host' : 'guest',
          joined_at: new Date().toISOString(),
        }));
        res.json({
          success: true,
          roomCode: normalizedCode,
          members,
        });
        return;
      }

      res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    } catch (err) {
      next(err);
    }
  },

  async getRoomMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const dbRoom = await supabaseService.getRoomByCode(normalizedCode);

      if (dbRoom) {
        const members = await supabaseService.getMembers(dbRoom.id);
        const movie = await supabaseService.getMovieMetadata(dbRoom.id);

        res.json({
          success: true,
          room: dbRoom,
          members,
          movie,
        });
        return;
      }

      const memoryRoom = roomService.getRoom(normalizedCode);
      if (memoryRoom) {
        res.json({
          success: true,
          room: roomService.serializeRoom(memoryRoom),
          members: Array.from(memoryRoom.players.values()).map((p) => ({
            player_id: p.playerId,
            role: p.isHost ? 'host' : 'guest',
            joined_at: new Date().toISOString(),
          })),
          movie: memoryRoom.movie,
        });
        return;
      }

      res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    } catch (err) {
      next(err);
    }
  },
};
