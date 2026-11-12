# One-topic prompt generation: implementation handoff

Status: draft specification, with no change to live prompts. Stage 4 of the [approved workflow](../TOPIC_AWARE_PROMPTS.md). Builds on [manual topics](https://github.com/DrBrrl/gratitude/pull/30) and classified history; it does not require every historic reflection to be classified first.

## Policy proposed for review

Use fourteen complete local days before the reference reflection date to count saved reflections per selected interest. Count logical entry dates, including imports/backfills and corrected dates/topics, rather than arrival timestamps. Multiple reflections on a day count separately. Unknown and Not yet classified are not interests to rotate through.

Choose among the least-reflected-on selected topics not offered that local day; then expand to other selected topics not yet offered. Once all are exhausted, begin another round, avoiding the immediately previous topic when alternatives exist. A single interest can repeat. No shared interest uses a generic prompt and sends no fabricated topic. Topic counting can occur locally without sharing journal excerpts; a topic description may be sent only with questionnaire-sharing consent.

A visible prompt offer counts toward rotation, including a selected backup with known topic provenance. Reserve generation alone does not count as an offer. Discarding an unsaved draft retains the visible offer but does not consume the starter/backup. Existing reserve prompts without topic provenance stay usable and are not guessed into a category.

These are concrete proposed defaults, still open for review: fourteen days, ±28-day anniversaries, and Unknown permitted only in rediscovery/fallback. They implement the draft policy rather than silently claiming Jamie has selected every boundary.

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

Use instruction candidate A from the parent design as the recommended baseline, subject to wording review. Preserve saved scope and word limit. The provider receives one topic **description**, with consent, and no topic title/internal ID, name/pronouns or connection credentials in the context. Include explicit prompt/feedback pairs only when their sharing switch permits it. Every generation adapter, including personal Gemini keys, local services and reserve refill, must use the same versioned context builder.

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
