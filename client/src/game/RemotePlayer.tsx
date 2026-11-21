import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { StylizedAvatar } from '../characters/StylizedAvatar';
import { getSwingSeatTransform } from '../theatre/OutdoorStreetScene';

const TEMP_REMOTE_TARGET = new THREE.Vector3();

export const RemotePlayer: React.FC = () => {
  const otherPlayer = useAppStore((state) => state.otherPlayer);
  const showNameTags = useAppStore((state) => state.settings.showNameTags);
  const groupRef = useRef<THREE.Group>(null);

  const initialTransform = otherPlayer?.transform || { x: 1.5, y: 0, z: 38.0, rotY: Math.PI };
  const currentPos = useRef(new THREE.Vector3(initialTransform.x, initialTransform.y, initialTransform.z));
  const currentRotY = useRef<number>(initialTransform.rotY);
  const initialized = useRef(false);

  // Initialize position to remote player's actual world position
  useEffect(() => {
    if (otherPlayer && !initialized.current) {
      currentPos.current.set(otherPlayer.transform.x, otherPlayer.transform.y, otherPlayer.transform.z);
      currentRotY.current = otherPlayer.transform.rotY;
      if (groupRef.current) {
        groupRef.current.position.copy(currentPos.current);
        groupRef.current.rotation.y = currentRotY.current;
      }
      initialized.current = true;
    }
  }, [otherPlayer]);

  useFrame((state, delta) => {
    if (!otherPlayer || !groupRef.current) return;
    const safeDelta = Math.min(0.05, Math.max(0.001, delta));

    // Dynamic Swing Motion for remote partner
    if (otherPlayer.isSitting && (otherPlayer.seatIndex === 10 || otherPlayer.seatIndex === 11)) {
      const t = state.clock.getElapsedTime();
      const swingTransform = getSwingSeatTransform(otherPlayer.seatIndex, t);
      currentPos.current.set(swingTransform.x, swingTransform.y, swingTransform.z);
      currentRotY.current = swingTransform.rotY;
      groupRef.current.position.copy(currentPos.current);
      groupRef.current.rotation.order = 'YXZ';
      groupRef.current.rotation.set(swingTransform.tiltX, swingTransform.rotY, 0);
      return;
    }

    // Normal standing / cinema seating
    groupRef.current.rotation.order = 'XYZ';

    // Smooth network interpolation (LERP)
    TEMP_REMOTE_TARGET.set(
      otherPlayer.transform.x,
      otherPlayer.transform.y,
      otherPlayer.transform.z
    );

    // If distance is large (e.g. initial spawn or teleports), snap immediately
    const dist = currentPos.current.distanceTo(TEMP_REMOTE_TARGET);
    if (dist > 8.0) {
      currentPos.current.copy(TEMP_REMOTE_TARGET);
      currentRotY.current = otherPlayer.transform.rotY;
    } else {
      currentPos.current.lerp(TEMP_REMOTE_TARGET, Math.min(1.0, safeDelta * 14));

      // Handle shortest angle rotation interpolation
      let diff = otherPlayer.transform.rotY - currentRotY.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      currentRotY.current += diff * Math.min(1.0, safeDelta * 12);
    }

    groupRef.current.position.copy(currentPos.current);
    groupRef.current.rotation.set(0, currentRotY.current, 0);
  });

  if (!otherPlayer) return null;

  return (
    <group ref={groupRef}>
      <StylizedAvatar
        name={otherPlayer.characterName}
        appearance={otherPlayer.characterData}
        animationState={otherPlayer.animationState}
        isSitting={otherPlayer.isSitting}
        seatIndex={otherPlayer.seatIndex}
        isLocal={false}
        showNameTag={showNameTags}
      />
    </group>
  );
};
