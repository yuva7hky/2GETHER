import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { StylizedAvatar } from '../characters/StylizedAvatar';
import { CharacterAnimationState } from '../types';

interface PlayerControllerProps {
  mobileJoystickVector?: { x: number; y: number };
  mobileRunPressed?: boolean;
  mobileJumpPressed?: boolean;
  mobileSitTrigger?: boolean;
  onCanSitChanged?: (canSit: boolean, seatIndex: number | null) => void;
}

export const PlayerController: React.FC<PlayerControllerProps> = ({
  mobileJoystickVector = { x: 0, y: 0 },
  mobileRunPressed = false,
  mobileJumpPressed = false,
  mobileSitTrigger = false,
  onCanSitChanged,
}) => {
  const { camera } = useThree();
  const playerRef = useRef<THREE.Group>(null);

  const profile = useAppStore((state) => state.profile);
  const localTransform = useAppStore((state) => state.localTransform);
  const isSitting = useAppStore((state) => state.isSitting);
  const seatIndex = useAppStore((state) => state.seatIndex);
  const localAnimationState = useAppStore((state) => state.localAnimationState);
  const setLocalTransform = useAppStore((state) => state.setLocalTransform);
  const setLocalAnimationState = useAppStore((state) => state.setLocalAnimationState);
  const setSitting = useAppStore((state) => state.setSitting);

  // Keyboard state
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastSyncTime = useRef<number>(0);
  const jumpVelocity = useRef<number>(0);
  const isGrounded = useRef<boolean>(true);

  // Position and rotation refs for smooth interpolation
  const pos = useRef(new THREE.Vector3(localTransform.x, localTransform.y, localTransform.z));
  const rotY = useRef<number>(localTransform.rotY);

  // Seat coordinates in theatre
  const SEATS = [
    { x: -0.65, y: 0, z: 1.0, seatIndex: 0 },
    { x: 0.65, y: 0, z: 1.0, seatIndex: 1 },
  ];

  // Setup Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;

      // Handle Sit Toggle (E key)
      if (e.code === 'KeyE') {
        toggleSit();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSitting, seatIndex]);

  // Handle Mobile Sit Button
  useEffect(() => {
    if (mobileSitTrigger) {
      toggleSit();
    }
  }, [mobileSitTrigger]);

  const toggleSit = () => {
    if (isSitting) {
      // Stand up from seat
      const standZ = 1.8;
      pos.current.z = standZ;
      pos.current.y = 0;
      setSitting(false, null);
      setLocalAnimationState('IDLE');
      socketService.sendSitToggle(false, null);
      return;
    }

    // Find nearest seat
    let nearestSeat: (typeof SEATS)[0] | null = null;
    let minDistance = 1.6;

    for (const seat of SEATS) {
      const dist = Math.hypot(pos.current.x - seat.x, pos.current.z - seat.z);
      if (dist < minDistance) {
        minDistance = dist;
        nearestSeat = seat;
      }
    }

    if (nearestSeat) {
      // Snap to seat facing cinema screen (looking towards Z = -10)
      pos.current.set(nearestSeat.x, 0, nearestSeat.z);
      rotY.current = Math.PI; // Face forward towards screen
      setSitting(true, nearestSeat.seatIndex);
      setLocalAnimationState('SIT');
      socketService.sendSitToggle(true, nearestSeat.seatIndex);
    }
  };

  // Main Physics / Movement Loop
  useFrame((state, delta) => {
    if (!playerRef.current) return;

    // Check proximity to seats for prompt
    let inSeatRange = false;
    let nearestIdx: number | null = null;

    if (!isSitting) {
      for (const seat of SEATS) {
        const dist = Math.hypot(pos.current.x - seat.x, pos.current.z - seat.z);
        if (dist < 1.4) {
          inSeatRange = true;
          nearestIdx = seat.seatIndex;
          break;
        }
      }
    }
    onCanSitChanged?.(inSeatRange, nearestIdx);

    // If sitting, freeze position and update camera
    if (isSitting) {
      playerRef.current.position.copy(pos.current);
      playerRef.current.rotation.y = rotY.current;

      // Cinematic camera view when sitting side-by-side
      const targetCamPos = new THREE.Vector3(pos.current.x, 1.8, pos.current.z + 2.5);
      const lookAtPos = new THREE.Vector3(0, 3.8, -9.5); // Look directly at cinema screen
      camera.position.lerp(targetCamPos, delta * 3);
      camera.lookAt(lookAtPos);
      return;
    }

    // Direction calculation
    let moveX = 0;
    let moveZ = 0;

    if (keys.current['KeyW'] || keys.current['ArrowUp']) moveZ -= 1;
    if (keys.current['KeyS'] || keys.current['ArrowDown']) moveZ += 1;
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) moveX -= 1;
    if (keys.current['KeyD'] || keys.current['ArrowRight']) moveX += 1;

    // Combine with mobile joystick
    if (Math.abs(mobileJoystickVector.x) > 0.1 || Math.abs(mobileJoystickVector.y) > 0.1) {
      moveX += mobileJoystickVector.x;
      moveZ += mobileJoystickVector.y;
    }

    const isMoving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;
    const isRunning = keys.current['ShiftLeft'] || keys.current['ShiftRight'] || mobileRunPressed;

    // Jump Physics
    if ((keys.current['Space'] || mobileJumpPressed) && isGrounded.current) {
      jumpVelocity.current = 5.0;
      isGrounded.current = false;
    }

    if (!isGrounded.current) {
      pos.current.y += jumpVelocity.current * delta;
      jumpVelocity.current -= 18.0 * delta; // Gravity
      if (pos.current.y <= 0) {
        pos.current.y = 0;
        jumpVelocity.current = 0;
        isGrounded.current = true;
      }
    }

    let currentAnim: CharacterAnimationState = 'IDLE';

    if (isMoving) {
      const speed = isRunning ? 5.8 : 3.2;
      const moveVec = new THREE.Vector2(moveX, moveZ).normalize().multiplyScalar(speed * delta);

      pos.current.x += moveVec.x;
      pos.current.z += moveVec.y;

      // Theatre Hall Boundary Clamping
      pos.current.x = Math.max(-7.8, Math.min(7.8, pos.current.x));
      pos.current.z = Math.max(-7.5, Math.min(9.8, pos.current.z));

      // Target character rotation facing movement vector
      const targetAngle = Math.atan2(moveVec.x, moveVec.y);
      rotY.current = THREE.MathUtils.lerp(rotY.current, targetAngle, delta * 12);

      currentAnim = isRunning ? 'RUN' : 'WALK';
    }

    // Update Player Group in 3D scene
    playerRef.current.position.copy(pos.current);
    playerRef.current.rotation.y = rotY.current;

    // Smooth Third-Person Camera Follow
    const cameraOffset = new THREE.Vector3(0, 2.6, 4.2);
    const targetCameraPos = pos.current.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPos, delta * 5);
    camera.lookAt(pos.current.x, pos.current.y + 1.2, pos.current.z);

    // Update Store Animation
    if (localAnimationState !== currentAnim) {
      setLocalAnimationState(currentAnim);
    }

    // Synchronize to Socket at 20 Hz (every 50ms)
    const now = performance.now();
    if (now - lastSyncTime.current > 50) {
      lastSyncTime.current = now;
      const transform = {
        x: Number(pos.current.x.toFixed(3)),
        y: Number(pos.current.y.toFixed(3)),
        z: Number(pos.current.z.toFixed(3)),
        rotY: Number(rotY.current.toFixed(3)),
      };
      setLocalTransform(transform);
      socketService.sendMovement(transform, currentAnim, isSitting, seatIndex);
    }
  });

  return (
    <group ref={playerRef} position={[localTransform.x, localTransform.y, localTransform.z]}>
      <StylizedAvatar
        name={profile.characterName}
        appearance={profile.appearance}
        animationState={isSitting ? 'SIT' : localAnimationState}
        isSitting={isSitting}
        isLocal={true}
        showNameTag={useAppStore.getState().settings.showNameTags}
      />
    </group>
  );
};
