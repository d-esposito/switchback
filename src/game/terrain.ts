import * as THREE from "three";
import { SimplexNoise } from "./noise";
import { SEED, SPAWN, PEAK, TRAIL, WATER_Y } from "./config";

const noise = new SimplexNoise(SEED);

function gauss(dx: number, dz: number, sigma: number): number {
  return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
}

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Min distance from (x,z) to the trail polyline. */
export function trailDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const [ax, az] = TRAIL[i];
    const [bx, bz] = TRAIL[i + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
    const dx = x - (ax + abx * t);
    const dz = z - (az + abz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The single source of truth for the world's shape. Deterministic from SEED,
 * shared by the terrain mesh, prop scatter, the character controller, and
 * remote player rendering — so the server never ships geometry.
 */
export function heightAt(x: number, z: number): number {
  let h = 14 * noise.fbm(x * 0.004, z * 0.004, 4);
  h += 2.6 * noise.fbm(x * 0.025 + 100, z * 0.025 + 100, 3);

  // Crown Peak: broad base + steeper upper cone
  h += 118 * gauss(x - PEAK.x, z - PEAK.z, 155);
  h += 42 * gauss(x - PEAK.x, z - PEAK.z, 48);

  // companion hills
  h += 38 * gauss(x - 185, z - 35, 90);
  h += 30 * gauss(x + 215, z + 55, 85);
  h += 24 * gauss(x + 130, z - 330, 70);

  // rocky crags on the upper mountain
  const cragBand = smooth01((h - 45) / 30) * (1 - smooth01((h - 125) / 20));
  h += 7 * cragBand * noise.fbm(x * 0.05 + 500, z * 0.05 + 500, 3);

  // spawn meadow: blend toward a calm grassy floor instead of subtracting,
  // so the valley never dips into the sand/water color bands
  const spawnMask = 0.8 * gauss(x - SPAWN.x, z - SPAWN.z, 95);
  h = h * (1 - spawnMask) + 4.5 * spawnMask;

  // lake basin: blend toward a bottom below the waterline
  const lakeMask = 0.92 * gauss(x - 130, z - 390, 75);
  h = h * (1 - lakeMask) + -9 * lakeMask;

  // rim mountains enclose the world
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  h += 160 * smooth01((r - 470) / 150) * (0.75 + 0.25 * noise.noise(ang * 3.7, 12.3));

  // gentle flattening along the trail so it reads as a walked path
  const td = trailDist(x, z);
  h -= 0.5 * Math.max(0, 1 - td / 3);

  return h;
}

/** Ground normal via central differences. */
export function normalAt(x: number, z: number, eps = 1.5): THREE.Vector3 {
  const hl = heightAt(x - eps, z);
  const hr = heightAt(x + eps, z);
  const hd = heightAt(x, z - eps);
  const hu = heightAt(x, z + eps);
  return new THREE.Vector3(hl - hr, 2 * eps, hd - hu).normalize();
}

const C = {
  sand: new THREE.Color("#c4b289"),
  meadow: new THREE.Color("#74a851"),
  meadowDry: new THREE.Color("#8fae55"),
  forest: new THREE.Color("#4d7c3e"),
  rock: new THREE.Color("#8d8478"),
  rockDark: new THREE.Color("#6f675e"),
  snow: new THREE.Color("#e9eef4"),
  dirt: new THREE.Color("#9a7b52"),
};

const scratch = new THREE.Color();

/** Biome color for a vertex; deterministic jitter keeps the low-poly look lively. */
export function colorAt(x: number, z: number, h: number, nY: number, out: THREE.Color): void {
  const jitter = 0.92 + 0.16 * noise.noise(x * 0.11 + 31, z * 0.11 + 77);

  if (h < WATER_Y + 1.2) {
    out.copy(C.sand);
  } else if (trailDist(x, z) < 2.4 && h < 90 && nY > 0.6) {
    out.copy(C.dirt);
  } else if (h > 100 && nY > 0.58) {
    out.copy(C.snow);
    out.multiplyScalar(0.97 + 0.05 * noise.noise(x * 0.2, z * 0.2));
    return; // snow stays bright, skip darkening jitter
  } else if (nY < 0.62 || h > 68) {
    out.copy(nY < 0.5 ? C.rockDark : C.rock);
  } else if (h > 13) {
    // forest band, blending toward meadow at its edges
    scratch.copy(C.meadowDry);
    out.copy(C.forest).lerp(scratch, smooth01((h - 48) / 14) * 0.7);
  } else {
    out.copy(C.meadow).lerp(C.meadowDry, 0.5 + 0.5 * noise.noise(x * 0.03, z * 0.03));
  }
  out.multiplyScalar(jitter);
}

export interface PropPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number; // 0-1, color variation
}

/** Deterministic scatter for trees and rocks. */
export function scatterProps(): { trees: PropPlacement[]; rocks: PropPlacement[] } {
  const trees: PropPlacement[] = [];
  const rocks: PropPlacement[] = [];
  const step = 9;
  for (let gx = -460; gx <= 460; gx += step) {
    for (let gz = -460; gz <= 460; gz += step) {
      const jx = gx + (noise.noise(gx * 0.37, gz * 0.41) * 0.5 + 0.5) * step;
      const jz = gz + (noise.noise(gx * 0.43 + 9, gz * 0.39 + 7) * 0.5 + 0.5) * step;
      const h = heightAt(jx, jz);
      const nY = normalAt(jx, jz).y;
      const forestMask = noise.fbm(jx * 0.008 + 250, jz * 0.008 + 250, 3);
      const roll = noise.noise(jx * 1.7, jz * 1.9) * 0.5 + 0.5;

      if (
        h > 6 && h < 58 && nY > 0.74 && forestMask > 0.02 &&
        trailDist(jx, jz) > 4 && Math.hypot(jx - SPAWN.x, jz - SPAWN.z) > 14 &&
        roll > 0.35
      ) {
        trees.push({ x: jx, y: h, z: jz, scale: 0.8 + roll * 0.7, rot: roll * Math.PI * 2, tint: roll });
      } else if (h > 25 && h < 115 && nY < 0.78 && roll > 0.88) {
        rocks.push({ x: jx, y: h, z: jz, scale: 0.5 + roll * 1.2, rot: roll * Math.PI * 2, tint: roll });
      }
    }
  }
  return { trees, rocks };
}
