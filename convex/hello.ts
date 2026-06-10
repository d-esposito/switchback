import { query, mutation } from "./_generated/server";

export const trailVisits = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "trailVisits"))
      .unique();
    return row?.value ?? 0;
  },
});

export const logVisit = mutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "trailVisits"))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { value: row.value + 1 });
    } else {
      await ctx.db.insert("counters", { name: "trailVisits", value: 1 });
    }
  },
});
