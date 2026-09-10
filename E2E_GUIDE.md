# End-to-end testing guide

Gratitude's E2E tests combine functional checks, screenshot comparisons, and generated scenario documentation. This follows [food's E2E guide](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/E2E_GUIDE.md) and [Jaipur's TestStepHelper](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/tests/e2e/helpers/test-step-helper.ts). Every documented step compares its screenshot with a committed baseline. Each generated README embeds the screenshot with its checks underneath.

## Run the tests

From the repository root:

```sh
nix develop
npm ci
npm run check
npm run test:e2e
npm run test:e2e:report
```

The locked Nix shell provides Node 24, Chromium, and a font configuration containing pinned DejaVu fonts. CI uses the same shell. Screenshot baselines are maintained on x86_64 Linux, matching CI; use that environment when updating baselines. Other platforms or browser installations are not interchangeable baseline generators.

`npm run test:e2e` builds the app and starts its production preview server automatically. Playwright waits for the configured URL and stops its server after testing. Port 4173 must be available; the runner does not reuse an unrelated server.

Check the paths used on GitHub Pages:

```sh
BASE_PATH=/gratitude npm run test:e2e
BASE_PATH=/gratitude/pr-preview/pr-123 npm run test:e2e
```

Check an already deployed site without rebuilding or starting a local server:

```sh
E2E_BASE_URL=https://drbrrl.github.io/gratitude/pr-preview/pr-123/ npx playwright test
```

Keep the trailing slash in an external URL. Tests navigate with `page.goto('./')`; `/` would discard the repository and preview path. Deployed tests perform the same screenshot comparisons as local tests.

## Current coverage and files

Scenario `001-landing` verifies HTTP 200, the document title, a visible main heading, and the rendered landing page. It runs in Chromium at mobile (390 × 844, touch enabled) and desktop (1280 × 800) sizes. This does not establish journal persistence, AI behaviour, accessibility compliance, or full device compatibility.

```text
tests/e2e/
  helpers/test-step-helper.ts
  001-landing/
    001-landing.spec.ts
    README.md                         # generated mobile walkthrough
    README.desktop-chromium.md        # generated desktop walkthrough
    screenshots/
      000-landing-serves-mobile-chromium.png
      000-landing-serves-desktop-chromium.png
```

The PNGs are both comparison baselines and images embedded in the generated READMEs. Commit both images and documentation so reviewers can see the tested experience directly in GitHub. Generated Playwright reports, failure screenshots, and diffs remain in ignored `playwright-report/` and `test-results/`; CI retains those as the `e2e-report` artifact for fourteen days.

## Writing a scenario

Give each scenario the next three-digit number and a short descriptive name. Keep one test per scenario folder, with its steps in interaction order. Use accessible roles and names for assertions where possible.

Create `TestStepHelper(page, testInfo)` and call `step(name, description, verifications)` for each observable state. Each verification contains a `description` and an asynchronous `check`. The helper:

1. Runs the functional verifications inside named Playwright steps.
2. Moves the pointer away from interactive content.
3. Calls `expect(page).toHaveScreenshot(...)` against the scenario's committed PNG with zero differing pixels and zero colour-distance threshold.
4. Records the step for documentation only after all checks and the comparison succeed.

After all steps, call `generateDocs(title, description)`. The helper writes a Markdown heading and description, then each step's embedded image followed by its verification checkboxes, including the screenshot comparison. Mobile owns `README.md`; desktop owns `README.desktop-chromium.md`, so parallel projects cannot overwrite each other's documentation. The test code is the source of truth for these documents; do not edit generated READMEs by hand.

CI checks that generated documentation matches the committed files and that no untracked scenario files were created. A screenshot or functional failure blocks publication and does not rewrite the baseline or claim the failed step passed.

## Reviewing and updating baselines

Ordinary tests use `updateSnapshots: 'none'`: a missing baseline fails, as does a changed screenshot. CI never accepts new screenshots automatically. Playwright's failure report includes expected, actual, and diff images when a comparison differs.

For an intentional UI change or a new scenario, use the pinned Nix environment:

```sh
npm run build
npx playwright test --update-snapshots=all
```

Inspect every changed PNG and generated README. Confirm that the image represents the intended behaviour and that its checks appear underneath it. Then run without update mode:

```sh
npx playwright test
git diff -- tests/e2e
git status --short tests/e2e
```

Commit the reviewed baselines, generated documents, and test changes together. Do not update baselines merely to clear a failure. When changing the browser or fonts in `flake.lock`, review screenshot changes as part of that dependency change.

## Determinism and waits

The runner fixes the locale (`en-AU`), timezone (`Australia/Hobart`), dark colour scheme, reduced motion, and device scale factor. Screenshot comparisons disable animations and hide the caret. Chromium disables GPU rendering, font hinting, LCD text, and font subpixel positioning. The browser and fonts come from the same Nix lock locally and in CI.

As time-dependent behaviour is implemented, freeze the clock before opening the page. Seed randomized colours and identifiers and provide explicit storage fixtures. Stub AI responses and photo summaries at the application boundary; normal CI should not depend on live model output, credentials, cost, or network timing. Use fictional entries and photos, never private reflections.

Wait for observable conditions with Playwright assertions; do not use fixed sleeps. Assertions and actions have a two-second budget, each test has 30 seconds, and server startup has 30 seconds. A timeout change requires an explanation of the behaviour that needs it.

## Related checks

`npm run check` checks Svelte and TypeScript. `npm run test:deployment` verifies production replacement, preview isolation, closed-preview cleanup, and rejection of unsafe build inputs. These support the E2E checks; see [DEPLOYMENT.md](DEPLOYMENT.md) for publication behaviour.
