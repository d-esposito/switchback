import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { colorsValidator } from "./schema";

// Players older than this are considered offline and hidden from the world.
const ACTIVE_WINDOW_MS = 45_000;

export const join = mutation({
  args: {
    deviceId: v.string(),
    name: v.string(),
    colors: colorsValidator,
    hatStyle: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("players")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        colors: args.colors,
        hatStyle: args.hatStyle,
        lastSeen: now,
      });
      // returning the saved position lets the client resume where they left off
      return { x: existing.x, y: existing.y, z: existing.z, rotY: existing.rotY };
    }
    await ctx.db.insert("players", {
      ...args,
      x: 0,
      y: 0,
      z: 0,
      rotY: 0,
      anim: "idle",
      lastSeen: now,
    });
    return null; // fresh hiker — client spawns at the trailhead
  },
});

export const move = mutation({
  args: {
    deviceId: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    rotY: v.number(),
    anim: v.string(),
  },
  handler: async (ctx, { deviceId, ...rest }) => {
    const p = await ctx.db
      .query("players")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .unique();
    if (!p) return;
    await ctx.db.patch(p._id, { ...rest, lastSeen: Date.now() });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const rows = await ctx.db
      .query("players")
      .withIndex("by_lastSeen", (q) => q.gt("lastSeen", cutoff))
      .collect();
    return rows.map((p) => ({
      deviceId: p.deviceId,
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
