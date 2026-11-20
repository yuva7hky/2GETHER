import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface CoupleSeatsProps {
  onSeatSelect?: (seatIndex: number) => void;
  leftSeatOccupied?: boolean;
  rightSeatOccupied?: boolean;
  leftOccupantName?: string;
  rightOccupantName?: string;
  canSitPrompt?: boolean;
  suggestedSeatIndex?: number | null;
}

export const CoupleSeats: React.FC<CoupleSeatsProps> = ({
  leftSeatOccupied = false,
  rightSeatOccupied = false,
  leftOccupantName,
  rightOccupantName,
  canSitPrompt = false,
  suggestedSeatIndex = null,
}) => {
  const velvetMat = new THREE.MeshStandardMaterial({
    color: '#be123c', // Rich crimson velvet matching reference Image 2
    roughness: 0.55,
  });

  const seatCushionMat = new THREE.MeshStandardMaterial({
    color: '#9f1239', // Deep plush ruby velvet
    roughness: 0.5,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    metalness: 0.85,
    roughness: 0.25,
  });

  const renderArmchair = (xPos: number, seatIndex: number, isOccupied: boolean, occupantName?: string) => (
    <group position={[xPos, 0, 1.0]}>
      {/* Seat Base */}
      <mesh position={[0, 0.2, 0]} material={velvetMat} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.4, 0.9]} />
      </mesh>

      {/* Plush Cushion */}
      <mesh position={[0, 0.42, 0.05]} material={seatCushionMat} castShadow>
        <boxGeometry args={[0.82, 0.16, 0.8]} />
      </mesh>

      {/* Backrest */}
      <mesh position={[0, 0.9, 0.42]} rotation={[-0.1, 0, 0]} material={velvetMat} castShadow>
        <boxGeometry args={[0.88, 0.95, 0.22]} />
      </mesh>

      {/* Gold Trim Bar on top of backrest */}
      <mesh position={[0, 1.38, 0.38]} rotation={[0, 0, Math.PI / 2]} material={goldTrimMat}>
        <cylinderGeometry args={[0.04, 0.04, 0.92, 16]} />
      </mesh>

      {/* Left Armrest */}
      <mesh position={[-0.45, 0.55, 0.05]} material={velvetMat} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.8]} />
      </mesh>
      {/* Right Armrest */}
      <mesh position={[0.45, 0.55, 0.05]} material={velvetMat} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.8]} />
      </mesh>

      {/* Gold Cupholder on armrest */}
      <mesh position={[0.45, 0.76, -0.22]} material={goldTrimMat}>
        <cylinderGeometry args={[0.06, 0.05, 0.04, 16]} />
      </mesh>

      {/* Seat Label Pill */}
      <group position={[0, 0.1, -0.5]}>
        <Text
          fontSize={0.14}
          color="#fde047"
          anchorX="center"
          anchorY="middle"
        >
          {seatIndex === 0 ? 'Seat 1' : 'Seat 2'}
        </Text>
      </group>

      {/* Seat Presence Beacon */}
      <pointLight
        position={[0, 0.2, 0]}
        color={isOccupied ? '#f43f5e' : '#fbbf24'}
        intensity={0.3}
        distance={2.5}
      />
    </group>
  );

  return (
    <group>
      {/* Left Seat (Seat #0) */}
      {renderArmchair(-0.65, 0, leftSeatOccupied, leftOccupantName)}

      {/* Shared Golden Love Table between seats */}
      <group position={[0, 0, 1.0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.6, 24]} />
          <meshStandardMaterial color="#24174a" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.61, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.03, 24]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Sweet Heart Ornament on Table */}
        <mesh position={[0, 0.72, 0]}>
          <dodecahedronGeometry args={[0.07]} />
          <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Right Seat (Seat #1) */}
      {renderArmchair(0.65, 1, rightSeatOccupied, rightOccupantName)}

      {/* Floating Prompt above seats when player is in range */}
      {canSitPrompt && (
        <group position={[suggestedSeatIndex === 1 ? 0.65 : -0.65, 1.8, 1.0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.6, 0.38]} />
            <meshBasicMaterial color="#090514" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
          <Text
            fontSize={0.16}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
          >
            Press [E] to Sit Together ♥
          </Text>
        </group>
      )}
    </group>
  );
};
