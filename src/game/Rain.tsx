import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "./store";
import { weatherAt } from "./weather";
import { hash2 } from "./noise";
import { SEED } from "./config";

const COUNT = 650;
const BOX = 34; // rain volume side length, centered on the camera
const TOP = 22;
const FALL_SPEED = 19;

const m = new THREE.Matrix4();

/** Instanced streaks falling in a recycled volume around the camera. */
export function Rain() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const fall = useRef(0);
  const clock = useGame((s) => s.clock);

  const seeds = useMemo(() => {
    const s = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      s[i * 3] = (hash2(i, 3, SEED) - 0.5) * BOX;
      s[i * 3 + 1] = (hash2(i, 7, SEED) - 0.5) * BOX;
      s[i * 3 + 2] = hash2(i, 11, SEED) * 28;
    }
    return s;
  }, []);

  useFrame(({ camera }, dt) => {
    const w = weatherAt(clock);
    const on = w.rain > 0.04;
    mesh.current.visible = on;
    if (!on) return;

    (mesh.current.material as THREE.MeshBasicMaterial).opacity = Math.min(0.55, w.rain * 0.7);
    fall.current += dt * FALL_SPEED;

    const active = Math.floor(COUNT * Math.min(1, w.rain * 1.6));
    mesh.current.count = active;
    for (let i = 0; i < active; i++) {
      const y = TOP - ((seeds[i * 3 + 2] + fall.current) % 28);
      m.setPosition(
        camera.position.x + seeds[i * 3],
        camera.position.y + y - 7,
        camera.position.z + seeds[i * 3 + 1]
      );
      mesh.current.setMatrixAt(i, m);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, COUNT]}
      visible={false}
      frustumCulled={false}
    >
      <boxGeometry args={[0.016, 0.5, 0.016]} />
      <meshBasicMaterial color="#a9c0da" transparent opacity={0.4} depthWrite={false} />
    </instancedMesh>
  );
}
