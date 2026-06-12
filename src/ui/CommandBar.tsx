import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGame, showToast, uiCaptured } from "../game/store";
import { setWeatherOverride } from "../game/weather";
import { net } from "../game/net";
import { playerPosRef, teleportRef } from "../game/sharedRefs";
import { ZONES, zoneById } from "../game/config";

const TIME_PHASES: Record<string, number> = {
  midnight: 0,
  dawn: 0.25,
  sunrise: 0.25,
  morning: 0.35,
  noon: 0.5,
  afternoon: 0.62,
  sunset: 0.72,
  dusk: 0.78,
  night: 0.92,
};

const HELP = [
  "/tp <camp> — teleport (basecamp, pikas, dolphins, wallabies, armadillos)",
  "/time <dawn|noon|sunset|night> — set the shared clock (for everyone!)",
  "/weather <clear|rain|mist|off> — local skies, just for you",
  "/where — where am I?",
  "/who — who's on the mountain",
  "/wave · /yeet · /gorp · /pika",
];

export function CommandBar() {
  const open = useGame((s) => s.commandOpen);
  const setOpen = useGame((s) => s.setCommandOpen);
  const [value, setValue] = useState("/");
  const inputRef = useRef<HTMLInputElement>(null);
  const nudge = useMutation(api.world.nudge);

  // "/" opens the bar (when the game has the keyboard)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "/" && !uiCaptured()) {
        e.preventDefault();
        setValue("/");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [setOpen]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);

  const run = (raw: string) => {
    close();
    const [cmd, ...args] = raw.trim().replace(/^\//, "").split(/\s+/);
    const arg = args.join(" ").toLowerCase();

    switch (cmd.toLowerCase()) {
      case "help":
        showToast(HELP.join("\n"), 9000);
        break;

      case "tp":
      case "teleport": {
        const zone =
          zoneById(arg) ??
          ZONES.find((z) => z.id.startsWith(arg) || z.name.toLowerCase().includes(arg));
        if (!zone) {
          showToast(`Unknown camp "${arg}". Try: ${ZONES.map((z) => z.id).join(", ")}`);
          return;
        }
        teleportRef.current = {
          x: zone.camp.x + (Math.random() - 0.5) * 4,
          z: zone.camp.z + 3,
        };
        showToast(`Whoosh — ${zone.name}.`);
        break;
      }

      case "time": {
        const phase = TIME_PHASES[arg] ?? (Number.isFinite(+arg) ? Math.min(1, Math.max(0, +arg)) : null);
        if (phase === null) {
          showToast("Usage: /time <dawn|noon|sunset|night|0..1>");
          return;
        }
        void nudge({ toPhase: phase });
        showToast(`The sun obeys. (/time changes the sky for everyone)`);
        break;
      }

      case "weather":
        if (arg === "rain") setWeatherOverride({ rain: 0.7, mist: 0.25 });
        else if (arg === "mist") setWeatherOverride({ rain: 0, mist: 0.8 });
        else if (arg === "clear") setWeatherOverride({ rain: 0, mist: 0 });
        else if (arg === "off" || arg === "") setWeatherOverride(null);
        else {
          showToast("Usage: /weather <clear|rain|mist|off>");
          return;
        }
        showToast(arg === "off" ? "Back to real weather." : `Local skies: ${arg}. (just for you)`);
        break;

      case "where": {
        const p = playerPosRef.current;
        let best = ZONES[0];
        let bestD = Infinity;
        for (const z of ZONES) {
          const d = Math.hypot(p.x - z.camp.x, p.z - z.camp.z);
          if (d < bestD) {
            bestD = d;
            best = z;
          }
        }
        showToast(`(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) — ${Math.round(bestD)}m from ${best.name}`);
        break;
      }

      case "who": {
        const names = [...net.roster.values()].map((r) => r.name);
        showToast(
          names.length
            ? `On the mountain: you, ${names.join(", ")}`
            : "Just you and the deer out here."
        );
        break;
      }

      case "wave":
        // reuse the Q-key emote path once the bar has released the keyboard
        setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" })), 50);
        break;

      case "yeet":
        teleportRef.launch = 26;
        showToast("WHEEEE.");
        break;

      case "gorp":
        teleportRef.refill = true;
        showToast("GORP. Energy restored. 🥜");
        break;

      case "pika":
        showToast("EEEEP! 🐹");
        setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" })), 50);
        break;

      default:
        showToast(`Unknown command "/${cmd}" — try /help`);
    }
  };

  return (
    <div className="command-bar">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value.startsWith("/") ? e.target.value : "/" + e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") run(value);
          if (e.key === "Escape") close();
        }}
        onBlur={close}
        spellCheck={false}
        placeholder="/help"
      />
    </div>
  );
}
