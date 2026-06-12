import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Convex provides process.env at runtime; declare it for the typechecker
declare const process: { env: Record<string, string | undefined> };

/**
 * Wipes world-placement data (used when the map itself changes). Profiles,
 * inventory and the world clock survive. Guarded by ADMIN_KEY so only the
 * operator can run it: `npx convex run admin:wipeMap '{"key":"..."}' [--prod]`
 */
export const wipeMap = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
      throw new Error("not authorized");
    }
    const tables = ["cairns", "ropes", "tents", "signatures", "presence", "rtcSignals"] as const;
    const deleted: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) await ctx.db.delete(r._id);
      deleted[t] = rows.length;
    }
    return deleted;
  },
});
