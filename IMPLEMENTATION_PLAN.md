# Gratitude implementation plan

This plan implements [MVP_DESIGN.md](MVP_DESIGN.md) on the merged SvelteKit scaffold. Each increment is a separately reviewable PR from current `main`. Firebase with Google sign-in and Gemini response events are selected architecture, not optional alternatives. Project provisioning is tracked separately in [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## Acceptance contract

The MVP supports the mobile stories in [UX_DESIGN.md](UX_DESIGN.md), adds Google sign-in, and restores the same user's journal across devices. User actions and received AI responses are the durable event source. Local derived state is never serialized into events as an entry/projection snapshot. Cached recovery and full replay produce identical logical state, and **replay issues zero Gemini calls**.

Each user-visible increment adds Playwright scenarios using [E2E_GUIDE.md](E2E_GUIDE.md): screenshot comparisons, committed baselines, and generated READMEs with screenshots above their verification lists. Keep the pinned Nix browser/fonts, zero-pixel comparisons, explicit baseline review, and CI's generated-document check. Emulators and recorded Gemini fixtures make tests reproducible without pretending live inference is deterministic.

## 0. Firebase project and backend deployment foundation

**Deliverable:** the real Firebase project, web app registration, Google authentication provider, database, private photo bucket and a reproducible backend deployment configuration.

- Complete authorized project creation using an authenticated Google account. Record the actual project ID/number and web app ID, not a placeholder presented as provisioned.
- Select `australia-southeast1` (Sydney) for regional Firestore/Functions/Storage where supported. Confirm database location before creation; record any product-specific constraints. Determine the billing account needed for Functions/Storage rather than assuming a repository secret grants Firebase access or billing.
- Enable Google sign-in and authorized domains. Add production configuration as public Firebase app configuration. Add a separate development Firebase project before previews can access a live backend; otherwise use emulators/fixtures.
- Define Firestore and Storage rules, indexes, Emulator Suite configuration and backend service identities. Deny unauthorized/cross-user access from the outset.
- Configure a trusted `main` backend deployment workflow using Google Workload Identity Federation. Provision the existing repository `GEMINI_API_KEY` into Secret Manager through that workflow, bind it only to Gemini functions, and keep it out of the Pages build and PR jobs.
- Retain the existing Pages production/preview deployment. A backend deployment is a distinct workflow with explicit project targeting, emulator checks and least-privilege permissions.

**Evidence:** verify the resource inventory and authenticated access; inspect deployment configuration without printing secret values. Emulator rules tests must deny anonymous access, another UID, direct client event writes and forged response events. Check production bundles for accidental secret injection. A key's existence is not proof that runtime binding, quota or provider restrictions are configured.

**Dependency:** Google/Firebase login, appropriate project permissions and identified billing setup. Domain/replay implementation can proceed independently while external provisioning is pending.

## 1. Typed events and pure projection kernel

**Deliverable:** TypeScript domain schemas, a version registry, initial state, reducers and selectors independent of Svelte, Firebase and Gemini SDKs.

Implement user actions and `PromptResponseReceived`, `PhotoSummaryResponseReceived`, and sanitized `AIRequestFailed` facts. Correlate responses to request and target versions. Derive entries, drafts, colours, settings and search state; retain original prompt text from recorded responses. Use exact response fixtures, not inference functions, in reducer tests. Decode unknown event versions explicitly and reject unexpected payload fields.

**Evidence:** small hand-authored histories assert exact expected state. Cover alternative prompts, manual descriptions overriding late responses, deletion, reset, duplicate IDs, response ordering, original date/prompt retention across midnight, and stable colours after editing/filtering. Add a forbidden Gemini adapter that throws if used during replay, including a history with an unfinished request. Changing model configuration after recording a response must not change a reconstructed prompt.

**Dependency:** agreed event schemas in the MVP design; no live Gemini credentials required.

## 2. Authenticated canonical event append and synchronization

**Deliverable:** Google sign-in UI, authenticated command functions, per-UID Firestore streams, server-assigned ordering, subscriptions and conflict responses.

Use Firebase UID as ownership, verify auth server-side, and reject arbitrary UID/asset references. Append accepted command batches and their head metadata atomically. Validate entity/settings revisions, reuse stable IDs for retries, and reject conflicting duplicate payloads. Keep settings and journal scopes explicitly linked by revision so whole-journal deletion can retain answers. Reject old generations from stale devices.

**Evidence:** Auth/Firestore/Functions emulator integration tests use two distinct users and two independent browser contexts signed in as the same user. Verify cross-user reads/writes fail, same-user events appear on both devices, ordering converges, retry commits once, and simultaneous edits preserve a recoverable conflict rather than silently overwriting prose. Test cancelled sign-in, expired auth, sign-out and account switching. Add scenario `002-google-signin-and-user-isolation` with generated walkthroughs; manually validate the real Google popup/redirect flow on supported mobile browsers before release.

**Dependency:** increments 0's emulator configuration and 1. Live end-to-end sign-in additionally needs completed provider configuration.

## 3. IndexedDB outbox and cached projection recovery

**Deliverable:** confirmed-event caching, UID/project/generation-scoped projection checkpoints, durable pending-command outbox, multi-tab coordination, and worker-based complete rebuild.

Restore valid checkpoints and fetch only the confirmed tail. Commit cached events, projection and cursor in one local transaction. Keep provisional commands outside confirmed checkpoints, acknowledge by ID, and reconcile stale revisions after fetching remote changes. Preserve unsent text when a command conflicts. Never upload one account's pending commands after an account switch.

**Evidence:** compare full replay and checkpoint-plus-tail replay at many split points, with expected-state fixtures as independent oracles. Delete every projection cache and restore exact prompts/summaries from events with zero AI calls. Instrument reducer invocations and reads to verify warm startup applies only the tail and unchanged startup applies none. Test corrupt/ahead/incompatible checkpoints, missing event pages, crashes, duplicate subscription delivery, two-device offline edits, pending photo uploads, account switching and generation changes. Stale erasure generations must be checked before showing a cache after reconnection.

**Dependency:** increments 1–2.

## 4. Onboarding, Today, editor and journal search

**Deliverable:** optional questions, explicit sharing controls, daily prompt view, starter fallback, skip/resume, durable editor, save/edit, freeform feedback, rainbow history, full entry and search.

Use recorded fixture response events during UI development. Show device-pending and cloud-synced states accurately. Flush pending text before save; preserve entry identity across edits. Display prompt and reserved colour before writing. Mark offline reservations provisional until the canonical first-day commit; confirmed colours remain stable across devices. Keep Today/Journal/Settings navigation, with AI settings inside Settings.

Search full saved text, prompts and accepted/manual summaries using the UX's normalization and all-word matching. Keep collapsed cards a consistent height and restore query/scroll context. Distinguish empty data, no matches, incomplete sync and failures. Add keyboard-safe controls, focus restoration, live announcements, 200% reflow and contrast checks.

**Evidence:** scenarios `003-onboarding-and-choices`, `004-today-and-durable-writing`, `005-replace-skip-and-feedback`, and `006-journal-and-search`. Verify reload, write failures, retries without duplicates, midnight, no implicit consent, a second device receiving a saved reflection, short/long cards, off-preview matches, and stable confirmed colours. Screenshot evidence complements functional accessibility checks.

**Dependency:** increments 1–3.

## 5. Gemini workers and durable response events

**Deliverable:** authenticated live request orchestration, transactional work outbox, leased workers, private secret binding, bounded retries and exact response persistence.

Commit the user request and operational work record atomically. Reconstruct request-boundary context, then recheck current consent and target eligibility before calling Gemini outside any database transaction. Apply the documented source and size limits. Record the actual model, template/context provenance and exact consumed response before showing cloud-ready content. Persist a deterministic response-event ID and terminal job status together; duplicate deliveries must not create duplicate responses.

Do not connect replay or cache hydration to the effect dispatcher. Resume genuinely unfinished jobs in the backend only, with bounded retry and observable sanitized failure state. A crash after provider response but before persistence may invoke the provider again; do not claim exactly-once billing. Explicit user retry creates a new request identity. Recheck deletion/revocation before accepting late output.

**Evidence:** scenario `007-gemini-prompts-and-feedback` with a provider stub, plus backend integration tests for duplicate trigger delivery, leases, crash boundaries, superseded requests, denied consent, provider failure, manual retry and immutable historical responses after a model change. Test that clearing every cache, opening a second device and replaying an unfinished request each cause zero provider calls from the projector. Use a separately controlled live Gemini smoke check with fictional input after secret provisioning; ordinary CI requires no real Gemini traffic.

**Dependency:** increments 0–4.

## 6. Private photos and recorded image summaries

**Deliverable:** local ingestion/staging, private Storage uploads, verified finalization, attachment events, Gemini summary events, manual descriptions and photo-only saves.

Enforce four photos per entry, 10 MB each, and JPEG/PNG/WebP; normalize orientation and strip metadata before upload. Since Firestore and Storage do not share a transaction, append the attachment only after verifying the immutable uploaded object. Make orphan cleanup and retry idempotent. Keep cloud attachment status separate from device-only staging and summary status separate from saving.

Use the independent photo-processing disclosure/control. Manual corrections override late response events; replacing/removing a photo invalidates matching pending work. Do not create public asset URLs or allow functions to fetch an arbitrary caller-supplied URL.

**Evidence:** scenario `008-photos-and-summaries` covers failures, offline staging, reconnection, unsupported files, retry, remove/replace, manual correction and photo-only save. Verify another signed-in device can access the same authorized photo and another UID cannot. Rebuild summaries from response events with no Gemini calls or dependency on the original camera file. Test orphan uploads and the boundary between successful upload and event finalization.

**Dependency:** increments 2–5 and the provisioned private bucket.

## 7. Export, reset and cross-device erasure

**Deliverable:** consistent-head Markdown/JSON exports (ZIP with photos), personalization reset, entry deletion and journal deletion with verified cleanup.

Export all saved entries regardless of search, include required prompts, responses, derived colour/IDs, photos and personalization appendix, and exclude drafts/secrets. Require a complete synchronized snapshot for “All saved reflections.” Reset clears answers/feedback and disables personalization; existing historical prompt response events remain intact. Deleting a source entry does not recompute other entries' recorded prompts.

Implement scoped erasure of the selected entity's private historical payloads/photos and operational data while retaining minimal tombstone/order metadata for post-deletion replay. Invalidate cached projections across devices and reject obsolete outboxes. Whole-journal deletion advances its generation, preserving explicit answers in the separate settings scope. Do not call tombstoned plaintext erased or promise immediate deletion from a disconnected device/provider retention.

**Evidence:** scenario `009-export-reset-and-erasure` verifies literal Markdown escaping, JSON/ZIP contents, full-journal export across devices, failure recovery, cancel/confirm, reset semantics, and exact retention of unrelated recorded prompts. Interrupt cleanup, restart it, inspect managed stores, and rebuild current state without caches. Reconnect an old offline client and confirm that stale commands cannot resurrect erased data. Test missing assets and distinguish pending cleanup from successful completion.

**Dependency:** increments 2–6.

## 8. Offline, deployment and MVP release review

**Deliverable:** application cache lifecycle, complete sync/replay diagnostics, storage recovery, final backend deployment and full mobile walkthrough.

Complete separate production/development Firebase configurations, authorized domains, rate/quota controls and secret binding. Verify the Pages frontend never embeds `GEMINI_API_KEY`. Keep emulator E2E jobs separate from live backend deployment and leave public previews on fixture mode until a development backend exists. Test real Google sign-in and a same-account second device against the deployed backend.

**Evidence:** scenario `010-offline-and-replay-recovery` covers offline reading/writing, reconnect conflicts, missing caches, incomplete cloud history, storage exhaustion and app updates with pending edits. Run all browser scenarios at production and nested preview base paths; retain zero-pixel baseline comparisons and generated READMEs. Review cloud costs/limits with measured usage and verify that a full replay causes no Gemini charges or requests. All core UX stories, access-control tests and replay invariants must pass before calling the MVP complete.

**Dependency:** prior increments and completed resource provisioning.

## Review practices

Each PR states the resulting behaviour, event/schema changes, authorization boundaries, replay/cache invariants, migration impact and generated E2E evidence. Maintain [PROMPTS.md](PROMPTS.md) verbatim and append discoveries to [LEARNINGS.md](LEARNINGS.md); keep [VISION.md](VISION.md) end-state-only. This revision replaces the prior local-only and deterministic-AI implementation gates rather than layering new work on top of them.
