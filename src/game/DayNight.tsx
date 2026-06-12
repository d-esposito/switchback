import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { useGame, timeOfDay } from "./store";
import { weatherAt } from "./weather";

const SKY_NIGHT = new THREE.Color("#0b1026");
const SKY_DAWN = new THREE.Color("#e8915c");
const SKY_DAY = new THREE.Color("#8ec8e8");
const SKY_STORM_DAY = new THREE.Color("#8e979e");
const SKY_STORM_NIGHT = new THREE.Color("#101318");

const SUN_WARM = new THREE.Color("#ffd9a0");
const SUN_NOON = new THREE.Color("#fff4e0");
const MOON = new THREE.Color("#7888c0");

const skyScratch = new THREE.Color();
const stormScratch = new THREE.Color();

/**
 * Drives the shared sun: sky/fog color, sun + moon directional lights, stars.
 * Time comes from the Convex world clock so every player sees the same sunset.
 */
export function DayNight() {
  const sun = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const stars = useRef<THREE.Group>(null!);
  const scene = useThree((s) => s.scene);
  const clock = useGame((s) => s.clock);

  useFrame(() => {
    const t = timeOfDay(clock);
    const ang = (t - 0.25) * Math.PI * 2; // 0 at sunrise
    const elev = Math.sin(ang); // -1..1, >0 = sun up

    // day factor with a generous twilight band — dusk should glow, not cut to black
    const day = THREE.MathUtils.smoothstep(elev, -0.18, 0.22);
    // dawn/dusk glow strongest when the sun crosses the horizon
    const glow = Math.max(0, 1 - Math.abs(elev) * 4.5) * (0.3 + 0.7 * day);

    const w = weatherAt(clock);
    const gloom = Math.min(1, w.mist * 0.7 + w.rain * 0.75);

    skyScratch.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    skyScratch.lerp(SKY_DAWN, glow * 0.6 * (1 - gloom));
    stormScratch.copy(SKY_STORM_NIGHT).lerp(SKY_STORM_DAY, day);
    skyScratch.lerp(stormScratch, gloom);
    (scene.background as THREE.Color).copy(skyScratch);

    if (scene.fog) {
      scene.fog.color.copy(skyScratch);
      const fog = scene.fog as THREE.Fog;
      const reach = useGame.getState().settings.renderDist; // user slider
      fog.near = reach * 0.2 * (1 - 0.7 * w.mist) * (1 - 0.45 * w.rain);
      fog.far = reach * (1 - 0.68 * w.mist) * (1 - 0.5 * w.rain);
    }

    // keep the sun lighting the world through golden hour, fading out in twilight
    sun.current.position.set(Math.cos(ang) * 300, Math.max(elev, 0.06) * 400, 90);
    sun.current.intensity =
      (THREE.MathUtils.smoothstep(elev, -0.1, 0.3) * 1.5 + 0.03) * (1 - 0.6 * gloom);
    sun.current.color.copy(SUN_WARM).lerp(SUN_NOON, Math.max(0, elev));

    moon.current.position.set(-Math.cos(ang) * 300, Math.max(-elev, 0.1) * 400, -60);
    moon.current.intensity = (1 - day) * 0.26 * (1 - 0.7 * gloom);
    moon.current.color.copy(MOON);

    hemi.current.intensity = (0.17 + day * 0.6) * (1 - 0.35 * gloom);

    stars.current.visible = elev < 0.08 && gloom < 0.4;
  });

  return (
    <>
      <directionalLight ref={sun} />
      <directionalLight ref={moon} />
      <hemisphereLight ref={hemi} args={["#bdd5e8", "#5a6648", 0.6]} />
      <group ref={stars}>
        <Stars radius={420} depth={60} count={2400} factor={5} saturation={0} fade speed={0.6} />
      </group>
    </>
  );
}
