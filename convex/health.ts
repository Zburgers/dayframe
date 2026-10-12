import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_RECORDS = 2_000;

const activityValidator = v.object({
  id: v.string(),
  name: v.string(),
  minutes: v.number(),
  calories: v.number(),
});

const sleepSessionValidator = v.object({
  id: v.string(),
  startedAt: v.string(),
  endedAt: v.union(v.string(), v.null()),
  notes: v.optional(v.string()),
});

const movementDayValidator = v.object({
  date: v.string(),
  steps: v.number(),
  activeCalories: v.number(),
  exerciseMinutes: v.number(),
  source: v.union(v.literal("manual"), v.literal("apple-health-shortcut")),
  activities: v.array(activityValidator),
  updatedAt: v.string(),
});

const mealValidator = v.object({
  id: v.string(),
  eatenAt: v.string(),
  name: v.string(),
  calories: v.number(),
  proteinGrams: v.number(),
  carbsGrams: v.number(),
  fatGrams: v.number(),
  source: v.union(v.literal("manual"), v.literal("photo-estimate")),
  confidence: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  items: v.optional(v.array(v.string())),
  note: v.optional(v.string()),
});

const stateValidator = v.object({
  version: v.literal(1),
  sleepSessions: v.array(sleepSessionValidator),
  movementDays: v.array(movementDayValidator),
  meals: v.array(mealValidator),
});

function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  return getAuthUserId(ctx as Parameters<typeof getAuthUserId>[0]);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.round(Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0)) * 10) / 10;
}

function cleanActivity(activity: { id: string; name: string; minutes: number; calories: number }) {
  return {
    id: activity.id.slice(0, 100),
    name: activity.name.trim().slice(0, 100) || "Workout",
    minutes: Math.round(clamp(activity.minutes, 0, 1_440)),
    calories: Math.round(clamp(activity.calories, 0, 5_000)),
  };
}

function cleanState(state: {
  version: 1;
  sleepSessions: Array<{ id: string; startedAt: string; endedAt: string | null; notes?: string }>;
  movementDays: Array<{ date: string; steps: number; activeCalories: number; exerciseMinutes: number; source: "manual" | "apple-health-shortcut"; activities: Array<{ id: string; name: string; minutes: number; calories: number }>; updatedAt: string }>;
  meals: Array<{ id: string; eatenAt: string; name: string; calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number; source: "manual" | "photo-estimate"; confidence?: "low" | "medium" | "high"; items?: string[]; note?: string }>;
  }) {
  return {
    version: 1 as const,
    sleepSessions: state.sleepSessions.slice(0, MAX_RECORDS).map((session) => ({
      id: session.id.slice(0, 100),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      ...(session.notes ? { notes: session.notes.slice(0, 500) } : {}),
    })),
    movementDays: state.movementDays.slice(0, MAX_RECORDS).map((day) => ({
      date: day.date,
      steps: Math.round(clamp(day.steps, 0, 200_000)),
      activeCalories: Math.round(clamp(day.activeCalories, 0, 10_000)),
      exerciseMinutes: Math.round(clamp(day.exerciseMinutes, 0, 1_440)),
      source: day.source,
      activities: day.activities.slice(0, 30).map(cleanActivity),
      updatedAt: day.updatedAt,
    })),
    meals: state.meals.slice(0, MAX_RECORDS).map((meal) => ({
      id: meal.id.slice(0, 100),
      eatenAt: meal.eatenAt,
      name: meal.name.trim().slice(0, 120) || "Meal",
      calories: Math.round(clamp(meal.calories, 0, 5_000)),
      proteinGrams: clamp(meal.proteinGrams, 0, 500),
      carbsGrams: clamp(meal.carbsGrams, 0, 800),
      fatGrams: clamp(meal.fatGrams, 0, 500),
      source: meal.source,
      ...(meal.confidence ? { confidence: meal.confidence } : {}),
      ...(meal.items ? { items: meal.items.slice(0, 12).map((item) => item.slice(0, 100)) } : {}),
      ...(meal.note ? { note: meal.note.slice(0, 500) } : {}),
    })),
  };
}

export const getState = query({
  args: {},
  returns: v.union(stateValidator, v.null()),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (userId === null) return null;

    const [sleepSessions, movementDays, meals] = await Promise.all([
      ctx.db.query("sleepSessions").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(MAX_RECORDS),
      ctx.db.query("movementDays").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(MAX_RECORDS),
      ctx.db.query("meals").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(MAX_RECORDS),
    ]);

    return {
      version: 1 as const,
      sleepSessions: sleepSessions.map((session) => ({ id: session.clientId, startedAt: session.startedAt, endedAt: session.endedAt, ...(session.notes ? { notes: session.notes } : {}) })),
      movementDays: movementDays.map((day) => ({ date: day.date, steps: day.steps, activeCalories: day.activeCalories, exerciseMinutes: day.exerciseMinutes, source: day.source, activities: day.activities, updatedAt: day.updatedAt })),
      meals: meals.map((meal) => ({ id: meal.clientId, eatenAt: meal.eatenAt, name: meal.name, calories: meal.calories, proteinGrams: meal.proteinGrams, carbsGrams: meal.carbsGrams, fatGrams: meal.fatGrams, source: meal.source, ...(meal.confidence ? { confidence: meal.confidence } : {}), ...(meal.items ? { items: meal.items } : {}), ...(meal.note ? { note: meal.note } : {}) })),
    };
  },
});

export const syncState = mutation({
  args: { state: stateValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to save health data.");
    const state = cleanState(args.state);

    const [existingSleep, existingMovement, existingMeals] = await Promise.all([
      ctx.db.query("sleepSessions").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
      ctx.db.query("movementDays").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
      ctx.db.query("meals").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
    ]);

    const incomingSleep = new Set(state.sleepSessions.map((session) => session.id));
    for (const session of existingSleep) if (!incomingSleep.has(session.clientId)) await ctx.db.delete(session._id);
    for (const session of state.sleepSessions) {
      const existing = existingSleep.find((row) => row.clientId === session.id);
      const values = { userId, clientId: session.id, startedAt: session.startedAt, endedAt: session.endedAt, ...(session.notes ? { notes: session.notes } : {}) };
      if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("sleepSessions", values);
    }

    const incomingMovement = new Set(state.movementDays.map((day) => day.date));
    for (const day of existingMovement) if (!incomingMovement.has(day.date)) await ctx.db.delete(day._id);
    for (const day of state.movementDays) {
      const existing = existingMovement.find((row) => row.date === day.date);
      const values = { userId, date: day.date, steps: day.steps, activeCalories: day.activeCalories, exerciseMinutes: day.exerciseMinutes, source: day.source, activities: day.activities, updatedAt: day.updatedAt };
      if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("movementDays", values);
    }

    const incomingMeals = new Set(state.meals.map((meal) => meal.id));
    for (const meal of existingMeals) if (!incomingMeals.has(meal.clientId)) await ctx.db.delete(meal._id);
    for (const meal of state.meals) {
      const existing = existingMeals.find((row) => row.clientId === meal.id);
      const values = { userId, clientId: meal.id, eatenAt: meal.eatenAt, name: meal.name, calories: meal.calories, proteinGrams: meal.proteinGrams, carbsGrams: meal.carbsGrams, fatGrams: meal.fatGrams, source: meal.source, ...(meal.confidence ? { confidence: meal.confidence } : {}), ...(meal.items ? { items: meal.items } : {}), ...(meal.note ? { note: meal.note } : {}) };
      if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("meals", values);
    }
    return null;
  },
});

export const clearState = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to erase health data.");
    const [sleepSessions, movementDays, meals] = await Promise.all([
      ctx.db.query("sleepSessions").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
      ctx.db.query("movementDays").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
      ctx.db.query("meals").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_RECORDS),
    ]);
    for (const row of [...sleepSessions, ...movementDays, ...meals]) await ctx.db.delete(row._id);
    return null;
  },
});
