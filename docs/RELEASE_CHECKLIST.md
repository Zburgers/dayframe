# Dayframe release and data-preservation checklist

This repository is the public review and validation surface, **not** an automatically deployed ChatGPT Sites application. GitHub Actions validates commits, but does **not** publish them.

## 1. Establish source parity before deploying

- Confirm that the private production Site is the existing `nakii-health-tracker` project, not a new project or domain.
- Identify the **actual Sites working checkout** and compare its app code, dependencies, and storage/auth architecture with the GitHub commit being released.
- **Stop if the deployed application uses Convex and this repository does not.** The current GitHub source uses IndexedDB for meals, movement and sleep; its `package.json` contains no Convex client. A separate Convex development deployment exists and may be used by another Sites version, but this repository does not establish that connection.
- Do not copy IndexedDB app files over a Convex-backed version. Reconcile the live implementation into source control, then port and test fixes against the recovered production source.
- Verify project-specific environment keys in the actual Sites deployment without printing or committing secrets.

## 2. Protect user data

- Export and securely keep a JSON backup of any local IndexedDB records from the current production origin before changing its code.
- If the active app is Convex-backed, take an appropriate verified Convex backup as well. A browser JSON file does not replace a database backup.
- Confirm that the existing production origin, owner-only access controls and deployment ID will stay unchanged.
- Do not reset, reseed, migrate or delete production data merely to release UI changes.

## 3. GitHub verification

Run `npm ci` and `npm test && npx tsc --noEmit && npm run lint && npm run validate:artifact`.
Require a green run on the **exact PR head SHA** being merged. Re-run checks after any code change; do not rely on an older green run.

## 4. App smoke-test matrix

- Add a manual meal for today, edit calories and macros, verify daily totals, reload, and verify the saved data.
- Add a meal for a historical date, verify its time/date and that today's totals stay unchanged.
- Edit meal ingredients and notes, save and reopen, then delete only a test entry with confirmation.
- Choose a photo, replace it during an in-flight estimate, and confirm no stale result overwrites the new image.
- Verify both a successful photo estimate and graceful failure with unavailable API credentials; do not log the photo or key.
- Add two activities, verify derived active kcal/min totals, then remove one; verify explicitly entered or imported daily totals are not double-counted.
- Run an Apple Health import twice for the same day and confirm no duplicate totals.
- Create a backup, restore a valid copy in an isolated test browser, and reject malformed files without erasing history.
- Check mobile width and iPhone Safari camera/file picker.
- If Convex-backed, observe the expected Convex queries/mutations in the **correct deployment** and verify persistence after reload on the actual authenticated account; do not infer production health from a development dashboard.

## 5. Publish and verify

- Merge to GitHub only after review and passing CI.
- From the verified **existing Sites checkout**, publish a Sites checkpoint using the documented Sites workflow.
- Confirm the completed deployment on the existing owner-only URL, not a new temporary environment.
- Smoke-test with harmless test records and verify that earlier records and Convex access (if used) remain available.
- If production differs from GitHub or any critical check fails, do not publish; restore the previous Sites checkpoint or fix the mismatch first.

## Access boundary

The standard GitHub and Convex guidance connectors do **not** provide the ChatGPT Sites project publishing action or database-console access. Do not claim a Sites deployment or Convex connection was independently verified merely because GitHub CI succeeded.
