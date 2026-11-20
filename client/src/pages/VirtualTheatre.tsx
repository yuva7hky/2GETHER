import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  Film,
  MessageCircle,
  Armchair,
  LogOut,
  Settings,
  Users,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { TheatreScene } from '../theatre/TheatreScene';
import { PlayerController } from '../game/PlayerController';
import { RemotePlayer } from '../game/RemotePlayer';
import { MobileControls } from '../components/MobileControls';
import { ChatDrawer } from '../components/ChatDrawer';
import { MoviePlayerOverlay } from '../components/MoviePlayerOverlay';
import { SettingsModal } from '../components/SettingsModal';
import { ScreenGestureOverlay } from '../components/ScreenGestureOverlay';
import { VoiceMicButton } from '../components/VoiceMicButton';
import { QuestBanner } from '../components/QuestBanner';
import { RotatePromptOverlay } from '../components/RotatePromptOverlay';
import { apiUrl } from '../services/apiConfig';

export const VirtualTheatre: React.FC = () => {
  const setView = useAppStore((state) => state.setView);
  const roomCode = useAppStore((state) => state.roomCode);
  const isHost = useAppStore((state) => state.isHost);
  const localPlayer = useAppStore((state) => state.localPlayer);
  const otherPlayer = useAppStore((state) => state.otherPlayer);
  const isSitting = useAppStore((state) => state.isSitting);
  const seatIndex = useAppStore((state) => state.seatIndex);
  const unreadCount = useAppStore((state) => state.unreadCount);
  const leaveRoom = useAppStore((state) => state.leaveRoom);
  const uploadState = useAppStore((state) => state.uploadState);

  // UI state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMoviePlayerOpen, setIsMoviePlayerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Proximity to seat & quest items
  const [canSitPrompt, setCanSitPrompt] = useState(false);
  const [suggestedSeatIndex, setSuggestedSeatIndex] = useState<number | null>(null);
  const [canPickupKey, setCanPickupKey] = useState(false);
  const [canUnlockDoor, setCanUnlockDoor] = useState(false);
  const [pickupKeyTrigger, setPickupKeyTrigger] = useState(false);
  const [unlockDoorTrigger, setUnlockDoorTrigger] = useState(false);

  // Mobile controller vectors & triggers
  const [mobileVec, setMobileVec] = useState({ x: 0, y: 0 });
  const [mobileRun, setMobileRun] = useState(false);
  const [mobileJumpTrigger, setMobileJumpTrigger] = useState(false);
  const [mobileSitTrigger, setMobileSitTrigger] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Dynamic touch device detection (handles mobile landscape where screen width > 768px)
  useEffect(() => {
    const detectTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      setIsTouchDevice(hasTouch);
    };
    detectTouch();
    window.addEventListener('resize', detectTouch);
    return () => window.removeEventListener('resize', detectTouch);
  }, []);

  // Ensure socket is joined, in theatre, and load current movie if attached
  useEffect(() => {
    socketService.enterTheatre();

    if (roomCode) {
      const profile = useAppStore.getState().profile;
      const userId = profile.userId || profile.playerId;
      fetch(apiUrl(`/api/movies/${roomCode}/playback-url?userId=${encodeURIComponent(userId)}`))
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (data?.success && data.hasMovie && data.movie) {
            useAppStore.getState().setMovie(data.movie);
          }
        })
        .catch(() => {});
    }
  }, [roomCode]);

  // Emergency R2 storage cleanup on browser tab close / window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (roomCode && isHost) {
        const cleanupUrl = apiUrl(`/api/movies/${roomCode}/cleanup`);
        const payload = JSON.stringify({ userId: localPlayer?.userId });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(cleanupUrl, payload);
        } else {
          fetch(cleanupUrl, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomCode, isHost, localPlayer?.userId]);

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleLeaveTheatre = () => {
    if (roomCode) {
      if (isHost) {
        fetch(apiUrl(`/api/movies/${roomCode}/cleanup`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: localPlayer?.userId }),
        }).catch(() => {});
      }
      socketService.leaveRoom();
    }
    leaveRoom();
    setView('DASHBOARD');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-theatre-darkest select-none touch-none">
      {/* 1. TOP FLOATING HUD */}
      <header className="absolute top-4 inset-x-4 z-40 flex items-center justify-between pointer-events-none">
        {/* Left: Brand & Room Status Pill */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="glass-panel-pink px-4 py-2 rounded-2xl flex items-center gap-3 shadow-glass border border-theatre-pink/30">
            <div className="w-7 h-7 rounded-xl bg-theatre-pink flex items-center justify-center text-white">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">2GETHER</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-theatre-surface text-theatre-gold">
                  Cinema
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                <span>Room:</span>
                <button
                  onClick={handleCopyCode}
                  className="font-mono font-bold text-theatre-gold hover:underline flex items-center gap-1"
                  title="Click to copy code"
                >
                  {roomCode || 'SOLO'}
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 text-slate-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* Player Presence Indicator (Strictly 2) */}
          <div className="glass-panel px-3 py-2 rounded-2xl hidden sm:flex items-center gap-2 text-xs border border-white/10">
            <Users className="w-4 h-4 text-theatre-blush" />
            <span className="font-semibold text-slate-200">
              {otherPlayer ? '2 / 2 Hearts' : '1 / 2 Waiting...'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                otherPlayer ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* Movie Projector Button */}
          <button
            onClick={() => setIsMoviePlayerOpen(true)}
            className={`px-4 py-2 rounded-2xl glass-panel-gold hover:brightness-110 active:scale-95 transition flex items-center gap-2 text-xs font-bold text-white shadow-glow-gold border ${
              uploadState.isUploading ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_15px_#f59e0b]' : 'border-theatre-gold/40'
            }`}
          >
            <Film className="w-4 h-4 text-theatre-gold" />
            <span className="hidden md:inline">
              {uploadState.isUploading
                ? `Uploading ${uploadState.progress}%`
                : isHost
                ? 'Projector / Upload'
                : 'Cinema Stream'}
            </span>
          </button>

          {/* WebRTC Voice Mic Button (Tap to Mute / Hold for Push-to-Talk) */}
          <VoiceMicButton />

          {/* Chat Button with unread counter */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="p-2.5 rounded-2xl glass-panel hover:bg-white/15 transition relative text-slate-300 hover:text-white border border-white/10"
            title="Chat Whispers"
          >
            <MessageCircle className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-theatre-pink text-white font-bold text-[10px] flex items-center justify-center animate-bounce shadow-glow-pink">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-2xl glass-panel hover:bg-white/15 transition text-slate-300 hover:text-white border border-white/10"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Leave Theatre Button */}
          <button
            onClick={handleLeaveTheatre}
            className="p-2.5 rounded-2xl glass-panel hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition border border-white/10"
            title="Leave Cinema"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 1.5 TOP CO-OP QUEST GUIDANCE BANNER */}
      <QuestBanner
        onOpenUpload={() => setIsMoviePlayerOpen(true)}
        canPickupKey={canPickupKey}
        canUnlockDoor={canUnlockDoor}
        onPickupKey={() => {
          setPickupKeyTrigger(true);
          setTimeout(() => setPickupKeyTrigger(false), 150);
        }}
        onUnlockDoor={() => {
          setUnlockDoorTrigger(true);
          setTimeout(() => setUnlockDoorTrigger(false), 150);
        }}
      />

      {/* 2. BOTTOM DESKTOP INTERACTION PILL (PC / Laptop Only) */}
      {!isTouchDevice && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-3">
          <div className="glass-panel px-5 py-2.5 rounded-full flex items-center gap-4 text-xs text-slate-300 border border-white/10 shadow-glass">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-white">W A S D</kbd>
              <span>Move</span>
            </span>
            <span className="text-white/20">•</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-white">Shift</kbd>
              <span>Sprint</span>
            </span>
            <span className="text-white/20">•</span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-white">Space</kbd>
              <span>Hop</span>
            </span>
            <span className="text-white/20">•</span>
            <span className="flex items-center gap-1.5">
              <kbd className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                canPickupKey || canUnlockDoor || isSitting || canSitPrompt
                  ? 'bg-theatre-gold text-theatre-darkest shadow-glow-gold'
                  : 'bg-white/10 text-white'
              }`}>
                E
              </kbd>
              <span className={canPickupKey || canUnlockDoor || canSitPrompt ? 'text-theatre-gold font-bold' : ''}>
                {canPickupKey
                  ? 'Pick Up Key 🗝️'
                  : canUnlockDoor
                  ? 'Unlock Doors 🚪'
                  : isSitting
                  ? 'Stand Up'
                  : canSitPrompt
                  ? 'Sit Together'
                  : 'Interact'}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 2.5 INTERACTIVE TOUCH & GESTURE CINEMA SCREEN OVERLAY */}
      <ScreenGestureOverlay />

      {/* 3. 3D WEBGL THEATRE CANVAS */}
      <Canvas
        shadows
        camera={{ position: [-1.5, 2.4, 26.6], fov: 50 }}
        className="w-full h-full cursor-default touch-none"
      >
        <ambientLight intensity={0.65} color="#e0e7ff" />

        {/* 3D Theatre Architecture & Screen */}
        <TheatreScene
          leftSeatOccupied={Boolean((isSitting && seatIndex === 0) || (otherPlayer?.isSitting && otherPlayer?.seatIndex === 0))}
          rightSeatOccupied={Boolean((isSitting && seatIndex === 1) || (otherPlayer?.isSitting && otherPlayer?.seatIndex === 1))}
          leftOccupantName={
            isSitting && seatIndex === 0
              ? localPlayer?.characterName
              : otherPlayer?.isSitting && otherPlayer?.seatIndex === 0
              ? otherPlayer.characterName
              : undefined
          }
          rightOccupantName={
            isSitting && seatIndex === 1
              ? localPlayer?.characterName
              : otherPlayer?.isSitting && otherPlayer?.seatIndex === 1
              ? otherPlayer.characterName
              : undefined
          }
          canSitPrompt={canSitPrompt && !isSitting}
          suggestedSeatIndex={suggestedSeatIndex}
          canPickupKey={canPickupKey}
          canUnlockDoor={canUnlockDoor}
          onPickupKey={() => {
            setPickupKeyTrigger(true);
            setTimeout(() => setPickupKeyTrigger(false), 150);
          }}
          onUnlockDoor={() => {
            setUnlockDoorTrigger(true);
            setTimeout(() => setUnlockDoorTrigger(false), 150);
          }}
        />

        {/* Local Controllable Player */}
        <PlayerController
          mobileJoystickVector={mobileVec}
          mobileRunPressed={mobileRun}
          mobileJumpPressed={mobileJumpTrigger}
          mobileSitTrigger={mobileSitTrigger}
          onCanSitChanged={(canSit, idx) => {
            setCanSitPrompt(canSit);
            setSuggestedSeatIndex(idx);
          }}
          onCanPickupKeyChanged={setCanPickupKey}
          onCanUnlockDoorChanged={setCanUnlockDoor}
          pickupKeyTrigger={pickupKeyTrigger}
          unlockDoorTrigger={unlockDoorTrigger}
        />

        {/* Remote Partner Player */}
        <RemotePlayer />
      </Canvas>

      {/* 4. MOBILE ON-SCREEN JOYSTICK & BUTTONS (Touch Devices Only) */}
      {isTouchDevice && (
        <MobileControls
          onVectorChange={setMobileVec}
          onRunChange={setMobileRun}
          onJumpTrigger={() => {
            setMobileJumpTrigger(true);
            setTimeout(() => setMobileJumpTrigger(false), 150);
          }}
          onSitTrigger={() => {
            setMobileSitTrigger(true);
            setTimeout(() => setMobileSitTrigger(false), 150);
          }}
          isSitting={isSitting}
          canPickupKey={canPickupKey}
          canUnlockDoor={canUnlockDoor}
          onPickupKey={() => {
            setPickupKeyTrigger(true);
            setTimeout(() => setPickupKeyTrigger(false), 150);
          }}
          onUnlockDoor={() => {
            setUnlockDoorTrigger(true);
            setTimeout(() => setUnlockDoorTrigger(false), 150);
          }}
        />
      )}

      {/* 5. SLIDE-OUT CHAT DRAWER */}
      <ChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* 6. MOVIE PLAYER / UPLOAD OVERLAY */}
      <MoviePlayerOverlay isOpen={isMoviePlayerOpen} onClose={() => setIsMoviePlayerOpen(false)} />

      {/* 7. SETTINGS MODAL */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* 8. MOBILE ROTATE TO LANDSCAPE PROMPT OVERLAY */}
      <RotatePromptOverlay />
    </div>
  );
};

