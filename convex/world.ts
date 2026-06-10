import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DAY_LENGTH_MS = 20 * 60 * 1000; // one in-game day = 20 real minutes

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("world").first();
  },
});

/** Dev tool: jump the shared clock to a phase (0=midnight, 0.5=noon, 0.75=sunset). */
export const nudge = mutation({
  args: { toPhase: v.number() },
  handler: async (ctx, { toPhase }) => {
    const w = await ctx.db.query("world").first();
    if (!w) return;
    await ctx.db.patch(w._id, {
      epochMs: Date.now() - toPhase * w.dayLengthMs,
    });
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("world").first();
    if (existing) return existing;
    const id = await ctx.db.insert("world", {
      epochMs: Date.now() - DAY_LENGTH_MS * 0.3, // start mid-morning, not midnight
      dayLengthMs: DAY_LENGTH_MS,
    });
    return await ctx.db.get(id);
  },
});
