import { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService.js';
import { ChatMessage, MovieSyncState, RoomPlayer } from '../types/index.js';

export function setupSocketHandler(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // 1. CREATE ROOM
    socket.on('room:create', (payload: {
      userId: string;
      characterName: string;
      characterData: any;
    }, callback?: (response: any) => void) => {
      try {
        const { room, player } = roomService.createRoom({
          socketId: socket.id,
          userId: payload.userId,
          characterName: payload.characterName,
          characterData: payload.characterData,
          transform: { x: -1, y: 0, z: 5, rotY: 0 },
          animationState: 'IDLE',
          isSitting: false,
          seatIndex: null,
        });

        socket.join(room.roomCode);
        console.log(`[Socket] Room created: ${room.roomCode} by host: ${player.characterName}`);

        const serialized = roomService.serializeRoom(room);
        if (callback) {
          callback({ success: true, room: serialized, player });
        }
        socket.emit('room:created', { room: serialized, player });
      } catch (err: any) {
        console.error('[Socket] Error creating room:', err);
        if (callback) {
          callback({ success: false, error: err.message });
        }
      }
    });

    // 2. JOIN ROOM (STRICT 2-PLAYER ENFORCEMENT)
    socket.on('room:join', (payload: {
      roomCode: string;
      userId: string;
      characterName: string;
      characterData: any;
    }, callback?: (response: any) => void) => {
      try {
        const result = roomService.joinRoom(payload.roomCode, {
          socketId: socket.id,
          userId: payload.userId,
          characterName: payload.characterName,
          characterData: payload.characterData,
          transform: { x: 1, y: 0, z: 5, rotY: 0 },
          animationState: 'IDLE',
          isSitting: false,
          seatIndex: null,
        });

        if (!result.success || !result.room || !result.player) {
          const errMsg = result.error === 'ROOM_FULL' 
            ? 'This private theatre room is already at maximum capacity (STRICTLY 2 players).'
            : result.error === 'ROOM_NOT_FOUND' 
            ? 'Room code not found. Please check the code and try again.'
            : 'Unable to join room.';

          if (callback) {
            callback({ success: false, error: result.error, message: errMsg });
          }
          socket.emit('room:join_error', { error: result.error, message: errMsg });
          return;
        }

        const { room, player } = result;
        socket.join(room.roomCode);
        console.log(`[Socket] Player ${player.characterName} joined room ${room.roomCode}`);

        const serialized = roomService.serializeRoom(room);

        if (callback) {
          callback({ success: true, room: serialized, player });
        }

        // Notify caller
        socket.emit('room:joined', { room: serialized, player });

        // Notify other player in the room
        socket.to(room.roomCode).emit('player:joined', {
          player,
          room: serialized,
        });
      } catch (err: any) {
        console.error('[Socket] Error joining room:', err);
        if (callback) {
          callback({ success: false, error: 'SERVER_ERROR', message: err.message });
        }
      }
    });

    // 3. ENTER 3D THEATRE
    socket.on('theatre:enter', () => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const room = roomService.getRoom(roomCode);
      if (room) {
        roomService.setRoomState(roomCode, 'IN_THEATRE');
        io.to(roomCode).emit('theatre:state_changed', { state: 'IN_THEATRE' });
      }
    });

    // 4. REAL-TIME MOVEMENT & ANIMATION SYNC
    socket.on('player:move', (data: {
      transform: RoomPlayer['transform'];
      animationState: RoomPlayer['animationState'];
      isSitting: boolean;
      seatIndex: number | null;
    }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const { player } = roomService.updatePlayerTransform(
        socket.id,
        data.transform,
        data.animationState,
        data.isSitting,
        data.seatIndex
      );

      if (player) {
        // Broadcast to the other player in the room
        socket.to(roomCode).emit('player:moved', {
          socketId: socket.id,
          userId: player.userId,
          transform: data.transform,
          animationState: data.animationState,
          isSitting: data.isSitting,
          seatIndex: data.seatIndex,
        });
      }
    });

    // 5. SIT / STAND INTERACTION
    socket.on('theatre:sit', (data: { isSitting: boolean; seatIndex: number | null }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      socket.to(roomCode).emit('player:sit_changed', {
        socketId: socket.id,
        isSitting: data.isSitting,
        seatIndex: data.seatIndex,
      });
    });

    // 6. SYNCHRONIZED MOVIE PLAYBACK
    socket.on('movie:sync', (syncData: MovieSyncState) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const enrichedSync: MovieSyncState = {
        ...syncData,
        timestamp: Date.now(),
      };

      roomService.updateMovieSync(roomCode, enrichedSync);

      // Broadcast to other player
      socket.to(roomCode).emit('movie:synced', enrichedSync);
    });

    // 7. REAL-TIME PRIVATE CHAT
    socket.on('chat:send', (payload: { message: string; senderName: string }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const room = roomService.getRoom(roomCode);
      if (!room) return;

      const player = room.players.get(socket.id);
      const senderName = player?.characterName || payload.senderName || 'Anonymous';

      const chatMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        roomCode,
        senderId: player?.userId || socket.id,
        senderName,
        message: payload.message.trim().slice(0, 1000),
        timestamp: Date.now(),
      };

      // Deliver to both participants in the room
      io.to(roomCode).emit('chat:message', chatMsg);
    });

    // 8. DISCONNECTION
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const { roomCode, player, remainingPlayers } = roomService.handleDisconnect(socket.id);

      if (roomCode && player) {
        socket.to(roomCode).emit('player:left', {
          socketId: socket.id,
          userId: player.userId,
          characterName: player.characterName,
          remainingPlayers,
        });
      }
    });
  });
}
