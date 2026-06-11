import { useEffect } from "react";
import { voice } from "./voice";
import { net } from "./net";
import { useGame, showToast } from "./store";
import { playerPosRef, voiceLevelsRef } from "./sharedRefs";

/**
 * Bridges the WebRTC voice mesh to the party socket. Signaling rides the
 * same WebSocket as position sync — it never touches the Convex mutation
 * queue — and peers only form when at least one side has a live mic.
 */
export function VoiceController() {
  const setMicLive = useGame((s) => s.setMicLive);

  // wire the manager to the socket
  useEffect(() => {
    voice.setMyId(net.key);
    voice.sendSignal = (to, kind, payload) => net.sendSignal(to, kind, payload);
    voice.onMicState = (on) => net.sendMic(on);
    net.onSignal = (from, kind, payload) => void voice.handleSignal(from, kind, payload);
    return () => {
      net.onSignal = () => {};
    };
  }, []);

  // proximity reconciliation + speaking levels + HUD mic state
  useEffect(() => {
    const tick = setInterval(() => {
      const list = [...net.roster.values()].map((p) => ({
        deviceId: p.key,
        x: p.x,
        z: p.z,
        mic: p.mic,
      }));
      voice.updateProximity(playerPosRef.current, list);
      voiceLevelsRef.current = voice.levels();
      setMicLive(voice.isLive());
    }, 350);
    return () => clearInterval(tick);
  }, [setMicLive]);

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
