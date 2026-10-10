import type { Activity, MovementDay } from "./types";

/** Activity calories/minutes contribute to totals only while the totals are
 * derived from activities. Explicit daily totals and Apple Health imports win.
 */
export function withAddedActivity(
  existing: MovementDay | undefined, date: string, activity: Activity, updatedAt: string,
): MovementDay {
  const activities = existing?.activities ?? [];
  const previousCalories = activities.reduce((sum, value) => sum + value.calories, 0);
  const previousMinutes = activities.reduce((sum, value) => sum + value.minutes, 0);
  const isManual = !existing || existing.source === "manual";
  const activeCalories = !existing || (isManual && existing.activeCalories === previousCalories)
    ? previousCalories + activity.calories
    : existing.activeCalories;
  const exerciseMinutes = !existing || (isManual && existing.exerciseMinutes === previousMinutes)
    ? previousMinutes + activity.minutes
    : existing.exerciseMinutes;
  return {
    date,
    steps: existing?.steps ?? 0,
    activeCalories,
    exerciseMinutes,
    source: existing?.source ?? "manual",
    activities: [...activities, activity],
    updatedAt,
  };
}

export function withRemovedActivity(existing: MovementDay, activityId: string, updatedAt: string): MovementDay {
  const activity = existing.activities.find((item) => item.id === activityId);
  if (!activity) return existing;
  const previousCalories = existing.activities.reduce((sum, value) => sum + value.calories, 0);
  const previousMinutes = existing.activities.reduce((sum, value) => sum + value.minutes, 0);
  const automatic = existing.source === "manual";
  return {
    ...existing,
    activeCalories: automatic && existing.activeCalories === previousCalories
      ? Math.max(0, existing.activeCalories - activity.calories) : existing.activeCalories,
    exerciseMinutes: automatic && existing.exerciseMinutes === previousMinutes
      ? Math.max(0, existing.exerciseMinutes - activity.minutes) : existing.exerciseMinutes,
    activities: existing.activities.filter((item) => item.id !== activityId),
    updatedAt,
  };
}
