# Architecture and privacy

## System shape

Dayframe is a server-rendered web shell with a client-side personal data store and one stateless image-analysis endpoint.

| Component | Responsibility | Stores health data? |
|---|---|---|
| Browser UI | Logging, editing, summaries, heatmap, backup | Yes, on the device only |
| IndexedDB | Sleep, movement, meals, settings | Yes, locally |
| Meal analysis route | Validate image, call vision API, return structured estimate | No |
| Vision provider | Analyze the submitted image | Receives the image under provider API terms |
| Sites hosting | Serve application and stateless route | No application health database |

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

No image bytes or object URLs are placed in IndexedDB.

## Meal analysis boundary

1. Browser validates type and size and shows a local preview.
2. The user explicitly requests analysis.
3. The route reads the body into memory, checks type/size again, and submits a Base64 data URL.
4. The provider returns schema-constrained JSON.
5. The route validates/clamps the result and returns it.
6. Request-scoped image bytes become unreachable; no blob or database write occurs.
7. The browser discards its preview when the dialog closes.

Controls:

- Accept JPEG, PNG, HEIC/HEIF, and WebP only.
- Maximum request size: 8 MB.
- Do not log request bodies, Base64 content, or meal output.
- Keep the provider key only in the hosted secret environment.
- For the personal deployment, an owner may instead save a project-specific API key in a separate local IndexedDB key. It is excluded from backups, sent only as a request header for photo analysis, and never returned by the endpoint.
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
- Erase clears the IndexedDB database after a destructive-action confirmation.
- Data from one Sites origin is isolated from other origins by browser security boundaries.

## Threat notes

- Anyone with access to the unlocked iPhone/browser profile can access local records.
- Browser extensions or a compromised device can access rendered data.
- Network requests for meal estimation disclose the chosen image to the configured provider.
- Local-only history is vulnerable to browser-data clearing unless backups exist.
