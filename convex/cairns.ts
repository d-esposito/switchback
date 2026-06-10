import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const MAX_CAIRNS = 400;

export const build = mutation({
  args: {
    x: v.number(),
    y: v.number(),
    z: v.number(),
    builtBy: v.string(),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("cairns").collect();
    // keep the world tidy: oldest cairns crumble once we hit the cap
    if (all.length >= MAX_CAIRNS) {
      const oldest = [...all].sort((a, b) => a.builtAt - b.builtAt)[0];
      await ctx.db.delete(oldest._id);
    }
    await ctx.db.insert("cairns", { ...args, builtAt: Date.now() });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("cairns").collect();
    return all.map((c) => ({
      id: c._id,
      x: c.x,
      y: c.y,
      z: c.z,
      builtBy: c.builtBy,
    }));
  },
});
