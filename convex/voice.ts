import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const STALE_MS = 120_000;

export const send = mutation({
  args: {
    to: v.string(),
    from: v.string(),
    kind: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("rtcSignals", { ...args, sentAt: Date.now() });
    // opportunistic GC of signals nobody consumed (peer left mid-handshake)
    const stale = await ctx.db
      .query("rtcSignals")
      .withIndex("by_sentAt", (q) => q.lt("sentAt", Date.now() - STALE_MS))
      .take(25);
    for (const s of stale) await ctx.db.delete(s._id);
  },
});

export const forMe = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const rows = await ctx.db
      .query("rtcSignals")
      .withIndex("by_to", (q) => q.eq("to", deviceId))
      .collect();
    return rows.map((r) => ({
      id: r._id,
      from: r.from,
      kind: r.kind,
      payload: r.payload,
      sentAt: r.sentAt,
    }));
  },
});

export const consume = mutation({
  args: { ids: v.array(v.id("rtcSignals")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.delete(id);
    }
  },
});
