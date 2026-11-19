import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { socketService } from '../services/socketService';
import { StylizedAvatar } from '../characters/StylizedAvatar';
import { CharacterAnimationState } from '../types';
import {
  LAMPPOST_POSITIONS,
  PRESSURE_PLATE_POS,
  THEATRE_DOOR_POS,
} from '../theatre/OutdoorStreetScene';

interface PlayerControllerProps {
  mobileJoystickVector?: { x: number; y: number };
  mobileRunPressed?: boolean;
  mobileJumpPressed?: boolean;
  mobileSitTrigger?: boolean;
  onCanSitChanged?: (canSit: boolean, seatIndex: number | null) => void;
  onCanPickupKeyChanged?: (canPickup: boolean) => void;
  onCanUnlockDoorChanged?: (canUnlock: boolean) => void;
  pickupKeyTrigger?: boolean;
  unlockDoorTrigger?: boolean;
}

export const PlayerController: React.FC<PlayerControllerProps> = ({
  mobileJoystickVector = { x: 0, y: 0 },
  mobileRunPressed = false,
  mobileJumpPressed = false,
  mobileSitTrigger = false,
  onCanSitChanged,
  onCanPickupKeyChanged,
  onCanUnlockDoorChanged,
  pickupKeyTrigger = false,
  unlockDoorTrigger = false,
}) => {
  const { camera } = useThree();
  const playerRef = useRef<THREE.Group>(null);

  const profile = useAppStore((state) => state.profile);
  const localPlayer = useAppStore((state) => state.localPlayer);
  const isSitting = useAppStore((state) => state.isSitting);
  const seatIndex = useAppStore((state) => state.seatIndex);
  const localAnimationState = useAppStore((state) => state.localAnimationState);
  const showNameTags = useAppStore((state) => state.settings.showNameTags);
  const setLocalTransform = useAppStore((state) => state.setLocalTransform);
  const setLocalAnimationState = useAppStore((state) => state.setLocalAnimationState);
  const setSitting = useAppStore((state) => state.setSitting);
  const quest = useAppStore((state) => state.quest);

  // Authoritative initial spawn coordinates from server localPlayer
  const spawnTransform = localPlayer?.transform || { x: -1.5, y: 0, z: 22.0, rotY: Math.PI };
  const pos = useRef(new THREE.Vector3(spawnTransform.x, spawnTransform.y, spawnTransform.z));
  const rotY = useRef<number>(spawnTransform.rotY);

  // Quest proximity refs
  const canPickupKeyRef = useRef(false);
  const canUnlockDoorRef = useRef(false);
  const isSteppingOnPlate = useRef(false);

  // Camera settings (Full 360 orbit & pitch tilt)
  const cameraDistance = useRef<number>(4.6);
  const cameraHeight = useRef<number>(2.4);
  const cameraYaw = useRef<number>(0);
  const cameraPitch = useRef<number>(0);
  const isDraggingCamera = useRef<boolean>(false);
  const lastMouseX = useRef<number>(0);
  const lastMouseY = useRef<number>(0);
  const activeCameraTouchId = useRef<number | null>(null);
  const initialPinchDist = useRef<number | null>(null);

  // Keyboard state
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastSyncTime = useRef<number>(0);
  const jumpVelocity = useRef<number>(0);
  const isGrounded = useRef<boolean>(true);

  // Seats coordinates in theatre
  const SEATS = [
    { x: -0.65, y: 0, z: 1.0, seatIndex: 0 },
    { x: 0.65, y: 0, z: 1.0, seatIndex: 1 },
  ];

  // Setup initial position once
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.position.copy(pos.current);
      playerRef.current.rotation.y = rotY.current;
    }
  }, []);

  const handlePickupKey = () => {
    socketService.pickupQuestKey();
  };

  const handleUnlockDoor = () => {
    socketService.unlockTheatreDoor();
  };

  // Keyboard, Mouse & Mobile Touch Drag Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'KeyE') {
        if (canPickupKeyRef.current) {
          handlePickupKey();
        } else if (canUnlockDoorRef.current) {
          handleUnlockDoor();
        } else {
          toggleSit();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    // Zoom listener (mouse wheel)
    const handleWheel = (e: WheelEvent) => {
      cameraDistance.current = THREE.MathUtils.clamp(
        cameraDistance.current + e.deltaY * 0.003,
        2.8,
        7.2
      );
    };

    // Desktop Mouse Drag Look-Around
    const handleMouseDown = (e: MouseEvent) => {
      if (isSitting) return;
      if (e.button === 0 || e.button === 2) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button') || target?.closest('[data-no-cam]')) return;
        isDraggingCamera.current = true;
        lastMouseX.current = e.clientX;
        lastMouseY.current = e.clientY;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingCamera.current && activeCameraTouchId.current === null) {
        const deltaX = e.clientX - lastMouseX.current;
        const deltaY = e.clientY - lastMouseY.current;
        lastMouseX.current = e.clientX;
        lastMouseY.current = e.clientY;

        // 360 yaw rotation
        cameraYaw.current -= deltaX * 0.0055;
        // Pitch tilt
        cameraPitch.current = THREE.MathUtils.clamp(
          cameraPitch.current - deltaY * 0.004,
          -0.45,
          0.65
        );
      }
    };

    const handleMouseUp = () => {
      if (activeCameraTouchId.current === null) {
        isDraggingCamera.current = false;
      }
    };

    // Mobile Touch Drag & Pinch-Zoom
    const handleTouchStart = (e: TouchEvent) => {
      if (isSitting) return;

      // Handle 2-finger pinch zoom
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchDist.current = dist;
        return;
      }

      // Handle single finger camera drag
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (activeCameraTouchId.current !== null) continue;

        // Ignore if touching inside joystick zone (bottom-left) or UI buttons
        const isJoystickZone =
          t.clientX < window.innerWidth * 0.38 && t.clientY > window.innerHeight * 0.42;
        const target = t.target as HTMLElement | null;
        if (isJoystickZone || target?.closest('button') || target?.closest('[data-no-cam]')) {
          continue;
        }

        activeCameraTouchId.current = t.identifier;
        lastMouseX.current = t.clientX;
        lastMouseY.current = t.clientY;
        isDraggingCamera.current = true;
        break;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Pinch zoom
      if (e.touches.length === 2 && initialPinchDist.current !== null) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const pinchDelta = initialPinchDist.current - currentDist;
        cameraDistance.current = THREE.MathUtils.clamp(
          cameraDistance.current + pinchDelta * 0.012,
          2.8,
          7.2
        );
        initialPinchDist.current = currentDist;
        return;
      }

      // Camera look drag
      if (activeCameraTouchId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeCameraTouchId.current) {
          const deltaX = t.clientX - lastMouseX.current;
          const deltaY = t.clientY - lastMouseY.current;
          lastMouseX.current = t.clientX;
          lastMouseY.current = t.clientY;

          // 360 yaw rotation
          cameraYaw.current -= deltaX * 0.007;
          // Pitch tilt
          cameraPitch.current = THREE.MathUtils.clamp(
            cameraPitch.current - deltaY * 0.005,
            -0.45,
            0.65
          );
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDist.current = null;
      }
      if (activeCameraTouchId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeCameraTouchId.current) {
          activeCameraTouchId.current = null;
          isDraggingCamera.current = false;
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isSitting, seatIndex]);

  // Mobile Sit Trigger
  useEffect(() => {
    if (mobileSitTrigger) {
      toggleSit();
    }
  }, [mobileSitTrigger]);

  // Mobile Quest Key & Door Triggers
  useEffect(() => {
    if (pickupKeyTrigger) {
      handlePickupKey();
    }
  }, [pickupKeyTrigger]);

  useEffect(() => {
    if (unlockDoorTrigger) {
      handleUnlockDoor();
    }
  }, [unlockDoorTrigger]);

  const toggleSit = () => {
    if (isSitting) {
      // Stand up
      pos.current.z = 1.9;
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
      // Snap to seat facing cinema screen
      pos.current.set(nearestSeat.x, 0, nearestSeat.z);
      rotY.current = Math.PI; // Face forward towards screen
      setSitting(true, nearestSeat.seatIndex);
      setLocalAnimationState('SIT');
      socketService.sendSitToggle(true, nearestSeat.seatIndex);
    }
  };

  // Main Movement & Camera Physics Loop
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

      // Check proximity to Key
      const keyTarget = LAMPPOST_POSITIONS[quest.keyLamppostIndex] || LAMPPOST_POSITIONS[0];
      const distToKey = Math.hypot(
        pos.current.x - (keyTarget[0] + 0.45),
        pos.current.z - (keyTarget[2] + 0.35)
      );
      const inKeyRange = !quest.keyPickedBy && distToKey < 1.7;
      if (inKeyRange !== canPickupKeyRef.current) {
        canPickupKeyRef.current = inKeyRange;
        onCanPickupKeyChanged?.(inKeyRange);
      }

      // Check standing on Pressure Plate
      const distToPlate = Math.hypot(
        pos.current.x - PRESSURE_PLATE_POS[0],
        pos.current.z - PRESSURE_PLATE_POS[2]
      );
      const isOverPlate = distToPlate < 0.85;
      if (isOverPlate !== isSteppingOnPlate.current) {
        isSteppingOnPlate.current = isOverPlate;
        socketService.stepPressurePlate(isOverPlate);
      }

      // Check proximity to Door Keyhole
      const distToDoor = Math.hypot(
        pos.current.x - THEATRE_DOOR_POS[0],
        pos.current.z - THEATRE_DOOR_POS[2]
      );
      const inUnlockRange =
        !quest.isDoorUnlocked &&
        quest.isPressurePlateActive &&
        quest.keyPickedBy === localPlayer?.playerId &&
        distToDoor < 1.8;
      if (inUnlockRange !== canUnlockDoorRef.current) {
        canUnlockDoorRef.current = inUnlockRange;
        onCanUnlockDoorChanged?.(inUnlockRange);
      }
    }
    onCanSitChanged?.(inSeatRange, nearestIdx);

    // If sitting, lock position and frame cinema view
    if (isSitting) {
      playerRef.current.position.copy(pos.current);
      playerRef.current.rotation.y = rotY.current;

      // Cinematic couple camera view when sitting
      const targetCamPos = new THREE.Vector3(0, 2.5, pos.current.z + 4.2);
      const lookAtPos = new THREE.Vector3(0, 4.6, -9.5); // Cinema screen center
      camera.position.lerp(targetCamPos, delta * 3.5);
      camera.lookAt(lookAtPos);
      return;
    }

    // Calculate raw input
    let moveX = 0;
    let moveZ = 0;

    if (keys.current['KeyW'] || keys.current['ArrowUp']) moveZ -= 1;
    if (keys.current['KeyS'] || keys.current['ArrowDown']) moveZ += 1;
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) moveX -= 1;
    if (keys.current['KeyD'] || keys.current['ArrowRight']) moveX += 1;

    // Combine mobile joystick input (y < 0 is forward)
    if (Math.abs(mobileJoystickVector.x) > 0.08 || Math.abs(mobileJoystickVector.y) > 0.08) {
      moveX += mobileJoystickVector.x;
      moveZ += mobileJoystickVector.y;
    }

    // Convert input relative to camera yaw (intuitive 3rd-person gaming controls)
    const forwardX = -Math.sin(cameraYaw.current);
    const forwardZ = -Math.cos(cameraYaw.current);
    const rightX = Math.cos(cameraYaw.current);
    const rightZ = -Math.sin(cameraYaw.current);

    const inputForward = -moveZ;
    const inputRight = moveX;

    const worldMoveX = rightX * inputRight + forwardX * inputForward;
    const worldMoveZ = rightZ * inputRight + forwardZ * inputForward;

    const moveMagnitude = Math.hypot(worldMoveX, worldMoveZ);
    const isMoving = moveMagnitude > 0.05;
    const isRunning = keys.current['ShiftLeft'] || keys.current['ShiftRight'] || mobileRunPressed;

    // Jump Physics
    if ((keys.current['Space'] || mobileJumpPressed) && isGrounded.current) {
      jumpVelocity.current = 5.2;
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
      const speed = isRunning ? 5.8 : 3.4;
      const normalizedMagnitude = Math.min(1, moveMagnitude);
      const moveVecX = (worldMoveX / moveMagnitude) * speed * normalizedMagnitude * delta;
      const moveVecZ = (worldMoveZ / moveMagnitude) * speed * normalizedMagnitude * delta;

      pos.current.x += moveVecX;
      pos.current.z += moveVecZ;

      // Smart Zone & Door Collision Clamping
      const inStreet = pos.current.z >= 11.0;
      if (!quest.isDoorUnlocked) {
        // DOORS LOCKED: street vs cinema isolation
        if (inStreet) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -6.8, 6.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, 11.35, 29.5); // Blocked in front of doors
        } else {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -7.8, 7.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, -7.5, 10.7); // Inside cinema
        }
      } else {
        // DOORS UNLOCKED: doorway corridor at Z in [10.6, 11.4] allows seamless transition
        if (pos.current.z >= 10.6 && pos.current.z <= 11.4) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -1.35, 1.35);
        } else if (pos.current.z > 11.4) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -6.8, 6.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, 10.6, 29.5);
        } else {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -7.8, 7.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, -7.5, 11.4);
        }
      }

      // Rotate towards movement direction smoothly
      const targetAngle = Math.atan2(worldMoveX, worldMoveZ);
      rotY.current = THREE.MathUtils.lerp(rotY.current, targetAngle, delta * 14);

      currentAnim = isRunning ? 'RUN' : 'WALK';
    }

    // Direct 3D mesh update
    playerRef.current.position.copy(pos.current);
    playerRef.current.rotation.y = rotY.current;

    // Full 360 Spherical Camera Follow around local player
    const horizDist = cameraDistance.current * Math.cos(cameraPitch.current);
    const vertOffset = cameraHeight.current + cameraDistance.current * Math.sin(cameraPitch.current);

    const offsetX = Math.sin(cameraYaw.current) * horizDist;
    const offsetZ = Math.cos(cameraYaw.current) * horizDist;
    const targetCameraPos = new THREE.Vector3(
      pos.current.x + offsetX,
      pos.current.y + vertOffset,
      pos.current.z + offsetZ
    );

    camera.position.lerp(targetCameraPos, delta * 7);
    camera.lookAt(pos.current.x, pos.current.y + 1.25, pos.current.z);

    if (localAnimationState !== currentAnim) {
      setLocalAnimationState(currentAnim);
    }

    // Network synchronization at 20 Hz
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
    <group ref={playerRef}>
      <StylizedAvatar
        name={profile.characterName}
        appearance={profile.appearance}
        animationState={isSitting ? 'SIT' : localAnimationState}
        isSitting={isSitting}
        isLocal={true}
        showNameTag={showNameTags}
      />
    </group>
  );
};
