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

The questionnaire word-limit card uses explicit whole-pixel line heights, margins and control rows. A dynamic topic table exposed a one-pixel raster difference in its offscreen slider and endpoint labels on the locked Chromium, despite identical DOM boxes and fonts. The custom-topic textarea also has an explicit three-row height and whole-pixel line spacing at the standard font size, avoiding a separate intrinsic-border rounding difference. These are normal application styles; the native slider and resizable textarea remain functional. Static walkthroughs attach numeric range geometry/font information before and after capture to help diagnose differences; they never alter control values or rendered content.

As time-dependent behaviour is implemented, freeze the clock before opening the page. Seed randomized colours and identifiers and provide explicit storage fixtures. Stub AI responses and photo summaries at the application boundary; normal CI should not depend on live model output, credentials, cost, or network timing. Use fictional entries and photos, never private reflections.

Wait for observable conditions with Playwright assertions; do not use fixed sleeps. Assertions and actions default to a two-second budget, each test defaults to 30 seconds, and server startup has 30 seconds. Full-page screenshot comparisons allow thirty seconds to obtain two stable renders on constrained CI runners; their pixel tolerance remains zero. Authentication and reopening a journal with a pending outbox allow fifteen seconds for account restoration and server acknowledgement. Multi-step journal scenarios declare longer total budgets. A timeout change requires an explanation of the behaviour that needs it.

For photo replay, wait for the expected image count, each image's `complete` state and nonzero `naturalWidth`, then await `decode()` before comparing the screenshot. Matching summary text alone does not establish that the photos have rendered. Scenario 011 checks all three replayed photos this way.

The 37-step draft-recovery walkthrough has a 240-second total budget for hosted software rendering. Its earlier 150-second budget expired even though all 38 screenshot comparisons matched, including the final new-day screen. This total budget does not change individual action/assertion limits, the screenshot budget or zero pixel tolerances.

## Related checks

`npm run check` checks Svelte and TypeScript. `npm run test:unit` checks local-day identity/colour and preview truncation boundaries. `npm run test:deployment` verifies production replacement, preview isolation, closed-preview cleanup, and rejection of unsafe build inputs. These support the E2E checks; see [DEPLOYMENT.md](DEPLOYMENT.md) for publication behaviour.

## Firebase foundation scenario

Scenario `031-large-journal` seeds 701 fictional raw events, checks the twenty-card initial render and automatic twenty-card scroll batches, searches an entry outside those batches, visits Settings, restores entry focus/range and reloads the cached projection. Navigation timings are attached to its report as observations; structural bounds and functional assertions establish correctness without hardware-specific time limits. Scenario `032-week-navigation` exercises real mobile touch gestures, desktop dragging, horizontal-wheel momentum, keyboard navigation, historical-date selection and calendar statistics with multiple entries on one day. Both retain unmasked full-page screenshots after each user action and the standard zero-pixel comparison rule. The landing scenario also verifies deployment-scoped install metadata and alpha transparency in both icon sizes.

Scenario `033-landing-calendar-layout` uses a tall desktop and a narrow, tall mobile screen to compare the title and arrow-control coordinates across four-, five- and six-week months and the editable chooser. Calendar height may change downward; the controls stay anchored. Scenario 031 also exercises Today-to-landing navigation and checks that historical month rings still use the full 701-entry projection.

The week-wheel step starts with native mouse-wheel input and dispatches its two fictional momentum events in that same browser event turn. Separate automation round-trips can exceed the product's 200ms idle boundary on a loaded runner and represent separate gestures. Grouping the fixture inputs keeps the one-gesture assertion deterministic without changing the app's timing or screenshot rules.

Scenario `034-calendar-photos` uses fictional private attachments to check fogged photo circles in all three calendars, the landing offset, newest-dated-entry/first-live-slot selection, shared authenticated downloads, lazy offscreen loading, unavailable files, cross-device removal, reload, normal date navigation and sign-out isolation. Unit tests additionally cover date/timezone changes, removed and unsaved photos, cache eviction, failed reads and disposal during an in-flight request. The shared screenshot helper waits for visible calendar thumbnails to finish their real download and image decoding (or reach an unavailable state); it never replaces or hides them. CI includes 034 in the photos suite for both viewports. Walkthroughs retain full-page, unmasked, zero-pixel comparisons with checks below each image.

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

CI splits journal, drafts, AI, local AI, backups, credentials, photo, editor, import, calendar and calendar-edit scenarios into twenty-two viewport/suite jobs, with isolated emulators and serial workers in each. All twenty-two jobs, import-scale and the build must pass before publication. This keeps the expanded coverage within the existing job budgets without relaxing screenshot comparisons.

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

[025-lm-studio](tests/e2e/025-lm-studio/README.md) has 53 action/check steps per viewport for authenticated model discovery, account provider selection, device-private credentials, the requested Gemma/thinking-off payload, daily and dated-editor generation, photo summaries, full/cached replay, and failures. A second browser starts with no local credentials and retains LM Studio rather than contacting Gemini. Tests intercept the local HTTP boundary using fictional tokens/model responses; they assert no Firebase credentials go to LM Studio and no local failure invokes Gemini. Source events exclude tokens, addresses and reasoning. Screenshots remain full-page, unmasked and at zero tolerance, with generated checks below each image. CI runs 025 with 026 in dedicated local-AI jobs in both viewports.

Unit tests cover URL/token validation, session/persistent storage separation, capability discovery, off/unsupported thinking controls, vision requirements, bounded exact final responses, failure handling and old/new event replay. Firebase tests exercise full twenty-source/twenty-feedback local daily/editor requests, provider-bound claims, rejected cloud claims for local accounts, malformed metadata and local photo events. Projection version 8 rebuilds old caches for the shared provider choice.

For concurrent interactive review and production test builds, use `GRATITUDE_KIT_OUT_DIR=.svelte-kit-live nix develop -c npm run dev -- --host 127.0.0.1 --port 5175`. The alternate generated output is ignored; the review watcher excludes ordinary test build output. Standard type checking and CI use `.svelte-kit`. Public Firebase configuration is required for live sign-in; API tokens are entered only in the model form.

The screenshot helper waits for two animation frames after moving to and restoring the capture origin, allowing real glass/backdrop layers to repaint before a full-page comparison. This does not modify rendered content or relax the zero-pixel contract.

### Prompt feedback pairs

[026-prompt-feedback](tests/e2e/026-prompt-feedback/README.md) checks starter/generated question pairing at the actual Gemini HTTP boundary, the complete feedback beyond 250 characters, the Settings list, edit/cancel/save, individual deletion, reload, full/cached replay and both halves excluded when sharing is off. All actions have full-page unmasked comparisons at zero pixel tolerance and generated checks below each image. Unit tests also cover twenty-pair limits, 600/500-character escaped inputs, original manual/AI/starter questions, replacement/blank notes and malformed context. The existing full-capacity Firebase integration case asserts paired original questions and full feedback. CI includes 026 with 025 in dedicated local-AI jobs for both viewports, separate from the Gemini/generic suite.

### Slow-runner capture and save confirmation

Static walkthroughs 025/026 use `TestStepHelper(page, info, {paintStaticPage: true})`. Before full-page capture, the helper visits each viewport of the existing document and waits for paint, returns to the capture origin, then restores the actual user scroll position afterward. This prepares offscreen glass layers without changing content, styles, viewport size, blur or shadows. Never opt an infinite scroller into this preparation, because scrolling can load additional content. All screenshots remain complete, unmasked and at zero tolerance.

Full-page comparisons allow 30 seconds for two stable captures on slow runners. Shared reflection-save checks allow 15 seconds for the acknowledged Firebase save, matching other synchronization checks. These are bounded waits, with no automatic test retries or screenshot tolerance changes. The longer static model/feedback walkthroughs run in their own two-viewport CI suite so they do not crowd the Gemini/generic job's 20-minute limit.

### Personalised backup prompts and automatic refill

[027-backup-prompts](tests/e2e/027-backup-prompts/README.md) imports a fictional 102-question XLSX, rejects formulas, verifies repeated import, cycles/skips/selects questions without inference, consumes one on save, removes one offline, cold-reloads the actual installed service-worker shell, recovers an independent draft and synchronizes the removal. [028-backup-refill](tests/e2e/028-backup-refill/README.md) uses fictional local credentials/model output and Gemini HTTP responses to check independent refill preferences, the exact shared instruction/context, thinking off, replenishment to thirty, Today isolation and replay without inference. These run in their own `backups` CI jobs in both viewports.

Each action has a full-page screenshot comparison with no masks, `maxDiffPixels: 0`, `threshold: 0`, and generated checks below its image. Browser clocks and fixtures are deterministic. The app caches only public app pages and immutable build assets; the offline scenario disconnects the real browser context and reloads through the actual service worker. It does not replace the page or hide network status for screenshots. Real personal workbooks, questions and account identifiers never enter the repository or fixtures.

Static-page prepainting stops one whole pixel below the clamped scroll maximum so glass layers retain a whole-pixel raster origin. The final screenshot continues to capture every document row, and the user's actual scroll position is restored. The 102-question backup import allows three minutes for its individual acknowledged appends on hosted runners; it must still finish all 102 before capture, without test retries or relaxed image comparison.

The dynamic AI-settings page and its direct content surfaces round their intrinsic heights to the nearest CSS pixel, keeping the scroll boundary and moving card origins integral without changing text, blur or card styling. New credential controls have reviewed, regenerated Settings baselines. Workbook inputs enter the durable outbox together; transaction reads remain protected by the original atomic preconditions.

## Optional account model credentials

[029-account-token](tests/e2e/029-account-token/README.md) and its desktop companion cover explicit token saving, an independent device restoring the bound server/model/token, authenticated discovery without inference, token clearing when the destination changes, account deletion propagating to connected tabs, and reload after forgetting. All credentials and servers are fictional. Each action is followed by an unmasked full-page screenshot comparison at zero pixel tolerance, with checks beneath its image. Dedicated credential viewport jobs keep this coverage separate from the longer model/feedback scenarios.

Static walkthroughs retain numeric viewport/document and direct-surface geometry as test-report attachments. They contain no input values or journal/credential text and do not change the page. These diagnostics help distinguish a layout change from a compositor difference when a strict comparison fails.

## Local prompt protocol and recovery

[030-local-prompt-recovery](tests/e2e/030-local-prompt-recovery/README.md) and its desktop companion validate the OpenAI-compatible reasoning vocabulary independently of native model discovery. The client sends `reasoning_effort: "none"` and `chat_template_kwargs: {"enable_thinking": false}`. A synthetic HTTP 400 shows a notice next to the request control without exposing raw server diagnostics. Reload retains a projection-derived failure notice without inference; explicit retry succeeds and clears it. The lighter connection/credential CI jobs include this walkthrough in both viewports; model/feedback cases remain in their existing jobs. Every action has a full-page unmasked screenshot comparison at zero tolerance and checks beneath the image.

The interrupted-response scenario in 008 keeps response confirmations unavailable through reconnect/reload using a synthetic HTTP 503 on the demo emulator's `PromptResponseReceived` commits. It observes the failed reconnect attempt and restores backend access after the user selects Sync. This prevents the existing automatic reconnection sync from racing the reload fixture. No journal state, rendered content, clock or screenshot is replaced to achieve the comparison.

## Signed-out routing

[035-signed-out-routing](tests/e2e/035-signed-out-routing/README.md) and its desktop companion cover direct root, Journal, Settings and Journal sign-in links, reload, cancellation and retry of Google sign-in, restored account access to Settings, and immediate removal of private content on sign-out. All signed-out routes show the same empty, disabled landing calendar. Google authentication opens directly from the landing links; 022 covers both entry points. Each action has an unmasked screenshot comparison with `maxDiffPixels: 0` and `threshold: 0`, and generated checks below its image.

## Friends and hugs

The dedicated `friends` viewport jobs cover profiles/requests (036–037), while `friend-hugs` covers hugs/request controls (038–039). Together they cover [036-friend-profile](tests/e2e/036-friend-profile/README.md), [037-friend-requests](tests/e2e/037-friend-requests/README.md), [038-hugs](tests/e2e/038-hugs/README.md) and [039-request-controls](tests/e2e/039-request-controls/README.md), plus their desktop companions. They use fictional Google accounts in separate browser contexts and exercise real Firestore Rules. Profile choice, availability conflicts, discovery opt-out, cached restoration, source replay, request acceptance, private-journal separation, blocking/unblocking, hug delivery/read state and recipient preferences are documented action by action.

Every click, input, preference change and device switch is followed by an unmasked full-page screenshot comparison with `maxDiffPixels: 0` and `threshold: 0`; checks appear beneath each generated image. Firebase test files run serially so the existing integration suite’s database reset cannot race the social tests. Unit reducers additionally compare complete replay with cached-tail application; backend tests bypass client validation to verify acceptance/cooldown/projection protections.

Social fixtures clear only the disposable `demo-gratitude` Firestore emulator before starting. This also releases fixture handle reservations, so a repeated run can use the same deterministic usernames after Auth accounts are reset. No production/preview data is cleared.

The Google sign-in helper allows fifteen seconds for the popup to open, matching the existing authentication restoration budget. Firebase Auth loads its Google bootstrap script even when using the local Auth emulator; traces from a slow network showed the inherited two-second popup wait expiring before that script responded. This bounded wait adds no retries and does not change screenshot capture or pixel tolerances.

Friends is a direct heart-icon tab between Journal and Settings. Scenario 036 checks the four-tab order, selected yellow filled heart, the separate Account screen, and re-entry from Account. Account walkthroughs use the simplified Account menu label. The Friends job is split into two groups to avoid the repeated 20-minute hosted job cancellation; case limits, screenshot strictness and every action remain unchanged.

The complete 008 AI-recovery walkthrough has a 300-second case budget. A hosted navigation refresh reached the final consent-revocation captures before exhausting its former 180 seconds during scroll restoration. Every functional assertion and screenshot remains required; the provider timeout and individual assertion/screenshot budgets are unchanged.

The twenty-reflection context walkthrough (024) has its own `ai-context` viewport jobs. AI consent (007, plus generic 009) stays in `ai`; recovery (008) runs in `ai-recovery`. This keeps the full recovery sequence and context-selection captures within separate 20-minute job budgets.

## LM Studio model discovery and selection

[040-model-picker](tests/e2e/040-model-picker/README.md) and its desktop companion exercise the real AI-settings form against fictional LM Studio metadata. They discover multiple language models and loaded instance aliases, exclude embeddings, disable thinking-only models, update capability feedback without inference, retain manual entry and unavailable choices, save/reload a selected identifier, and clear the catalogue/token when changing servers. Rejected authentication and an empty list cannot reuse the previous server's choices. Every user action has a full-page unmasked screenshot comparison with zero pixel tolerance and generated checks beneath the image. The dedicated `model-picker` viewport jobs keep this walkthrough separate from credential recovery. Unit tests additionally cover malformed catalogues and inference addressed to the exact chosen model/alias; no real model calls or credentials are used.


## Independent prompt and photo connections

[041-photo-model](tests/e2e/041-photo-model/README.md) and its desktop companion use separate fictional servers, models and tokens for prompts and photo descriptions. They cover the default **Same as prompt model**, two independent model pickers, explicit save/account token sync, restoration on another device, an isolated photo-server outage and explicit retry, saving exact summaries, switching back to a shared vision model, and reload/full/cached replay without inference. Provider intercepts assert exact destinations and tokens; photo bodies exclude drafts and prompt context. Saved model changes on an unchanged remembered connection survive account restoration. Every action has a full-page unmasked screenshot comparison at zero pixel tolerance, and generated checks beneath its image. The dedicated `photo-model` CI jobs run both viewports.

Unit and authenticated Firebase tests also cover managed/local provider combinations, legacy shared behaviour, schema/version validation, stale requests/results, raw forged writes bypassing client validation, and independent credential deletion/privacy. `AIChoicesConfirmed` schema 4 and `PhotoSummaryRequested` schema 3 retain user-selected task/provider/model inputs; projection version 10 rebuilds older caches. No credentials or server addresses enter journal events or exports.

Secondary browsers in the credential and independent-photo walkthroughs apply the same external CDN exclusion as the first journal browser, foundation and friend-device fixtures. This keeps emulator sign-in on the pinned Nix fonts and avoids runtime Roboto/Material downloads. Authentication content remains visible, with complete screenshots and zero tolerance; no screenshot-only style or masking is used.

Scenario `042-accent-colour` covers all fourteen account accents on mobile and desktop, smoke and shared theme tokens, unchanged date-coloured reflections, cached reload and a fresh-device replay, signed-out yellow, growing/shrinking AI guidance with its 500-character limit, and expanded/collapsed Prompt info. Every action has a full-page comparison and generated walkthrough checks below the image. The `appearance` Firebase CI suite runs this scenario.

## Community gratitude follow-up

Scenario 043 covers prefix/interior username matches, shared individual/community streaks, a real backfill repairing the shared run, the longest shared run after a later break, withdrawal of sharing on both devices and full social replay. Scenarios 036–039 cover the updated profile form, heart buttons and friendship controls. The helper awaits real consent/date subscriptions (`data-streaks-loading`) before full-page comparison; it never hides content or relaxes zero pixel tolerance. Raw fictional history setup precedes observed UI actions; backfill itself is performed in the real editor and screenshot after each action.

## Background hug delivery

Scenario [044](tests/e2e/044-hug-notifications/README.md) covers permission denial/recovery, explicit upgrade from an older worker without reload, cached public modules for existing tabs, native notification display/deduplication with no app tab, the notification’s actual Friends link, opt-out and sign-out. Only external subscription acquisition is fictional; CDP dispatch reaches the real worker and `registration.getNotifications()` inspects native notification data. The blank browser capture represents the actual state after every app page closes; the OS panel itself is not captured. Physical Firefox/Android permission and notification taps remain a manual check. The live preview-only encrypted-provider smoke test is described in [push operations](PUSH_NOTIFICATIONS_DESIGN.md).

The shared screenshot helper waits for real Friends and notification mutations to finish (`aria-busy`) before capture. Profile editing stays open until its save is confirmed, so the completed form state includes the success notice. These observable state waits fix a save/paint race without fixed delays, content changes or tolerance changes. Community scenario 043 has its own CI suite: grouping it with 036/037 had approached the twenty-minute job limit.

Scenario 024 additionally verifies that requesting another question appends the exact prior AI question in the final JSON field, resamples all three context pools with fresh alternatives, retains explicit feedback and respects editor dates. Its expanded fictional anniversary history makes fresh anniversary sources available. The walkthrough reconstructs each intercepted context from its request-time source snapshot after a complete replay. Legacy selector draws remain pinned by unit tests; cloud/local daily/editor schemas and malformed source references have backend coverage.

Scenario 042 also measures the real selected-icon and indicator colour against each of the fourteen picker swatches and verifies the original border tint/opacity. It checks that the Today wordmark star shares the graphical highlight. An offscreen canvas resolves computed CSS colours only; it never changes or replaces rendered content. The visible page is still captured in full with unmasked, zero-pixel comparisons. Small-label and graphical contrast bounds have separate palette property tests.

The explicit account palette uses the written hex points retained in `docs/ux/ACCOUNT_PALETTE.md`. Scenario 042 checks the exact picker source, selected-slot persistence, strongest readable icon tint, original border opacity, and smoke colour/blend isolation for every point. The default yellow and background tint change across the application, so the baseline refresh includes all scenarios and the separate generic-AI build.

Edit-save confirmation in scenarios 003 and 014 uses the existing fifteen-second server-acknowledgement budget. Their previous two-second UI assertions could expire while the real form still displayed Saving… under load. This wait targets completed persistence; it does not change screenshots, content or pixel tolerances. Warm the emulators with the backend suite before large refreshes, and bound JVM resources when running isolated groups concurrently.

Before taking a completed-action screenshot, wait for the operation's actual completion: a model form's busy state must end, remembered account credentials must appear, a saved backup form must close, and reloaded journals must synchronize. A heading or a previous success message can exist while the new operation is still running. Photo summaries can arrive before authenticated image bytes; await actual image decoding again after remounts and entering Journal. Intentional pending/offline steps retain their own explicitly asserted states.

Fixture intent must also be consistent: a new Today draft cannot race with a saved reflection for that same date. Scenario 018 explicitly freezes the browser one day after its saved current-month entry; other scenarios retain their clock. Fix fixture dates and readiness assertions rather than hiding, replacing or cropping content, or accepting differing pixels.

After a broad baseline refresh, run a comparison-only pass over every regenerated scenario, not only the feature-specific walkthrough. A successful `--update-snapshots` invocation can commit a temporarily stable loading state; it does not establish repeatability. Check the intended completed state before capture and compare all refreshed paths without updating snapshots. Scenario 041 allows thirty seconds for the chained photo attach/request/failure confirmation, which includes several persistence operations before its terminal notice. Pixel tolerances remain zero.

CI runs scenario 025 in `local-ai` and scenario 026 in `prompt-feedback`, separately for mobile and desktop. Their combined desktop job exceeded the twenty-minute budget after the LM Studio story had passed. Both suites retain backend checks, strict screenshot comparisons and generated-document verification, and publication requires the complete matrix.

Draft-save and export-ready confirmations in scenarios 004/005 use the fifteen-second persistence budget rather than the two-second input-response budget. Opening an editor awaits both an enabled control and the actual recovered draft. Give local emulators adequate CPU before diagnosing timing failures during broad parallel refreshes; do not compensate with screenshot masks or pixel tolerance.

Scenario 024 allows thirty seconds for each twenty-source prompt request and its received-result commits, including the dated editor. These multi-commit requests remained in their real Finding a prompt… or received-result outbox states at fifteen seconds locally; the assertions wait for the actual result. Content assertions, provider mocks, action budgets and screenshot comparison rules are unchanged.

## Onboarding coverage

Walkthroughs [045](tests/e2e/045-private-answers/README.md)–[048](tests/e2e/048-onboarding-existing/README.md) cover private answers on two devices, the complete optional setup, cloud/local instruction and context, long-question editing and recovery, existing histories, 320px reflow and durable offline skipping. Other signed-in scenarios explicitly skip the welcome through the real UI and capture both the welcome and the resulting page. Source fixtures append after that real skip event instead of overwriting its sequence. The CI `onboarding` suite runs all four scenarios on mobile and desktop.

Every onboarding browser context, including the second-device flow, uses the existing external-font isolation from the journal fixtures. Google emulator popups therefore use the reproducible local fallback fonts rather than racing internet font downloads. Regenerate the complete popup images when changing fixture dependencies, then run ordinary comparisons; do not mask text or accept differing pixels.

## Removing obsolete baselines

Wait until generation succeeds before pruning old image names. Parse image references from both generated README variants, including their `./screenshots/` prefix. Abort if a walkthrough yields zero references or any referenced image is missing; review the candidate list before deletion. Preserve raw comparator output before another Playwright run clears its output directory. Restored or renamed raw PNGs still require ordinary zero-tolerance comparisons; recovery does not justify editing pixels, masking or increasing tolerance.

## Additional model services

Scenarios [049](tests/e2e/049-local-services/README.md) , [050](tests/e2e/050-personal-cloud/README.md) and [051](tests/e2e/051-compatible-service/README.md) exercise native discovery, separate photo settings, final-text prompts, explicit cloud terms, cross-browser keyless restoration and deletion. They intercept fictional provider/callable boundaries; `tests/relay` separately exercises actual encrypted storage and authorization against Firestore. The CI push-backend job runs relay tests after notification delivery tests. No live inference or real keys belong in these fixtures.


## Starter and reserve rotation

Scenarios [052](tests/e2e/052-prompt-rotation/README.md) and [053](tests/e2e/053-starter-cooldown/README.md) cover category changes, same-day uniqueness, offline offer/draft recovery, wording edits, complete draft discard, consumption only after save and the exact thirty-day eligibility boundary. Every UI action has a full-page, unmasked zero-pixel comparison and generated checks beneath its image. The dedicated `prompt-rotation` CI jobs run both viewports.

`scripts/firebase-test.sh` supplies a fixed `VITE_PROMPT_RANDOM_SEED` as a fixture input for prompt draws; normal and published builds omit it. It does not replace content, alter credentials or override browser-wide randomness. The helper waits for the actual offer to finish persisting on the device and, when online, for its source outbox to sync before capture. Offline screenshots retain visible content and durable queued actions. Existing backup walkthroughs now assert random unseen offers and consumption at save, preserving edited originals and keeping discarded or replaced selections available.

The cold-offline reserve walkthrough passes its explicit fixture network state to the capture helper. After a service-worker reload, navigator.onLine can be true despite the deliberately disconnected browser; do not wait for a cloud acknowledgement in that state. This does not change rendered content or pixel comparisons. Reconnection still verifies that the queued choices and removals reach the canonical stream.

Prompt consumption follows saved reflections. Scenario 052 discards edited starter and backup drafts, reloads without consuming them, returns a never-attempted offline save to the editor and discards it, then restores another durable save and verifies only its final original is consumed. Scenario 053 reaches its day-thirty save on the emulator’s fixed 1 October receipt date, so browser and server dates agree for the new save step. The existing historical acceptance fixtures remain literal source actions.
