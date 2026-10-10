import assert from "node:assert/strict";
import test from "node:test";
import { isDayframeBackup, localDateTimeValue, parseMealAmount, suggestedMealTime } from "../app/lib/validation.ts";
import { dayMetrics } from "../app/lib/metrics.ts";
import { POST } from "../app/api/analyze-meal/route.ts";

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

test("meal API rejects requests without an image", async () => {
  const response = await POST(new Request("https://example.test/api/analyze-meal", {
    method: "POST",
    body: new FormData(),
  }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const data = await response.json();
  assert.match(data.error, /photo/i);
});

test("meal API rejects unsupported photos before contacting the vision provider", async () => {
  const form = new FormData();
  form.append("image", new File(["not an image"], "food.txt", { type: "text/plain" }));
  const response = await POST(new Request("https://example.test/api/analyze-meal", { method: "POST", body: form }));
  assert.equal(response.status, 415);
});
