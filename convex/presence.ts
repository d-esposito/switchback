import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { colorsValidator } from "./schema";

const ACTIVE_WINDOW_MS = 45_000;
const GC_AFTER_MS = 10 * 60_000;

export const join = mutation({
  args: {
    key: v.string(),
    deviceId: v.string(),
    name: v.string(),
    colors: colorsValidator,
    hatStyle: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // opportunistic GC of long-dead presence rows
    const dead = await ctx.db
      .query("presence")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", now - GC_AFTER_MS))
      .take(20);
    for (const d of dead) await ctx.db.delete(d._id);

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        colors: args.colors,
        hatStyle: args.hatStyle,
        lastSeen: now,
      });
      return {
        id: existing._id,
        resume: { x: existing.x, y: existing.y, z: existing.z, rotY: existing.rotY },
      };
    }
    const id = await ctx.db.insert("presence", {
      ...args,
      x: 0,
      y: 0,
      z: 0,
      rotY: 0,
      anim: "idle",
      lastSeen: now,
    });
    return { id, resume: null };
  },
});

export const move = mutation({
  args: {
    id: v.id("presence"),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    rotY: v.number(),
    anim: v.string(),
  },
  handler: async (ctx, { id, ...rest }) => {
    // direct patch by id — no index lookup on the hot path
    const row = await ctx.db.get(id);
    if (!row) return; // GC'd after a long sleep; client will re-join
    await ctx.db.patch(id, { ...rest, lastSeen: Date.now() });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_lastSeen", (q) => q.gt("lastSeen", cutoff))
      .collect();
    return rows.map((p) => ({
      key: p.key,
      name: p.name,
      colors: p.colors,
      hatStyle: p.hatStyle,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      anim: p.anim,
      lastSeen: p.lastSeen,
    }));
  },
});
