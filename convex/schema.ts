import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const activity = v.object({
  id: v.string(),
  name: v.string(),
  minutes: v.number(),
  calories: v.number(),
});

const confidence = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

const schema = defineSchema({
  ...authTables,
  sleepSessions: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    startedAt: v.string(),
    endedAt: v.union(v.string(), v.null()),
    notes: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  movementDays: defineTable({
    userId: v.id("users"),
    date: v.string(),
    steps: v.number(),
    activeCalories: v.number(),
    exerciseMinutes: v.number(),
    source: v.union(v.literal("manual"), v.literal("apple-health-shortcut")),
    activities: v.array(activity),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_date", ["userId", "date"]),
  meals: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    eatenAt: v.string(),
    name: v.string(),
    calories: v.number(),
    proteinGrams: v.number(),
    carbsGrams: v.number(),
    fatGrams: v.number(),
    source: v.union(v.literal("manual"), v.literal("photo-estimate")),
    confidence: v.optional(confidence),
    items: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_eatenAt", ["userId", "eatenAt"]),
  modelSettings: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("openai"), v.literal("openrouter")),
    model: v.string(),
    openRouterKeyCiphertext: v.optional(v.string()),
    openRouterKeyLast4: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});

export default schema;
