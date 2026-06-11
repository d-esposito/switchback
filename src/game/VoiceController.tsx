import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { voice } from "./voice";
import { useGame, showToast } from "./store";
import { playerPosRef, voiceLevelsRef } from "./sharedRefs";
import { getPresenceKey } from "../lib/ids";
import { REMOTE_STALE_MS } from "./config";

/** Bridges the WebRTC voice mesh to Convex signaling and game state. */
export function VoiceController() {
  // voice peers are per-tab, matching presence identity
  const presenceKey = useMemo(getPresenceKey, []);
  const players = useQuery(api.presence.list);
  const signals = useQuery(api.voice.forMe, { deviceId: presenceKey });
  const send = useMutation(api.voice.send);
  const consume = useMutation(api.voice.consume);
  const setMicLive = useGame((s) => s.setMicLive);
  const playersRef = useRef(players);
  playersRef.current = players;

  // wire the manager's outbound signaling to Convex
  useEffect(() => {
    voice.setMyId(presenceKey);
    voice.sendSignal = (to, kind, payload) => {
      void send({ to, from: presenceKey, kind, payload });
    };
  }, [presenceKey, send]);

  // apply inbound signals, then delete them
  useEffect(() => {
    if (!signals || signals.length === 0) return;
    (async () => {
      for (const s of [...signals].sort((a, b) => a.sentAt - b.sentAt)) {
        await voice.handleSignal(s.from, s.kind, s.payload);
      }
      await consume({ ids: signals.map((s) => s.id) });
    })();
  }, [signals, consume]);

  // proximity reconciliation + speaking levels + HUD mic state
  useEffect(() => {
    const tick = setInterval(() => {
      const list = (playersRef.current ?? [])
        .filter((p) => p.key !== presenceKey && Date.now() - p.lastSeen < REMOTE_STALE_MS)
        .map((p) => ({ deviceId: p.key, x: p.x, z: p.z }));
      voice.updateProximity(playerPosRef.current, list);
      voiceLevelsRef.current = voice.levels();
      setMicLive(voice.isLive());
    }, 350);
    return () => clearInterval(tick);
  }, [presenceKey, setMicLive]);

  // V = push-to-talk; any gesture also retries blocked audio playback
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      voice.resumePlayback();
      if (e.code !== "KeyV" || e.repeat) return;
      if (!voice.enabled) {
        showToast("Click the mic button (bottom right) to enable voice chat.");
        return;
      }
      voice.setPtt(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV") voice.setPtt(false);
    };
    const gesture = () => voice.resumePlayback();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerdown", gesture);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerdown", gesture);
    };
  }, []);

  return null;
}
