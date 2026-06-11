import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { LoginScreen } from "./ui/LoginScreen";
import { HUD } from "./ui/HUD";
import { RegisterPanel } from "./ui/RegisterPanel";
import { CraftPanel } from "./ui/CraftPanel";
import { VoiceController } from "./game/VoiceController";
import { Game } from "./game/Game";
import { useGame, type Profile } from "./game/store";
import { getDeviceId } from "./lib/ids";

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

  const begin = async (profile: Profile) => {
    setJoining(true);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setProfile(profile);
      const [resume] = await Promise.all([
        join({ deviceId: getDeviceId(), ...profile }),
        ensureWorld(),
      ]);
      setResumeAt(resume);
      setStage("game");
    } finally {
      setJoining(false);
    }
  };

  if (stage === "login") {
    return <LoginScreen initial={saved} joining={joining} onBegin={begin} />;
  }

  return (
    <>
      <Game />
      <HUD />
      <RegisterPanel />
      <CraftPanel />
      <PlayerData />
      <VoiceController />
    </>
  );
}
