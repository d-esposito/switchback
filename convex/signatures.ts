import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const sign = mutation({
  args: {
    peakId: v.string(),
    deviceId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const dup = await ctx.db
      .query("signatures")
      .withIndex("by_peak_device", (q) =>
        q.eq("peakId", args.peakId).eq("deviceId", args.deviceId)
      )
      .unique();
    if (dup) return false;
    await ctx.db.insert("signatures", { ...args, signedAt: Date.now() });
    return true;
  },
});

export const list = query({
  args: { peakId: v.string() },
  handler: async (ctx, { peakId }) => {
    const all = await ctx.db
      .query("signatures")
      .withIndex("by_peak", (q) => q.eq("peakId", peakId))
      .collect();
    const recent = [...all]
      .sort((a, b) => b.signedAt - a.signedAt)
      .slice(0, 30)
      .map((r) => ({ name: r.name, signedAt: r.signedAt }));
    return { count: all.length, recent };
  },
});
