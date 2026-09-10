# Gratitude implementation plan

This is a review plan for [MVP_DESIGN.md](MVP_DESIGN.md), starting from the SvelteKit scaffold merged at `79c4c9f`. Each numbered increment is intended as a separately reviewable implementation PR from the latest `main`. This document does not authorize deployment of a backend, select an AI service, or claim the MVP is implemented.

## Acceptance contract

A complete MVP must support the core mobile stories in [UX_DESIGN.md](UX_DESIGN.md), subject to the explicit scope and deletion amendments proposed in the MVP design. Every persisted event must represent a user action. No computed prompt, summary, entry snapshot, colour, context selection, search data, or cached state may enter an event payload. Full replay and checkpoint-plus-tail replay must converge to identical logical state.

Every user-visible increment adds Playwright scenarios following [E2E_GUIDE.md](E2E_GUIDE.md): helper-driven screenshot comparisons, committed baselines, and generated READMEs with embedded screenshots above their checks. CI must compare rather than update screenshots and must reject uncommitted generated documentation. Do not substitute report attachments for the generated walkthroughs.

## 0. Resolve AI replay and deletion feasibility

**Deliverable:** a reviewed architecture decision plus a bounded prototype, before building AI-dependent UI.

- Confirm whether user actions and original photo inputs must be sufficient for replay, as proposed, or whether immutable AI response artifacts outside the event log are permitted. The latter is an explicit change to the replay source contract; do not adopt it silently.
- For the strict route, identify a redistributable prompt/vision model and canonical deterministic inference runtime. Preserve model, tokenizer, preprocessing, templates, decoding, and runtime identities. Check licensing before distributing weights with the GPLv3 application.
- Run repeated inference from the same inputs across the target mobile environment and Nix/CI reference execution. Include full-cache deletion, offline execution with bundles installed, interruption/resumption, and model upgrades with historical versions retained. Temperature zero and a fixed seed are insufficient evidence on their own.
- Measure cold model download, warm generation, memory use, and complete replay cost. Propose measured budgets and supported devices in the decision rather than inventing performance guarantees. Demonstrate both personalization and useful image descriptions using fictional inputs.
- Resolve the erasure tradeoff: destroying an input also destroys the ability to recompute AI output that depended on it. Review the proposed dependent-prompt unavailability state versus retaining computed response artifacts. Prove the chosen policy in a small replay fixture.

**Exit gate:** the replay source, supported inference path, bundle-retention policy, deletion semantics, and mobile resource budgets are explicit and agreed in review. If the prototype cannot meet them, revise the design; do not ship hosted-model calls behind a “deterministic” interface or present starter prompts as completed AI.

Independent work on the action kernel and journal persistence can proceed while this gate is investigated. AI and destructive-erasure implementation depend on its resolution.

## 1. Typed actions and deterministic projection kernel

**Deliverable:** `src/lib/domain/` action schemas, version registry, empty state, pure projection functions, and selectors. Keep persistence and Svelte out of this module.

Implement explicit answers, choices, day opening, prompt/draft references, user-authored edits, save/edit actions, and deletion intents. Use fixture inference functions until increment 5. Derive local dates from captured interaction context, stable entity IDs from creating actions, and rainbow positions from distinct opened days. Preserve original day/prompt identity across replacement and midnight. Infrastructure sequence numbers remain outside domain payloads.

**Evidence:** schema tests reject extra computed fields and unsupported versions. Replay fixtures cover replacement with and without discard, duplicate IDs, stale revisions, editing without duplication, midnight/timezone changes, and stable colours after skip/delete/search. Assert exact state for small hand-authored histories, not only equality between two invocations of the same reducer. Events must not contain any full projected object.

**Dependency:** agreed core action contract; inference feasibility is not required for this increment.

## 2. Durable action repository and cached projections

**Deliverable:** `src/lib/persistence/` IndexedDB repository with versioned stores for actions, original assets, projection checkpoints, and infrastructure metadata. Introduce no cloud synchronization.

Allocate order transactionally, validate an expected head for concurrent edits, and enforce action-ID uniqueness. Commit action, immediate projection state, and cursor atomically. Restore valid checkpoints and read only the tail. Use a worker for complete rebuilds. Keep model computation outside IndexedDB transactions and install results conditionally by dependency identity. Implement multi-tab notifications and restart recovery. Namespace databases and service-worker caches by deployment base path.

**Evidence:** meaningful repository tests exercise transaction abort, crash between action commit and derivation completion, corrupt/incompatible/ahead-of-log checkpoints, missing input assets, duplicate delivery, conflicting duplicate payloads, simultaneous tabs, and cursor boundaries. For generated histories and every selected split point, compare full replay with resume; delete all projection caches and compare again. Instrument reducer invocations to prove a warm open applies only the tail and an unchanged warm open applies none. Unknown schema versions must produce an incomplete-history error, not missing entries disguised as a valid journal.

**Dependency:** increment 1.

## 3. Onboarding, Today, editor, and durable journal

**Deliverable:** mobile Today/Journal/Settings navigation, optional questions and source controls, bundled starter flow, response editor, save/edit, skip/resume, and durable feedback. Use deterministic fixture prompts during development and clearly labeled starter prompts in any usable interim build.

Show today's derived colour before writing and preserve it through save/edit. Flush pending user text before saving. Show “Draft saved on this device” only after commit; retain unsaved input on failure. Keep freeform feedback optional and limited to the UX's 300 characters. Settings remains the only top-level route to AI settings. Implement keyboard-safe controls, focus handling, live save status, and dark-glass fallback surfaces.

**Evidence:** scenarios `002-onboarding-and-choices`, `003-today-and-durable-writing`, and `004-replace-skip-and-feedback`, each with mobile/desktop images and generated documentation. Verify reload durability, deliberate local-write failure, retry without duplicates, midnight behaviour, and no implicit personalization consent. Include keyboard and 200% text-reflow checks; screenshots alone do not prove accessibility.

**Dependency:** increments 1–2.

## 4. Rainbow history, full entries, and local search

**Deliverable:** consistent collapsed cards with prompt/response sections and entry detail. Derive search from complete saved text, with the UX's normalization, all-word matching, result counts, highlights, and no-match/error distinction.

Preserve original colours and list context when entering/exiting a result. Short entries keep the shared card height; enlarged text increases it consistently. Keep unfinished reconstruction visibly separate from an empty journal. Search query and scroll position are ephemeral UI state rather than persisted user actions.

**Evidence:** scenario `005-journal-and-search` covers the seven-colour cycle, short and long text, off-preview matches, clearing search, returning to scroll position, and accessibility reflow. Rebuild the search index from an empty cache and verify the same results. Test colour stability across filtering and deletion intents.

**Dependency:** increment 3.

## 5. Replayable AI prompts and personalization

**Deliverable:** the inference adapter and immutable version bundles approved in increment 0, integrated with the projection worker and disposable result caches.

Compute context at each request's action boundary. Use only enabled explicit answers/feedback and the bounded entry selection from the design. Implement initial prompts, alternatives, request references, “Why this prompt?” from actual context, cancellation eligibility, and a labeled starter fallback. Retain historical bundle versions and never overwrite an old prompt with a new model's result. Replaying a user action must not append an AI-result event.

**Evidence:** scenario `006-personalized-prompts` verifies source toggles, feedback affecting subsequent context, no later settings leaking into an old prompt, stale-result rejection, and unavailable-model recovery. Unit/integration fixtures compare incremental, resumed, and complete replay with every AI cache deleted. Golden context fixtures verify exactly which private inputs are eligible. Real deterministic-inference tests complement the stubbed UI E2E suite; never make ordinary UI tests depend on a hosted provider.

**Dependency:** increment 0 exit gate and increments 1–3.

## 6. Photos and editable image summaries

**Deliverable:** ingestion, original input-asset persistence, attachment lifecycle, deterministic summaries, manual descriptions, and photo-only entries. Enforce the four-photo/10 MB/file-type limits without losing a draft; normalize orientation and strip metadata before retaining the input copy.

Commit input bytes and the user's attachment action together. Keep summary processing independent of prompt personalization and of saving an entry. A manual edit wins over late inference. Removing or replacing an attachment invalidates its result and pending computation. Use the disclosure appropriate to the inference location selected in increment 0.

**Evidence:** scenario `007-photos-and-summaries` covers valid/invalid files, persistence failure, offline/unavailable inference, retry, remove/replace, photo-only save, manual correction, and a stale result arriving after correction. Strip metadata in an ingestion fixture and demonstrate that replay needs no original camera file. Delete every derived image/summary cache and compare reconstructed state from retained input bytes.

**Dependency:** increments 2–3 and 5's inference infrastructure.

## 7. Export, personalization reset, and verified erasure

**Deliverable:** Markdown/JSON exports (ZIP with relative photo paths when needed), reset controls, and the reviewed deletion policy. Exports read a consistent action-head projection and include all saved entries irrespective of search; they are read models, not the event backup format.

Implement per-entry and personalization encryption scopes before claiming erasure. A deletion action must trigger restart-safe cleanup of keys, original assets, derived projections, and pending work. Whole-journal deletion preserves explicit answers; personalization reset clears answers/feedback and turns sources off. Show completion only when all managed stores confirm removal. Implement the dependent-prompt state approved in increment 0 so replay never secretly depends on erased source material.

**Evidence:** scenario `008-export-reset-and-erasure` verifies literal Markdown escaping, JSON structure, ZIP image links, derived colour/ID preservation, exclusion of drafts, failed export retry, and all deletion confirmation/cancel paths. Repository tests interrupt erasure between stores, restart, and complete it. Rebuild without all caches afterward and confirm identical surviving state, absent deleted private content, stable remaining colours, and correct handling of dependent AI results. Inspect persisted data, not just the hidden UI.

**Dependency:** increment 0 deletion decision and increments 2, 4–6.

## 8. Offline recovery and MVP release review

**Deliverable:** application/model cache lifecycle, storage-status UX, update handling, complete replay diagnostics, and the final acceptance walkthrough. Do not evict historical model bundles needed for retained histories without a recoverable replacement source. Keep production and PR data isolated.

**Evidence:** scenario `009-offline-and-replay-recovery` starts from a populated history, closes/reopens the app offline, checks warm-cache tail replay, deletes projections, and rebuilds the same journal. Cover missing model assets, incomplete input storage, storage exhaustion, unknown versions, and a pending uncommitted edit during update. Run the complete suite at both production and PR base paths, then against the published preview. Existing Pages preview cleanup and main deployment remain in use.

**Dependency:** all applicable prior increments. Review against the measured resource budgets established in increment 0 and the full mobile story matrix. No arbitrary fixed sleeps or relaxed screenshot tolerance to clear failures.

## Working and review practices

Each implementation PR states its user-visible result, action-schema changes, replay/cache invariants, generated E2E evidence, and any migration impact. New schema/rules versions include historical replay fixtures. Baseline updates are explicit and visually reviewed in the pinned Nix environment. Maintain [PROMPTS.md](PROMPTS.md) verbatim and append discoveries to [LEARNINGS.md](LEARNINGS.md); preserve the end-state-only [VISION.md](VISION.md).

The first design PR changes documentation only. No application behaviour, stored journal, model download, or deletion operation is introduced by accepting these documents.
