/** Validate nutrition inputs before persisting or aggregating them. */
export function parseMealAmount(value: FormDataEntryValue | null, maximum: number, required = false): number | null {
  if (typeof value !== "string" || !value.trim()) return required ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) return null;
  return Math.round(parsed * 10) / 10;
}

export function localDateTimeValue(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function suggestedMealTime(dateKey: string, now: Date = new Date()): string {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${dateKey}T${hours}:${minutes}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validActivity(value: unknown): boolean {
  return record(value) && typeof value.id === "string" &&
    typeof value.name === "string" && nonnegative(value.minutes) && nonnegative(value.calories);
}

function validMovement(value: unknown): boolean {
  return record(value) && typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    nonnegative(value.steps) && nonnegative(value.activeCalories) &&
    nonnegative(value.exerciseMinutes) &&
    (value.source === "manual" || value.source === "apple-health-shortcut") &&
    timestamp(value.updatedAt) &&
    Array.isArray(value.activities) && value.activities.every(validActivity);
}

function validSleep(value: unknown): boolean {
  return record(value) && typeof value.id === "string" &&
    timestamp(value.startedAt) &&
    (value.endedAt === null || timestamp(value.endedAt));
}

function validMeal(value: unknown): boolean {
  return record(value) && typeof value.id === "string" &&
    timestamp(value.eatenAt) && typeof value.name === "string" &&
    nonnegative(value.calories) && value.calories <= 5000 &&
    nonnegative(value.proteinGrams) && value.proteinGrams <= 500 &&
    nonnegative(value.carbsGrams) && value.carbsGrams <= 800 &&
    nonnegative(value.fatGrams) && value.fatGrams <= 500 &&
    (value.source === "manual" || value.source === "photo-estimate") &&
    (value.items === undefined || (Array.isArray(value.items) && value.items.every((x) => typeof x === "string")));
}

/** Never silently interpret an invalid restore file as an empty Dayframe history. */
export function isDayframeBackup(value: unknown): boolean {
  return record(value) && value.version === 1 &&
    Array.isArray(value.sleepSessions) && value.sleepSessions.every(validSleep) &&
    Array.isArray(value.movementDays) && value.movementDays.every(validMovement) &&
    Array.isArray(value.meals) && value.meals.every(validMeal);
}
