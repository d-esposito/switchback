import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGame, showToast } from "../game/store";
import { getDeviceId } from "../lib/ids";

interface Recipe {
  item: "walkingStick" | "rope" | "tent" | "snowboard";
  name: string;
  desc: string;
  cost: { sticks?: number; stones?: number; thatch?: number };
  /** boolean gear you own once (vs. consumable stacks like rope/tent) */
  keep?: boolean;
}

const RECIPES: Recipe[] = [
  {
    item: "walkingStick",
    name: "Walking stick",
    desc: "Scrambles drain 35% less stamina. Keep it forever.",
    cost: { sticks: 3, stones: 1 },
    keep: true,
  },
  {
    item: "rope",
    name: "Rope coil",
    desc: "Press R on a slope to fix a line — every hiker climbs it faster and cheaper.",
    cost: { sticks: 1, thatch: 4 },
  },
  {
    item: "tent",
    name: "Tent",
    desc: "Press T on flat ground — a rest camp with a regen aura, for everyone.",
    cost: { sticks: 5, thatch: 4 },
  },
  {
    item: "snowboard",
    name: "Snowboard",
    desc: "Jump, then press space mid-air to drop in and carve down the slopes. Keep it forever.",
    cost: { sticks: 8, stones: 2 },
    keep: true,
  },
];

const ICONS = { sticks: "🪵", stones: "🪨", thatch: "🌾" } as const;

function costLabel(cost: Recipe["cost"]): string {
  return Object.entries(cost)
    .map(([k, n]) => `${n} ${ICONS[k as keyof typeof ICONS]}`)
    .join("  ");
}

export function CraftPanel() {
  const open = useGame((s) => s.craftOpen);
  const setOpen = useGame((s) => s.setCraftOpen);
  const inventory = useGame((s) => s.inventory);
  const gear = useGame((s) => s.gear);
  const craft = useMutation(api.crafting.craft);

  if (!open) return null;

  const canAfford = (r: Recipe) =>
    Object.entries(r.cost).every(
      ([k, n]) => inventory[k as keyof typeof inventory] >= n
    );

  const doCraft = async (r: Recipe) => {
    const res = await craft({ deviceId: getDeviceId(), item: r.item });
    showToast(res.ok ? `Crafted: ${r.name}.` : `Can't craft — ${res.reason}.`);
  };

  return (
    <div className="register-backdrop" onClick={() => setOpen(false)}>
      <div className="register craft" onClick={(e) => e.stopPropagation()}>
        <h2>Camp Workbench</h2>
        <p className="meta">
          carrying&nbsp; {ICONS.sticks} {inventory.sticks} · {ICONS.stones}{" "}
          {inventory.stones} · {ICONS.thatch} {inventory.thatch}
          {gear.walkingStick && " · 🥾 walking stick"}
          {gear.ropes > 0 && ` · 🧗 rope ×${gear.ropes}`}
          {gear.tents > 0 && ` · ⛺ tent ×${gear.tents}`}
          {gear.snowboard && " · 🏂 snowboard"}
        </p>

        {RECIPES.map((r) => {
          const owned =
            (r.item === "walkingStick" && gear.walkingStick) ||
            (r.item === "snowboard" && gear.snowboard);
          return (
            <div className="recipe" key={r.item}>
              <div className="recipe-text">
                <strong>{r.name}</strong>
                <span>{r.desc}</span>
              </div>
              <button
                className="begin-btn small"
                disabled={owned || !canAfford(r)}
                onClick={() => doCraft(r)}
              >
                {owned ? "owned" : costLabel(r.cost)}
              </button>
            </div>
          );
        })}

        <div className="actions">
          <button className="close-btn" onClick={() => setOpen(false)}>
            Back to the trail
          </button>
        </div>
      </div>
    </div>
  );
}
