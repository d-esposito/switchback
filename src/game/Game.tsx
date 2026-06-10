import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { World } from "./World";
import { DayNight } from "./DayNight";
import { LocalPlayer } from "./LocalPlayer";
import { RemotePlayers } from "./RemotePlayers";
import { Cairns } from "./Cairns";
import { Campfire, SummitRegister, TrailheadSign } from "./Landmarks";

export function Game() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 60, near: 0.1, far: 1500 }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color("#8ec8e8");
        scene.fog = new THREE.Fog("#8ec8e8", 90, 460);
      }}
      style={{ position: "fixed", inset: 0 }}
    >
      <DayNight />
      <World />
      <Campfire />
      <SummitRegister />
      <TrailheadSign />
      <Cairns />
      <LocalPlayer />
      <RemotePlayers />
    </Canvas>
  );
}
