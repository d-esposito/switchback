// World
export const WORLD_SIZE = 1200; // meters, square, centered on origin
export const HALF = WORLD_SIZE / 2;
export const PLAY_RADIUS = 575; // soft boundary before the rim mountains
export const SEED = 20260610;
export const WATER_Y = -3.2;

// Landmarks
export const SPAWN = { x: 0, z: 318 };
export const CAMPFIRE = { x: 8, z: 305 };

export interface Peak {
  x: number;
  z: number;
  id: string;
  name: string;
}

export const PEAKS: Peak[] = [
  { x: 0, z: -260, id: "crown-peak", name: "Crown Peak" },
  { x: 185, z: 35, id: "outlook-knob", name: "Outlook Knob" },
];

export const LOOKOUT = { x: -215, z: -55 };

// The trail from the trailhead to the summit (color-stamped into the terrain)
export const TRAIL: [number, number][] = [
  [0, 318],
  [16, 262],
  [-14, 198],
  [12, 122],
  [46, 54],
  [22, -14],
  [-24, -86],
  [-46, -148],
  [-18, -206],
  [0, -260],
];

// Movement
export const WALK_SPEED = 4.3;
export const RUN_SPEED = 7.6;
export const CLIMB_SPEED = 1.5;
export const JUMP_VEL = 7.8;
export const GRAVITY = 22;
export const SCRAMBLE_NY = 0.72; // ground normal.y below this = scramble (slow, drains)
export const BLOCK_NY = 0.6; // below this = climbing territory (or no purchase at 0 stamina)

// Stamina (0-100)
export const STAMINA_RUN_DRAIN = 7;
export const STAMINA_SCRAMBLE_DRAIN = 5;
export const STAMINA_CLIMB_DRAIN = 9;
export const STAMINA_JUMP_COST = 8;
export const STAMINA_REGEN_IDLE = 14;
export const STAMINA_REGEN_WALK = 6;
export const CAMPFIRE_REGEN_MULT = 3;
export const CAMPFIRE_RADIUS = 6;

// Networking (hot path rides the party socket — see net.ts)
export const SEND_MIN_INTERVAL_MS = 80; // ~12.5 Hz while moving

// Voice chat: revived on the party socket. Signaling never touches the
// Convex mutation queue; peers connect only when a side has a live mic.
export const VOICE_ENABLED = true;
