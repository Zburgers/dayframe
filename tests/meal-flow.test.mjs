import assert from "node:assert/strict";
import test from "node:test";
import { isDayframeBackup, localDateTimeValue, parseMealAmount, parseMealItems, suggestedMealTime, suggestedSleepRange } from "../app/lib/validation.ts";
import { dayMetrics } from "../app/lib/metrics.ts";
import { withAddedActivity, withRemovedActivity } from "../app/lib/activity.ts";

const empty = () => ({ version: 1, sleepSessions: [], movementDays: [], meals: [] });

test("meal amounts reject negative, infinite, empty required and out-of-bounds values", () => {
  assert.equal(parseMealAmount("0", 5000, true), 0);
  assert.equal(parseMealAmount("499.94", 5000, true), 499.9);
  assert.equal(parseMealAmount("", 5000), 0);
  assert.equal(parseMealAmount("", 5000, true), null);
  assert.equal(parseMealAmount("-1", 5000, true), null);
  assert.equal(parseMealAmount("Infinity", 5000, true), null);
  assert.equal(parseMealAmount("NaN", 5000, true), null);
  assert.equal(parseMealAmount("5001", 5000, true), null);
  assert.equal(parseMealAmount("200", 5000, true), 200);
});

test("meal item editor sanitizes empty or oversized lists", () => {
  assert.deepEqual(parseMealItems(" Rice, paneer , , yogurt"), ["Rice", "paneer", "yogurt"]);
  assert.deepEqual(parseMealItems(null), []);
  assert.equal(parseMealItems(Array.from({ length: 20 }, (_, i) => "item" + i).join(",")).length, 12);
});

test("meal form defaults to the selected day, not today's day", () => {
  const now = new Date(2026, 9, 11, 16, 35);
  assert.equal(suggestedMealTime("2026-08-04", now), "2026-08-04T16:35");
  assert.equal(localDateTimeValue("nonsense"), "");
  assert.match(localDateTimeValue("2026-10-11T16:35:00.000Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("invalid backups cannot silently erase existing history", () => {
  assert.equal(isDayframeBackup(empty()), true);
  assert.equal(isDayframeBackup({}), false);
  assert.equal(isDayframeBackup({ version: 2, sleepSessions: [], movementDays: [], meals: [] }), false);
  assert.equal(isDayframeBackup({ ...empty(), meals: [{}] }), false);
  assert.equal(isDayframeBackup({ ...empty(), meals: [{ id: "m", name: "Test", eatenAt: "2026-10-11T12:00:00Z", calories: -4, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, source: "manual" }] }), false);
  assert.equal(isDayframeBackup({ ...empty(), meals: [{ id: "m", name: "Lunch", eatenAt: "2026-10-11T12:00:00Z", calories: 450, proteinGrams: 22, carbsGrams: 60, fatGrams: 15, source: "manual" }] }), true);
});

test("daily nutrition totals use meal timestamps instead of another selected day", () => {
  const state = {
    ...empty(),
    meals: [
      { id: "a", name: "Breakfast", eatenAt: "2026-10-10T08:00:00", calories: 300, proteinGrams: 10, carbsGrams: 40, fatGrams: 10, source: "manual" },
      { id: "b", name: "Dinner", eatenAt: "2026-10-10T19:00:00", calories: 450, proteinGrams: 20, carbsGrams: 50, fatGrams: 16, source: "manual" },
      { id: "c", name: "Next day", eatenAt: "2026-10-11T13:00:00", calories: 600, proteinGrams: 30, carbsGrams: 60, fatGrams: 20, source: "manual" },
    ],
  };
  const selected = dayMetrics(state, "2026-10-10");
  assert.equal(selected.meals.length, 2);
  assert.equal(selected.caloriesIn, 750);
  assert.equal(selected.protein, 30);
  assert.equal(selected.carbs, 90);
  assert.equal(selected.fat, 26);
  assert.equal(dayMetrics(state, "2026-10-11").caloriesIn, 600);
});

test("activity-derived calories accumulate, while explicit daily totals stay unchanged", () => {
  const date = "2026-10-11";
  const time = "2026-10-11T10:00:00.000Z";
  const walk = { id: "walk", name: "Walk", minutes: 30, calories: 130 };
  const gym = { id: "gym", name: "Gym", minutes: 45, calories: 220 };
  const first = withAddedActivity(undefined, date, walk, time);
  assert.equal(first.activeCalories, 130);
  assert.equal(first.exerciseMinutes, 30);
  const second = withAddedActivity(first, date, gym, time);
  assert.equal(second.activeCalories, 350);
  assert.equal(second.exerciseMinutes, 75);
  const withoutWalk = withRemovedActivity(second, "walk", time);
  assert.equal(withoutWalk.activeCalories, 220);
  assert.equal(withoutWalk.exerciseMinutes, 45);
  assert.equal(withoutWalk.activities.length, 1);
  const explicit = { ...first, activeCalories: 500, exerciseMinutes: 90 };
  const preserved = withAddedActivity(explicit, date, gym, time);
  assert.equal(preserved.activeCalories, 500);
  assert.equal(preserved.exerciseMinutes, 90);
});

test("Apple Health authoritative totals are never inflated by manually adding activities", () => {
  const date = "2026-10-11";
  const time = "2026-10-11T10:00:00.000Z";
  const health = {
    date, steps: 12000, activeCalories: 500, exerciseMinutes: 60,
    activities: [{ id: "walk", name: "Walk", minutes: 30, calories: 200 }],
    updatedAt: time, source: "apple-health-shortcut",
  };
  const cycling = { id: "cycling", name: "Cycling", minutes: 20, calories: 150 };
  const added = withAddedActivity(health, date, cycling, time);
  assert.equal(added.activeCalories, 500);
  assert.equal(added.exerciseMinutes, 60);
  const removed = withRemovedActivity(added, "cycling", time);
  assert.equal(removed.activeCalories, 500);
  assert.equal(removed.exerciseMinutes, 60);
});

test("overnight sleep defaults end on the selected day and are ordered correctly", () => {
  const range = suggestedSleepRange("2026-10-11");
  assert.equal(range.start, "2026-10-10T23:00");
  assert.equal(range.end, "2026-10-11T07:00");
  assert.ok(Date.parse(range.start) < Date.parse(range.end));
});
