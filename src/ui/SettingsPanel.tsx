import { useGame, type Settings } from "../game/store";

const SLIDERS: {
  key: keyof Settings;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}[] = [
  { key: "renderDist", label: "Render distance", min: 200, max: 1200, step: 20, fmt: (v) => `${v}m` },
  { key: "volMaster", label: "Master volume", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "volAmbience", label: "Ambience (wind · rain · wildlife · fire)", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "volSteps", label: "Footsteps", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "volVoice", label: "Voice chat", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

export function SettingsPanel() {
  const open = useGame((s) => s.settingsOpen);
  const setOpen = useGame((s) => s.setSettingsOpen);
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);

  if (!open) return null;

  return (
    <div className="register-backdrop" onClick={() => setOpen(false)}>
      <div className="register craft settings" onClick={(e) => e.stopPropagation()}>
        <h2>Trail Settings</h2>
        <p className="meta">changes apply immediately · esc to close</p>

        {SLIDERS.map((s) => (
          <div className="setting-row" key={s.key}>
            <div className="setting-head">
              <span>{s.label}</span>
              <strong>{s.fmt(settings[s.key])}</strong>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={settings[s.key]}
              onChange={(e) => setSetting(s.key, Number(e.target.value))}
            />
          </div>
        ))}

        <div className="actions">
          <button className="close-btn" onClick={() => setOpen(false)}>
            Back to the trail
          </button>
        </div>
      </div>
    </div>
  );
}
