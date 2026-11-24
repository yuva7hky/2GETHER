import { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService.js';
import { movieService } from '../services/movieService.js';
import { ChatMessage, MovieSyncState, RoomPlayer } from '../types/index.js';

export function setupSocketHandler(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // 1. CREATE ROOM
    socket.on('room:create', async (payload: {
      userId: string;
      playerId?: string;
      characterName: string;
      characterData: any;
    }, callback?: (response: any) => void) => {
      try {
        const playerId = payload.playerId || `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const { room, player } = await roomService.createRoom({
          socketId: socket.id,
          userId: payload.userId,
          playerId,
          characterName: payload.characterName,
          characterData: payload.characterData,
        });

        socket.join(room.roomCode);
        console.log(`[Socket] Room created: ${room.roomCode} by host: ${player.characterName} (playerId: ${playerId})`);

        const serialized = roomService.serializeRoom(room);
        const responseData = { success: true, room: serialized, player };
        if (callback) callback(responseData);
        socket.emit('room:created', responseData);
      } catch (err: any) {
        console.error('[Socket] Error creating room:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 2. JOIN ROOM (STRICT 2-PLAYER ENFORCEMENT)
    socket.on('room:join', async (payload: {
      roomCode: string;
      userId: string;
      playerId?: string;
      characterName: string;
      characterData: any;
    }, callback?: (response: any) => void) => {
      try {
        const playerId = payload.playerId || `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const result = await roomService.joinRoom(payload.roomCode, {
          socketId: socket.id,
          userId: payload.userId,
          playerId,
          characterName: payload.characterName,
          characterData: payload.characterData,
        });

        if (!result.success || !result.room || !result.player) {
          const errMsg = result.error === 'ROOM_FULL'
            ? 'This private theatre room is already at maximum capacity (STRICTLY 2 players).'
            : result.error === 'ROOM_NOT_FOUND'
            ? 'Room code not found. Please check the code and try again.'
            : 'Unable to join room.';

          if (callback) callback({ success: false, error: result.error, message: errMsg });
          socket.emit('room:join_error', { error: result.error, message: errMsg });
          return;
        }

        const { room, player, isReconnect } = result;
        socket.join(room.roomCode);
        console.log(`[Socket] Player ${player.characterName} (${player.playerId}) ${isReconnect ? 'reconnected to' : 'joined'} room ${room.roomCode}`);

        const serialized = roomService.serializeRoom(room);
        const responseData = { success: true, room: serialized, player, isReconnect };

        if (callback) callback(responseData);
        socket.emit('room:joined', responseData);

        // Notify other player in the room (Host)
        socket.to(room.roomCode).emit('player:joined', {
          player,
          room: serialized,
          isReconnect,
        });
      } catch (err: any) {
        console.error('[Socket] Error joining room:', err);
        if (callback) callback({ success: false, error: 'SERVER_ERROR', message: err.message });
      }
    });

    // 3. RECONNECT TO EXISTING ROOM
    socket.on('room:reconnect', async (payload: {
      roomCode: string;
      playerId: string;
    }, callback?: (response: any) => void) => {
      try {
        const result = await roomService.reconnectPlayer(payload.roomCode, payload.playerId, socket.id);
        if (!result.success || !result.room || !result.player) {
          if (callback) callback({ success: false, error: result.error });
          return;
        }

        const { room, player } = result;
        socket.join(room.roomCode);
        console.log(`[Socket] Player ${player.characterName} successfully reconnected to ${room.roomCode}`);

        const serialized = roomService.serializeRoom(room);
        const responseData = { success: true, room: serialized, player };

        if (callback) callback(responseData);
        socket.emit('room:reconnected', responseData);

        socket.to(room.roomCode).emit('player:reconnected', {
          player,
          room: serialized,
        });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // 4. ENTER 3D THEATRE
    socket.on('theatre:enter', async () => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const room = roomService.getRoom(roomCode);
      if (room) {
        await roomService.setRoomState(roomCode, 'IN_THEATRE');
        io.to(roomCode).emit('theatre:state_changed', { state: 'IN_THEATRE' });
      }
    });

    // 5. BIDIRECTIONAL REAL-TIME MOVEMENT & ANIMATION SYNC
    socket.on('player:move', (data: {
      transform: RoomPlayer['transform'];
      animationState: RoomPlayer['animationState'];
      isSitting: boolean;
      seatIndex: number | null;
      seq?: number;
      timestamp?: number;
    }) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;

      const { room, player, isStale } = roomService.updatePlayerTransform(
        socket.id,
        data.transform,
        data.animationState,
        data.isSitting,
        data.seatIndex,
        data.seq || 0
      );

      if (player && !isStale) {
        // Broadcast to the other player in the room using socket.to(roomCode)
        socket.to(session.roomCode).emit('player:moved', {
          socketId: socket.id,
          playerId: player.playerId,
          userId: player.userId,
          transform: player.transform,
          animationState: player.animationState,
          isSitting: player.isSitting,
          seatIndex: player.seatIndex,
          seq: data.seq,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    // 6. SIT / STAND INTERACTION SYNC
    socket.on('theatre:sit', (data: { isSitting: boolean; seatIndex: number | null }) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;

      const player = roomService.getPlayerBySocket(socket.id);
      if (player) {
        player.isSitting = data.isSitting;
        player.seatIndex = data.seatIndex;
        player.animationState = data.isSitting ? 'SIT' : 'IDLE';

        socket.to(session.roomCode).emit('player:sit_changed', {
          socketId: socket.id,
          playerId: player.playerId,
          isSitting: data.isSitting,
          seatIndex: data.seatIndex,
          animationState: player.animationState,
        });
      }
    });

    // 6.5 STREET SEE-SAW REAL-TIME SYNC
    socket.on('theatre:seesaw', (data: { angle: number }) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;
      socket.to(session.roomCode).emit('theatre:seesaw_update', data);
    });

    // 7. SYNCHRONIZED MOVIE PLAYBACK & SELECTION
    socket.on('movie:sync', (syncData: MovieSyncState) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      const enrichedSync: MovieSyncState = {
        ...syncData,
        timestamp: Date.now(),
      };

      roomService.updateMovieSync(roomCode, enrichedSync);
      socket.to(roomCode).emit('movie:synced', enrichedSync);
    });

    socket.on('movie:attach', (movieData: any) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      if (movieData) {
        roomService.setRoomMovie(roomCode, movieData);
      }

      io.to(roomCode).emit('movie:loaded', {
        movie: movieData,
        syncState: {
          action: 'PAUSE',
          currentTime: 0,
          timestamp: Date.now(),
        },
      });
    });

    socket.on('movie:remove', () => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;

      io.to(roomCode).emit('movie:removed');
    });

    // 8. REAL-TIME PRIVATE CHAT
    socket.on('chat:send', (payload: { message: string; senderName?: string }) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;

      const player = roomService.getPlayerBySocket(socket.id);
      const senderName = player?.characterName || payload.senderName || 'Anonymous';

      const chatMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        roomCode: session.roomCode,
        senderId: player?.playerId || socket.id,
        senderName,
        message: payload.message.trim().slice(0, 1000),
        timestamp: Date.now(),
      };

      io.to(session.roomCode).emit('chat:message', chatMsg);
    });

    // 8.5 WEBRTC PEER-TO-PEER VOICE SIGNALING
    socket.on('webrtc:offer', (payload: { sdp: any }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;
      socket.to(roomCode).emit('webrtc:offer', {
        sdp: payload.sdp,
        senderSocketId: socket.id,
      });
    });

    socket.on('webrtc:answer', (payload: { sdp: any }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;
      socket.to(roomCode).emit('webrtc:answer', {
        sdp: payload.sdp,
        senderSocketId: socket.id,
      });
    });

    socket.on('webrtc:ice-candidate', (payload: { candidate: any }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;
      socket.to(roomCode).emit('webrtc:ice-candidate', {
        candidate: payload.candidate,
        senderSocketId: socket.id,
      });
    });

    socket.on('webrtc:voice-activity', (payload: { isSpeaking: boolean }) => {
      const roomCode = roomService.getRoomCodeBySocket(socket.id);
      if (!roomCode) return;
      socket.to(roomCode).emit('webrtc:voice-activity', {
        isSpeaking: payload.isSpeaking,
        senderSocketId: socket.id,
      });
    });

    // 8.6 THEATRE ENTRANCE CO-OP QUEST
    socket.on('quest:key-pickup', (callback?: (res: any) => void) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;
      const { roomCode, playerId } = session;

      const result = roomService.pickUpKey(roomCode, playerId);
      if (result.success && result.quest) {
        io.to(roomCode).emit('quest:key-picked', {
          keyPickedBy: playerId,
          keyPickedByName: result.playerName,
          quest: result.quest,
        });
        if (callback) callback({ success: true, quest: result.quest });
      } else {
        if (callback) callback({ success: false, quest: result.quest });
      }
    });

    socket.on('quest:plate-step', (payload: { isStepping: boolean }) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;
      const { roomCode, playerId } = session;

      const result = roomService.setPressurePlate(roomCode, playerId, Boolean(payload.isStepping));
      if (result.success && result.quest) {
        io.to(roomCode).emit('quest:plate-state', {
          isPressurePlateActive: result.quest.isPressurePlateActive,
          pressurePlatePlayerId: result.quest.pressurePlatePlayerId,
          quest: result.quest,
        });
      }
    });

    socket.on('quest:unlock-door', (callback?: (res: any) => void) => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;
      const { roomCode, playerId } = session;

      const result = roomService.unlockDoor(roomCode, playerId);
      if (result.success && result.quest) {
        io.to(roomCode).emit('quest:door-unlocked', {
          isDoorUnlocked: true,
          unlockedBy: result.unlockedByName,
          quest: result.quest,
        });
        if (callback) callback({ success: true, quest: result.quest });
      } else {
        if (callback) callback({ success: false, quest: result.quest });
      }
    });

    // LEAVE ROOM EXPLICITLY
    socket.on('room:leave', async () => {
      const session = roomService.getSessionBySocket(socket.id);
      if (!session) return;
      const { roomCode, playerId } = session;
      const player = roomService.getPlayerBySocket(socket.id);
      const isHost = player?.isHost;

      socket.leave(roomCode);
      const { remainingConnected, roomClosed } = roomService.handleDisconnect(socket.id);

      socket.to(roomCode).emit('player:left', {
        socketId: socket.id,
        playerId,
        isHost,
        remainingConnected,
      });

      // If host leaves or no one is left, delete uploaded movie from R2 immediately
      if (isHost || roomClosed || remainingConnected === 0) {
        movieService.deleteMovieByRoom(roomCode).catch((err) =>
          console.error('[Socket] deleteMovieByRoom on room:leave error:', err.message)
        );
      }
    });

    // 9. DISCONNECTION
    socket.on('disconnect', () => {
      const { roomCode, player, remainingConnected, roomClosed } = roomService.handleDisconnect(socket.id);

      if (roomCode && player) {
        socket.to(roomCode).emit('player:disconnected', {
          socketId: socket.id,
          playerId: player.playerId,
          characterName: player.characterName,
          remainingConnected,
        });

        // Disconnect grace period (60s) and cleanup is authoritatively handled by roomService.handleDisconnect
      }
    });
  });
}
