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
- Export a JSON backup, restore it, or erase all local data

## Privacy by design

Dayframe stores health logs in the browser's IndexedDB database. The current MVP has no user database and does not send health history to a server. Clearing browser or site data removes the local history, so use the built-in JSON backup regularly.

Meal analysis is the only opt-in network operation. When requested, the selected image is resized in the browser, sent to the analysis endpoint, forwarded to the configured vision provider, and discarded after the response. Dayframe stores the editable estimate, never the image. API keys must never be committed to the repository or embedded in client code.

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

Photo estimates can be configured from **Settings** with a project-specific OpenAI API key. The key remains in that browser and is excluded from backups. A maintainer can instead configure the hosted runtime with:

```text
OPENAI_API_KEY=your_key
OPENAI_VISION_MODEL=your_vision_model
```

Without a key, the tracker remains fully usable and meals can be entered manually. OpenAI API usage is billed separately from a ChatGPT subscription.

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
