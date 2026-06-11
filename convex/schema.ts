import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const colorsValidator = v.object({
  skin: v.string(),
  shirt: v.string(),
  pants: v.string(),
  hat: v.string(),
  pack: v.string(),
});

export const inventoryValidator = v.object({
  sticks: v.number(),
  stones: v.number(),
  thatch: v.number(),
});

export const gearValidator = v.object({
  walkingStick: v.boolean(),
  ropes: v.number(),
  tents: v.number(),
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
    inventory: v.optional(inventoryValidator),
    gear: v.optional(gearValidator),
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

  // player-placed gear, visible to (and usable by) everyone
  ropes: defineTable({
    x: v.number(),
    y: v.number(),
    z: v.number(),
    placedBy: v.string(),
    placedAt: v.number(),
  }),

  tents: defineTable({
    x: v.number(),
    y: v.number(),
    z: v.number(),
    placedBy: v.string(),
    placedAt: v.number(),
  }),

  // WebRTC signaling for proximity voice chat. Rows are short-lived:
  // recipients delete them after applying; sends garbage-collect stale ones.
  rtcSignals: defineTable({
    to: v.string(), // deviceId
    from: v.string(),
    kind: v.string(), // "offer" | "answer" | "ice"
    payload: v.string(), // JSON-encoded SDP or ICE candidate
    sentAt: v.number(),
  })
    .index("by_to", ["to", "sentAt"])
    .index("by_sentAt", ["sentAt"]),
});
