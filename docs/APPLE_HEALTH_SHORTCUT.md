# Apple Health Shortcut bridge

## Why a bridge is required

Apple Health data is accessed through HealthKit entitlements available to iOS and watchOS apps. Dayframe is a website, so it cannot silently or directly read HealthKit. The MVP keeps data local by letting an iPhone Shortcut read selected daily totals and hand a compact summary to Dayframe.

## Supported payload

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

## Initial setup

Until a signed downloadable Shortcut is published, create a Shortcut with these actions:

1. Ask for or calculate the target date (default: today).
2. Use **Find Health Samples** for Steps within that date and calculate the sum.
3. Repeat for Active Energy Burned and Exercise Time.
4. Optionally find Workouts for the day and map each to name, duration, and active calories.
5. Create a Dictionary matching the payload above.
6. Convert the Dictionary to JSON text.
7. Copy the JSON to the clipboard.
8. Open Dayframe, choose **Import Apple Health**, and paste it.

The first run prompts for permission to read only the selected Health categories. The Shortcut never needs to upload the history to a Dayframe account.

## Duplicate behavior

Movement summaries use the date as their logical key. Importing the same date again replaces the previous summary after confirmation, so the totals are not doubled.

## Future native path

A native iOS companion can use HealthKit background delivery and pass the same versioned daily summary to Dayframe. That is intentionally outside the web MVP because it requires Xcode signing, HealthKit entitlements, and App Store/device distribution.
