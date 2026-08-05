# Dayframe — Product Requirements Document

**Status:** MVP in implementation  
**Owner:** Nakii  
**Last updated:** 2026-08-04

## 1. Product summary

Dayframe gives one person a fast, honest daily picture of sleep, movement, and food without creating a cloud health profile. It is optimized for quick iPhone logging and for answering: “How did today go compared with my recent days?”

## 2. Product principles

1. **Local by default.** Health history remains on the device.
2. **Fast enough to use daily.** Common entries take one or two taps plus minimal typing.
3. **Estimates stay estimates.** AI nutrition values show confidence and remain editable.
4. **Patterns over perfection.** Weekly trends and consistency matter more than a single score.
5. **No medical claims.** The app summarizes self-reported data; it does not diagnose or prescribe.

## 3. MVP user stories

### Sleep

- I can tap “Going to sleep” and later tap “I’m awake.”
- I can enter or correct start and end times manually.
- I can see total sleep duration for each calendar day and a seven-day average.

### Movement

- I can log steps, active calories, and exercise minutes for a date.
- I can add activities with type, duration, and estimated calories burned.
- I can import a daily summary created by an Apple Health Shortcut.
- Duplicate imports update the same day instead of inflating totals.

### Food

- I can take or choose a meal photo on iPhone.
- I receive an editable estimate: meal name, calories, protein, carbs, fat, items, confidence, and an uncertainty note.
- The image is not saved after analysis.
- I can manually log a meal if photo analysis is unavailable or wrong.

### Review

- I can see today’s calories in, active calories out, steps, movement minutes, and sleep.
- I can read a concise daily debrief based only on recorded values.
- I can switch dates and review historical entries.
- I can see a calendar heatmap representing daily logging/completion consistency.
- I can export, import, and erase my local history.

## 4. Functional requirements

| Area | Requirement | MVP acceptance criterion |
|---|---|---|
| Storage | Persist all health records locally | Reloading and reopening the site preserves entries on the same browser |
| Sleep | Timed and manual sessions | Cross-midnight duration is computed correctly and invalid ranges are rejected |
| Movement | Totals and activities | Daily totals and activity list update without double-counting |
| Health import | URL/file JSON summary | A supported payload imports once and is editable afterward |
| Food | Photo and manual logging | Photo result can be corrected before save; manual path always works |
| Debrief | Deterministic daily summary | The summary never invents unrecorded behavior |
| Heatmap | Recent daily overview | At least 12 weeks are visible with accessible date/value labels |
| Portability | Backup and restore | Exported JSON restores equivalent records after validation |
| Deletion | Erase local history | One confirmed action clears the Dayframe database on that device |

## 5. Out of scope for the MVP

- Direct HealthKit background synchronization from the website
- Multi-user accounts or cloud synchronization
- Body-weight goals, diagnosis, medical alerts, or personalized prescriptions
- Exact calorie recognition from images
- Social feeds, competitions, streak pressure, or punitive notifications

## 6. Success measures

- A complete day can be logged in under two minutes, excluding photo analysis latency.
- Sleep start/stop requires one tap per event.
- No meal image or health record is present in server persistence or logs by application design.
- A user can recover their history from an exported backup.
- The main workflow is usable at 375 px width with touch-sized controls.

## 7. Known constraints

- Apple limits HealthKit access to apps with the native HealthKit capability; the web MVP needs a Shortcut/manual bridge.
- Device-local storage does not automatically follow the user to another browser or device.
- Safari can remove site data under device/storage pressure; backups mitigate this.
- Meal estimates vary with image angle, hidden ingredients, portion ambiguity, and cooking method.
- Automatic meal analysis needs a separately configured project API key and incurs provider usage costs. The personal deployment can keep it in a separate local browser record, excluded from health backups.

## 8. Roadmap

### Next

- Downloadable prebuilt Apple Shortcut and smoother daily automation
- Goal ranges and optional reminders
- CSV export and richer trend charts
- Offline application shell

### Later

- Optional native iOS companion with direct HealthKit permissions
- Optional end-to-end encrypted sync selected by the owner
- Personal baselines and anomaly flags after sufficient history exists
