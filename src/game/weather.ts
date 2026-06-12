import { SEED } from "./config";
import { hash2 } from "./noise";
import type { WorldClock } from "./store";

export interface Weather {
  /** 0-1 fog thickness */
  mist: number;
  /** 0-1 rain intensity */
  rain: number;
  label: string;
}

// Weather is a pure function of the shared world clock: every client hashes
// the same time segment to the same sky. No weather rows in the database.
const SEG_MS = 150_000; // 2.5-minute weather segments
const FADE_MS = 30_000; // crossfade between segments

function segWeather(seg: number): { mist: number; rain: number } {
  const v = hash2(seg, 17, SEED);
  if (v < 0.55) return { mist: 0, rain: 0 };
  if (v < 0.78) return { mist: 0.45 + 0.5 * hash2(seg, 31, SEED), rain: 0 };
  return { mist: 0.35, rain: 0.45 + 0.55 * hash2(seg, 47, SEED) };
}

// Local-only override (the /weather command): affects only this client.
let override: { mist?: number; rain?: number } | null = null;
export function setWeatherOverride(o: { mist?: number; rain?: number } | null): void {
  override = o;
}

export function weatherAt(clock: WorldClock | null): Weather {
  let mist = 0;
  let rain = 0;
  if (clock) {
    const t = Date.now() - clock.epochMs;
    const seg = Math.floor(t / SEG_MS);
    const into = t - seg * SEG_MS;
    const cur = segWeather(seg);
    const prev = segWeather(seg - 1);
    const f = Math.min(1, into / FADE_MS);
    mist = prev.mist + (cur.mist - prev.mist) * f;
    rain = prev.rain + (cur.rain - prev.rain) * f;
  }
  if (override) {
    mist = override.mist ?? mist;
    rain = override.rain ?? rain;
  }
  if (import.meta.env.DEV) {
    // automation hook: window.__tbWeather = {mist, rain} forces conditions
    const o = (window as unknown as Record<string, { mist?: number; rain?: number } | undefined>)
      .__tbWeather;
    if (o) {
      mist = o.mist ?? mist;
      rain = o.rain ?? rain;
    }
  }
  const label =
    rain > 0.6 ? "downpour" : rain > 0.05 ? "rain" : mist > 0.3 ? "mist" : "clear";
  return { mist, rain, label };
}
