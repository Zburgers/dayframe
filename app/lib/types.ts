export type Activity = {
  id: string;
  name: string;
  minutes: number;
  calories: number;
};

export type MovementDay = {
  date: string;
  steps: number;
  activeCalories: number;
  exerciseMinutes: number;
  source: "manual" | "apple-health-shortcut";
  activities: Activity[];
  updatedAt: string;
};

export type SleepSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  notes?: string;
};

export type Meal = {
  id: string;
  eatenAt: string;
  name: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  source: "manual" | "photo-estimate";
  confidence?: "low" | "medium" | "high";
  items?: string[];
  note?: string;
};

export type DayframeState = {
  version: 1;
  sleepSessions: SleepSession[];
  movementDays: MovementDay[];
  meals: Meal[];
};

export type MealEstimate = {
  name: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  confidence: "low" | "medium" | "high";
  items: string[];
  note: string;
};

export const emptyState: DayframeState = {
  version: 1,
  sleepSessions: [],
  movementDays: [],
  meals: [],
};

