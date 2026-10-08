# Alternate gratitude journal import plan

Prepared 2026-10-08 for review on `gratitude-import`. This is a proposal, not an implemented importer. No account data has been written.

## Evidence from the supplied export

Inspection read `GratitudeApp_DATA.zip` in memory from the original worktree. The archive remains untracked there; private reflection text, prompts and photos are not copied into this branch or test fixtures.

- `gratitudeEntries.json` contains 686 records, newest first, with 686 unique `noteId` values.
- Creation dates span 2024-11-28 through 2026-10-07 in the supplied offset-bearing strings. Millisecond timestamps agree with every creation/update string; no update precedes creation. All records have different creation and update timestamps, which does not establish how many actual edits occurred.
- Fields are `id`, `noteId`, `noteText`, `createdOn`, `createdOnStr`, `updatedOn`, `updatedOnStr`, `noteColor`, `imagePath`, `driveImagePath`, `addressTo`, `prompt`, `promptId`, `moodId`, and `backgroundId`.
- 685 records contain nonblank text; one is photo-only. Text is at most 308 characters, below the app's 10,000-character limit.
- 683 records have a prompt; three have null prompts. Source colours comprise 43 distinct values. One record has mood metadata; address and background fields are empty/null throughout.
- Five records reference five included JPEGs. Each local image basename matches an archive member. There are seven additional entries beyond one entry per source calendar day; each must remain separate.

## Recommended scope and review decisions

Build a signed-in Settings → Import flow that accepts this ZIP, validates locally, previews results and starts an explicitly confirmed, resumable import into the current account. Parsing and preview require no cloud writes or AI calls. Preserve every record, original prompt and timestamp, and retain source metadata rather than silently translating it away.

Recommend staging text and metadata first, with photo-bearing entries clearly identified. Do not enable the real migration until all five attachments can either be privately stored and exported, or the user has explicitly chosen a text/metadata-only import and understood that the original archive remains the only photo backup. The photo-only record must never disappear: support an attachment-only imported entry, or block it with an explicit unresolved status. Never invent reflection text to satisfy validation.

Review choices before implementation: accept the Settings flow; choose full attachment support versus an explicitly limited first release; confirm source colours should be retained as metadata with the current accessible rainbow presentation; confirm null prompts should render as absent rather than acquiring the app's starter prompt. The source program's name/version is unconfirmed; use a versioned format adapter identified by the archive schema rather than guessing a brand.

## Data mapping and event contract

| Source | Proposed destination / behavior |
| --- | --- |
| `noteId` | Stable source identity; derive namespaced destination entry/event IDs within the current 80-character constraint. |
| `id` | Preserve source-local numeric ID as metadata; do not use as the sole deduplication key. |
| `noteText` | Exact reflection text, including whitespace and line breaks. Render as plain text. |
| `prompt`, `promptId` | Preserve original prompt and optional identity. Null remains null; omit prompt display when absent. |
| `createdOn`, `createdOnStr` | Historical creation instant and original offset/calendar representation. |
| `updatedOn`, `updatedOnStr` | Source's last-update instant and original representation, without fabricating an edit history. |
| `noteColor` | Preserve original colour; assign app rainbow colours deterministically to new imported entries. Do not recolour existing entries. |
| `imagePath`, `driveImagePath` | Preserve provenance privately; resolve attachments only against safe archive members. Never fetch source device/cloud paths automatically. |
| `addressTo`, `moodId`, `backgroundId` | Preserve bounded source metadata, including currently empty values. |

Add a distinct versioned `ReflectionImported` event with immutable provenance and historical creation/update fields. Keep `recordedAt` as the server ingestion timestamp and retain existing `ReflectionWritten` events and revision rules. Existing edits to imported entries must preserve provenance, historical dates and original prompts. Represent attachment-only entries explicitly; ordinary typed reflections should still require nonblank text.

Current limitations confirmed in `src/lib/domain.ts`, `src/lib/firebase/append.ts` and `firestore.rules`: every event is `ReflectionWritten`, prompts are fixed, creation display uses the first event's server time, and blank text is rejected. Backdating `recordedAt` is prohibited by Rules. Extend the pure parser/reducer, append path, Rules, repository and development adapter together; do not bypass Rules with an administrative script.

Bump the projection/checkpoint version and invalidate old cached projections so full replay incorporates imported fields. Journal browsing and export currently reverse append order: sort by historical creation time with a stable ID tie-breaker, independently of event sequence. Today must use historical creation time so importing old entries cannot count as today's reflection. Keep device-local date display consistent with the app, while retaining source offsets for faithful export; verify Hobart DST transitions and date-boundary behavior.

Extend JSON export with a documented version that includes provenance, optional prompts and attachment metadata. Markdown should show original dates and omit absent prompts. Full attachment support needs a downloadable archive containing photos; JSON metadata alone is not a photo backup.

## Validation and duplicate handling

1. Limit archive/compressed and uncompressed sizes, member count, individual file size and JSON record count before allocating large data. Reject traversal/absolute paths, duplicate member names, encrypted members, unsupported entry types and ambiguous filenames. Choose/document generous limits from this archive's measured size (917,743 uncompressed bytes) and synthetic larger cases.
2. Validate every record's exact supported shape, types, IDs, date agreement, chronological consistency, text/prompt/metadata bounds, colour syntax and attachment references. Detect duplicate source IDs and malformed/non-image attachment bytes. Render source strings only as text. Report record-level problems without exposing content in logs.
3. Produce a local manifest with record and attachment digests, source identity and format version. Preview total/new/already imported/conflicting/blocked counts, date span, missing prompts and attachment status. Keep a sanitized summary available for review; content previews stay local.
4. Derive stable identity from format namespace plus `noteId`, scoped by the authenticated account. Use a canonical record digest (including attachment content hashes) to distinguish identical reimports from changed exports. Archive hash alone cannot deduplicate repackaged archives. An identical repeat adds zero events; changed content for an existing source ID becomes an explicit conflict, never an overwrite. Keep text-identical records with different IDs separate.
5. Validate the complete archive before starting. For an import with blocked records, default to resolving the blockers; importing a subset requires an explicit selection and an exact exclusion summary.

## Execution, resume and attachments

Append one record per existing head/pointer/event transaction, in oldest-first order with a stable source-ID tie-breaker. Preserve contiguous event sequences and atomic ownership/revision checks. Reuse a stable import event ID for retries; after the source record has been edited in the app, reimport still recognizes the original immutable import event.

Persist a per-account local resume manifest and derive authoritative progress from acknowledged cloud import events. Stop on sign-out/account change, cancellation or connection loss. Resume by checking immutable events, not trusting a local progress counter. Repeated clicks, two tabs, two devices and concurrent normal reflection saves must not duplicate records or corrupt the stream. Existing drafts remain independent. A partial import remains visible and resumable; cancellation stops future writes and does not promise rollback (deletion is not implemented).

For full photos, first design private storage, ownership Rules, quotas and infrastructure/billing requirements; current provisioning has no attachment storage implementation. Upload to deterministic account-scoped paths, verify hashes and sizes, then append the referencing event. Define recovery/cleanup for uploads whose event commit fails, cross-device retries and conflicting bytes at a reserved path. Do not put image bytes in Firestore events. Keep the original ZIP until a verified complete export includes attachments.

## Implementation increments and acceptance gates

1. **Offline format adapter and preview.** Use a pinned ZIP dependency in the locked Nix/Node workflow. Pure parsing/mapping/digest helpers and synthetic fixtures cover the observed shape and exceptional records. No real journal content enters Git. Gate: the supplied archive validates locally and produces the aggregate counts above without writes.
2. **Historical event and projection support.** Add schema/Rules/replay/edit/export handling and cache migration. Gate: existing event streams still replay identically; synthetic imports preserve exact text, prompts, dates and provenance; imported records sort correctly alongside existing entries.
3. **Resumable authenticated import.** Add Settings preview, confirmation, progress, cancel/resume and conflict reporting. Gate: emulator tests prove owner isolation, schema rejection, atomic sequence/pointer updates, idempotency, interruption recovery, concurrent writers and edits after import. Run a synthetic 686-record exercise to measure runtime and bounded resource use.
4. **Photo completion or reviewed limited mode.** Gate: all five photos and the photo-only entry have explicit outcomes; full mode verifies upload/download bytes and private access, or limited mode prominently reports what is excluded and cannot claim a complete migration.
5. **User review and real migration.** Review the implementation and a local dry-run summary, then confirm the signed-in destination account and selected attachment policy in the app. Import, rebuild from cloud events, compare source/destination counts and canonical content/date/prompt digests, and test export. Retain the original archive. No production import is authorized by this planning request.

For UI changes, follow `E2E_GUIDE.md`: deterministic clocks and fictional fixture inputs, mobile and desktop walkthroughs with checks under each image, screenshot comparison after every action, no masking, `maxDiffPixels: 0`, `threshold: 0`. Include preview, validation error, explicit confirmation, progress/completion, interrupted resume, repeat import, conflict and photo-only outcomes. Run Svelte/type checks, focused unit tests, Firebase Rules/integration tests, deployment checks and relevant strict E2E scenarios in Nix. This documentation-only plan needs no baseline updates.
