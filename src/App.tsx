import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { LoginScreen } from "./ui/LoginScreen";
import { HUD } from "./ui/HUD";
import { RegisterPanel } from "./ui/RegisterPanel";
import { CraftPanel } from "./ui/CraftPanel";
import { VoiceController } from "./game/VoiceController";
import { Game } from "./game/Game";
import { CommandBar } from "./ui/CommandBar";
import { useGame, showToast, type Profile } from "./game/store";
import { net } from "./game/net";
import { voice } from "./game/voice";
import { VOICE_ENABLED, HUB, zoneById } from "./game/config";
import { getDeviceId } from "./lib/ids";

const ZONE_KEY = "switchback:spawnZone";
const MIC_KEY = "switchback:micPref";

/** Mirrors the player's server-side inventory/gear into the UI store. */
function PlayerData() {
  const me = useQuery(api.crafting.me, { deviceId: getDeviceId() });
  const setInventory = useGame((s) => s.setInventory);
  const setGear = useGame((s) => s.setGear);
  useEffect(() => {
    if (me) {
      setInventory(me.inventory);
      setGear(me.gear);
    }
  }, [me, setInventory, setGear]);
  return null;
}

const PROFILE_KEY = "switchback:profile";
const LEGACY_PROFILE_KEY = "trailbound:profile";

function loadProfile(): Profile | null {
  try {
    const raw =
      localStorage.getItem(PROFILE_KEY) ?? localStorage.getItem(LEGACY_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [stage, setStage] = useState<"login" | "game">("login");
  const [joining, setJoining] = useState(false);
  const [saved] = useState(loadProfile);

  const join = useMutation(api.players.join);
  const ensureWorld = useMutation(api.world.ensure);
  const world = useQuery(api.world.get);

  const setProfile = useGame((s) => s.setProfile);
  const setResumeAt = useGame((s) => s.setResumeAt);
  const setClock = useGame((s) => s.setClock);

  // keep the shared world clock in the store
  useEffect(() => {
    if (world) setClock({ epochMs: world.epochMs, dayLengthMs: world.dayLengthMs });
  }, [world, setClock]);

  const begin = async (profile: Profile, zoneId: string, micOn: boolean) => {
    setJoining(true);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      localStorage.setItem(ZONE_KEY, zoneId);
      localStorage.setItem(MIC_KEY, micOn ? "1" : "0");
      setProfile(profile);

      // spawn at the chosen camp, slightly scattered so arrivals don't stack
      const zone = zoneById(zoneId) ?? HUB;
      const spawn = {
        x: zone.camp.x + (Math.random() - 0.5) * 5,
        y: 0,
        z: zone.camp.z + 3 + Math.random() * 3,
      };

      // mic permission up front, while we're still a click away from the prompt
      if (micOn && VOICE_ENABLED) {
        const ok = await voice.enable();
        if (ok) {
          useGame.getState().setVoiceMode("ptt");
        } else {
          showToast("Mic unavailable — joining quietly. The mic button can retry.");
        }
      }

      // Convex keeps the durable profile; the party room carries live presence
      net.connect(profile, spawn);
      await Promise.all([join({ deviceId: getDeviceId(), ...profile }), ensureWorld()]);
      setResumeAt({ ...spawn, rotY: Math.PI });
      setStage("game");
    } finally {
      setJoining(false);
    }
  };

  if (stage === "login") {
    return (
      <LoginScreen
        initial={saved}
        initialZone={localStorage.getItem(ZONE_KEY) ?? HUB.id}
        initialMic={localStorage.getItem(MIC_KEY) === "1"}
        joining={joining}
        onBegin={begin}
      />
    );
  }

  return (
    <>
      <Game />
      <HUD />
      <RegisterPanel />
      <CraftPanel />
      <CommandBar />
      <PlayerData />
      {VOICE_ENABLED && <VoiceController />}
    </>
  );
}
