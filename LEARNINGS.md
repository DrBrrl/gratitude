# Project learning log

Record meaningful discoveries, decisions, and unanswered questions as work proceeds. Keep evidence distinct from assumptions. Append dated entries, and explicitly note when later evidence supersedes an earlier conclusion.

For future entries, capture the context, observation or decision, supporting evidence, implications, and any follow-up. At completion, add a retrospective covering outcomes, useful practices, mistakes, and remaining questions.

## 2026-09-10 — Project foundation

### Confirmed requirements

- The project is called Gratitude and is being started on a Nix system.
- It will be a responsive SPA with a daily AI-generated gratitude prompt and a way for the user to respond.
- Prompting should adapt to the user over time.
- The project will use GPLv3.
- Development prompts must be retained verbatim, and lessons must be recorded for later review.

Evidence: the initial user request in [PROMPTS.md](PROMPTS.md).

### Observations and initial decisions

- The workspace was empty and had no Git repository. A local repository was initialized with a `main` branch.
- The project begins with documentation; no application stack or AI provider has been selected.
- The license is recorded as GPL-3.0-only, using the GNU-published GPLv3 text. The request names version 3 without specifying an “or later” grant.
- A reproducible Nix development environment is planned, but its contents depend on the stack selection.
- Privacy controls, a journal history, feedback, and the other experience details in VISION.md are proposed design requirements derived from the product idea. They have not been implemented or validated with users.

### Hypotheses to test

- A daily prompt makes it easier to start reflecting than an empty journal page.
- Explicit preferences and feedback may provide useful personalization without custom model training.
- Optional participation and gentle wording help make the practice sustainable.

### Open questions

- Who is the first intended user, and what would make a prompt appropriate for them?
- What frontend and backend, if any, fit the intended deployment and Nix workflow?
- Should journal data remain local, synchronize across devices, or live on a server?
- Which model will generate prompts, what context may it receive, and what cost and latency are acceptable?
- How will personalization be explained, reset, and evaluated?
- How should time zones, missed days, offline use, and failed generation behave?
- What marks the first release and the point for the project retrospective?

## 2026-09-10 — Keep the vision focused on the end state

The user clarified that VISION.md contains only end-state statements: no roadmap, judgement, evaluation, or qualifications about implementation status. The initial version mixed these concerns into the vision. Removed them and corrected the README's description of the document. This supersedes the earlier framing of the vision as a place for scope and evaluation planning.

Evidence: the vision content correction in [PROMPTS.md](PROMPTS.md). Future vision edits must describe the finished product; process, discoveries, and status belong in other project records.

## 2026-09-10 — Preparing the first GitHub pull request

GitHub CLI was not on PATH. Running `nix shell nixpkgs#gh -c gh …` makes it available without changing the system configuration. GitHub CLI initially had no authenticated account; browser device authorization is required to log in.

An empty initial commit on `main` provides the base for a separate documentation branch, allowing all six project files to be reviewed together in the first pull request.

## 2026-09-10 — GitHub authentication and visibility

GitHub CLI authentication completed successfully for `DrBrrl`, using HTTPS for Git operations. The user explicitly requested a public repository; this supersedes the assistant's proposed private default.

## 2026-09-10 — Mobile UX proposal

The user prioritized a mobile-first experience and requested image-generated mockups for the core stories. Work began on `design/mobile-ux` from the merged `main` at `536603d`.

The proposal covers fifteen screens on five boards: starting and receiving prompts, writing and feedback, alternatives and history, personalization and data controls, and failure recovery. UX_DESIGN.md maps these screens to stories and records interaction behavior. These are design decisions for review, not findings from user testing.

Writing requires an explicit distinction between a draft preserved on the device and a successfully saved journal entry. Generation failures need a bundled starter prompt, while save failures must retain the text and provide retry. The storage architecture remains undecided; the design does not imply synchronization is already available.

Image generation produced readable concept boards but introduced redundant hamburger navigation on one board and varied navigation icon shapes between boards. A targeted image edit removed the redundant menus. Use the written interaction specification for behavior, and standardize icons and measure accessibility in implementation. Static mockups cannot establish keyboard behavior, contrast compliance, or data durability.

Exact image generation prompts are stored separately under docs/ux/prompts, and final PNG assets are stored in docs/ux/mockups. All example reflections are fictional. The end-state-only vision was left intact.

## 2026-09-10 — Dark glass revision, journal browsing, and discovery

The user's design review replaces the light surface direction with a dark-mode-only glassmorphic application. It also requires rainbow entry colours, larger consistently sized collapsed cards, journal search, a few onboarding questions, Markdown alongside JSON export, a visible Settings mockup, and top-level access to AI settings. This supersedes the initial three-tab navigation and JSON-only design.

The revised proposal uses Today / Journal / AI / Settings tabs and three optional onboarding questions about topics, tone, and time. Entry colours are assigned from a repeating rainbow palette and remain stable during edits and search. Equal-height cards prioritize response text so short entries can be read without opening them. Long entries open in a full view; accessibility text enlargement increases the shared preview height rather than squeezing text.

Search must match full saved text rather than previews. No-results, empty-journal, unavailable-cache, and search-failure states have different meanings. Both export formats include complete saved entries, independent of a current search. The specific colour cycle, 256-pixel default card height, search matching rules, and export layout are design proposals, not usability findings.

The revised boards are generated through the built-in image tool using the prior boards as references where applicable. Initial image inspection found unequal collapsed card heights despite an explicit equal-height prompt, requiring a targeted layout edit. Generated images communicate the style but precise sizing and contrast still require implementation checks.

The first card-sizing edit had little visual effect. A second edit shortened the fictional example and recomposed typography, producing a more uniform layout. Small height differences and an omitted search highlight remain documented in UX_DESIGN.md; implementation must enforce fixed card dimensions and match highlighting. All seven final boards were visually inspected, and their document links and PNG files were checked.

## 2026-09-10 — Yellow ink, text feedback, photos, and simpler navigation

The user selected yellow as the main accent and requested clouds or ink in water instead of the aurora background. This revision chooses static dark ink-in-water plumes. Rainbow entry tints remain separate from the yellow action colour. Short freeform prompt feedback replaces binary ratings and reason chips; a proposed 300-character limit keeps it lightweight.

Follow-up instructions require the prompt to appear on journal entries, today's assigned colour to be visible before saving, photo attachments with AI text summaries, and AI settings as a row in Settings rather than a fourth navigation tab. The resulting navigation is Today / Journal / Settings. This supersedes the previous four-tab decision, response-only collapsed previews, and colour assignment at save time.

The daily colour is reserved when the prompt is opened and carried through the draft and saved entry. Cards now reserve room for prompt and response, with a larger proposed 360-pixel common height. Summaries are editable and searchable; photo processing has independent disclosure and controls rather than silently enabling journal-based prompt personalization. Summary failures must retain the attachment and allow retry or manual text.

Photos affect export and deletion: photo-bearing exports include the Markdown or JSON file plus image assets in a ZIP, and entry deletion also removes its photos and summaries. These are design proposals; storage, image-model integration, and file handling are not implemented.

The navigation and photo instructions arrived during image generation. Earlier yellow renders are intermediate drafts; the final review set incorporates the later instructions. Exact prompts are retained separately so this iteration remains traceable.

All eight selected boards were visually inspected. The final images show three-tab navigation, yellow actions, visible journal prompts, freeform feedback, and the photo-summary flow. Generated journal samples abbreviate some text and card dimensions vary slightly; the specification requires preserving actual entry text and enforcing a shared height. Final asset links and PNG files were checked before publishing.

## 2026-09-10 — Initial SvelteKit scaffold and Pages previews

Started `feat/initial-sveltekit-scaffold` from merged main at `5eeccfb`. Read anicolao/food's E2E_GUIDE.md at commit `578663f1204a9064de47dd63eda7a143c38288a6`. Adapted its numbered scenarios, documented verification steps, and screenshot evidence into Gratitude's guide and helper. Screenshots are evidence only; pixel comparison is not implemented and Nix/CI browser rendering is not assumed identical.

The official Svelte CLI supplied the initial Svelte 5 / SvelteKit / TypeScript files. The app uses adapter-static with prerendered routes and Node 24. The CLI's initial inline auto-adapter configuration needed replacing with a plain `sveltekit()` Vite plugin call so the static adapter in svelte.config.js is used. Nix supplies Chromium directly because Playwright's downloaded Linux browser is not a reliable executable on Nix systems; CI installs Playwright's matching browser on Ubuntu.

The landing page is a static introduction using dark glass and yellow accents. It does not implement journaling or AI. Svelte checks passed with no errors or warnings. The landing scenario passed at mobile and desktop sizes with the root base path, `/gratitude`, and `/gratitude/pr-preview/pr-999`. Five deployment unit tests passed, and actionlint accepted the workflow.

GitHub Pages has one site per repository, so the deployment stores production and per-PR directories together on a generated gh-pages branch. Official Pages artifact deployment publishes that combined state; a GITHUB_TOKEN branch push alone would not trigger a branch-source Pages build. Publication is serialized and prunes closed PRs on every update. Fork PRs receive checks only; same-repository PRs can publish. Pages environment restrictions must permit PR refs for that workflow. AI credentials and a backend will require a separate architecture decision because Pages is static hosting.

The repository's Pages source was configured for Actions, its github-pages environment permits PR refs, and the deployment state branch was bootstrapped. PR #3's initial CI run passed both build and publication; the live `/gratitude/pr-preview/pr-3/` URL then passed the mobile and desktop Playwright scenario. Its screenshots matched the corresponding local preview screenshots byte-for-byte in this run, which is evidence for this page rather than a cross-platform rendering guarantee. Production deployment and close-event cleanup still await a real main merge/PR closure; their assembly behaviour is covered by unit tests. GitHub emitted Node 20 action-runtime deprecation notices while successfully forcing those pinned actions to Node 24; future action upgrades should address the notices.

## 2026-09-10 — Correction: screenshot comparisons and generated scenario READMEs

The user clarified that the food-style E2E workflow requires screenshot diffs and generated READMEs with images followed by verification lists. The original scaffold omitted those behaviours; report attachments were not an adequate implementation. Reviewed Jaipur's helper, Playwright configuration, and generated scenario README at `76cc8bcaa8d4f111c2ebc26b67162ca646b4576a` to confirm the pattern.

The helper now uses Playwright screenshot assertions with zero differing pixels and zero colour-distance threshold, then generates scenario Markdown from successful steps. Mobile and desktop have separate generated READMEs to avoid parallel writers. Both embed committed baseline PNGs above the checks. Ordinary runs reject missing baselines; updates require the explicit snapshot-update command. CI checks generated files against git and does not update baselines.

The same locked Nix Chromium and DejaVu font configuration now run locally and in CI, replacing the different browser installation used by the original workflow. Baselines were generated on x86_64 Linux and visually inspected. Passing comparisons were followed by deliberate negative probes: a one-pixel overlay failed with a one-pixel diff, and removal of a baseline failed without regenerating it. Both probes preserved the baseline/README state, and temporary changes were restored. This supersedes the earlier decision to defer visual regression testing.

The first CI comparison exposed a real reproducibility gap: `makeFontsConf` includes host font directories and `/etc/fonts/conf.d`, even with an explicit font list. The diff was concentrated in typography. Replaced it with an isolated fontconfig file containing only pinned DejaVu fonts and explicit generic-family aliases. Regenerated and inspected both baselines; ordinary local comparisons pass with zero tolerance. Do not assume a helper named `makeFontsConf` isolates the host without inspecting its output.

## 2026-09-10 — MVP event-sourcing design proposal

Started `design/mvp-event-sourcing` from merged main at `79c4c9f`. Inspected Jaipur's event types, deterministic game rules, and repository at `76cc8bcaa8d4f111c2ebc26b67162ca646b4576a`, and food's MVP design, store, IndexedDB repository, and synchronization code at `578663f1204a9064de47dd63eda7a143c38288a6`. Jaipur caches events rather than a materialized projection; Gratitude needs an explicit checkpoint-plus-tail path. Food includes computed AI/entry payloads, so copying it literally would violate the user's stricter action-only requirement.

The design proposes a local single-installation MVP, typed user-action schemas, transactional sequence ordering and idempotency, versioned disposable checkpoints, and equality checks between complete replay and incremental recovery. Colours, prompts, summaries, settings, and search belong to projections. Infrastructure metadata and original user-provided photo inputs are distinguished from computed domain values. Editing generated text must retain only the user's edits rather than laundering the original AI result into an action payload.

There is a source-of-truth decision to review: nondeterministic hosted AI cannot reproduce exact output from user actions alone. The draft takes the strict interpretation, with deterministic versioned local inference as a feasibility gate and immutable external response artifacts described only as an alternative requiring an explicit contract change. No model/runtime or mobile performance guarantee has been established. The clarification question about response artifacts is not recorded as user approval.

Erasure also affects replay: deleting an input needed to recompute another entry's prompt prevents reproduction of that result. The strict proposal makes dependent results unavailable after erasure while preserving surviving user text, and calls out this UX amendment for review. Scoped encryption and recovery tests are proposed, not implemented privacy guarantees. The implementation plan gates AI and erasure work on resolving these tradeoffs and requires the corrected screenshot-diff/generated-README workflow throughout.

## 2026-09-10 — Correction: recorded AI responses and Firebase across devices

The user clarified that AI responses are events, following food, and replay must never redo AI requests. Firebase with Google sign-in and a per-user stream across devices is selected. This supersedes the proposed deterministic local model, local-only scope, separate authoritative response-artifact alternative, and dependent-prompt loss after deleting its source. The revised event contract distinguishes external response facts from locally computed projection values.

The revised design separates live authenticated command/worker processing from pure replay. Firestore provides canonical sequences; local checkpoints resume from the confirmed cursor and pending offline commands stay in a separate outbox. Google UID scopes ownership. Gemini response events preserve exact historical text, so replay remains independent of provider availability and model changes. A transactionally accepted response is idempotent, while a crash after a provider response but before storage can still repeat a provider call; do not claim exactly-once billing.

Verified that the repository contains the Actions secret name GEMINI_API_KEY without reading its value. It belongs in the backend's Secret Manager binding, not a Vite/Pages bundle. GitHub authentication and the Gemini key do not authorize Firebase administration. Firebase CLI 15.30.0 runs under the Nix shell, but its project listing reported missing authentication; the workspace has no configured Firebase account. Project creation was requested and attempted; provisioning details and the outstanding login are tracked in FIREBASE_SETUP.md.

Reviewed official Firebase documentation for Google sign-in, security rules, callable functions, Firestore transactions and trigger delivery, secret binding, project creation and Storage billing, plus Gemini key security guidance. The implementation plan now starts with Firebase resources/auth and includes same-user two-device tests, cross-user denial tests, offline conflict handling, recorded-response replay with zero Gemini calls, and the existing screenshot-diff/generated-README E2E workflow.

## 2026-09-24 — Firebase foundation and live provisioning boundary

Implemented Google sign-in, authenticated callable append, owner-readable/client-write-denied Firestore streams, transactionally assigned sequence numbers, retry IDs and expected-revision conflict detection. The first action is `ReflectionWritten` against a versioned fixed starter prompt. Prompt text, colours and entry state are projections. The private server revision index can be deleted and reconstructed from events before an edit. Gemini remains a later increment; no provider calls are hidden inside replay.

The browser caches a checksummed projection and cursor in one IndexedDB value, validates its server anchor, then subscribes to the tail. Explicit saves first enter a durable per-user outbox. This is not automatic draft persistence or full offline startup: there is no service worker or persistent event cache yet. Namespaces include project, deployment path, UID and stream generation; Pages paths share an origin and do not isolate hostile scripts.

Firebase CLI authentication succeeded after the user logged in. Creation registered Google Cloud project `gratitude-drbrrl` (`696882301155`), but Firebase activation returned 403 even with verified Owner and required project permissions. Official Firebase troubleshooting lists unaccepted terms as a possible cause; console review has been requested. This remains a hypothesis until activation succeeds. GitHub/Firebase authentication, cloud project creation and activation are separate checkpoints; do not report a live Firebase backend from CLI login alone.

Functions targets supported Node 22, while the frontend shell retains Node 24. A dedicated Nix `firebase` shell includes Java 21 and the same pinned Chromium/fonts. Emulator ports avoid a pre-existing service on 8080. The demo project ID and localhost restriction prevent emulator test builds from contacting the real project. A separate CI job tests the backend and journal; only the normal frontend job supplies the Pages artifact.

The generated journal walkthroughs use real Auth-emulator popup interaction and fictional accounts. Integration tests verify isolation, rejected direct writes and forged events, duplicate retries, stale revisions, revision-cache reconstruction and full/cached replay equality. Browser tests verify cross-device reading, reload, rebuilding and sign-out. Passing full-page screenshot comparisons cover both mobile and desktop. Full-page capture must be passed explicitly by the step helper: relying on the existing global assertion configuration produced viewport-height images that omitted the saved entry. Baselines were regenerated and visually inspected after correcting the helper.

The backend deploy workflow is manual and main-only, with emulator checks before Workload Identity Federation authentication. Cloud resources, billing and deployment IAM remain external prerequisites; no service-account key or Gemini key is included in frontend builds.

A follow-up browser test deliberately corrupts a checkpoint and interrupts a save across reload. It exposed a status race: a successful stream read overwrote “not synced” while the outbox still held an unacknowledged write. The listener now preserves pending-write status; a read is not evidence that a write succeeded. The regression checks recovery from corrupt cache and durable retry without duplicate entries.


## 2026-09-24 — Checking the gcloud activation route

At the user’s suggestion, checked the Google Cloud CLI route. `gcloud` had no active account, so reused a short-lived token from the existing Firebase login through a mode-0600 temporary file, removed after the command. `gcloud services enable firebase.googleapis.com --project=gratitude-drbrrl` succeeded. A direct Management API `projects.addFirebase` call then still returned 403 `PERMISSION_DENIED`; API enablement alone does not complete Firebase activation. No credentials were printed or committed.

The documented `gcloud alpha firebase projects create` command can provision into an existing project, but also initializes resources in `us-west1`, so it was not used for our Sydney design. Used the narrower documented Management API activation operation instead. The terms explanation remains a hypothesis; the API provides no more specific reason. Sources: [gcloud command](https://docs.cloud.google.com/sdk/gcloud/reference/alpha/firebase/projects/create), [Firebase activation and troubleshooting](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project).


## 2026-09-24 — Activation succeeded after terms acceptance

The owner reported accepting Firebase terms. The next `projects:addfirebase gratitude-drbrrl` operation succeeded, resolving the previous 403. Registered web app `1:696882301155:web:3fdeda713681e3ed685dd6`, enabled Google sign-in, verified the OAuth client exists and authorized the Firebase domains, Pages origin and localhost. Created the default Native/Standard Firestore database in Sydney (`australia-southeast1`) and deployed repository rules and indexes successfully. Setup did not create journal data.

Firebase CLI 15.30.0 supports auth provisioning from a temporary `auth.providers.googleSignIn` configuration. It automatically adds the Firebase auth handler redirect URI; supplying that URI explicitly caused a duplicate-URL error. Retrying without the duplicate succeeded. The support email came from the owner’s existing CLI account; no OAuth secret or personal support email was committed.

The project has no billing account linked, and Cloud Billing lists no accounts accessible to the current login. The owner has been asked to link their intended account so Cloud Functions can deploy. Activation, configured authentication and deployed Firestore rules are confirmed; deployed Functions, mobile OAuth verification, deployment IAM and a working hosted journal remain outstanding.

## 2026-09-24 — Cloud Functions is a design choice, not a product requirement

The user challenged the billing/Functions requirement. The current implementation uses a callable function for validation, ordered append, retry handling and revision conflicts; the design also assigns it private Gemini credentials and background work. These are reasons for the chosen implementation, not evidence that this application inherently needs Cloud Functions.

Firestore browser transactions plus Security Rules can enforce owner-scoped atomic event/head/revision writes and immutable events. A redesign must preserve the existing replay, idempotency and conflict tests rather than simply allowing unrestricted client writes. Firebase AI Logic is a candidate managed client integration for Gemini without maintaining our own Functions proxy; it supports a Gemini Developer API no-cost tier subject to quotas and conditions. The repository’s private Gemini key must still never enter the browser. Sources: https://firebase.google.com/docs/firestore/manage-data/transactions and https://firebase.google.com/docs/ai-logic/pricing.

Recommendation: remove the custom Functions dependency for the MVP and evaluate Firebase AI Logic separately. This is a proposed architecture revision, not an implemented change. The billing setup request is no longer a prerequisite the user should act on while this choice is being reconsidered. Existing deployed Firestore rules still deny client writes; they must be redesigned and tested with the client transaction implementation before the hosted journal can save.

## 2026-09-24 — Complete the preview without Cloud Functions

The user asked to finish after noticing that a successful Pages redeployment still showed sign-in unavailable. Root cause: the build never received Firebase SDK configuration. Resource provisioning, a successful CI run and an HTTP 200 were not proof of a usable sign-in screen. The Pages build now explicitly selects committed public configuration for production or the separate `gratitude-drbrrl-dev` preview project. A configured-build browser assertion checks for the actual Google sign-in button and absence of the unavailable message.

Replaced the callable save function with browser Firestore transactions and independently enforced Security Rules. Every write creates one immutable action event, advances the head by exactly one and updates that entry's last-event pointer. Rules derive expected revision from the prior event and require a server timestamp. The reducer normalizes timestamps and ignores locally pending snapshots. Removed the Functions source/dependencies, emulator and Node 22 shell. The remaining manual backend workflow deploys only rules/indexes; its optional federated identity is not needed to use the app.

Concurrent browser transactions can receive permission-denied from Rules before the SDK retries a conflicting precondition. An identical, server-confirmed event is accepted as a retry acknowledgement; otherwise bounded retries reread the head and revision. Emulator tests cover concurrent new entries, conflicting edits, duplicate retries, cross-user/anonymous/non-Google access, forged fields, wrong timestamps/sequences, unknown generations, detached head/pointer writes and event mutation. Browser tests retain zero-pixel screenshots and verify corrupted-cache recovery and a saved offline outbox across unloading/reopening the page.

Created development project `gratitude-drbrrl-dev` (`959183629113`), web app `1:959183629113:web:33d4c1d0ab65759fe796e8`, Google provider and Sydney Firestore. Preview data is separate from production; both authorize the Pages origin. No billing account was linked, no Gemini secret was exposed, and AI integration remains planned. Client-written future AI response records will be private user records rather than provider-attested evidence; replay still consumes their exact recorded text without inference.

## 2026-09-24 — Production feature series: journal navigation and search

Started `feat/production-journal` from merged main `84d69b1`. The first increment adds Today/Journal/Settings navigation, equal-height rainbow cards, full-entry views, editing and all-word case/accent-insensitive search with highlighted matches. The editor shows the next projected colour before saving. Colours remain derived from events and are not recomputed from filtered results.

The user requested a screenshot after every action. The walkthrough helper now supports action-plus-check-plus-screenshot and popup capture. The existing foundation scenario was expanded to include every navigation, click, text input and connectivity action; the new search scenario demonstrates the full browse/edit flow. Auth emulator account state is reset per scenario and scenarios run serially so the Google account picker is reproducible. Server-generated dates are masked explicitly; all other pixels retain zero tolerance. Rounded blurred surfaces produced intermittent edge rasterization differences, so the interface keeps translucent tinted surfaces without backdrop blur. No screenshot tolerance was relaxed.

## 2026-09-24 — Durable local drafts

The second feature increment persists raw unfinished save actions in the per-account IndexedDB outbox as the user types. A draft keeps its stable action/entry IDs and original edit revision; reload can detect an already committed save before restoring the editor. Ordered local writes prevent a late autosave from resurrecting a discarded draft. Saving clears the local draft only after the action is safely in the durable save outbox. These are device drafts, not cross-device cloud draft events; the UI states that limit explicitly.

Added a native confirmation dialog for discard, local-save status, navigation/reload recovery and a step-by-step E2E scenario including cancel, save, discard and subsequent reload. Storage errors keep the editor text and do not claim persistence. Future offline cold-start and cross-device draft synchronization remain separate work.

## 2026-09-24 — Complete journal export

The third feature exports Markdown and JSON from a verified immutable event prefix fetched from Firestore. Search filters and local projection checkpoints cannot silently truncate the export. Drafts are excluded, pending saves must finish first, and offline export reports that a connection is required. Markdown escapes user-authored formatting/HTML; JSON preserves exact text. Both retain the original prompt, date and projected colour. The E2E walkthrough inspects actual downloaded files and places these checks under the corresponding screenshots.

## 2026-09-24 — Live AI feasibility, separate from the released journal

Provisioned Firebase AI Logic for the development project only using the authenticated Firebase CLI provisioning API. A fictional one-question smoke request through the browser-compatible Firebase SDK succeeded with `gemini-3.6-flash`, without reading or exposing the repository Gemini secret and without linking billing. `gemini-2.5-flash` returned a provider error saying it is unavailable to new users; model availability must be verified, not assumed. A 128-token output budget truncated the answer; 1024 produced a complete question.

This is service feasibility evidence, not an implemented AI feature. App Check enforcement, quotas, explicit sharing controls, durable request/response events and replay tests remain required before exposing generation in the app. No journal data was sent. Production AI Logic was not provisioned. See the official [Firebase AI Logic setup](https://firebase.google.com/docs/ai-logic/get-started) and [App Check guidance](https://firebase.google.com/docs/ai-logic/app-check).

## 2026-10-01 — Markdown is a readable journal

The requested Markdown export contains only the journal title and, per entry, a date heading plus inline bold Prompt and Reflection labels. Removed entry counts, event cursors, entry IDs and colour metadata from Markdown. Dates retain the existing UTC basis and now use `YYYY-MM-DD HH:mm:ss` without milliseconds. JSON retains its structured fields. The download E2E checks the requested layout and absence of system metadata alongside existing literal-text and draft-exclusion checks.

## 2026-10-01 — Verify publication, including calendar-dependent screenshots

The Markdown change passed its focused export tests, but CI failed the unrelated full-entry screenshots on both viewports and skipped publication. Artifact diffs showed only the date mask's right edge: September and October labels have different widths, so masking an inline date did not make its geometry deterministic. Added a stable minimum-width date box in screenshot-only CSS and a functional assertion that the rendered date matches its recorded timestamp. Pixel tolerance remains zero. A queued build is not a deployed preview; verify successful publication and the served bundle before reporting availability.

## 2026-10-01 — Correction: masking is prohibited

The user explicitly rejected all screenshot masking. The earlier date-mask approach and proposed fixed-width mask were incorrect and are superseded. Removed masks and screenshot-only CSS entirely; added the no-masking, zero-pixel rule to the E2E guide and repository instructions. Determinism belongs in fixture inputs, not hidden UI. The emulator test wrapper uses a Nix-pinned JVM clock starting on the fixture date, with time advancing and monotonic timers left real, as described in [libfaketime's JVM guidance](https://github.com/wolfcw/libfaketime). Production time and event validation are unchanged. Visible dates now participate in full screenshot comparisons.

Validation: reviewed the regenerated visible-date screenshots; the ordinary comparison run then passed all 10 browser tests with no masking and zero differing pixels. All 6 Firebase integration tests passed, and Svelte/TypeScript reported no errors or warnings.

## 2026-10-01 — Correction: readable export uses local time

The user clarified that Markdown timestamps must use their local time. Replaced UTC string slicing with the exporting browser’s local date/time components, preserving the requested `YYYY-MM-DD HH:mm:ss` layout and applying that timezone’s offset at each entry’s instant. JSON keeps unambiguous UTC instants. The export E2E compares Markdown headings with independently formatted Australia/Hobart timestamps from the downloaded JSON, explicitly checking the fixture’s 04:xx UTC becomes 14:xx local time. This supersedes the earlier UTC Markdown decision.

The stronger timezone assertion also exposed a clock-fixture setup error: the Nix library lives under `lib/libfaketime.so.1`, not `lib/faketime/libfaketime.so.1`. The loader had logged a warning and continued with real time; date-only checks passed because that day happened to match the fixture. Corrected the path and made a missing library fatal. The new hour check verifies the override actually takes effect instead of relying on the host calendar.

CI evidence: the first local-time run was slow rather than hung; it was cancelled prematurely while still making progress. The mobile export timezone test passed. Separate failures showed a two-second outbox-restoration wait expiring while synchronization continued, and a screenshot capture running out of time before obtaining two stable frames. The helper now allows ten seconds for exact screenshot comparison and the outbox-reopen assertion allows fifteen seconds. No masks, baseline changes or pixel-tolerance changes accompany those wait adjustments.

## 2026-10-01 — Local UI iteration: ink background

Started `feat/ui-background` from merged main `dad6037`. The user requested rapid local visual review and explicitly deferred E2E runs and baseline/scenario regeneration until the UI is settled. Inspected the Today and rainbow-journal mockups: their background is visible charcoal ink-in-water plumes with restrained ochre diffusion, not the implemented faint radial gradients.

Generated a dedicated 1024×1536 background with the built-in image generation tool and saved it as `src/lib/assets/backgrounds/charcoal-ochre-ink.png`. The exact generation prompt is recorded in `docs/ux/prompts/background-charcoal-ochre-ink.txt`. A shared fixed background layer now serves landing and journal routes; this increment changes only the background. The Vite dev server at `http://127.0.0.1:5173/` uses local Firebase emulators for fictional review accounts and hot reload. Checked the rendered mobile background manually; no E2E suite or baseline regeneration was run.

## 2026-10-01 — Event fixtures for signed-in UI review

Added explicit `dev:ui` mode, guarded by Vite development mode and `VITE_UI_REVIEW=true`. It opens as a fictional review user without initializing Firebase and replays the committed raw event fixture through the production domain reducer. Seven entries and an edit event exercise all rainbow colours, short/long prose and search. A development repository adapter implements the same UI-facing contract for save/edit, drafts, rebuild and export; it stores only events/drafts in a distinct localStorage namespace and replays derived state.

Settings can restore the fixture or empty the review journal, and the sign-in screen can be reviewed by signing out. No cloud authentication bypass or writes were introduced. Existing screens are navigable; the fixture does not pretend planned onboarding/AI/photo screens already exist. E2E runs and baselines remain deferred by request. Svelte/TypeScript checking passed without warnings or errors.

## 2026-10-01 — Bring the interface closer to the mobile mockups

Compared the Today, writing, journal and Settings mockups with the implemented screens. The mismatch included navigation structure, not just colours: the editor was embedded on Today and Settings lacked its menu/subpages. The interface now separates prompt, writing and saved confirmation, uses larger vivid rainbow cards, adds consistent SVG navigation icons, and presents Settings subpages including the two-step export interaction. Colour indices still come from the projection; the palette is presentation only. The current reflection's colour remains visible before saving.

AI settings exposes disabled controls and explicitly states the feature is unavailable. No generated prompts, photo attachments, AI feedback or onboarding functionality is implied by the styling work. The fixture remains a replay of raw events. Mobile visual captures of the running development server show the revised layouts; Svelte checking passed with no errors or warnings. E2E runs, walkthrough updates and baseline regeneration remain intentionally deferred until the visual iteration is approved; the existing scenarios need navigation updates as well as new screenshots.

## 2026-10-01 — Reflection previews follow available space

The compact journal cards now measure the space remaining for reflection text with ResizeObserver, showing complete lines rather than a fixed two-line preview. The measurement responds to card width, height, text wrapping and font layout. Overflow changes the entry link to “... see more”; entries that fit retain “View entry”. Both open the complete entry, and search still operates on the full reflection. This is application layout behavior, not screenshot masking. Type checking passed; baseline regeneration remains deferred during UI review.

## 2026-10-01 — Correction: expansion and entry navigation are separate

The user clarified that every card must retain “View entry”. Truncated reflections now reserve inline space for “… see more”, which expands the card in place. Browser text measurement fits the preview to available space on resize, including the link; the full reflection and search highlighting remain available on expansion. This supersedes the previous behavior that changed the navigation link's label. Svelte checking passed; E2E baseline work remains deferred.

## 2026-10-01 — Editor return navigation preserves its origin

Opening the editor now records its originating tab, selected entry or saved confirmation, and scroll position. The back heading names that destination and restores it while retaining the editor draft. Editing from a journal entry therefore returns to that entry instead of Today; starting from Today returns to Today. The heading shares the journal detail navigation typography. Type checking passed; E2E updates remain deferred for the visual iteration.

## 2026-10-01 — Separate daily reflection state from existing-entry drafts

Confirmed the Today card was reading the active editor's `editing`, `text` and colour values. Returning from an older entry therefore changed Today’s colour and falsely offered to continue that older entry. Draft persistence also used one shared slot, so merely switching editors could replace unrelated unfinished work.

Today now derives its saved entry and colour independently from the projection using the device's local calendar date. Before the first save it uses the next historical rainbow index; after saving it retains that entry's colour and identity. If prior app behavior created multiple entries that day, the first is the daily reflection. Continuing Today updates that entry instead of creating another. No event schema or historical projection colours changed.

Draft storage now has separate local-day and entry keys in both the Firebase IndexedDB repository and the review adapter. Saving/discarding clears only the active draft. The old single draft is migrated without changing its action; a legacy new-entry draft has no recorded date, so it is assigned to the current local day during migration. Existing-entry drafts retain their entry identity and expected revision. Date changes refresh Today independently; an already-open composer keeps its own colour and draft key.

Validation: two focused unit tests cover local midnight boundaries and colour/identity through saving and edits. A fresh fictional review browser exercised switching between two drafts, reload recovery, stable Today colour, and continuing the same saved entry; all checks passed, with captures after actions. Svelte checking passed. The full E2E suite and baseline regeneration remain deferred during visual iteration.

## 2026-10-08 — Journal cards fit shorter reflections

The user replaced the equal-height card requirement with content-sized cards capped at the previous collapsed height (240px, or 260px on the narrowest screens). Reflection measurement now preserves the full text's natural height as its layout basis, allowing short cards to shrink without letting a truncated preview shrink its own available space. Expanded cards remove the height cap; “see less” restores it. Svelte checking passed. Browser verification was unavailable from this session; E2E runs remain deferred during UI iteration.

## 2026-10-08 — Paragraph spacing is presentation

A single explicit line break now separates displayed reflection paragraphs by half a line. The shared renderer covers previews, expanded/full entries, saved confirmation and pending reflections; automatic line wrapping adds no paragraph gap. Preview measurement includes the same paragraph spacing so expansion controls retain their reserved space. Stored text, the plain-text editor and exports are unchanged. Svelte checking passed; E2E runs remain deferred.

## 2026-10-08 — Paragraph-aware writing and editing

Replaced the textarea with a shared paragraph-aware editor for new and existing reflections. Explicit paragraphs receive half-line spacing while wrapped lines keep normal leading. Draft and event payloads remain plain text; pasting takes only clipboard text, and the 10,000-character limit remains enforced. The editor keeps browser-managed selection and undo during normal input rather than rebuilding its DOM on each draft update. It uses the browser editing commands for paragraph insertion and plain-text paste because these preserve undo history ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)); these APIs are deprecated and need cross-browser review when E2E work resumes.

Svelte checking passed. Browser interaction verification could not run because this session cannot launch Chromium; typing, paste, IME, undo and selection behavior still need browser review. The previous note that the editor lacks paragraph spacing is superseded.

## 2026-10-08 — Three rendered lines replace a pixel height cap

The latest card requirement supersedes the earlier 240/260px maximum: collapsed reflections show at most three rendered text lines across paragraphs. Paragraph margins do not consume the line budget, so a third line can begin a new paragraph. Browser measurement counts each paragraph's wrapped lines; the truncation helper reserves room for an ellipsis when interrupting a sentence, prefers whole words and preserves combined emoji. Expanded cards display the full stored text.

Removed reserved reflection height and the fixed card cap. The footer uses the same eight-pixel gap after the visible reflection or expansion control, so shorter and truncated cards have consistent spacing above “View entry”. Prompt and reflection prose, including editor text, is justified. Stored text and export content are unchanged. Focused truncation unit checks and Svelte checking passed; browser layout verification and E2E regeneration remain outstanding during UI iteration.

## 2026-10-08 — Validate the agreed interface before publication

The approved UI requires new action-by-action scenarios because writing, saved confirmation and Settings are now separate screens. Historical raw-event fixtures exercise earlier entries without creating multiple entries on Today. Draft coverage checks independent Today/history drafts, stable colour, origin-aware back navigation, reload and discard. A dedicated paragraph-editing scenario covers Enter, plain-text paste, undo/redo and saved rendering.

Browser validation found that Chromium copies the first paragraph's inline zero margin when Enter creates the next paragraph. Normalizing the margins of all editor blocks after input fixes the missing half-line gap while preserving browser selection and undo. This was not detectable through Svelte type checking alone.

Rendered entry times now include minutes. The old advancing emulator clock made screenshots depend on test duration, so test JVM wall time is frozen at the fixture instant while monotonic timers still run. Browser Date uses the same instant, including the second signed-in device. The real emulator transaction path and Security Rules remain active; screenshots keep zero tolerance and no masking. Production clocks are unchanged.

Further browser checks found that `insertText` can merge pasted text into the preceding typing undo transaction. Restarting the current selection before insertion gives paste its own undo boundary without importing clipboard HTML. Reading paragraph nodes instead of layout-derived `innerText` also preserves intentional empty paragraphs, whose placeholder breaks otherwise become extra newlines. The mobile and desktop editor scenarios now exercise typing, Enter, paste, undo/redo, saving and reopening blank paragraphs successfully.

The first strict comparison run exposed 5–15 differing pixels at rounded mobile borders, with identical text, dates and layout. The browser test configuration now disables partial raster reuse and CPU-specific Skia optimizations (documented in [Chrome's tooling flags](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#rendering--gpu)). This standardizes how complete rendered regions are drawn instead of relying on prior partial repaints. It does not hide content, add screenshot styles, or relax pixel comparisons.

Validation completed: Svelte/TypeScript and standalone E2E type checking; seven unit tests; five deployment tests; six Firebase integration/Security Rules tests; all twelve mobile/desktop scenario runs against 270 screenshots with zero differing pixels; and the configured Pages build's four landing/sign-in checks. The fixed-time assertion checks the fixture second (the Markdown export precision), since one emulator server timestamp returned `.001Z` instead of `.000Z`; rendered dates and screenshot comparisons remain exact. Generated walkthroughs are unchanged on comparison runs, and obsolete screenshots have been removed. A production build with `VITE_UI_REVIEW=true` still requires real sign-in and contains none of the development fixture adapter or sample-account markers.

Chromium interaction coverage now replaces the earlier editor verification limitation. Other browser engines, native mobile keyboards and IME behavior still need device review. The agreed UI is ready for PR review; AI prompts, photos, onboarding and deletion remain future work.

## 2026-10-08 — CI rendering cost and viewport isolation

The first PR workflow's build passed. I canceled its Firebase job assuming it had stalled; the completed logs showed ten passing scenarios and continued work on the eleventh, with no reported failure. That cancellation was premature. Desktop foundation alone took 118 seconds, versus 24 seconds locally, and the serial mobile/desktop sequence made progress hard to judge from the coarse job status.

CI now gives each viewport its own emulator job while retaining serial scenarios within each job, avoiding shared account-picker races. Both jobs gate publication and keep separate report artifacts. The 32-step foundation's overall timeout is 180 seconds based on the measured near-limit passing run. Per-action waits, screenshot waits, rendered content and zero-pixel comparisons are unchanged. Future slow runs should be judged against these measured CI durations rather than local speed.

The first matrix attempt exposed a wrapper dependency on npm's implicit `node_modules/.bin` PATH. Calling the documented shell wrapper directly on a clean CI runner could not find `firebase`. The wrapper now explicitly prepends the repository's installed tools after the deterministic Java shim, so direct and npm invocation use the same locked dependencies.
