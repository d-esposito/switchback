import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery } from "convex/react";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { api } from "../../convex/_generated/api";
import { Character } from "./Character";
import { useGame, type Colors } from "./store";
import { voiceLevelsRef } from "./sharedRefs";
import { getDeviceId } from "../lib/ids";
import { REMOTE_STALE_MS } from "./config";

interface RemotePlayer {
  deviceId: string;
  name: string;
  colors: Colors;
  hatStyle: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: string;
  lastSeen: number;
}

const NAME_TAG_DIST = 45;

function RemoteHiker({ p }: { p: RemotePlayer }) {
  const group = useRef<THREE.Group>(null!);
  const tag = useRef<THREE.Group>(null!);
  const speakDot = useRef<THREE.Mesh>(null!);
  const speedRef = useRef(0);
  // start at the first reported position so hikers don't slide in from origin
  const current = useRef(new THREE.Vector3(p.x, p.y, p.z));
  const target = useRef(new THREE.Vector3(p.x, p.y, p.z));
  const targetRot = useRef(p.rotY);

  target.current.set(p.x, p.y, p.z);
  targetRot.current = p.rotY;

  useFrame(({ camera }, dt) => {
    const cur = current.current;
    const tgt = target.current;
    // exponential smoothing toward the last server snapshot — at hiking
    // speeds and ~5 Hz updates this reads as smooth, honest movement
    const a = 1 - Math.exp(-dt * 8);
    const before = group.current.position.clone();
    cur.lerp(tgt, a);
    group.current.position.copy(cur);
    speedRef.current = dt > 0 ? before.distanceTo(cur) / dt : 0;

    let dr = targetRot.current - group.current.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    group.current.rotation.y += dr * Math.min(1, dt * 10);

    tag.current.visible = camera.position.distanceTo(cur) < NAME_TAG_DIST;

    // voice indicator: glow + gentle pulse while this hiker is talking
    const level = voiceLevelsRef.current[p.deviceId] ?? 0;
    const speaking = level > 0.035;
    speakDot.current.visible = speaking && tag.current.visible;
    if (speaking) {
      const s = 1 + Math.min(0.8, level * 6);
      speakDot.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={group}>
      <Character colors={p.colors} hatStyle={p.hatStyle} anim={p.anim} speedRef={speedRef} lampGlow />
      <group ref={tag}>
        <Billboard position={[0, 2.05, 0]}>
          <Text
            fontSize={0.19}
            color="#fff8ea"
            outlineWidth={0.014}
            outlineColor="#1f1a12"
            anchorX="center"
          >
            {p.name}
          </Text>
        </Billboard>
        <mesh ref={speakDot} position={[0, 2.32, 0]} visible={false}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshBasicMaterial color="#9fe06a" />
        </mesh>
      </group>
    </group>
  );
}

export function RemotePlayers() {
  const players = useQuery(api.players.list) as RemotePlayer[] | undefined;
  const setOnlineCount = useGame((s) => s.setOnlineCount);
  const self = useMemo(getDeviceId, []);

  const visible = (players ?? []).filter(
    (p) => p.deviceId !== self && Date.now() - p.lastSeen < REMOTE_STALE_MS
  );

  useEffect(() => {
    setOnlineCount(visible.length + 1);
  }, [visible.length, setOnlineCount]);

  return (
    <>
      {visible.map((p) => (
        <RemoteHiker key={p.deviceId} p={p} />
      ))}
    </>
  );
}
