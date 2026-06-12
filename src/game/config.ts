// World
export const WORLD_SIZE = 2000; // meters, square, centered on origin
export const HALF = WORLD_SIZE / 2;
export const PLAY_RADIUS = 880; // soft boundary before the rim mountains
export const SEED = 20260611; // map v2 — the four-camps world
export const MAP_VERSION = 2;
export const WATER_Y = -3.0;

// ---------------------------------------------------------------------------
// Zones: a central hub and one camp per engineering team. Camps are standup
// sites — campfire, tents, signpost — connected to the hub by trails.
// ---------------------------------------------------------------------------

export interface Zone {
  id: string;
  name: string;
  blurb: string;
  /** zone's thematic center (terrain features build around this) */
  x: number;
  z: number;
  /** the campsite/standup spot (also the spawn point) */
  camp: { x: number; z: number };
}

export const HUB: Zone = {
  id: "basecamp",
  name: "Basecamp Junction",
  blurb: "the central trailhead — all paths start here",
  x: 0,
  z: 0,
  camp: { x: 0, z: 10 },
};

export const ZONES: Zone[] = [
  HUB,
  {
    id: "pikas",
    name: "Pika Camp",
    blurb: "an alpine bench below the great summit",
    x: 0,
    z: -620,
    camp: { x: 0, z: -480 },
  },
  {
    id: "dolphins",
    name: "Dolphin Cove",
    blurb: "a calm lagoon with a beach camp",
    x: 620,
    z: 620,
    camp: { x: 480, z: 480 },
  },
  {
    id: "wallabies",
    name: "Wallaby Wash",
    blurb: "red-dirt outback beside a billabong",
    x: -620,
    z: 520,
    camp: { x: -600, z: 430 },
  },
  {
    id: "armadillos",
    name: "Armadillo Mesa",
    blurb: "a flat-topped mesa above striped canyons",
    x: -560,
    z: -380,
    camp: { x: -560, z: -380 },
  },
];

export function zoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export const SPAWN = { x: HUB.camp.x, z: HUB.camp.z };

export interface Peak {
  x: number;
  z: number;
  id: string;
  name: string;
}

export const PEAKS: Peak[] = [
  { x: 0, z: -620, id: "pika-peak", name: "Pika Peak" },
  { x: -430, z: -500, id: "mesa-overlook", name: "Mesa Overlook" },
];

export const LOOKOUT = { x: -700, z: -240 }; // on the second mesa

// Trail network: hub spokes to every camp (color-stamped into the terrain)
export const TRAILS: [number, number][][] = [
  // hub → Pika Camp → last flat ground below the scramble to the wall
  [
    [0, 10],
    [12, -140],
    [-28, -300],
    [0, -480],
    [0, -500],
  ],
  // hub → Dolphin Cove
  [
    [0, 10],
    [140, 140],
    [290, 320],
    [380, 420],
    [480, 480],
  ],
  // hub → Wallaby Wash
  [
    [0, 10],
    [-170, 110],
    [-380, 280],
    [-520, 380],
    [-600, 430],
  ],
  // hub → Armadillo Mesa (last leg rides the access ramp)
  [
    [0, 10],
    [-150, -80],
    [-300, -180],
    [-440, -290],
    [-560, -380],
  ],
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
export const CAMPFIRE_RADIUS = 7;

// Networking (hot path rides the party socket — see net.ts)
export const SEND_MIN_INTERVAL_MS = 80; // ~12.5 Hz while moving
export const REMOTE_STALE_MS = 45_000;

// Voice chat: Cloudflare Realtime SFU via the party worker's /rtc proxy.
export const VOICE_ENABLED = true;
