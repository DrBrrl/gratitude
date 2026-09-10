# Gratitude MVP design

This proposal defines the first usable Gratitude application, following [UX_DESIGN.md](UX_DESIGN.md). The backend is Firebase, users authenticate with Google, and Gemini supplies daily prompts and photo summaries. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) sequences the work. The current application is the merged SvelteKit scaffold.

## Event-sourcing contract

**The source of truth is the ordered event stream: user actions plus recorded external AI responses. Projections contain application state and can always be rebuilt. Replay never calls Gemini.**

The user's clarification establishes AI responses as external facts that belong in events. They are not locally computed journal state. Entries, draft status, palette positions, search indexes, counts, and effective personalization context remain derived values and must not be copied into events as state snapshots.

A prompt or image summary is generated once during live processing, durably recorded, and subsequently read from its event. Neither a new device nor a cache rebuild needs the original model, model weights, API availability, or a repeated generation request. A later change of model affects new requests only. This replaces the earlier deterministic-inference proposal and its proposed loss of dependent prompts after source-data deletion.

## Product and deployment

The MVP includes Google sign-in, optional onboarding, daily prompts and alternatives, skipping/resuming, durable drafts, save/edit, freeform feedback, photos with editable summaries, rainbow history, local search, AI controls, and Markdown/JSON export. Signing in to the same Google account on another device restores the same user-owned journal from Firebase.

Today, Journal, and Settings remain the three tabs; AI settings is the first Settings row. Preserve the dark glass, yellow accent, ink background, prompt-visible cards, stable daily colour, common collapsed-card height, and accessibility rules in the UX. Add Google sign-in before opening the cloud journal; onboarding answers remain optional. Provide clear sign-in cancellation, expired-session, sign-out, and account-switch states. A separate guest journal and anonymous-to-account migration are outside the MVP.

| Component | Responsibility |
| --- | --- |
| GitHub Pages | Static SvelteKit production application and per-PR previews |
| Firebase Authentication | Google sign-in; stable Firebase UID for journal ownership |
| Cloud Firestore | Authoritative per-user event stream, ordered append metadata, disposable server projections and operational jobs |
| Cloud Storage for Firebase | Private, metadata-stripped photo assets referenced by events |
| Cloud Functions for Firebase | Authenticated command validation, ordered append, Gemini integration, upload finalization and deletion |
| IndexedDB | Confirmed-event cache, versioned local projection checkpoints, pending user-action outbox and photo staging |
| Service worker | Base-path-scoped application assets for previously loaded offline use |

Use separate production and development Firebase projects when enabling live previews. Until a development backend is provisioned, previews use emulators/fixtures and must not connect to the production journal or receive its Gemini secret. Namespacing IndexedDB by Firebase project, UID, stream generation, and deployment base path prevents accidental cache reuse; it is not a security boundary between scripts hosted on the same GitHub Pages origin.

## Reference patterns

[Food's MVP design](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/MVP_DESIGN.md) records nondeterministic AI responses as events, then derives read models. Gratitude follows that boundary directly. Its [store](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/src/lib/store.ts) and [IndexedDB repository](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/src/lib/db.ts) illustrate separate event persistence and incremental projections.

[Jaipur's event types](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/src/lib/game-events.ts) and [Firebase repository](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/src/lib/game-repository.ts) inform versioned reducers, authenticated streams, pending actions, and cached recovery. Gratitude adds an explicit projection checkpoint and server-assigned sequence rather than replaying all cached events on each launch or relying on client clocks for cross-device order.

```mermaid
flowchart TD
  User[Signed-in user] --> Client[SvelteKit client and local outbox]
  Client --> Commands[Authenticated command function]
  Commands --> Stream[Firestore user event stream]
  Commands --> Jobs[Transactional live-work outbox]
  Jobs --> Worker[Gemini worker]
  Worker --> Gemini[Gemini API]
  Gemini --> Worker
  Worker -->|Recorded response event| Stream
  Stream --> Projector[Pure versioned projector]
  Cache[Disposable local checkpoint] --> Projector
  Projector --> Cache
  Projector --> UI[Journal, drafts, prompts, settings and search]
```

The projector has no Gemini client and no effect-dispatch API. Live command/worker processing is separate from subscriptions, hydration, and replay.

## Identity, authorization, and data layout

Enable Google in Firebase Authentication and register the production application's authorized domain. Use Firebase's supported popup/redirect flow and validate redirect behaviour on the mobile browsers being supported. Journal ownership uses `request.auth.uid`, never an email or a UID supplied by the caller. [Firebase Google sign-in documentation](https://firebase.google.com/docs/auth/web/google-signin)

Proposed paths:

```text
users/{uid}/streams/{generation}                 # ordered head and integrity metadata
users/{uid}/streams/{generation}/events/{eventId}
users/{uid}/projections/{projectionVersion}      # disposable server validation cache
users/{uid}/jobs/{requestId}                     # delivery/lease bookkeeping
users/{uid}/assets/{assetId}                     # upload/erasure bookkeeping
Storage: users/{uid}/{generation}/{assetId}
```

The active generation is repository metadata, changed during whole-journal deletion to prevent stale offline devices restoring an erased history. Settings that must survive journal deletion remain in a separately scoped user-settings stream. Replay merges that scope using explicit referenced settings revisions, not an unspecified interleaving of two streams.

Firestore rules permit an authenticated user to read only their own stream. Clients cannot write, update, or delete committed events, forge AI responses, edit head metadata, or read jobs and other users' data. All appends go through authenticated functions. Functions derive the UID from verified auth, validate payload allowlists, and enforce ownership on every referenced entry/photo/request. The Admin SDK bypasses Firestore rules, so this validation and least-privilege service IAM are mandatory. [Firestore security documentation](https://firebase.google.com/docs/firestore/security/get-started)

Storage rules likewise constrain access to the authenticated UID and generation. Use immutable object IDs and validated upload finalization; do not expose public download-token URLs. App Check, request size limits, per-user rate limits, and backend concurrency limits protect the command/Gemini endpoints in addition to authentication. The callable protocol carries Firebase authentication, but each function must enforce its required authenticated-user policy. [Callable Functions documentation](https://firebase.google.com/docs/functions/callable)

## Events and computed state

A committed record carries `eventId`, `schemaVersion`, `rulesVersion`, `source` (`user` or `gemini`/service outcome), `type`, typed `payload`, causation/request references, observed client time/timezone where relevant, and server-assigned sequence/time. Identity, sequence, versions, integrity hashes, and transport bookkeeping are infrastructure metadata rather than derived journal state.

| Events | Persisted facts/inputs | Projection output |
| --- | --- | --- |
| `AnswersSubmitted`, `AnswersCleared`, `AIChoicesConfirmed`, `PersonalizationResetRequested` | Explicit answers and choices; confirmation references | Effective settings, allowed context sources and remembered feedback |
| `DayOpened`, `PromptRequested`, `AnotherPromptRequested`, `StarterPromptChosen` | Interaction time/timezone, target/request identity, user's discard choice or starter reference | Day identity, reserved colour, active request and draft binding |
| `PromptResponseReceived` | Exact Gemini prompt text, request ID, actual model identifier, response/finish metadata and outbound-context provenance | Displayed prompt, explanation of source use, request completion |
| `AIRequestFailed` | Request/attempt ID and sanitized observed provider/transport outcome | Retry/fallback availability, without invented prompt text |
| `DaySkipped`, `DayResumed`, `ReflectionWriteOpened`, `ReflectionEditOpened` | User-selected day/entry/prompt references | Navigation-independent daily state and editable draft |
| `DraftTextChanged`, `ReflectionSaveRequested` | Literal user-entered text and target revision, or save reference | Saved entry, dirty state, word counts |
| `PromptFeedbackSubmitted`, `PromptFeedbackRemoved` | Prompt reference and literal feedback, or feedback reference | Remembered feedback and future context eligibility |
| `PhotoAttached`, `PhotoRemoved`, `PhotoSummaryRetryRequested` | User-selected private asset reference and summary choice, or target/request reference | Attachment relationships and pending summary status |
| `PhotoSummaryResponseReceived` | Exact Gemini summary text and response metadata, photo version and request ID | Image description suggestion and summary status |
| `PhotoDescriptionEdited`, `PhotoDescriptionCleared` | Explicit user edit/clear against a description revision | Manual description overriding AI suggestions |
| `ReflectionDeletionRequested`, `JournalDeletionRequested` | Explicit target/whole-journal confirmation | Tombstones and required erasure work |

AI result events retain the consumed response exactly, including safe response metadata needed to interpret it. Store bounded text/JSON responses in Firestore; never put image bytes, credentials, hidden model reasoning, or entire projected entries there. Context provenance records the actual outbound request boundary: template version, input source/revision references and enabled sources. Avoid duplicating private source text in provenance. Operational exception stacks and secrets never enter user events.

For an edited AI description, record user edit operations against the response/manual revision, not an automatic snapshot of the entry. Accepting an unchanged suggestion needs only its response reference. Starter text comes from a versioned bundled catalogue; no AI call or AI-response event is invented for it.

## Ordered writes and cross-device conflicts

The append function transactionally checks the event ID, current stream generation, relevant entity/settings revisions and canonical head, then allocates the next sequence, appends accepted events, and advances metadata. Identical retries return the original result; an existing ID with a different payload is rejected. Settings revision references used by a request are resolved and validated in the same acceptance transaction. Server projections used for validation are disposable and must match the validated stream head.

A pending draft edit and its Save action can be submitted as one ordered command batch. Sequence is authoritative; client timestamps serve only as recorded interaction context. Concurrent text edits use explicit expected revisions. A stale write returns a conflict while retaining the unsent text; the user can reload or explicitly reapply it. Do not silently apply last-write-wins to journal prose. Sync acknowledgements remove matching pending IDs once, not append duplicate events.

An offline outbox is separate from the confirmed stream and checkpoint. It contains user commands, original base revisions, generation, and stable IDs. Render a provisional overlay while offline; on reconnect, fetch confirmed changes, submit commands, and rebase or surface conflicts. Pending commands never acquire invented server sequences. An offline day colour is labeled provisional until its first cloud commit because another device may reserve a day first; once confirmed, its colour never changes. This is the explicit cross-device amendment to the original same-device colour promise.

Repeated opens for the same observed local date resolve to one canonical day. Its palette position derives from earlier canonical distinct day openings; no `ColourAssigned` event or palette payload is needed. Midnight/timezone changes do not rebind an existing draft. Two devices choosing prompts for the same day reconcile through the canonical request/day revision, not competing unversioned overwrites.

## Gemini execution and credentials

The repository already contains the Actions secret **`GEMINI_API_KEY`**, verified by secret name only. It must remain server-side. The Pages build must never receive it through a public/Vite environment variable or embed it in JavaScript, source maps, artifacts, logs, or browser storage. A backend proxy is the appropriate boundary for the private Gemini key. [Gemini API key guidance](https://ai.google.dev/gemini-api/docs/api-key)

A trusted backend deployment workflow on `main` will authenticate to Google Cloud with GitHub OIDC/Workload Identity Federation, copy the existing Actions secret to Secret Manager using protected stdin, and deploy functions that explicitly bind that secret. GitHub secret values cannot be read back through `gh secret list`; the value is made available to an authorized workflow. The Firebase browser configuration is separate public application configuration, not this Gemini key. Secret provisioning is not performed by public PR preview jobs. [Functions secret configuration](https://firebase.google.com/docs/functions/config-env)

Live request processing:

1. An authorized user command commits a request event and an operational outbox record in one transaction. The command defines which immutable request/settings revision applies; duplicate submissions reuse its identity.
2. A worker claims a lease, reconstructs context at that request boundary, and rechecks current consent, target existence, generation and request eligibility immediately before dispatch. Select at most five most recent eligible entries and twenty feedback items, with versioned deterministic length limits. No hidden inferred profile or fine-tuning is required for MVP personalization.
3. The worker calls a configured supported Gemini text/vision model **outside** the Firestore transaction. Record the actual model/version in the response; model selection is deploy configuration and never a replay dependency.
4. Persist the exact response and terminal job status atomically, using a deterministic response-event ID derived from the request ID. Only the backend may append it. Reveal a cloud-ready prompt/summary only after that commit.
5. Duplicate function deliveries find the existing terminal result and do not append another. A manual retry creates a new request identity linked to the old attempt. Errors preserve the current prompt/photo and produce the UX's retry/starter state.

Trigger delivery can repeat and ordering is not guaranteed, so the worker must use the canonical sequence and idempotency controls rather than delivery order. A crash after Gemini responds but before the result commit can cause another provider invocation; the design guarantees one accepted response per request, **not exactly-once provider billing**. Leases and bounded retries reduce duplication. [Firestore trigger delivery semantics](https://firebase.google.com/docs/functions/firestore-events)

Recovering an unfinished live outbox job is separate from replay. Tests rebuilding a projection run with effects disabled and must assert **zero Gemini requests**, including when the stream contains an unfinished request. A late summary never overwrites a manual description; response correlation and reducer precedence handle that consistently. Removed targets, revoked sharing, and superseded requests are rechecked before storing a result to avoid restoring deleted content.

## Cached projections and complete replay

The local checkpoint contains projection schema/rules versions, Firebase project/UID/generation, confirmed cursor and event ID, prefix integrity identity, and all projected journal/settings/search state. Keep pending commands outside it. Read models may include prompt and summary text because those values are recoverable from response events.

1. After authentication, compare generation and checkpoint metadata with the authoritative server head. Restore a matching checkpoint and request only events after its sequence. Validate contiguous order and deduplicate by ID before advancing the cursor.
2. Apply the confirmed tail through the same pure reducer used by a full rebuild. Commit cached events, projected state, and cursor atomically in IndexedDB. Overlay pending commands separately; a remote acknowledgement removes the overlay without duplicating its effect.
3. If the checkpoint is missing, corrupt, incompatible, or from an old generation, discard that checkpoint and rebuild from Firestore in pages. Preserve compatible unsent commands for explicit reconciliation; never treat clearing a checkpoint as permission to delete an outbox.
4. A fresh second device downloads the complete relevant event history and assets after Google sign-in, constructs its projection, and then follows the tail. A warm device does not replay or download the whole stream on each launch.
5. Changing a reducer/schema version invalidates incompatible checkpoints. Preserve input interpretation through explicit pure upcasters; unknown versions stop with an incomplete-history message rather than silently hiding entries.

Required equality: `replay(allConfirmedEvents) == resume(checkpointAtK, confirmedTailAfterK)` for the same rules and retained assets. Compare canonical logical state, excluding network progress, object URLs, and cache bookkeeping. Delete every local/server projection and rebuild from the canonical event streams plus photo inputs; the same prompts and summaries must return with the Gemini adapter replaced by one that throws on every call.

Event timestamps and server sequence are fixed observations, not reads of the current replay clock. Loading, incomplete sync and missing assets are explicit; they must not appear as an empty journal or zero search results. Sign-out/account switching stops listeners, discards in-memory private views and separates pending commands by UID; pending data is never uploaded to the next account.

## Photos, export, deletion and offline use

Photos use the UX's limits (JPEG/PNG/WebP, four per entry, 10 MB each), stripped metadata and normalized orientation. Stage locally before uploading to the authenticated private Storage path. Storage and Firestore cannot share one transaction: finalize an attachment event only after verifying its immutable object exists and belongs to the UID. Keep failed uploads staged for retry and clean abandoned uploads. A device-only photo is labeled pending until cloud finalization. Saving a photo-only reflection does not wait for Gemini summarization.

Search is a disposable local index over full saved prompts, responses and accepted/manual summaries. Exports use a consistent fully synchronized head and include the UX's Markdown/JSON/ZIP content, independent of search. Offer synchronization before an export labeled “All saved reflections”; do not silently substitute a partial cache. Computed colours and counts are appropriate in exports, which are read models rather than source events.

Deleting an input no longer requires discarding another entry's historical prompt: the response event preserves the exact output independently. Deletion must still erase the selected entity's own text, photos and response events/private payloads. A tombstone alone does not remove historical private content. Implement restart-safe scoped erasure with retained non-sensitive deletion/ordering metadata, a generation/invalidation mechanism for all caches, and verified cleanup of operational request data. Replay reconstructs the current post-deletion state from surviving events and tombstones, not pre-deletion private content. Whole-journal deletion advances its generation while retaining explicit answers in the settings scope; personalization reset clears its answers/remembered feedback and disables the sources while existing journal prompts remain recorded.

A disconnected device cannot be remotely wiped immediately. On reconnection it must check generation/erasure metadata before rendering a stale cloud cache or submitting its old outbox, purge erased scopes, and require explicit reconciliation of rejected commands. UI must distinguish device cleanup, server completion, and pending other-device synchronization. Explain that prior exports and provider retention are outside app-managed deletion; do not promise to retract Gemini requests already sent.

Previously loaded offline users can read cached entries, search the available journal, and queue user edits. Show “Saved on this device; waiting to sync” separately from “Synced.” First sign-in and Gemini generation require connectivity; provide the labeled bundled starter path offline. Consent disclosures identify Gemini and the actual fields sent, with separate photo processing and journal-context choices. Complete reconstruction requires the cloud stream when the local event cache is incomplete, but never needs Gemini.

## Provisioning and implementation status

The Firebase project, Google provider, Firestore database, private Storage bucket, functions, rules and deployment identity are tracked in [FIREBASE_SETUP.md](FIREBASE_SETUP.md). The setup record distinguishes verified resources from pending configuration. The project bootstrap is authorized; Google login and any billing linkage are external setup prerequisites, not evidence that application features are already deployed.

The implementation plan now starts with Firebase/authentication and recorded external-response events. There is no deterministic-model feasibility gate, no local-only MVP scope, and no proposed separate authoritative AI artifact archive.
