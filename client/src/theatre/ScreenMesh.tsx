import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { apiUrl } from '../services/apiConfig';

export const ScreenMesh: React.FC = () => {
  const currentMovie = useAppStore((state) => state.currentMovie);
  const syncState = useAppStore((state) => state.syncState);
  const isPlaying = useAppStore((state) => state.isPlaying);

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const screenRef = useRef<THREE.Mesh>(null);
  const projectorLightRef = useRef<THREE.SpotLight>(null);

  // Setup HTML5 video element with mobile hardware decoder stabilization
  useEffect(() => {
    if (!currentMovie?.playbackUrl) {
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        if (videoElement.parentNode) {
          videoElement.parentNode.removeChild(videoElement);
        }
        setVideoElement(null);
        setVideoTexture(null);
        setIsVideoReady(false);
      }
      return;
    }

    const rawUrl = currentMovie.playbackUrl;
    const resolvedUrl = rawUrl.startsWith('http') ? rawUrl : apiUrl(rawUrl);

    console.log('[ScreenMesh] Initializing movie playback stream:', resolvedUrl);

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
    vid.muted = true; // Essential for immediate hardware decoder start without browser autoplay restrictions

    // Invisible DOM attachment: on Android/Mobile Chrome, detached video elements suffer from macroblock tiling / black bands
    vid.style.position = 'fixed';
    vid.style.top = '0';
    vid.style.left = '0';
    vid.style.width = '1px';
    vid.style.height = '1px';
    vid.style.opacity = '0.001';
    vid.style.pointerEvents = 'none';
    vid.style.zIndex = '-9999';
    document.body.appendChild(vid);

    const texture = new THREE.VideoTexture(vid);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    setVideoElement(vid);
    setVideoTexture(texture);
    useAppStore.getState().setActiveVideoElement(vid);

    let rvfcId: number | null = null;
    const updateLoop = () => {
      texture.needsUpdate = true;
      if ('requestVideoFrameCallback' in vid) {
        rvfcId = (vid as any).requestVideoFrameCallback(updateLoop);
      }
    };

    vid.oncanplay = () => {
      setIsVideoReady(true);
      texture.needsUpdate = true;
      if ('requestVideoFrameCallback' in vid && rvfcId === null) {
        rvfcId = (vid as any).requestVideoFrameCallback(updateLoop);
      }
    };

    vid.onloadeddata = () => {
      setIsVideoReady(true);
      texture.needsUpdate = true;
    };

    vid.onloadedmetadata = () => {
      if (vid.duration && !isNaN(vid.duration)) {
        useAppStore.getState().setMovieDuration(vid.duration);
      }
    };

    vid.ontimeupdate = () => {
      useAppStore.getState().setMovieTime(vid.currentTime);
    };

    vid.onerror = (e) => {
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
      if (rvfcId !== null && 'cancelVideoFrameCallback' in vid) {
        (vid as any).cancelVideoFrameCallback(rvfcId);
      }
      vid.pause();
      vid.src = '';
      if (vid.parentNode) {
        vid.parentNode.removeChild(vid);
      }
      texture.dispose();
      useAppStore.getState().setActiveVideoElement(null);
    };
  }, [currentMovie?.playbackUrl]);

  // Synchronize play / pause from store with intelligent autoplay unlock
  useEffect(() => {
    if (!videoElement) return;

    if (isPlaying) {
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback to muted playback if autoplay policy blocks unmuted audio
          videoElement.muted = true;
          videoElement.play().catch((err) => {
            console.warn('[ScreenMesh] Autoplay blocked, waiting for tap:', err.message);
          });
        });
      }
    } else {
      videoElement.pause();
    }
  }, [isPlaying, videoElement]);

  // Synchronize seek from store
  useEffect(() => {
    if (!videoElement || typeof syncState.currentTime !== 'number') return;
    const diff = Math.abs(videoElement.currentTime - syncState.currentTime);
    if (diff > 0.8) {
      videoElement.currentTime = syncState.currentTime;
    }
  }, [syncState.currentTime, videoElement]);

  // Update video texture each frame fallback and projector shimmer
  useFrame((state) => {
    if (!('requestVideoFrameCallback' in (videoElement || {}))) {
      if (videoTexture && videoElement && videoElement.readyState >= 2 && !videoElement.paused) {
        videoTexture.needsUpdate = true;
      }
    }

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
        {videoTexture && isVideoReady ? (
          <meshBasicMaterial map={videoTexture} toneMapped={false} />
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
      {(!videoTexture || !isVideoReady) && (
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
