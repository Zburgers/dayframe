import type { DayframeState, SleepSession } from "./types";

export function localDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function minutesBetween(start: string, end: string | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function sleepMinutesForDate(sessions: SleepSession[], date: string): number {
  return sessions
    .filter((session) => session.endedAt && localDateKey(session.endedAt) === date)
    .reduce((total, session) => total + minutesBetween(session.startedAt, session.endedAt), 0);
}

export function dayMetrics(state: DayframeState, date: string) {
  const movement = state.movementDays.find((entry) => entry.date === date);
  const meals = state.meals.filter((meal) => localDateKey(meal.eatenAt) === date);
  return {
    sleepMinutes: sleepMinutesForDate(state.sleepSessions, date),
    steps: movement?.steps ?? 0,
    activeCalories: movement?.activeCalories ?? 0,
    exerciseMinutes: movement?.exerciseMinutes ?? 0,
    activities: movement?.activities ?? [],
    caloriesIn: meals.reduce((sum, meal) => sum + meal.calories, 0),
    protein: meals.reduce((sum, meal) => sum + meal.proteinGrams, 0),
    carbs: meals.reduce((sum, meal) => sum + meal.carbsGrams, 0),
    fat: meals.reduce((sum, meal) => sum + meal.fatGrams, 0),
    meals,
  };
}

export function completeness(state: DayframeState, date: string): number {
  const metrics = dayMetrics(state, date);
  return [metrics.sleepMinutes > 0, metrics.steps > 0 || metrics.activities.length > 0, metrics.meals.length > 0].filter(Boolean).length;
}

export function sevenDayAverage(state: DayframeState, selectedDate: string, metric: "sleep" | "steps" | "calories") {
  const anchor = new Date(`${selectedDate}T12:00:00`);
  let total = 0;
  let recordedDays = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - offset);
    const value = dayMetrics(state, localDateKey(day));
    const amount = metric === "sleep" ? value.sleepMinutes : metric === "steps" ? value.steps : value.caloriesIn;
    if (amount > 0) {
      total += amount;
      recordedDays += 1;
    }
  }
  return recordedDays ? Math.round(total / recordedDays) : 0;
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}
