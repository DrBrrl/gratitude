# End-to-end testing guide

Gratitude uses Playwright to check user-visible behaviour against a production build. This guide adapts the numbered scenarios, explicit verification steps, and reproducible evidence approach in [anicolao/food's E2E_GUIDE.md](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/E2E_GUIDE.md) to a mobile-first gratitude journal.

## Run the tests

On Nix, from the repository root:

```sh
nix develop
npm ci
npm run check
npm run test:e2e
npm run test:e2e:report
```

The locked development shell provides Node 24 and a working Nix Chromium executable. It sets `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and skips Playwright's browser download. On a conventional Linux system with Node 24, install dependencies with `npm ci`, then run `npx playwright install --with-deps chromium` before testing. CI uses that installation method with the Playwright version in `package-lock.json`.

`npm run test:e2e` builds the app and starts its production preview server automatically. It does not test the development server. Playwright waits for the configured URL to respond and stops its server when the run ends. A process already occupying port 4173 causes a failure rather than silently testing an unrelated server.

Check the paths used on GitHub Pages:

```sh
BASE_PATH=/gratitude npm run test:e2e
BASE_PATH=/gratitude/pr-preview/pr-123 npm run test:e2e
```

Check an already deployed site without building or starting a local server:

```sh
E2E_BASE_URL=https://drbrrl.github.io/gratitude/pr-preview/pr-123/ npx playwright test
```

Keep the trailing slash in an external URL. Tests navigate with `page.goto('./')`; `/` would discard the repository and preview path.

## Current coverage

Scenario `001-landing` checks the HTTP response is 200, the document title is `Gratitude`, and the main Gratitude heading is visible. It runs in Chromium at mobile (390 × 844, touch enabled) and desktop (1280 × 800) sizes. This proves the landing page serves; it does not establish journal persistence, AI behaviour, accessibility compliance, or full device compatibility.

The application currently has a static landing page. Add tests for journal and personalization stories when those behaviours are implemented. Use fictional journal entries and photos in fixtures, never private reflections.

## Scenario structure

```text
tests/e2e/
  helpers/test-step-helper.ts
  001-landing/
    README.md
    001-landing.spec.ts
```

Give each scenario the next three-digit number and a short descriptive name. Its README states the user story, setup, actions, and expected results. Keep assertions close to the action they verify and use accessible roles and names where possible.

`TestStepHelper.step(name, description, verifications)` groups a step's checks and captures a numbered screenshot and Markdown verification record after they pass. Each verification has a `description` and an asynchronous `check` function; the landing scenario demonstrates the actual API. Keep these descriptions readable as test evidence. Playwright's HTML report contains the step records and images. Failures retain traces and screenshots through the runner configuration.

Generated evidence belongs in ignored `test-results/` and `playwright-report/`, not in the source tree. CI uploads these directories as the `e2e-report` artifact, retained for 14 days. Download the artifact to inspect its HTML report locally. The scenario README remains the committed account of the test's intent.

## Deterministic behaviour

Tests use a fixed locale (`en-AU`), timezone (`Australia/Hobart`), dark colour scheme, and reduced motion. Screenshots disable animations. Chromium launches with GPU rendering disabled and font hinting disabled to reduce variation.

As time-dependent behaviour is added, freeze the clock at a declared instant before opening the page. Seed any randomized colours or identifiers and provide explicit storage fixtures. Stub AI responses and photo summaries at the application boundary; ordinary CI should not depend on live model output, credentials, cost, or network timing. Test a real provider separately when integration coverage is introduced.

Wait for observable conditions with Playwright assertions. Do not use fixed sleeps to wait for rendering or network completion. Assertions and actions have a two-second budget; a whole test has 30 seconds and the server has 30 seconds to start. Change a timeout only with a concrete explanation of the behaviour that needs it.

## Screenshots and future visual checks

Current screenshots document passing steps; they are **not** baseline comparisons. The food guide's zero-pixel approach is not an established guarantee here. Nix Chromium and Playwright's downloaded Chromium can have different versions and font rendering even with the same launch flags.

When visual regression tests are introduced, pin the browser, operating-system image, fonts, viewport, and fixtures used to produce and compare baselines. Review baseline changes alongside the intended design change. Do not accept new baselines merely to make a failing test green. Keep functional checks even when a screenshot comparison is added.

## Related checks

`npm run check` checks Svelte and TypeScript. `npm run test:deployment` exercises production replacement, preview isolation, closed-preview cleanup, and rejection of unsafe build inputs. These checks support the E2E test but do not replace it. See [DEPLOYMENT.md](DEPLOYMENT.md) for the publication workflow.
