import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Volume2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';

export const ScreenGestureOverlay: React.FC = () => {
  const currentMovie = useAppStore((state) => state.currentMovie);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const movieTime = useAppStore((state) => state.movieTime);
  const movieDuration = useAppStore((state) => state.movieDuration);
  const isHost = useAppStore((state) => state.isHost);
  const isSitting = useAppStore((state) => state.isSitting);
  const setMovieSync = useAppStore((state) => state.setMovieSync);
  const setPlaybackRate = useAppStore((state) => state.setPlaybackRate);
  const playbackRate = useAppStore((state) => state.playbackRate);

  // Auto-hide UI state
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Visual feedback animations for gestures
  const [gestureFeedback, setGestureFeedback] = useState<{
    type: 'PLAY' | 'PAUSE' | 'REWIND' | 'FORWARD';
    id: number;
  } | null>(null);

  // Tap tracking
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; zone: 'LEFT' | 'CENTER' | 'RIGHT' }>({
    time: 0,
    x: 0,
    zone: 'CENTER',
  });
  const seekDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedSeekTimeRef = useRef<number | null>(null);

  // Auto-hide controls after 2.5s of inactivity
  const showControlsTemporarily = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    };
  }, []);

  if (!currentMovie || !isSitting) return null;

  const triggerFeedback = (type: 'PLAY' | 'PAUSE' | 'REWIND' | 'FORWARD') => {
    setGestureFeedback({ type, id: Date.now() });
    setTimeout(() => {
      setGestureFeedback((curr) => (curr?.type === type ? null : curr));
    }, 900);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    showControlsTemporarily();

    // Explicit audio unlock on user gesture
    const vid = useAppStore.getState().activeVideoElement;
    if (vid && vid.muted) {
      vid.muted = false;
      if (useAppStore.getState().isPlaying && vid.paused) {
        vid.play().catch(() => {});
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    showControlsTemporarily();
    if (dragStartRef.current) {
      const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
      if (dist > 10) {
        didDragRef.current = true;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore taps if the user was dragging camera
    if (didDragRef.current) {
      dragStartRef.current = null;
      return;
    }
    dragStartRef.current = null;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const zone: 'LEFT' | 'CENTER' | 'RIGHT' = relX < 0.35 ? 'LEFT' : relX > 0.65 ? 'RIGHT' : 'CENTER';
    const now = performance.now();
    const timeSinceLastTap = now - lastTapRef.current.time;

    // Check for DOUBLE TAP (< 300ms in same zone)
    const vid = useAppStore.getState().activeVideoElement;
    const curTime = vid ? vid.currentTime : movieTime;

    if (timeSinceLastTap < 320 && lastTapRef.current.zone === zone) {
      if (zone === 'LEFT') {
        // Double Tap Left: Rewind 10s (debounced to prevent mobile decoder stalls)
        const baseTime = accumulatedSeekTimeRef.current !== null ? accumulatedSeekTimeRef.current : curTime;
        const newTime = Math.max(0, baseTime - 10);
        accumulatedSeekTimeRef.current = newTime;
        triggerFeedback('REWIND');

        if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
        seekDebounceTimerRef.current = setTimeout(() => {
          const target = accumulatedSeekTimeRef.current;
          accumulatedSeekTimeRef.current = null;
          if (target !== null) {
            if (vid) vid.currentTime = target;
            setMovieSync({ action: 'SEEK', currentTime: target });
            socketService.sendMovieSync('SEEK', target, currentMovie.playbackUrl);
          }
        }, 250);
      } else if (zone === 'RIGHT') {
        // Double Tap Right: Forward 10s (debounced to prevent mobile decoder stalls)
        const baseTime = accumulatedSeekTimeRef.current !== null ? accumulatedSeekTimeRef.current : curTime;
        const maxDuration = movieDuration || baseTime + 10;
        const newTime = Math.min(maxDuration, baseTime + 10);
        accumulatedSeekTimeRef.current = newTime;
        triggerFeedback('FORWARD');

        if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
        seekDebounceTimerRef.current = setTimeout(() => {
          const target = accumulatedSeekTimeRef.current;
          accumulatedSeekTimeRef.current = null;
          if (target !== null) {
            if (vid) vid.currentTime = target;
            setMovieSync({ action: 'SEEK', currentTime: target });
            socketService.sendMovieSync('SEEK', target, currentMovie.playbackUrl);
          }
        }, 250);
      } else if (zone === 'CENTER') {
        // Double Tap Center: Toggle Play / Pause
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: e.clientX, zone };
      return;
    }

    // SINGLE TAP in Center Zone: Toggle Play / Pause only when controls are already visible, otherwise reveal controls
    if (zone === 'CENTER' && timeSinceLastTap > 300) {
      if (controlsVisible) {
        togglePlay();
      } else {
        showControlsTemporarily();
      }
    }

    lastTapRef.current = { time: now, x: e.clientX, zone };
  };

  const togglePlay = () => {
    const nextAction = isPlaying ? 'PAUSE' : 'PLAY';
    const vid = useAppStore.getState().activeVideoElement;
    const curTime = vid ? vid.currentTime : movieTime;

    if (vid) {
      if (nextAction === 'PLAY') {
        vid.muted = false;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    }
    setMovieSync({ action: nextAction, currentTime: curTime });
    socketService.sendMovieSync(nextAction, curTime, currentMovie.playbackUrl);
    triggerFeedback(nextAction);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const vid = useAppStore.getState().activeVideoElement;
    if (vid) {
      vid.currentTime = newTime;
    }
    setMovieSync({ action: 'SEEK', currentTime: newTime });
    socketService.sendMovieSync('SEEK', newTime, currentMovie.playbackUrl);
    showControlsTemporarily();
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      data-gesture-overlay="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="absolute inset-0 z-30 pointer-events-auto select-none overflow-hidden"
    >
      {/* 1. VISUAL GESTURE BADGES (Animated Ripple Feedback) */}
      {gestureFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {gestureFeedback.type === 'PLAY' && (
            <div className="p-6 rounded-full bg-black/60 backdrop-blur-md border border-theatre-gold/50 shadow-glow-gold animate-in zoom-in-75 fade-in duration-200">
              <Play className="w-12 h-12 text-theatre-gold fill-current ml-1" />
            </div>
          )}

          {gestureFeedback.type === 'PAUSE' && (
            <div className="p-6 rounded-full bg-black/60 backdrop-blur-md border border-white/40 shadow-2xl animate-in zoom-in-75 fade-in duration-200">
              <Pause className="w-12 h-12 text-white fill-current" />
            </div>
          )}

          {gestureFeedback.type === 'REWIND' && (
            <div className="absolute left-10 md:left-24 p-5 rounded-2xl bg-black/65 backdrop-blur-md border border-theatre-gold/40 text-theatre-gold flex items-center gap-2 animate-in slide-in-from-left duration-200 shadow-glow-gold">
              <RotateCcw className="w-8 h-8" />
              <span className="font-bold text-lg">-10s</span>
            </div>
          )}

          {gestureFeedback.type === 'FORWARD' && (
            <div className="absolute right-10 md:right-24 p-5 rounded-2xl bg-black/65 backdrop-blur-md border border-theatre-gold/40 text-theatre-gold flex items-center gap-2 animate-in slide-in-from-right duration-200 shadow-glow-gold">
              <span className="font-bold text-lg">+10s</span>
              <FastForward className="w-8 h-8" />
            </div>
          )}
        </div>
      )}

      {/* 2. AUTO-HIDING FLOATING MEDIA CONTROLLER HUD */}
      <div
        className={`absolute bottom-4 inset-x-4 md:inset-x-20 transition-all duration-300 pointer-events-auto ${
          controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="p-3.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 shadow-2xl space-y-2">
          {/* Progress Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-300 w-12 text-right">
              {formatTime(movieTime)}
            </span>
            <input
              type="range"
              min={0}
              max={movieDuration || 100}
              step={0.5}
              value={movieTime}
              onChange={handleScrub}
              className="flex-grow h-1.5 rounded-lg bg-white/20 accent-theatre-gold cursor-pointer"
            />
            <span className="text-[11px] font-mono text-slate-400 w-12">
              {formatTime(movieDuration)}
            </span>
          </div>

          {/* Quick Control Hints */}
          <div className="flex items-center justify-between text-[11px] text-slate-300 px-1 pt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-slate-400">
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-theatre-gold">Double Tap Left</span> -10s
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-theatre-gold">Center Tap</span> Play/Pause
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-theatre-gold">Double Tap Right</span> +10s
              </span>
            </div>

            <span className="font-semibold text-theatre-pink text-[10px] uppercase tracking-wider flex items-center gap-1">
              ♥ Synchronized
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
