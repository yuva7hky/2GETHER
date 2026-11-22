import { create } from 'zustand';
import { 
  AppView, 
  RoomState, 
  UserProfile, 
  RoomPlayer, 
  MovieMetadata, 
  MovieSyncState, 
  ChatMessage, 
  TheatreSettings,
  PlayerTransform,
  CharacterAnimationState,
  TheatreQuestState,
  UploadState
} from '../types';

interface AppStore {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Local User Profile
  profile: UserProfile;
  setProfile: (profile: Partial<UserProfile>) => void;
  updateAppearance: (appearance: Partial<UserProfile['appearance']>) => void;

  // Active Room State
  roomCode: string | null;
  roomState: RoomState;
  isHost: boolean;
  connected: boolean;
  localPlayer: RoomPlayer | null;
  otherPlayer: RoomPlayer | null;
  setRoomData: (data: {
    roomCode: string;
    roomState: RoomState;
    isHost: boolean;
    localPlayer: RoomPlayer;
    otherPlayer?: RoomPlayer | null;
    quest?: TheatreQuestState;
  }) => void;
  setOtherPlayer: (player: RoomPlayer | null) => void;
  updateOtherPlayerTransform: (data: {
    playerId?: string;
    socketId?: string;
    transform: PlayerTransform;
    animationState: CharacterAnimationState;
    isSitting: boolean;
    seatIndex: number | null;
    seq?: number;
  }) => void;
  setRoomState: (state: RoomState) => void;
  setConnected: (connected: boolean) => void;
  leaveRoom: () => void;

  // Local Movement in Theatre
  localTransform: PlayerTransform;
  localAnimationState: CharacterAnimationState;
  isSitting: boolean;
  seatIndex: number | null;
  seesawTargetAngle: number;
  setLocalTransform: (transform: PlayerTransform) => void;
  setLocalAnimationState: (state: CharacterAnimationState) => void;
  setSitting: (isSitting: boolean, seatIndex: number | null) => void;
  setSeesawTargetAngle: (angle: number) => void;

  // Movie Player
  currentMovie: MovieMetadata | null;
  syncState: MovieSyncState;
  isPlaying: boolean;
  movieTime: number;
  movieDuration: number;
  playbackRate: number;
  activeVideoElement: HTMLVideoElement | null;
  setMovie: (movie: MovieMetadata | null) => void;
  setMovieSync: (sync: Partial<MovieSyncState>) => void;
  setMovieTime: (time: number) => void;
  setMovieDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setActiveVideoElement: (el: HTMLVideoElement | null) => void;

  // Chat System
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  unreadCount: number;
  resetUnread: () => void;

  // Voice Chat (WebRTC P2P) Types
  isMicMuted: boolean;
  isLocalSpeaking: boolean;
  isRemoteSpeaking: boolean;
  isVoiceConnected: boolean;
  setMicMuted: (muted: boolean) => void;
  setLocalSpeaking: (speaking: boolean) => void;
  setRemoteSpeaking: (speaking: boolean) => void;
  setVoiceConnected: (connected: boolean) => void;

  // Theatre Co-op Quest State
  quest: TheatreQuestState;
  setQuestState: (quest: Partial<TheatreQuestState>) => void;

  // Background Persistent Movie Upload State
  uploadState: UploadState;
  setUploadState: (state: Partial<UploadState>) => void;
  resetUploadState: () => void;

  // Settings
  settings: TheatreSettings;
  updateSettings: (settings: Partial<TheatreSettings>) => void;
}

function getSessionPlayerId(): string {
  if (typeof window === 'undefined') {
    return `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }
  let pid = sessionStorage.getItem('2gether_player_id');
  if (!pid) {
    pid = `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    sessionStorage.setItem('2gether_player_id', pid);
  }
  return pid;
}

const DEFAULT_PROFILE: UserProfile = {
  userId: typeof window !== 'undefined' && localStorage.getItem('2gether_user_id') 
    ? localStorage.getItem('2gether_user_id')! 
    : `user_${Math.random().toString(36).substring(2, 9)}`,
  playerId: getSessionPlayerId(),
  characterName: typeof window !== 'undefined' && localStorage.getItem('2gether_char_name')
    ? localStorage.getItem('2gether_char_name')!
    : 'Sweetheart',
  appearance: {
    gender: 'boy',
    colorScheme: 'warm_cream',
    clothingColor: '#faf6ee', // Cream-white teddy hoodie
    hairColor: '#5c3317',     // Warm chestnut brown
    skinColor: '#ffe2c6',     // Anime fair skin
    accessory: 'none',
    eyeStyle: 'sparkle',
  },
};

export const useAppStore = create<AppStore>((set) => ({
  // Navigation
  currentView: 'LANDING',
  setView: (currentView) => set({ currentView }),

  // User Profile
  profile: DEFAULT_PROFILE,
  setProfile: (newProfile) =>
    set((state) => {
      const updated = { ...state.profile, ...newProfile };
      if (typeof window !== 'undefined') {
        localStorage.setItem('2gether_user_id', updated.userId);
        localStorage.setItem('2gether_char_name', updated.characterName);
      }
      return { profile: updated };
    }),
  updateAppearance: (newAppearance) =>
    set((state) => ({
      profile: {
        ...state.profile,
        appearance: { ...state.profile.appearance, ...newAppearance },
      },
    })),

  // Room
  roomCode: null,
  roomState: 'WAITING',
  isHost: false,
  connected: false,
  localPlayer: null,
  otherPlayer: null,
  setRoomData: ({ roomCode, roomState, isHost, localPlayer, otherPlayer, quest }) =>
    set((state) => ({
      roomCode,
      roomState,
      isHost,
      localPlayer,
      otherPlayer: otherPlayer || null,
      localTransform: localPlayer.transform,
      localAnimationState: localPlayer.animationState || 'IDLE',
      isSitting: localPlayer.isSitting || false,
      seatIndex: localPlayer.seatIndex ?? null,
      connected: true,
      quest: quest || state.quest,
    })),
  setOtherPlayer: (otherPlayer) => set({ otherPlayer }),
  updateOtherPlayerTransform: (data) =>
    set((state) => {
      if (!state.otherPlayer) {
        // If otherPlayer wasn't set yet, but we received an update from them:
        if (data.playerId && state.localPlayer && data.playerId !== state.localPlayer.playerId) {
          const placeholderOther: RoomPlayer = {
            socketId: data.socketId || '',
            userId: data.playerId,
            playerId: data.playerId,
            characterName: 'Partner ♥',
            characterData: {
              colorScheme: 'golden_amber',
              clothingColor: '#f59e0b',
              hairColor: '#451a03',
              skinColor: '#fed7aa',
              accessory: 'star_clip',
              eyeStyle: 'happy',
            },
            isHost: !state.isHost,
            transform: data.transform,
            animationState: data.animationState,
            isSitting: data.isSitting,
            seatIndex: data.seatIndex,
            connected: true,
            joinedAt: Date.now(),
            lastSeq: data.seq || 0,
          };
          return { otherPlayer: placeholderOther };
        }
        return state;
      }

      // Stale update protection
      if (data.seq && state.otherPlayer.lastSeq && data.seq < state.otherPlayer.lastSeq) {
        return state;
      }

      const prev = state.otherPlayer;
      const animChanged = prev.animationState !== data.animationState;
      const sitChanged = prev.isSitting !== data.isSitting || prev.seatIndex !== data.seatIndex;

      // Update transform directly on object for Three.js 60fps useFrame readers
      prev.transform = data.transform;
      prev.lastSeq = data.seq || prev.lastSeq || 0;

      // If only coordinates changed (normal walking/running), do NOT trigger React re-renders!
      // This eliminates mobile CPU jank and brings solid 60 FPS performance.
      if (!animChanged && !sitChanged) {
        return state;
      }

      return {
        otherPlayer: {
          ...prev,
          animationState: data.animationState,
          isSitting: data.isSitting,
          seatIndex: data.seatIndex,
        },
      };
    }),
  setRoomState: (roomState) => set({ roomState }),
  setConnected: (connected) => set({ connected }),
  leaveRoom: () =>
    set({
      roomCode: null,
      roomState: 'WAITING',
      isHost: false,
      localPlayer: null,
      otherPlayer: null,
      currentView: 'DASHBOARD',
      messages: [],
      currentMovie: null,
    }),

  // Movement & Sitting (Initial placeholder before server assigns authoritative spawn)
  localTransform: { x: -1.5, y: 0, z: 22.0, rotY: Math.PI },
  localAnimationState: 'IDLE',
  isSitting: false,
  seatIndex: null,
  seesawTargetAngle: 0.18,
  setLocalTransform: (localTransform) => set({ localTransform }),
  setLocalAnimationState: (localAnimationState) => set({ localAnimationState }),
  setSitting: (isSitting, seatIndex) => set({ isSitting, seatIndex }),
  setSeesawTargetAngle: (seesawTargetAngle) => set({ seesawTargetAngle }),

  // Theatre Co-op Quest State
  quest: {
    keyLamppostIndex: 0,
    keyPickedBy: null,
    keyPickedByName: null,
    isPressurePlateActive: false,
    pressurePlatePlayerId: null,
    isDoorUnlocked: false,
  },
  setQuestState: (partial) =>
    set((state) => ({ quest: { ...state.quest, ...partial } })),

  // Movie
  currentMovie: null,
  syncState: {
    action: 'PAUSE',
    currentTime: 0,
    timestamp: Date.now(),
  },
  isPlaying: false,
  movieTime: 0,
  movieDuration: 0,
  playbackRate: 1.0,
  activeVideoElement: null,
  setMovie: (currentMovie) => set({ currentMovie }),
  setMovieSync: (sync) =>
    set((state) => ({
      syncState: { ...state.syncState, ...sync },
      isPlaying: sync.action === 'PLAY' ? true : sync.action === 'PAUSE' ? false : state.isPlaying,
      movieTime: sync.currentTime !== undefined ? sync.currentTime : state.movieTime,
    })),
  setMovieTime: (movieTime) => set({ movieTime }),
  setMovieDuration: (movieDuration) => set({ movieDuration }),
  setPlaybackRate: (playbackRate) => {
    const el = useAppStore.getState().activeVideoElement;
    if (el) el.playbackRate = playbackRate;
    set({ playbackRate });
  },
  setActiveVideoElement: (activeVideoElement) => set({ activeVideoElement }),

  // Chat
  messages: [],
  unreadCount: 0,
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
      unreadCount: state.unreadCount + 1,
    })),
  resetUnread: () => set({ unreadCount: 0 }),

  // Voice Chat (WebRTC P2P)
  isMicMuted: true,
  isLocalSpeaking: false,
  isRemoteSpeaking: false,
  isVoiceConnected: false,
  setMicMuted: (isMicMuted) => set({ isMicMuted }),
  setLocalSpeaking: (isLocalSpeaking) => set({ isLocalSpeaking }),
  setRemoteSpeaking: (isRemoteSpeaking) => set({ isRemoteSpeaking }),
  setVoiceConnected: (isVoiceConnected) => set({ isVoiceConnected }),

  // Background Persistent Movie Upload State
  uploadState: {
    isUploading: false,
    progress: 0,
    speed: '0 MB/s',
    eta: '',
    fileName: '',
    fileSize: 0,
    error: null,
    errorDetails: null,
  },
  setUploadState: (partial) =>
    set((state) => ({ uploadState: { ...state.uploadState, ...partial } })),
  resetUploadState: () =>
    set({
      uploadState: {
        isUploading: false,
        progress: 0,
        speed: '0 MB/s',
        eta: '',
        fileName: '',
        fileSize: 0,
        error: null,
        errorDetails: null,
      },
    }),

  // Settings
  settings: {
    volume: 0.8,
    quality: 'high',
    cameraSensitivity: 1.0,
    showNameTags: true,
  },
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
}));
