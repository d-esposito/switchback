import { SimplexNoise, hash2 } from "./noise";
import { SEED, ZONES } from "./config";
import { heightAt, normalAt, trailDist, masks } from "./terrain";

export type ResourceKind = "sticks" | "stones" | "thatch";

export interface ResourceNode {
  id: number;
  kind: ResourceKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}

const RESPAWN_MS = 180_000;

const noise = new SimplexNoise(SEED + 5);

/** Deterministic gatherable nodes: sticks in forest, stones on rock, thatch in meadow. */
export function scatterResources(): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  let id = 0;
  const step = 15;
  for (let gx = -820; gx <= 820; gx += step) {
    for (let gz = -820; gz <= 820; gz += step) {
      const jx = gx + hash2(gx, gz, SEED + 9) * step;
      const jz = gz + hash2(gx + 3, gz + 7, SEED + 9) * step;
      const h = heightAt(jx, jz);
      const nY = normalAt(jx, jz).y;
      const m = masks(jx, jz);
      const roll = hash2(jx, jz, SEED + 13);
      const forestMask = noise.fbm(jx * 0.006 + 250, jz * 0.006 + 250, 3);
      if (trailDist(jx, jz) < 3) continue;
      if (ZONES.some((zn) => Math.hypot(jx - zn.camp.x, jz - zn.camp.z) < 12)) continue;

      let kind: ResourceKind | null = null;
      const dry = Math.max(m.desert, m.mesa * 0.8);
      if (h > 4 && h < 68 && nY > 0.74 && forestMask > 0.04 && dry < 0.3 && roll > 0.82) {
        kind = "sticks";
      } else if (
        ((h > 25 && h < 130 && nY < 0.8) || m.mesa > 0.4) &&
        roll > 0.86
      ) {
        kind = "stones";
      } else if (
        // meadow grass near the hub/cove, spinifex tufts across the outback
        ((h > 2 && h < 14 && nY > 0.85) || m.desert > 0.45) &&
        h > 0 && roll > 0.8
      ) {
        kind = "thatch";
      }
      if (kind) {
        nodes.push({
          id: id++,
          kind,
          x: jx,
          y: h,
          z: jz,
          rot: roll * Math.PI * 2,
          scale: 0.8 + roll * 0.5,
        });
      }
    }
  }
  return nodes;
}

// Collected state is local (per client) with timed respawn — resources are
// personal pickups, not shared world state, to keep the database light.
const collected = new Map<number, number>();

export function isAvailable(node: ResourceNode): boolean {
  const at = collected.get(node.id);
  if (at === undefined) return true;
  if (Date.now() - at > RESPAWN_MS) {
    collected.delete(node.id);
    return true;
  }
  return false;
}

export function collect(node: ResourceNode): void {
  collected.set(node.id, Date.now());
}
