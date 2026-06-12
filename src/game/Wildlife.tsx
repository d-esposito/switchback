import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "./terrain";
import { hash2 } from "./noise";
import { SEED } from "./config";
import { playerPosRef } from "./sharedRefs";
import { useGame, timeOfDay } from "./store";

const DEER_COUNT = 7;
const WANDER_RADIUS = 20;
const FLEE_DIST = 9;

/** Find a meadow/forest home for deer i, deterministically. */
function deerHome(i: number): { x: number; z: number } {
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = hash2(i, attempt, SEED + 21) * Math.PI * 2;
    const r = 90 + hash2(i, attempt + 100, SEED + 21) * 550;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > 4 && h < 55 && Math.hypot(x, z) > 70) return { x, z };
  }
  return { x: 200, z: -150 };
}

function Deer({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null!);
  const legFL = useRef<THREE.Mesh>(null!);
  const legFR = useRef<THREE.Mesh>(null!);
  const legBL = useRef<THREE.Mesh>(null!);
  const legBR = useRef<THREE.Mesh>(null!);
  const home = useMemo(() => deerHome(index), [index]);
  const state = useRef({
    x: home.x,
    z: home.z,
    heading: 0,
    target: { x: home.x, z: home.z },
    retarget: 0,
    speed: 0,
    phase: index * 2.3,
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const p = playerPosRef.current;
    const dPlayer = Math.hypot(s.x - p.x, s.z - p.z);

    if (dPlayer < FLEE_DIST) {
      // flee directly away from the hiker
      const away = Math.atan2(s.x - p.x, s.z - p.z);
      s.target = { x: s.x + Math.sin(away) * 30, z: s.z + Math.cos(away) * 30 };
      s.speed = 6.5;
      s.retarget = 2.5;
    } else {
      s.retarget -= dt;
      if (s.retarget <= 0) {
        const a = Math.random() * Math.PI * 2;
        s.target = {
          x: home.x + Math.cos(a) * WANDER_RADIUS * Math.random(),
          z: home.z + Math.sin(a) * WANDER_RADIUS * Math.random(),
        };
        s.retarget = 4 + Math.random() * 6;
        s.speed = Math.random() < 0.35 ? 0 : 1.1; // sometimes just graze
      }
    }

    const dx = s.target.x - s.x;
    const dz = s.target.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5 && s.speed > 0) {
      const want = Math.atan2(dx, dz);
      let dh = want - s.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      s.heading += dh * Math.min(1, dt * 5);
      s.x += Math.sin(s.heading) * s.speed * dt;
      s.z += Math.cos(s.heading) * s.speed * dt;
    } else {
      s.speed = Math.max(0, s.speed - dt * 4);
    }

    group.current.position.set(s.x, heightAt(s.x, s.z), s.z);
    group.current.rotation.y = s.heading;

    s.phase += dt * (2 + s.speed * 2.2);
    const amp = Math.min(0.5, s.speed * 0.12);
    legFL.current.rotation.x = Math.sin(s.phase) * amp;
    legBR.current.rotation.x = Math.sin(s.phase) * amp;
    legFR.current.rotation.x = Math.sin(s.phase + Math.PI) * amp;
    legBL.current.rotation.x = Math.sin(s.phase + Math.PI) * amp;
  });

  const fur = index % 2 ? "#a87b4f" : "#96693f";
  const hasAntlers = index % 3 === 0;

  return (
    <group ref={group}>
      {/* body */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.42, 0.45, 0.95]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      {/* neck + head */}
      <mesh position={[0, 0.95, 0.42]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.16, 0.42, 0.16]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      <mesh position={[0, 1.14, 0.58]}>
        <boxGeometry args={[0.18, 0.18, 0.32]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      {/* ears */}
      <mesh position={[-0.1, 1.27, 0.5]} rotation={[0, 0, 0.5]}>
        <coneGeometry args={[0.05, 0.14, 4]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      <mesh position={[0.1, 1.27, 0.5]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.05, 0.14, 4]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      {/* antlers on some */}
      {hasAntlers && (
        <>
          <mesh position={[-0.08, 1.32, 0.52]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.02, 0.025, 0.3, 4]} />
            <meshStandardMaterial color="#6e5135" flatShading />
          </mesh>
          <mesh position={[0.08, 1.32, 0.52]} rotation={[0, 0, -0.4]}>
            <cylinderGeometry args={[0.02, 0.025, 0.3, 4]} />
            <meshStandardMaterial color="#6e5135" flatShading />
          </mesh>
        </>
      )}
      {/* tail */}
      <mesh position={[0, 0.72, -0.5]} rotation={[0.6, 0, 0]}>
        <boxGeometry args={[0.1, 0.18, 0.08]} />
        <meshStandardMaterial color="#f0ead8" flatShading />
      </mesh>
      {/* legs */}
      <mesh ref={legFL} position={[-0.13, 0.42, 0.32]}>
        <boxGeometry args={[0.09, 0.55, 0.09]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      <mesh ref={legFR} position={[0.13, 0.42, 0.32]}>
        <boxGeometry args={[0.09, 0.55, 0.09]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      <mesh ref={legBL} position={[-0.13, 0.42, -0.32]}>
        <boxGeometry args={[0.09, 0.55, 0.09]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
      <mesh ref={legBR} position={[0.13, 0.42, -0.32]}>
        <boxGeometry args={[0.09, 0.55, 0.09]} />
        <meshStandardMaterial color={fur} flatShading />
      </mesh>
    </group>
  );
}

const FLOCKS = [
  { cx: 0, cz: 80, r: 40, speed: 0.22, count: 6 }, // over the hub meadow
  { cx: 540, cz: 540, r: 45, speed: 0.26, count: 7 }, // gulls over the cove
  { cx: -520, cz: -340, r: 38, speed: 0.18, count: 5 }, // riding mesa thermals
];

function Birds() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<(THREE.Mesh | null)[]>([]);

  const birds = useMemo(
    () =>
      FLOCKS.flatMap((f, fi) =>
        Array.from({ length: f.count }, (_, i) => ({
          ...f,
          alt: heightAt(f.cx, f.cz) + 26 + i * 1.7,
          phase: (i / f.count) * Math.PI * 2 + fi,
          flapPhase: i * 1.3,
        }))
      ),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    birds.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      const a = t * b.speed + b.phase;
      g.position.set(
        b.cx + Math.cos(a) * b.r,
        b.alt + Math.sin(t * 0.7 + b.phase) * 2,
        b.cz + Math.sin(a) * b.r
      );
      g.rotation.y = -a; // face along the circle
      const w = wings.current[i];
      if (w) w.rotation.z = Math.sin(t * 9 + b.flapPhase) * 0.6;
    });
  });

  return (
    <>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => (groups.current[i] = el)}>
          <mesh>
            <boxGeometry args={[0.12, 0.06, 0.3]} />
            <meshStandardMaterial color="#2e2a26" flatShading />
          </mesh>
          <mesh ref={(el) => (wings.current[i] = el)}>
            <boxGeometry args={[0.9, 0.02, 0.16]} />
            <meshStandardMaterial color="#2e2a26" flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

const FIREFLY_COUNT = 46;
const FIREFLY_HOME = { x: 420, z: 420 }; // meadow above Dolphin Cove

function Fireflies() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const clock = useGame((s) => s.clock);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
        x: FIREFLY_HOME.x + (hash2(i, 1, SEED) - 0.5) * 90,
        z: FIREFLY_HOME.z + (hash2(i, 2, SEED) - 0.5) * 90,
        p1: hash2(i, 3, SEED) * 10,
        p2: hash2(i, 4, SEED) * 10,
      })),
    []
  );

  useFrame(({ clock: three }) => {
    const elev = Math.sin((timeOfDay(clock) - 0.25) * Math.PI * 2);
    const night = elev < -0.02;
    mesh.current.visible = night;
    if (!night) return;
    const t = three.elapsedTime;
    seeds.forEach((s, i) => {
      const x = s.x + Math.sin(t * 0.4 + s.p1) * 2.4;
      const z = s.z + Math.cos(t * 0.31 + s.p2) * 2.4;
      const y = heightAt(x, z) + 0.7 + Math.sin(t * 0.9 + s.p1 * 2) * 0.45;
      m.setPosition(x, y, z);
      mesh.current.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, FIREFLY_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.035, 4, 4]} />
      <meshBasicMaterial color="#e3ff8a" />
    </instancedMesh>
  );
}

export function Wildlife() {
  return (
    <>
      {Array.from({ length: DEER_COUNT }, (_, i) => (
        <Deer key={i} index={i} />
      ))}
      <Birds />
      <Fireflies />
    </>
  );
}
