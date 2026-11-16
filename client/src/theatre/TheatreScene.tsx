import React from 'react';
import * as THREE from 'three';
import { ScreenMesh } from './ScreenMesh';
import { CoupleSeats } from './CoupleSeats';

interface TheatreSceneProps {
  leftSeatOccupied?: boolean;
  rightSeatOccupied?: boolean;
  leftOccupantName?: string;
  rightOccupantName?: string;
  canSitPrompt?: boolean;
  suggestedSeatIndex?: number | null;
}

export const TheatreScene: React.FC<TheatreSceneProps> = ({
  leftSeatOccupied = false,
  rightSeatOccupied = false,
  leftOccupantName,
  rightOccupantName,
  canSitPrompt = false,
  suggestedSeatIndex = null,
}) => {
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#130d24',
    roughness: 0.9,
  });

  const woodPillarMat = new THREE.MeshStandardMaterial({
    color: '#2d1840',
    roughness: 0.6,
  });

  const carpetMat = new THREE.MeshStandardMaterial({
    color: '#1a103c',
    roughness: 0.85,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.7,
    roughness: 0.3,
  });

  return (
    <group>
      {/* 1. MAIN THEATRE FLOOR */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 22]} />
        <primitive object={carpetMat} />
      </mesh>

      {/* Golden Aisle Carpet Runner leading from doors to screen */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[2.4, 22]} />
        <meshStandardMaterial color="#4c0519" roughness={0.7} />
      </mesh>
      {/* Golden edge strip on aisle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.2, 0.01, 0]}>
        <planeGeometry args={[0.06, 22]} />
        <primitive object={goldTrimMat} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.2, 0.01, 0]}>
        <planeGeometry args={[0.06, 22]} />
        <primitive object={goldTrimMat} />
      </mesh>

      {/* 2. ACOUSTIC CEILING */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 9.5, 0]}>
        <planeGeometry args={[18, 22]} />
        <meshStandardMaterial color="#090514" roughness={1.0} />
      </mesh>

      {/* 3. WALLS */}
      {/* Left Wall */}
      <mesh position={[-9, 4.75, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 9.5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[9, 4.75, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 9.5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Back Wall (Entrance Wall) */}
      <mesh position={[0, 4.75, 11]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[18, 9.5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Front Screen Stage Platform */}
      <mesh position={[0, 0.25, -9.5]} receiveShadow>
        <boxGeometry args={[16, 0.5, 3]} />
        <meshStandardMaterial color="#201235" roughness={0.7} />
      </mesh>

      {/* 4. ENTRANCE DOUBLE DOORS (At Back Z = 10.9) */}
      <group position={[0, 1.8, 10.9]}>
        {/* Door Frame */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[3.2, 3.6, 0.2]} />
          <primitive object={woodPillarMat} />
        </mesh>
        {/* Left Door */}
        <mesh position={[-0.75, 0, 0.05]}>
          <boxGeometry args={[1.35, 3.4, 0.08]} />
          <meshStandardMaterial color="#3b0764" roughness={0.4} />
        </mesh>
        {/* Right Door */}
        <mesh position={[0.75, 0, 0.05]}>
          <boxGeometry args={[1.35, 3.4, 0.08]} />
          <meshStandardMaterial color="#3b0764" roughness={0.4} />
        </mesh>
        {/* Golden Door Handles */}
        <mesh position={[-0.15, 0, 0.12]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          <primitive object={goldTrimMat} />
        </mesh>
        <mesh position={[0.15, 0, 0.12]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          <primitive object={goldTrimMat} />
        </mesh>

        {/* Exit Sign glowing warmly above door */}
        <mesh position={[0, 2.05, 0.12]}>
          <boxGeometry args={[1.0, 0.3, 0.05]} />
          <meshBasicMaterial color="#ec4899" />
        </mesh>
      </group>

      {/* 5. WALL SCONCES & AMBIENT GOLD LIGHTING */}
      {[-7, -3, 1, 5, 9].map((zPos, idx) => (
        <group key={`sconce-group-${idx}`}>
          {/* Left Wall Sconce */}
          <group position={[-8.85, 3.5, zPos]}>
            <mesh>
              <cylinderGeometry args={[0.12, 0.08, 0.4, 16]} />
              <primitive object={goldTrimMat} />
            </mesh>
            <pointLight color="#f59e0b" intensity={0.6} distance={6} />
          </group>

          {/* Right Wall Sconce */}
          <group position={[8.85, 3.5, zPos]}>
            <mesh>
              <cylinderGeometry args={[0.12, 0.08, 0.4, 16]} />
              <primitive object={goldTrimMat} />
            </mesh>
            <pointLight color="#f59e0b" intensity={0.6} distance={6} />
          </group>
        </group>
      ))}

      {/* Background Theatre Rows (Adds atmospheric depth to the cinema) */}
      {[-3, -5, -7, 4, 6].map((zPos, rowIdx) => (
        <group key={`bg-row-${rowIdx}`}>
          {/* Left wing seats */}
          <mesh position={[-4.5, 0.35, zPos]}>
            <boxGeometry args={[3.8, 0.7, 0.7]} />
            <meshStandardMaterial color="#2d124d" roughness={0.8} />
          </mesh>
          {/* Right wing seats */}
          <mesh position={[4.5, 0.35, zPos]}>
            <boxGeometry args={[3.8, 0.7, 0.7]} />
            <meshStandardMaterial color="#2d124d" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* 6. CINEMA PROJECTION SCREEN */}
      <ScreenMesh />

      {/* 7. VIP COUPLE SEATS (FRONT & CENTER) */}
      <CoupleSeats
        leftSeatOccupied={leftSeatOccupied}
        rightSeatOccupied={rightSeatOccupied}
        leftOccupantName={leftOccupantName}
        rightOccupantName={rightOccupantName}
        canSitPrompt={canSitPrompt}
        suggestedSeatIndex={suggestedSeatIndex}
      />
    </group>
  );
};
