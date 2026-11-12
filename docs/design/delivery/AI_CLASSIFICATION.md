# AI reflection classification: implementation handoff

Status: draft specification; classification is not implemented by this PR. Depends on the manual topic model in [PR #30](https://github.com/DrBrrl/gratitude/pull/30). This is stage 3 of the approved [delivery workflow](../TOPIC_AWARE_PROMPTS.md).

## User experience

A saved reflection retains its editable topic. An automatic classification of newly saved writing requires a separate explicit choice; enabling AI prompts alone does not enable it. Offer historical classification in AI settings with the selected connection/model, the number of eligible entries and a disclosure that reflection text and the topic vocabulary are sent to that service. No journal is uploaded merely by opening this page.

Provide **Classify unclassified reflections**, **Pause**, **Resume** and **Cancel remaining**. Start one request at a time. Show completed, remaining and failed counts derived from the source history; a failed item remains retryable. Writing, importing, manual topic changes, starters and backups remain usable during processing. Import completion never waits for AI.

Use all built-in and saved custom topics, including unselected interests, plus Unknown. Classify the reflection content, with any known prompt topic only a hint. An AI result of Unknown is a completed classification, distinct from Not yet classified. Do not extract people, places, diagnoses or personality notes. Users can change every result using the existing picker.

A manual choice remains authoritative after a text edit. An AI choice becomes stale when its reflection revision changes; display that state and allow reclassification. Never replace a manual correction with a late AI response. Deleted or edited entries and changed vocabularies invalidate pending requests before dispatch or acceptance.

## Source and projection contract

Allocate explicit schema versions after inspecting the final merged domain. The event names below describe a proposed contract, not existing supported events:

| Source action or observation | Literal input |
| --- | --- |
| Classification consent chosen | Previous choice reference, enabled flag and selected connection/model reference |
| Batch requested | User-selected entry IDs/revisions and vocabulary/consent references |
| Batch paused, resumed or cancelled | Batch ID and previous control action reference |
| Classification requested | Entry ID/revision, vocabulary reference, consent reference, connection/model and request ID |
| Classification response received | Request ID and bounded external response, including the exact returned topic ID or Unknown |
| Classification retry requested | Failed request reference and current source references |

Do not store computed progress, frequency, eligibility, labels, selected pools or streaks as source events. The provider result is an external observation, as with existing prompt responses. Validate the response against the request vocabulary; unknown IDs, multiple IDs, prose and malformed output fail without assigning a topic. Retain only the bounded result needed to audit/replay; do not duplicate the full reflection in every event.

The projection derives status, AI provenance, staleness and progress. Replay applies accepted responses without contacting an AI. Cached-tail and full replay produce the same state. Rejected stale results cannot overwrite a newer manual event. Keep source observations and application of a valid assignment distinct so an externally returned result can be retained without making it authoritative.

Perform provider calls outside Firestore transactions. Check current consent, reflection revision, vocabulary and manual-topic cursor immediately before dispatch and again when accepting the result. Use stable request IDs; retry persistence of an already returned response without another provider call. A connection interruption after dispatch can make provider execution uncertain: show that status and require an explicit retry rather than promising exactly-once model execution. Cross-device workers must claim a request before dispatch, with bounded recoverable ownership; claims are disposable coordination data, never an alternative source of topic truth.

The backend must independently validate allowed event shapes, ownership, source references, reply size and stale/manual precedence. A client-side check alone is insufficient. Withdrawal stops queued calls; an already dispatched request cannot be recalled. Surface that limit in the consent copy.

## Small working commits

1. Add versioned classification actions, replay/projection/cache migration and Rules. Test Unknown, malformed replies, stale entry/vocabulary/consent and manual correction races.
2. Add explicit consent and classify-one action with the existing provider adapters. Demonstrate a saved entry receiving a topic, correction, reload and full rebuild.
3. Add bounded batch controls and resumable recovery across reloads/devices. Demonstrate pause, resume, cancellation, partial failure and retry on fictional imported writing.
4. Extend JSON metadata for AI provenance and stale state. Preserve legacy JSON output and the existing Markdown format. Native JSON restore requires its own working importer and must not be claimed until implemented and tested.

## Evidence required before ready

- Unit tests: full/tail replay equivalence, cache upgrades, retired custom topics, exact source immutability, invalid replies and manual-edit races.
- Firebase tests: owner isolation, atomic cursor checks, duplicate request/result handling, consent withdrawal and competing worker claims.
- Mobile and desktop walkthroughs: explicit opt-in, local/cloud choice, single result, manual override, import batch progress, pause/reload/resume and failure recovery.
- Every user action followed by an unmasked screenshot comparison with `maxDiffPixels: 0` and `threshold: 0`; generated README images followed by their checks.
- CI uses fictional writing and controlled model responses. This draft authorizes no background processing of anyone's real journal.

Before implementing the dispatch queue, settle whether classification should initially be manual/batch only or also run automatically after an explicitly opted-in save. The recommended first delivery is manual/batch, keeping the consent boundary visible.
