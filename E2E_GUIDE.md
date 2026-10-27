# End-to-end testing guide

Gratitude's E2E tests combine functional checks, screenshot comparisons, and generated scenario documentation. This follows [food's E2E guide](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/E2E_GUIDE.md) and [Jaipur's TestStepHelper](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/tests/e2e/helpers/test-step-helper.ts). Every documented step compares its screenshot with a committed baseline. Each generated README embeds the screenshot with its checks underneath.

## Screenshot comparison rule

**No masking is allowed, in any circumstance. Every pixel must match: `maxDiffPixels: 0` and `threshold: 0`.** Do not add masks, crop away content, hide or replace rendered content, or use screenshot-only styles to bypass differences. Fix nondeterminism in the test inputs and clocks. Review actual rendered dates and other dynamic content in the committed screenshots. The helper records the current scroll position, captures the complete page from document origin (0, 0), then restores that position. This stabilizes Chromium mobile beyond-viewport capture without hiding, cropping or replacing any content. Action checks run before capture at the user’s actual scroll position.

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

Scenario `001-landing` verifies HTTP 200, the document title, a visible main heading, the empty disabled calendar/sign-in overlay, and keyboard navigation through the two sign-in links. It runs in Chromium at mobile (390 × 844, touch enabled) and desktop (1280 × 800) sizes. This does not establish journal persistence, AI behaviour, accessibility compliance, or full device compatibility.

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

The runner fixes the locale (`en-AU`), timezone (`Australia/Hobart`), dark colour scheme, reduced motion, and device scale factor. Screenshot comparisons disable animations and hide the caret. Chromium disables GPU rendering, partial raster reuse, CPU-specific Skia optimizations, font hinting, LCD text, and font subpixel positioning. It also runs all compositor stages before drawing and disables threaded scrolling, following [Chrome’s tooling guidance](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#rendering--gpu), so scroll and paint work complete in a consistent order. Full rasterization avoids rounded-border differences caused by repaint history; the application content and styling remain intact. The browser and fonts come from the same Nix lock locally and in CI.

As time-dependent behaviour is implemented, freeze the clock before opening the page. Seed randomized colours and identifiers and provide explicit storage fixtures. Stub AI responses and photo summaries at the application boundary; normal CI should not depend on live model output, credentials, cost, or network timing. Use fictional entries and photos, never private reflections.

Wait for observable conditions with Playwright assertions; do not use fixed sleeps. Assertions and actions default to a two-second budget, each test defaults to 30 seconds, and server startup has 30 seconds. Full-page screenshot comparisons allow ten seconds to obtain two stable renders on constrained CI runners; their pixel tolerance remains zero. Authentication and reopening a journal with a pending outbox allow fifteen seconds for account restoration and server acknowledgement. Multi-step journal scenarios declare longer total budgets. A timeout change requires an explanation of the behaviour that needs it.

For photo replay, wait for the expected image count, each image's `complete` state and nonzero `naturalWidth`, then await `decode()` before comparing the screenshot. Matching summary text alone does not establish that the photos have rendered. Scenario 011 checks all three replayed photos this way.

The 37-step draft-recovery walkthrough has a 240-second total budget for hosted software rendering. Its earlier 150-second budget expired even though all 38 screenshot comparisons matched, including the final new-day screen. This total budget does not change individual action/assertion limits, the ten-second screenshot budget or zero pixel tolerances.

## Related checks

`npm run check` checks Svelte and TypeScript. `npm run test:unit` checks local-day identity/colour and preview truncation boundaries. `npm run test:deployment` verifies production replacement, preview isolation, closed-preview cleanup, and rejection of unsafe build inputs. These support the E2E checks; see [DEPLOYMENT.md](DEPLOYMENT.md) for publication behaviour.

## Firebase foundation scenario

`002-firebase-journal` uses Auth, Firestore and Storage emulators with fictional accounts. It exercises the Google popup, reflection save, a second independent signed-in browser, warm reload, full projection rebuild and sign-out. Its generated mobile and desktop READMEs embed full-page screenshot baselines above the checks.

```sh
nix develop -c npm ci
nix develop -c npm run test:firebase:all
```

The Nix shell uses Node 24, pinned Chromium/fonts and Java 21. Emulator ports are auth 19099, Firestore 18080, Storage 19199, bound to loopback. Tests use only `demo-gratitude`; no Google administrative login, live journal or Gemini key is needed.

The integration suite also checks owner isolation, rejected client mutations and forged inputs, duplicate command handling, stale revisions, simultaneous new-entry ordering, atomic metadata enforcement and cached/full replay equivalence. Screenshot assertions explicitly set full-page capture and zero-pixel tolerance in the step helper.

For an intentional visual update, start fresh emulators and run:

```sh
nix develop -c bash scripts/firebase-test.sh 'VITE_FIREBASE_EMULATORS=true npm run build && E2E_FIREBASE=true npx playwright test --update-snapshots=all'
```

Review regenerated PNGs and READMEs, then run the ordinary suite. The normal `test:e2e` build skips the Firebase scenario; CI runs it separately against emulators and checks that generated documentation remains committed. Real mobile OAuth and deployed IAM still require live verification after provisioning.

## Action-by-action feature walkthroughs

The journal feature series adds generated mobile and desktop walkthroughs for [search and editing](tests/e2e/003-journal-search/README.md), [draft recovery](tests/e2e/004-draft-recovery/README.md), [Markdown/JSON export](tests/e2e/005-export/README.md), and [paragraph writing and settings](tests/e2e/006-reflection-editor/README.md). They cover content-sized cards, three rendered preview lines, expansion/collapse, local dates, independent daily/historical drafts, plain-text paste and undo/redo. The export scenario checks actual downloaded files, including full-journal scope and literal text. These run with `npm run test:firebase:all`; the normal configured build runs landing/configuration checks and skips emulator-only scenarios.

Every new user navigation, click, fill, selection and reload must be followed by `TestStepHelper.action` (or a `step` immediately after the action for popups/downloads). Include a meaningful state assertion before comparing the screenshot. Do not combine several UI actions into one undocumented jump. The shared sign-in helper captures the Auth emulator popup and each field separately. Fault injection and backend fixture setup are test setup, not user actions.

The foundation scenario checks that a second signed-in device starts on Journal after today's reflection is saved. Draft recovery covers Done after new and historical saves, reloading into Journal, and starting on Today again at the next local date. Its final clock fixture is `2026-10-01T14:31:07Z`: 2 October in Hobart while UTC is still 1 October. The visible date remains part of the screenshot comparison.

CI runs mobile and desktop in separate Firebase matrix jobs, each with its own emulators and serial scenario worker. Both must pass before publishing; reports have viewport-specific artifact names. Local `test:firebase:all` still runs both projects. The 32-step foundation scenario has a 180-second overall budget after a passing CI run took 118 seconds; individual action and screenshot budgets and zero pixel tolerance are unchanged.

Scenarios run serially to isolate the shared Auth emulator account chooser. The test wrapper freezes emulator JVM wall clocks at `2026-10-01 04:31:07 UTC` using the Nix-pinned libfaketime; monotonic timers keep running. An advancing wall clock made displayed minutes depend on suite duration. Server timestamps and Security Rules still run through the real emulator transaction path. Browser `Date` is fixed to the same instant before journal navigation, including the second device, while browser timers continue normally. Historical fixtures seed raw events with explicit instants through the test SDK; projections are always built by replay. The production app and normal interactive emulators do not use clock overrides. Run baseline updates through the same wrapper as CI.

All rendered content, including dates, is compared without masks or screenshot-only styles. The journal scenario additionally checks the date text against the recorded timestamp and verifies the fixture date was used. Generated READMEs put each screenshot above that action's checks.

## AI integration walkthroughs

[`007-gemini-prompts`](tests/e2e/007-gemini-prompts/README.md) covers explicit settings, optional guidance, generated prompts, source explanations, freeform feedback, save, cached reload, full replay and the next local day. [`008-gemini-recovery`](tests/e2e/008-gemini-recovery/README.md) covers interrupted inference, explicit retry, provider failure, starter fallback, a received-response outbox across reload and revocation in another tab. Each viewport has its own generated walkthrough and strict screenshot baselines.

The tests intercept the exact Firebase AI Logic Gemini Developer API HTTP endpoint. They assert provider-call counts and submitted fictional context; they never make live inference requests. The application has no production response stub. Rules tests exercise duplicate/concurrent device claims, stale consent, changed prompt identity and forged atomic writes. Shared synchronization assertions also reject visible journal error alerts, so screenshot review cannot quietly accept a failed recovery.

CI splits journal, drafts, AI, photo, editor, import, calendar and calendar-edit scenarios into sixteen viewport/suite jobs, with isolated emulators and serial workers in each. All sixteen jobs, import-scale and the build must pass before publication. This keeps the expanded coverage within the existing job budgets without relaxing screenshot comparisons.

[`009-generic-ai`](tests/e2e/009-generic-ai/README.md) builds with `VITE_AI_DATA_MODE=generic` and runs with `E2E_AI_GENERIC=true`. It verifies the optional generic privacy configuration: unavailable personal sharing controls and a fixed generic instruction even when the account has saved reflections. The AI CI jobs run this second build after the personal-context fixtures; both configurations must pass.

## Backfilled and additional reflections

[`010-backfill-entries`](tests/e2e/010-backfill-entries/README.md) follows a past-date draft through reload, save and edit, rejects future dates, adds two reflections for the same day, rebuilds the journal from events and checks the downloaded Markdown dates. The journal CI jobs run it alongside scenarios 001–003; scenarios 004–006 run in the separate drafts suite. All actions retain full-page zero-tolerance comparisons, with the checks beneath their images. Unit and Rules tests additionally cover timestamp encoding, concurrent devices, legacy events, legacy immutable dates, explicit schema 6 date edits, chronological tie breaks and JSON archive version 2.

## Photo attachment walkthrough

`011-photo-attachments` tests both viewports against Auth, Firestore and Storage emulators with fictional Gemini responses. It follows selection and AI disclosure, oversized/unsupported rejection, reload recovery, photo-only save, AI/manual summary search, correction during an in-flight request, failure/retry, four-photo limits, removal confirmation, complete replay and real photo ZIP download contents. Each action has a full-page zero-pixel screenshot and generated checks below its image. The fixture is a deterministic synthetic yellow mug/window illustration with a fictional metadata marker; the intercepted request verifies that normalization strips the marker. It contains no private journal data. `012-photo-recovery` additionally verifies offline attachment, cancellation, received-summary outbox recovery and photo preservation during text edits/discard. CI runs these scenarios in its own `photos` suite, alongside the journal and AI suites, to keep individual jobs within their time budgets.

### Editor prompts

Scenario `013-editor-prompts` exercises generating and selecting a question for an additional entry, double-click and button-based manual editing, cancellation/blank rejection, saving/searching a changed question, durable drafts and received-output recovery, late AI output retaining manual input, replay without inference and Today isolation. It runs in its own `editor` viewport/suite jobs. Every user action has a full-page, unmasked screenshot comparison at zero tolerance and generated checks below the image.


### Dates in every editor

Scenario `014-reflection-dates` runs alongside 013 in the editor suite. It starts a backfill directly from Today, reloads its draft, recovers an offline pending save, edits the saved date into Today, reloads before committing, and checks completion, colour, replay and actual Markdown download contents. Empty and future dates are rejected in the editor. Each action has a full-page, unmasked zero-pixel comparison with checks underneath.

### Alternate journal import

Scenarios `015-import-journal` and `016-import-recovery` exercise local validation/preview, account confirmation, missing prompts, photo-only entries, source-preserving edits, repeated/conflicting input, private photo integrity failures, explicit pause/resume, reload recovery, complete replay and real JSON ZIP contents. They use only fictional raw records and a synthetic mug image. Each action has a full-page unmasked screenshot at `maxDiffPixels: 0`, `threshold: 0`, with generated checks underneath. Image checks wait for decoding. A held emulator upload makes the progress/pause screen deterministic without altering rendered content.

The `import` matrix suite runs those scenarios in both viewports. The separate `import-scale` CI job runs `nix develop -c bash scripts/firebase-test.sh 'node --test tests/import/scale.test.mjs'` once. It imports 686 fictional records and five photos through actual authenticated emulator transactions, pauses after 100 completions, edits an entry, resumes on another client, verifies zero-event identical repeat and checks every exported photo digest. It contains no real journal data and needs no live account or AI call.

Import ZIP validation/reselection, cached-selection reopening, photo-upload start/pause completion and archive preparation allow fifteen seconds for decoding, IndexedDB and a verified server-prefix read on hosted runners. Ordinary clicks/assertions retain their existing defaults. This matches the existing recovery/network allowance and changes no screenshot tolerance or rendered content.

`expectDecodedPhotos` in the shared journal-session helper checks authenticated image count, load completion, nonzero dimensions and `decode()` before photo captures. Both import scenarios and the photo attachment walkthrough use it when opening or adding photos; a ready summary alone is not an image-readiness condition.

## Calendar, gentle streaks and return navigation

- [017-gratitude-calendar](tests/e2e/017-gratitude-calendar/README.md): week/date dispatch, continuous scrolling, single/multiple/empty dates, explicit backfill, restored month and repaired streak.
- [018-calendar-home](tests/e2e/018-calendar-home/README.md): private non-scrolling landing calendar, previous/current/next controls, heading-activated editable Month/Year dropdowns, current-month default on fresh visits, actual entry-coloured rings, browser Back/Forward and reload, independent draft preservation and account isolation. It also checks the landing controls at 320px, nine-/four-character fields on the same header row as the navigation, the longest month name, 32px square chevrons and Escape from the chooser.
- [019-calendar-editing](tests/e2e/019-calendar-editing/README.md): Resume/Keep/explicit discard, historical noon, nested date edits, original date/month returns and a second authenticated device moving an entry without jumping the calendar.
- [020-calendar-narrow](tests/e2e/020-calendar-narrow/README.md): 320px layout, 44px week buttons, native keyboard scrolling, seven-month DOM window and foreground Sunday rollover. Mobile-only by design.
- [021-calendar-cache](tests/e2e/021-calendar-cache/README.md): Firestore-only outage during a warm reload, retained provisional saved dates and server anchor verification on reconnect. HTML/auth stay available, so this does not simulate or claim offline cold starts. Initial cached availability allows 30 seconds because the SDK first exhausts its server probe; ordinary clicks and strict screenshot tolerances are unchanged.

- [022-calendar-signin](tests/e2e/022-calendar-signin/README.md): disabled empty signed-out calendar, overlay/footer sign-in links, Google authentication into Journal even for an empty account, consumed destination intent and the unchanged signed-in footer.

The calendar suite runs 017–018; calendar-edit runs 019–023. Every action, including scrolling, reload and keyboard navigation, has a full-page unmasked screenshot comparison and generated checks beneath it. Browser time, timezone and raw event fixtures are deterministic. Environment changes (network faults, source events and clock rollover) use explicit checked screenshot steps. The real calendar viewport is part of the product; screenshots themselves are never cropped or masked.

The anonymous landing scenario fixes the browser clock before loading the page so its empty calendar month is deterministic. It checks disabled controls, zero entry rings, the visible sign-in overlay and keyboard focus moving directly between sign-in links. The grey calendar and overlay are the real signed-out product state; there are no screenshot-only masks, styles or substitutions.

### Gemini instruction version compatibility

Scenario 007 asserts that the actual intercepted provider request contains the exact `SYSTEM_PROMPT`; its deterministic fictional response and screenshots remain unchanged. Unit tests independently check the user-supplied instruction text, new `gratitude-v2` requests, legacy `gratitude-v1` full/cached replay and unknown-version rejection. The Firebase suite exercises both tags and bypasses the append helper to prove Rules reject an unknown template version. The twenty-reflection selector is covered separately below. Instruction changes do not regenerate old AI output or change screenshot tolerance.

### Four-week rainbow

Scenario [023-rainbow-days](tests/e2e/023-rainbow-days/README.md) verifies same-day colours, the four-week yellow Sunday loop, date-aware draft previews, saved-versus-unsaved date edits, matching calendar circles, Today independence and full replay. Scenario 014 now expects colour to follow a saved date change. Unit fixtures cover all 28 unique shades, wraparound in both directions, civil-date/DST boundaries, timezone changes, original imported dates, cached replay and JSON export. The existing projection colour index is retained for compatibility but is no longer a palette lookup. The complete affected walkthrough baselines are regenerated and visually reviewed, retaining full-page capture, no masks and zero pixel tolerance.

### Twenty-reflection Gemini context

Scenario [024-ai-reflection-selection](tests/e2e/024-ai-reflection-selection/README.md) covers the implemented mixed selector: 8 anniversary, 7 rediscovery and 5 recent sources, original imported dates despite current receipt times, explicit feedback, changed editor dates, draft exclusion and successful-use projection across cached/full replay. Every action has a strict full-page unmasked screenshot with checks below it. Tests intercept the actual Gemini endpoint and reconstruct every captured context from the corresponding source-prefix snapshot, recorded seed and revisions; no live inference is used. CI runs 024 with 007/008 in both AI viewport jobs.

Unit tests cover sparse/large histories, calendar/year/leap/DST boundaries, consent, unbiased fixed-seed draws, legacy usage, failures, exclusions and bounded escaped JSON. Authenticated Firebase tests exercise full twenty-source/twenty-feedback requests, new daily/editor schemas, immutable retries, stale revisions and malformed direct writes under the actual Rules limits. Request reference maps use unique IDs and decimal revision strings to keep validation bounded. Projection version 7 adds disposable usage; older caches rebuild from source events. Monthly curated user notes remain deferred.

### LM Studio provider

[025-lm-studio](tests/e2e/025-lm-studio/README.md) has 53 action/check steps per viewport for authenticated model discovery, account provider selection, device-private credentials, the requested Gemma/thinking-off payload, daily and dated-editor generation, photo summaries, full/cached replay, and failures. A second browser starts with no local credentials and retains LM Studio rather than contacting Gemini. Tests intercept the local HTTP boundary using fictional tokens/model responses; they assert no Firebase credentials go to LM Studio and no local failure invokes Gemini. Source events exclude tokens, addresses and reasoning. Screenshots remain full-page, unmasked and at zero tolerance, with generated checks below each image. CI runs 025 in the AI suite in both viewports.

Unit tests cover URL/token validation, session/persistent storage separation, capability discovery, off/unsupported thinking controls, vision requirements, bounded exact final responses, failure handling and old/new event replay. Firebase tests exercise full twenty-source/twenty-feedback local daily/editor requests, provider-bound claims, rejected cloud claims for local accounts, malformed metadata and local photo events. Projection version 8 rebuilds old caches for the shared provider choice.

For concurrent interactive review and production test builds, use `GRATITUDE_KIT_OUT_DIR=.svelte-kit-live nix develop -c npm run dev -- --host 127.0.0.1 --port 5175`. The alternate generated output is ignored; the review watcher excludes ordinary test build output. Standard type checking and CI use `.svelte-kit`. Public Firebase configuration is required for live sign-in; API tokens are entered only in the model form.

The screenshot helper waits for two animation frames after moving to and restoring the capture origin, allowing real glass/backdrop layers to repaint before a full-page comparison. This does not modify rendered content or relax the zero-pixel contract.
