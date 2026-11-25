import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { roomService } from '../services/roomService.js';
import { movieService, MAX_FILE_SIZE_BYTES } from '../services/movieService.js';
import { supabaseService } from '../services/supabaseService.js';

const uploadRequestSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().positive().max(MAX_FILE_SIZE_BYTES, 'Movie file size exceeds 700 MB maximum limit'),
  mimeType: z.string().default('video/mp4'),
  chunkSize: z.number().int().min(5 * 1024 * 1024).max(32 * 1024 * 1024).optional(),
});

const completeUploadSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  key: z.string().min(1),
  uploadId: z.string().min(1),
  title: z.string().min(1),
  fileSize: z.number().positive().max(MAX_FILE_SIZE_BYTES),
  mimeType: z.string().default('video/mp4'),
  parts: z.array(
    z.object({
      PartNumber: z.number().int().positive(),
      ETag: z.string().min(1),
    })
  ).min(1, 'At least one part is required to complete upload'),
});

const abortUploadSchema = z.object({
  roomCode: z.string().min(4).max(10),
  userId: z.string().min(1),
  key: z.string().min(1),
  uploadId: z.string().min(1),
});

export const movieController = {
  /**
   * Health/info endpoint for movies API
   */
  info(req: Request, res: Response): void {
    res.json({
      success: true,
      message: '2GETHER Movies API online',
      r2Configured: movieService.isConnected(),
      maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    });
  },

  /**
   * Returns current movie metadata for a room
   */
  async getMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      // Member authorization check
      const userId = ((req.query.userId || req.headers['x-user-id']) as string || '').trim();
      if (!userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'User ID required' });
        return;
      }

      const isMember =
        room.hostId === userId ||
        room.guestId === userId ||
        room.hostPlayerId === userId ||
        room.guestPlayerId === userId ||
        room.players.has(userId);

      if (!isMember) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not an authorized room member' });
        return;
      }

      if (room.movie) {
        const directR2Url = await movieService.getPlaybackUrl(room.movie.r2Key);
        res.json({
          success: true,
          hasMovie: true,
          movie: {
            ...room.movie,
            playbackUrl: directR2Url || room.movie.playbackUrl,
            directR2Url: directR2Url || room.movie.directR2Url,
          },
        });
        return;
      }

      const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
      if (dbRoom) {
        const meta = await supabaseService.getMovieMetadata(dbRoom.id);
        if (meta) {
          const freshUrl = await movieService.getPlaybackUrl(meta.r2_object_key);
          const restoredMovie = {
            id: meta.id,
            roomCode: normalizedCode,
            title: meta.original_filename,
            r2Key: meta.r2_object_key,
            fileSize: meta.file_size,
            durationSeconds: 0,
            status: 'READY' as const,
            playbackUrl: freshUrl,
            directR2Url: freshUrl,
          };
          roomService.setRoomMovie(normalizedCode, restoredMovie);
          res.json({
            success: true,
            hasMovie: true,
            movie: restoredMovie,
          });
          return;
        }
      }

      res.json({
        success: true,
        hasMovie: false,
        movie: null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Initializes presigned multipart upload session directly to Cloudflare R2
   */
  async initUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = uploadRequestSchema.parse(req.body);
      const normalizedCode = data.roomCode.trim().toUpperCase();
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

      // Creator-only check: strictly the host can initiate movie uploads
      const isCreator = room.hostId === data.userId || room.hostPlayerId === data.userId;
      if (!isCreator) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the room creator (host) is permitted to upload movies.',
        });
        return;
      }

      const result = await movieService.initMultipartUpload(
        normalizedCode,
        data.fileName,
        data.fileSize,
        data.mimeType,
        data.chunkSize
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Finalizes multipart upload, records metadata in Supabase, and generates playback URL
   */
  async completeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = completeUploadSchema.parse(req.body);
      const normalizedCode = data.roomCode.trim().toUpperCase();
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

      const isCreator = room.hostId === data.userId || room.hostPlayerId === data.userId;
      if (!isCreator) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the room creator (host) is permitted to finalize movie uploads.',
        });
        return;
      }

      // Complete in R2
      const { key, playbackUrl: directR2Url } = await movieService.completeMultipartUpload(
        data.key,
        data.uploadId,
        data.parts
      );

      const streamUrl = `/api/movies/${normalizedCode}/stream`;
      const primaryPlaybackUrl = directR2Url || streamUrl;

      const movieMetadata = {
        id: `movie_${Date.now()}`,
        roomCode: normalizedCode,
        title: data.title,
        r2Key: key,
        fileSize: data.fileSize,
        durationSeconds: 0,
        status: 'READY' as const,
        playbackUrl: primaryPlaybackUrl,
        directR2Url,
      };

      // Persist metadata to Supabase
      try {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          await supabaseService.saveMovieMetadata({
            room_id: dbRoom.id,
            uploaded_by: data.userId,
            original_filename: data.title,
            file_size: data.fileSize,
            content_type: data.mimeType || 'video/mp4',
            r2_object_key: key,
            upload_status: 'READY',
          });
        }
      } catch (dbErr: any) {
        console.error('[MovieController] Supabase saveMovieMetadata error:', dbErr.message);
      }

      // Update in-memory room
      roomService.setRoomMovie(normalizedCode, movieMetadata);

      res.json({
        success: true,
        movie: movieMetadata,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Aborts an incomplete multipart upload session
   */
  async abortUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = abortUploadSchema.parse(req.body);
      const normalizedCode = data.roomCode.trim().toUpperCase();
      const room = roomService.getRoom(normalizedCode);

      if (room && room.hostId !== data.userId && room.hostPlayerId !== data.userId) {
        res.status(403).json({ success: false, error: 'FORBIDDEN' });
        return;
      }

      await movieService.abortMultipartUpload(data.key, data.uploadId);
      res.json({ success: true, message: 'Upload session aborted successfully' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Generates or refreshes a short-lived presigned playback URL for authorized room members
   */
  async getPlaybackUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const userId = (req.query.userId as string) || '';

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

      // Member authorization check: user must belong to this room
      const isMember =
        room.hostId === userId ||
        room.guestId === userId ||
        room.hostPlayerId === userId ||
        room.guestPlayerId === userId ||
        room.players.has(userId);

      if (!isMember) {
        // Double check against Supabase
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          const members = await supabaseService.getMembers(dbRoom.id);
          const authorized = members.some((m) => m.player_id === userId);
          if (!authorized) {
            res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not an authorized room member' });
            return;
          }
        } else {
          res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not an authorized room member' });
          return;
        }
      }

      if (!room.movie) {
        // Try to fetch latest movie metadata from Supabase
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          const meta = await supabaseService.getMovieMetadata(dbRoom.id);
          if (meta) {
            const streamUrl = `/api/movies/${normalizedCode}/stream`;
            const restoredMovie = {
              id: meta.id,
              roomCode: normalizedCode,
              title: meta.original_filename,
              r2Key: meta.r2_object_key,
              fileSize: meta.file_size,
              durationSeconds: 0,
              status: 'READY' as const,
              playbackUrl: streamUrl,
            };
            roomService.setRoomMovie(normalizedCode, restoredMovie);
            res.json({
              success: true,
              hasMovie: true,
              playbackUrl: streamUrl,
              movie: restoredMovie,
            });
            return;
          }
        }
        res.json({
          success: true,
          hasMovie: false,
          movie: null,
          message: 'No movie currently attached to room',
        });
        return;
      }

      // Direct R2 presigned URL for zero-bandwidth cinema playback
      const directR2Url = await movieService.getPlaybackUrl(room.movie.r2Key);
      res.json({
        success: true,
        hasMovie: true,
        playbackUrl: directR2Url || room.movie.playbackUrl,
        movie: {
          ...room.movie,
          playbackUrl: directR2Url || room.movie.playbackUrl,
          directR2Url: directR2Url || room.movie.directR2Url,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Deletes movie from Cloudflare R2 and Supabase metadata (Creator only)
   */
  async deleteMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const userId = (req.body.userId as string) || (req.query.userId as string) || '';

      const room = roomService.getRoom(normalizedCode);
      if (!room) {
        res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
        return;
      }

      const isCreator = room.hostId === userId || room.hostPlayerId === userId;
      if (!isCreator) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the room creator (host) can delete movies.',
        });
        return;
      }

      if (room.movie) {
        // Delete from R2 (both committed file and any abandoned parts)
        await movieService.deleteMovieByRoom(normalizedCode);

        // Delete from Supabase
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          await supabaseService.deleteMovieMetadata(dbRoom.id);
        }

        room.movie = null;
        room.syncState = {
          action: 'PAUSE',
          currentTime: 0,
          timestamp: Date.now(),
        };
      }

      res.json({ success: true, message: 'Movie deleted successfully' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Room storage cleanup (authenticated room members only, when room is closing)
   */
  async cleanupRoomStorage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const userId = ((req.body.userId || req.query.userId || req.headers['x-user-id']) as string || '').trim();

      if (!userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'User ID required for cleanup' });
        return;
      }

      const room = roomService.getRoom(normalizedCode);
      if (room) {
        // Membership check: only members of this room can trigger cleanup
        const isMember =
          room.hostId === userId ||
          room.hostPlayerId === userId ||
          room.guestId === userId ||
          room.guestPlayerId === userId ||
          room.players.has(userId);

        if (!isMember) {
          res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'User is not an authorized room member' });
          return;
        }

        // Check if partner is still actively in room
        let connectedCount = 0;
        for (const p of room.players.values()) {
          if (p.connected) connectedCount++;
        }
        if (connectedCount > 1) {
          // Partner is still in theatre watching - keep R2 movie intact!
          res.json({ success: true, message: 'Partner still connected in room; storage retained' });
          return;
        }
      } else {
        // Fallback check against Supabase
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          const members = await supabaseService.getMembers(dbRoom.id);
          const isMember = members.some((m) => m.player_id === userId);
          if (!isMember) {
            res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'User is not an authorized room member' });
            return;
          }
        } else {
          res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND', message: 'Room not found' });
          return;
        }
      }

      await movieService.deleteMovieByRoom(normalizedCode);

      const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
      if (dbRoom) {
        await supabaseService.deleteMovieMetadata(dbRoom.id);
      }

      if (room) {
        room.movie = null;
        room.syncState = {
          action: 'PAUSE',
          currentTime: 0,
          timestamp: Date.now(),
        };
      }

      res.json({ success: true, message: `Storage for room ${normalizedCode} successfully cleaned up` });
    } catch (err) {
      next(err);
    }
  },

  /**
   * HTTP Range video streaming route with full CORS support and room membership check
   */
  async streamMovie(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const normalizedCode = (code || '').trim().toUpperCase();
      const userId = ((req.query.userId || req.headers['x-user-id']) as string || '').trim();

      if (!userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'User ID required to access stream' });
        return;
      }

      let room = roomService.getRoom(normalizedCode);
      if (room) {
        const isMember =
          room.hostId === userId ||
          room.guestId === userId ||
          room.hostPlayerId === userId ||
          room.guestPlayerId === userId ||
          room.players.has(userId);

        if (!isMember) {
          res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not an authorized room member' });
          return;
        }
      }

      let r2Key = room?.movie?.r2Key;

      if (!r2Key) {
        // Fallback check in Supabase
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          const members = await supabaseService.getMembers(dbRoom.id);
          const isMember = members.some((m) => m.player_id === userId);
          if (!isMember) {
            res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Not an authorized room member' });
            return;
          }

          const meta = await supabaseService.getMovieMetadata(dbRoom.id);
          if (meta) {
            r2Key = meta.r2_object_key;
          }
        }
      }

      if (!r2Key) {
        res.status(404).json({ success: false, error: 'No movie found for this room' });
        return;
      }

      // Fast HTTP 302 redirect directly to Cloudflare R2 presigned URL to preserve Render server bandwidth
      const directR2Url = await movieService.getPlaybackUrl(r2Key);
      if (directR2Url && directR2Url.startsWith('http')) {
        res.redirect(302, directR2Url);
        return;
      }

      // Strictly reject server-side video proxying to guarantee 0 KB Render bandwidth egress
      res.status(500).json({
        success: false,
        error: 'DIRECT_R2_STREAM_REQUIRED',
        message: 'Direct Cloudflare R2 playback is required to preserve server bandwidth.',
      });
    } catch (err) {
      next(err);
    }
  },
};
