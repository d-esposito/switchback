import { useMemo } from "react";
import * as THREE from "three";
import { WORLD_SIZE, WATER_Y } from "./config";
import { heightAt, normalAt, colorAt, scatterProps } from "./terrain";

const SEGMENTS = 400; // 5m cells over the 2km world

function buildTerrainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2); // make it horizontal, +Y up
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    colorAt(x, z, h, normalAt(x, z).y, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function Terrain() {
  const geo = useMemo(buildTerrainGeometry, []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}

function Water() {
  return (
    <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
      <meshStandardMaterial color="#3f7e9b" transparent opacity={0.78} flatShading />
    </mesh>
  );
}

const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.5, 6);
const canopyGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
const rockGeo = new THREE.DodecahedronGeometry(0.7, 0);
const scrubGeo = new THREE.IcosahedronGeometry(0.55, 0);
const trunkMat = new THREE.MeshStandardMaterial({ color: "#6e5135", flatShading: true });
const canopyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });
const rockMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });
const scrubMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true });

function Props() {
  const { trees, rocks, scrub } = useMemo(scatterProps, []);

  const instances = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3();

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
    const canopyColor = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      s.setScalar(t.scale);
      m.compose(new THREE.Vector3(t.x, t.y + 0.7 * t.scale, t.z), q, s);
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, t.y + (1.5 + 1.1) * t.scale, t.z), q, s);
      canopies.setMatrixAt(i, m);
      canopyColor.setHSL(0.31 + t.tint * 0.05, 0.42, 0.26 + t.tint * 0.1);
      canopies.setColorAt(i, canopyColor);
    });

    const rocksMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    const rockColor = new THREE.Color();
    rocks.forEach((r, i) => {
      q.setFromAxisAngle(up, r.rot);
      s.set(r.scale, r.scale * (0.6 + r.tint * 0.5), r.scale);
      m.compose(new THREE.Vector3(r.x, r.y + 0.15 * r.scale, r.z), q, s);
      rocksMesh.setMatrixAt(i, m);
      rockColor.setHSL(0.08, 0.04 + r.tint * 0.05, 0.38 + r.tint * 0.18);
      rocksMesh.setColorAt(i, rockColor);
    });

    const scrubMesh = new THREE.InstancedMesh(scrubGeo, scrubMat, Math.max(1, scrub.length));
    const scrubColor = new THREE.Color();
    scrub.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      s.set(b.scale, b.scale * 0.55, b.scale); // squashed outback bush
      m.compose(new THREE.Vector3(b.x, b.y + 0.18 * b.scale, b.z), q, s);
      scrubMesh.setMatrixAt(i, m);
      scrubColor.setHSL(0.15 + b.tint * 0.04, 0.32, 0.3 + b.tint * 0.12);
      scrubMesh.setColorAt(i, scrubColor);
    });
    scrubMesh.count = scrub.length;

    return { trunks, canopies, rocksMesh, scrubMesh };
  }, [trees, rocks, scrub]);

  return (
    <>
      <primitive object={instances.trunks} />
      <primitive object={instances.canopies} />
      <primitive object={instances.rocksMesh} />
      <primitive object={instances.scrubMesh} />
    </>
  );
}

export function World() {
  return (
    <>
      <Terrain />
      <Water />
      <Props />
    </>
  );
}
