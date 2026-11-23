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

// Romantic 2-Player Street Swing Position & Dynamic Pendulum Physics Helper
export const SWING_POS: [number, number, number] = [4.6, 0, 32.0];
export const SWING_SEATS = [
  { x: 4.6, y: 0.61, z: 31.58, seatIndex: 10, rotY: -Math.PI / 2 }, // Swing Left Seat (Boy)
  { x: 4.6, y: 0.61, z: 32.42, seatIndex: 11, rotY: -Math.PI / 2 }, // Swing Right Seat (Girl)
];

// 2-Player Interactive Street See-Saw Position & Transform Helper
export const SEESAW_POS: [number, number, number] = [-4.6, 0, 32.0];
export const SEESAW_SEATS = [
  { x: -4.6, y: 0.55, z: 30.7, seatIndex: 20, rotY: 0 }, // North Seat (Faces South)
  { x: -4.6, y: 0.55, z: 33.3, seatIndex: 21, rotY: Math.PI }, // South Seat (Faces North)
];

export function getSeesawSeatTransform(seatIndex: number, angle: number) {
  // Fulcrum is at [-4.6, 0.48, 32.0]
  // Plank rotates around X-axis by angle (-0.22 to +0.22 rad)
  const isSeat20 = seatIndex === 20; // North seat
  const armLength = isSeat20 ? -1.3 : 1.3;
  const seatHeight = 0.08;

  // Rotation in Y-Z plane around X-axis
  const yRel = seatHeight;
  const zRel = armLength;

  const yRot = yRel * Math.cos(angle) - zRel * Math.sin(angle);
  const zRot = yRel * Math.sin(angle) + zRel * Math.cos(angle);

  const worldX = -4.6;
  const worldY = 0.48 + yRot;
  const worldZ = 32.0 + zRot;

  return {
    x: worldX,
    y: worldY,
    z: worldZ,
    rotY: isSeat20 ? 0 : Math.PI,
    tiltX: angle,
  };
}

export function getSwingSeatTransform(seatIndex: number, time: number) {
  const theta = Math.sin(time * 1.5) * 0.16;
  const lx = seatIndex === 11 || seatIndex === 1 ? 0.42 : -0.42;
  const HIP_DROP = 0.33; // pelvis offset along the seat normal
  const yRel = -2.21 - HIP_DROP * Math.cos(theta);
  const zRel = 0.02 - HIP_DROP * Math.sin(theta);
  const yRot = yRel * Math.cos(theta) - zRel * Math.sin(theta);
  const zRot = yRel * Math.sin(theta) + zRel * Math.cos(theta);

  return {
    x: 4.6 - zRot,
    y: 3.1 + yRot,
    z: 32.0 + lx,
    rotY: -Math.PI / 2,
    tiltX: theta,
  };
}

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
  const otherPlayer = useAppStore((state) => state.otherPlayer);
  const seesawTargetAngle = useAppStore((state) => state.seesawTargetAngle);

  const keyMeshRef = useRef<THREE.Group>(null);
  const keyRingRef = useRef<THREE.Mesh>(null);
  const leftDoorRef = useRef<THREE.Group>(null);
  const rightDoorRef = useRef<THREE.Group>(null);
  const plateMeshRef = useRef<THREE.Mesh>(null);
  const marqueeSignRef = useRef<THREE.Group>(null);
  const swingBenchRef = useRef<THREE.Group>(null);
  const seesawPlankRef = useRef<THREE.Group>(null);
  const seesawCurrentAngleRef = useRef<number>(0.18);

  const hasKey = quest.keyPickedBy === localPlayer?.playerId;
  const isPlateActive = quest.isPressurePlateActive;
  const isDoorUnlocked = quest.isDoorUnlocked;

  const isAnyOnSwing = Boolean(
    (localPlayer?.isSitting && (localPlayer?.seatIndex === 10 || localPlayer?.seatIndex === 11)) ||
    (otherPlayer?.isSitting && (otherPlayer?.seatIndex === 10 || otherPlayer?.seatIndex === 11))
  );

  const isAnyOnSeesaw = Boolean(
    (localPlayer?.isSitting && (localPlayer?.seatIndex === 20 || localPlayer?.seatIndex === 21)) ||
    (otherPlayer?.isSitting && (otherPlayer?.seatIndex === 20 || otherPlayer?.seatIndex === 21))
  );

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

    // 5. Romantic 2-Player Street Swing Pendulum Physics (swings along local Z)
    if (swingBenchRef.current) {
      swingBenchRef.current.rotation.x = Math.sin(t * 1.5) * 0.16;
    }

    // 6. 2-Player Street See-Saw Dynamic Tilting Physics
    const safeDelta = Math.min(0.05, Math.max(0.001, delta));
    seesawCurrentAngleRef.current = THREE.MathUtils.lerp(
      seesawCurrentAngleRef.current,
      seesawTargetAngle,
      safeDelta * 7
    );
    if (seesawPlankRef.current) {
      seesawPlankRef.current.rotation.x = seesawCurrentAngleRef.current;
    }
  });

  const keyPos = LAMPPOST_POSITIONS[quest.keyLamppostIndex] || LAMPPOST_POSITIONS[6];

  // Memoized materials for Daytime Street Scene
  const cobblestoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8b9bb4', roughness: 0.8, metalness: 0.05 }),
    []
  );
  const sidewalkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.75, metalness: 0.05 }),
    []
  );
  const grassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.85 }),
    []
  );
  const mahoganyDoorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2d140e', roughness: 0.45, metalness: 0.05 }),
    []
  );
  const curbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.7, metalness: 0.1 }),
    []
  );
  const brickMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.75 }),
    []
  );
  const woodBenchMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.6 }),
    []
  );
  const ironMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.3 }),
    []
  );
  const redCarpetMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.7 }),
    []
  );
  const goldBrassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.85, roughness: 0.2 }),
    []
  );

  return (
    <group>
      {/* =========================================================================
          DAYTIME NATURAL SUNLIGHT & BLUE SKY (Street Area Only, Z >= 11)
         ========================================================================= */}
      {/* Warm Golden Sunlight */}
      <directionalLight position={[18, 35, 30]} intensity={2.6} color="#fffbeb" />
      {/* Daylight Sky to Ground Ambient Bounce */}
      <hemisphereLight args={['#7dd3fc', '#fed7aa', 1.3]} />
      <ambientLight intensity={0.9} color="#ffffff" />

      {/* Atmospheric Day Sky Dome */}
      <mesh position={[0, 15, 38]}>
        <sphereGeometry args={[48, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.BackSide} />
      </mesh>

      {/* Sunny Distant Horizon Plane at end of street (Z = 66) */}
      <mesh position={[0, 12, 66]}>
        <planeGeometry args={[65, 26]} />
        <meshBasicMaterial color="#7dd3fc" />
      </mesh>

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

      {/* Left Lush Green Grass Lawn (under trees, planters & outward) */}
      <mesh position={[-9.8, 0.01, 38.0]} receiveShadow>
        <boxGeometry args={[8.0, 0.06, 56]} />
        <primitive object={grassMat} />
      </mesh>

      {/* Right Lush Green Grass Lawn */}
      <mesh position={[9.8, 0.01, 38.0]} receiveShadow>
        <boxGeometry args={[8.0, 0.06, 56]} />
        <primitive object={grassMat} />
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
          .filter((zPos) => !(xSide === 4.6 && zPos === 32) && !(xSide === -4.6 && zPos === 32)) // 4.6 is Swing, -4.6 is See-Saw
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

        {/* Twinkling Fairy Lights String (Efficient single-point warm illumination) */}
        <pointLight position={[0, 3.05, 0]} color="#fef08a" intensity={0.65} distance={3.8} />
        {[-0.9, -0.45, 0, 0.45, 0.9].map((xOff, i) => (
          <mesh key={`fairylight-${i}`} position={[xOff, 3.05, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#fef08a' : '#fbcfe8'} />
          </mesh>
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

        {/* Floating Proximity Tag for Swing (Hidden when characters are seated) */}
        {!isAnyOnSwing && (
          <group position={[0, 1.4, 0.8]}>
            <Text
              fontSize={0.16}
              color="#fbcfe8"
              outlineWidth={0.02}
              outlineColor="#3b0764"
              anchorX="center"
              anchorY="middle"
            >
              🌸 Street Swing
            </Text>
          </group>
        )}
      </group>

      {/* =========================================================================
          2-PLAYER INTERACTIVE STREET SEE-SAW (x = -4.6, z = 32.0)
         ========================================================================= */}
      <group position={[-4.6, 0, 32.0]}>
        {/* Triangular A-Frame Fulcrum Base */}
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.08, 0.35, 0.48, 4]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Center Pivot Axle */}
        <mesh position={[0, 0.46, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.55, 16]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Animated Tilting Plank Assembly */}
        <group ref={seesawPlankRef} position={[0, 0.48, 0]}>
          {/* Main Wooden Plank (3.2m long along Z) */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.42, 0.08, 3.2]} />
            <meshStandardMaterial color="#b45309" roughness={0.6} />
          </mesh>

          {/* North Seat Cushion (Seat 20 - z = -1.3, Pink) */}
          <mesh position={[0, 0.06, -1.3]}>
            <boxGeometry args={[0.38, 0.06, 0.45]} />
            <meshStandardMaterial color="#ec4899" roughness={0.5} />
          </mesh>
          {/* North Handlebar Post & Grip */}
          <mesh position={[0, 0.18, -1.05]}>
            <cylinderGeometry args={[0.02, 0.02, 0.24, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.28, -1.05]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
          </mesh>

          {/* South Seat Cushion (Seat 21 - z = 1.3, Sky Blue) */}
          <mesh position={[0, 0.06, 1.3]}>
            <boxGeometry args={[0.38, 0.06, 0.45]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.5} />
          </mesh>
          {/* South Handlebar Post & Grip */}
          <mesh position={[0, 0.18, 1.05]}>
            <cylinderGeometry args={[0.02, 0.02, 0.24, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.28, 1.05]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
          </mesh>

          {/* Rubber Ground Dampers */}
          <mesh position={[0, -0.06, -1.45]}>
            <cylinderGeometry args={[0.04, 0.04, 0.08, 8]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, -0.06, 1.45]}>
            <cylinderGeometry args={[0.04, 0.04, 0.08, 8]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>

        {/* Floating Proximity Tag for See-Saw */}
        {!isAnyOnSeesaw && (
          <group position={[0, 1.3, 0]}>
            <Text
              fontSize={0.16}
              color="#fef08a"
              outlineWidth={0.02}
              outlineColor="#78350f"
              anchorX="center"
              anchorY="middle"
            >
              🎠 Street See-Saw
            </Text>
          </group>
        )}
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
      {/* Front Exterior Façade Walls with Cutout Doorway Opening (Z: 10.9) */}
      {/* Left Wall Wing */}
      <mesh position={[-6.2, 5.5, 10.9]} receiveShadow>
        <boxGeometry args={[6.6, 11, 0.6]} />
        <meshStandardMaterial color="#9a3412" roughness={0.75} />
      </mesh>
      {/* Right Wall Wing */}
      <mesh position={[6.2, 5.5, 10.9]} receiveShadow>
        <boxGeometry args={[6.6, 11, 0.6]} />
        <meshStandardMaterial color="#9a3412" roughness={0.75} />
      </mesh>
      {/* Top Header Wall above Doorway Opening */}
      <mesh position={[0, 8.0, 10.9]} receiveShadow>
        <boxGeometry args={[5.8, 6.0, 0.6]} />
        <meshStandardMaterial color="#9a3412" roughness={0.75} />
      </mesh>

      {/* Two-Story Pilasters & Columns framing entrance (Carved Sandstone) */}
      {[-4.2, 4.2].map((xCol, idx) => (
        <group key={`pillar-${idx}`} position={[xCol, 5.0, 11.25]}>
          <mesh>
            <boxGeometry args={[1.2, 10, 0.5]} />
            <meshStandardMaterial color="#d4c4b5" roughness={0.6} />
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
          4. ARCHITECTURAL LUXURY CINEMA DOUBLE DOORS & CO-OP KEYHOLE
         ========================================================================= */}
      {/* Outer Door Frame & Stepped Architrave (Grand Portal at Z = 11.22) */}
      <group position={[0, 2.35, 11.22]}>
        {/* Deep Mahogany Recessed Portal Jamb */}
        <mesh>
          <boxGeometry args={[2.96, 4.46, 0.28]} />
          <meshStandardMaterial color="#240f09" roughness={0.6} />
        </mesh>
        {/* Stepped Gold Brass Outer Molding Trim */}
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[3.08, 4.56, 0.22]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Top Header Transom Bar */}
        <mesh position={[0, 2.12, 0.12]}>
          <boxGeometry args={[2.88, 0.18, 0.08]} />
          <primitive object={goldBrassMat} />
        </mesh>
      </group>

      {/* LEFT MAHOGANY DOOR (Stile & Rail, Amber Glowing Glass, Brass Mullions & Handle) */}
      <group ref={leftDoorRef} position={[-1.3, 2.3, 11.22]}>
        {/* Main Solid Mahogany Door Base Slab */}
        <mesh position={[0.65, 0, 0]} castShadow>
          <boxGeometry args={[1.28, 4.1, 0.08]} />
          <meshStandardMaterial color="#35160e" roughness={0.5} />
        </mesh>

        {/* --- Stile & Rail Outer Molding Framing --- */}
        {/* Left Stile (Hinge side) */}
        <mesh position={[0.1, 0, 0.045]}>
          <boxGeometry args={[0.2, 4.1, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Right Stile (Center meeting side) */}
        <mesh position={[1.2, 0, 0.045]}>
          <boxGeometry args={[0.16, 4.1, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Top Rail */}
        <mesh position={[0.65, 1.95, 0.045]}>
          <boxGeometry args={[0.94, 0.22, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Middle Lock Rail */}
        <mesh position={[0.65, -0.15, 0.045]}>
          <boxGeometry args={[0.94, 0.26, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Bottom Rail */}
        <mesh position={[0.65, -1.95, 0.045]}>
          <boxGeometry args={[0.94, 0.22, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>

        {/* --- Upper Glass Window Section --- */}
        {/* Molded Gold Brass Window Casing */}
        <mesh position={[0.65, 0.9, 0.048]}>
          <boxGeometry args={[0.84, 1.84, 0.015]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Inner Dark Window Reveal */}
        <mesh position={[0.65, 0.9, 0.049]}>
          <boxGeometry args={[0.76, 1.76, 0.01]} />
          <meshStandardMaterial color="#1a0805" roughness={0.8} />
        </mesh>
        {/* Glowing Amber Cinema Glass Pane (Illuminated from lobby) */}
        <mesh position={[0.65, 0.9, 0.052]}>
          <boxGeometry args={[0.72, 1.72, 0.005]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#f59e0b"
            emissiveIntensity={0.8}
            roughness={0.15}
            metalness={0.1}
          />
        </mesh>
        {/* Window Vertical Brass Mullion Bar */}
        <mesh position={[0.65, 0.9, 0.058]}>
          <boxGeometry args={[0.035, 1.72, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Window Horizontal Brass Mullion Crossbars */}
        <mesh position={[0.65, 1.25, 0.058]}>
          <boxGeometry args={[0.72, 0.035, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[0.65, 0.55, 0.058]}>
          <boxGeometry args={[0.72, 0.035, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* --- Lower Recessed Field Panel --- */}
        {/* Brass Border Inlay */}
        <mesh position={[0.65, -0.95, 0.048]}>
          <boxGeometry args={[0.82, 1.32, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Raised Wood Center Panel */}
        <mesh position={[0.65, -0.95, 0.052]}>
          <boxGeometry args={[0.74, 1.24, 0.012]} />
          <meshStandardMaterial color="#2d140e" roughness={0.4} />
        </mesh>

        {/* --- Heavy Polished Brass Kickplate --- */}
        <mesh position={[0.65, -1.72, 0.06]}>
          <boxGeometry args={[1.24, 0.52, 0.015]} />
          <meshStandardMaterial color="#eab308" metalness={0.85} roughness={0.2} />
        </mesh>
        {/* Kickplate Top Beveled Lip */}
        <mesh position={[0.65, -1.45, 0.065]}>
          <boxGeometry args={[1.24, 0.03, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Kickplate Corner Rivet Accents */}
        {[-0.56, 0.56].map((rx) =>
          [-1.92, -1.52].map((ry) => (
            <mesh key={`rivet-l-${rx}-${ry}`} position={[0.65 + rx, ry, 0.07]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <primitive object={goldBrassMat} />
            </mesh>
          ))
        )}

        {/* Center Meeting Astragal Strip */}
        <mesh position={[1.27, 0, 0.055]}>
          <boxGeometry args={[0.025, 4.08, 0.02]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* --- Luxury Architectural Vertical Pull Handle (Prominent Long Bar) --- */}
        {/* Handle Main Tubular Bar */}
        <mesh position={[1.15, -0.05, 0.16]}>
          <cylinderGeometry args={[0.042, 0.042, 1.25, 16]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Center Knurled Grip Ring Accent */}
        <mesh position={[1.15, -0.05, 0.162]}>
          <cylinderGeometry args={[0.048, 0.048, 0.45, 16]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* Top Handle Mounting Bracket & Rosette Base */}
        <mesh position={[1.15, 0.45, 0.1]}>
          <boxGeometry args={[0.06, 0.06, 0.12]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[1.15, 0.45, 0.048]}>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Bottom Handle Mounting Bracket & Rosette Base */}
        <mesh position={[1.15, -0.55, 0.1]}>
          <boxGeometry args={[0.06, 0.06, 0.12]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[1.15, -0.55, 0.048]}>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
      </group>

      {/* RIGHT MAHOGANY DOOR (Stile & Rail, Amber Glowing Glass, Pull Handle & Co-op Keyhole) */}
      <group ref={rightDoorRef} position={[1.3, 2.3, 11.22]}>
        {/* Main Solid Mahogany Door Base Slab */}
        <mesh position={[-0.65, 0, 0]} castShadow>
          <boxGeometry args={[1.28, 4.1, 0.08]} />
          <meshStandardMaterial color="#35160e" roughness={0.5} />
        </mesh>

        {/* --- Stile & Rail Outer Molding Framing --- */}
        {/* Right Stile (Hinge side) */}
        <mesh position={[-0.1, 0, 0.045]}>
          <boxGeometry args={[0.2, 4.1, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Left Stile (Center meeting side) */}
        <mesh position={[-1.2, 0, 0.045]}>
          <boxGeometry args={[0.16, 4.1, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Top Rail */}
        <mesh position={[-0.65, 1.95, 0.045]}>
          <boxGeometry args={[0.94, 0.22, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Middle Lock Rail */}
        <mesh position={[-0.65, -0.15, 0.045]}>
          <boxGeometry args={[0.94, 0.26, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>
        {/* Bottom Rail */}
        <mesh position={[-0.65, -1.95, 0.045]}>
          <boxGeometry args={[0.94, 0.22, 0.02]} />
          <primitive object={mahoganyDoorMat} />
        </mesh>

        {/* --- Upper Glass Window Section --- */}
        {/* Molded Gold Brass Window Casing */}
        <mesh position={[-0.65, 0.9, 0.048]}>
          <boxGeometry args={[0.84, 1.84, 0.015]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Inner Dark Window Reveal */}
        <mesh position={[-0.65, 0.9, 0.049]}>
          <boxGeometry args={[0.76, 1.76, 0.01]} />
          <meshStandardMaterial color="#1a0805" roughness={0.8} />
        </mesh>
        {/* Glowing Amber Cinema Glass Pane (Illuminated from lobby) */}
        <mesh position={[-0.65, 0.9, 0.052]}>
          <boxGeometry args={[0.72, 1.72, 0.005]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#f59e0b"
            emissiveIntensity={0.8}
            roughness={0.15}
            metalness={0.1}
          />
        </mesh>
        {/* Window Vertical Brass Mullion Bar */}
        <mesh position={[-0.65, 0.9, 0.058]}>
          <boxGeometry args={[0.035, 1.72, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Window Horizontal Brass Mullion Crossbars */}
        <mesh position={[-0.65, 1.25, 0.058]}>
          <boxGeometry args={[0.72, 0.035, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[-0.65, 0.55, 0.058]}>
          <boxGeometry args={[0.72, 0.035, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* --- Lower Recessed Field Panel --- */}
        {/* Brass Border Inlay */}
        <mesh position={[-0.65, -0.95, 0.048]}>
          <boxGeometry args={[0.82, 1.32, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Raised Wood Center Panel */}
        <mesh position={[-0.65, -0.95, 0.052]}>
          <boxGeometry args={[0.74, 1.24, 0.012]} />
          <meshStandardMaterial color="#2d140e" roughness={0.4} />
        </mesh>

        {/* --- Heavy Polished Brass Kickplate --- */}
        <mesh position={[-0.65, -1.72, 0.06]}>
          <boxGeometry args={[1.24, 0.52, 0.015]} />
          <meshStandardMaterial color="#eab308" metalness={0.85} roughness={0.2} />
        </mesh>
        {/* Kickplate Top Beveled Lip */}
        <mesh position={[-0.65, -1.45, 0.065]}>
          <boxGeometry args={[1.24, 0.03, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Kickplate Corner Rivet Accents */}
        {[-0.56, 0.56].map((rx) =>
          [-1.92, -1.52].map((ry) => (
            <mesh key={`rivet-r-${rx}-${ry}`} position={[-0.65 + rx, ry, 0.07]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <primitive object={goldBrassMat} />
            </mesh>
          ))
        )}

        {/* Center Meeting Astragal Strip */}
        <mesh position={[-1.27, 0, 0.055]}>
          <boxGeometry args={[0.025, 4.08, 0.02]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* --- Luxury Architectural Vertical Pull Handle (Prominent Long Bar) --- */}
        {/* Handle Main Tubular Bar */}
        <mesh position={[-1.15, -0.05, 0.16]}>
          <cylinderGeometry args={[0.042, 0.042, 1.25, 16]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Center Knurled Grip Ring Accent */}
        <mesh position={[-1.15, -0.05, 0.162]}>
          <cylinderGeometry args={[0.048, 0.048, 0.45, 16]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* Top Handle Mounting Bracket & Rosette Base */}
        <mesh position={[-1.15, 0.45, 0.1]}>
          <boxGeometry args={[0.06, 0.06, 0.12]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[-1.15, 0.45, 0.048]}>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>
        {/* Bottom Handle Mounting Bracket & Rosette Base */}
        <mesh position={[-1.15, -0.55, 0.1]}>
          <boxGeometry args={[0.06, 0.06, 0.12]} />
          <primitive object={goldBrassMat} />
        </mesh>
        <mesh position={[-1.15, -0.55, 0.048]}>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <primitive object={goldBrassMat} />
        </mesh>

        {/* --- Glowing Keyhole on Right Door --- */}
        <group position={[-1.14, -0.74, 0.055]}>
          {/* Keyhole Escutcheon Brass Plate */}
          <mesh>
            <boxGeometry args={[0.12, 0.22, 0.018]} />
            <primitive object={goldBrassMat} />
          </mesh>
          {/* Keyhole Aperture */}
          <mesh position={[0, 0, 0.012]}>
            <circleGeometry args={[0.04, 16]} />
            <meshStandardMaterial color="#020617" metalness={0.95} />
          </mesh>
          {isPlateActive && !isDoorUnlocked && (
            <mesh position={[0, 0, 0.018]}>
              <ringGeometry args={[0.05, 0.12, 16]} />
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
