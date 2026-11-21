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

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [screenTexture, setScreenTexture] = useState<THREE.Texture | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const screenRef = useRef<THREE.Mesh>(null);
  const projectorLightRef = useRef<THREE.SpotLight>(null);

  // Offscreen 2D Canvas buffer refs to completely eliminate Android Chrome VideoTexture horizontal black bands
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastSyncBroadcastRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

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

    // 1. Offscreen canvas buffer (strictly synchronized, no tearing, macroblock-aligned)
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    // CRITICAL FIX: NEVER use desynchronized: true on Android — it causes mid-frame VSync scanline tearing (black stripes)
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    offscreenCanvasRef.current = canvas;
    offscreenCtxRef.current = ctx;

    // Initial warm standby fill
    if (ctx) {
      ctx.fillStyle = '#0f0a1e';
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

    // CRITICAL FIX: Active layout footprint (320x180) prevents Android MediaCodec occlusion subsampling / frame-drop artifacts
    vid.style.position = 'fixed';
    vid.style.bottom = '0';
    vid.style.right = '0';
    vid.style.width = '320px';
    vid.style.height = '180px';
    vid.style.opacity = '0.0001';
    vid.style.pointerEvents = 'none';
    vid.style.zIndex = '-9999';
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

  // Handle incoming remote sync packet (Drift correction & Seek)
  useEffect(() => {
    if (!videoElement || typeof syncState.currentTime !== 'number') return;

    const latency = Math.max(0, (Date.now() - (syncState.timestamp || Date.now())) / 1000);
    const targetTime = syncState.currentTime + (syncState.action === 'PLAY' ? latency : 0);
    const drift = Math.abs(videoElement.currentTime - targetTime);

    // Large drift (or explicit seek): snap immediately
    if (drift > 1.2) {
      videoElement.currentTime = targetTime;
    } else if (drift > 0.25 && syncState.action === 'PLAY') {
      // Minor drift: smoothly speed up / slow down to seamlessly catch up without audio popping
      videoElement.playbackRate = videoElement.currentTime < targetTime ? 1.08 : 0.92;
    } else {
      videoElement.playbackRate = 1.0;
    }
  }, [syncState.currentTime, syncState.action, syncState.timestamp, videoElement]);

  // Frame Render Loop: Draw 2D canvas frame buffer & broadcast host sync heartbeat
  useFrame((state) => {
    const now = performance.now();

    // 1. Host sync heartbeat: broadcast playback time every 2 seconds
    if (isHost && isPlaying && videoElement && !videoElement.paused) {
      if (now - lastSyncBroadcastRef.current > 2000) {
        lastSyncBroadcastRef.current = now;
        socketService.sendMovieSync('PLAY', videoElement.currentTime, currentMovie?.playbackUrl);
      }
    }

    // 2. Offscreen 2D canvas draw: fixed-resolution letterboxed rendering (Zero stride mismatch, zero tearing, zero black bands)
    if (videoElement && offscreenCtxRef.current && offscreenCanvasRef.current && screenTexture) {
      if (videoElement.readyState >= 2 && !videoElement.paused) {
        const currTime = videoElement.currentTime;
        // Only draw & upload when the video frame has actually advanced!
        if (Math.abs(currTime - lastVideoTimeRef.current) > 0.015) {
          lastVideoTimeRef.current = currTime;
          const canvas = offscreenCanvasRef.current;
          const ctx = offscreenCtxRef.current;

          const vw = videoElement.videoWidth || 1280;
          const vh = videoElement.videoHeight || 720;
          const videoAspect = vw / vh;
          const canvasAspect = 1280 / 720; // 1.7777...

          let drawW = 1280;
          let drawH = 720;
          let drawX = 0;
          let drawY = 0;

          if (videoAspect > canvasAspect) {
            // Wider than 16:9 (e.g. 21:9 cinemascope) -> letterbox top & bottom
            drawH = Math.round(1280 / videoAspect);
            drawY = Math.round((720 - drawH) / 2);
          } else if (videoAspect < canvasAspect) {
            // Taller than 16:9 (e.g. 4:3 or phone portrait 9:16) -> pillarbox left & right
            drawW = Math.round(720 * videoAspect);
            drawX = Math.round((1280 - drawW) / 2);
          }

          // Clear margin areas with clean cinema black
          ctx.fillStyle = '#0a0515';
          ctx.fillRect(0, 0, 1280, 720);

          // Draw video cleanly centered without any stride or aspect ratio distortion
          ctx.drawImage(videoElement, drawX, drawY, drawW, drawH);
          screenTexture.needsUpdate = true;
        }
      }
    }

    // 3. Projector atmospheric shimmer
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

      {/* Main Cinema Screen Canvas */}
      <mesh ref={screenRef} position={[0, 0, 0.05]}>
        <planeGeometry args={[13.6, 7.6]} />
        {screenTexture && isVideoReady ? (
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
