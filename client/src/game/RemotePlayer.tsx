import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { StylizedAvatar } from '../characters/StylizedAvatar';

export const RemotePlayer: React.FC = () => {
  const otherPlayer = useAppStore((state) => state.otherPlayer);
  const showNameTags = useAppStore((state) => state.settings.showNameTags);
  const groupRef = useRef<THREE.Group>(null);

  const currentPos = useRef(new THREE.Vector3(1, 0, 5));
  const currentRotY = useRef(0);

  useFrame((state, delta) => {
    if (!otherPlayer || !groupRef.current) return;

    // Smooth network interpolation (LERP)
    const targetPos = new THREE.Vector3(
      otherPlayer.transform.x,
      otherPlayer.transform.y,
      otherPlayer.transform.z
    );

    currentPos.current.lerp(targetPos, delta * 14);
    currentRotY.current = THREE.MathUtils.lerp(
      currentRotY.current,
      otherPlayer.transform.rotY,
      delta * 12
    );

    groupRef.current.position.copy(currentPos.current);
    groupRef.current.rotation.y = currentRotY.current;
  });

  if (!otherPlayer) return null;

  return (
    <group ref={groupRef} position={[otherPlayer.transform.x, otherPlayer.transform.y, otherPlayer.transform.z]}>
      <StylizedAvatar
        name={otherPlayer.characterName}
        appearance={otherPlayer.characterData}
        animationState={otherPlayer.animationState}
        isSitting={otherPlayer.isSitting}
        isLocal={false}
        showNameTag={showNameTags}
      />
    </group>
  );
};
