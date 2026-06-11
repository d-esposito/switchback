import { useEffect } from "react";
import { voice } from "./voice";
import { net } from "./net";
import { useGame, showToast } from "./store";
import { playerPosRef, voiceLevelsRef } from "./sharedRefs";

/**
 * Bridges the SFU voice manager to the game. The roster (over the party
 * socket) advertises who has a live mic and where their track lives; this
 * controller decides which tracks to pull based on proximity.
 */
export function VoiceController() {
  const setMicLive = useGame((s) => s.setMicLive);

  useEffect(() => {
    voice.setMyId(net.key);
    voice.onMicState = (on, session) => net.sendMic(on, session);
  }, []);

  // proximity reconciliation + speaking levels + HUD mic state
  useEffect(() => {
    const tick = setInterval(() => {
      const list = [...net.roster.values()].map((p) => ({
        deviceId: p.key,
        x: p.x,
        z: p.z,
        mic: p.mic,
        voiceSession: p.voiceSession,
      }));
      voice.updateProximity(playerPosRef.current, list);
      voiceLevelsRef.current = voice.levels();
      setMicLive(voice.isLive());
    }, 200);
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
