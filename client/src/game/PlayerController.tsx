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
  SWING_POS,
  SWING_SEATS,
  getSwingSeatTransform,
} from '../theatre/OutdoorStreetScene';

interface PlayerControllerProps {
  mobileJoystickVector?: { x: number; y: number };
  mobileJoystickRef?: React.MutableRefObject<{ x: number; y: number }>;
  mobileRunRef?: React.MutableRefObject<boolean>;
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
  mobileJoystickRef,
  mobileRunRef,
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
  const otherPlayer = useAppStore((state) => state.otherPlayer);

  // Authoritative initial spawn coordinates from server localPlayer
  const spawnTransform = localPlayer?.transform || { x: -1.5, y: 0, z: 38.0, rotY: Math.PI };
  const pos = useRef(new THREE.Vector3(spawnTransform.x, spawnTransform.y, spawnTransform.z));
  const rotY = useRef<number>(spawnTransform.rotY);
  const currentVelocity = useRef(new THREE.Vector2(0, 0));

  // Quest proximity refs
  const canPickupKeyRef = useRef(false);
  const canUnlockDoorRef = useRef(false);
  const isSteppingOnPlate = useRef(false);
  const lastCanSit = useRef(false);
  const lastSeatIdx = useRef<number | null>(null);

  // Camera settings (Stable 360 orbit)
  const cameraDistance = useRef<number>(4.6);
  const cameraHeight = useRef<number>(2.4);
  const cameraYaw = useRef<number>(0);
  const cameraPitch = useRef<number>(0);

  // Desktop Mouse Drag
  const isDraggingMouse = useRef<boolean>(false);
  const lastMouseX = useRef<number>(0);
  const lastMouseY = useRef<number>(0);

  // Dedicated Mobile Touch Drag Look (Completely isolated from mouse)
  const activeTouchLookId = useRef<number | null>(null);
  const lastTouchX = useRef<number>(0);
  const lastTouchY = useRef<number>(0);

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

  // Setup initial position & snap camera immediately to spawn (no initial flying glitch)
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.position.copy(pos.current);
      playerRef.current.rotation.y = rotY.current;
    }
    const initialCamPos = new THREE.Vector3(
      pos.current.x,
      pos.current.y + cameraHeight.current,
      pos.current.z + cameraDistance.current
    );
    camera.position.copy(initialCamPos);
    camera.lookAt(pos.current.x, pos.current.y + 1.25, pos.current.z);
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
        6.5
      );
    };

    // Desktop Mouse Drag Look-Around
    const handleMouseDown = (e: MouseEvent) => {
      if (isSitting) return;
      if (e.button === 0 || e.button === 2) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button') || target?.closest('[data-no-cam]')) return;
        isDraggingMouse.current = true;
        lastMouseX.current = e.clientX;
        lastMouseY.current = e.clientY;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingMouse.current || activeTouchLookId.current !== null) return;
      const rawDeltaX = e.clientX - lastMouseX.current;
      const rawDeltaY = e.clientY - lastMouseY.current;
      lastMouseX.current = e.clientX;
      lastMouseY.current = e.clientY;

      const deltaX = THREE.MathUtils.clamp(rawDeltaX, -30, 30);
      const deltaY = THREE.MathUtils.clamp(rawDeltaY, -30, 30);

      cameraYaw.current -= deltaX * 0.005;
      cameraPitch.current = THREE.MathUtils.clamp(
        cameraPitch.current - deltaY * 0.0035,
        -0.40,
        0.55
      );
    };

    const handleMouseUp = () => {
      isDraggingMouse.current = false;
    };

    // Dedicated Mobile Touch Look (Outside bottom-left joystick area)
    const handleTouchStart = (e: TouchEvent) => {
      if (isSitting) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (activeTouchLookId.current !== null) continue;

        // Skip if touch is in joystick zone (bottom-left quadrant) or UI buttons
        const isJoystickZone =
          t.clientX < window.innerWidth * 0.40 && t.clientY > window.innerHeight * 0.40;
        const target = t.target as HTMLElement | null;
        if (isJoystickZone || target?.closest('button') || target?.closest('[data-no-cam]')) {
          continue;
        }

        activeTouchLookId.current = t.identifier;
        lastTouchX.current = t.clientX;
        lastTouchY.current = t.clientY;
        break;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activeTouchLookId.current === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeTouchLookId.current) {
          const rawDeltaX = t.clientX - lastTouchX.current;
          const rawDeltaY = t.clientY - lastTouchY.current;
          lastTouchX.current = t.clientX;
          lastTouchY.current = t.clientY;

          // Clamped delta to prevent sudden spikes or glitching
          const deltaX = THREE.MathUtils.clamp(rawDeltaX, -30, 30);
          const deltaY = THREE.MathUtils.clamp(rawDeltaY, -30, 30);

          cameraYaw.current -= deltaX * 0.006;
          cameraPitch.current = THREE.MathUtils.clamp(
            cameraPitch.current - deltaY * 0.004,
            -0.40,
            0.55
          );
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (activeTouchLookId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchLookId.current) {
          activeTouchLookId.current = null;
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
      if (seatIndex === 10 || seatIndex === 11) {
        // Step forward onto street runway in front of swing
        pos.current.set(3.4, 0, 32.0);
        rotY.current = 0;
        if (playerRef.current) {
          playerRef.current.position.set(3.4, 0, 32.0);
          playerRef.current.rotation.set(0, 0, 0);
        }
      } else {
        // Stand in cinema aisle
        pos.current.z = 1.9;
        pos.current.y = 0;
        if (playerRef.current) {
          playerRef.current.position.set(pos.current.x, 0, 1.9);
          playerRef.current.rotation.set(0, Math.PI, 0);
        }
      }
      setSitting(false, null);
      setLocalAnimationState('IDLE');
      socketService.sendSitToggle(false, null);
      return;
    }

    // 1. Check proximity to 2-Player Romantic Swing on street runway
    const distToSwing = Math.hypot(pos.current.x - SWING_POS[0], pos.current.z - SWING_POS[2]);
    if (distToSwing < 2.5) {
      // Intelligently assign seat: if partner sits on 10, take 11, and vice-versa
      const partnerSeat = otherPlayer?.isSitting ? otherPlayer.seatIndex : null;
      let targetSeat = SWING_SEATS[0];
      if (partnerSeat === 10) {
        targetSeat = SWING_SEATS[1];
      } else if (partnerSeat === 11) {
        targetSeat = SWING_SEATS[0];
      } else {
        // Pick whichever seat is closest to player
        const d0 = Math.hypot(pos.current.x - SWING_SEATS[0].x, pos.current.z - SWING_SEATS[0].z);
        const d1 = Math.hypot(pos.current.x - SWING_SEATS[1].x, pos.current.z - SWING_SEATS[1].z);
        targetSeat = d0 <= d1 ? SWING_SEATS[0] : SWING_SEATS[1];
      }

      pos.current.set(targetSeat.x, targetSeat.y, targetSeat.z);
      rotY.current = targetSeat.rotY;
      setSitting(true, targetSeat.seatIndex);
      setLocalAnimationState('SIT');
      socketService.sendSitToggle(true, targetSeat.seatIndex);
      return;
    }

    // 2. Cinema seats inside theatre (strictly requires unlocked doors)
    if (quest.isDoorUnlocked && pos.current.z < 11.0) {
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
    }
  };

  // Main Movement & Camera Physics Loop
  useFrame((state, delta) => {
    if (!playerRef.current) return;
    const safeDelta = Math.min(0.05, Math.max(0.001, delta));

    // Check proximity to seats for prompt (guarded to prevent 60fps re-render spam)
    let inSeatRange = false;
    let nearestIdx: number | null = null;

    if (!isSitting) {
      // Check Swing proximity
      const distToSwing = Math.hypot(pos.current.x - SWING_POS[0], pos.current.z - SWING_POS[2]);
      if (distToSwing < 2.5) {
        inSeatRange = true;
        nearestIdx = 10;
      } else if (quest.isDoorUnlocked && pos.current.z < 11.0) {
        for (const seat of SEATS) {
          const dist = Math.hypot(pos.current.x - seat.x, pos.current.z - seat.z);
          if (dist < 1.4) {
            inSeatRange = true;
            nearestIdx = seat.seatIndex;
            break;
          }
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

    if (inSeatRange !== lastCanSit.current || nearestIdx !== lastSeatIdx.current) {
      lastCanSit.current = inSeatRange;
      lastSeatIdx.current = nearestIdx;
      onCanSitChanged?.(inSeatRange, nearestIdx);
    }

    // If sitting, lock position and frame cinema / swing view
    if (isSitting) {
      if (seatIndex === 10 || seatIndex === 11) {
        // Dynamic Swing Motion: avatars sway back and forth in perfect unison with the swing bench!
        const t = state.clock.getElapsedTime();
        const swingTransform = getSwingSeatTransform(seatIndex, t);
        pos.current.set(swingTransform.x, swingTransform.y, swingTransform.z);
        rotY.current = swingTransform.rotY;

        playerRef.current.position.copy(pos.current);
        playerRef.current.rotation.set(0, rotY.current, swingTransform.tiltZ);

        // Romantic street swing camera view - couple framing
        const targetCamPos = new THREE.Vector3(1.5, 1.8, 32.0);
        const lookAtPos = new THREE.Vector3(4.6, 1.4, 32.0);
        const sitLerp = Math.min(1.0, safeDelta * 3.5);
        camera.position.lerp(targetCamPos, sitLerp);
        camera.lookAt(lookAtPos);
      } else {
        playerRef.current.position.copy(pos.current);
        playerRef.current.rotation.set(0, rotY.current, 0);

        // Cinematic couple camera view when sitting in theatre
        const targetCamPos = new THREE.Vector3(0, 2.5, pos.current.z + 4.2);
        const lookAtPos = new THREE.Vector3(0, 4.6, -9.5); // Cinema screen center
        const sitLerp = Math.min(1.0, safeDelta * 3.5);
        camera.position.lerp(targetCamPos, sitLerp);
        camera.lookAt(lookAtPos);
      }
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
    const joyVec = mobileJoystickRef?.current || mobileJoystickVector;
    if (Math.abs(joyVec.x) > 0.08 || Math.abs(joyVec.y) > 0.08) {
      moveX += joyVec.x;
      moveZ += joyVec.y;
    }

    // Convert input relative to camera yaw
    const forwardX = -Math.sin(cameraYaw.current);
    const forwardZ = -Math.cos(cameraYaw.current);
    const rightX = Math.cos(cameraYaw.current);
    const rightZ = -Math.sin(cameraYaw.current);

    const inputForward = -moveZ;
    const inputRight = moveX;

    const rawWorldX = rightX * inputRight + forwardX * inputForward;
    const rawWorldZ = rightZ * inputRight + forwardZ * inputForward;
    const rawMag = Math.hypot(rawWorldX, rawWorldZ);

    const isRunning =
      keys.current['ShiftLeft'] ||
      keys.current['ShiftRight'] ||
      (mobileRunRef?.current ?? false) ||
      mobileRunPressed;

    let targetSpeed = 0;
    let dirX = 0;
    let dirZ = 0;

    if (rawMag > 0.05) {
      targetSpeed = isRunning ? 5.8 : 3.4;
      const normalizedMagnitude = Math.min(1.0, rawMag);
      dirX = (rawWorldX / rawMag) * normalizedMagnitude;
      dirZ = (rawWorldZ / rawMag) * normalizedMagnitude;
    }

    // Smooth velocity damping with frame-independent lerp for silky console-grade movement
    const targetVx = dirX * targetSpeed;
    const targetVz = dirZ * targetSpeed;
    const accelRate = targetSpeed > 0 ? 14.0 : 18.0;
    const velAlpha = 1.0 - Math.exp(-accelRate * safeDelta);

    currentVelocity.current.x = THREE.MathUtils.lerp(currentVelocity.current.x, targetVx, velAlpha);
    currentVelocity.current.y = THREE.MathUtils.lerp(currentVelocity.current.y, targetVz, velAlpha);

    const currentSpeed = currentVelocity.current.length();
    const isMoving = currentSpeed > 0.08;

    // Jump Physics
    if ((keys.current['Space'] || mobileJumpPressed) && isGrounded.current) {
      jumpVelocity.current = 5.2;
      isGrounded.current = false;
    }

    if (!isGrounded.current) {
      pos.current.y += jumpVelocity.current * safeDelta;
      jumpVelocity.current -= 18.0 * safeDelta; // Gravity
      if (pos.current.y <= 0) {
        pos.current.y = 0;
        jumpVelocity.current = 0;
        isGrounded.current = true;
      }
    }

    let currentAnim: CharacterAnimationState = 'IDLE';

    if (isMoving) {
      const prevZ = pos.current.z;
      pos.current.x += currentVelocity.current.x * safeDelta;
      pos.current.z += currentVelocity.current.y * safeDelta;

      // Smart Zone & IMPENETRABLE Door Barrier Enforcement
      if (!quest.isDoorUnlocked) {
        // Locked door! Absolutely impenetrable barrier prevents crossing into cinema
        if (prevZ >= 11.3) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -6.8, 6.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, 11.55, 64.0); // Hard stop in front of doors
        } else {
          // If already inside
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -7.8, 7.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, -7.5, 10.7);
        }
      } else {
        // DOORS UNLOCKED: doorway corridor at Z in [10.5, 11.5] allows seamless transition
        if (pos.current.z >= 10.5 && pos.current.z <= 11.5) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -1.35, 1.35);
        } else if (pos.current.z > 11.5) {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -6.8, 6.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, 10.5, 64.0);
        } else {
          pos.current.x = THREE.MathUtils.clamp(pos.current.x, -7.8, 7.8);
          pos.current.z = THREE.MathUtils.clamp(pos.current.z, -7.5, 11.5);
        }
      }

      // Rotate towards movement direction smoothly using shortest angular path
      const targetAngle = Math.atan2(currentVelocity.current.x, currentVelocity.current.y);
      let angleDiff = targetAngle - rotY.current;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      const rotAlpha = 1.0 - Math.exp(-14.0 * safeDelta);
      rotY.current += angleDiff * rotAlpha;

      currentAnim = currentSpeed > 4.2 ? 'RUN' : 'WALK';
    } else {
      currentVelocity.current.set(0, 0);
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

    // Frame-independent smooth damping guarantees buttery smooth follow on mobile
    const camAlpha = 1.0 - Math.exp(-8.0 * safeDelta);
    camera.position.lerp(targetCameraPos, camAlpha);
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
      // Send directly over WebSockets without triggering React DOM re-renders
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
        seatIndex={seatIndex}
        isLocal={true}
        showNameTag={showNameTags}
      />
    </group>
  );
};
