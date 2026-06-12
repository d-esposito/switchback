import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Character } from "../game/Character";
import { ZONES } from "../game/config";
import type { Colors, Profile } from "../game/store";

const ZONE_EMOJI: Record<string, string> = {
  basecamp: "⛺",
  pikas: "🏔",
  dolphins: "🐬",
  wallabies: "🦘",
  armadillos: "🌵",
};

const SKINS = ["#e8b58c", "#d99a6c", "#b97a4e", "#8d5a38", "#6b4226"];
const SHIRTS = ["#d8542f", "#3e7cb1", "#74a851", "#e8a94e", "#7d5ba6", "#c2484f"];
const PANTS = ["#4a4137", "#2e4053", "#5d6a52", "#7a5c3a", "#3a3a44"];
const HATS = ["#d8542f", "#2e4053", "#e8a94e", "#4d7c3e", "#f1e7cf", "#8d5a38"];
const PACKS = ["#b3552e", "#3e6b48", "#5b71a8", "#c79a3d", "#84504f", "#56707e"];

const PLACEHOLDERS = [
  "Marmot", "Switchback Sam", "Juniper", "Cliff", "Wren", "Moss", "Sierra",
  "Cairn Builder", "Gorp", "Vista", "Bramble", "Talus",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function PreviewHiker({ colors, hatStyle }: { colors: Colors; hatStyle: string }) {
  const spin = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    spin.current.rotation.y += dt * 0.7;
  });
  return (
    <group ref={spin} position={[0, -0.78, 0]}>
      <Character colors={colors} hatStyle={hatStyle} anim="idle" />
      {/* little ground disc */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.08, 9]} />
        <meshStandardMaterial color="#74a851" flatShading />
      </mesh>
    </group>
  );
}

function SwatchRow({
  label, options, value, onPick,
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="swatch-row">
      <label>{label}</label>
      {options.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${value === c ? " active" : ""}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
          aria-label={`${label} ${c}`}
        />
      ))}
    </div>
  );
}

interface LoginScreenProps {
  initial: Profile | null;
  initialZone: string;
  initialMic: boolean;
  joining: boolean;
  onBegin: (p: Profile, zoneId: string, micOn: boolean) => void;
}

export function LoginScreen({ initial, initialZone, initialMic, joining, onBegin }: LoginScreenProps) {
  const placeholder = useMemo(() => pick(PLACEHOLDERS), []);
  const [name, setName] = useState(initial?.name ?? "");
  const [colors, setColors] = useState<Colors>(
    initial?.colors ?? {
      skin: pick(SKINS),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      hat: pick(HATS),
      pack: pick(PACKS),
    }
  );
  const [hatStyle, setHatStyle] = useState(initial?.hatStyle ?? "cap");
  const [zoneId, setZoneId] = useState(initialZone);
  const [micOn, setMicOn] = useState(initialMic);

  const set = (key: keyof Colors) => (c: string) =>
    setColors((prev) => ({ ...prev, [key]: c }));

  const submit = () => {
    const finalName = name.trim() || placeholder;
    onBegin({ name: finalName.slice(0, 24), colors, hatStyle }, zoneId, micOn);
  };

  return (
    <div className="login grain">
      <div className="sun-disc" />
      <div className="ridge far" />
      <div className="ridge mid" />
      <div className="ridge near" />

      <div className="permit">
        <i className="rivet" />
        <i className="rivet" />
        <i className="rivet" />
        <i className="rivet" />

        <div className="permit-preview">
          <div className="canvas-wrap">
            <Canvas camera={{ position: [0, 0.2, 3.9], fov: 32 }} gl={{ alpha: true }}>
              <ambientLight intensity={0.85} />
              <directionalLight position={[2, 3, 2]} intensity={1.6} color="#ffe2b0" />
              <PreviewHiker colors={colors} hatStyle={hatStyle} />
            </Canvas>
          </div>
          <div className="caption">Your hiker · permit photo</div>
        </div>

        <form
          className="permit-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="eyebrow">Wilderness permit · Crown Peak District</p>
          <h1>
            Switch<span>back</span>
          </h1>

          <div className="field">
            <label htmlFor="trailname">Trail name</label>
            <input
              id="trailname"
              value={name}
              placeholder={placeholder}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <SwatchRow label="Skin" options={SKINS} value={colors.skin} onPick={set("skin")} />
          <SwatchRow label="Jacket" options={SHIRTS} value={colors.shirt} onPick={set("shirt")} />
          <SwatchRow label="Pants" options={PANTS} value={colors.pants} onPick={set("pants")} />
          <SwatchRow label="Hat" options={HATS} value={colors.hat} onPick={set("hat")} />
          <SwatchRow label="Pack" options={PACKS} value={colors.pack} onPick={set("pack")} />

          <div className="hat-row" role="group" aria-label="Hat style">
            {["cap", "beanie", "none"].map((h) => (
              <button
                key={h}
                type="button"
                className={`hat-btn${hatStyle === h ? " active" : ""}`}
                onClick={() => setHatStyle(h)}
              >
                {h === "none" ? "no hat" : h}
              </button>
            ))}
          </div>

          <div className="zone-pick" role="group" aria-label="Spawn camp">
            <label>Start at</label>
            <div className="zone-grid">
              {ZONES.map((zn) => (
                <button
                  key={zn.id}
                  type="button"
                  className={`zone-btn${zoneId === zn.id ? " active" : ""}`}
                  title={zn.blurb}
                  onClick={() => setZoneId(zn.id)}
                >
                  <span className="zi">{ZONE_EMOJI[zn.id] ?? "⛺"}</span>
                  {zn.name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`mic-pick${micOn ? " on" : ""}`}
            onClick={() => setMicOn(!micOn)}
            title="You can change this later with the mic button in-game"
          >
            <span>{micOn ? "🎙" : "🔇"}</span>
            {micOn ? "Voice on — hold V to talk to nearby hikers" : "Voice off — join quietly"}
          </button>

          <button className="begin-btn" type="submit" disabled={joining}>
            {joining ? "Checking permit…" : "⛰ Begin the hike"}
          </button>
          <p className="fineprint">
            One shared mountain · everyone you see is a real hiker
          </p>
        </form>
      </div>
    </div>
  );
}
