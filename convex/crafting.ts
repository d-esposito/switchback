import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const EMPTY_INV = { sticks: 0, stones: 0, thatch: 0 };
const EMPTY_GEAR = { walkingStick: false, ropes: 0, tents: 0, snowboard: false };
const INV_CAP = 99;

export const RECIPES: Record<string, { sticks?: number; stones?: number; thatch?: number }> = {
  walkingStick: { sticks: 3, stones: 1 },
  rope: { sticks: 1, thatch: 4 },
  tent: { sticks: 5, thatch: 4 },
  snowboard: { sticks: 8, stones: 2 },
};

/** Merge stored gear over defaults so older docs gain new fields (snowboard). */
function normalizeGear(gear: Partial<typeof EMPTY_GEAR> | undefined) {
  return { ...EMPTY_GEAR, ...(gear ?? {}) };
}

const MAX_PLACED = { ropes: 200, tents: 100 };

async function getPlayer(ctx: { db: any }, deviceId: string): Promise<Doc<"players"> | null> {
  return await ctx.db
    .query("players")
    .withIndex("by_deviceId", (q: any) => q.eq("deviceId", deviceId))
    .unique();
}

export const me = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const p = await getPlayer(ctx, deviceId);
    if (!p) return null;
    return {
      inventory: p.inventory ?? EMPTY_INV,
      gear: normalizeGear(p.gear),
    };
  },
});

export const gather = mutation({
  args: {
    deviceId: v.string(),
    kind: v.union(v.literal("sticks"), v.literal("stones"), v.literal("thatch")),
  },
  handler: async (ctx, { deviceId, kind }) => {
    const p = await getPlayer(ctx, deviceId);
    if (!p) return;
    const inv = { ...(p.inventory ?? EMPTY_INV) };
    inv[kind] = Math.min(INV_CAP, inv[kind] + 1);
    await ctx.db.patch(p._id, { inventory: inv });
  },
});

export const craft = mutation({
  args: {
    deviceId: v.string(),
    item: v.union(
      v.literal("walkingStick"),
      v.literal("rope"),
      v.literal("tent"),
      v.literal("snowboard"),
    ),
  },
  handler: async (ctx, { deviceId, item }) => {
    const p = await getPlayer(ctx, deviceId);
    if (!p) return { ok: false, reason: "no player" };
    const inv = { ...(p.inventory ?? EMPTY_INV) };
    const gear = normalizeGear(p.gear);

    if (item === "walkingStick" && gear.walkingStick) {
      return { ok: false, reason: "already carrying one" };
    }
    if (item === "snowboard" && gear.snowboard) {
      return { ok: false, reason: "already have a board" };
    }
    const cost = RECIPES[item];
    for (const [k, n] of Object.entries(cost)) {
      if (inv[k as keyof typeof inv] < n) return { ok: false, reason: "missing materials" };
    }
    for (const [k, n] of Object.entries(cost)) {
      inv[k as keyof typeof inv] -= n;
    }
    if (item === "walkingStick") gear.walkingStick = true;
    if (item === "rope") gear.ropes += 1;
    if (item === "tent") gear.tents += 1;
    if (item === "snowboard") gear.snowboard = true;
    await ctx.db.patch(p._id, { inventory: inv, gear });
    return { ok: true };
  },
});

function placeValidator() {
  return {
    deviceId: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
  };
}

export const placeRope = mutation({
  args: placeValidator(),
  handler: async (ctx, { deviceId, ...pos }) => {
    const p = await getPlayer(ctx, deviceId);
    const gear = { ...(p?.gear ?? EMPTY_GEAR) };
    if (!p || gear.ropes < 1) return false;
    gear.ropes -= 1;
    await ctx.db.patch(p._id, { gear });
    const all = await ctx.db.query("ropes").collect();
    if (all.length >= MAX_PLACED.ropes) {
      const oldest = [...all].sort((a, b) => a.placedAt - b.placedAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("ropes", { ...pos, placedBy: p.name, placedAt: Date.now() });
    return true;
  },
});

export const placeTent = mutation({
  args: placeValidator(),
  handler: async (ctx, { deviceId, ...pos }) => {
    const p = await getPlayer(ctx, deviceId);
    const gear = { ...(p?.gear ?? EMPTY_GEAR) };
    if (!p || gear.tents < 1) return false;
    gear.tents -= 1;
    await ctx.db.patch(p._id, { gear });
    const all = await ctx.db.query("tents").collect();
    if (all.length >= MAX_PLACED.tents) {
      const oldest = [...all].sort((a, b) => a.placedAt - b.placedAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("tents", { ...pos, placedBy: p.name, placedAt: Date.now() });
    return true;
  },
});

export const ropes = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("ropes").collect();
    return all.map((r) => ({ id: r._id, x: r.x, y: r.y, z: r.z, placedBy: r.placedBy }));
  },
});

export const tents = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("tents").collect();
    return all.map((t) => ({ id: t._id, x: t.x, y: t.y, z: t.z, placedBy: t.placedBy }));
  },
});
