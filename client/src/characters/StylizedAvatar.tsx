import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { CharacterAppearance, CharacterAnimationState } from '../types';

interface StylizedAvatarProps {
  name: string;
  appearance: CharacterAppearance;
  animationState: CharacterAnimationState;
  isSitting?: boolean;
  seatIndex?: number | null;
  isLocal?: boolean;
  showNameTag?: boolean;
}

export const StylizedAvatar: React.FC<StylizedAvatarProps> = ({
  name,
  appearance,
  animationState,
  isSitting = false,
  seatIndex = null,
  isLocal = false,
  showNameTag = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  // Live WebRTC Voice Activity state
  const isLocalSpeaking = useAppStore((state) => state.isLocalSpeaking);
  const isRemoteSpeaking = useAppStore((state) => state.isRemoteSpeaking);
  const isSpeaking = isLocal ? isLocalSpeaking : isRemoteSpeaking;

  // Determine character type (Boy or Girl from reference Image 3)
  const isGirl = useMemo(() => {
    if (appearance.gender === 'girl') return true;
    if (appearance.gender === 'boy') return false;
    if (appearance.accessory === 'ribbon') return true;
    const col = (appearance.clothingColor || '').toLowerCase();
    if (col.includes('pink') || col === '#ec4899' || col === '#f472b6' || col === '#f9a8d4') return true;
    // Auto-balance: if local is boy (default), remote partner renders as girl
    return !isLocal;
  }, [appearance.gender, appearance.accessory, appearance.clothingColor, isLocal]);

  // Skin & Shared Materials
  const skinColor = isGirl ? '#fff1e6' : (appearance.skinColor || '#ffe2c6');
  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.35 }),
    [skinColor]
  );

  const blushMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: isGirl ? '#fda4af' : '#fb7185', transparent: true, opacity: 0.75 }),
    [isGirl]
  );

  const eyeWhiteMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const eyePupilMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#261208' }), []);
  const eyeIrisMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#451a03' }), []);
  const eyeHighlightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const mouthMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#9f1239' }), []);

  // Hair Materials
  const hairColor = isGirl ? '#4a2818' : (appearance.hairColor || '#5c3317');
  const hairMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.55 }),
    [hairColor]
  );

  // Clothing Materials - Boy
  const hoodieCreamMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#faf6ee', roughness: 0.6 }),
    []
  );
  const denimJeansMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1e3050', roughness: 0.7 }),
    []
  );
  const sneakerWhiteMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    []
  );
  const teddyBearMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c68b59', roughness: 0.6 }),
    []
  );
  const teddyMuzzleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.5 }),
    []
  );
  const darkDetailMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#261208' }), []);

  // Clothing Materials - Girl
  const sweaterPinkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f9a8d4', roughness: 0.55 }),
    []
  );
  const ribbonBowPinkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.35 }),
    []
  );
  const ribbonWhiteMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }),
    []
  );
  const skirtPlaidMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c7d2fe', roughness: 0.5 }),
    []
  );
  const sockWhiteMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
    []
  );
  const sneakerPinkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.4 }),
    []
  );

  // Procedural Animation Loop
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    if (isSitting) {
      const isSwing = seatIndex === 10 || seatIndex === 11;
      const swingSway = isSwing ? Math.sin(t * 1.5) * 0.14 : 0;
      const swingPendulum = isSwing ? Math.cos(t * 1.5) * 0.08 : 0;

      // Sitting posture
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.45;
        bodyRef.current.rotation.x = swingSway;
        bodyRef.current.rotation.z = swingPendulum * 0.2;
      }
      if (headRef.current) {
        headRef.current.position.y = 1.05;
        headRef.current.rotation.x = swingSway * 0.8 + Math.sin(t * 1.5) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.08;
      }
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = -Math.PI / 2 + (isSwing ? Math.sin(t * 1.5) * 0.15 : 0);
        leftLegRef.current.position.set(-0.18, 0.45, 0.25);
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = -Math.PI / 2 + (isSwing ? Math.sin(t * 1.5) * 0.15 : 0);
        rightLegRef.current.position.set(0.18, 0.45, 0.25);
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = -Math.PI / 6;
        leftArmRef.current.position.set(-0.36, 0.65, 0.15);
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI / 6;
        rightArmRef.current.position.set(0.36, 0.65, 0.15);
      }
      return;
    }

    // Standing / Walking / Running
    if (animationState === 'IDLE') {
      const breath = Math.sin(t * 2.5) * 0.025;
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.6 + breath;
        bodyRef.current.rotation.z = Math.sin(t * 1.2) * 0.015;
      }
      if (headRef.current) {
        headRef.current.position.y = 1.24 + breath * 1.2;
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.06;
      }
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 2.5) * 0.04;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.sin(t * 2.5) * 0.04;
      if (leftLegRef.current) {
        leftLegRef.current.rotation.x = 0;
        leftLegRef.current.position.set(-0.18, 0.24, 0);
      }
      if (rightLegRef.current) {
        rightLegRef.current.rotation.x = 0;
        rightLegRef.current.position.set(0.18, 0.24, 0);
      }
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
        headRef.current.position.y = 1.24 + bob * 1.2;
        headRef.current.rotation.x = animationState === 'RUN' ? 0.1 : 0.03;
      }
      if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -legSwing * 0.9;
      if (rightArmRef.current) rightArmRef.current.rotation.x = legSwing * 0.9;
    }
  });

  // Reusable Cute Teddy Bear Patch Mesh (used for Boy's hoodie front and back)
  const renderTeddyPatch = (isBack: boolean) => (
    <group
      position={[0, 0.08, isBack ? -0.29 : 0.29]}
      rotation={[0, isBack ? Math.PI : 0, 0]}
      scale={[0.16, 0.16, 0.16]}
    >
      {/* Bear Head Base */}
      <mesh material={teddyBearMat}>
        <sphereGeometry args={[0.55, 16, 16]} />
      </mesh>
      {/* Bear Left Ear */}
      <mesh material={teddyBearMat} position={[-0.45, 0.45, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
      </mesh>
      <mesh material={teddyMuzzleMat} position={[-0.45, 0.45, 0.08]}>
        <sphereGeometry args={[0.12, 12, 12]} />
      </mesh>
      {/* Bear Right Ear */}
      <mesh material={teddyBearMat} position={[0.45, 0.45, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
      </mesh>
      <mesh material={teddyMuzzleMat} position={[0.45, 0.45, 0.08]}>
        <sphereGeometry args={[0.12, 12, 12]} />
      </mesh>
      {/* Cream Muzzle */}
      <mesh material={teddyMuzzleMat} position={[0, -0.08, 0.35]}>
        <sphereGeometry args={[0.28, 16, 16]} />
      </mesh>
      {/* Dark Nose */}
      <mesh material={darkDetailMat} position={[0, 0.02, 0.58]}>
        <sphereGeometry args={[0.07, 8, 8]} />
      </mesh>
      {/* Smile Line */}
      <mesh material={darkDetailMat} position={[0, -0.12, 0.56]}>
        <boxGeometry args={[0.12, 0.025, 0.02]} />
      </mesh>
      {/* Bear Eyes */}
      <mesh material={darkDetailMat} position={[-0.22, 0.12, 0.48]}>
        <sphereGeometry args={[0.065, 8, 8]} />
      </mesh>
      <mesh material={darkDetailMat} position={[0.22, 0.12, 0.48]}>
        <sphereGeometry args={[0.065, 8, 8]} />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      {/* Floating Name Tag Billboard */}
      {showNameTag && (
        <group position={[0, isSitting ? 1.48 : (isLocal ? 1.70 : 1.78), 0]}>
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            {isSpeaking && (
              <group position={[0, 0.16, 0]}>
                <Text
                  fontSize={0.09}
                  color="#38bdf8"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.012}
                  outlineColor="#082f49"
                >
                  🎙️ 〰️
                </Text>
              </group>
            )}

            <Text
              color={isSpeaking ? '#38bdf8' : isLocal ? '#fef08a' : (isGirl ? '#fbcfe8' : '#93c5fd')}
              fontSize={0.11}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.016}
              outlineColor="#0f051d"
              letterSpacing={0.02}
            >
              {name.length > 8 ? `${name.substring(0, 8)}..` : name} {isLocal ? '(You)' : '♥'}
            </Text>
          </Billboard>
        </group>
      )}

      {/* HEAD GROUP */}
      <group ref={headRef} position={[0, 1.24, 0]}>
        {/* Soft Chibi Head Sphere */}
        <mesh material={skinMat} castShadow>
          <sphereGeometry args={[0.38, 32, 32]} />
        </mesh>

        {/* Tiny Anime Nose */}
        <mesh material={skinMat} position={[0, -0.02, 0.375]}>
          <sphereGeometry args={[0.024, 8, 8]} />
        </mesh>

        {/* Gentle Happy Mouth */}
        <mesh material={mouthMat} position={[0, -0.12, 0.36]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.045, 0.012, 8, 16, Math.PI * 0.7]} />
        </mesh>

        {/* Rosy Blush Cheeks */}
        <mesh material={blushMat} position={[-0.22, -0.08, 0.31]}>
          <circleGeometry args={[0.065, 16]} />
        </mesh>
        <mesh material={blushMat} position={[0.22, -0.08, 0.31]}>
          <circleGeometry args={[0.065, 16]} />
        </mesh>

        {/* Anime Eyes with Twin Sparkle Highlights */}
        {/* Left Eye */}
        <group position={[-0.14, 0.03, 0.34]}>
          {/* Eye White Base */}
          <mesh material={eyeWhiteMat}>
            <sphereGeometry args={[0.07, 16, 16]} />
          </mesh>
          {/* Iris */}
          <mesh material={eyeIrisMat} position={[0, 0, 0.025]}>
            <sphereGeometry args={[0.058, 16, 16]} />
          </mesh>
          {/* Pupil */}
          <mesh material={eyePupilMat} position={[0, 0, 0.04]}>
            <sphereGeometry args={[0.045, 16, 16]} />
          </mesh>
          {/* Big Sparkle Highlight (Top Right) */}
          <mesh material={eyeHighlightMat} position={[0.022, 0.022, 0.065]}>
            <sphereGeometry args={[0.022, 8, 8]} />
          </mesh>
          {/* Small Sparkle Highlight (Bottom Left) */}
          <mesh material={eyeHighlightMat} position={[-0.018, -0.02, 0.065]}>
            <sphereGeometry args={[0.011, 8, 8]} />
          </mesh>
        </group>

        {/* Right Eye */}
        <group position={[0.14, 0.03, 0.34]}>
          {/* Eye White Base */}
          <mesh material={eyeWhiteMat}>
            <sphereGeometry args={[0.07, 16, 16]} />
          </mesh>
          {/* Iris */}
          <mesh material={eyeIrisMat} position={[0, 0, 0.025]}>
            <sphereGeometry args={[0.058, 16, 16]} />
          </mesh>
          {/* Pupil */}
          <mesh material={eyePupilMat} position={[0, 0, 0.04]}>
            <sphereGeometry args={[0.045, 16, 16]} />
          </mesh>
          {/* Big Sparkle Highlight (Top Right) */}
          <mesh material={eyeHighlightMat} position={[0.022, 0.022, 0.065]}>
            <sphereGeometry args={[0.022, 8, 8]} />
          </mesh>
          {/* Small Sparkle Highlight (Bottom Left) */}
          <mesh material={eyeHighlightMat} position={[-0.018, -0.02, 0.065]}>
            <sphereGeometry args={[0.011, 8, 8]} />
          </mesh>
        </group>

        {/* Cute Human Ears on sides */}
        <mesh material={skinMat} position={[-0.37, 0, 0]}>
          <sphereGeometry args={[0.075, 12, 12]} />
        </mesh>
        <mesh material={skinMat} position={[0.37, 0, 0]}>
          <sphereGeometry args={[0.075, 12, 12]} />
        </mesh>

        {/* ------------------------------------------------------------- */}
        {/* CHARACTER SPECIFIC HAIR & HEAD ACCESSORIES */}
        {/* ------------------------------------------------------------- */}
        {!isGirl ? (
          // ==================== BOY: WARM CHESTNUT MESSY LAYERED HAIR ====================
          <group>
            {/* Base Hair Helmet */}
            <mesh material={hairMat} position={[0, 0.06, -0.03]} castShadow>
              <sphereGeometry args={[0.405, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
            </mesh>

            {/* Front Bangs (Layered over forehead) */}
            <mesh material={hairMat} position={[-0.14, 0.22, 0.32]} rotation={[0.4, 0.2, -0.3]}>
              <coneGeometry args={[0.11, 0.22, 12]} />
            </mesh>
            <mesh material={hairMat} position={[0, 0.24, 0.34]} rotation={[0.35, 0, 0.1]}>
              <coneGeometry args={[0.12, 0.24, 12]} />
            </mesh>
            <mesh material={hairMat} position={[0.15, 0.21, 0.31]} rotation={[0.4, -0.2, 0.3]}>
              <coneGeometry args={[0.11, 0.22, 12]} />
            </mesh>
            {/* Soft brow bangs fringe */}
            <mesh material={hairMat} position={[-0.06, 0.18, 0.35]} rotation={[0.4, 0.1, -0.1]}>
              <coneGeometry args={[0.09, 0.18, 12]} />
            </mesh>
            <mesh material={hairMat} position={[0.08, 0.17, 0.35]} rotation={[0.4, -0.1, 0.1]}>
              <coneGeometry args={[0.09, 0.18, 12]} />
            </mesh>

            {/* Fluffy Crown & Side Strands */}
            <mesh material={hairMat} position={[-0.28, 0.28, 0.1]} rotation={[0.2, 0.3, 0.6]}>
              <coneGeometry args={[0.11, 0.22, 10]} />
            </mesh>
            <mesh material={hairMat} position={[0.28, 0.28, 0.1]} rotation={[0.2, -0.3, -0.6]}>
              <coneGeometry args={[0.11, 0.22, 10]} />
            </mesh>
            <mesh material={hairMat} position={[0, 0.38, -0.06]} rotation={[-0.2, 0, 0.1]}>
              <coneGeometry args={[0.14, 0.26, 12]} />
            </mesh>
            {/* Messy Back Tuft Layers */}
            <mesh material={hairMat} position={[-0.18, 0.08, -0.35]} rotation={[-0.4, 0.2, -0.2]}>
              <coneGeometry args={[0.13, 0.24, 10]} />
            </mesh>
            <mesh material={hairMat} position={[0.18, 0.08, -0.35]} rotation={[-0.4, -0.2, 0.2]}>
              <coneGeometry args={[0.13, 0.24, 10]} />
            </mesh>
            <mesh material={hairMat} position={[0, -0.04, -0.36]} rotation={[-0.3, 0, 0]}>
              <coneGeometry args={[0.14, 0.26, 10]} />
            </mesh>
          </group>
        ) : (
          // ==================== GIRL: CHOCOLATE WAVY HAIR + BIG PINK RIBBON BOW ====================
          <group>
            {/* Base Hair Helmet */}
            <mesh material={hairMat} position={[0, 0.07, -0.02]} castShadow>
              <sphereGeometry args={[0.41, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.68]} />
            </mesh>

            {/* Neat parted front bangs */}
            <mesh material={hairMat} position={[-0.12, 0.22, 0.33]} rotation={[0.3, 0.1, -0.2]}>
              <capsuleGeometry args={[0.075, 0.16, 8, 12]} />
            </mesh>
            <mesh material={hairMat} position={[0.12, 0.22, 0.33]} rotation={[0.3, -0.1, 0.2]}>
              <capsuleGeometry args={[0.075, 0.16, 8, 12]} />
            </mesh>
            <mesh material={hairMat} position={[0, 0.24, 0.34]} rotation={[0.3, 0, 0]}>
              <capsuleGeometry args={[0.065, 0.14, 8, 12]} />
            </mesh>

            {/* Front Side Locks falling over shoulders */}
            <mesh material={hairMat} position={[-0.34, -0.05, 0.12]} rotation={[0.1, 0.2, 0.1]}>
              <capsuleGeometry args={[0.09, 0.38, 8, 16]} />
            </mesh>
            <mesh material={hairMat} position={[0.34, -0.05, 0.12]} rotation={[0.1, -0.2, -0.1]}>
              <capsuleGeometry args={[0.09, 0.38, 8, 16]} />
            </mesh>

            {/* Long Wavy Back Hair Cascades falling below shoulders */}
            <mesh material={hairMat} position={[-0.18, -0.18, -0.3]} rotation={[-0.15, 0.15, -0.1]}>
              <capsuleGeometry args={[0.13, 0.46, 8, 16]} />
            </mesh>
            <mesh material={hairMat} position={[0.18, -0.18, -0.3]} rotation={[-0.15, -0.15, 0.1]}>
              <capsuleGeometry args={[0.13, 0.46, 8, 16]} />
            </mesh>
            <mesh material={hairMat} position={[0, -0.22, -0.32]} rotation={[-0.1, 0, 0]}>
              <capsuleGeometry args={[0.15, 0.52, 8, 16]} />
            </mesh>

            {/* BIG PINK SATIN RIBBON BOW ON THE BACK OF HEAD (from Image 3) */}
            <group position={[0, 0.24, -0.38]} rotation={[-0.2, 0, 0]}>
              {/* Bow Center Knot */}
              <mesh material={ribbonBowPinkMat}>
                <sphereGeometry args={[0.065, 12, 12]} />
              </mesh>
              {/* Left Flared Bow Loop */}
              <mesh material={ribbonBowPinkMat} position={[-0.15, 0.04, 0.02]} rotation={[0, 0, 0.4]}>
                <boxGeometry args={[0.22, 0.14, 0.05]} />
              </mesh>
              {/* Right Flared Bow Loop */}
              <mesh material={ribbonBowPinkMat} position={[0.15, 0.04, 0.02]} rotation={[0, 0, -0.4]}>
                <boxGeometry args={[0.22, 0.14, 0.05]} />
              </mesh>
              {/* Left Ribbon Tail */}
              <mesh material={ribbonBowPinkMat} position={[-0.1, -0.14, -0.02]} rotation={[0, 0, 0.25]}>
                <boxGeometry args={[0.075, 0.22, 0.03]} />
              </mesh>
              {/* Right Ribbon Tail */}
              <mesh material={ribbonBowPinkMat} position={[0.1, -0.14, -0.02]} rotation={[0, 0, -0.25]}>
                <boxGeometry args={[0.075, 0.22, 0.03]} />
              </mesh>
            </group>
          </group>
        )}
      </group>

      {/* ------------------------------------------------------------- */}
      {/* BODY GROUP */}
      {/* ------------------------------------------------------------- */}
      <group ref={bodyRef} position={[0, 0.6, 0]}>
        {!isGirl ? (
          // ==================== BOY: OVERSIZED CREAM TEDDY HOODIE ====================
          <group>
            {/* Main Hoodie Body */}
            <mesh material={hoodieCreamMat} castShadow>
              <cylinderGeometry args={[0.27, 0.31, 0.56, 32]} />
            </mesh>
            {/* Ribbed Bottom Hem */}
            <mesh material={hoodieCreamMat} position={[0, -0.27, 0]}>
              <cylinderGeometry args={[0.315, 0.315, 0.06, 32]} />
            </mesh>
            {/* Resting Hood on Back Collar */}
            <mesh material={hoodieCreamMat} position={[0, 0.24, -0.2]} rotation={[-0.3, 0, 0]}>
              <torusGeometry args={[0.18, 0.07, 8, 24, Math.PI * 1.2]} />
            </mesh>

            {/* TEDDY BEAR PATCH ON FRONT CHEST */}
            {renderTeddyPatch(false)}

            {/* TEDDY BEAR PATCH ON BACK (Image 3) */}
            {renderTeddyPatch(true)}
          </group>
        ) : (
          // ==================== GIRL: SWEET PASTEL PINK SWEATER + WHITE CHEST BOW ====================
          <group>
            {/* Sweater Body */}
            <mesh material={sweaterPinkMat} castShadow>
              <cylinderGeometry args={[0.25, 0.29, 0.52, 32]} />
            </mesh>
            {/* Ribbed Hem */}
            <mesh material={sweaterPinkMat} position={[0, -0.25, 0]}>
              <cylinderGeometry args={[0.295, 0.295, 0.05, 32]} />
            </mesh>
            {/* Collar Trim */}
            <mesh material={sweaterPinkMat} position={[0, 0.26, 0]}>
              <torusGeometry args={[0.18, 0.045, 8, 24]} />
            </mesh>

            {/* CRISP WHITE RIBBON BOW ON CHEST COLLAR (Image 3) */}
            <group position={[0, 0.16, 0.26]}>
              <mesh material={ribbonWhiteMat}>
                <sphereGeometry args={[0.045, 10, 10]} />
              </mesh>
              <mesh material={ribbonWhiteMat} position={[-0.09, 0.02, 0.01]} rotation={[0, 0, 0.35]}>
                <boxGeometry args={[0.13, 0.08, 0.03]} />
              </mesh>
              <mesh material={ribbonWhiteMat} position={[0.09, 0.02, 0.01]} rotation={[0, 0, -0.35]}>
                <boxGeometry args={[0.13, 0.08, 0.03]} />
              </mesh>
              <mesh material={ribbonWhiteMat} position={[-0.06, -0.09, 0]} rotation={[0, 0, 0.2]}>
                <boxGeometry args={[0.045, 0.12, 0.02]} />
              </mesh>
              <mesh material={ribbonWhiteMat} position={[0.06, -0.09, 0]} rotation={[0, 0, -0.2]}>
                <boxGeometry args={[0.045, 0.12, 0.02]} />
              </mesh>
            </group>

            {/* PLEATED PASTEL SKIRT */}
            <group position={[0, -0.32, 0]}>
              <mesh material={skirtPlaidMat}>
                <cylinderGeometry args={[0.29, 0.39, 0.18, 32]} />
              </mesh>
            </group>
          </group>
        )}
      </group>

      {/* ------------------------------------------------------------- */}
      {/* ARMS */}
      {/* ------------------------------------------------------------- */}
      {/* Left Arm */}
      <mesh
        ref={leftArmRef}
        material={isGirl ? sweaterPinkMat : hoodieCreamMat}
        position={[-0.37, 0.65, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.28, 8, 16]} />
      </mesh>
      {/* Right Arm */}
      <mesh
        ref={rightArmRef}
        material={isGirl ? sweaterPinkMat : hoodieCreamMat}
        position={[0.37, 0.65, 0]}
        castShadow
      >
        <capsuleGeometry args={[0.08, 0.28, 8, 16]} />
      </mesh>

      {/* ------------------------------------------------------------- */}
      {/* LEGS & SHOES */}
      {/* ------------------------------------------------------------- */}
      {!isGirl ? (
        // ==================== BOY: DARK INDIGO JEANS + CLEAN WHITE SNEAKERS ====================
        <>
          {/* Left Leg */}
          <group ref={leftLegRef} position={[-0.18, 0.24, 0]}>
            {/* Jeans Leg */}
            <mesh material={denimJeansMat} position={[0, 0, 0]} castShadow>
              <capsuleGeometry args={[0.088, 0.24, 8, 16]} />
            </mesh>
            {/* Rolled Jeans Cuff */}
            <mesh material={denimJeansMat} position={[0, -0.11, 0]}>
              <cylinderGeometry args={[0.096, 0.096, 0.04, 16]} />
            </mesh>
            {/* White Sneaker */}
            <mesh material={sneakerWhiteMat} position={[0, -0.19, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.11, 0.24]} />
            </mesh>
          </group>

          {/* Right Leg */}
          <group ref={rightLegRef} position={[0.18, 0.24, 0]}>
            {/* Jeans Leg */}
            <mesh material={denimJeansMat} position={[0, 0, 0]} castShadow>
              <capsuleGeometry args={[0.088, 0.24, 8, 16]} />
            </mesh>
            {/* Rolled Jeans Cuff */}
            <mesh material={denimJeansMat} position={[0, -0.11, 0]}>
              <cylinderGeometry args={[0.096, 0.096, 0.04, 16]} />
            </mesh>
            {/* White Sneaker */}
            <mesh material={sneakerWhiteMat} position={[0, -0.19, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.11, 0.24]} />
            </mesh>
          </group>
        </>
      ) : (
        // ==================== GIRL: FAIR LEGS + WHITE SOCKS + PASTEL PINK SNEAKERS ====================
        <>
          {/* Left Leg */}
          <group ref={leftLegRef} position={[-0.18, 0.24, 0]}>
            {/* Bare Leg Skin */}
            <mesh material={skinMat} position={[0, 0.04, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.14, 8, 16]} />
            </mesh>
            {/* White Crew Sock */}
            <mesh material={sockWhiteMat} position={[0, -0.08, 0]} castShadow>
              <cylinderGeometry args={[0.082, 0.082, 0.12, 16]} />
            </mesh>
            {/* Pastel Pink Sneaker */}
            <mesh material={sneakerPinkMat} position={[0, -0.19, 0.04]} castShadow>
              <boxGeometry args={[0.15, 0.11, 0.23]} />
            </mesh>
          </group>

          {/* Right Leg */}
          <group ref={rightLegRef} position={[0.18, 0.24, 0]}>
            {/* Bare Leg Skin */}
            <mesh material={skinMat} position={[0, 0.04, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.14, 8, 16]} />
            </mesh>
            {/* White Crew Sock */}
            <mesh material={sockWhiteMat} position={[0, -0.08, 0]} castShadow>
              <cylinderGeometry args={[0.082, 0.082, 0.12, 16]} />
            </mesh>
            {/* Pastel Pink Sneaker */}
            <mesh material={sneakerPinkMat} position={[0, -0.19, 0.04]} castShadow>
              <boxGeometry args={[0.15, 0.11, 0.23]} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
};
