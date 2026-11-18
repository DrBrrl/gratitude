# One-topic prompt generation: implementation handoff

Status: implemented in PR #33; browser validation and preview publication are tracked in that PR. Stage 4 of the [approved workflow](../TOPIC_AWARE_PROMPTS.md). Builds on [manual topics](https://github.com/DrBrrl/gratitude/pull/30) and classified history; it does not require every historic reflection to be classified first.

## Implemented policy

Use fourteen complete local days before the reference reflection date to count saved reflections per selected interest. Count logical entry dates, including imports/backfills and corrected dates/topics, rather than arrival timestamps. Multiple reflections on a day count separately. Unknown and Not yet classified are not interests to rotate through.

Choose among the least-reflected-on selected topics not offered that local day; then expand to other selected topics not yet offered. Once all are exhausted, begin another round, avoiding the immediately previous topic when alternatives exist. A single interest can repeat. No shared interest uses a generic prompt and sends no fabricated topic. Topic counting can occur locally without sharing journal excerpts; a topic description may be sent only with questionnaire-sharing consent.

A visible prompt offer counts toward rotation, including a selected backup with known topic provenance. Reserve generation alone does not count as an offer. Discarding an unsaved draft retains the visible offer but does not consume the starter/backup. Existing reserve prompts without topic provenance stay usable and are not guessed into a category.

Implementation uses the recommended defaults after approval to proceed: fourteen days, ±28-day anniversaries, and Unknown permitted only in rediscovery/fallback. With no consented selected interest, a regular prompt has no topic or journal excerpts; independently approved guidance and feedback remain available in personal mode.

## History selection

Retain a maximum of twenty units and unique reflections across pools. A trimmed full reflection over 600 UTF-16 code units costs two units; exactly 600 costs one. Apply that cost before the existing 1,000-character provider excerpt limit. Exclude the edited reflection, drafts, blank text and entries on/after the reference local date.

| Pool | Budget | Eligibility |
| --- | ---: | --- |
| Recent, reserved first | 5 | Same topic, previous 30 complete local days |
| Anniversary | 8 | Same topic, ±28 civil days around month/day in previous years, spread across years |
| Rediscovery | 7 | Same topic or Unknown, ranked by least recent successful use |
| Fallback | Unfilled units | Remaining eligible same-topic or Unknown history |

Keep actual pool labels in the explanation. Prefer same-topic writing to Unknown when use ranks tie. Never use unrelated topics to fill a shortage, duplicate a reflection or exceed the remaining budget. A small or empty context is a valid result. Use the existing civil-date, leap-day and year-boundary conventions, extending and testing the anniversary window explicitly.

## Versioned generation and replay

Introduce a new instruction and selector version; old persisted requests keep their historical context and wording. Record literal selection seed, source snapshot references, chosen-interest input references, reference date/timezone, sharing and vocabulary references, and purpose/connection/model. Derive pools, topic counts and excerpts in projection/context code, with exact input validation. Do not emit counters or calculated pools as user-action events.

Before making a provider call, validate the saved input against current consent, referenced entry revisions and topic/vocabulary revisions. If invalidated, visibly replace the pending request through a new action rather than silently changing its context under the same ID. A retry of the same still-valid pending request uses the same seed and input. Persist external AI responses, then replay them without another AI call. The selected prompt's topic is provenance, not proof of the reflection's eventual content.

Use instruction A from the parent design for new `gratitude-v5` requests. Preserve saved scope and word limit. The provider receives one topic **description**, with consent, and no topic title/internal ID, name/pronouns or connection credentials in the context. Include explicit prompt/feedback pairs only when their sharing switch permits it. Every generation adapter, including personal Gemini keys, local services and reserve refill, must use the same versioned context builder.

“Why this prompt?” should show the topic title locally, regular mode, supplied history count and source switches. Its explanation must match the actual request, including sparse contexts and fallbacks. AI settings should explain the one-topic selection without implying that all interests are sent each time.

## Small working commits

1. Version and unit-test pure topic rotation and history selection; leave live generation unchanged. Include imports, date/topic edits and sparse histories.
2. Add validated source/request schemas, Rules, cached-tail replay and visible-offer bookkeeping. Test concurrent devices and stale snapshots.
3. Wire the new instruction/context into ordinary and editor generation, then reserve refill. Add the truthful explanation and settings copy.
4. Add mobile/desktop generation → alternative → save/correct flows and provider failure/retry. Preserve starter/backup consumption and old-request replay.

## Acceptance matrix

- Reference midnight, DST, leap years and anniversary windows crossing year boundaries.
- Costs at 600/601 characters, two-unit items with only one unit left, no duplicates and never more than twenty units.
- Unselected/retired categories, unclassified/Unknown entries, zero/one/many interests and all topics offered today.
- Successful-use ranking only after an actual successful generation; reserve offers and background refill remain distinct.
- Questionnaire, journal and feedback consent independently off; revoked consent blocks queued requests.
- Exact provider JSON and instruction assertions across adapters, with no identity or credential leakage.
- Seeded full/tail replay equality and deterministic fictional clocks. Concurrent offline offers may repeat; reconciliation must not claim global uniqueness it cannot enforce.
- Each walkthrough action followed by an unmasked zero-pixel screenshot, with generated checks beneath the image. Full shared-domain/Rules CI remains required.

Lunar scheduling and curated long-term user notes are outside this implementation stage.


## Persistence and compatibility

New request schemas 28–42 retain the existing daily/editor/backup and connection variants and add `snapshotId`, a literal reference to the confirmed source-stream head. Selector `topic-v1` derives the topic from that snapshot and the recorded random seed. No selected topic, frequencies, calculated pools or generated notes are added to action payloads. Existing request schemas 1–27 keep their historical selectors and instructions; received results remain immutable source events.

Transactions and Rules reject a request if its snapshot head changed. Before dispatch the browser checks that the request is still the current stream head; personal Gemini repeats that check in the relay. A changed source requires a fresh explicit request rather than inference with silently substituted context. Consent, answer and connection revisions retain their existing checks. Projection version 19 rebuilds old checkpoints once, derives per-request topic/count explanations, and validates topic-filtered source references during replay.

A new `PromptViewed` schema 2 records a displayed foreground AI question by identity, local reference day and surface. Background generation and failed calls do not create topic offers. Hidden tabs defer their AI offer until visible. Backups reuse existing viewed actions, deriving known topic provenance locally; explicit category corrections (including Unknown or clearing a category) take precedence. Existing reserves remain available. Draft discard and save-time consumption rules are unchanged. Offline devices may independently offer the same topic; subsequent synced draws include both recorded offers.

Manual Unknown review and individual classification tools also display attached photos and their current saved descriptions alongside the prompt and reflection. These are private, read-only review aids: opening or correcting a topic neither requests a description nor sends image data to the classifier. Removed photos stay absent and unavailable images retain their description and the ordinary retry control.

Walkthroughs [066](../../../tests/e2e/066-topic-prompts/README.md) and [067](../../../tests/e2e/067-topic-review-photos/README.md) exercise new generation and photographic review. Existing provider, weighted-history, backup-refill and onboarding walkthroughs retain their assertions under the new policy. Lunar discovery/review scheduling remains PR #34; curated user notes remain outside this delivery.
