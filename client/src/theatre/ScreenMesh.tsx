import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

export const ScreenMesh: React.FC = () => {
  const currentMovie = useAppStore((state) => state.currentMovie);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isHost = useAppStore((state) => state.isHost);
  const projectorLightRef = useRef<THREE.SpotLight>(null);

  // Subtle projector atmospheric shimmer
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

      {/* Main Cinema Screen Matte */}
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[13.6, 7.6]} />
        <meshStandardMaterial
          color="#0d081f"
          roughness={0.3}
          metalness={0.1}
          emissive={currentMovie ? '#2b1b4d' : '#1b1236'}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* 3D Atmospheric Standby Information */}
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
          {currentMovie ? currentMovie.title : 'Two Hearts. One Theatre. One Movie.'}
        </Text>

        <Text
          position={[0, -1.8, 0]}
          fontSize={0.22}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          {currentMovie
            ? '🎬 Sit together in the front row to watch full screen!'
            : isHost
            ? 'Click "Projector / Upload" to select movie'
            : 'Waiting for room host to select movie...'}
        </Text>
      </group>

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
