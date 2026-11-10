# CI selection and publication

Pull requests run affected screenshot walkthroughs on mobile and desktop, together with landing (001) and signed-in routing/navigation (035). Main and manual workflow runs execute every registered walkthrough on both viewports. Production publication waits for the complete main run.

All runs retain the build, Svelte checks, unit/deployment tests, full backend Rules/event-stream suite, import-scale checks and push/relay integration checks. Every selected walkthrough keeps its original functional assertions, screenshot after each action, generated checks beneath the image, `maxDiffPixels: 0` and `threshold: 0`. Selection does not regenerate baselines or relax comparisons.

## Selection rules

`scripts/select_ci.py` compares the PR head with its merge base against the target branch. Earlier commits in the PR count too. Renames include both the old and new path. If the diff cannot be established, CI runs the full suite.

`ci/walkthroughs.json` records the scenario groups and the deliberately small initial component map:

| Changed component | Additional walkthroughs |
| --- | --- |
| HugNotifications | All Friends/hug/community/notification consumers (036–039, 043–044) |
| Friends | Friends/hugs plus all onboarding flows |
| ImportPanel | Import and recovery (015–016) |

A walkthrough's own test, local fixture, README or baseline selects that walkthrough. Listed design/record documents and files under `docs/` retain smoke coverage. All other paths select the full suite. In particular, global styling/layout, the shared GratitudeApp component, event projections, dates, authentication, Rules, dependencies, test helpers, workflow/selection infrastructure and unrecognised files trigger full coverage.

The map is a reviewed statement of consumers, not a guess from filenames. When introducing a new consumer of a mapped component, review its scenario mapping too. Expand the map only when its consumers are established. New scenarios must have a unique ID and be registered in a group/build mode; missing registrations fail the planning job rather than silently omit a test. All currently shipped walkthroughs, including 056 from PR 26, are registered.

The planning job publishes the selected IDs and per-path reasons in its GitHub Actions summary. It uses a sparse checkout with Git history so selection does not download historical screenshot blobs. Scenario arguments are validated and passed as argument arrays, never interpolated into shell commands. Generic-AI walkthrough 009 gets its own generic build; paid-mode scenarios keep their paid builds.

## Request a full PR run

Add the **ci:full-e2e** label to the PR. Adding or removing labels recomputes selection; leaving this label present forces the full suite on subsequent commits. Alternatively, run **CI and Pages** manually on the desired branch: manual runs always use the full suite. A manual run on a feature branch checks the code without publishing it as production.

## Backend readiness and jobs

The entire `tests/firebase/*.test.mjs` suite runs once in the required `backend` job. Import-scale and push/relay are distinct integrations and remain required. Push registration Rules belong to the backend suite and are not repeated in the push-delivery job.

Every browser job has its own disposable `demo-gratitude` emulators. Before building, `scripts/warm_ci_emulators.mjs` executes real Firestore owner writes/reads and cross-user denial, plus Storage owner upload/read/delete and cross-user denial. It cleans up its fictional probe. This preserves Rules readiness without rerunning all backend regressions in each matrix job. Auth sign-in is exercised through the actual emulator popup in routing smoke coverage. Warm-up failures fail the job; there is no automatic retry or permission bypass for an expected owner operation.

Onboarding is partitioned into 045–046, 047–048 and 054–055 so the walkthroughs fit within their existing job budgets. Personal-cloud 050 retains its own job; providers 049/051/056 share the providers jobs. The single stable **CI gate** requires planning, build, backend, every planned browser job, import-scale and push to succeed; missing, skipped, failed or cancelled categories fail it. This is the check to require if configuring branch protection.

## Publication concurrency

Independent PR and main checks can run concurrently, subject to GitHub runner capacity. Only the shared Pages publication job uses the `gratitude-pages` concurrency group. It retains the current-head check, same-repository PR restriction and production/preview assembly. A stale revision cannot publish, and closed-PR cleanup still removes abandoned previews. The publication gate consumes the current run's results and build artifact.

PR previews require all selected checks and the CI gate. Production requires the full main suite and the CI gate. Changing the selection/workflow itself triggers the full suite, including for this CI PR.

## Local validation

```sh
nix develop -c npm run test:deployment
nix develop -c actionlint
python3 scripts/select_ci.py # default: full manual plan
CI_PROJECT=desktop-chromium CI_AI_MODE=paid \
  CI_SCENARIOS='["035-signed-out-routing"]' \
  python3 scripts/run_ci_walkthroughs.py --dry-run
```

To execute that paid smoke plan, set the same variables and run `nix develop -c bash scripts/firebase-test.sh 'python3 scripts/run_ci_walkthroughs.py'`. Use a separate invocation with `CI_AI_MODE=generic` and scenario `009-generic-ai` for the generic build. Do not run multiple local emulator suites against the shared fixture ports concurrently.
