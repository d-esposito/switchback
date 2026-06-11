import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { scatterResources, isAvailable, type ResourceNode } from "./resources";
import { resourceNodesRef, resourceVersionRef } from "./sharedRefs";

const stickGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.85, 5);
const stoneGeo = new THREE.DodecahedronGeometry(0.17, 0);
const thatchGeo = new THREE.ConeGeometry(0.22, 0.5, 6);
const stickMat = new THREE.MeshStandardMaterial({ color: "#7d5f3c", flatShading: true });
const stoneMat = new THREE.MeshStandardMaterial({ color: "#9a917f", flatShading: true });
const thatchMat = new THREE.MeshStandardMaterial({ color: "#c9b765", flatShading: true });

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function buildInstances(
  nodes: ResourceNode[],
  kind: ResourceNode["kind"],
  geo: THREE.BufferGeometry,
  mat: THREE.Material
): THREE.InstancedMesh {
  const mine = nodes.filter((n) => n.kind === kind && isAvailable(n));
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mine.length));
  mine.forEach((n, i) => {
    if (kind === "sticks") {
      // lying on the ground
      q.setFromEuler(new THREE.Euler(Math.PI / 2 - 0.12, n.rot, 0));
      s.setScalar(n.scale);
      m.compose(new THREE.Vector3(n.x, n.y + 0.06, n.z), q, s);
    } else {
      q.setFromAxisAngle(up, n.rot);
      s.setScalar(n.scale);
      m.compose(new THREE.Vector3(n.x, n.y + (kind === "thatch" ? 0.22 : 0.1), n.z), q, s);
    }
    mesh.setMatrixAt(i, m);
  });
  mesh.count = mine.length;
  return mesh;
}

export function ResourceNodes() {
  const nodes = useMemo(() => {
    const all = scatterResources();
    resourceNodesRef.current = all;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__tbNodes = all;
    }
    return all;
  }, []);
  const [version, setVersion] = useState(0);

  // re-render when something is collected, and poll for respawns
  useEffect(() => {
    const id = setInterval(() => {
      if (resourceVersionRef.current !== version) setVersion(resourceVersionRef.current);
    }, 1000);
    const respawn = setInterval(() => {
      resourceVersionRef.current += 1;
    }, 30_000);
    return () => {
      clearInterval(id);
      clearInterval(respawn);
    };
  }, [version]);

  const meshes = useMemo(
    () => [
      buildInstances(nodes, "sticks", stickGeo, stickMat),
      buildInstances(nodes, "stones", stoneGeo, stoneMat),
      buildInstances(nodes, "thatch", thatchGeo, thatchMat),
    ],
    // version changes when nodes are collected or respawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, version]
  );

  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}
