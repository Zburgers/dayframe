# Architecture and privacy

## System shape

Dayframe is a web shell backed by authenticated Convex queries, mutations, and actions. The browser keeps a small IndexedDB cache for migration and offline-friendly local backup behavior, while Convex is the durable source for signed-in users.

| Component | Responsibility | Stores health data? |
|---|---|---|
| Browser UI | Logging, editing, summaries, heatmap, backup | No durable authority |
| Convex | Auth, sleep, movement, meals, model settings, sync | Yes, per user |
| IndexedDB | One-time migration source and local cache/erase aid | Yes, locally |
| Convex meal action | Validate image, call selected vision API, return structured estimate | No image persistence |
| Vision provider | Analyze the submitted image | Receives the image under provider API terms |
| Sites hosting | Serve the application shell | No application health database |

## Local data model

```ts
type SleepSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  notes?: string;
};

type DailyMovement = {
  date: string;
  steps: number;
  activeCalories: number;
  exerciseMinutes: number;
  source: "manual" | "apple-health-shortcut";
  activities: Activity[];
};

type Meal = {
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
```

No image bytes or object URLs are placed in IndexedDB or Convex.

## Meal analysis boundary

1. Browser validates type and size and shows a local preview.
2. The user explicitly requests analysis.
3. The Convex action receives a bounded Base64 payload, checks its size, and submits a data URL.
4. The provider returns schema-constrained JSON.
5. The route validates/clamps the result and returns it.
6. Request-scoped image bytes become unreachable; no blob or database write occurs.
7. The browser discards its preview when the dialog closes.

Controls:

- Accept JPEG, PNG, HEIC/HEIF, and WebP only.
- Maximum browser input size: 12 MB; the resized Convex payload is capped below 4.5 MB.
- Do not log request bodies, Base64 content, or meal output.
- Keep the hosted OpenAI key only in the Convex environment.
- OpenRouter BYOK keys are encrypted with a deployment secret before being stored in the per-user model-settings record. Only masked metadata is returned to the browser.
- Display estimates as editable and never as exact measurements.

## Apple Health bridge

An ordinary hosted website cannot receive HealthKit entitlements. The MVP accepts a versioned daily summary generated locally by Shortcuts:

```json
{
  "version": 1,
  "date": "2026-08-04",
  "steps": 8421,
  "activeCalories": 516,
  "exerciseMinutes": 48,
  "activities": [
    { "name": "Walking", "minutes": 32, "calories": 210 }
  ]
}
```

The app validates values, asks for confirmation, and upserts movement by date. A future native companion can write the same logical shape into the local store.

## Backup and recovery

- Export produces a versioned JSON document containing records and settings, never photos or secrets.
- Import parses, validates, and replaces only after explicit confirmation.
- Erase clears the signed-in user's Convex records and then clears the local IndexedDB cache after a destructive-action confirmation.
- Data is isolated by Convex authentication and per-user ownership checks; browser-origin isolation remains an additional boundary.

## Threat notes

- Anyone with access to the unlocked iPhone/browser profile can access local records.
- Browser extensions or a compromised device can access rendered data.
- Network requests for meal estimation disclose the chosen image to the configured provider.
- The local cache is vulnerable to browser-data clearing, but the signed-in Convex copy remains available after re-authentication.
