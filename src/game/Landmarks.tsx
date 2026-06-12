import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { LOOKOUT, type Peak, type Zone } from "./config";
import { heightAt } from "./terrain";

export function Campfire({ x, z }: { x: number; z: number }) {
  const flame = useRef<THREE.Mesh>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const y = heightAt(x, z);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23 + 1.7) * 0.08;
    light.current.intensity = 14 * flicker;
    flame.current.scale.setScalar(0.9 + 0.18 * Math.sin(t * 9));
    flame.current.rotation.y = t * 2.2;
  });

  return (
    <group position={[x, y, z]}>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75]}>
            <dodecahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#7d7568" flatShading />
          </mesh>
        );
      })}
      <mesh position={[0, 0.12, 0]} rotation={[0, 0.5, Math.PI / 2.3]}>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 6]} />
        <meshStandardMaterial color="#5a4128" flatShading />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, 2.2, Math.PI / 2.4]}>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 6]} />
        <meshStandardMaterial color="#4e3a24" flatShading />
      </mesh>
      <mesh ref={flame} position={[0, 0.45, 0]}>
        <coneGeometry args={[0.28, 0.85, 7]} />
        <meshStandardMaterial
          color="#ff9d3c"
          emissive="#ff7a1a"
          emissiveIntensity={2.4}
          flatShading
        />
      </mesh>
      <pointLight ref={light} position={[0, 1.1, 0]} color="#ffb066" distance={26} decay={2} />
    </group>
  );
}

function CampTent({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  const y = heightAt(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.55, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[1.15, 1.15, 1.9]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, 0.38, 0.96]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.62, 0.62, 0.03]} />
        <meshStandardMaterial color="#1c2a1f" flatShading />
      </mesh>
      <mesh position={[0, 1.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 2.1, 5]} />
        <meshStandardMaterial color="#7a5c3a" flatShading />
      </mesh>
    </group>
  );
}

const TENT_COLORS: Record<string, string> = {
  basecamp: "#3e6b48",
  pikas: "#5b71a8",
  dolphins: "#3e7cb1",
  wallabies: "#c2484f",
  armadillos: "#c79a3d",
};

/** A standup site: campfire, two team tents, and a routed signpost. */
export function Campsite({ zone }: { zone: Zone }) {
  const { x, z } = zone.camp;
  const sy = heightAt(x - 4, z - 4);
  const tentColor = TENT_COLORS[zone.id] ?? "#3e6b48";
  return (
    <group>
      <Campfire x={x} z={z} />
      <CampTent x={x + 4.5} z={z + 1.5} rot={-0.7} color={tentColor} />
      <CampTent x={x + 2.5} z={z + 4.5} rot={0.5} color={tentColor} />
      {/* signpost */}
      <group position={[x - 4, sy, z - 4]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 1.6, 6]} />
          <meshStandardMaterial color="#7a5c3a" flatShading />
        </mesh>
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[2.1, 0.6, 0.07]} />
          <meshStandardMaterial color="#8a6a44" flatShading />
        </mesh>
        <Text
          position={[0, 1.52, 0.045]}
          fontSize={0.2}
          color="#2e2416"
          anchorX="center"
          maxWidth={1.9}
          textAlign="center"
        >
          {zone.name.toUpperCase() + "\n" + zone.blurb}
        </Text>
      </group>
    </group>
  );
}

export function SummitRegister({ peak }: { peak: Peak }) {
  const y = heightAt(peak.x, peak.z);
  return (
    <group position={[peak.x, y, peak.z]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.9, 0.4]} />
        <meshStandardMaterial color="#797164" flatShading />
      </mesh>
      <mesh position={[-0.09, 0.94, 0]} rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.34, 0.04, 0.26]} />
        <meshStandardMaterial color="#f0ead8" flatShading />
      </mesh>
      <mesh position={[0.09, 0.94, 0]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.34, 0.04, 0.26]} />
        <meshStandardMaterial color="#f0ead8" flatShading />
      </mesh>
      <mesh position={[0.9, 1.5, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 3, 6]} />
        <meshStandardMaterial color="#8a6f4d" flatShading />
      </mesh>
      <mesh position={[1.25, 2.7, 0]}>
        <coneGeometry args={[0.28, 0.7, 3]} />
        <meshStandardMaterial color="#d8542f" flatShading side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 1.85, 0]}
        fontSize={0.22}
        color="#fff8ea"
        anchorX="center"
        outlineWidth={0.012}
        outlineColor="#33291c"
      >
        {peak.name.toUpperCase()}
      </Text>
    </group>
  );
}

export function FireLookout() {
  const y = heightAt(LOOKOUT.x, LOOKOUT.z);
  const legs = [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ] as const;
  return (
    <group position={[LOOKOUT.x, y, LOOKOUT.z]}>
      {legs.map(([lx, lz], i) => (
        <mesh key={i} position={[lx * 0.8, 3, lz * 0.8]} rotation={[lz * -0.12, 0, lx * 0.12]}>
          <cylinderGeometry args={[0.09, 0.13, 6.4, 6]} />
          <meshStandardMaterial color="#6b4f31" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 6.7, 0]}>
        <boxGeometry args={[2.6, 1.5, 2.6]} />
        <meshStandardMaterial color="#8a6a44" flatShading />
      </mesh>
      <mesh position={[0, 6.85, 0]}>
        <boxGeometry args={[2.65, 0.55, 2.65]} />
        <meshStandardMaterial color="#3a4d5c" flatShading />
      </mesh>
      <mesh position={[0, 7.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2.2, 0.9, 4]} />
        <meshStandardMaterial color="#5d4128" flatShading />
      </mesh>
      <mesh position={[0, 5.9, 0]}>
        <boxGeometry args={[3.3, 0.12, 3.3]} />
        <meshStandardMaterial color="#7a5c3a" flatShading />
      </mesh>
      <Text
        position={[0, 4.6, 1.1]}
        fontSize={0.28}
        color="#f0e6cf"
        anchorX="center"
        outlineWidth={0.014}
        outlineColor="#2e2416"
      >
        {"ABANDONED LOOKOUT"}
      </Text>
    </group>
  );
}
