import { useEffect, useState } from "react";
import { useGame, timeOfDay, showToast } from "../game/store";
import { weatherAt } from "../game/weather";
import { voice } from "../game/voice";
import { VOICE_ENABLED } from "../game/config";

function phaseLabel(t: number): string {
  if (t < 0.21 || t >= 0.83) return "starlight";
  if (t < 0.29) return "sunrise";
  if (t < 0.45) return "morning";
  if (t < 0.55) return "high noon";
  if (t < 0.69) return "afternoon";
  if (t < 0.77) return "golden hour";
  return "dusk";
}

function DayClock() {
  const clock = useGame((s) => s.clock);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const t = timeOfDay(clock);
  const ang = (t - 0.25) * Math.PI * 2;
  const sunX = Math.cos(ang) * 12;
  const sunY = -Math.sin(ang) * 12;
  const isDay = Math.sin(ang) > -0.08;
  const w = weatherAt(clock);

  return (
    <div className="dayclock">
      <div className="disc">
        <span
          className="orbiter"
          style={{
            transform: `translate(${isDay ? sunX : -sunX}px, ${isDay ? sunY : sunY - 24}px)`,
            background: isDay ? "#ffd76a" : "#dfe6f5",
            boxShadow: isDay ? "0 0 8px 2px rgba(255, 205, 90, 0.8)" : "0 0 6px 1px rgba(210, 220, 250, 0.7)",
          }}
        />
      </div>
      <span className="label">
        {phaseLabel(t)}
        {w.label !== "clear" && ` · ${w.label}`}
      </span>
    </div>
  );
}

function StaminaDial() {
  const stamina = useGame((s) => s.stamina);
  const r = 38;
  const circ = 2 * Math.PI * r;
  return (
    <div className={`stamina${stamina < 25 ? " low" : ""}`}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle className="track" cx="46" cy="46" r={r} fill="none" strokeWidth="7" />
        <circle
          className="fill"
          cx="46"
          cy="46"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - stamina / 100)}
        />
      </svg>
      <div className="center-label">
        <span>
          <b>{Math.round(stamina)}</b>
          energy
        </span>
      </div>
    </div>
  );
}

function InventoryStrip() {
  const inv = useGame((s) => s.inventory);
  const gear = useGame((s) => s.gear);
  const items: string[] = [];
  if (inv.sticks) items.push(`🪵 ${inv.sticks}`);
  if (inv.stones) items.push(`🪨 ${inv.stones}`);
  if (inv.thatch) items.push(`🌾 ${inv.thatch}`);
  if (gear.walkingStick) items.push("🥾 stick");
  if (gear.ropes) items.push(`🧗 ×${gear.ropes}`);
  if (gear.tents) items.push(`⛺ ×${gear.tents}`);
  if (items.length === 0) return null;
  return (
    <div className="inv-strip">
      {items.map((it) => (
        <span key={it}>{it}</span>
      ))}
    </div>
  );
}

function MicButton() {
  const mode = useGame((s) => s.voiceMode);
  const setMode = useGame((s) => s.setVoiceMode);
  const live = useGame((s) => s.micLive);

  const click = async () => {
    if (mode === "off") {
      const ok = await voice.enable();
      if (!ok) {
        showToast("Microphone unavailable — check browser permissions.");
        return;
      }
      voice.setOpenMic(false);
      setMode("ptt");
      showToast("Voice ready — hold V to talk. Click again for open mic.");
    } else if (mode === "ptt") {
      voice.setOpenMic(true);
      setMode("open");
      showToast("Open mic — nearby hikers can hear you.");
    } else {
      voice.setOpenMic(false);
      setMode("ptt");
      showToast("Back to push-to-talk (hold V).");
    }
  };

  return (
    <button
      className={`mic-btn ${mode}${live ? " live" : ""}`}
      onClick={click}
      title={
        mode === "off"
          ? "Enable proximity voice chat"
          : mode === "ptt"
            ? "Push-to-talk (hold V) — click for open mic"
            : "Open mic — click for push-to-talk"
      }
    >
      {mode === "off" ? "🎙 ✕" : mode === "ptt" ? "🎙 V" : "🎙 ∞"}
    </button>
  );
}

export function HUD() {
  const onlineCount = useGame((s) => s.onlineCount);
  const resting = useGame((s) => s.resting);
  const prompt = useGame((s) => s.prompt);
  const toast = useGame((s) => s.toast);
  const pointerLocked = useGame((s) => s.pointerLocked);
  const registerOpen = useGame((s) => s.activePeak !== null);
  const [controlsFaded, setControlsFaded] = useState(false);

  useEffect(() => {
    const fade = () => setControlsFaded(true);
    const id = setTimeout(fade, 14000);
    window.addEventListener("keydown", armFade);
    function armFade(e: KeyboardEvent) {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        setTimeout(fade, 6000);
        window.removeEventListener("keydown", armFade);
      }
    }
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", armFade);
    };
  }, []);

  return (
    <div className="hud">
      <div className="plaque">
        <div className="title">⛰ Switchback</div>
        <div className="sub">
          <b>{onlineCount}</b> hiker{onlineCount === 1 ? "" : "s"} on the mountain
        </div>
      </div>

      <DayClock />
      <StaminaDial />
      <InventoryStrip />
      {VOICE_ENABLED && <MicButton />}

      {resting && <div className="resting-chip">🔥 resting by the fire — energy ×3</div>}
      {prompt && (
        <div className="prompt">
          <kbd>{(prompt.match(/^Press (\S+) — /) ?? [])[1] ?? "E"}</kbd>{" "}
          {prompt.replace(/^Press \S+ — /, "")}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {!pointerLocked && !registerOpen && (
        <div className="look-hint">click to look around · esc to release the mouse</div>
      )}

      <div className={`controls${controlsFaded ? " faded" : ""}`}>
        <div className="head">Field guide</div>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> hike · steep rock climbs slowly</div>
        <div><kbd>shift</kbd> run · <kbd>space</kbd> hop · <kbd>Q</kbd> wave</div>
        <div><kbd>E</kbd> interact · <kbd>B</kbd> cairn · <kbd>C</kbd> craft</div>
        <div><kbd>R</kbd> fix rope · <kbd>T</kbd> pitch tent · <kbd>M</kbd> sound</div>
        <div><kbd>space</kbd> again mid-air — 🏂 drop in (craft a board first)</div>
        {VOICE_ENABLED && <div><kbd>V</kbd> hold to talk to nearby hikers</div>}
        <div><kbd>/</kbd> commands (try /help or /tp) · <kbd>esc</kbd> settings</div>
      </div>
    </div>
  );
}
