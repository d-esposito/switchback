import { SPAWN } from "./config";

/**
 * Mutable per-frame state shared between scene systems without causing React
 * re-renders. LocalPlayer writes; anything may read.
 */
export const playerPosRef = {
  current: { x: SPAWN.x, y: 0, z: SPAWN.z },
};
