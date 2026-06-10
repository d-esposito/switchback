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

  registerOpen: boolean;
  setRegisterOpen: (o: boolean) => void;

  onlineCount: number;
  setOnlineCount: (n: number) => void;

  toast: string | null;
  setToast: (t: string | null) => void;
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
  registerOpen: false,
  setRegisterOpen: (registerOpen) => set({ registerOpen }),
  onlineCount: 1,
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  toast: null,
  setToast: (toast) => set({ toast }),
}));

/** Time of day in [0,1): 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export function timeOfDay(clock: WorldClock | null): number {
  if (!clock) return 0.42; // pleasant late morning before the clock loads
  const t = ((Date.now() - clock.epochMs) % clock.dayLengthMs) / clock.dayLengthMs;
  return t < 0 ? t + 1 : t;
}
