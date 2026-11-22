import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import { voiceService } from './voiceService';
import { getApiBase } from './apiConfig';
import { ChatMessage, MovieSyncState, RoomPlayer } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private seqCounter: number = 0;
  private listenersAttached: boolean = false;

  public connect(): Socket {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    const apiBase = getApiBase();
    const serverUrl = apiBase || (
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:4000'
        : window.location.origin
    );

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    this.setupListeners();
    return this.socket;
  }

  private setupListeners(): void {
    if (!this.socket || this.listenersAttached) return;
    this.listenersAttached = true;

    // Initialize WebRTC P2P Voice signaling
    voiceService.init(this.socket);

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected with socket ID:', this.socket?.id);
      useAppStore.getState().setConnected(true);

      // Handle Automatic Reconnection to an active room
      const { roomCode, localPlayer, profile } = useAppStore.getState();
      if (roomCode && localPlayer) {
        console.log('[SocketService] Automatically re-establishing session in room:', roomCode);
        this.socket?.emit(
          'room:reconnect',
          { roomCode, playerId: localPlayer.playerId },
          (res: any) => {
            if (res?.success) {
              const other = res.room.players.find((p: RoomPlayer) => p.playerId !== localPlayer.playerId);
              useAppStore.getState().setRoomData({
                roomCode: res.room.roomCode,
                roomState: res.room.state,
                isHost: res.player.isHost,
                localPlayer: res.player,
                otherPlayer: other || null,
              });
            }
          }
        );
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketService] Disconnected:', reason);
      useAppStore.getState().setConnected(false);
    });

    // When partner enters or reconnects
    this.socket.on('player:joined', (data: { player: RoomPlayer; room: any; isReconnect?: boolean }) => {
      console.log('[SocketService] Partner joined room:', data.player.characterName, `(ID: ${data.player.playerId})`);
      const localPlayer = useAppStore.getState().localPlayer;
      if (localPlayer && data.player.playerId === localPlayer.playerId) {
        return; // Ignore own join event
      }
      useAppStore.getState().setOtherPlayer(data.player);
      useAppStore.getState().setRoomState('READY');

      // Host initiates WebRTC P2P Voice Call with the joined partner
      if (useAppStore.getState().isHost) {
        setTimeout(() => voiceService.callPartner(), 500);
      }
    });

    this.socket.on('player:reconnected', (data: { player: RoomPlayer; room: any }) => {
      console.log('[SocketService] Partner reconnected:', data.player.characterName);
      const localPlayer = useAppStore.getState().localPlayer;
      if (localPlayer && data.player.playerId === localPlayer.playerId) return;
      useAppStore.getState().setOtherPlayer(data.player);
    });

    this.socket.on('player:disconnected', (data: { playerId: string; characterName: string; remainingConnected: number }) => {
      console.log('[SocketService] Partner temporarily disconnected:', data.characterName);
      const other = useAppStore.getState().otherPlayer;
      if (other && other.playerId === data.playerId) {
        useAppStore.getState().setOtherPlayer({ ...other, connected: false });
      }
    });

    // Real-time movement & animations
    this.socket.on('player:moved', (data: {
      socketId: string;
      playerId: string;
      userId: string;
      transform: RoomPlayer['transform'];
      animationState: RoomPlayer['animationState'];
      isSitting: boolean;
      seatIndex: number | null;
      seq?: number;
      timestamp?: number;
    }) => {
      const localPlayer = useAppStore.getState().localPlayer;
      // Filter out self-updates
      if (localPlayer && (data.playerId === localPlayer.playerId || data.socketId === localPlayer.socketId)) {
        return;
      }

      useAppStore.getState().updateOtherPlayerTransform(data);
    });

    // Sitting interactions
    this.socket.on('player:sit_changed', (data: {
      socketId: string;
      playerId: string;
      isSitting: boolean;
      seatIndex: number | null;
      animationState: RoomPlayer['animationState'];
    }) => {
      const localPlayer = useAppStore.getState().localPlayer;
      if (localPlayer && data.playerId === localPlayer.playerId) return;

      const other = useAppStore.getState().otherPlayer;
      if (other) {
        useAppStore.getState().updateOtherPlayerTransform({
          playerId: data.playerId,
          transform: other.transform,
          animationState: data.isSitting ? 'SIT' : 'IDLE',
          isSitting: data.isSitting,
          seatIndex: data.seatIndex,
        });
      }
    });

    // Street See-saw synchronization
    this.socket.on('theatre:seesaw_update', (data: { angle: number }) => {
      useAppStore.getState().setSeesawTargetAngle(data.angle);
    });

    // Movie synchronization
    this.socket.on('movie:synced', (syncState: MovieSyncState) => {
      useAppStore.getState().setMovieSync(syncState);
    });

    this.socket.on('movie:loaded', (data: { movie: any; syncState?: MovieSyncState }) => {
      useAppStore.getState().setMovie(data.movie);
      if (data.syncState) {
        useAppStore.getState().setMovieSync(data.syncState);
      }
    });

    this.socket.on('movie:removed', () => {
      useAppStore.getState().setMovie(null);
    });

    // Chat messages
    this.socket.on('chat:message', (message: ChatMessage) => {
      useAppStore.getState().addMessage(message);
    });

    // Theatre Co-op Entrance Quest
    this.socket.on('quest:key-picked', (data: { keyPickedBy: string; keyPickedByName: string; quest: any }) => {
      console.log('[SocketService] Quest key picked by:', data.keyPickedByName);
      if (data.quest) {
        useAppStore.getState().setQuestState(data.quest);
      }
    });

    this.socket.on('quest:plate-state', (data: { isPressurePlateActive: boolean; pressurePlatePlayerId: string | null; quest: any }) => {
      if (data.quest) {
        useAppStore.getState().setQuestState(data.quest);
      }
    });

    this.socket.on('quest:door-unlocked', (data: { isDoorUnlocked: boolean; unlockedBy: string; quest: any }) => {
      console.log('[SocketService] Theatre doors unlocked by:', data.unlockedBy);
      if (data.quest) {
        useAppStore.getState().setQuestState(data.quest);
      }
    });
  }

  public createRoom(onSuccess?: (room: any) => void, onError?: (err: string) => void): void {
    const socket = this.connect();
    const { profile } = useAppStore.getState();

    socket.emit(
      'room:create',
      {
        userId: profile.userId,
        playerId: profile.playerId,
        characterName: profile.characterName,
        characterData: profile.appearance,
      },
      (res: any) => {
        if (res?.success) {
          useAppStore.getState().setRoomData({
            roomCode: res.room.roomCode,
            roomState: res.room.state,
            isHost: true,
            localPlayer: res.player,
            otherPlayer: null,
            quest: res.room.quest,
          });
          onSuccess?.(res.room);
        } else {
          onError?.(res?.error || 'Failed to create room');
        }
      }
    );
  }

  public joinRoom(roomCode: string, onSuccess?: (room: any) => void, onError?: (err: string) => void): void {
    const socket = this.connect();
    const { profile } = useAppStore.getState();

    socket.emit(
      'room:join',
      {
        roomCode,
        userId: profile.userId,
        playerId: profile.playerId,
        characterName: profile.characterName,
        characterData: profile.appearance,
      },
      (res: any) => {
        if (res?.success) {
          // Identify host by player ID (different from local player's player ID)
          const hostPlayer = res.room.players.find((p: RoomPlayer) => p.playerId !== res.player.playerId);
          useAppStore.getState().setRoomData({
            roomCode: res.room.roomCode,
            roomState: res.room.state,
            isHost: false,
            localPlayer: res.player,
            otherPlayer: hostPlayer || null,
            quest: res.room.quest,
          });
          onSuccess?.(res.room);
        } else {
          onError?.(res?.message || res?.error || 'Unable to join room');
        }
      }
    );
  }

  public sendMovement(
    transform: RoomPlayer['transform'],
    animationState: RoomPlayer['animationState'],
    isSitting: boolean,
    seatIndex: number | null
  ): void {
    if (!this.socket || !this.socket.connected) return;

    this.seqCounter++;
    this.socket.emit('player:move', {
      transform,
      animationState,
      isSitting,
      seatIndex,
      seq: this.seqCounter,
      timestamp: Date.now(),
    });
  }

  public sendSitToggle(isSitting: boolean, seatIndex: number | null): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('theatre:sit', { isSitting, seatIndex });
  }

  public sendSeesawPush(angle: number): void {
    useAppStore.getState().setSeesawTargetAngle(angle);
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('theatre:seesaw', { angle });
  }

  public sendMovieSync(action: 'PLAY' | 'PAUSE' | 'SEEK', currentTime: number, playbackUrl?: string): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('movie:sync', {
      action,
      currentTime,
      playbackUrl,
    });
  }

  public attachMovie(movie: any): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('movie:attach', movie);
  }

  public removeMovie(): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('movie:remove');
  }

  public sendChatMessage(message: string): void {
    if (!this.socket || !this.socket.connected || !message.trim()) return;
    const { profile } = useAppStore.getState();
    this.socket.emit('chat:send', {
      message,
      senderName: profile.characterName,
    });
  }

  public pickupQuestKey(callback?: (res: any) => void): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('quest:key-pickup', callback);
  }

  public stepPressurePlate(isStepping: boolean): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('quest:plate-step', { isStepping });
  }

  public unlockTheatreDoor(callback?: (res: any) => void): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('quest:unlock-door', callback);
  }

  public enterTheatre(): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('theatre:enter');
  }

  public leaveRoom(): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('room:leave');
    voiceService.cleanup();
  }
}

export const socketService = new SocketService();
