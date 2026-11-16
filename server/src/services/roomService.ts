import crypto from 'crypto';
import { RoomSession, RoomPlayer, RoomState, MovieMetadata, MovieSyncState } from '../types/index.js';

class RoomService {
  private rooms: Map<string, RoomSession> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  constructor() {
    // Start automatic cleanup interval every 5 minutes
    setInterval(() => this.cleanupInactiveRooms(), 5 * 60 * 1000);
  }

  /**
   * Generates a cute, readable 6-character room code (e.g. 2H-9472 or LOVE88)
   */
  public generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Creates a new private room
   */
  public createRoom(hostPlayer: Omit<RoomPlayer, 'isHost' | 'connected' | 'joinedAt'>): { room: RoomSession; player: RoomPlayer } {
    const roomCode = this.generateRoomCode();
    const now = Date.now();

    const player: RoomPlayer = {
      ...hostPlayer,
      isHost: true,
      connected: true,
      joinedAt: now,
    };

    const playersMap = new Map<string, RoomPlayer>();
    playersMap.set(player.socketId, player);

    const room: RoomSession = {
      roomCode,
      hostId: player.userId,
      guestId: null,
      state: 'WAITING',
      players: playersMap,
      movie: null,
      syncState: {
        action: 'PAUSE',
        currentTime: 0,
        timestamp: now,
      },
      createdAt: now,
      lastActiveAt: now,
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(player.socketId, roomCode);

    return { room, player };
  }

  /**
   * Joins an existing room with strict 2-player capacity enforcement
   */
  public joinRoom(
    roomCode: string,
    guestPlayer: Omit<RoomPlayer, 'isHost' | 'connected' | 'joinedAt'>
  ): { success: boolean; error?: string; room?: RoomSession; player?: RoomPlayer } {
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.state === 'CLOSED') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    // STRICT CHECK: Maximum players per room is STRICTLY 2
    if (room.players.size >= 2) {
      // Check if this is an existing player reconnecting
      let existingPlayer: RoomPlayer | undefined;
      for (const p of room.players.values()) {
        if (p.userId === guestPlayer.userId) {
          existingPlayer = p;
          break;
        }
      }

      if (!existingPlayer) {
        return { success: false, error: 'ROOM_FULL' };
      }

      // Handle reconnection
      room.players.delete(existingPlayer.socketId);
      this.socketToRoom.delete(existingPlayer.socketId);

      const reconnectedPlayer: RoomPlayer = {
        ...existingPlayer,
        socketId: guestPlayer.socketId,
        connected: true,
      };

      room.players.set(guestPlayer.socketId, reconnectedPlayer);
      this.socketToRoom.set(guestPlayer.socketId, normalizedCode);
      room.lastActiveAt = Date.now();

      return { success: true, room, player: reconnectedPlayer };
    }

    // New guest joining
    const now = Date.now();
    const player: RoomPlayer = {
      ...guestPlayer,
      isHost: false,
      connected: true,
      joinedAt: now,
    };

    room.guestId = player.userId;
    room.players.set(player.socketId, player);
    this.socketToRoom.set(player.socketId, normalizedCode);
    room.state = 'READY';
    room.lastActiveAt = now;

    return { success: true, room, player };
  }

  /**
   * Get room by code
   */
  public getRoom(roomCode: string): RoomSession | undefined {
    return this.rooms.get(roomCode.trim().toUpperCase());
  }

  /**
   * Get room code for a socket
   */
  public getRoomCodeBySocket(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  /**
   * Update player movement / transform
   */
  public updatePlayerTransform(
    socketId: string,
    transform: RoomPlayer['transform'],
    animationState: RoomPlayer['animationState'],
    isSitting: boolean,
    seatIndex: number | null
  ): { room?: RoomSession; player?: RoomPlayer } {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return {};

    const room = this.rooms.get(roomCode);
    if (!room) return {};

    const player = room.players.get(socketId);
    if (!player) return {};

    player.transform = transform;
    player.animationState = animationState;
    player.isSitting = isSitting;
    player.seatIndex = seatIndex;
    room.lastActiveAt = Date.now();

    return { room, player };
  }

  /**
   * Update room state (e.g. IN_THEATRE or WATCHING)
   */
  public setRoomState(roomCode: string, state: RoomState): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.state = state;
    room.lastActiveAt = Date.now();
    return true;
  }

  /**
   * Attach movie metadata to room (creator-only)
   */
  public setRoomMovie(roomCode: string, movie: MovieMetadata): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.movie = movie;
    room.lastActiveAt = Date.now();
    return true;
  }

  /**
   * Update synchronized playback state
   */
  public updateMovieSync(roomCode: string, syncState: MovieSyncState): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.syncState = syncState;
    if (syncState.action === 'PLAY') {
      room.state = 'WATCHING';
    } else if (syncState.action === 'PAUSE' && room.state === 'WATCHING') {
      room.state = 'IN_THEATRE';
    }
    room.lastActiveAt = Date.now();
    return true;
  }

  /**
   * Handles player disconnection
   */
  public handleDisconnect(socketId: string): { roomCode?: string; player?: RoomPlayer; remainingPlayers: number } {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return { remainingPlayers: 0 };

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return { remainingPlayers: 0 };
    }

    const player = room.players.get(socketId);
    if (player) {
      player.connected = false;
    }

    // Remove player from room map
    room.players.delete(socketId);
    this.socketToRoom.delete(socketId);

    const remaining = room.players.size;
    if (remaining === 0) {
      room.state = 'CLOSED';
    } else {
      room.state = 'WAITING';
    }

    return { roomCode, player, remainingPlayers: remaining };
  }

  /**
   * 30-minute inactivity cleanup
   */
  public cleanupInactiveRooms(): void {
    const now = Date.now();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    for (const [code, room] of this.rooms.entries()) {
      const isExpired = now - room.lastActiveAt > THIRTY_MINUTES_MS;
      const isEmpty = room.players.size === 0;

      if (isExpired || (isEmpty && room.state === 'CLOSED')) {
        console.log(`[RoomService] Purging inactive room: ${code}`);
        // Clean up socket lookups
        for (const socketId of room.players.keys()) {
          this.socketToRoom.delete(socketId);
        }
        this.rooms.delete(code);
      }
    }
  }

  /**
   * Export room session snapshot for client consumption
   */
  public serializeRoom(room: RoomSession) {
    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      guestId: room.guestId,
      state: room.state,
      players: Array.from(room.players.values()),
      movie: room.movie,
      syncState: room.syncState,
      createdAt: room.createdAt,
    };
  }
}

export const roomService = new RoomService();
