import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "./terrain";
import { planeRef } from "./sharedRefs";

/**
 * A little single-prop bush plane, ~4m long, origin at the wheels.
 * Used parked in the world and wrapped around flying hikers.
 */
export function PlaneMesh({ spinning = true }: { spinning?: boolean }) {
  const prop = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (spinning && prop.current) prop.current.rotation.z += dt * 28;
  });
  return (
    <group position={[0, 0.55, 0]}>
      {/* fuselage */}
      <mesh position={[0, 0.55, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.3, 3.4, 8]} />
        <meshStandardMaterial color="#c2484f" flatShading />
      </mesh>
      {/* nose + engine */}
      <mesh position={[0, 0.55, 1.62]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.42, 0.5, 8]} />
        <meshStandardMaterial color="#8e3a40" flatShading />
      </mesh>
      {/* propeller */}
      <mesh ref={prop} position={[0, 0.55, 1.92]}>
        <boxGeometry args={[2.0, 0.14, 0.05]} />
        <meshStandardMaterial color="#3a3a3a" flatShading />
      </mesh>
      {/* high wing */}
      <mesh position={[0, 1.06, 0.35]}>
        <boxGeometry args={[5.6, 0.1, 1.1]} />
        <meshStandardMaterial color="#f0ead8" flatShading />
      </mesh>
      {/* tail boom surfaces */}
      <mesh position={[0, 0.78, -1.95]}>
        <boxGeometry args={[1.9, 0.08, 0.6]} />
        <meshStandardMaterial color="#f0ead8" flatShading />
      </mesh>
      <mesh position={[0, 1.12, -2.0]}>
        <boxGeometry args={[0.08, 0.8, 0.62]} />
        <meshStandardMaterial color="#c2484f" flatShading />
      </mesh>
      {/* windshield */}
      <mesh position={[0, 0.95, 0.75]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.06]} />
        <meshStandardMaterial color="#9cc4d8" flatShading transparent opacity={0.7} />
      </mesh>
      {/* wheels */}
      <mesh position={[-0.55, -0.35, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.12, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      <mesh position={[0.55, -0.35, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.12, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
      <mesh position={[0, -0.3, -1.6]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.1, 8]} />
        <meshStandardMaterial color="#2a2a2a" flatShading />
      </mesh>
    </group>
  );
}

/** The /plane Easter egg: a parked plane waiting wherever it was summoned. */
export function ParkedPlane() {
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    const p = planeRef.parked;
    group.current.visible = p !== null;
    if (p) {
      group.current.position.set(p.x, heightAt(p.x, p.z), p.z);
      group.current.rotation.y = p.rot;
    }
  });
  return (
    <group ref={group} visible={false}>
      <PlaneMesh spinning={false} />
    </group>
  );
}
