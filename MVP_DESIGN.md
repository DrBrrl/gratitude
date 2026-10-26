# Gratitude MVP design

This proposal defines the first usable Gratitude application, following [UX_DESIGN.md](UX_DESIGN.md). The backend is Firebase, users authenticate with Google, and Gemini supplies daily prompts and photo summaries. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) sequences the work. The implemented increments include the Firebase foundation, journal browsing/drafts/export, dated and multiple entries, Gemini prompts, and private photo attachments with editable summaries.

## Implemented foundation in PR #4

The `/journal/` route implements Google sign-in, save/edit against a fixed versioned starter prompt, a private ordered Firestore stream, live subscriptions, a checksummed IndexedDB projection checkpoint, and a durable pending-save outbox. A second browser can reconstruct the same journal. Recovery discards the checkpoint and replays all events. Browser transactions, Security Rules validation, idempotent retries, revision conflicts and owner-only access are emulator-tested. Live provisioning is tracked in [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

This slice uses `ReflectionWritten` with entry ID, original text, expected revision and starter ID. Sequence and server timestamp are infrastructure metadata; prompt text, entry revision and rainbow position are derived. The stream head and per-entry last-event pointer are transactionally maintained append indexes, reconstructable from the event stream. Rules derive the expected revision from the prior immutable event; no entry snapshots are stored in these indexes. Missing/damaged cloud indexes require controlled repair, while local projection caches can be discarded by the user. The complete MVP event vocabulary below remains planned; preserve or explicitly migrate this first schema when extending it.

Later increments implement autosaved device drafts, search, consistent-head exports, recorded Gemini prompts and photo summaries. Source events now include photo attachment, summary request/response/failure, user description edits and removal; see the photo contract below. Full offline cold starts, onboarding and historical erasure remain planned.

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
| Cloud Firestore | Authoritative per-user event stream and atomic append indexes, protected by Security Rules |
| Cloud Storage for Firebase | Private, metadata-stripped photo assets referenced by events |
| Firebase AI Logic | Managed Gemini access from the client; responses recorded as events |
| IndexedDB | Confirmed-event cache, versioned local projection checkpoints, pending user-action outbox and photo staging |
| Service worker | Base-path-scoped application assets for previously loaded offline use |

Production uses `gratitude-drbrrl`; PR previews use `gratitude-drbrrl-dev`. Both have Google authentication and Sydney Firestore. CI explicitly selects their public SDK configuration; no Gemini secret enters the build. No Cloud Functions are required for the journal foundation. Both projects use billing-linked paid Gemini and separate private Storage buckets, with App Check, Google sign-in and per-user gateway quotas. Storage and inference incur usage costs under the linked billing account.

IndexedDB is namespaced by project, UID, stream generation and deployment base path. Namespacing and separate backend projects are not a browser security boundary between scripts on the shared GitHub Pages origin; use preview accounts/test data and consider separate origins before production release.

## Reference patterns

[Food's MVP design](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/MVP_DESIGN.md) records nondeterministic AI responses as events, then derives read models. Gratitude follows that boundary directly. Its [store](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/src/lib/store.ts) and [IndexedDB repository](https://github.com/anicolao/food/blob/578663f1204a9064de47dd63eda7a143c38288a6/src/lib/db.ts) illustrate separate event persistence and incremental projections.

[Jaipur's event types](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/src/lib/game-events.ts) and [Firebase repository](https://github.com/anicolao/jaipur/blob/76cc8bcaa8d4f111c2ebc26b67162ca646b4576a/src/lib/game-repository.ts) inform versioned reducers, authenticated streams, pending actions, and cached recovery. Gratitude adds an explicit projection checkpoint and transactionally allocated sequence rather than replaying all cached events on each launch or relying on client clocks for cross-device order.

```mermaid
flowchart TD
  User[Signed-in user] --> Client[SvelteKit client and local outbox]
  Client --> Transaction[Firestore transaction and Security Rules]
  Transaction --> Stream[Private immutable event stream]
  Client -->|Live requests only| AI[Firebase AI Logic / Gemini]
  AI -->|Exact response recorded by client| Transaction
  Stream --> Projector[Pure versioned projector]
  Cache[Disposable local checkpoint] --> Projector
  Projector --> Cache
  Projector --> UI[Journal, drafts, prompts, settings and search]
```

The projector has no Gemini client and no effect-dispatch API. Live user-request processing is separate from subscriptions, hydration, and replay.

## Identity, authorization, and data layout

Enable Google in Firebase Authentication and register the production application's authorized domain. Use Firebase's supported popup/redirect flow and validate redirect behaviour on the mobile browsers being supported. Journal ownership uses `request.auth.uid`, never an email or a UID supplied by the caller. [Firebase Google sign-in documentation](https://firebase.google.com/docs/auth/web/google-signin)

Proposed paths:

```text
users/{uid}/streams/{generation}                 # ordered head and integrity metadata
users/{uid}/streams/{generation}/events/{eventId}
users/{uid}/streams/{generation}/entries/{entryId} # last-event pointer for append validation
users/{uid}/assets/{assetId}                     # upload/erasure bookkeeping
Storage: users/{uid}/{generation}/{assetId}
```

The active generation is repository metadata, changed during whole-journal deletion to prevent stale offline devices restoring an erased history. Settings that must survive journal deletion remain in a separately scoped user-settings stream. Replay merges that scope using explicit referenced settings revisions, not an unspecified interleaving of two streams.

Firestore rules permit a Google-authenticated user to read only their own stream. A browser transaction creates one event and advances the head and entry pointer atomically. Rules independently validate the exact action schema, ownership, next sequence, expected revision, server timestamp and all cross-document links using `getAfter`. Event updates/deletes and unrelated collection writes are denied. The client cannot bypass these checks by modifying JavaScript. [Atomic transactions and Rules](https://firebase.google.com/docs/firestore/manage-data/transactions)

Storage uses owner-only Google-authenticated reads, create-only normalized JPEG uploads (maximum 10 MB), and owner deletions. The browser fetches authenticated bytes; permanent bearer download URLs are not created. Firestore stores no image bytes. The Firebase AI gateway uses Auth, App Check and per-user quotas. Client-written model results are user-owned records, not provider-attested evidence. Rules accept only implemented event types and validate the head, entry, AI-control or photo-slot pointer atomically.

## Events and computed state

A committed record carries `eventId`, `schemaVersion`, `rulesVersion`, `source` (`user` or `gemini`/service outcome), `type`, typed `payload`, causation/request references, observed client time/timezone where relevant, and transactionally allocated sequence/time. Identity, sequence, versions, integrity hashes, and transport bookkeeping are infrastructure metadata rather than derived journal state.

| Events | Persisted facts/inputs | Projection output |
| --- | --- | --- |
| `AnswersSubmitted`, `AnswersCleared`, `AIChoicesConfirmed`, `PersonalizationResetRequested` | Explicit answers and choices; confirmation references | Effective settings, allowed context sources and remembered feedback |
| `DayOpened`, `PromptRequested`, `AnotherPromptRequested`, `StarterPromptChosen` | Interaction time/timezone, target/request identity, user's discard choice or starter reference | Day identity, reserved colour, active request and draft binding |
| `PromptResponseReceived` | Exact Gemini prompt text, request ID, actual model identifier, response/finish metadata and outbound-context provenance | Displayed prompt, explanation of source use, request completion |
| `AIRequestFailed` | Request/attempt ID and sanitized observed provider/transport outcome | Retry/fallback availability, without invented prompt text |
| `DaySkipped`, `DayResumed`, `ReflectionWriteOpened`, `ReflectionEditOpened` | User-selected day/entry/prompt references | Navigation-independent daily state and editable draft |
| `DraftTextChanged`, `ReflectionSaveRequested` | Literal user-entered text and target revision, or save reference | Saved entry, dirty state, word counts |
| `PromptFeedbackSubmitted`, `PromptFeedbackRemoved` | Prompt reference and literal feedback, or feedback reference | Remembered feedback and future context eligibility |
| `PhotoAttached`, `PhotoRemoved`, `PhotoSummaryRequested` | User-selected private asset reference and summary choice, or target/request reference | Attachment relationships and pending summary status |
| `PhotoSummaryResponseReceived` | Exact Gemini summary text and response metadata, photo version and request ID | Image description suggestion and summary status |
| `PhotoSummaryEdited` | Explicit user edit/clear against a description revision | Manual description overriding AI suggestions |
| `ReflectionDeletionRequested`, `JournalDeletionRequested` | Explicit target/whole-journal confirmation | Tombstones and required erasure work |

AI result events retain the consumed response exactly, including safe response metadata needed to interpret it. Store bounded text/JSON responses in Firestore; never put image bytes, credentials, hidden model reasoning, or entire projected entries there. Context provenance records the actual outbound request boundary: template version, input source/revision references and enabled sources. Avoid duplicating private source text in provenance. Operational exception stacks and secrets never enter user events.

For an edited AI description, record user edit operations against the response/manual revision, not an automatic snapshot of the entry. Accepting an unchanged suggestion needs only its response reference. Starter text comes from a versioned bundled catalogue; no AI call or AI-response event is invented for it.

## Ordered writes and cross-device conflicts

The browser transaction checks the stable event ID, reads the canonical head and the entry's previous event, checks the expected revision, then appends the new event with `serverTimestamp()` and advances both indexes. Rules repeat validation independently. Identical retries return the original event after confirming its full action payload; reused IDs with changed input fail. Concurrent attempts can receive a Rules denial before the SDK retries a precondition, so the client checks for an identical committed event and makes bounded transaction retries. Text conflicts retain the pending text for explicit recovery.

Cloud head/pointer indexes are operational metadata, not independent sources of domain state. They must only advance with an event. Local projections are rebuilt through the pure reducer; cloud-index repair, if ever needed, must reconstruct from the validated full stream through administrative tooling rather than weakening client rules.

A pending draft edit and its Save action can be submitted as one ordered command batch. Sequence is authoritative; client timestamps serve only as recorded interaction context. Concurrent text edits use explicit expected revisions. A stale write returns a conflict while retaining the unsent text; the user can reload or explicitly reapply it. Do not silently apply last-write-wins to journal prose. Sync acknowledgements remove matching pending IDs once, not append duplicate events.

An offline outbox is separate from the confirmed stream and checkpoint. It contains user commands, original base revisions, generation, and stable IDs. Render a provisional overlay while offline; on reconnect, fetch confirmed changes, submit commands, and rebase or surface conflicts. Pending commands never acquire invented server sequences. An offline day colour is labeled provisional until its first cloud commit because another device may reserve a day first; once confirmed, its colour never changes. This is the explicit cross-device amendment to the original same-device colour promise.

Daily prompts are scoped to a local date, while reflections have independent identities and may share that date. Palette positions derive from entry creation order in the pure projection; backfilling does not recolour existing entries. No colour event or palette payload is needed. Today continues the first-created reflection belonging to its local date. New dated-entry drafts are separate from Today and saved-entry drafts; midnight changes do not rebind their chosen time. Two devices reconcile prompts through the request/day revision, not competing unversioned overwrites.

## Gemini execution and credentials

**Current implementation:** the browser uses the Firebase AI Logic managed HTTP gateway with Firebase Auth and App Check SDK tokens. Firebase JS 12.19's Gemini response mapper omits `modelVersion`; reading the gateway response directly preserves the actual provider-reported version. The repository Gemini key remains unused. Preview and production configurations select paid mode after billing verification; saved user choices control personal context. The optional generic mode excludes journal/feedback/preferences content.

`AIChoicesConfirmed`, `PromptRequested`, `PromptResponseReceived`, `AIRequestFailed`, `StarterPromptChosen` and `PromptFeedbackSubmitted` are now supported source events. A stream-local `ai/control` pointer is reconstructable operational metadata and provides transactional request ownership and consent invalidation. Empty feedback replaces that prompt's current note for future context; immutable older events remain history. `ReflectionWritten` version 2 references a recorded response; version 1 starter reflections still replay. Version 3 adds the user-chosen `entryAt` timestamp for independently created/backfilled entries. Its prompt and date are immutable across text edits. Firestore stores the chosen instant as a Timestamp and separately stamps the actual `recordedAt`; projections and exports never replace the latter with a backdated save time. Projection version 3 invalidates older disposable checkpoints and rebuilds from compatible events. Journal ordering uses entry time to second precision, then reverse creation order. JSON archive version 2 exposes both actual `createdAt` and logical `entryAt`; Markdown keeps its date/prompt/reflection-only format. All requests originate from explicit clicks, including retries after interruption. Received responses have a separate device outbox and never trigger fresh inference when synced.

Use Firebase AI Logic for managed Gemini access from the client in a later increment. The repository's existing `GEMINI_API_KEY` remains unused and private; it must never be copied to Vite configuration or the browser. Evaluate the supported Gemini Developer API no-cost tier, quotas, App Check and data-use terms before enabling real journaling inputs. This integration does not require a custom Cloud Function. [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing)

Live processing is separate from replay:

1. An explicit user action commits a request event with stable request identity and consent/settings references.
2. The live client reconstructs eligible context (at most five recent entries and twenty feedback items with versioned size limits), rechecks consent and calls Gemini outside any Firestore transaction. Use a transactional claim if coordinating multiple active devices.
3. Store the exact consumed response, actual model, request identity and context provenance in a response event. Deduplicate acceptance by stable response ID. Recheck current generation/consent/target before accepting late output.
4. Only committed response events supply the durable prompt or summary. Persist an already-received result locally for retry rather than issuing inference again merely because the event write failed.
5. An interrupted browser cannot execute background work after it closes. Show unfinished requests with explicit resume/retry; replay and subscriptions must never dispatch inference. Provider calls may repeat across crash boundaries, so do not promise exactly-once billing.

Prompt and photo AI event schemas and Rules are implemented; vocabulary for other proposed stories remains planned. The browser can author records only in its own account; managed model access does not make client-written response records provider-attested. Historical text remains reproducible because replay reads events, never calls a model. Late summaries cannot override manual descriptions. Removed targets and revoked sharing invalidate pending work.

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

Photos accept JPEG/PNG/WebP, four per entry, 10 MB each. The browser normalizes orientation and strips metadata into a JPEG of at most 2048 pixels on its longest side. Selection is staged locally; confirmation uploads and attaches to the authenticated account immediately, with a disclosed distinction from local draft text. Storage and Firestore cannot share a transaction: the attachment event follows acknowledged upload/metadata verification. Staged identity and cleanup intents support retry/cancellation after interruptions. A photo-only reflection can be saved without waiting for Gemini.

Search is a disposable local index over full saved prompts, responses and accepted/manual summaries. Exports use a consistent fully synchronized head and include the UX's Markdown/JSON/ZIP content, independent of search. Offer synchronization before an export labeled “All saved reflections”; do not silently substitute a partial cache. Computed colours and counts are appropriate in exports, which are read models rather than source events.

Deleting an input no longer requires discarding another entry's historical prompt: the response event preserves the exact output independently. Deletion must still erase the selected entity's own text, photos and response events/private payloads. A tombstone alone does not remove historical private content. Implement restart-safe scoped erasure with retained non-sensitive deletion/ordering metadata, a generation/invalidation mechanism for all caches, and verified cleanup of operational request data. Replay reconstructs the current post-deletion state from surviving events and tombstones, not pre-deletion private content. Whole-journal deletion advances its generation while retaining explicit answers in the settings scope; personalization reset clears its answers/remembered feedback and disables the sources while existing journal prompts remain recorded.

A disconnected device cannot be remotely wiped immediately. On reconnection it must check generation/erasure metadata before rendering a stale cloud cache or submitting its old outbox, purge erased scopes, and require explicit reconciliation of rejected commands. UI must distinguish device cleanup, server completion, and pending other-device synchronization. Explain that prior exports and provider retention are outside app-managed deletion; do not promise to retract Gemini requests already sent.

Previously loaded offline users can read cached entries, search the available journal, and queue user edits. Show “Saved on this device; waiting to sync” separately from “Synced.” First sign-in and Gemini generation require connectivity; provide the labeled bundled starter path offline. Consent disclosures identify Gemini and the actual fields sent, with separate photo processing and journal-context choices. Complete reconstruction requires the cloud stream when the local event cache is incomplete, but never needs Gemini.

## Provisioning and implementation status

The Firebase project, Google provider, Firestore database, private Storage buckets, rules and optional deployment identity are tracked in [FIREBASE_SETUP.md](FIREBASE_SETUP.md). The setup record distinguishes verified resources from pending configuration. Google login authorized provisioning; billing is not required by this journal foundation. The setup inventory distinguishes provisioned resources from verified application behavior.

The implementation plan now starts with Firebase/authentication and recorded external-response events. There is no deterministic-model feasibility gate, no local-only MVP scope, and no proposed separate authoritative AI artifact archive.

## Implemented photo event contract

Projection version **4** rebuilds older checkpoints once and then caches incremental replay as before. `photos[entryId_slot]` derives each of four attachment slots, the current summary/origin/status and last accepted event. Event payloads contain user inputs and external AI results; no derived colours, counters, summary statuses or entry snapshots are persisted. Each photo action advances the stream head and `photos/{entryId}_{slot}` pointer in one transaction. Its `previousEventId` serializes changes across devices without advancing the reflection text revision.

- `PhotoAttached`: entry ID, slot 0–3, fresh immutable asset ID and prior slot-event reference (null for an unused slot).
- `PhotoSummaryRequested`: same photo target and current event reference, committing explicit consent before dispatch.
- `PhotoSummaryResponseReceived`: exact text (up to 1000 characters), actual model version and STOP completion reason, with the request as predecessor and stable `{requestId}_response` identity.
- `PhotoSummaryFailed`: bounded observed failure category and `{requestId}_failure` identity. Retry is a new explicit request, never a replay side effect.
- `PhotoSummaryEdited`: literal user summary, including empty text to clear it. A correction invalidates older request results.
- `PhotoRemoved`: target and current predecessor; removes the attachment from the current projection/search/export. Historical summary text is retained until a future erasure flow.

Schema **4** of `ReflectionWritten` permits empty text only with a currently active `photoSlot` reference, retaining `promptId`, `entryAt` and the expected text revision. `entryAt: null` preserves legacy save-time semantics on a photo-only edit; explicit dates remain immutable across schemas 3/4. A photo-only saved entry must keep at least one attachment until text is added. Schemas 1–3 stay readable and keep their original meaning. JSON archive version 2 adds optional `photos` metadata to entries; photo archives include the actual normalized files in a ZIP.

A selected file is normalized and durably staged in the UID/project/base-path IndexedDB outbox before upload. Retrying uses the same action/asset identity and acknowledges a prior immutable object instead of overwriting it. Attachment commits only after a successful upload acknowledgement or authenticated metadata verification. Since cross-service atomicity is unavailable, uploads can precede their attachment event; a retained selection resumes that operation, and cancellation checks the server event before cleaning an uncommitted object. Confirming attachment syncs it immediately, even for an unsaved reflection; draft text stays local. This is disclosed in the UI. Discarding an unsaved draft removes its attachments; a text-edit discard preserves saved attachments.

Photo removal records a local cleanup intent before committing its event. Cleanup verifies the immutable removal event on the server before deleting the object; retries and reload recovery are idempotent. Failed cleanup is visible and recoverable. The cleanup intent remains device-local; another device cannot finish an originating device’s interrupted intent until that device returns. Full server-wide orphan sweeping and historical erasure are not implemented.

Photo generation uses the existing authenticated Firebase AI Logic gateway with inline normalized JPEG data and a visible-content instruction, without daily-prompt context. The user can attach without AI; choosing summarization explicitly authorizes only that photo. Received responses are durably staged before cloud append. A predecessor change from editing, removal or replacement rejects late results. Reload never restarts generation. Gemini availability, summary completion and reflection saving are independent.

## Reflection prompt editing

Projection version 5 adds a disposable `prompts` map derived from manually written source text. ReflectionWritten schema 5 retains the schema 4 entry/date/photo references and adds `promptText`. A non-null value is the user's literal question (1–600 characters, not whitespace only), and `promptId` equals that action's event ID. A null value selects an existing starter, AI response or earlier manual-prompt source ID; AI output is referenced, never copied as a computed snapshot. Schema 5 explicitly permits changing an existing entry's prompt with the same expected-revision conflict check as its response. Schemas 1–4 remain readable and preserve their earlier semantics. Original entry dates and colours remain stable. Prompt and reflection changes become one committed user action; until then they remain in the local draft.

PromptRequested schema 2 adds the target `entryId` and its expected `entryRevision` for editor generation. Options generated for an older saved revision are not offered on a newer edit. It uses the same consent/context bounds and single-request claim as daily generation. Exact responses are ordinary PromptResponseReceived events. Only schema 1 daily requests change the daily selection; schema 2 results become selectable editor options. Received-result outbox recovery and replay never repeat inference. Manual edits are not overwritten by a late response.


## Editable reflection dates (2026-10-22)

ReflectionWritten schema 6 has the same exact payload shape as schema 5, and explicitly allows replacing entryAt under the reflection's expected-revision check. The chosen instant is user input; recordedAt remains the original server save timestamp and colour remains derived from creation order. Schemas 1–5 retain their original date immutability. A date-only edit is a new source action, not a mutation of historical events. Null retains the legacy original-save-time interpretation; the editor preserves it until an explicit date selection. New independent entries continue to select their opening local time.

All composers show the local date/time input. Confirmed valid values survive local draft reload and commit with body/prompt changes; blank, invalid and future dates block save. Today is selected from the projected entry date, so a saved move into or out of today's local day changes its completion/continue state. Journal order and exports use the revised date. The projection shape and derivation for all older events remain unchanged, so existing version 5 checkpoints can apply schema 6 tail events without a cache-version change. Full replay produces the same result.

## Alternate journal import (2026-10-25)

Projection version 6 adds import receipts and immutable entry `origin`. `ImportRecordConfirmed` schema 1 stores the confirmed raw source record and technical identities/file digests; `ReflectionImported` schema 1 references it after required `PhotoAttached` actions. The projection derives prompts (including `[No prompt]` for a null source), date, rainbow colour, text revision and progress. No computed journal snapshot or inferred edit history is stored in events. The `imports/{sourceKey}` lookup index holds only confirmation/latest phase references; event, index, entry pointer and stream head advance atomically. Imported entry pointers retain their `importId` across ordinary schema-6 edits.

Settings import validates the whole archive, previews a verified cloud prefix and requires destination-account confirmation. Stable IDs and comparison against immutable source input permit cross-device resume and zero-event identical repeats without overwriting later edits. Stored photo identity and bytes are checked on retry; different valid browser JPEG encodings reuse the verified first winner. Replay, reload and reconnect never start import or AI work. JSON version 3 adds origin when present; ordinary journals retain version 2. See [IMPORT_PLAN.md](IMPORT_PLAN.md) for bounds, privacy and the separate user-confirmed migration step.


## Proposed calendar and streak presentation (2026-10-26)

The review proposal in [STREAKS_DESIGN.md](STREAKS_DESIGN.md) derives occupied days and repairable consecutive-day stretches from confirmed projected entries, their logical dates, a clock and viewer timezone. No computed streak/day events, canonical counter fields or projection-version change are proposed. The existing cached projection remains the source for presentation selectors; navigating months does not replay or fetch the event stream. UI return context is separate from source events and drafts. A shared account-scoped session/repository would support both the private welcome-box calendar and journal routes without duplicate listeners. These are proposed changes, not current application behaviour.
