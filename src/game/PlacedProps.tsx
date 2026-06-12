import { useEffect } from "react";
import { useQuery } from "convex/react";
import * as THREE from "three";
import { api } from "../../convex/_generated/api";
import { heightAt, normalAt } from "./terrain";
import { tentGroundY } from "./Landmarks";
import { ropesRef, tentsRef } from "./sharedRefs";

/** A fixed line draped ~12m down the fall line from its anchor. */
function Rope({ x, z }: { x: number; z: number }) {
  const segments: { pos: THREE.Vector3; rot: THREE.Euler; len: number }[] = [];
  let cx = x;
  let cz = z;
  let cy = heightAt(x, z);
  for (let i = 0; i < 8; i++) {
    const n = normalAt(cx, cz);
    // fall line = downhill direction
    let dx = n.x;
    let dz = n.z;
    const mag = Math.hypot(dx, dz);
    if (mag < 0.03) break; // flat ground — stop draping
    dx /= mag;
    dz /= mag;
    const nx = cx + dx * 1.6;
    const nz = cz + dz * 1.6;
    const ny = heightAt(nx, nz);
    const mid = new THREE.Vector3((cx + nx) / 2, (cy + ny) / 2 + 0.06, (cz + nz) / 2);
    const dir = new THREE.Vector3(nx - cx, ny - cy, nz - cz);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    segments.push({ pos: mid, rot: new THREE.Euler().setFromQuaternion(quat), len });
    cx = nx;
    cz = nz;
    cy = ny;
  }
  return (
    <group>
      {/* anchor stake */}
      <mesh position={[x, heightAt(x, z) + 0.25, z]}>
        <cylinderGeometry args={[0.04, 0.05, 0.5, 5]} />
        <meshStandardMaterial color="#5a4128" flatShading />
      </mesh>
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.pos} rotation={seg.rot}>
          <cylinderGeometry args={[0.025, 0.025, seg.len, 4]} />
          <meshStandardMaterial color="#d8542f" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Tent({ x, z }: { x: number; z: number }) {
  const y = tentGroundY(x, z);
  return (
    <group position={[x, y, z]}>
      {/* A-frame canvas */}
      <mesh position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[1.15, 1.15, 1.9]} />
        <meshStandardMaterial color="#3e6b48" flatShading />
      </mesh>
      {/* dark opening */}
      <mesh position={[0, 0.28, 0.96]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.62, 0.62, 0.03]} />
        <meshStandardMaterial color="#1c2a1f" flatShading />
      </mesh>
      {/* ridge pole */}
      <mesh position={[0, 1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 2.1, 5]} />
        <meshStandardMaterial color="#7a5c3a" flatShading />
      </mesh>
    </group>
  );
}

export function PlacedProps() {
  const ropes = useQuery(api.crafting.ropes) ?? [];
  const tents = useQuery(api.crafting.tents) ?? [];

  // mirror into shared refs so the frame loop can apply gameplay effects
  useEffect(() => {
    ropesRef.current = ropes.map((r) => ({ x: r.x, y: r.y, z: r.z }));
  }, [ropes]);
  useEffect(() => {
    tentsRef.current = tents.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  }, [tents]);

  return (
    <>
      {ropes.map((r) => (
        <Rope key={r.id} x={r.x} z={r.z} />
      ))}
      {tents.map((t) => (
        <Tent key={t.id} x={t.x} z={t.z} />
      ))}
    </>
  );
}
