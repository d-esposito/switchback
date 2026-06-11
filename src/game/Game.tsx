import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { World } from "./World";
import { DayNight } from "./DayNight";
import { LocalPlayer } from "./LocalPlayer";
import { RemotePlayers } from "./RemotePlayers";
import { Cairns } from "./Cairns";
import { Rain } from "./Rain";
import { ResourceNodes } from "./ResourceNodes";
import { PlacedProps } from "./PlacedProps";
import { Wildlife } from "./Wildlife";
import { AudioController } from "./AudioController";
import { Campfire, FireLookout, SummitRegister, TrailheadSign } from "./Landmarks";
import { PEAKS } from "./config";

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
      {PEAKS.map((peak) => (
        <SummitRegister key={peak.id} peak={peak} />
      ))}
      <TrailheadSign />
      <FireLookout />
      <Cairns />
      <Rain />
      <ResourceNodes />
      <PlacedProps />
      <Wildlife />
      <AudioController />
      <LocalPlayer />
      <RemotePlayers />
    </Canvas>
  );
}
