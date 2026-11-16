import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import { ChatMessage, MovieSyncState, RoomPlayer } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private syncThrottleTimer: any = null;

  public connect(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:4000'
      : window.location.origin;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    this.setupListeners();
    return this.socket;
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected to 2GETHER server:', this.socket?.id);
      useAppStore.getState().setConnected(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketService] Disconnected:', reason);
      useAppStore.getState().setConnected(false);
    });

    // Room events
    this.socket.on('player:joined', (data: { player: RoomPlayer; room: any }) => {
      console.log('[SocketService] Another player entered the room:', data.player.characterName);
      useAppStore.getState().setOtherPlayer(data.player);
      useAppStore.getState().setRoomState('READY');
    });

    this.socket.on('player:left', (data: { characterName: string; remainingPlayers: number }) => {
      console.log('[SocketService] Player left:', data.characterName);
      useAppStore.getState().setOtherPlayer(null);
      useAppStore.getState().setRoomState('WAITING');
    });

    // Movement & animations
    this.socket.on('player:moved', (data: {
      socketId: string;
      userId: string;
      transform: RoomPlayer['transform'];
      animationState: RoomPlayer['animationState'];
      isSitting: boolean;
      seatIndex: number | null;
    }) => {
      useAppStore.getState().updateOtherPlayerTransform(data);
    });

    // Sitting interactions
    this.socket.on('player:sit_changed', (data: { isSitting: boolean; seatIndex: number | null }) => {
      const other = useAppStore.getState().otherPlayer;
      if (other) {
        useAppStore.getState().updateOtherPlayerTransform({
          transform: other.transform,
          animationState: data.isSitting ? 'SIT' : 'IDLE',
          isSitting: data.isSitting,
          seatIndex: data.seatIndex,
        });
      }
    });

    // Movie synchronization
    this.socket.on('movie:synced', (syncState: MovieSyncState) => {
      useAppStore.getState().setMovieSync(syncState);
    });

    // Chat messages
    this.socket.on('chat:message', (message: ChatMessage) => {
      useAppStore.getState().addMessage(message);
    });
  }

  public createRoom(onSuccess?: (room: any) => void, onError?: (err: string) => void): void {
    const socket = this.connect();
    const { profile } = useAppStore.getState();

    socket.emit(
      'room:create',
      {
        userId: profile.userId,
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
        characterName: profile.characterName,
        characterData: profile.appearance,
      },
      (res: any) => {
        if (res?.success) {
          const hostPlayer = res.room.players.find((p: RoomPlayer) => p.userId !== profile.userId);
          useAppStore.getState().setRoomData({
            roomCode: res.room.roomCode,
            roomState: res.room.state,
            isHost: false,
            localPlayer: res.player,
            otherPlayer: hostPlayer || null,
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

    // Send movement state
    this.socket.emit('player:move', {
      transform,
      animationState,
      isSitting,
      seatIndex,
    });
  }

  public sendSitToggle(isSitting: boolean, seatIndex: number | null): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('theatre:sit', { isSitting, seatIndex });
  }

  public sendMovieSync(action: 'PLAY' | 'PAUSE' | 'SEEK', currentTime: number, playbackUrl?: string): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('movie:sync', {
      action,
      currentTime,
      playbackUrl,
    });
  }

  public sendChatMessage(message: string): void {
    if (!this.socket || !this.socket.connected || !message.trim()) return;
    const { profile } = useAppStore.getState();
    this.socket.emit('chat:send', {
      message,
      senderName: profile.characterName,
    });
  }

  public enterTheatre(): void {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('theatre:enter');
  }
}

export const socketService = new SocketService();
