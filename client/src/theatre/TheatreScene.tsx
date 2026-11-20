import React from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { ScreenMesh } from './ScreenMesh';
import { CoupleSeats } from './CoupleSeats';
import { OutdoorStreetScene } from './OutdoorStreetScene';

interface TheatreSceneProps {
  leftSeatOccupied?: boolean;
  rightSeatOccupied?: boolean;
  leftOccupantName?: string;
  rightOccupantName?: string;
  canSitPrompt?: boolean;
  suggestedSeatIndex?: number | null;
  canPickupKey?: boolean;
  canUnlockDoor?: boolean;
  onPickupKey?: () => void;
  onUnlockDoor?: () => void;
}

export const TheatreScene: React.FC<TheatreSceneProps> = ({
  leftSeatOccupied = false,
  rightSeatOccupied = false,
  leftOccupantName,
  rightOccupantName,
  canSitPrompt = false,
  suggestedSeatIndex = null,
  canPickupKey = false,
  canUnlockDoor = false,
  onPickupKey,
  onUnlockDoor,
}) => {
  // Materials matching reference Image 2
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#1a0e2e',
    roughness: 0.85,
  });

  const carpetMat = new THREE.MeshStandardMaterial({
    color: '#0d071a',
    roughness: 0.9,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.8,
    roughness: 0.25,
  });

  const curtainMat = new THREE.MeshStandardMaterial({
    color: '#9f1239', // Crimson velvet stage curtains
    roughness: 0.65,
  });

  const redSeatMat = new THREE.MeshStandardMaterial({
    color: '#be123c', // Crimson velvet seats
    roughness: 0.55,
  });

  const darkSeatBaseMat = new THREE.MeshStandardMaterial({
    color: '#1c1917',
    roughness: 0.8,
  });

  const speakerMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.7,
  });

  const plantLeafMat = new THREE.MeshStandardMaterial({
    color: '#166534',
    roughness: 0.6,
  });

  const planterMat = new THREE.MeshStandardMaterial({
    color: '#292524',
    roughness: 0.7,
  });

  // Reusable Cinema Seat Unit
  const renderSeatRow = (zPos: number, yPos: number, xOffsets: number[]) => (
    <group position={[0, yPos, zPos]}>
      {xOffsets.map((x, idx) => (
        <group key={`seat-${zPos}-${idx}`} position={[x, 0, 0]}>
          {/* Base */}
          <mesh position={[0, 0.2, 0]} material={darkSeatBaseMat}>
            <boxGeometry args={[0.74, 0.38, 0.7]} />
          </mesh>
          {/* Cushion */}
          <mesh position={[0, 0.42, 0.04]} material={redSeatMat}>
            <boxGeometry args={[0.7, 0.14, 0.66]} />
          </mesh>
          {/* Curved Backrest */}
          <mesh position={[0, 0.88, 0.32]} rotation={[-0.1, 0, 0]} material={redSeatMat}>
            <boxGeometry args={[0.72, 0.86, 0.18]} />
          </mesh>
          {/* Armrests */}
          <mesh position={[-0.38, 0.52, 0.04]} material={darkSeatBaseMat}>
            <boxGeometry args={[0.1, 0.36, 0.66]} />
          </mesh>
          <mesh position={[0.38, 0.52, 0.04]} material={darkSeatBaseMat}>
            <boxGeometry args={[0.1, 0.36, 0.66]} />
          </mesh>
          {/* Gold Cupholder Accent */}
          <mesh position={[0.38, 0.72, -0.16]} material={goldTrimMat}>
            <cylinderGeometry args={[0.045, 0.04, 0.04, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );

  return (
    <group>
      {/* 1. MAIN THEATRE FLOOR */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 22]} />
        <primitive object={carpetMat} />
      </mesh>

      {/* Central Aisle Carpet Runner with Gold Trim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[2.4, 22]} />
        <meshStandardMaterial color="#4c0519" roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.2, 0.01, 0]}>
        <planeGeometry args={[0.06, 22]} />
        <primitive object={goldTrimMat} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.2, 0.01, 0]}>
        <planeGeometry args={[0.06, 22]} />
        <primitive object={goldTrimMat} />
      </mesh>

      {/* 2. ACOUSTIC CEILING WITH RECESSED COVE LIGHTING */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 9.5, 0]}>
        <planeGeometry args={[18, 22]} />
        <meshStandardMaterial color="#090514" roughness={1.0} />
      </mesh>
      {/* Ceiling Warm Cove Frame */}
      <mesh position={[0, 9.4, -1]}>
        <boxGeometry args={[14, 0.12, 16]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} />
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

      {/* Back Wall with open doorway arch leading to outdoor street */}
      <mesh position={[-5.6, 4.75, 11]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[6.8, 9.5]} />
        <primitive object={wallMat} />
      </mesh>
      <mesh position={[5.6, 4.75, 11]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[6.8, 9.5]} />
        <primitive object={wallMat} />
      </mesh>
      <mesh position={[0, 6.6, 11]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[4.4, 5.8]} />
        <primitive object={wallMat} />
      </mesh>

      {/* Front Wall (Behind Screen) */}
      <mesh position={[0, 4.75, -10.8]} receiveShadow>
        <planeGeometry args={[18, 9.5]} />
        <primitive object={wallMat} />
      </mesh>

      {/* 4. ELEVATED STAGE WITH WARM FOOTLIGHTS */}
      {/* Main Stage Platform */}
      <mesh position={[0, 0.35, -9.5]} receiveShadow>
        <boxGeometry args={[16.5, 0.7, 3.2]} />
        <meshStandardMaterial color="#181126" roughness={0.7} />
      </mesh>
      {/* Stage Lip Gold Molding */}
      <mesh position={[0, 0.7, -7.9]}>
        <boxGeometry args={[16.5, 0.08, 0.1]} />
        <primitive object={goldTrimMat} />
      </mesh>

      {/* Stage Recessed Footlights Array (Image 2) */}
      {[-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6].map((x, idx) => (
        <group key={`footlight-${idx}`} position={[x, 0.72, -7.86]}>
          <mesh>
            <cylinderGeometry args={[0.08, 0.08, 0.05, 16]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
          <pointLight color="#fbbf24" intensity={0.4} distance={3.5} />
        </group>
      ))}

      {/* 5. CRIMSON RED VELVET STAGE CURTAINS (Image 2) */}
      {/* Left Stage Curtain (Rich gathered folds) */}
      <group position={[-7.4, 4.8, -9.2]}>
        {/* Main Curtain Body */}
        <mesh material={curtainMat} castShadow>
          <boxGeometry args={[1.8, 8.2, 0.6]} />
        </mesh>
        {/* Pleat Cylinders */}
        {[-0.6, -0.2, 0.2, 0.6].map((offset, idx) => (
          <mesh key={`curt-l-${idx}`} position={[offset, 0, 0.25]} material={curtainMat}>
            <cylinderGeometry args={[0.16, 0.16, 8.2, 16]} />
          </mesh>
        ))}
        {/* Golden Curtain Tie Band */}
        <mesh position={[0, -0.8, 0.3]} material={goldTrimMat}>
          <boxGeometry args={[1.9, 0.16, 0.65]} />
        </mesh>
      </group>

      {/* Right Stage Curtain */}
      <group position={[7.4, 4.8, -9.2]}>
        {/* Main Curtain Body */}
        <mesh material={curtainMat} castShadow>
          <boxGeometry args={[1.8, 8.2, 0.6]} />
        </mesh>
        {/* Pleat Cylinders */}
        {[-0.6, -0.2, 0.2, 0.6].map((offset, idx) => (
          <mesh key={`curt-r-${idx}`} position={[offset, 0, 0.25]} material={curtainMat}>
            <cylinderGeometry args={[0.16, 0.16, 8.2, 16]} />
          </mesh>
        ))}
        {/* Golden Curtain Tie Band */}
        <mesh position={[0, -0.8, 0.3]} material={goldTrimMat}>
          <boxGeometry args={[1.9, 0.16, 0.65]} />
        </mesh>
      </group>

      {/* Top Stage Valance Curtain Header */}
      <mesh position={[0, 8.8, -9.2]} material={curtainMat}>
        <boxGeometry args={[16.6, 1.2, 0.5]} />
      </mesh>

      {/* 6. ACOUSTIC STAGE SPEAKERS (Left & Right - Image 2) */}
      {/* Left Wall Speaker */}
      <group position={[-6.2, 4.8, -8.8]}>
        {/* Speaker Enclosure */}
        <mesh material={speakerMat} castShadow>
          <boxGeometry args={[0.7, 1.4, 0.5]} />
        </mesh>
        {/* Top Woofer */}
        <mesh position={[0, 0.32, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={darkSeatBaseMat}>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
        </mesh>
        {/* Bottom Woofer */}
        <mesh position={[0, -0.32, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={darkSeatBaseMat}>
          <cylinderGeometry args={[0.25, 0.25, 0.05, 16]} />
        </mesh>
      </group>

      {/* Right Wall Speaker */}
      <group position={[6.2, 4.8, -8.8]}>
        {/* Speaker Enclosure */}
        <mesh material={speakerMat} castShadow>
          <boxGeometry args={[0.7, 1.4, 0.5]} />
        </mesh>
        {/* Top Woofer */}
        <mesh position={[0, 0.32, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={darkSeatBaseMat}>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
        </mesh>
        {/* Bottom Woofer */}
        <mesh position={[0, -0.32, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={darkSeatBaseMat}>
          <cylinderGeometry args={[0.25, 0.25, 0.05, 16]} />
        </mesh>
      </group>

      {/* Potted Stage Topiary Plants (Left & Right - Image 2) */}
      <group position={[-6.2, 0.7, -8.3]}>
        <mesh material={planterMat} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.65, 0.6, 0.65]} />
        </mesh>
        <mesh material={plantLeafMat} position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.42, 16, 16]} />
        </mesh>
      </group>
      <group position={[6.2, 0.7, -8.3]}>
        <mesh material={planterMat} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.65, 0.6, 0.65]} />
        </mesh>
        <mesh material={plantLeafMat} position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.42, 16, 16]} />
        </mesh>
      </group>

      {/* 7. GLOWING VINTAGE POPCORN MACHINE CART (Left Wall - Image 2) */}
      <group position={[-8.1, 0, -4.5]}>
        {/* Red Cabinet Base */}
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[1.1, 1.3, 0.9]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
        {/* Gold Trim Base Line */}
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[1.15, 0.06, 0.95]} />
          <primitive object={goldTrimMat} />
        </mesh>
        {/* Glass Warmer Enclosure */}
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.95, 1.05, 0.8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.35} roughness={0.1} />
        </mesh>
        {/* Golden Popcorn Kernels Heap Inside */}
        <mesh position={[0, 1.6, 0]}>
          <boxGeometry args={[0.85, 0.5, 0.7]} />
          <meshStandardMaterial color="#fef08a" roughness={0.8} />
        </mesh>
        {/* Red Roof Canopy */}
        <mesh position={[0, 2.45, 0]}>
          <boxGeometry args={[1.15, 0.2, 1.0]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
        {/* Glowing POPCORN Marquee Sign */}
        <group position={[0.58, 2.45, 0]} rotation={[0, Math.PI / 2, 0]}>
          <Text
            fontSize={0.16}
            color="#ffffff"
            outlineWidth={0.02}
            outlineColor="#991b1b"
            anchorX="center"
            anchorY="middle"
          >
            POPCORN
          </Text>
        </group>
        {/* Interior Popcorn Warm Light */}
        <pointLight position={[0, 2.0, 0]} color="#fbbf24" intensity={0.7} distance={4} />
        {/* Gold Cart Wheels */}
        <mesh position={[-0.45, 0.35, 0.48]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.08, 16]} />
          <primitive object={goldTrimMat} />
        </mesh>
        <mesh position={[0.45, 0.35, 0.48]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.08, 16]} />
          <primitive object={goldTrimMat} />
        </mesh>
      </group>

      {/* 8. WALL SCONCES & GLOWING PINK NEON HEARTS (Image 2) */}
      {[-6, -1, 4, 8].map((zPos, idx) => (
        <group key={`cinema-decor-${idx}`}>
          {/* Left Wall Sconce */}
          <group position={[-8.88, 4.2, zPos]}>
            <mesh>
              <cylinderGeometry args={[0.1, 0.07, 0.38, 16]} />
              <primitive object={goldTrimMat} />
            </mesh>
            <pointLight color="#f59e0b" intensity={0.55} distance={5.5} />
          </group>

          {/* Right Wall Sconce */}
          <group position={[8.88, 4.2, zPos]}>
            <mesh>
              <cylinderGeometry args={[0.1, 0.07, 0.38, 16]} />
              <primitive object={goldTrimMat} />
            </mesh>
            <pointLight color="#f59e0b" intensity={0.55} distance={5.5} />
          </group>
        </group>
      ))}

      {/* Glowing Pink Neon Hearts on Walls (Image 2) */}
      {/* Left Wall Neon Heart */}
      <group position={[-8.88, 5.2, -2.5]} rotation={[0, Math.PI / 2, 0]}>
        <Text
          fontSize={0.8}
          color="#f43f5e"
          anchorX="center"
          anchorY="middle"
        >
          ♥
        </Text>
        <pointLight color="#ec4899" intensity={0.6} distance={4} />
      </group>
      {/* Right Wall Neon Heart */}
      <group position={[8.88, 5.2, -2.5]} rotation={[0, -Math.PI / 2, 0]}>
        <Text
          fontSize={0.8}
          color="#f43f5e"
          anchorX="center"
          anchorY="middle"
        >
          ♥
        </Text>
        <pointLight color="#ec4899" intensity={0.6} distance={4} />
      </group>

      {/* Wall Fabric Banners with "2GETHER" and Film Reels (Image 2) */}
      {/* Left Wall Banner */}
      <group position={[-8.85, 5.5, -6.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[1.6, 3.4]} />
          <meshStandardMaterial color="#4c0519" roughness={0.7} />
        </mesh>
        <Text
          position={[0, 0.6, 0.02]}
          fontSize={0.24}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
        >
          🎬 2GETHER
        </Text>
        <Text
          position={[0, -0.4, 0.02]}
          fontSize={0.4}
          color="#f43f5e"
          anchorX="center"
          anchorY="middle"
        >
          ♥
        </Text>
      </group>

      {/* Right Wall Banner */}
      <group position={[8.85, 5.5, -6.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[1.6, 3.4]} />
          <meshStandardMaterial color="#4c0519" roughness={0.7} />
        </mesh>
        <Text
          position={[0, 0.6, 0.02]}
          fontSize={0.24}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
        >
          🎬 2GETHER
        </Text>
        <Text
          position={[0, -0.4, 0.02]}
          fontSize={0.4}
          color="#f43f5e"
          anchorX="center"
          anchorY="middle"
        >
          ♥
        </Text>
      </group>

      {/* 9. TIERED AUDITORIUM SEATING (Multiple Rows of Red Velvet Seats - Image 2) */}
      {/* Front Row (Z = -2.5, Y = 0.0) */}
      {renderSeatRow(-2.5, 0, [-5.2, -4.3, -3.4, -2.5, 2.5, 3.4, 4.3, 5.2])}

      {/* Mid Row (Flanking Couple Seats at Z = 1.0) */}
      {renderSeatRow(1.0, 0, [-5.2, -4.3, -3.4, -2.4, 2.4, 3.4, 4.3, 5.2])}

      {/* Back Row 1 (Z = 4.2, slightly stepped up) */}
      {renderSeatRow(4.2, 0.15, [-5.2, -4.3, -3.4, -2.4, 2.4, 3.4, 4.3, 5.2])}

      {/* Back Row 2 (Z = 7.2, stepped up) */}
      {renderSeatRow(7.2, 0.3, [-5.2, -4.3, -3.4, -2.4, 2.4, 3.4, 4.3, 5.2])}

      {/* 10. CINEMA PROJECTION SCREEN */}
      <ScreenMesh />

      {/* 11. VIP COUPLE SEATS (FRONT & CENTER - Z = 1.0) */}
      <CoupleSeats
        leftSeatOccupied={leftSeatOccupied}
        rightSeatOccupied={rightSeatOccupied}
        leftOccupantName={leftOccupantName}
        rightOccupantName={rightOccupantName}
        canSitPrompt={canSitPrompt}
        suggestedSeatIndex={suggestedSeatIndex}
      />

      {/* 12. OUTDOOR STREET SCENE, MARQUEE, AND INTERACTIVE DOORS (Z >= 11) */}
      <OutdoorStreetScene
        canPickupKey={canPickupKey}
        canUnlockDoor={canUnlockDoor}
        onPickupKey={onPickupKey}
        onUnlockDoor={onUnlockDoor}
      />
    </group>
  );
};
