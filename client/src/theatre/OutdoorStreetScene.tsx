import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

// 6 Street Lamppost coordinates [X, Y, Z]
export const LAMPPOST_POSITIONS: [number, number, number][] = [
  [-4.8, 0, 14.5], // 0: Left near theatre
  [4.8, 0, 14.5],  // 1: Right near theatre
  [-5.0, 0, 20.0], // 2: Left mid street
  [5.0, 0, 20.0],  // 3: Right mid street
  [-4.8, 0, 25.5], // 4: Left far street
  [4.8, 0, 25.5],  // 5: Right far street
];

export const PRESSURE_PLATE_POS: [number, number, number] = [2.2, 0.02, 12.2];
export const THEATRE_DOOR_POS: [number, number, number] = [0, 0, 11.0];

interface OutdoorStreetSceneProps {
  canPickupKey?: boolean;
  canUnlockDoor?: boolean;
  onPickupKey?: () => void;
  onUnlockDoor?: () => void;
}

export const OutdoorStreetScene: React.FC<OutdoorStreetSceneProps> = ({
  canPickupKey = false,
  canUnlockDoor = false,
  onPickupKey,
  onUnlockDoor,
}) => {
  const quest = useAppStore((state) => state.quest);
  const localPlayer = useAppStore((state) => state.localPlayer);

  const keyMeshRef = useRef<THREE.Group>(null);
  const leftDoorRef = useRef<THREE.Group>(null);
  const rightDoorRef = useRef<THREE.Group>(null);
  const plateMeshRef = useRef<THREE.Mesh>(null);

  const hasKey = quest.keyPickedBy === localPlayer?.playerId;
  const isPlateActive = quest.isPressurePlateActive;
  const isDoorUnlocked = quest.isDoorUnlocked;

  // Frame animation loop for rotating key and door swing
  useFrame((_, delta) => {
    // 1. Floating & spinning golden key
    if (keyMeshRef.current && !quest.keyPickedBy) {
      keyMeshRef.current.rotation.y += delta * 2.2;
      keyMeshRef.current.position.y = 0.5 + Math.sin(Date.now() * 0.004) * 0.12;
    }

    // 2. Double doors smooth swing open
    if (leftDoorRef.current && rightDoorRef.current) {
      const targetLeftRot = isDoorUnlocked ? -Math.PI * 0.45 : 0;
      const targetRightRot = isDoorUnlocked ? Math.PI * 0.45 : 0;

      leftDoorRef.current.rotation.y = THREE.MathUtils.lerp(
        leftDoorRef.current.rotation.y,
        targetLeftRot,
        delta * 3.5
      );
      rightDoorRef.current.rotation.y = THREE.MathUtils.lerp(
        rightDoorRef.current.rotation.y,
        targetRightRot,
        delta * 3.5
      );
    }

    // 3. Pressure plate depression
    if (plateMeshRef.current) {
      const targetY = isPlateActive ? 0.015 : 0.06;
      plateMeshRef.current.position.y = THREE.MathUtils.lerp(
        plateMeshRef.current.position.y,
        targetY,
        delta * 8.0
      );
    }
  });

  const keyPos = LAMPPOST_POSITIONS[quest.keyLamppostIndex] || LAMPPOST_POSITIONS[0];

  return (
    <group>
      {/* =========================================================================
          1. OUTDOOR STREET GROUND & SIDEWALKS
         ========================================================================= */}
      {/* Central Asphalt Roadway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 21.0]} receiveShadow>
        <planeGeometry args={[6.8, 22]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.15} />
      </mesh>

      {/* Road Center Dashes */}
      {[-3, 1, 5, 9].map((zOffset, idx) => (
        <mesh key={`dash-${idx}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 17.0 + zOffset * 2.2]}>
          <planeGeometry args={[0.2, 1.4]} />
          <meshBasicMaterial color="#fef08a" opacity={0.65} transparent />
        </mesh>
      ))}

      {/* Pedestrian Crosswalk in front of Theatre Entrance (Z = 12.8) */}
      {[-2.2, -1.4, -0.6, 0.2, 1.0, 1.8].map((xOffset, idx) => (
        <mesh key={`crosswalk-${idx}`} rotation={[-Math.PI / 2, 0, 0]} position={[xOffset, 0.004, 12.8]}>
          <planeGeometry args={[0.5, 1.6]} />
          <meshBasicMaterial color="#e2e8f0" opacity={0.7} transparent />
        </mesh>
      ))}

      {/* Left Sidewalk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5.8, 0.04, 21.0]} receiveShadow>
        <planeGeometry args={[4.8, 22]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </mesh>
      {/* Left Curb */}
      <mesh position={[-3.4, 0.05, 21.0]}>
        <boxGeometry args={[0.2, 0.1, 22]} />
        <meshStandardMaterial color="#475569" roughness={0.6} />
      </mesh>

      {/* Right Sidewalk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5.8, 0.04, 21.0]} receiveShadow>
        <planeGeometry args={[4.8, 22]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </mesh>
      {/* Right Curb */}
      <mesh position={[3.4, 0.05, 21.0]}>
        <boxGeometry args={[0.2, 0.1, 22]} />
        <meshStandardMaterial color="#475569" roughness={0.6} />
      </mesh>

      {/* Decorative Planters / Benches along sidewalk */}
      {[-6.4, 6.4].map((xPos, idx) => (
        <group key={`planters-${idx}`}>
          {[16.0, 23.0].map((zPos, pIdx) => (
            <group key={`planter-${idx}-${pIdx}`} position={[xPos, 0.35, zPos]}>
              <mesh>
                <boxGeometry args={[1.2, 0.7, 1.2]} />
                <meshStandardMaterial color="#334155" roughness={0.7} />
              </mesh>
              {/* Plant Bush */}
              <mesh position={[0, 0.55, 0]}>
                <sphereGeometry args={[0.55, 12, 12]} />
                <meshStandardMaterial color="#065f46" roughness={0.9} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Street End Wall / Railing (at Z = 30.5) */}
      <mesh position={[0, 0.6, 30.5]}>
        <boxGeometry args={[16.0, 1.2, 0.3]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.5} />
      </mesh>

      {/* =========================================================================
          2. THEATRE EXTERIOR FACADE & GRAND MARQUEE (Z = 11.0)
         ========================================================================= */}
      {/* Grand Brick / Art-Deco Facade */}
      <mesh position={[0, 5.5, 11.0]} receiveShadow>
        <boxGeometry args={[18.0, 11.0, 0.4]} />
        <meshStandardMaterial color="#1e102d" roughness={0.8} />
      </mesh>

      {/* Grand Canopy Marquee Roof projecting over entrance */}
      <mesh position={[0, 4.4, 12.2]}>
        <boxGeometry args={[7.2, 0.45, 2.6]} />
        <meshStandardMaterial color="#2e1065" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Marquee Golden Trim */}
      <mesh position={[0, 4.4, 13.52]}>
        <boxGeometry args={[7.3, 0.55, 0.08]} />
        <meshStandardMaterial color="#d97706" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Glowing Neon Signboard: "2GETHER CINEMA" */}
      <group position={[0, 4.45, 13.6]}>
        <Billboard>
          <Text
            fontSize={0.52}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
          >
            ★ 2GETHER CINEMA ★
          </Text>
        </Billboard>
      </group>

      {/* Marquee warm under-light shining on entrance doors */}
      <pointLight position={[0, 4.1, 12.2]} color="#fde047" intensity={1.8} distance={7} />

      {/* Poster Lightboxes flanking entrance */}
      <group position={[-2.6, 2.0, 11.25]}>
        <mesh>
          <boxGeometry args={[1.2, 1.8, 0.12]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <planeGeometry args={[1.0, 1.6]} />
          <meshBasicMaterial color="#f43f5e" />
        </mesh>
        <pointLight color="#f43f5e" intensity={0.5} distance={2.5} />
      </group>

      <group position={[2.6, 2.0, 11.25]}>
        <mesh>
          <boxGeometry args={[1.2, 1.8, 0.12]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <planeGeometry args={[1.0, 1.6]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <pointLight color="#fbbf24" intensity={0.5} distance={2.5} />
      </group>

      {/* =========================================================================
          3. INTERACTIVE DOUBLE ENTRANCE DOORS
         ========================================================================= */}
      {/* Outer Door Frame */}
      <mesh position={[0, 1.85, 11.05]}>
        <boxGeometry args={[3.2, 3.7, 0.35]} />
        <meshStandardMaterial color="#3b0764" roughness={0.5} />
      </mesh>

      {/* LEFT DOOR HINGED AT X = -1.4 */}
      <group ref={leftDoorRef} position={[-1.4, 1.85, 11.0]}>
        <mesh position={[0.67, 0, 0]}>
          <boxGeometry args={[1.34, 3.4, 0.12]} />
          <meshStandardMaterial color="#581c87" roughness={0.4} metalness={0.3} />
        </mesh>
        {/* Left Golden Door Handle */}
        <mesh position={[1.2, 0, 0.1]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* RIGHT DOOR HINGED AT X = 1.4 */}
      <group ref={rightDoorRef} position={[1.4, 1.85, 11.0]}>
        <mesh position={[-0.67, 0, 0]}>
          <boxGeometry args={[1.34, 3.4, 0.12]} />
          <meshStandardMaterial color="#581c87" roughness={0.4} metalness={0.3} />
        </mesh>
        {/* Right Golden Door Handle */}
        <mesh position={[-1.2, 0, 0.1]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* KEYHOLE MECHANISM ON RIGHT DOOR */}
        <group position={[-1.0, -0.15, 0.1]}>
          {/* Keyhole Bezel */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.04, 16]} />
            <meshStandardMaterial
              color={isPlateActive ? '#fbbf24' : '#64748b'}
              metalness={0.9}
              roughness={0.15}
            />
          </mesh>

          {/* Keyhole Slot / Indicator */}
          <mesh position={[0, 0, 0.025]}>
            <boxGeometry args={[0.03, 0.08, 0.02]} />
            <meshBasicMaterial color={isPlateActive ? '#fef08a' : '#1e293b'} />
          </mesh>

          {/* Keyhole status aura when pressure plate is active */}
          {isPlateActive && !isDoorUnlocked && (
            <pointLight color="#fde047" intensity={1.5} distance={2.5} />
          )}

          {/* Prompt above keyhole */}
          {!isDoorUnlocked && (
            <Billboard position={[0, 0.45, 0.15]}>
              <Text
                fontSize={0.12}
                color={isPlateActive ? '#fef08a' : '#94a3b8'}
                anchorX="center"
                anchorY="middle"
              >
                {isPlateActive
                  ? canUnlockDoor
                    ? '🗝️ [E] Insert Key to Unlock!'
                    : '🗝️ Keyhole Open! Partner with Key Unlock!'
                  : '🔒 Keyhole Shielded (Stand on Plate)'}
              </Text>
            </Billboard>
          )}
        </group>
      </group>

      {/* =========================================================================
          4. CO-OP PRESSURE STEP PLATE (RIGHT OF DOOR: X = 2.2, Z = 12.2)
         ========================================================================= */}
      <group position={PRESSURE_PLATE_POS}>
        {/* Outer Heavy Ring Base */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.75, 0.8, 0.05, 32]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
        </mesh>

        {/* Inner Depressible Plate */}
        <mesh ref={plateMeshRef} position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 0.05, 32]} />
          <meshStandardMaterial
            color={isPlateActive ? '#10b981' : '#d97706'}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Plate Glow Light */}
        <pointLight
          position={[0, 0.25, 0]}
          color={isPlateActive ? '#34d399' : '#f59e0b'}
          intensity={isPlateActive ? 1.6 : 0.6}
          distance={3.5}
        />

        {/* Floating Instruction over Pressure Plate */}
        {!isDoorUnlocked && (
          <Billboard position={[0, 0.65, 0]}>
            <Text
              fontSize={0.11}
              color={isPlateActive ? '#34d399' : '#fcd34d'}
              anchorX="center"
              anchorY="middle"
            >
              {isPlateActive
                ? '✨ PLATE PRESSED! Keyhole Revealed!'
                : '👣 STAND HERE to Reveal Door Keyhole'}
            </Text>
          </Billboard>
        )}
      </group>

      {/* =========================================================================
          5. 6 VINTAGE STREET LAMPPOSTS
         ========================================================================= */}
      {LAMPPOST_POSITIONS.map((pos, idx) => (
        <group key={`lamppost-${idx}`} position={pos}>
          {/* Base */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.3, 0.45, 0.4, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Tall Cast Iron Pole */}
          <mesh position={[0, 2.2, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 3.6, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
          </mesh>

          {/* Decorative Crossbar */}
          <mesh position={[0, 3.6, 0]}>
            <boxGeometry args={[0.8, 0.06, 0.06]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Lantern Housing */}
          <mesh position={[0, 4.0, 0]}>
            <cylinderGeometry args={[0.26, 0.16, 0.45, 8]} />
            <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.2} />
          </mesh>

          {/* Lantern Glowing Bulb */}
          <mesh position={[0, 3.9, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>

          {/* Warm Street Light Pool */}
          <pointLight
            position={[0, 3.8, 0]}
            color="#fde047"
            intensity={1.2}
            distance={8.5}
          />
        </group>
      ))}

      {/* =========================================================================
          6. THE HIDDEN GOLDEN KEY (UNDER quest.keyLamppostIndex)
         ========================================================================= */}
      {!quest.keyPickedBy && (
        <group ref={keyMeshRef} position={[keyPos[0] + 0.45, 0.5, keyPos[2] + 0.35]}>
          {/* Key Ring Handle */}
          <mesh position={[0, 0.2, 0]}>
            <torusGeometry args={[0.12, 0.035, 16, 32]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Key Shaft */}
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.32, 16]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Key Teeth */}
          <mesh position={[0.05, -0.16, 0]}>
            <boxGeometry args={[0.09, 0.04, 0.025]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.95} roughness={0.1} />
          </mesh>
          <mesh position={[0.04, -0.1, 0]}>
            <boxGeometry args={[0.07, 0.04, 0.025]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.95} roughness={0.1} />
          </mesh>

          {/* Golden Sparkle Light */}
          <pointLight color="#fbbf24" intensity={1.8} distance={3.5} />

          {/* Proximity Pick-up Prompt */}
          <Billboard position={[0, 0.5, 0]}>
            <Text
              fontSize={0.12}
              color="#fef08a"
              anchorX="center"
              anchorY="middle"
            >
              {canPickupKey ? '🗝️ [E] / [Tap] Pick Up Theatre Key' : '✨ Theatre Key'}
            </Text>
          </Billboard>
        </group>
      )}

      {/* When Key is picked up, show who holds the key */}
      {quest.keyPickedBy && !isDoorUnlocked && (
        <Billboard position={[0, 3.2, 11.8]}>
          <Text
            fontSize={0.14}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
          >
            {hasKey
              ? '🗝️ You have the Key! Unlock when partner stands on the plate!'
              : `🗝️ ${quest.keyPickedByName || 'Partner'} has the Key! Step on the Plate!`}
          </Text>
        </Billboard>
      )}
    </group>
  );
};
