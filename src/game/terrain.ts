import * as THREE from "three";
import { SimplexNoise } from "./noise";
import { SEED, HUB, ZONES, TRAILS, WATER_Y } from "./config";

const noise = new SimplexNoise(SEED);

const PIKA = ZONES.find((z) => z.id === "pikas")!;
const COVE = ZONES.find((z) => z.id === "dolphins")!;
const WASH = ZONES.find((z) => z.id === "wallabies")!;
const MESA = ZONES.find((z) => z.id === "armadillos")!;

function gauss(dx: number, dz: number, sigma: number): number {
  return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
}

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Min distance from (x,z) to the trail network. */
export function trailDist(x: number, z: number): number {
  let best = Infinity;
  for (const line of TRAILS) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
      const dx = x - (ax + abx * t);
      const dz = z - (az + abz * t);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Zone influence masks, 0..1. Used by height, color, props and resources. */
export function masks(x: number, z: number) {
  return {
    desert: gauss(x - WASH.x, z - WASH.z, 270),
    mesa: gauss(x - MESA.x, z - MESA.z, 250),
    cove: gauss(x - COVE.x, z - COVE.z, 230),
    alpine: gauss(x - PIKA.x, z - PIKA.z, 280),
  };
}

/** A flat-topped plateau with steep (climbable) cliff sides. */
function plateau(
  x: number,
  z: number,
  cx: number,
  cz: number,
  sigma: number,
  top: number,
  h: number
): number {
  const t = smooth01((gauss(x - cx, z - cz, sigma) - 0.45) / 0.14);
  return h * (1 - t) + top * t;
}

// The mesa access ramp: a causeway of stepping-stone gaussian mounds rising
// from the canyon floor to the mesa top, following the trail's last leg.
const RAMP: { x: number; z: number; h: number }[] = (() => {
  const from = { x: -440, z: -290 };
  const to = { x: -548, z: -372 };
  const steps = 7;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      h: 8 + (76 - 8) * t,
    });
  }
  return out;
})();

/**
 * The single source of truth for the world's shape. Deterministic from SEED,
 * shared by the terrain mesh, props, the controller and remote rendering.
 */
// Mid-size mountains scattered in the gaps BETWEEN trails, so the journey
// rolls and climbs without making any camp-to-camp route impassable.
const INTERLANDS: { x: number; z: number; h: number; s: number }[] = [
  { x: 330, z: -260, h: 85, s: 75 }, // northeast gap
  { x: 480, z: 60, h: 70, s: 85 }, // east
  { x: 220, z: -520, h: 72, s: 62 }, // peak's eastern shoulder
  { x: -110, z: 620, h: 62, s: 70 }, // south
  { x: -760, z: 60, h: 90, s: 80 }, // far west between Wash and Mesa
  // a ridgeline walking the northeast rim-side
  { x: 520, z: -420, h: 58, s: 55 },
  { x: 615, z: -295, h: 68, s: 58 },
  { x: 685, z: -160, h: 56, s: 55 },
];

export function heightAt(x: number, z: number): number {
  const m = masks(x, z);

  // rolling base — big hills, mid swells, small detail
  let h = 22 * noise.fbm(x * 0.0035, z * 0.0035, 4);
  h += 9 * noise.fbm(x * 0.009 + 300, z * 0.009 + 300, 3);
  h += 2.4 * noise.fbm(x * 0.02 + 100, z * 0.02 + 100, 3);

  // the interlands: mountains between the zones
  for (const p of INTERLANDS) {
    h += p.h * gauss(x - p.x, z - p.z, p.s);
  }

  // trails ride the land but soften its extremes: blend a third of the
  // local relief away within ~7m of a path so routes stay hikable
  // (applied before camp/zone shaping so camps stay exactly flat)
  const tdEase = trailDist(x, z);
  if (tdEase < 7) {
    const ease = 0.32 * (1 - tdEase / 7);
    const calm = 22 * noise.fbm(x * 0.0006, z * 0.0006, 2) + 8;
    h = h * (1 - ease) + calm * ease;
  }

  // --- Pika Peak (north): broad massif, steep upper cone, summit wall ---
  h += 150 * gauss(x - PIKA.x, z - PIKA.z, 210);
  h += 62 * gauss(x - PIKA.x, z - PIKA.z, 72);
  h += 55 * gauss(x - PIKA.x, z - PIKA.z, 30);
  // craggy detail on the upper mountain
  const cragBand = smooth01((h - 60) / 40) * (1 - smooth01((h - 220) / 30));
  h += 8 * cragBand * noise.fbm(x * 0.05 + 500, z * 0.05 + 500, 3);
  // the bench where Pika Camp sits
  const benchMask = 0.88 * gauss(x - PIKA.camp.x, z - PIKA.camp.z, 48);
  h = h * (1 - benchMask) + 62 * benchMask;

  // --- Armadillo Mesa (west): three strata-striped flat-tops + a ramp ---
  if (m.mesa > 0.02) {
    h = plateau(x, z, MESA.x, MESA.z, 115, 78, h);
    h = plateau(x, z, -700, -240, 78, 55, h);
    h = plateau(x, z, -430, -500, 62, 95, h);
    for (const r of RAMP) {
      const t = 0.85 * gauss(x - r.x, z - r.z, 26);
      h = h * (1 - t) + r.h * t;
    }
  }

  // --- Dolphin Cove (southeast): lagoon basin with wide gentle beaches ---
  const lagoon = 0.95 * gauss(x - COVE.x, z - COVE.z, 150);
  h = h * (1 - lagoon) + -10 * lagoon;
  const beachCampMask = 0.88 * gauss(x - COVE.camp.x, z - COVE.camp.z, 42);
  h = h * (1 - beachCampMask) + 4.2 * beachCampMask;

  // --- Wallaby Wash (southwest): low red dunes + a billabong ---
  if (m.desert > 0.05) {
    const dunes = 7 + 5 * noise.fbm(x * 0.01 + 900, z * 0.01 + 900, 3);
    h = h * (1 - 0.8 * m.desert) + dunes * (0.8 * m.desert);
    const billabong = 0.9 * gauss(x + 555, z - 472, 26);
    h = h * (1 - billabong) + -6 * billabong;
  }

  // --- Basecamp Junction (hub): calm meadow ---
  const hubMask = 0.9 * gauss(x - HUB.x, z - HUB.z, 110);
  h = h * (1 - hubMask) + 5 * hubMask;

  // rim mountains enclose the world
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  h += 180 * smooth01((r - 800) / 160) * (0.75 + 0.25 * noise.noise(ang * 3.7, 12.3));

  // gentle wear along the trails
  h -= 0.5 * Math.max(0, 1 - trailDist(x, z) / 3);

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
  sand: new THREE.Color("#cdb98c"),
  meadow: new THREE.Color("#74a851"),
  meadowDry: new THREE.Color("#8fae55"),
  forest: new THREE.Color("#4d7c3e"),
  rock: new THREE.Color("#8d8478"),
  rockDark: new THREE.Color("#6f675e"),
  snow: new THREE.Color("#e9eef4"),
  dirt: new THREE.Color("#9a7b52"),
  redSand: new THREE.Color("#c0703f"),
  redSandDeep: new THREE.Color("#a85a33"),
  spinifex: new THREE.Color("#b3a05a"),
  terracotta: new THREE.Color("#b06a45"),
  terracottaPale: new THREE.Color("#c98e62"),
  terracottaDark: new THREE.Color("#8e4f33"),
};

const scratch = new THREE.Color();

/** Biome color for a vertex, blending zone palettes. */
export function colorAt(x: number, z: number, h: number, nY: number, out: THREE.Color): void {
  const m = masks(x, z);
  const jitter = 0.92 + 0.16 * noise.noise(x * 0.11 + 31, z * 0.11 + 77);

  if (h < WATER_Y + 1.4) {
    out.copy(C.sand);
    if (m.desert > 0.35) out.lerp(C.redSandDeep, 0.55);
  } else if (trailDist(x, z) < 2.4 && h < 100 && nY > 0.6) {
    out.copy(C.dirt);
  } else if (h > 130 && nY > 0.55) {
    // snow — only Pika Peak reaches this height
    out.copy(C.snow);
    out.multiplyScalar(0.97 + 0.05 * noise.noise(x * 0.2, z * 0.2));
    return;
  } else if (m.mesa > 0.32 && (nY < 0.74 || h > 30)) {
    // striped sedimentary rock: bands by elevation
    const band = Math.abs(Math.sin(h * 0.42 + noise.noise(x * 0.01, z * 0.01)));
    out.copy(C.terracotta);
    out.lerp(band > 0.62 ? C.terracottaPale : C.terracottaDark, 0.45 * band);
  } else if (m.desert > 0.4) {
    // outback reds with spinifex patches
    const tuft = noise.noise(x * 0.05 + 40, z * 0.05 + 60);
    out.copy(C.redSand).lerp(C.redSandDeep, 0.5 + 0.5 * noise.noise(x * 0.02, z * 0.02));
    if (tuft > 0.45 && nY > 0.8) out.lerp(C.spinifex, 0.55);
  } else if (nY < 0.62 || h > 75) {
    out.copy(nY < 0.5 ? C.rockDark : C.rock);
  } else if (h > 13) {
    scratch.copy(C.meadowDry);
    out.copy(C.forest).lerp(scratch, smooth01((h - 52) / 16) * 0.7);
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

/** Deterministic scatter for trees, rocks and outback scrub. */
export function scatterProps(): {
  trees: PropPlacement[];
  rocks: PropPlacement[];
  scrub: PropPlacement[];
} {
  const trees: PropPlacement[] = [];
  const rocks: PropPlacement[] = [];
  const scrub: PropPlacement[] = [];
  const step = 11;
  for (let gx = -820; gx <= 820; gx += step) {
    for (let gz = -820; gz <= 820; gz += step) {
      const jx = gx + (noise.noise(gx * 0.37, gz * 0.41) * 0.5 + 0.5) * step;
      const jz = gz + (noise.noise(gx * 0.43 + 9, gz * 0.39 + 7) * 0.5 + 0.5) * step;
      const h = heightAt(jx, jz);
      const nY = normalAt(jx, jz).y;
      const m = masks(jx, jz);
      const forestMask = noise.fbm(jx * 0.006 + 250, jz * 0.006 + 250, 3);
      const roll = noise.noise(jx * 1.7, jz * 1.9) * 0.5 + 0.5;
      const onTrail = trailDist(jx, jz) < 4;
      const nearHub = Math.hypot(jx - HUB.camp.x, jz - HUB.camp.z) < 18;
      const dryness = Math.max(m.desert, m.mesa * 0.8);

      if (
        h > 4 && h < 68 && nY > 0.74 && forestMask > 0.04 && dryness < 0.3 &&
        !onTrail && !nearHub && roll > 0.42
      ) {
        trees.push({ x: jx, y: h, z: jz, scale: 0.8 + roll * 0.7, rot: roll * Math.PI * 2, tint: roll });
      } else if (m.desert > 0.38 && h > 0 && nY > 0.78 && !onTrail && roll > 0.62) {
        scrub.push({ x: jx, y: h, z: jz, scale: 0.7 + roll * 0.8, rot: roll * Math.PI * 2, tint: roll });
      } else if (
        ((h > 25 && h < 125 && nY < 0.78) || m.mesa > 0.4) &&
        roll > 0.86 && !onTrail
      ) {
        rocks.push({ x: jx, y: h, z: jz, scale: 0.5 + roll * 1.3, rot: roll * Math.PI * 2, tint: roll });
      }
    }
  }
  return { trees, rocks, scrub };
}
