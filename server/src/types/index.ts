export type RoomState = 'WAITING' | 'READY' | 'IN_THEATRE' | 'WATCHING' | 'CLOSED';

export type CharacterAnimationState = 'IDLE' | 'WALK' | 'RUN' | 'SIT';

export interface CharacterAppearance {
  colorScheme: string;
  clothingColor: string;
  hairColor: string;
  skinColor: string;
  accessory?: string;
}

export interface PlayerTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface RoomPlayer {
  socketId: string;
  userId: string;
  playerId: string;
  characterName: string;
  characterData: CharacterAppearance;
  isHost: boolean;
  transform: PlayerTransform;
  animationState: CharacterAnimationState;
  isSitting: boolean;
  seatIndex: number | null;
  connected: boolean;
  joinedAt: number;
  lastSeq?: number;
}

export interface MovieMetadata {
  id: string;
  roomCode: string;
  title: string;
  r2Key: string;
  fileSize: number;
  durationSeconds: number;
  status: 'UPLOADING' | 'READY' | 'PLAYING' | 'ERROR';
  playbackUrl?: string;
  directR2Url?: string;
}

export interface MovieSyncState {
  action: 'PLAY' | 'PAUSE' | 'SEEK';
  currentTime: number;
  timestamp: number;
  playbackUrl?: string;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface TheatreQuestState {
  keyLamppostIndex: number;
  keyPickedBy: string | null;
  keyPickedByName: string | null;
  isPressurePlateActive: boolean;
  pressurePlatePlayerId: string | null;
  isDoorUnlocked: boolean;
}

export interface RoomSession {
  roomCode: string;
  hostId: string;
  hostPlayerId: string;
  guestId: string | null;
  guestPlayerId: string | null;
  state: RoomState;
  players: Map<string, RoomPlayer>; // key: playerId
  movie: MovieMetadata | null;
  syncState: MovieSyncState;
  quest: TheatreQuestState;
  createdAt: number;
  lastActiveAt: number;
}
