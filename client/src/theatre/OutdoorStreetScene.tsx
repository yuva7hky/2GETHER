import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

// 14 Street Lampposts stretching along the extended romantic avenue [X, Y, Z]
export const LAMPPOST_POSITIONS: [number, number, number][] = [
  [-4.8, 0, 15.0], // 0: Left near theatre
  [4.8, 0, 15.0],  // 1: Right near theatre
  [-4.8, 0, 22.0], // 2
  [4.8, 0, 22.0],  // 3
  [-4.8, 0, 29.0], // 4
  [4.8, 0, 29.0],  // 5
  [-4.8, 0, 36.0], // 6: Mid street
  [4.8, 0, 36.0],  // 7: Mid street
  [-4.8, 0, 43.0], // 8
  [4.8, 0, 43.0],  // 9
  [-4.8, 0, 50.0], // 10
  [4.8, 0, 50.0],  // 11
  [-4.8, 0, 57.0], // 12: Far street
  [4.8, 0, 57.0],  // 13: Far street
];

export const PRESSURE_PLATE_POS: [number, number, number] = [2.4, 0.04, 12.2];
export const THEATRE_DOOR_POS: [number, number, number] = [0, 0, 11.0];

// Romantic 2-Player Street Swing Position & Seat Offsets
export const SWING_POS: [number, number, number] = [4.6, 0, 32.0];
export const SWING_SEATS = [
  { x: 4.6, y: 0, z: 31.55, seatIndex: 10, rotY: -Math.PI / 2 }, // Swing Left Seat (Boy)
  { x: 4.6, y: 0, z: 32.45, seatIndex: 11, rotY: -Math.PI / 2 }, // Swing Right Seat (Girl)
];

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
  const keyRingRef = useRef<THREE.Mesh>(null);
  const leftDoorRef = useRef<THREE.Group>(null);
  const rightDoorRef = useRef<THREE.Group>(null);
  const plateMeshRef = useRef<THREE.Mesh>(null);
  const marqueeSignRef = useRef<THREE.Group>(null);
  const swingBenchRef = useRef<THREE.Group>(null);

  const hasKey = quest.keyPickedBy === localPlayer?.playerId;
  const isPlateActive = quest.isPressurePlateActive;
  const isDoorUnlocked = quest.isDoorUnlocked;

  // Frame animation loop
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // 1. Floating & rotating key with beacon pulse
    if (keyMeshRef.current && !quest.keyPickedBy) {
      keyMeshRef.current.rotation.y += delta * 2.5;
      keyMeshRef.current.position.y = 0.55 + Math.sin(t * 3) * 0.12;
    }
    if (keyRingRef.current && !quest.keyPickedBy) {
      const s = 1.0 + Math.sin(t * 4) * 0.15;
      keyRingRef.current.scale.set(s, s, s);
      keyRingRef.current.rotation.z += delta * 1.2;
    }

    // 2. Smooth double doors swing
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
      const targetY = isPlateActive ? 0.015 : 0.055;
      plateMeshRef.current.position.y = THREE.MathUtils.lerp(
        plateMeshRef.current.position.y,
        targetY,
        delta * 8.0
      );
    }

    // 4. Subtle marquee sign glow shimmer
    if (marqueeSignRef.current) {
      marqueeSignRef.current.rotation.z = Math.sin(t * 1.5) * 0.003;
    }

    // 5. Romantic 2-Player Street Swing Pendulum Physics
    if (swingBenchRef.current) {
      swingBenchRef.current.rotation.z = Math.sin(t * 1.5) * 0.14;
    }
  });

  const keyPos = LAMPPOST_POSITIONS[quest.keyLamppostIndex] || LAMPPOST_POSITIONS[6];

  // Memoized materials
  const cobblestoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1e1b2e', roughness: 0.85, metalness: 0.1 }),
    []
  );
  const sidewalkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2b2342', roughness: 0.8, metalness: 0.15 }),
    []
  );
  const curbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3d315b', roughness: 0.7, metalness: 0.2 }),
    []
  );
  const brickMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a2530', roughness: 0.8 }),
    []
  );
  const woodBenchMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6d3c19', roughness: 0.6 }),
    []
  );
  const ironMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.85, roughness: 0.3 }),
    []
  );
  const redCarpetMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#be123c', roughness: 0.75 }),
    []
  );
  const goldBrassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.85, roughness: 0.2 }),
    []
  );

  return (
    <group>
      {/* =========================================================================
          1. EXTENDED COBBLESTONE RUNWAY & ELEVATED SIDEWALKS (Z: 11 to 65)
         ========================================================================= */}
      {/* Main Cobblestone Roadway (54m length) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 38.0]} receiveShadow>
        <planeGeometry args={[7.6, 54]} />
        <primitive object={cobblestoneMat} />
      </mesh>

      {/* Decorative Pavement Center Line Dashes */}
      {Array.from({ length: 14 }).map((_, idx) => (
        <mesh
          key={`road-dash-${idx}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.005, 14.0 + idx * 3.6]}
        >
          <planeGeometry args={[0.22, 1.8]} />
          <meshBasicMaterial color="#fef08a" opacity={0.4} transparent />
        </mesh>
      ))}

      {/* Left Elevated Sidewalk */}
      <mesh position={[-5.8, 0.05, 38.0]} receiveShadow>
        <boxGeometry args={[4.0, 0.12, 54]} />
        <primitive object={sidewalkMat} />
      </mesh>
      {/* Left Stone Curb */}
      <mesh position={[-3.85, 0.08, 38.0]}>
        <boxGeometry args={[0.2, 0.16, 54]} />
        <primitive object={curbMat} />
      </mesh>

      {/* Right Elevated Sidewalk */}
      <mesh position={[5.8, 0.05, 38.0]} receiveShadow>
        <boxGeometry args={[4.0, 0.12, 54]} />
        <primitive object={sidewalkMat} />
      </mesh>
      {/* Right Stone Curb */}
      <mesh position={[3.85, 0.08, 38.0]}>
        <boxGeometry args={[0.2, 0.16, 54]} />
        <primitive object={curbMat} />
      </mesh>

      {/* =========================================================================
          2. GARDEN FLOWERBEDS, HYDRANGEAS & LUSH TREES
         ========================================================================= */}
      {/* Planters & Flowers along sidewalks */}
      {[-6.8, 6.8].map((xSide) =>
        [17, 25, 33, 41, 49, 57].map((zPos, idx) => (
          <group key={`garden-${xSide}-${idx}`} position={[xSide, 0.12, zPos]}>
            {/* Brick Planter Box */}
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[1.5, 0.36, 4.2]} />
              <primitive object={brickMat} />
            </mesh>
            {/* Soil */}
            <mesh position={[0, 0.36, 0]}>
              <boxGeometry args={[1.3, 0.05, 4.0]} />
              <meshStandardMaterial color="#1c1917" roughness={0.9} />
            </mesh>
            {/* Blooming Hydrangeas & Flower clusters */}
            {[-1.3, -0.4, 0.4, 1.3].map((fOffset, fIdx) => (
              <mesh
                key={`flower-${fIdx}`}
                position={[(fIdx % 2 === 0 ? 0.2 : -0.2), 0.52, fOffset]}
              >
                <sphereGeometry args={[0.28, 12, 12]} />
                <meshStandardMaterial
                  color={
                    fIdx === 0
                      ? '#ec4899' // Pink rose
                      : fIdx === 1
                      ? '#818cf8' // Purple hydrangea
                      : fIdx === 2
                      ? '#38bdf8' // Blue hydrangea
                      : '#f472b6' // Soft pink
                  }
                  roughness={0.6}
                />
              </mesh>
            ))}
          </group>
        ))
      )}

      {/* Cozy Wooden Park Benches */}
      {[-4.6, 4.6].map((xSide) =>
        [20, 32, 44, 54]
          .filter((zPos) => !(xSide === 4.6 && zPos === 32)) // Replace this spot with Romantic Swing
          .map((zPos, idx) => (
            <group
              key={`bench-${xSide}-${idx}`}
              position={[xSide, 0.12, zPos]}
              rotation={[0, xSide > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
            >
              {/* Wood Planks Seat */}
              <mesh position={[0, 0.32, 0]}>
                <boxGeometry args={[1.8, 0.06, 0.5]} />
                <primitive object={woodBenchMat} />
              </mesh>
              {/* Wood Backrest */}
              <mesh position={[0, 0.65, -0.22]} rotation={[-0.15, 0, 0]}>
                <boxGeometry args={[1.8, 0.45, 0.06]} />
                <primitive object={woodBenchMat} />
              </mesh>
              {/* Cast-iron Legs */}
              <mesh position={[-0.75, 0.18, 0]}>
                <boxGeometry args={[0.08, 0.36, 0.52]} />
                <primitive object={ironMat} />
              </mesh>
              <mesh position={[0.75, 0.18, 0]}>
                <boxGeometry args={[0.08, 0.36, 0.52]} />
                <primitive object={ironMat} />
              </mesh>
            </group>
          ))
      )}

      {/* ROMANTIC 2-PLAYER STREET SWING (x = 4.6, z = 32.0) */}
      <group position={[4.6, 0, 32.0]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Left A-Frame Post */}
        <group position={[-1.25, 0, 0]}>
          <mesh position={[0, 1.6, -0.65]} rotation={[-0.38, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3.4, 12]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.6, 0.65]} rotation={[0.38, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3.4, 12]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[0.08, 0.08, 1.1]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          {/* Flower Garland */}
          <mesh position={[0, 1.8, 0]}>
            <torusGeometry args={[0.22, 0.05, 8, 16]} />
            <meshStandardMaterial color="#f472b6" roughness={0.6} />
          </mesh>
        </group>

        {/* Right A-Frame Post */}
        <group position={[1.25, 0, 0]}>
          <mesh position={[0, 1.6, -0.65]} rotation={[-0.38, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3.4, 12]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.6, 0.65]} rotation={[0.38, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3.4, 12]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[0.08, 0.08, 1.1]} />
            <meshStandardMaterial color="#3e2723" roughness={0.8} />
          </mesh>
          {/* Flower Garland */}
          <mesh position={[0, 1.8, 0]}>
            <torusGeometry args={[0.22, 0.05, 8, 16]} />
            <meshStandardMaterial color="#f472b6" roughness={0.6} />
          </mesh>
        </group>

        {/* Top Heavy Support Beam */}
        <mesh position={[0, 3.15, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 2.8, 12]} />
          <meshStandardMaterial color="#2d1a10" roughness={0.7} />
        </mesh>
        {/* Gold Finials */}
        <mesh position={[-1.4, 3.15, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[1.4, 3.15, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Twinkling Fairy Lights String */}
        {[-0.9, -0.45, 0, 0.45, 0.9].map((xOff, i) => (
          <group key={`fairylight-${i}`} position={[xOff, 3.05, 0]}>
            <mesh>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshBasicMaterial color={i % 2 === 0 ? '#fef08a' : '#fbcfe8'} />
            </mesh>
            <pointLight color="#fef08a" intensity={0.25} distance={2.0} />
          </group>
        ))}

        {/* SWINGING BENCH ASSEMBLY (Animated pendulum sway) */}
        <group ref={swingBenchRef} position={[0, 3.1, 0]}>
          {/* Left Hanging Chain */}
          <mesh position={[-0.85, -1.2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 2.4, 8]} />
            <meshStandardMaterial color="#d97706" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Right Hanging Chain */}
          <mesh position={[0.85, -1.2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 2.4, 8]} />
            <meshStandardMaterial color="#d97706" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Suspended Wooden Bench Unit */}
          <group position={[0, -2.4, 0]}>
            {/* Wooden Bench Base Frame */}
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[1.85, 0.08, 0.68]} />
              <meshStandardMaterial color="#451a03" roughness={0.7} />
            </mesh>
            {/* Plush Couple Velvet Cushion */}
            <mesh position={[0, 0.14, 0.02]}>
              <boxGeometry args={[1.75, 0.1, 0.62]} />
              <meshStandardMaterial color="#be123c" roughness={0.6} />
            </mesh>
            {/* Wooden Slatted Backrest */}
            <mesh position={[0, 0.52, -0.32]} rotation={[-0.12, 0, 0]}>
              <boxGeometry args={[1.75, 0.72, 0.06]} />
              <meshStandardMaterial color="#451a03" roughness={0.7} />
            </mesh>
            {/* Wooden Armrests */}
            <mesh position={[-0.88, 0.32, 0.02]}>
              <boxGeometry args={[0.08, 0.36, 0.6]} />
              <meshStandardMaterial color="#451a03" roughness={0.7} />
            </mesh>
            <mesh position={[0.88, 0.32, 0.02]}>
              <boxGeometry args={[0.08, 0.36, 0.6]} />
              <meshStandardMaterial color="#451a03" roughness={0.7} />
            </mesh>
            {/* Golden Carved Heart in the center */}
            <group position={[0, 0.62, -0.28]}>
              <Text fontSize={0.22} color="#f59e0b" anchorX="center" anchorY="middle">
                ♥
              </Text>
            </group>
          </group>
        </group>

        {/* Floating Proximity Tag for Swing */}
        <group position={[0, 1.4, 0.8]}>
          <Text
            fontSize={0.16}
            color="#fbcfe8"
            outlineWidth={0.02}
            outlineColor="#3b0764"
            anchorX="center"
            anchorY="middle"
          >
            🌸 Romantic Street Swing
          </Text>
        </group>
      </group>

      {/* Romantic Leafy Shade Trees */}
      {[-7.8, 7.8].map((xSide) =>
        [20, 34, 48, 60].map((zPos, idx) => (
          <group key={`tree-${xSide}-${idx}`} position={[xSide, 0, zPos]}>
            {/* Tree Trunk */}
            <mesh position={[0, 2.2, 0]}>
              <cylinderGeometry args={[0.3, 0.45, 4.4, 12]} />
              <meshStandardMaterial color="#451a03" roughness={0.9} />
            </mesh>
            {/* Lush Foliage Canopy (Cloud of green leaves) */}
            <mesh position={[0, 4.8, 0]}>
              <sphereGeometry args={[1.9, 16, 16]} />
              <meshStandardMaterial color="#15803d" roughness={0.7} />
            </mesh>
            <mesh position={[0.4, 5.4, 0.3]}>
              <sphereGeometry args={[1.5, 14, 14]} />
              <meshStandardMaterial color="#16a34a" roughness={0.7} />
            </mesh>
          </group>
        ))
      )}

      {/* =========================================================================
          3. GRAND ART-DECO THEATRE FAÇADE & ILLUMINATED NEON MARQUEE
         ========================================================================= */}
      {/* Front Exterior Façade Wall */}
      <mesh position={[0, 5.5, 10.9]} receiveShadow>
        <boxGeometry args={[19, 11, 0.6]} />
        <meshStandardMaterial color="#2d1d3d" roughness={0.75} />
      </mesh>

      {/* Two-Story Pilasters & Columns framing entrance */}
      {[-4.2, 4.2].map((xCol, idx) => (
        <group key={`pillar-${idx}`} position={[xCol, 5.0, 11.25]}>
          <mesh>
            <boxGeometry args={[1.2, 10, 0.5]} />
            <meshStandardMaterial color="#3f2654" roughness={0.6} />
          </mesh>
          <mesh position={[0, 4.8, 0.1]}>
            <boxGeometry args={[1.4, 0.5, 0.7]} />
            <primitive object={goldBrassMat} />
          </mesh>
        </group>
      ))}

      {/* Iconic Curved Cinema Marquee Canopy (Overhanging entrance) */}
      <group ref={marqueeSignRef} position={[0, 6.2, 11.5]}>
        {/* Main Curved Canopy Roof */}
        <mesh position={[0, 0, 0.6]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[9.4, 1.8, 1.8]} />
          <meshStandardMaterial color="#1e102e" roughness={0.4} />
        </mesh>

        {/* Marquee Glowing Neon Frame Border */}
        <mesh position={[0, 0, 1.55]}>
          <boxGeometry args={[9.2, 1.6, 0.12]} />
          <meshStandardMaterial color="#831843" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 1.62]}>
          <boxGeometry args={[8.9, 1.35, 0.04]} />
          <meshBasicMaterial color="#be185d" />
        </mesh>

        {/* Twin Golden Film Reel Sculptures on top of Marquee */}
        {[-1.2, 1.2].map((xReel, idx) => (
          <group key={`reel-${idx}`} position={[xReel, 1.2, 0.6]}>
            <mesh rotation={[0, 0, 0]}>
              <cylinderGeometry args={[0.65, 0.65, 0.14, 24]} />
              <primitive object={goldBrassMat} />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
              <torusGeometry args={[0.55, 0.05, 16, 32]} />
              <meshBasicMaterial color="#fef08a" />
            </mesh>
          </group>
        ))}

        {/* Illuminated Neon Title: "★ 2GETHER ★" */}
        <Text
          position={[0, 0.22, 1.68]}
          fontSize={0.68}
          color="#fde047"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
        >
          ★ 2GETHER ★
        </Text>

        {/* Glowing Subtitle: "Two Hearts. One Theatre. One Movie." */}
        <Text
          position={[0, -0.32, 1.68]}
          fontSize={0.22}
          color="#fbcfe8"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.06}
        >
          Two Hearts. One Theatre. One Movie.
        </Text>

        {/* Marquee Rim Chaser Bulbs (Warm glowing spheres along bottom curve) */}
        {Array.from({ length: 18 }).map((_, idx) => (
          <mesh
            key={`bulb-${idx}`}
            position={[-4.2 + idx * 0.49, -0.75, 1.6]}
          >
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
        ))}

        {/* Marquee Downlight */}
        <pointLight position={[0, -0.8, 0.8]} color="#fde047" intensity={1.8} distance={8} />
      </group>

      {/* Two Large Movie Poster Lightboxes Flanking the Entrance */}
      {[-3.0, 3.0].map((xPos, idx) => (
        <group key={`poster-${idx}`} position={[xPos, 3.5, 11.22]}>
          <mesh>
            <boxGeometry args={[1.5, 2.5, 0.12]} />
            <primitive object={goldBrassMat} />
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <planeGeometry args={[1.35, 2.35]} />
            <meshStandardMaterial color={idx === 0 ? '#831843' : '#701a75'} />
          </mesh>
          <Text
            position={[0, 0.65, 0.09]}
            fontSize={0.24}
            color="#fef08a"
            anchorX="center"
            anchorY="middle"
          >
            MOVIE
          </Text>
          <Text
            position={[0, 0.28, 0.09]}
            fontSize={0.24}
            color="#fef08a"
            anchorX="center"
            anchorY="middle"
          >
            TIME
          </Text>
          <Text
            position={[0, -0.4, 0.09]}
            fontSize={0.16}
            color="#fbcfe8"
            anchorX="center"
            anchorY="middle"
          >
            ♥ PREMIERE
          </Text>
        </group>
      ))}

      {/* Grand Red Carpet Steps leading up to the doors */}
      <group position={[0, 0, 11.8]}>
        {/* Step 1 */}
        <mesh position={[0, 0.04, 0.8]}>
          <boxGeometry args={[3.8, 0.08, 0.8]} />
          <primitive object={redCarpetMat} />
        </mesh>
        {/* Step 2 */}
        <mesh position={[0, 0.12, 0.0]}>
          <boxGeometry args={[3.8, 0.08, 0.8]} />
          <primitive object={redCarpetMat} />
        </mesh>
        {/* Step 3 (Top landing) */}
        <mesh position={[0, 0.2, -0.7]}>
          <boxGeometry args={[3.8, 0.08, 0.6]} />
          <primitive object={redCarpetMat} />
        </mesh>
      </group>

      {/* =========================================================================
          4. GOLDEN DOUBLE DOORS & CO-OP KEYHOLE
         ========================================================================= */}
      {/* Outer Door Frame */}
      <mesh position={[0, 2.35, 11.0]}>
        <boxGeometry args={[2.9, 4.4, 0.25]} />
        <primitive object={goldBrassMat} />
      </mesh>

      {/* Left Golden Door */}
      <group ref={leftDoorRef} position={[-1.3, 2.3, 11.0]}>
        <mesh position={[0.65, 0, 0]} castShadow>
          <boxGeometry args={[1.3, 4.1, 0.08]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Glass Panels */}
        <mesh position={[0.65, 0.5, 0.05]}>
          <planeGeometry args={[0.9, 2.2]} />
          <meshStandardMaterial color="#fef08a" opacity={0.65} transparent roughness={0.1} />
        </mesh>
        {/* Handle */}
        <mesh position={[1.15, -0.1, 0.08]}>
          <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} />
        </mesh>
      </group>

      {/* Right Golden Door */}
      <group ref={rightDoorRef} position={[1.3, 2.3, 11.0]}>
        <mesh position={[-0.65, 0, 0]} castShadow>
          <boxGeometry args={[1.3, 4.1, 0.08]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Glass Panels */}
        <mesh position={[-0.65, 0.5, 0.05]}>
          <planeGeometry args={[0.9, 2.2]} />
          <meshStandardMaterial color="#fef08a" opacity={0.65} transparent roughness={0.1} />
        </mesh>
        {/* Handle */}
        <mesh position={[-1.15, -0.1, 0.08]}>
          <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} />
        </mesh>

        {/* Glowing Keyhole on Right Door */}
        <group position={[-1.15, -0.5, 0.05]}>
          <mesh>
            <circleGeometry args={[0.09, 16]} />
            <meshStandardMaterial color="#020617" metalness={0.95} />
          </mesh>
          {isPlateActive && !isDoorUnlocked && (
            <mesh position={[0, 0, 0.01]}>
              <ringGeometry args={[0.09, 0.16, 16]} />
              <meshBasicMaterial color="#fde047" />
            </mesh>
          )}
        </group>
      </group>

      {/* Warm Golden Glow Spill from inside theatre doorway */}
      <pointLight position={[0, 2.5, 10.5]} color="#fde047" intensity={2.0} distance={7} />

      {/* =========================================================================
          5. CIRCULAR CO-OP PRESSURE PLATE
         ========================================================================= */}
      <group position={PRESSURE_PLATE_POS}>
        {/* Base Ring Foundation */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <ringGeometry args={[0.75, 0.95, 32]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* Steppable Pressure Disc */}
        <mesh ref={plateMeshRef} position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.72, 0.72, 0.06, 32]} />
          <meshStandardMaterial
            color={isPlateActive ? '#10b981' : '#f59e0b'}
            emissive={isPlateActive ? '#059669' : '#d97706'}
            emissiveIntensity={isPlateActive ? 0.9 : 0.4}
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>

        {/* Footprint Indicator */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.085, 0]}>
          <circleGeometry args={[0.4, 24]} />
          <meshBasicMaterial
            color={isPlateActive ? '#ecfdf5' : '#fffbeb'}
            opacity={0.8}
            transparent
          />
        </mesh>

        {/* Plate Glow Light */}
        <pointLight
          position={[0, 0.35, 0]}
          color={isPlateActive ? '#10b981' : '#f59e0b'}
          intensity={isPlateActive ? 1.5 : 0.6}
          distance={3.2}
        />
      </group>

      {/* =========================================================================
          6. 14 CLASSIC BLACK STREET LAMPPOSTS ALONG RUNWAY
         ========================================================================= */}
      {LAMPPOST_POSITIONS.map((lp, idx) => (
        <group key={`lamp-${idx}`} position={lp}>
          {/* Base Plinth */}
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.42, 0.55, 0.5, 12]} />
            <primitive object={ironMat} />
          </mesh>

          {/* Slender Fluted Lamp Post */}
          <mesh position={[0, 2.0, 0]}>
            <cylinderGeometry args={[0.11, 0.16, 3.2, 12]} />
            <primitive object={ironMat} />
          </mesh>

          {/* Crossbar */}
          <mesh position={[0, 3.6, 0]}>
            <boxGeometry args={[0.85, 0.07, 0.07]} />
            <primitive object={ironMat} />
          </mesh>

          {/* Lantern Cap */}
          <mesh position={[0, 4.0, 0]}>
            <cylinderGeometry args={[0.28, 0.16, 0.48, 8]} />
            <primitive object={ironMat} />
          </mesh>

          {/* Glowing Lantern Bulb (MeshBasic ensures high brightness without light cost) */}
          <mesh position={[0, 3.88, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>

          {/* Illumination Light (Active on key lampposts & key location) */}
          {(idx === 0 || idx === 1 || idx === 6 || idx === 7 || idx === 12 || idx === quest.keyLamppostIndex) && (
            <pointLight
              position={[0, 3.8, 0]}
              color="#fde047"
              intensity={1.2}
              distance={10.0}
            />
          )}
        </group>
      ))}

      {/* =========================================================================
          7. THE HIDDEN GOLDEN KEY (UNDER quest.keyLamppostIndex)
         ========================================================================= */}
      {!quest.keyPickedBy && (
        <group ref={keyMeshRef} position={[keyPos[0] + 0.5, 0.55, keyPos[2] + 0.35]}>
          {/* Pulsating Golden Beacon Ring on Pavement */}
          <mesh
            ref={keyRingRef}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.48, 0]}
          >
            <ringGeometry args={[0.45, 0.62, 32]} />
            <meshBasicMaterial color="#fbbf24" opacity={0.8} transparent />
          </mesh>

          {/* Key Ring Handle */}
          <mesh position={[0, 0.22, 0]}>
            <torusGeometry args={[0.14, 0.04, 16, 32]} />
            <primitive object={goldBrassMat} />
          </mesh>

          {/* Key Heart Center */}
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>

          {/* Key Shaft */}
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.038, 0.038, 0.45, 12]} />
            <primitive object={goldBrassMat} />
          </mesh>

          {/* Key Teeth */}
          <mesh position={[0.08, -0.22, 0]}>
            <boxGeometry args={[0.12, 0.06, 0.035]} />
            <primitive object={goldBrassMat} />
          </mesh>
          <mesh position={[0.07, -0.12, 0]}>
            <boxGeometry args={[0.09, 0.06, 0.035]} />
            <primitive object={goldBrassMat} />
          </mesh>

          {/* Floating "Pick Up Key 🗝️" Pill (Matches Reference Image 1) */}
          <group position={[0, 0.65, 0]}>
            <mesh>
              <planeGeometry args={[1.5, 0.38]} />
              <meshBasicMaterial color="#0f172a" opacity={0.85} transparent />
            </mesh>
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.16}
              color="#fef08a"
              anchorX="center"
              anchorY="middle"
            >
              Pick Up Key 🗝️
            </Text>
          </group>

          {/* Golden Sparkle Light */}
          <pointLight color="#fbbf24" intensity={1.8} distance={4.5} />
        </group>
      )}
    </group>
  );
};
