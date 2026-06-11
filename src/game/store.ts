import { create } from "zustand";

export interface Colors {
  skin: string;
  shirt: string;
  pants: string;
  hat: string;
  pack: string;
}

export interface Profile {
  name: string;
  colors: Colors;
  hatStyle: string; // "none" | "cap" | "beanie"
}

export interface WorldClock {
  epochMs: number;
  dayLengthMs: number;
}

interface GameState {
  profile: Profile | null;
  setProfile: (p: Profile) => void;

  /** Saved position from a previous session, returned by players.join */
  resumeAt: { x: number; y: number; z: number; rotY: number } | null;
  setResumeAt: (p: GameState["resumeAt"]) => void;

  clock: WorldClock | null;
  setClock: (c: WorldClock) => void;

  stamina: number;
  setStamina: (s: number) => void;

  resting: boolean;
  setResting: (r: boolean) => void;

  pointerLocked: boolean;
  setPointerLocked: (l: boolean) => void;

  prompt: string | null;
  setPrompt: (p: string | null) => void;

  /** Peak id whose register panel is open, or null. */
  activePeak: string | null;
  setActivePeak: (id: string | null) => void;

  onlineCount: number;
  setOnlineCount: (n: number) => void;

  toast: string | null;
  setToast: (t: string | null) => void;

  inventory: { sticks: number; stones: number; thatch: number };
  setInventory: (i: GameState["inventory"]) => void;

  gear: { walkingStick: boolean; ropes: number; tents: number };
  setGear: (g: GameState["gear"]) => void;

  craftOpen: boolean;
  setCraftOpen: (o: boolean) => void;

  audioOn: boolean;
  setAudioOn: (a: boolean) => void;

  /** "off" = no mic permission yet, "ptt" = hold V, "open" = always on */
  voiceMode: "off" | "ptt" | "open";
  setVoiceMode: (m: GameState["voiceMode"]) => void;

  /** True while the mic is actually transmitting (V held or open mic). */
  micLive: boolean;
  setMicLive: (l: boolean) => void;

  /** Bumped when a hiker joins/leaves so React remounts the remote list. */
  rosterVersion: number;
  setRosterVersion: (v: number) => void;
}

export const useGame = create<GameState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  resumeAt: null,
  setResumeAt: (resumeAt) => set({ resumeAt }),
  clock: null,
  setClock: (clock) => set({ clock }),
  stamina: 100,
  setStamina: (stamina) => set({ stamina }),
  resting: false,
  setResting: (resting) => set({ resting }),
  pointerLocked: false,
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  prompt: null,
  setPrompt: (prompt) => set({ prompt }),
  activePeak: null,
  setActivePeak: (activePeak) => set({ activePeak }),
  onlineCount: 1,
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  toast: null,
  setToast: (toast) => set({ toast }),
  inventory: { sticks: 0, stones: 0, thatch: 0 },
  setInventory: (inventory) => set({ inventory }),
  gear: { walkingStick: false, ropes: 0, tents: 0 },
  setGear: (gear) => set({ gear }),
  craftOpen: false,
  setCraftOpen: (craftOpen) => set({ craftOpen }),
  audioOn: true,
  setAudioOn: (audioOn) => set({ audioOn }),
  voiceMode: "off",
  setVoiceMode: (voiceMode) => set({ voiceMode }),
  micLive: false,
  setMicLive: (micLive) => set({ micLive }),
  rosterVersion: 0,
  setRosterVersion: (rosterVersion) => set({ rosterVersion }),
}));

/** One toast helper: shows a message and clears it after a few seconds. */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, ms = 3200): void {
  useGame.getState().setToast(message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useGame.getState().setToast(null), ms);
}

/** Time of day in [0,1): 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export function timeOfDay(clock: WorldClock | null): number {
  if (!clock) return 0.42; // pleasant late morning before the clock loads
  const t = ((Date.now() - clock.epochMs) % clock.dayLengthMs) / clock.dayLengthMs;
  return t < 0 ? t + 1 : t;
}
