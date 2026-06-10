import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const colorsValidator = v.object({
  skin: v.string(),
  shirt: v.string(),
  pants: v.string(),
  hat: v.string(),
  pack: v.string(),
});

export default defineSchema({
  // kept from the infra-check page; harmless
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // singleton row: shared world clock so every player sees the same sun
  world: defineTable({
    epochMs: v.number(),
    dayLengthMs: v.number(),
  }),

  players: defineTable({
    deviceId: v.string(),
    name: v.string(),
    colors: colorsValidator,
    hatStyle: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    rotY: v.number(),
    anim: v.string(),
    lastSeen: v.number(),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_lastSeen", ["lastSeen"]),

  signatures: defineTable({
    peakId: v.string(),
    deviceId: v.string(),
    name: v.string(),
    signedAt: v.number(),
  })
    .index("by_peak", ["peakId", "signedAt"])
    .index("by_peak_device", ["peakId", "deviceId"]),

  cairns: defineTable({
    x: v.number(),
    y: v.number(),
    z: v.number(),
    builtBy: v.string(),
    builtAt: v.number(),
  }),
});
