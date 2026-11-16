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
  CharacterAnimationState
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
  }) => void;
  setOtherPlayer: (player: RoomPlayer | null) => void;
  updateOtherPlayerTransform: (data: {
    transform: PlayerTransform;
    animationState: CharacterAnimationState;
    isSitting: boolean;
    seatIndex: number | null;
  }) => void;
  setRoomState: (state: RoomState) => void;
  setConnected: (connected: boolean) => void;
  leaveRoom: () => void;

  // Local Movement in Theatre
  localTransform: PlayerTransform;
  localAnimationState: CharacterAnimationState;
  isSitting: boolean;
  seatIndex: number | null;
  setLocalTransform: (transform: PlayerTransform) => void;
  setLocalAnimationState: (state: CharacterAnimationState) => void;
  setSitting: (isSitting: boolean, seatIndex: number | null) => void;

  // Movie Player
  currentMovie: MovieMetadata | null;
  syncState: MovieSyncState;
  isPlaying: boolean;
  movieTime: number;
  movieDuration: number;
  setMovie: (movie: MovieMetadata | null) => void;
  setMovieSync: (sync: Partial<MovieSyncState>) => void;
  setMovieTime: (time: number) => void;
  setMovieDuration: (duration: number) => void;

  // Chat System
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  unreadCount: number;
  resetUnread: () => void;

  // Settings
  settings: TheatreSettings;
  updateSettings: (settings: Partial<TheatreSettings>) => void;
}

const DEFAULT_PROFILE: UserProfile = {
  userId: typeof window !== 'undefined' && localStorage.getItem('2gether_user_id') 
    ? localStorage.getItem('2gether_user_id')! 
    : `user_${Math.random().toString(36).substring(2, 9)}`,
  characterName: typeof window !== 'undefined' && localStorage.getItem('2gether_char_name')
    ? localStorage.getItem('2gether_char_name')!
    : 'Sweetheart',
  appearance: {
    colorScheme: 'sunset_pink',
    clothingColor: '#ec4899', // Hot pink / blush
    hairColor: '#3b0764',     // Dark plum
    skinColor: '#fbcfe8',     // Soft rosy pink
    accessory: 'ribbon',
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
  setRoomData: ({ roomCode, roomState, isHost, localPlayer, otherPlayer }) =>
    set({
      roomCode,
      roomState,
      isHost,
      localPlayer,
      otherPlayer: otherPlayer || null,
      connected: true,
    }),
  setOtherPlayer: (otherPlayer) => set({ otherPlayer }),
  updateOtherPlayerTransform: (data) =>
    set((state) => {
      if (!state.otherPlayer) return state;
      return {
        otherPlayer: {
          ...state.otherPlayer,
          transform: data.transform,
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

  // Movement & Sitting
  localTransform: { x: -1, y: 0, z: 5, rotY: 0 },
  localAnimationState: 'IDLE',
  isSitting: false,
  seatIndex: null,
  setLocalTransform: (localTransform) => set({ localTransform }),
  setLocalAnimationState: (localAnimationState) => set({ localAnimationState }),
  setSitting: (isSitting, seatIndex) => set({ isSitting, seatIndex }),

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
  setMovie: (currentMovie) => set({ currentMovie }),
  setMovieSync: (sync) =>
    set((state) => ({
      syncState: { ...state.syncState, ...sync },
      isPlaying: sync.action === 'PLAY' ? true : sync.action === 'PAUSE' ? false : state.isPlaying,
      movieTime: sync.currentTime !== undefined ? sync.currentTime : state.movieTime,
    })),
  setMovieTime: (movieTime) => set({ movieTime }),
  setMovieDuration: (movieDuration) => set({ movieDuration }),

  // Chat
  messages: [],
  unreadCount: 0,
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
      unreadCount: state.unreadCount + 1,
    })),
  resetUnread: () => set({ unreadCount: 0 }),

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
