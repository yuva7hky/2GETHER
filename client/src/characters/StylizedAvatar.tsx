import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float } from '@react-three/drei';
import * as THREE from 'three';
import { CharacterAppearance, CharacterAnimationState } from '../types';

interface StylizedAvatarProps {
  name: string;
  appearance: CharacterAppearance;
  animationState: CharacterAnimationState;
  isSitting?: boolean;
  isLocal?: boolean;
  showNameTag?: boolean;
}

export const StylizedAvatar: React.FC<StylizedAvatarProps> = ({
  name,
  appearance,
  animationState,
  isSitting = false,
  isLocal = false,
  showNameTag = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftEarRef = useRef<THREE.Mesh>(null);
  const rightEarRef = useRef<THREE.Mesh>(null);

  // Materials derived from appearance
  const skinMat = new THREE.MeshStandardMaterial({
    color: appearance.skinColor || '#fbcfe8',
    roughness: 0.4,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: appearance.hairColor || '#3b0764',
    roughness: 0.5,
  });

  const clothesMat = new THREE.MeshStandardMaterial({
    color: appearance.clothingColor || '#ec4899',
    roughness: 0.3,
  });

  const blushMat = new THREE.MeshBasicMaterial({
    color: '#fb7185',
    transparent: true,
    opacity: 0.65,
  });

  const eyeMat = new THREE.MeshBasicMaterial({
    color: '#0f172a',
  });

  const eyeHighlightMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    metalness: 0.8,
    roughness: 0.2,
  });

  // Procedural Animation Loop
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (isSitting) {
      // Sitting posture
      if (bodyRef.current) bodyRef.current.position.y = 0.45;
      if (headRef.current) {
        headRef.current.position.y = 1.05;
        headRef.current.rotation.x = Math.sin(t * 1.5) * 0.05;
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.1;
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = -Math.PI / 2;
        leftLegRef.current.position.set(-0.2, 0.45, 0.25);
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = -Math.PI / 2;
        rightLegRef.current.position.set(0.2, 0.45, 0.25);
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = -Math.PI / 6;
        leftArmRef.current.position.set(-0.4, 0.65, 0.15);
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI / 6;
        rightArmRef.current.position.set(0.4, 0.65, 0.15);
      }
      return;
    }

    // Standing / Walking / Running
    if (animationState === 'IDLE') {
      const breath = Math.sin(t * 2.5) * 0.03;
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.6 + breath;
        bodyRef.current.rotation.z = Math.sin(t * 1.2) * 0.02;
      }
      if (headRef.current) {
        headRef.current.position.y = 1.25 + breath * 1.3;
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.08;
      }
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 2.5) * 0.05;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.sin(t * 2.5) * 0.05;
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = 0;
        leftLegRef.current.position.set(-0.2, 0.25, 0);
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = 0;
        rightLegRef.current.position.set(0.2, 0.25, 0);
      }
      if (leftEarRef.current) leftEarRef.current.rotation.z = 0.2 + Math.sin(t * 3) * 0.05;
      if (rightEarRef.current) rightEarRef.current.rotation.z = -0.2 - Math.sin(t * 3) * 0.05;
    } else if (animationState === 'WALK' || animationState === 'RUN') {
      const speedMultiplier = animationState === 'RUN' ? 12 : 7;
      const legSwing = Math.sin(t * speedMultiplier) * (animationState === 'RUN' ? 0.8 : 0.5);
      const bob = Math.abs(Math.sin(t * speedMultiplier)) * (animationState === 'RUN' ? 0.08 : 0.04);

      if (bodyRef.current) {
        bodyRef.current.position.y = 0.6 + bob;
        bodyRef.current.rotation.x = animationState === 'RUN' ? 0.15 : 0.05;
        bodyRef.current.rotation.z = Math.sin(t * speedMultiplier) * 0.04;
      }
      if (headRef.current) {
        headRef.current.position.y = 1.25 + bob * 1.2;
        headRef.current.rotation.x = animationState === 'RUN' ? 0.1 : 0.03;
      }
      if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -legSwing * 0.9;
      if (rightArmRef.current) rightArmRef.current.rotation.x = legSwing * 0.9;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Floating Name Tag */}
      {showNameTag && (
        <group position={[0, 1.85, 0]}>
          <Float speed={2} rotationIntensity={0} floatIntensity={0.2}>
            {/* Pill Background */}
            <mesh position={[0, 0, -0.02]}>
              <planeGeometry args={[Math.max(name.length * 0.14 + 0.4, 1.2), 0.34]} />
              <meshBasicMaterial 
                color={isLocal ? '#3b0764' : '#1e1b4b'} 
                transparent 
                opacity={0.85} 
                side={THREE.DoubleSide}
              />
            </mesh>
            <Text
              color={isLocal ? '#fef08a' : '#fbcfe8'}
              fontSize={0.16}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#090514"
            >
              {name} {isLocal ? '(You)' : '♥'}
            </Text>
          </Float>
        </group>
      )}

      {/* Head Group */}
      <group ref={headRef} position={[0, 1.25, 0]}>
        {/* Head Mesh: Soft round sphere */}
        <mesh material={skinMat} castShadow>
          <sphereGeometry args={[0.38, 32, 32]} />
        </mesh>

        {/* Hair Cap */}
        <mesh material={hairMat} position={[0, 0.08, -0.05]} castShadow>
          <sphereGeometry args={[0.39, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>

        {/* Cute Ears / Bear Ears */}
        <mesh ref={leftEarRef} material={hairMat} position={[-0.32, 0.32, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
        </mesh>
        <mesh ref={rightEarRef} material={hairMat} position={[0.32, 0.32, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
        </mesh>

        {/* Inner Ears */}
        <mesh material={skinMat} position={[-0.32, 0.32, 0.04]}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>
        <mesh material={skinMat} position={[0.32, 0.32, 0.04]}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>

        {/* Eyes: Cute large expressive cartoon eyes */}
        <mesh material={eyeMat} position={[-0.13, 0.02, 0.34]}>
          <sphereGeometry args={[0.06, 16, 16]} />
        </mesh>
        <mesh material={eyeMat} position={[0.13, 0.02, 0.34]}>
          <sphereGeometry args={[0.06, 16, 16]} />
        </mesh>

        {/* Eye Sparkle Highlights */}
        <mesh material={eyeHighlightMat} position={[-0.11, 0.04, 0.38]}>
          <sphereGeometry args={[0.022, 8, 8]} />
        </mesh>
        <mesh material={eyeHighlightMat} position={[0.15, 0.04, 0.38]}>
          <sphereGeometry args={[0.022, 8, 8]} />
        </mesh>

        {/* Cute Rosy Blush Cheeks */}
        <mesh material={blushMat} position={[-0.22, -0.08, 0.3]}>
          <circleGeometry args={[0.06, 16]} />
        </mesh>
        <mesh material={blushMat} position={[0.22, -0.08, 0.3]}>
          <circleGeometry args={[0.06, 16]} />
        </mesh>

        {/* Tiny Button Nose */}
        <mesh material={skinMat} position={[0, -0.02, 0.37]}>
          <sphereGeometry args={[0.025, 8, 8]} />
        </mesh>

        {/* Accessory: Ribbon / Star / Headphones */}
        {appearance.accessory === 'ribbon' && (
          <group position={[0.25, 0.36, 0.15]} rotation={[0.2, -0.3, 0.4]}>
            <mesh material={clothesMat}>
              <coneGeometry args={[0.09, 0.14, 8]} />
            </mesh>
            <mesh material={clothesMat} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.09, 0.14, 8]} />
            </mesh>
            <mesh material={goldMat}>
              <sphereGeometry args={[0.045, 8, 8]} />
            </mesh>
          </group>
        )}

        {appearance.accessory === 'star_clip' && (
          <mesh material={goldMat} position={[0.26, 0.28, 0.24]}>
            <dodecahedronGeometry args={[0.07]} />
          </mesh>
        )}
      </group>

      {/* Body Group: Cute pill / hoodie body */}
      <group ref={bodyRef} position={[0, 0.6, 0]}>
        <mesh material={clothesMat} castShadow>
          <cylinderGeometry args={[0.28, 0.33, 0.55, 32]} />
        </mesh>

        {/* Warm golden pendant / heart icon on sweater */}
        <mesh material={goldMat} position={[0, 0.12, 0.3]}>
          <sphereGeometry args={[0.05, 16, 16]} />
        </mesh>
      </group>

      {/* Cute Arms */}
      <mesh
        ref={leftArmRef}
        material={clothesMat}
        position={[-0.38, 0.65, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.28, 8, 16]} />
      </mesh>
      <mesh
        ref={rightArmRef}
        material={clothesMat}
        position={[0.38, 0.65, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.28, 8, 16]} />
      </mesh>

      {/* Cute Stubby Legs */}
      <mesh
        ref={leftLegRef}
        material={clothesMat}
        position={[-0.18, 0.22, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.09, 0.24, 8, 16]} />
      </mesh>
      <mesh
        ref={rightLegRef}
        material={clothesMat}
        position={[0.18, 0.22, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.09, 0.24, 8, 16]} />
      </mesh>

      {/* Cute Shoes */}
      <mesh material={hairMat} position={[-0.18, 0.05, 0.03]} castShadow>
        <boxGeometry args={[0.16, 0.1, 0.22]} />
      </mesh>
      <mesh material={hairMat} position={[0.18, 0.05, 0.03]} castShadow>
        <boxGeometry args={[0.16, 0.1, 0.22]} />
      </mesh>
    </group>
  );
};
