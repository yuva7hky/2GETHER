import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { apiUrl } from '../services/apiConfig';

export const CinemaVideoLayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  const movie = useAppStore((s) => s.currentMovie);
  const sync = useAppStore((s) => s.syncState);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isHost = useAppStore((s) => s.isHost);
  const isSitting = useAppStore((s) => s.isSitting);
  const seatIndex = useAppStore((s) => s.seatIndex);
  const localPlayer = useAppStore((s) => s.localPlayer);

  // Cinema screen is visible whenever the user is seated in the cinema
  const seated = isSitting;
  const source = movie?.playbackUrl
    ? movie.playbackUrl.startsWith('http')
      ? movie.playbackUrl
      : apiUrl(`${movie.playbackUrl}${movie.playbackUrl.includes('?') ? '&' : '?'}userId=${encodeURIComponent(localPlayer?.userId || '')}`)
    : '';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    useAppStore.getState().setActiveVideoElement(video);
    return () => {
      if (useAppStore.getState().activeVideoElement === video) {
        useAppStore.getState().setActiveVideoElement(null);
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    video.pause();

    if (!source) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    // Do not set crossOrigin: this is native DOM presentation, not a canvas source.
    video.src = source;
    video.load();
  }, [source]);

  const applyCurrentState = () => {
    const video = videoRef.current;
    if (!video) return;

    const state = useAppStore.getState();
    const action = state.syncState.action || (state.isPlaying ? 'PLAY' : 'PAUSE');
    const targetTime = state.syncState.currentTime;

    // 1. Handle PAUSE: freeze at current position, never reset to 0
    if (action === 'PAUSE' || !state.isPlaying) {
      if (!video.paused) {
        video.pause();
      }
      video.playbackRate = 1.0;
      if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.5) {
        video.currentTime = targetTime;
        lastSeekTimeRef.current = Date.now();
      }
      return;
    }

    // 2. Handle explicit SEEK: jump to timestamp immediately
    if (action === 'SEEK') {
      if (!video.seeking && Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.3) {
        video.currentTime = targetTime;
        lastSeekTimeRef.current = Date.now();
      }
      video.playbackRate = 1.0;
      if (state.isPlaying && video.paused) {
        video.play().catch(() => {});
      }
      return;
    }

    // 3. Handle PLAY: resume playback if paused
    if (video.paused && state.isPlaying) {
      const p = video.play();
      if (p !== undefined) {
        p.catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    }

    // Always maintain 100% natural 1.0x playback rate so voice pitch and speed never distort
    video.playbackRate = 1.0;

    // 4. Guest synchronization during continuous playback:
    // Guards against infinite seek loops on mobile:
    // - Never seek if already seeking (video.seeking === true)
    // - Never seek if currently buffering (video.readyState < 3)
    // - Never seek within an 8-second cooldown after a previous seek (lets mobile TCP/range buffer stabilize)
    // - Drift threshold is relaxed to 3.5s so normal network jitter never interrupts smooth playback
    if (!isHost && Number.isFinite(targetTime) && targetTime > 0) {
      const now = Date.now();
      const inCooldown = now - lastSeekTimeRef.current < 8000;
      const isBuffering = video.seeking || video.readyState < 3;

      if (!inCooldown && !isBuffering) {
        const packetAge = state.syncState.timestamp
          ? Math.max(0, Math.min(0.5, (now - state.syncState.timestamp) / 1000))
          : 0;
        const effectiveHostTime = targetTime + packetAge;
        const drift = video.currentTime - effectiveHostTime;

        if (Math.abs(drift) > 3.5) {
          console.log(`[CinemaVideoLayer] Resyncing guest drift (${drift.toFixed(2)}s) to ${effectiveHostTime.toFixed(2)}s`);
          video.currentTime = effectiveHostTime;
          lastSeekTimeRef.current = now;
        }
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    applyCurrentState();
  }, [isPlaying, sync.action, sync.currentTime]);

  // Host heartbeat sync broadcast
  useEffect(() => {
    if (!isHost || !isPlaying || !movie) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        socketService.sendMovieSync('PLAY', video.currentTime, movie.playbackUrl);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [isHost, isPlaying, movie]);

  // Mobile audio unlock on user interaction
  useEffect(() => {
    const unlock = () => {
      const video = videoRef.current;
      if (video && video.muted) {
        video.muted = false;
        if (useAppStore.getState().isPlaying && video.paused) {
          video.play().catch(() => {});
        }
      }
      // Also unlock remote partner voice audio on mobile
      const remoteVoice = document.getElementById('2gether-remote-voice') as HTMLAudioElement | null;
      if (remoteVoice && remoteVoice.paused) {
        remoteVoice.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <div
      id="cinema-video-layer"
      aria-hidden={!seated}
      className={`absolute inset-0 z-20 bg-black transition-opacity duration-200 ${
        seated && movie ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full bg-black object-contain pointer-events-none"
        onLoadedMetadata={applyCurrentState}
        onCanPlay={applyCurrentState}
        onPlaying={applyCurrentState}
        onDurationChange={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration)) {
            useAppStore.getState().setMovieDuration(duration);
          }
        }}
        onTimeUpdate={(event) => {
          useAppStore.getState().setMovieTime(event.currentTarget.currentTime);
        }}
        onError={() => {
          setError('This video format is unsupported on this mobile device. Please upload an H.264/AAC MP4 video.');
        }}
      />

      {error && seated && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white bg-black/90">
          <p className="max-w-md text-sm text-rose-300 font-medium">{error}</p>
        </div>
      )}
    </div>
  );
};
