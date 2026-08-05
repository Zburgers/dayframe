# Deployment notes

Dayframe has two source surfaces:

1. GitHub is the public source repository and review surface:
   [Zburgers/dayframe](https://github.com/Zburgers/dayframe).
2. ChatGPT Sites owns the production deployment for the private live app:
   [nakii-health-tracker.ekagra7865.chatgpt.site](https://nakii-health-tracker.ekagra7865.chatgpt.site).

## What a GitHub push does

Every push and pull request runs the repository validation workflow in
`.github/workflows/ci.yml`. It installs the locked dependencies and runs the
production build, rendered-HTML tests, lint, and artifact validation.

The current ChatGPT Sites integration does not expose a GitHub webhook or a
repository secret that can safely trigger a Sites production deployment from a
GitHub Actions runner. A GitHub push therefore validates the source; publishing
a new production version remains an explicit Sites checkpoint. This preserves
the app's owner-only access policy and prevents an unreviewed push from changing
a private health application.

## Publishing a verified change

Use the Sites workflow for the recovered project checkout:

```bash
python3 "$(dirname \"/root/.codex/plugins/cache/openai-curated-remote/sites/0.1.14/skills/sites-building/SKILL.md\")/../sites-hosting/scripts/sites.py" checkpoint \
  --path /workspace/sites/nakii-health-tracker \
  --message "Describe the change"
```

The checkpoint validates the build, pushes the Sites source state, saves an
immutable version, and starts the private production deployment. Verify the
deployment status before sharing the existing live URL.

Do not put `OPENAI_API_KEY`, Convex credentials, Sites tokens, or any other
secret in GitHub, `.openai/hosting.json`, or the client bundle.
