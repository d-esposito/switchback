import { SPAWN } from "./config";
import type { ResourceNode } from "./resources";

/**
 * Mutable per-frame state shared between scene systems without causing React
 * re-renders. LocalPlayer writes; anything may read.
 */
export const playerPosRef = {
  current: { x: SPAWN.x, y: 0, z: SPAWN.z },
};

/** All resource nodes (set once by <Resources/>). */
export const resourceNodesRef = { current: [] as ResourceNode[] };

/** Bumped whenever a node is collected/respawned so <Resources/> rebuilds. */
export const resourceVersionRef = { current: 0 };

/** Placed gear positions, mirrored from Convex queries for frame-loop reads. */
export const ropesRef = { current: [] as { x: number; y: number; z: number }[] };
export const tentsRef = { current: [] as { x: number; y: number; z: number }[] };

/** Step pulse counter — incremented by LocalPlayer on each footfall (audio). */
export const stepRef = { current: 0, surface: "grass" as "grass" | "rock" | "snow" };

/** Live voice activity per remote presence key (0..~1), written by VoiceController. */
export const voiceLevelsRef = { current: {} as Record<string, number> };

/** Set by slash commands (/tp, /yeet); consumed by LocalPlayer next frame. */
export const teleportRef = {
  current: null as { x: number; z: number } | null,
  /** extra upward velocity to apply (for /yeet) */
  launch: 0,
  /** set stamina to full (for /gorp) */
  refill: false,
};

/** The /plane Easter egg: where the summoned plane is parked (local only). */
export const planeRef = {
  parked: null as { x: number; z: number; rot: number } | null,
};
