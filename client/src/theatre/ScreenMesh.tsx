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
  const lastSyncBroadcastRef = useRef<number>(0);

  // Setup HTML5 video element with direct Hardware-Accelerated Three.js VideoTexture
  useEffect(() => {
    if (!currentMovie?.playbackUrl) {
      if (videoElement) {
        videoElement.onerror = null;
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
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

    // 1. Create Video Element
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
    vid.muted = true; // Start muted for reliable mobile autoplay unlock

    // Keep video element mounted offscreen but active for audio & decoding
    vid.style.position = 'fixed';
    vid.style.left = '-9999px';
    vid.style.top = '-9999px';
    vid.style.width = '1px';
    vid.style.height = '1px';
    vid.style.opacity = '0';
    vid.style.pointerEvents = 'none';
    document.body.appendChild(vid);

    setVideoElement(vid);
    useAppStore.getState().setActiveVideoElement(vid);

    const markVideoReady = () => {
      if (vid.readyState >= 2 && vid.videoWidth > 0) {
        setIsVideoReady(true);
      }
    };

    vid.oncanplay = markVideoReady;
    vid.onloadeddata = markVideoReady;
    vid.onplaying = markVideoReady;
    vid.onseeked = markVideoReady;

    vid.onloadedmetadata = () => {
      if (vid.duration && !isNaN(vid.duration)) {
        useAppStore.getState().setMovieDuration(vid.duration);
      }
      markVideoReady();
    };

    vid.ontimeupdate = () => {
      if (vid.currentTime > 0) markVideoReady();
      useAppStore.getState().setMovieTime(vid.currentTime);
    };

    vid.onerror = () => {
      if (vid.src) {
        console.error('[ScreenMesh] Video element error:', vid.error);
      }
    };

    if (vid.readyState >= 2 && vid.videoWidth > 0) {
      markVideoReady();
    }

    // 2. Hardware-accelerated Three.js VideoTexture
    const videoTexture = new THREE.VideoTexture(vid);
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    setScreenTexture(videoTexture);

    // Global interaction listener to auto-unmute on first user touch / click / keypress
    const handleUserInteraction = () => {
      if (vid.muted) {
        vid.muted = false;
      }
      if (useAppStore.getState().isPlaying && vid.paused) {
        vid.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('click', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      // Suppress error event during cleanup to prevent MEDIA_ELEMENT_ERROR: Empty src attribute
      vid.onerror = null;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      if (vid.parentNode) {
        vid.parentNode.removeChild(vid);
      }
      videoTexture.dispose();
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

  // Authoritative sync application with smooth pitch preservation (no micro-resampling jitter)
  useEffect(() => {
    if (!videoElement || typeof syncState.currentTime !== 'number') return;
    const mediaTime = syncState.currentTime;
    const action = syncState.action || 'PLAY';

    if (action === 'SEEK' || action === 'PAUSE') {
      videoElement.playbackRate = 1.0;
      if (Math.abs(videoElement.currentTime - mediaTime) > 0.08) {
        videoElement.currentTime = mediaTime;
      }
      if (action === 'PAUSE' && !videoElement.paused) {
        videoElement.pause();
      }
      return;
    }

    const drift = videoElement.currentTime - mediaTime;
    if (Math.abs(drift) > 2.0) {
      // Large drift: sync timestamp directly
      videoElement.currentTime = mediaTime;
      videoElement.playbackRate = 1.0;
    } else if (drift > 0.45) {
      // Gentle catch-up without audio stutter
      videoElement.playbackRate = 0.96;
    } else if (drift < -0.45) {
      videoElement.playbackRate = 1.04;
    } else {
      videoElement.playbackRate = 1.0;
    }
    (videoElement as any).preservesPitch = true;
  }, [syncState.currentTime, syncState.action, videoElement]);

  // Frame Render Loop: Host sync heartbeat & projector atmospheric shimmer
  useFrame((state) => {
    const now = performance.now();

    // 0. Only refresh VideoTexture if frame is actually decoded to prevent WebGL texImage2D: no video error
    if (screenTexture && videoElement && videoElement.readyState >= 2 && videoElement.videoWidth > 0 && !videoElement.paused) {
      screenTexture.needsUpdate = true;
    }

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

      {/* Main Cinema Screen Canvas - Renders directly in 3D for both Desktop and Mobile */}
      <mesh ref={screenRef} position={[0, 0, 0.05]}>
        <planeGeometry args={[13.6, 7.6]} />
        {screenTexture && (isVideoReady || isPlaying) ? (
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
      {(!screenTexture || (!isVideoReady && !isPlaying)) && (
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
