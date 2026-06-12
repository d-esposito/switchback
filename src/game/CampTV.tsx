// Campsite TVs: a wooden outdoor screen at every camp. Walk up, press E,
// pick a screen/window/tab in the browser's native picker, and you're live
// for everyone at the campsite. One presenter per TV (the Mountain room
// enforces it); viewers pull the video track from the SFU only while they
// are close enough to actually see the thing.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ZONES } from "./config";
import { meshHeightAt } from "./terrain";
import { playerPosRef, tvRef } from "./sharedRefs";
import { net } from "./net";
import { voice } from "./voice";
import { showToast } from "./store";

const VIEW_DIST = 38; // start pulling the stream inside this
const DROP_DIST = 46; // stop pulling outside this (hysteresis)
const INTERACT_DIST = 4.5;
const PRESENT_MAX_DIST = 40; // presenters who wander off go off-air

/** Where each camp's TV stands, facing the campfire. */
function tvSpot(camp: { x: number; z: number }) {
  const x = camp.x - 5;
  const z = camp.z + 3;
  return { x, z, rot: Math.atan2(camp.x - x, camp.z - z) };
}

function makeIdleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 288;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1d2326";
  g.fillRect(0, 0, 512, 288);
  g.strokeStyle = "#3a4449";
  g.lineWidth = 3;
  g.strokeRect(10, 10, 492, 268);
  g.fillStyle = "#e6d9bd";
  g.textAlign = "center";
  g.font = "bold 34px Georgia, serif";
  g.fillText("SWITCHBACK", 256, 120);
  g.fillText("BROADCASTING", 256, 160);
  g.font = "20px Georgia, serif";
  g.fillStyle = "#8fa0a8";
  g.fillText("press E to share your screen", 256, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function OneTV({ campId, camp }: { campId: string; camp: { x: number; z: number } }) {
  const spot = useMemo(() => tvSpot(camp), [camp]);
  const y = useMemo(() => meshHeightAt(spot.x, spot.z), [spot]);
  const idleTex = useMemo(makeIdleTexture, []);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null!);
  const screenMesh = useRef<THREE.Mesh>(null!);
  const glow = useRef<THREE.PointLight>(null!);
  const boundVideo = useRef<HTMLVideoElement | null>(null);
  const videoTex = useRef<THREE.VideoTexture | null>(null);
  const selfPreview = useRef<HTMLVideoElement | null>(null);

  useFrame(() => {
    const p = playerPosRef.current;
    const d = Math.hypot(p.x - spot.x, p.z - spot.z);
    const tv = net.tvs.get(campId) ?? null;
    const mine = tv !== null && tv.key === net.key;

    // viewers: range-gated pull (never pull our own track — preview locally)
    const inView = d < (voice.videoElement(campId) ? DROP_DIST : VIEW_DIST);
    voice.updateTv(campId, mine ? null : tv, inView);

    // choose the video feeding the screen
    let video: HTMLVideoElement | null = null;
    if (mine && voice.screenMediaTrack) {
      if (!selfPreview.current) {
        const el = document.createElement("video");
        el.muted = true;
        el.autoplay = true;
        el.playsInline = true;
        el.srcObject = new MediaStream([voice.screenMediaTrack]);
        void el.play().catch(() => {});
        selfPreview.current = el;
      }
      video = selfPreview.current;
    } else {
      if (selfPreview.current) {
        selfPreview.current.srcObject = null;
        selfPreview.current = null;
      }
      video = voice.videoElement(campId);
    }

    if (video !== boundVideo.current) {
      boundVideo.current = video;
      videoTex.current?.dispose();
      videoTex.current = null;
      if (video) {
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        videoTex.current = tex;
        screenMat.current.map = tex;
      } else {
        screenMat.current.map = idleTex;
      }
      screenMat.current.needsUpdate = true;
    }

    // letterbox-ish: squash the screen to the source aspect (clamped)
    if (video && video.videoWidth > 0 && screenMesh.current) {
      const aspect = video.videoHeight / video.videoWidth;
      screenMesh.current.scale.y = THREE.MathUtils.clamp(aspect / (1.9 / 3.4), 0.8, 1.25);
    } else if (screenMesh.current) {
      screenMesh.current.scale.y = 1;
    }

    // a TV that's on glows a little, so it reads from down the trail
    const live = tv !== null;
    if (glow.current) glow.current.intensity = live ? 1.1 : 0;
  });

  return (
    <group position={[spot.x, y, spot.z]} rotation={[0, spot.rot, 0]}>
      {/* posts */}
      <mesh position={[-1.65, 1.1, -0.1]}>
        <cylinderGeometry args={[0.08, 0.1, 2.2, 6]} />
        <meshStandardMaterial color="#6d5236" flatShading />
      </mesh>
      <mesh position={[1.65, 1.1, -0.1]}>
        <cylinderGeometry args={[0.08, 0.1, 2.2, 6]} />
        <meshStandardMaterial color="#6d5236" flatShading />
      </mesh>
      {/* frame + screen */}
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[3.7, 2.2, 0.12]} />
        <meshStandardMaterial color="#4a3b28" flatShading />
      </mesh>
      <mesh ref={screenMesh} position={[0, 1.55, 0.075]}>
        <planeGeometry args={[3.4, 1.9]} />
        <meshBasicMaterial ref={screenMat} map={idleTex} toneMapped={false} />
      </mesh>
      <pointLight ref={glow} position={[0, 1.6, 1.2]} color="#bcd6e8" intensity={0} distance={9} />
    </group>
  );
}

/** Maintains the E-prompt/action for the nearest TV and the presenter flow. */
function TVController() {
  const presenting = useRef<string | null>(null);

  useEffect(() => {
    net.onTvBusy = (campId) => {
      if (presenting.current === campId) {
        presenting.current = null;
        void voice.stopScreenShare();
        showToast("That channel is busy — someone's already presenting.");
      }
    };
    voice.onScreenEnded = () => {
      if (presenting.current) {
        net.sendTv(presenting.current, false);
        presenting.current = null;
        showToast("Screen share ended.");
      }
    };
    return () => {
      net.onTvBusy = () => {};
      voice.onScreenEnded = () => {};
    };
  }, []);

  useFrame(() => {
    const p = playerPosRef.current;

    // presenter wandered off -> off-air
    if (presenting.current) {
      const zone = ZONES.find((z) => z.id === presenting.current);
      if (zone) {
        const s = tvSpot(zone.camp);
        if (Math.hypot(p.x - s.x, p.z - s.z) > PRESENT_MAX_DIST) {
          const campId = presenting.current;
          presenting.current = null;
          net.sendTv(campId, false);
          void voice.stopScreenShare();
          showToast("You wandered off — the TV goes dark.");
        }
      }
    }

    // nearest TV in interact range owns the E prompt
    let nearest: { campId: string; d: number } | null = null;
    for (const zone of ZONES) {
      const s = tvSpot(zone.camp);
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < INTERACT_DIST && (!nearest || d < nearest.d)) {
        nearest = { campId: zone.id, d };
      }
    }
    if (!nearest) {
      tvRef.current = null;
      return;
    }
    const campId = nearest.campId;
    const tv = net.tvs.get(campId) ?? null;

    if (presenting.current === campId) {
      tvRef.current = {
        campId,
        label: "Press E — stop sharing your screen",
        act: () => {
          presenting.current = null;
          net.sendTv(campId, false);
          void voice.stopScreenShare();
          showToast("Off the air. The campfire approves.");
        },
      };
    } else if (tv) {
      const name = net.roster.get(tv.key)?.name ?? "someone";
      tvRef.current = {
        campId,
        label: `Press E — channel busy (${name} is live)`,
        act: () => showToast(`${name} is presenting — ask them to wrap up.`),
      };
    } else {
      tvRef.current = {
        campId,
        label: "Press E — share your screen on the TV",
        act: () => {
          void (async () => {
            const ok = await voice.startScreenShare();
            if (!ok) {
              showToast("No screen shared — check macOS screen-recording permission for your browser.");
              return;
            }
            const session = voice.session;
            const trackName = voice.screenTrackName;
            if (!session || !trackName) {
              void voice.stopScreenShare();
              showToast("Couldn't reach the broadcast tower — try again.");
              return;
            }
            presenting.current = campId;
            net.sendTv(campId, true, session, trackName);
            showToast("You're live on the campsite TV — E to stop.");
          })();
        },
      };
    }
  });

  return null;
}

export function CampTVs() {
  return (
    <>
      {ZONES.map((zone) => (
        <OneTV key={zone.id} campId={zone.id} camp={zone.camp} />
      ))}
      <TVController />
    </>
  );
}
