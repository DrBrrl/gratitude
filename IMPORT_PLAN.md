# Alternate gratitude journal import

Prepared 2026-10-08; implemented for PR #7 on 2026-10-25 after integrating main commit `4013a61` (PR #10). The adapter, source events, receipts, private photo resume, provenance export and Settings workflow below are implemented. The supplied archive passed local validation; no private account data has been imported.

## Source evidence and agreed behaviour

The original 2026-10-08 inspection of `GratitudeApp_DATA.zip` found:

- 686 records with unique `noteId` values, spanning 2024-11-28 through 2026-10-07.
- 685 nonblank reflections and one photo-only entry; five records reference five included JPEGs. Each image basename resolves to an archive member.
- 683 original prompts and three null prompts. **Display `[No prompt]` for each missing prompt**, as agreed on 2026-10-24. Do not substitute a starter or generate an AI question.
- 43 source colours and seven entries beyond one entry per source calendar day. Keep every record distinct.
- Numeric millisecond dates agree with their offset-bearing creation/update strings; no update precedes creation. Different update timestamps do not establish an edit history.
- Source fields: `id`, `noteId`, `noteText`, `createdOn`, `createdOnStr`, `updatedOn`, `updatedOnStr`, `noteColor`, `imagePath`, `driveImagePath`, `addressTo`, `prompt`, `promptId`, `moodId`, `backgroundId`. Address/background fields are empty or null; one record has mood metadata.

Local validation with the implemented adapter on 2026-10-25 confirmed 686 supported records, five photos, one photo-only entry and three null prompts. This was a read-only local parse, with aggregate-only output and no migration. The original archive stays untracked in the original worktree. Private text, prompts, filenames and photos must not enter Git, diagnostic logs or synthetic fixtures. The source program's brand/version is unconfirmed; identify the observed schema as `alternate-gratitude-zip-v1` rather than guessing a brand.

The entry point is **Settings → Import journal**: choose the ZIP, validate and preview locally, then confirm the signed-in destination account and exact import summary. Keep source colours as private provenance while using the app's existing rainbow presentation. Parsing and preview perform no cloud writes or AI calls. Import all five images and the photo-only record; a text-only subset is not the default scope.

## What PR #10 already provides

| Existing contract | Reuse and consequence for import |
| --- | --- |
| `ReflectionWritten` schemas 1–6; schema 6 accepts an explicit date and literal prompt or prompt reference | Historical instants and later prompt/date edits no longer require a separate UI workaround. Preserve old schema semantics; add import provenance rather than pretending to type 686 new reflections. |
| `PhotoAttached`, `PhotoRemoved`, summary request/response/edit/failure events | Reuse four slots per entry and predecessor-event checks. Attachment and summary events do not increment text revisions. |
| Attachments may precede the initial reflection write | Attach the photo before finalizing the photo-only entry. Blank reflection text requires an active photo slot; removing its last photo is guarded. |
| `preparePhoto` in `src/lib/photos.ts` | Reuse orientation handling, at-most-2048px longest edge and metadata-free JPEG encoding. Limits are four photos per entry and 10 MB per input/output. Preserve visible images, not byte-for-byte original JPEG encoding or EXIF. Retain the source ZIP. |
| Private Storage objects at `users/{uid}/v1/{photoId}` | Reuse Google-authenticated owner access, immutable creates, authenticated downloads and verified cleanup. No public download URLs, second bucket or Cloud Functions. |
| `chronologicalEntries`, `entryTimestamp`, `todayReflection` in `src/lib/journal.ts` | Feed imported creation instants into `entryAt`. Keep the existing descending-date/creation-order tie policy and independent same-day entries. Backfills must not complete Today. |
| Projection version 5 with cached tail replay | Version 6 adds import receipts/provenance. Full replay must recover import progress and entries without an archive or model call. Image display still requires retained Storage objects. |
| `exportArchive` and JSON archive version 2 in `src/lib/export.ts` | Complete photo journals already export as ZIPs; no-photo journals remain single files. Add import provenance to a versioned JSON export instead of building a second asset exporter. |
| Locked `fflate` dependency | Reuse it for a bounded ZIP reader; no new ZIP package is needed by this design. |

These contracts were checked in the merged domain, append/repository, photo/export helpers, Firestore Rules and Storage Rules. The import adapter, source events and receipts, integrity-aware upload/resume, provenance projection/export and Settings workflow now build on these contracts.

## Mapping and prompt policy

| Source | Destination |
| --- | --- |
| `noteId` | Stable, namespaced source identity, scoped by the authenticated account's stream. Derive destination/receipt/event IDs within the existing 80-character ID limit, reserving space for response/failure suffixes. |
| `id` | Retain the source-local numeric identity as provenance; never use it alone for deduplication. |
| `noteText` | Preserve exact text, whitespace and paragraphs. A photo-only record stays empty; never invent reflection text. |
| `prompt`, `promptId` | Retain the original nullable values in immutable import input. Project a missing prompt as exactly `[No prompt]`. Keep real prompt text unchanged. |
| `createdOn`, `createdOnStr` | Preserve both original forms. Derive the initial `entryAt` from the source instant; retain original offsets/calendar representation in provenance. |
| `updatedOn`, `updatedOnStr` | Preserve the reported last update without fabricating intermediate edits. |
| `noteColor` | Preserve as provenance; assign the next normal app rainbow colour through the reducer. Do not store a computed colour or recolour existing entries. |
| `imagePath`, `driveImagePath` | Retain bounded private provenance and resolve only safe members of the chosen archive. Never fetch source device paths or Drive URLs. |
| `addressTo`, `moodId`, `backgroundId` | Retain bounded original metadata, including null/empty values. |

`[No prompt]` is a deterministic presentation rule for an imported null prompt, not invented source text. Every journal card, full entry and editor must resolve it consistently. JSON exposes the current prompt string while retaining `origin.source.prompt: null`; a source prompt literally equal to `[No prompt]` remains distinguishable from a null. Markdown includes the prompt line using normal Markdown escaping, so it renders `[No prompt]` rather than omitting the question.

Later explicit prompt/date edits use the existing editor. They change current presentation, never the immutable original prompt/date metadata. An identical reimport must preserve those user edits. Source colour retention, Settings confirmation and missing-prompt display follow this policy.

## Implemented events, receipts and replay

Keep the `v1` stream and the existing server `recordedAt` ingestion time. Do not backdate server timestamps or write projected entry documents administratively. Add two versioned source-event types, processed through the authenticated append transaction:

1. **`ImportRecordConfirmed`** records one source record from the user's confirmed import: adapter version, raw bounded source fields, destination entry identity and attachment references. Source-file digests and stable IDs are technical input/integrity references, not journal-state snapshots. Do not record computed prompt placeholders, colours, sort ranks, progress counters or derived entry state. The event creates an immutable per-source claim before upload; pending claims are visible in import progress, not as completed journal entries.
2. **`ReflectionImported`** references that confirmation event and entry ID, carries `expectedRevision: 0` and the active photo slot needed for a blank reflection. It finalizes the user-confirmed import once required attachments have been acknowledged. It does not duplicate the source record or store a derived entry snapshot. The reducer derives text, initial date, prompt/placeholder, revision, colour and provenance from the referenced input.

Between confirmation and completion, reuse normal `PhotoAttached` events. Photo-less records can complete immediately; photo-only records cannot complete until their slot is active. The same confirmed user instruction drives each phase; retry/replay never manufactures new input or redoes AI.

Add a per-source `imports/{sourceKey}` receipt index beneath the account stream, containing event references only: the original confirmation and latest import-phase event. Claims and completion are each atomic with the stream head and event; completion also advances the entry pointer. A stable action ID acknowledges only identical previously committed input. A second client seeing a different record under the same source key reports a conflict, never overwrites it. Derive counts and progress from source events; the receipt index is a checked lookup aid, not a second authoritative journal.

Update `parseAction`, `applyEvent`, `decodeEvent`, append routing and transaction validation, repository/cache loading, the development adapter and Firestore Rules together. Projection version 6 adds import receipts and per-entry immutable origin references; discard older checkpoints once, then resume cached tail replay. Existing event schemas retain their meanings.

Integration points requiring explicit tests:

- Entry pointers and `nextRevision` must accept an imported initial revision, then ordinary schema-6 edits. Older-schema writes cannot bypass imported-date/prompt semantics.
- `knownPrompt`/`resolvePrompt` must recognize the confirmed import's source prompt, including the null-to-placeholder policy, without fake AI response events. Ordinary edits reference it or record new literal user input.
- Date validation, photo-only last-photo removal and AI context revision checks must resolve the initial imported entry through its referenced source event. Rules currently read fields directly from reflection-write payloads; a new type cannot simply be added to a whitelist.
- Preserve the original import claim after text, prompt, date, summary or photo edits. Reimport comparison uses that claim, not the edited current projection.
- Rules enforce owner isolation, bounded exact shapes, contiguous sequence, first import versus completion, atomic pointers, expected revisions and active-photo requirements. The local parser verifies archive/date-string/digest consistency; Rules do not prove the truth of an external source file or hash Storage bytes.

Keep exact source milliseconds even though the current display-order comparator groups times to seconds. Append records oldest first by source creation instant, then source ID, so within-second creation-order ties are deterministic. Do not replace the app's existing tie policy. Today and all date display use the device's timezone, including historical DST; retain source offsets as provenance rather than forcing a source timezone on the UI.

## Validation and duplicate detection

1. Bound compressed and actual expanded bytes, file count, record count and individual assets before large allocations. Use incremental decompression with an enforced output budget, not an unrestricted unzip followed by a size check. Reject traversal/absolute paths, duplicate archive names, encrypted/unsupported members and ambiguous image basenames. Document limits from the earlier 917,743-byte expanded archive and synthetic larger cases.
2. Validate every record's supported fields/types, unique identity, numeric/string date agreement, creation/update ordering, non-future creation, colour syntax, text/prompt bounds and image decodability/references. Reuse current bounds where applicable (10,000 reflection characters, 600 prompt characters); preflight must block unsupported values rather than truncate them. The supplied 686 records passed the adapter’s local dry run; malformed archives still block confirmation.
3. Build a local canonical manifest over source fields and source attachment digests. Preview total/new/identical/conflicting/blocked records, date span, three missing prompts and image/photo-only counts. Keep content previews local and diagnostics content-free. A missing image blocks its record; no silent loss or placeholder-photo substitution.
4. Scope canonical keys to format namespace plus source `noteId`, not ZIP filename or archive hash. Repackaging an unchanged ZIP must still skip identical records. The canonical source digest excludes destination timestamps, normalization output and later user edits; include null values and original file content references. Text-identical records with different source IDs stay separate.
5. Compare against the immutable confirmed input. An identical completed record adds zero events, even after subsequent app edits. An identical pending claim resumes; changed source input under an existing identity is a visible conflict. Validate the whole archive before confirmation. A subset requires a separate explicit selection and exact exclusions; it is never an automatic fallback.

## Image integrity, retries and cross-device resume

Import without AI by default. Reuse the existing optional photo-summary controls after import; importing an archive never generates prompts or descriptions, even if AI is enabled. A summary is searchable only after a user writes one or explicitly requests Gemini, whose exact response remains an event.

For each source attachment, derive a stable private photo ID from its source identity/slot/content reference. The confirmed input ties that ID to the source-file digest before an upload begins. Stage prepared bytes per account, following the existing durable selection pattern. Upload the normalized JPEG, acknowledge `PhotoAttached` against its predecessor, then finalize the reflection. Entry visibility and completion counts follow finalization, not the upload counter. Storage upload and Firestore append are separate operations, not one atomic transaction; receipts and explicit recovery bridge that boundary.

The current `uploadPhoto` helper returns on existing metadata without checking bytes. **That is insufficient for import identity/integrity guarantees.** Add an import-aware path that creates immutable objects with bounded source-identity/source-digest and stored-byte-digest metadata. On retry or a concurrent create failure, read the existing metadata and authenticated bytes, verify their identity and stored-byte digest, and only then acknowledge the upload. An unrelated object or digest mismatch blocks the record; never overwrite or silently adopt it. Test the Storage Rules for immutable metadata as well as immutable content. Original source and normalized stored bytes have different digests; verify download/export against the stored bytes, not the source JPEG.

Do not assume browser JPEG encoding is byte-identical across devices. The first verified successful normalized upload wins for that confirmed source image; subsequent clients reuse it after the identity/integrity checks. If no object exists, a resuming client can reselect the source ZIP, validate the same claim, prepare and upload it. If two clients prepare different valid encodings concurrently, the losing create must verify/reuse the winning object rather than overwrite it or create a second photo event. This must be demonstrated with synthetic different prepared encodings of one source image.

Persist per-account local progress/prepared blobs, but derive authoritative progress from confirmation, attachment and completion events. Reselecting the archive plus replayed receipts must recover on another device without the original device's counter. Pause on cancellation, sign-out, account change or disconnection; keep existing drafts independent. Concurrent normal saves and import clients must preserve a contiguous stream and one completed entry per source identity.

Import failures and pauses retain pending claims/assets for explicit resume. Existing ordinary photo-removal cleanup intents remain device-local; the importer does not automatically delete unfinished uploads or provide a server-wide orphan sweep or rollback. Partial claims stay visible and resumable. Stopping work does not delete completed imports or the last image of a photo-only entry. A winning concurrent upload is reused after verification. Retain the original ZIP until a complete source/destination comparison and photo export have been checked.

## Export and verification gates

Extend the JSON archive to a documented version 3 with immutable import origin and current entry/photo state. Preserve version-2 `createdAt` as the actual server save/ingestion time and `entryAt` as the current logical date; source creation/update representations belong under origin. Do not reinterpret old version-1/version-2 archives or claim a general native-backup restore feature as part of this alternate-format adapter. Reuse `exportArchive`: all five normalized photos and the photo-only entry must survive download, full replay, display and export; missing bytes fail visibly. Markdown keeps its date/prompt/reflection/image format and includes `[No prompt]` for missing original questions unless explicitly edited later.

1. **Local adapter and preview.** Synthetic fixtures cover all source fields, null prompts, a literal `[No prompt]`, duplicate/ambiguous files, unsafe ZIPs, date/size violations, multiple same-day records and a photo-only record. Gate: the supplied ZIP validates locally with the retained aggregate counts, without writes or inference. Any discrepancy must be resolved rather than silently dropping records.
2. **Import events and provenance.** Implement receipt transactions, projection version 6, prompt resolution, editable current dates/prompts and JSON version 3 together. Gate: legacy streams remain unchanged; full and cached replay recover identical state and pending import progress. Source input and user edits remain distinct.
3. **Authenticated resumable import with photos.** Implement identity/integrity-aware Storage handling, reuse attachment events and connect Settings preview/confirmation/progress/pause/resume. Gate: emulator tests prove owner isolation, rejected forged phases/revisions, concurrent clients, zero-event identical repeats, changed-source conflicts, no duplicate photo events, photo-only guards and preservation of existing drafts/edits. Exercise 686 synthetic records and five synthetic photos with bounded resource use.
4. **Review and migration.** Review the implementation and local dry-run summary. Actual migration is a separate explicit confirmation in the signed-in app, naming the destination account and exact counts. Verify 686 completed source identities, five images, one photo-only entry, three placeholder prompts, exact source field/date/prompt digests and current exported image digests. Retain the original archive. Updating this design does not perform or authorize an automatic production import.

For implementation, follow `E2E_GUIDE.md`: mobile and desktop walkthroughs with deterministic clocks and fictional fixtures; screenshot comparison after every action; checks beneath images; no masking; `maxDiffPixels: 0`, `threshold: 0`. Cover preview, validation failure, confirmation, progress/completion, interruption/reselection on another device, repeat/conflict, `[No prompt]`, image rendering, photo-only editing and complete export. Wait for decoded images before captures. Run relevant Svelte/unit/Firebase/deployment/E2E checks in Nix. The implementation adds the importer and regenerated Settings screenshots, with scenarios 015 and 016 covering import and recovery. The separate scale job exercises all 686 fictional records and five photos through real emulator Rules, cross-device resume and a verified ZIP export.

## Limits and recovery behaviour

The adapter accepts this observed alternate ZIP schema, not a general backup restore format. Limits are 20 MiB compressed, 64 MiB expanded/prepared photos, 512 members, 5,000 records, 20 MiB JSON and 10 MiB per JPEG. JPEG headers are bounded to 40 megapixels before browser decoding. The archive must pass as a whole; there is no partial-selection fallback. Unknown record fields, missing or ambiguous images, malformed dates, changed input under an existing source identity and empty entries without a photo block confirmation.

Selecting a ZIP saves it and prepared metadata-free JPEGs in private account/project/base-path IndexedDB storage. Reload revalidates that selection; it does not run the importer. **Forget selected ZIP on this device** removes only that local recovery selection. Another device must select the ZIP again and explicitly confirm resume. Signing out or leaving the screen stops between operations; a current authenticated operation may finish. Pause retains completed entries and pending claims/assets. There is no rollback or automatic deletion of pending import assets.

Identical completed records are skipped even if their current writing, prompt, date or photos were edited. Import origin remains immutable. JSON version 3 is used when entries have origin; ordinary journals retain version 2. Neither format implies native JSON restore support. Markdown remains readable date/prompt/reflection content.

A paused upload is private and retained for resuming. As with existing photo cleanup, a narrow concurrent completion/removal/upload race can leave an unreferenced private object; there is no automatic cross-device orphan sweep. Saved-entry state remains governed by immutable events, and an identical reimport does not restore removed attachments. Retain the original ZIP until the signed-in import and exported entries/photos have been reviewed.
