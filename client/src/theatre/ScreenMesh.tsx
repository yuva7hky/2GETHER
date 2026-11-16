import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

export const ScreenMesh: React.FC = () => {
  const currentMovie = useAppStore((state) => state.currentMovie);
  const syncState = useAppStore((state) => state.syncState);
  const isPlaying = useAppStore((state) => state.isPlaying);

  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const screenRef = useRef<THREE.Mesh>(null);
  const projectorLightRef = useRef<THREE.SpotLight>(null);

  // Setup HTML5 video element when a movie URL is provided
  useEffect(() => {
    if (!currentMovie?.playbackUrl) {
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        setVideoElement(null);
        setVideoTexture(null);
      }
      return;
    }

    const vid = document.createElement('video');
    vid.src = currentMovie.playbackUrl;
    vid.crossOrigin = 'anonymous';
    vid.loop = false;
    vid.muted = false;
    vid.playsInline = true;

    const texture = new THREE.VideoTexture(vid);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;

    setVideoElement(vid);
    setVideoTexture(texture);

    return () => {
      vid.pause();
      vid.src = '';
      texture.dispose();
    };
  }, [currentMovie?.playbackUrl]);

  // Synchronize play / pause / seek from store
  useEffect(() => {
    if (!videoElement) return;

    if (isPlaying) {
      videoElement.play().catch((err) => {
        console.warn('[ScreenMesh] Auto-play was blocked or waiting for user interaction:', err);
      });
    } else {
      videoElement.pause();
    }
  }, [isPlaying, videoElement]);

  useEffect(() => {
    if (!videoElement || syncState.currentTime === undefined) return;
    const diff = Math.abs(videoElement.currentTime - syncState.currentTime);
    if (diff > 1.5) {
      videoElement.currentTime = syncState.currentTime;
    }
  }, [syncState.currentTime, videoElement]);

  // Subtle projector shimmer effect
  useFrame((state) => {
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
        {videoTexture ? (
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

      {/* Standby UI displayed on screen when no movie is playing */}
      {!videoTexture && (
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
            {useAppStore.getState().isHost 
              ? 'Click "Select Movie" to begin streaming'
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

      {/* Overhead Projector Spotlight pointing at screen from behind audience */}
      <spotLight
        ref={projectorLightRef}
        position={[0, 4.5, 12]}
        target={screenRef.current || undefined}
        color="#fef08a"
        intensity={1.2}
        angle={Math.PI / 6}
        penumbra={0.8}
        castShadow
      />
    </group>
  );
};
