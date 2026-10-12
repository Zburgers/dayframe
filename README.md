# Dayframe

Dayframe is a private, mobile-first health journal for the three signals that shape a day: sleep, movement, and food.

**Live app:** [nakii-health-tracker.ekagra7865.chatgpt.site](https://nakii-health-tracker.ekagra7865.chatgpt.site)

**Source:** [github.com/Zburgers/dayframe](https://github.com/Zburgers/dayframe)

## What it does

- Start, finish, correct, or manually add sleep sessions
- Track steps, active calories, exercise minutes, and named activities
- Import a compact daily Apple Health summary through an iPhone Shortcut
- Take a meal photo for an editable ballpark calorie and macro estimate
- Log meals manually when photo analysis is unavailable
- Review daily debriefs, seven-day averages, and an 84-day consistency heatmap
- Export a JSON backup, restore it, or erase all account data

## Privacy by design

Dayframe uses Convex for authenticated, persisted health records. Sleep, movement, meals, and model preferences are scoped to the signed-in user. IndexedDB is retained only as a one-time migration source and a local backup/erase aid; clearing browser data does not remove the Convex copy.

Meal analysis is the only opt-in image network operation. When requested, the selected image is resized in the browser, sent to a Convex action, forwarded to the selected vision provider, and discarded after the response. Dayframe stores the editable estimate, never the image. OpenRouter BYOK keys are encrypted server-side and never returned to the client. API keys must never be committed to the repository or embedded in client code.

## Apple Health

An ordinary website cannot read HealthKit directly. Dayframe therefore accepts a compact summary created by an iPhone Shortcut and also supports manual movement entry. See [Apple Health Shortcut setup](docs/APPLE_HEALTH_SHORTCUT.md).

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm test
npm run lint
npm run validate:artifact
```

Photo estimates can be configured from **Settings** by choosing an OpenAI-hosted model or an OpenRouter model. OpenAI-hosted models require the Convex deployment secret:

```text
OPENAI_API_KEY=your_key
OPENAI_VISION_MODEL=your_vision_model
```

For OpenRouter, each user can enter their own `sk-or-v1-...` key in Settings; it is encrypted before storage. Without a configured provider key, the tracker remains fully usable and meals can be entered manually. Provider API usage is billed separately from a ChatGPT subscription.

## Deployment

The production app is deployed through ChatGPT Sites and remains owner-only. The repository includes the source manifest at `.openai/hosting.json` and a GitHub Actions workflow that validates every push and pull request. The Sites deployment is versioned separately so health-data access policy and production publishing remain explicit; see [deployment notes](docs/DEPLOYMENT.md).

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture and privacy](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Deployment notes](docs/DEPLOYMENT.md)
- [Apple Health Shortcut setup](docs/APPLE_HEALTH_SHORTCUT.md)

## Disclaimer

Dayframe is a personal journaling tool, not a medical device. Energy expenditure and image-based nutrition estimates can be wrong. Review and edit estimates, and do not use the app for diagnosis or treatment decisions.
