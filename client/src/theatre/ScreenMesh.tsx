import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { apiUrl } from '../services/apiConfig';

export const ScreenMesh: React.FC = () => {
  const currentMovie = useAppStore((state) => state.currentMovie);
  const syncState = useAppStore((state) => state.syncState);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isHost = useAppStore((state) => state.isHost);
  const isSitting = useAppStore((state) => state.isSitting);
  const seatIndex = useAppStore((state) => state.seatIndex);

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const isSeatedInCinema = isSitting === true && (seatIndex === 0 || seatIndex === 1);
  const useDomVideo = isAndroid && isSeatedInCinema;

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [screenTexture, setScreenTexture] = useState<THREE.Texture | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const screenRef = useRef<THREE.Mesh>(null);
  const projectorLightRef = useRef<THREE.SpotLight>(null);

  // Offscreen 2D Canvas buffer refs
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastSyncBroadcastRef = useRef<number>(0);
  const rvfcRef = useRef<number>(0);

  // Setup HTML5 video element with clean 2D Canvas bridge
  useEffect(() => {
    if (!currentMovie?.playbackUrl) {
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        if (videoElement.parentNode) {
          videoElement.parentNode.removeChild(videoElement);
        }
        setVideoElement(null);
        setScreenTexture(null);
        setIsVideoReady(false);
      }
      return;
    }

    const rawUrl = currentMovie.playbackUrl;
    const resolvedUrl = rawUrl.startsWith('http') ? rawUrl : apiUrl(rawUrl);

    console.log('[ScreenMesh] Initializing movie playback stream:', resolvedUrl);

    // 1. Offscreen canvas buffer (CPU bitmap with willReadFrequently: true so texImage2D cannot sample a live Skia tile)
    const maxW = isAndroid ? 854 : 1280;
    const maxH = isAndroid ? 480 : 720;
    const canvas = document.createElement('canvas');
    canvas.width = maxW;
    canvas.height = maxH;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    offscreenCanvasRef.current = canvas;
    offscreenCtxRef.current = ctx;

    // Initial warm standby fill
    if (ctx) {
      ctx.fillStyle = '#0a0515';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.wrapS = THREE.ClampToEdgeWrapping;
    canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
    canvasTexture.minFilter = THREE.LinearFilter;
    canvasTexture.magFilter = THREE.LinearFilter;
    canvasTexture.generateMipmaps = false;
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.unpackAlignment = 1;
    setScreenTexture(canvasTexture);

    // 2. Video element
    const vid = document.createElement('video');
    vid.src = resolvedUrl;
    vid.crossOrigin = 'anonymous';
    vid.loop = false;
    vid.playsInline = true;
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.setAttribute('x5-playsinline', 'true');
    vid.setAttribute('controlslist', 'nodownload nofullscreen');
    vid.preload = 'auto';
    vid.muted = true; // Start muted for reliable zero-latency mobile autoplay

    // Position video element; if seated on Android, will expand into full DOM layer via effect
    vid.style.position = 'fixed';
    vid.style.left = '0';
    vid.style.bottom = '0';
    vid.style.width = '8px';
    vid.style.height = '8px';
    vid.style.opacity = '0.02';
    vid.style.zIndex = '0';
    vid.style.pointerEvents = 'none';
    document.body.appendChild(vid);

    setVideoElement(vid);
    useAppStore.getState().setActiveVideoElement(vid);

    vid.oncanplay = () => {
      setIsVideoReady(true);
    };

    vid.onloadeddata = () => {
      setIsVideoReady(true);
    };

    vid.onloadedmetadata = () => {
      if (vid.duration && !isNaN(vid.duration)) {
        useAppStore.getState().setMovieDuration(vid.duration);
      }
    };

    vid.ontimeupdate = () => {
      useAppStore.getState().setMovieTime(vid.currentTime);
    };

    vid.onerror = () => {
      console.error('[ScreenMesh] Video element error:', vid.error);
    };

    // Drive texture upload from requestVideoFrameCallback on desktop / non-seated mode
    let isCancelled = false;
    const paint = () => {
      if (isCancelled) return;
      if ('requestVideoFrameCallback' in vid) {
        rvfcRef.current = vid.requestVideoFrameCallback(() => {
          const c = offscreenCanvasRef.current;
          const cx = offscreenCtxRef.current;
          if (!cx || !c || vid.readyState < 2) {
            paint();
            return;
          }
          const vw = vid.videoWidth || maxW;
          const vh = vid.videoHeight || maxH;
          const videoAspect = vw / vh;
          const canvasAspect = maxW / maxH;
          let dw = maxW;
          let dh = maxH;
          let dx = 0;
          let dy = 0;
          if (videoAspect > canvasAspect) {
            dh = Math.round(maxW / videoAspect);
            dy = Math.round((maxH - dh) / 2);
          } else if (videoAspect < canvasAspect) {
            dw = Math.round(maxH * videoAspect);
            dx = Math.round((maxW - dw) / 2);
          }
          cx.fillStyle = '#0a0515';
          cx.fillRect(0, 0, maxW, maxH);
          cx.drawImage(vid, dx, dy, dw, dh);
          cx.getImageData(0, 0, 1, 1); // Stalls CPU/GPU queue until Skia raster is 100% complete
          canvasTexture.needsUpdate = true;
          paint();
        });
      }
    };
    paint();

    // Global interaction listener to auto-unmute on first user touch / click
    const handleUserInteraction = () => {
      if (vid.muted) {
        vid.muted = false;
      }
      if (useAppStore.getState().isPlaying && vid.paused) {
        vid.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleUserInteraction);

    return () => {
      isCancelled = true;
      if (rvfcRef.current && 'cancelVideoFrameCallback' in vid) {
        vid.cancelVideoFrameCallback(rvfcRef.current);
      }
      window.removeEventListener('pointerdown', handleUserInteraction);
      vid.pause();
      vid.src = '';
      if (vid.parentNode) {
        vid.parentNode.removeChild(vid);
      }
      canvasTexture.dispose();
      useAppStore.getState().setActiveVideoElement(null);
    };
  }, [currentMovie?.playbackUrl]);

  // Responsive DOM Video layer for Android cinema mode
  useEffect(() => {
    if (!videoElement) return;
    if (useDomVideo) {
      videoElement.style.position = 'fixed';
      videoElement.style.left = '0';
      videoElement.style.top = '0';
      videoElement.style.bottom = '0';
      videoElement.style.width = '100vw';
      videoElement.style.height = '100vh';
      videoElement.style.objectFit = 'contain';
      videoElement.style.background = '#000';
      videoElement.style.opacity = '1';
      videoElement.style.zIndex = '15'; // Below overlay controls (z-20 and z-30)
      videoElement.style.pointerEvents = 'none';
    } else {
      videoElement.style.position = 'fixed';
      videoElement.style.left = '0';
      videoElement.style.top = 'auto';
      videoElement.style.bottom = '0';
      videoElement.style.width = '8px';
      videoElement.style.height = '8px';
      videoElement.style.objectFit = 'contain';
      videoElement.style.background = 'transparent';
      videoElement.style.opacity = '0.02';
      videoElement.style.zIndex = '0';
      videoElement.style.pointerEvents = 'none';
    }
  }, [useDomVideo, videoElement]);

  // Synchronize play / pause with intelligent mobile unlock
  useEffect(() => {
    if (!videoElement) return;

    if (isPlaying) {
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          videoElement.muted = true;
          videoElement.play().catch((err) => {
            console.warn('[ScreenMesh] Autoplay blocked, waiting for user tap:', err.message);
          });
        });
      }
    } else {
      videoElement.pause();
    }
  }, [isPlaying, videoElement]);

  // Authoritative sync application with pitch preservation
  useEffect(() => {
    if (!videoElement || typeof syncState.currentTime !== 'number') return;
    const mediaTime = syncState.currentTime;
    const action = syncState.action || 'PLAY';

    if (action === 'SEEK' || action === 'PAUSE') {
      videoElement.playbackRate = 1;
      if (Math.abs(videoElement.currentTime - mediaTime) > 0.05) {
        videoElement.currentTime = mediaTime;
      }
      if (action === 'PAUSE' && !videoElement.paused) {
        videoElement.pause();
      }
      return;
    }

    const drift = videoElement.currentTime - mediaTime;
    if (Math.abs(drift) > 0.8) {
      videoElement.currentTime = mediaTime;
      videoElement.playbackRate = 1;
    } else if (drift > 0.12) {
      videoElement.playbackRate = 0.96;
    } else if (drift < -0.12) {
      videoElement.playbackRate = 1.04;
    } else {
      videoElement.playbackRate = 1;
    }
    (videoElement as any).preservesPitch = true;
  }, [syncState.currentTime, syncState.action, videoElement]);

  // Frame Render Loop: Host sync heartbeat & projector atmospheric shimmer
  useFrame((state) => {
    const now = performance.now();

    // 1. Host sync heartbeat: broadcast playback time every 2 seconds
    if (isHost && isPlaying && videoElement && !videoElement.paused) {
      if (now - lastSyncBroadcastRef.current > 2000) {
        lastSyncBroadcastRef.current = now;
        socketService.sendMovieSync('PLAY', videoElement.currentTime, currentMovie?.playbackUrl);
      }
    }

    // 2. Projector atmospheric shimmer
    if (projectorLightRef.current) {
      const flicker = Math.sin(state.clock.getElapsedTime() * 10) * 0.05 + 0.95;
      projectorLightRef.current.intensity = isPlaying ? 2.5 * flicker : 1.2;
    }
  });

  return (
    <group position={[0, 4.8, -9.5]}>
      {/* Outer Velvet Frame */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[14.4, 8.4, 0.3]} />
        <meshStandardMaterial color="#1a0b2e" roughness={0.8} />
      </mesh>

      {/* Gold Inner Frame Border */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[13.9, 7.9, 0.1]} />
        <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Main Cinema Screen Canvas (On Android while seated, DOM video renders in front, leaving mesh as dark plane) */}
      <mesh ref={screenRef} position={[0, 0, 0.05]}>
        <planeGeometry args={[13.6, 7.6]} />
        {screenTexture && isVideoReady && !useDomVideo ? (
          <meshBasicMaterial map={screenTexture} toneMapped={false} />
        ) : (
          <meshStandardMaterial
            color="#0d081f"
            roughness={0.3}
            metalness={0.1}
            emissive="#1b1236"
            emissiveIntensity={0.4}
          />
        )}
      </mesh>

      {/* Standby UI displayed on screen when no movie or video is loading */}
      {(!screenTexture || !isVideoReady) && (
        <group position={[0, 0, 0.1]}>
          <Text
            position={[0, 1.2, 0]}
            fontSize={0.8}
            color="#f59e0b"
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.15}
          >
            2GETHER
          </Text>

          <Text
            position={[0, 0.1, 0]}
            fontSize={0.4}
            color="#f43f5e"
            anchorX="center"
            anchorY="middle"
          >
            ♥
          </Text>

          <Text
            position={[0, -0.8, 0]}
            fontSize={0.32}
            color="#cbd5e1"
            anchorX="center"
            anchorY="middle"
          >
            Two Hearts. One Theatre. One Movie.
          </Text>

          <Text
            position={[0, -1.8, 0]}
            fontSize={0.22}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
          >
            {currentMovie
              ? 'Loading movie stream...'
              : useAppStore.getState().isHost
              ? 'Click "Projector / Upload" to select movie'
              : 'Waiting for room host to select movie...'}
          </Text>
        </group>
      )}

      {/* Cinema Screen Ambient Glow */}
      <pointLight
        position={[0, 0, 1.2]}
        color={isPlaying ? '#fbbf24' : '#c084fc'}
        intensity={isPlaying ? 1.8 : 0.6}
        distance={18}
      />
    </group>
  );
};
