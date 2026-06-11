import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { colorsValidator } from "./schema";

/**
 * Upsert the per-device profile (cold data). Live position now lives in the
 * `presence` table — see presence.ts.
 */
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
    } else {
      await ctx.db.insert("players", { ...args, lastSeen: now });
    }
    return null;
  },
});
