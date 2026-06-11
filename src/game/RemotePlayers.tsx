import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { Character } from "./Character";
import { useGame } from "./store";
import { net, type RemoteState } from "./net";
import { voiceLevelsRef } from "./sharedRefs";

const NAME_TAG_DIST = 45;
// beyond this, the remote teleported (or our tab was throttled) — snap, don't glide
const SNAP_DIST = 8;

/**
 * One remote hiker. Position/anim arrive over the party socket into
 * net.roster and are read here per-frame — movement never re-renders React.
 */
function RemoteHiker({ initial }: { initial: RemoteState }) {
  const group = useRef<THREE.Group>(null!);
  const tag = useRef<THREE.Group>(null!);
  const speakDot = useRef<THREE.Mesh>(null!);
  const speaking = useRef(false);
  const speedRef = useRef(0);
  const animRef = useRef(initial.anim);
  const current = useRef(new THREE.Vector3(initial.x, initial.y, initial.z));
  const target = useRef(new THREE.Vector3(initial.x, initial.y, initial.z));

  useFrame(({ camera }, dt) => {
    const live = net.roster.get(initial.key);
    if (!live) return; // about to unmount on the next roster bump
    target.current.set(live.x, live.y, live.z);
    animRef.current = live.anim;

    const cur = current.current;
    const tgt = target.current;
    // exponential chase toward the latest snapshot — smooth at 12.5 Hz
    const a = 1 - Math.exp(-dt * 10);
    const before = group.current.position.clone();
    if (cur.distanceTo(tgt) > SNAP_DIST) cur.copy(tgt);
    else cur.lerp(tgt, a);
    group.current.position.copy(cur);
    speedRef.current = dt > 0 ? before.distanceTo(cur) / dt : 0;

    let dr = live.rotY - group.current.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    group.current.rotation.y += dr * Math.min(1, dt * 10);

    tag.current.visible = camera.position.distanceTo(cur) < NAME_TAG_DIST;

    // voice indicator with hysteresis: a single threshold on a speech signal
    // strobes between syllables — turn on high, only turn off well below
    const level = voiceLevelsRef.current[initial.key] ?? 0;
    if (speaking.current) {
      if (level < 0.012) speaking.current = false;
    } else if (level > 0.04) {
      speaking.current = true;
    }
    speakDot.current.visible = speaking.current && tag.current.visible;
    if (speaking.current) {
      speakDot.current.scale.setScalar(1 + Math.min(0.8, level * 6));
    }
  });

  return (
    <group ref={group}>
      <Character
        colors={initial.colors}
        hatStyle={initial.hatStyle}
        anim="idle"
        animRef={animRef}
        speedRef={speedRef}
        lampGlow
      />
      <group ref={tag}>
        <Billboard position={[0, 2.05, 0]}>
          <Text
            fontSize={0.19}
            color="#fff8ea"
            outlineWidth={0.014}
            outlineColor="#1f1a12"
            anchorX="center"
          >
            {initial.name}
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
  // re-renders only when someone joins or leaves, never on movement
  useGame((s) => s.rosterVersion);

  const players = [...net.roster.values()];
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__remotes = players.map((p) => p.key);
  }

  return (
    <>
      {players.map((p) => (
        <RemoteHiker key={p.key} initial={p} />
      ))}
    </>
  );
}
