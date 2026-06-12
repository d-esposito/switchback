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
import { Campsite, FingerPost, FireLookout, SummitRegister } from "./Landmarks";
import { ParkedPlane } from "./Plane";
import { PEAKS, ZONES } from "./config";

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
      {ZONES.map((zone) => (
        <Campsite key={zone.id} zone={zone} />
      ))}
      <FingerPost />
      <ParkedPlane />
      {PEAKS.map((peak) => (
        <SummitRegister key={peak.id} peak={peak} />
      ))}
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
