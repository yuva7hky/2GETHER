export type AppView = 
  | 'LANDING' 
  | 'CHARACTER_CREATION' 
  | 'DASHBOARD' 
  | 'CREATE_ROOM' 
  | 'JOIN_ROOM' 
  | 'THEATRE' 
  | 'SETTINGS';

export type RoomState = 'WAITING' | 'READY' | 'IN_THEATRE' | 'WATCHING' | 'CLOSED';

export type CharacterAnimationState = 'IDLE' | 'WALK' | 'RUN' | 'SIT';

export interface CharacterAppearance {
  colorScheme: string;
  clothingColor: string;
  hairColor: string;
  skinColor: string;
  accessory: 'ribbon' | 'cat_ears' | 'glasses' | 'headphones' | 'star_clip' | 'none';
  eyeStyle: 'curious' | 'happy' | 'sparkle' | 'sleepy';
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
  characterName: string;
  characterData: CharacterAppearance;
  isHost: boolean;
  transform: PlayerTransform;
  animationState: CharacterAnimationState;
  isSitting: boolean;
  seatIndex: number | null;
  connected: boolean;
  joinedAt: number;
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

export interface UserProfile {
  userId: string;
  characterName: string;
  appearance: CharacterAppearance;
}

export interface TheatreSettings {
  volume: number;
  quality: 'low' | 'medium' | 'high';
  cameraSensitivity: number;
  showNameTags: boolean;
}
