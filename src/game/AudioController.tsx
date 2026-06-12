import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audio } from "./audio";
import { useGame, timeOfDay, showToast, uiCaptured } from "./store";
import { weatherAt } from "./weather";
import { playerPosRef, stepRef } from "./sharedRefs";
import { heightAt } from "./terrain";
import { SimplexNoise } from "./noise";
import { ZONES, CAMPFIRE_RADIUS, SEED } from "./config";

const forestNoise = new SimplexNoise(SEED + 5);

/** Bridges game state into the synthesized ambience. Lives inside the Canvas. */
export function AudioController() {
  const lastStep = useRef(0);
  const acc = useRef(0);

  // start the AudioContext on the first user gesture; M toggles mute
  useEffect(() => {
    const start = () => audio.ensure();
    const key = (e: KeyboardEvent) => {
      audio.ensure();
      if (e.code === "KeyM" && !uiCaptured()) {
        const next = !useGame.getState().audioOn;
        useGame.getState().setAudioOn(next);
        audio.setMuted(!next);
        showToast(next ? "Sound on." : "Sound off.");
      }
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useFrame((_, dt) => {
    // footsteps fire exactly on footfall pulses from the controller
    if (stepRef.current !== lastStep.current) {
      lastStep.current = stepRef.current;
      if (useGame.getState().audioOn) audio.footstep(stepRef.surface);
    }

    // ambient layers only need a few updates per second
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;

    const clock = useGame.getState().clock;
    const p = playerPosRef.current;
    const w = weatherAt(clock);
    const elev = Math.sin((timeOfDay(clock) - 0.25) * Math.PI * 2);
    const h = heightAt(p.x, p.z);
    audio.update({
      altitude: Math.min(1, Math.max(0, h / 180)),
      rain: w.rain,
      night: elev < 0 ? 1 : elev < 0.15 ? 1 - elev / 0.15 : 0,
      nearFire: ZONES.some(
        (zn) => Math.hypot(p.x - zn.camp.x, p.z - zn.camp.z) < CAMPFIRE_RADIUS + 2
      ),
      inForest: forestNoise.fbm(p.x * 0.008 + 250, p.z * 0.008 + 250, 3) > 0.02 && h < 58,
      moving: false,
    });
  });

  return null;
}
