import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { apiUrl } from '../services/apiConfig';

export const CinemaVideoLayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  const movie = useAppStore((s) => s.currentMovie);
  const sync = useAppStore((s) => s.syncState);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isHost = useAppStore((s) => s.isHost);
  const isSitting = useAppStore((s) => s.isSitting);
  const seatIndex = useAppStore((s) => s.seatIndex);

  const seated = isSitting && (seatIndex === 0 || seatIndex === 1);
  const source = movie?.playbackUrl
    ? movie.playbackUrl.startsWith('http')
      ? movie.playbackUrl
      : apiUrl(movie.playbackUrl)
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
    const targetTime = state.syncState.currentTime;

    if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.35) {
      video.currentTime = Math.max(0, targetTime);
    }

    if (state.isPlaying) {
      // Socket-driven playback remains muted until a user gesture unlocks audio.
      const p = video.play();
      if (p !== undefined) {
        p.catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    } else {
      video.pause();
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
        preload="metadata"
        className="absolute inset-0 h-full w-full bg-black object-contain pointer-events-none"
        onLoadedMetadata={applyCurrentState}
        onCanPlay={applyCurrentState}
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
