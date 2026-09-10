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
