import crypto from 'crypto';
import { RoomSession, RoomPlayer, RoomState, MovieMetadata, MovieSyncState, PlayerTransform } from '../types/index.js';
import { supabaseService, DbRoom } from './supabaseService.js';
import { movieService } from './movieService.js';

export const SPAWN_POSITIONS: { HOST: PlayerTransform; GUEST: PlayerTransform } = {
  HOST: { x: -1.5, y: 0, z: 38.0, rotY: Math.PI }, // Outside on extended street, facing illuminated theatre
  GUEST: { x: 1.5, y: 0, z: 38.0, rotY: Math.PI }, // Outside on extended street, facing illuminated theatre
};

class RoomService {
  private rooms: Map<string, RoomSession> = new Map();
  private socketToSession: Map<string, { roomCode: string; playerId: string }> = new Map();

  constructor() {
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanupInactiveRooms(), 5 * 60 * 1000);
  }

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

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Restores an active room session from Supabase persistent records
   */
  public async restoreRoomFromDb(dbRoom: DbRoom): Promise<RoomSession> {
    const now = Date.now();
    const playersMap = new Map<string, RoomPlayer>();

    try {
      const members = await supabaseService.getMembers(dbRoom.id);
      for (const member of members) {
        const isHost = member.role === 'host';
        const profile = await supabaseService.getProfile(member.player_id);

        const player: RoomPlayer = {
          socketId: '',
          userId: member.player_id,
          playerId: member.player_id,
          characterName: profile?.display_name || (isHost ? 'Host' : 'Guest'),
          characterData: profile?.avatar_config || {
            colorScheme: isHost ? 'sunset_pink' : 'golden_warmth',
            clothingColor: isHost ? '#ec4899' : '#f59e0b',
            hairColor: isHost ? '#3b0764' : '#451a03',
            skinColor: isHost ? '#fbcfe8' : '#fed7aa',
          },
          isHost,
          transform: isHost ? { ...SPAWN_POSITIONS.HOST } : { ...SPAWN_POSITIONS.GUEST },
          animationState: 'IDLE',
          isSitting: false,
          seatIndex: null,
          connected: false,
          joinedAt: new Date(member.joined_at).getTime(),
          lastSeq: 0,
        };
        playersMap.set(player.playerId, player);
      }
    } catch (err: any) {
      console.warn('[RoomService] Error restoring members from Supabase:', err.message);
    }

    const room: RoomSession = {
      roomCode: dbRoom.room_code,
      hostId: dbRoom.host_player_id,
      hostPlayerId: dbRoom.host_player_id,
      guestId: dbRoom.guest_player_id,
      guestPlayerId: dbRoom.guest_player_id,
      state: dbRoom.status as RoomState,
      players: playersMap,
      movie: null,
      syncState: {
        action: 'PAUSE',
        currentTime: 0,
        timestamp: now,
      },
      quest: {
        keyLamppostIndex: crypto.randomInt(3, 14),
        keyPickedBy: null,
        keyPickedByName: null,
        isPressurePlateActive: false,
        pressurePlatePlayerId: null,
        isDoorUnlocked: false,
      },
      createdAt: new Date(dbRoom.created_at).getTime(),
      lastActiveAt: new Date(dbRoom.last_activity_at).getTime(),
    };

    this.rooms.set(dbRoom.room_code, room);
    return room;
  }

  /**
   * Creates a new private theatre room and persists to Supabase
   */
  public async createRoom(hostData: {
    socketId: string;
    userId: string;
    playerId: string;
    characterName: string;
    characterData: any;
  }): Promise<{ room: RoomSession; player: RoomPlayer }> {
    const roomCode = this.generateRoomCode();
    const now = Date.now();

    const player: RoomPlayer = {
      socketId: hostData.socketId,
      userId: hostData.userId,
      playerId: hostData.playerId,
      characterName: hostData.characterName,
      characterData: hostData.characterData,
      isHost: true,
      transform: { ...SPAWN_POSITIONS.HOST },
      animationState: 'IDLE',
      isSitting: false,
      seatIndex: null,
      connected: true,
      joinedAt: now,
      lastSeq: 0,
    };

    const playersMap = new Map<string, RoomPlayer>();
    playersMap.set(player.playerId, player);

    const room: RoomSession = {
      roomCode,
      hostId: player.userId,
      hostPlayerId: player.playerId,
      guestId: null,
      guestPlayerId: null,
      state: 'WAITING',
      players: playersMap,
      movie: null,
      syncState: {
        action: 'PAUSE',
        currentTime: 0,
        timestamp: now,
      },
      quest: {
        keyLamppostIndex: crypto.randomInt(3, 14),
        keyPickedBy: null,
        keyPickedByName: null,
        isPressurePlateActive: false,
        pressurePlatePlayerId: null,
        isDoorUnlocked: false,
      },
      createdAt: now,
      lastActiveAt: now,
    };

    this.rooms.set(roomCode, room);
    this.socketToSession.set(hostData.socketId, { roomCode, playerId: player.playerId });

    // Persist profile and room (which registers host in room_members)
    try {
      await supabaseService.upsertProfile({
        id: hostData.userId,
        display_name: hostData.characterName,
        avatar_config: hostData.characterData,
      });

      await supabaseService.createRoom({
        room_code: roomCode,
        host_player_id: player.playerId,
        status: 'WAITING',
      });
    } catch (err: any) {
      console.error('[RoomService] Supabase createRoom warning:', err.message);
    }

    return { room, player };
  }

  /**
   * Joins an existing room with strict 2-player capacity enforcement
   */
  public async joinRoom(
    roomCode: string,
    guestData: {
      socketId: string;
      userId: string;
      playerId: string;
      characterName: string;
      characterData: any;
    }
  ): Promise<{ success: boolean; error?: string; room?: RoomSession; player?: RoomPlayer; isReconnect?: boolean }> {
    const normalizedCode = roomCode.trim().toUpperCase();
    let room = this.rooms.get(normalizedCode);

    // If room is not in memory, attempt restoration from Supabase
    if (!room) {
      try {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom && dbRoom.status !== 'CLOSED') {
          room = await this.restoreRoomFromDb(dbRoom);
        }
      } catch (err: any) {
        console.warn('[RoomService] Room restoration from DB error:', err.message);
      }
    }

    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    if (room.state === 'CLOSED') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    if (room.disconnectTimeout) {
      clearTimeout(room.disconnectTimeout);
      room.disconnectTimeout = null;
    }

    // Check if this player is already in the room (reconnecting)
    const existingPlayer = room.players.get(guestData.playerId);
    if (existingPlayer) {
      this.socketToSession.delete(existingPlayer.socketId);
      existingPlayer.socketId = guestData.socketId;
      existingPlayer.connected = true;

      // Restore profile if available
      try {
        const savedProfile = await supabaseService.getProfile(guestData.userId);
        if (savedProfile) {
          existingPlayer.characterName = savedProfile.display_name || existingPlayer.characterName;
          existingPlayer.characterData = savedProfile.avatar_config || existingPlayer.characterData;
        } else {
          await supabaseService.upsertProfile({
            id: guestData.userId,
            display_name: guestData.characterName,
            avatar_config: guestData.characterData,
          });
        }
      } catch (err: any) {
        console.warn('[RoomService] Profile restoration on join warning:', err.message);
      }

      this.socketToSession.set(guestData.socketId, { roomCode: normalizedCode, playerId: existingPlayer.playerId });
      room.lastActiveAt = Date.now();

      // Update Supabase member presence & room activity
      try {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom) {
          await supabaseService.updateMemberLastSeen(dbRoom.id, existingPlayer.playerId);
          await supabaseService.updateRoomActivity(normalizedCode);
        }
      } catch (err: any) {
        console.warn('[RoomService] Supabase presence heartbeat warning:', err.message);
      }

      return { success: true, room, player: existingPlayer, isReconnect: true };
    }

    // Check capacity: STRICTLY 2 PLAYERS
    if (room.players.size >= 2) {
      return { success: false, error: 'ROOM_FULL' };
    }

    // New Guest player joining
    const now = Date.now();
    const player: RoomPlayer = {
      socketId: guestData.socketId,
      userId: guestData.userId,
      playerId: guestData.playerId,
      characterName: guestData.characterName,
      characterData: guestData.characterData,
      isHost: false,
      transform: { ...SPAWN_POSITIONS.GUEST },
      animationState: 'IDLE',
      isSitting: false,
      seatIndex: null,
      connected: true,
      joinedAt: now,
      lastSeq: 0,
    };

    // Persist guest in Supabase and enforce DB capacity check
    try {
      await supabaseService.upsertProfile({
        id: guestData.userId,
        display_name: guestData.characterName,
        avatar_config: guestData.characterData,
      });

      const updatedDbRoom = await supabaseService.setRoomGuest(normalizedCode, player.playerId);
      if (!updatedDbRoom) {
        console.warn('[RoomService] setRoomGuest returned null from Supabase');
      }
    } catch (err: any) {
      if (err.message && err.message.includes('ROOM_FULL')) {
        return { success: false, error: 'ROOM_FULL' };
      }
      console.error('[RoomService] Supabase setRoomGuest error:', err.message);
    }

    room.guestId = player.userId;
    room.guestPlayerId = player.playerId;
    room.players.set(player.playerId, player);
    this.socketToSession.set(guestData.socketId, { roomCode: normalizedCode, playerId: player.playerId });
    room.state = 'READY';
    room.lastActiveAt = now;

    return { success: true, room, player, isReconnect: false };
  }

  /**
   * Reconnect player after socket disconnect with profile restoration
   */
  public async reconnectPlayer(
    roomCode: string,
    playerId: string,
    newSocketId: string
  ): Promise<{ success: boolean; room?: RoomSession; player?: RoomPlayer; error?: string }> {
    const normalizedCode = roomCode.trim().toUpperCase();
    let room = this.rooms.get(normalizedCode);

    if (!room) {
      try {
        const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
        if (dbRoom && dbRoom.status !== 'CLOSED') {
          room = await this.restoreRoomFromDb(dbRoom);
        }
      } catch (err: any) {
        console.warn('[RoomService] Error restoring room on reconnect:', err.message);
      }
    }

    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    const player = room.players.get(playerId);
    if (!player) return { success: false, error: 'PLAYER_NOT_IN_ROOM' };

    // Restore latest profile from Supabase
    try {
      const savedProfile = await supabaseService.getProfile(player.userId);
      if (savedProfile) {
        player.characterName = savedProfile.display_name || player.characterName;
        player.characterData = savedProfile.avatar_config || player.characterData;
      }
    } catch (err: any) {
      console.warn('[RoomService] Profile restoration on reconnect warning:', err.message);
    }

    // Update socket mapping
    this.socketToSession.delete(player.socketId);
    player.socketId = newSocketId;
    player.connected = true;
    this.socketToSession.set(newSocketId, { roomCode: normalizedCode, playerId });
    room.lastActiveAt = Date.now();

    // Update Supabase member presence & room activity
    try {
      const dbRoom = await supabaseService.getRoomByCode(normalizedCode);
      if (dbRoom) {
        await supabaseService.updateMemberLastSeen(dbRoom.id, playerId);
        await supabaseService.updateRoomActivity(normalizedCode);
      }
    } catch (err: any) {
      console.warn('[RoomService] Supabase updateMemberLastSeen warning:', err.message);
    }

    // Cancel any active disconnect grace period timeout
    if (room.disconnectTimeout) {
      console.log(`[RoomService] Player reconnected to room ${normalizedCode}. Cancelling disconnect grace timeout.`);
      clearTimeout(room.disconnectTimeout);
      room.disconnectTimeout = null;
    }

    return { success: true, room, player };
  }

  public getRoom(roomCode: string): RoomSession | undefined {
    return this.rooms.get(roomCode.trim().toUpperCase());
  }

  public getSessionBySocket(socketId: string): { roomCode: string; playerId: string } | undefined {
    return this.socketToSession.get(socketId);
  }

  public getRoomCodeBySocket(socketId: string): string | undefined {
    return this.socketToSession.get(socketId)?.roomCode;
  }

  public getPlayerBySocket(socketId: string): RoomPlayer | undefined {
    const session = this.socketToSession.get(socketId);
    if (!session) return undefined;
    const room = this.rooms.get(session.roomCode);
    return room?.players.get(session.playerId);
  }

  /**
   * Authoritative player movement update with out-of-order sequence check
   */
  public updatePlayerTransform(
    socketId: string,
    transform: PlayerTransform,
    animationState: RoomPlayer['animationState'],
    isSitting: boolean,
    seatIndex: number | null,
    seq: number = 0
  ): { room?: RoomSession; player?: RoomPlayer; isStale?: boolean } {
    const session = this.socketToSession.get(socketId);
    if (!session) return {};

    const room = this.rooms.get(session.roomCode);
    if (!room) return {};

    const player = room.players.get(session.playerId);
    if (!player) return {};

    // Stale update protection
    if (player.lastSeq && seq > 0 && seq <= player.lastSeq) {
      return { room, player, isStale: true };
    }

    player.transform = transform;
    player.animationState = animationState;
    player.isSitting = isSitting;
    player.seatIndex = seatIndex;
    player.lastSeq = seq;
    room.lastActiveAt = Date.now();

    return { room, player, isStale: false };
  }

  public async setRoomState(roomCode: string, state: RoomState): Promise<boolean> {
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);
    if (!room) return false;
    room.state = state;
    room.lastActiveAt = Date.now();

    // Persist status change to Supabase
    try {
      await supabaseService.updateRoomStatus(normalizedCode, state);
    } catch (err: any) {
      console.error('[RoomService] Supabase updateRoomStatus error:', err.message);
    }

    return true;
  }

  public setRoomMovie(roomCode: string, movie: MovieMetadata): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.movie = movie;
    room.lastActiveAt = Date.now();

    // Persist movie metadata to Supabase
    supabaseService.getRoomByCode(roomCode).then((r) => {
      if (r) {
        supabaseService.saveMovieMetadata({
          room_id: r.id,
          uploaded_by: room.hostPlayerId,
          original_filename: movie.title,
          file_size: movie.fileSize,
          r2_object_key: movie.r2Key,
          upload_status: 'READY',
        }).catch((err) => console.error('[RoomService] Supabase saveMovieMetadata error:', err.message));
      }
    });

    return true;
  }

  public updateMovieSync(roomCode: string, syncState: MovieSyncState): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.syncState = syncState;
    if (syncState.action === 'PLAY') {
      room.state = 'WATCHING';
      this.setRoomState(roomCode, 'WATCHING');
    } else if (syncState.action === 'PAUSE' && room.state === 'WATCHING') {
      room.state = 'IN_THEATRE';
      this.setRoomState(roomCode, 'IN_THEATRE');
    }
    room.lastActiveAt = Date.now();

    supabaseService.updateRoomActivity(roomCode).catch((err) =>
      console.error('[RoomService] Supabase updateRoomActivity error:', err.message)
    );

    return true;
  }

  /**
   * Handles player disconnection with grace period
   */
  public handleDisconnect(socketId: string): {
    roomCode?: string;
    player?: RoomPlayer;
    remainingConnected: number;
    roomClosed: boolean;
  } {
    const session = this.socketToSession.get(socketId);
    if (!session) return { remainingConnected: 0, roomClosed: false };

    const { roomCode, playerId } = session;
    this.socketToSession.delete(socketId);

    const room = this.rooms.get(roomCode);
    if (!room) return { remainingConnected: 0, roomClosed: false };

    const player = room.players.get(playerId);
    if (player) {
      player.connected = false;
    }

    let remainingConnected = 0;
    for (const p of room.players.values()) {
      if (p.connected) remainingConnected++;
    }

    if (remainingConnected === 0) {
      // Both disconnected - do NOT purge immediately! Allow a 60-second grace period for temporary socket drops / page reloads.
      if (!room.disconnectTimeout) {
        console.log(`[RoomService] All players disconnected from room ${roomCode}. Starting 60s reconnect grace period before cleanup...`);
        room.disconnectTimeout = setTimeout(() => {
          const currentRoom = this.rooms.get(roomCode);
          if (!currentRoom) return;

          let stillAnyConnected = false;
          for (const p of currentRoom.players.values()) {
            if (p.connected) {
              stillAnyConnected = true;
              break;
            }
          }

          if (!stillAnyConnected) {
            console.log(`[RoomService] Grace period expired for room ${roomCode}. Closing room and purging R2 movie storage.`);
            currentRoom.state = 'CLOSED';
            movieService.deleteMovieByRoom(roomCode).catch((err) =>
              console.error('[RoomService] deleteMovieByRoom error:', err.message)
            );
            supabaseService.closeRoom(roomCode).catch((err) =>
              console.error('[RoomService] Supabase closeRoom error:', err.message)
            );
          }
        }, 60000);
      }
      return { roomCode, player, remainingConnected: 0, roomClosed: false };
    }

    return { roomCode, player, remainingConnected, roomClosed: false };
  }

  public cleanupInactiveRooms(): void {
    const now = Date.now();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    for (const [code, room] of this.rooms.entries()) {
      const isExpired = now - room.lastActiveAt > THIRTY_MINUTES_MS;
      let anyConnected = false;
      for (const p of room.players.values()) {
        if (p.connected) {
          anyConnected = true;
          break;
        }
      }

      if (isExpired || (!anyConnected && room.state === 'CLOSED')) {
        console.log(`[RoomService] Purging inactive room: ${code}`);
        if (room.movie?.r2Key) {
          movieService.deleteMovie(room.movie.r2Key).catch((err) =>
            console.error('[RoomService] R2 movie cleanup error:', err.message)
          );
        }
        for (const p of room.players.values()) {
          this.socketToSession.delete(p.socketId);
        }
        this.rooms.delete(code);
        supabaseService.closeRoom(code).catch((err) =>
          console.error('[RoomService] Supabase closeRoom error:', err.message)
        );
      }
    }

    // Coordinate with Supabase cleanup and delete associated R2 storage for expired rooms
    supabaseService.cleanupInactiveRooms(30).then((cleanedCodes) => {
      for (const code of cleanedCodes) {
        movieService.deleteMovieByRoom(code).catch((err) =>
          console.error(`[RoomService] Inactive room R2 cleanup error for ${code}:`, err.message)
        );
      }
    }).catch((err) =>
      console.error('[RoomService] Supabase cleanupInactiveRooms error:', err.message)
    );
  }

  public pickUpKey(roomCode: string, playerId: string): { success: boolean; quest?: import('../types/index.js').TheatreQuestState; playerName?: string } {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) return { success: false };
    const player = room.players.get(playerId);
    if (!player) return { success: false };

    if (!room.quest.keyPickedBy) {
      room.quest.keyPickedBy = playerId;
      room.quest.keyPickedByName = player.characterName;
      room.lastActiveAt = Date.now();
      return { success: true, quest: room.quest, playerName: player.characterName };
    }
    return { success: false, quest: room.quest };
  }

  public setPressurePlate(roomCode: string, playerId: string, isStepping: boolean): { success: boolean; quest?: import('../types/index.js').TheatreQuestState } {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) return { success: false };

    room.quest.isPressurePlateActive = isStepping;
    room.quest.pressurePlatePlayerId = isStepping ? playerId : null;
    room.lastActiveAt = Date.now();
    return { success: true, quest: room.quest };
  }

  public unlockDoor(roomCode: string, playerId: string): { success: boolean; quest?: import('../types/index.js').TheatreQuestState; unlockedByName?: string } {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) return { success: false };
    const player = room.players.get(playerId);
    if (!player) return { success: false };

    // Co-op requirement: Door unlocks when pressure plate is held down AND player with key unlocks
    if (room.quest.isPressurePlateActive && room.quest.keyPickedBy === playerId) {
      room.quest.isDoorUnlocked = true;
      room.lastActiveAt = Date.now();
      return { success: true, quest: room.quest, unlockedByName: player.characterName };
    }
    return { success: false, quest: room.quest };
  }

  public serializeRoom(room: RoomSession) {
    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      hostPlayerId: room.hostPlayerId,
      guestId: room.guestId,
      guestPlayerId: room.guestPlayerId,
      state: room.state,
      players: Array.from(room.players.values()),
      movie: room.movie,
      syncState: room.syncState,
      quest: room.quest,
      createdAt: room.createdAt,
    };
  }
}

export const roomService = new RoomService();
