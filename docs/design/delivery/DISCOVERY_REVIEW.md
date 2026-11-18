# Discovery and review prompts: implementation handoff

Status: implementation in progress on PR #34. Manual one-topic Review, visible mode selection, Regular escape and accepted-question provenance are implemented and covered by walkthrough 069. Discovery controls and opt-in lunar scheduling are the next working commits. Existing Regular requests keep their original contract.

## Confirmed behaviour

Jamie confirmed these choices on 19 November 2026:

- **New moon: Discovery.** Use the selected interests reflected on least over the previous **30 complete local days**, rather than Regular's 14-day count window. Count logical entry dates, including imported and backfilled writing. Keep Regular's fresh-invitation instruction A and its existing matching-history pools; changing the count window does not change those history windows or budgets.
- **Full moon: Review.** One selected topic per question, using matching-topic reflections from the previous **30 complete local days**, up to twenty units. A trimmed reflection above 600 characters costs two units, as in Regular generation. Do not use the anniversary pool or unrelated writing to fill this review context.
- **Another Review changes the topic.** Rotate through the eligible review topics before repeating, avoiding the immediately preceding topic when alternatives remain. A sparse vocabulary can only offer the topics the user actually shares.

## Confirmed Review topic selection

Choose the first Review topic randomly among the user's selected topics that have saved reflections in the previous thirty complete local days. Use logical entry dates, including imported and backfilled writing, and current topic assignments. Regenerating a Review shifts to another topic from this eligible pool before repeating; avoid the immediately preceding topic when alternatives remain.

A topic with no recent writing does not enter this pool merely because it is least reflected on. With no eligible topics or no shared history, the open-invitation fallback below remains an operational proposal and must not imply that writing was supplied.

## Proposed operational defaults

| Area | Proposed policy |
| --- | --- |
| Scheduling consent | Off until explicitly enabled; enabling AI alone does not enable lunar scheduling |
| Automatic mode offer | Today, on the local civil day containing the phase instant; no missed-day backlog |
| Provider calls | Scheduling selects the offered mode; requesting a prompt remains an explicit user action, with no new inference merely on app open |
| Occasion use | At most one automatic successful visible offer per occasion; explicit regeneration remains available afterward |
| Manual use | Discovery and Review can also be requested explicitly outside the scheduled day |
| Backfills and reserve generation | Regular unless another mode is explicitly selected; automatic reserve refill stays Regular |
| Declining an occasion | **Regular prompt instead**, preserving the draft and writing |
| Sparse history or sharing off | A valid open invitation, disclosing the actual topic/window and never implying unavailable context was shared |

These are operational proposals rather than additional confirmed answers. Curated long-term user notes remain outside this work.

## Visible behaviour

Give the occasion a visible **Discovery** or **Monthly review** label before the user requests a prompt or writes. “Why this prompt?” explains the actual mode, selected topic and supplied date window. Changing to Regular is always available and does not erase a draft. Date edits of a reflection must not silently replace its chosen prompt or mode. Reuse the current reflection-topic dropdown: accepting a generated question supplies its topic default, an unaccepted candidate does not change it, and manual topic overrides/wording edits remain durable. Existing categories and old mode-less requests retain their recorded behaviour.

Use candidate instruction C from the parent design as the review baseline, subject to wording review. It invites a connection, change or overlooked detail without asserting a pattern, diagnosis or feeling. Regular prompts retain their own instruction. An empty review context must not produce claims of having read writing that was not supplied. Preserve scope, word limit and all independent sharing switches.

Only a successful prompt that becomes visible consumes a scheduled occasion. A failed call does not consume the occasion. An explicit retry creates a fresh request identity from the current source snapshot, matching the existing source/consent guards. A response already received on this device is synchronized under its original identity without repeating inference. Background reserve generation does not consume it. Existing reserve prompts are retained rather than rewritten; only prompts with known mode provenance can be represented as a scheduled review.

## Time and replay contract

Lunar cadence is confirmed. For scheduling, compute the astronomical phase instant offline using a reviewed, pinned calculation/library. Determine the eligible civil day in the captured timezone. Document the supported date range, accuracy and fixture provenance. No dependency is selected in this draft, and no unverified phase table is presented as fact.

Record literal user scheduling choices, timezone and versioned request inputs. Derive eligibility and consumed-occasion state from those choices and successful visible offers. Do not write computed phase dates or counters as user-action events. Persist external AI responses exactly as the existing event model requires; replay never recalculates a different request or calls an AI.

Version the phase calculation independently from selector/instruction versions. Existing requests keep their original mode and inputs after an upgrade. For a phase near midnight, test both sides in the captured timezone, DST transitions and year boundaries. Reconcile concurrent offers across devices without claiming an offline exactly-once guarantee; a previously recorded visible occasion must prevent another automatic one on the next synchronized request.

Calendar-month scheduling is outside this implementation. Use civil-date arithmetic for the thirty-day context and count windows. The phase day is derived in the captured scheduling timezone, rather than independently following each device timezone.

## Small working commits

1. Add an explicit user-selected Review action using versioned context and instruction C. Test empty, sparse and classified histories with the 600/601-character weighting rule. Keep automatic scheduling off.
2. Add Discovery with the confirmed thirty-day topic-count window, visible mode/provenance and **Regular prompt instead** to Today/editor explanations, with replay, drafts and date-edit coverage.
3. Add the confirmed new-/full-moon cadence through opt-in scheduling and a pure deterministic eligibility calculation, including migration and consent checks.
4. Add cross-device offer reconciliation and mobile/desktop walkthroughs for retry, escape, midnight and backfill behaviour.

## Ready criteria

Unit and Firebase tests prove mode/version validation, reference integrity, consent changes, successful-visible consumption, full/tail replay and boundary dates. Mobile/desktop walkthroughs compare screenshots after every action with no masking, `maxDiffPixels: 0` and `threshold: 0`, and generated checks beneath each image. Controlled fictional provider responses run in CI; personal journal review is performed only through explicit in-app consent.

Curated long-term user notes remain deferred. This stage reviews reflections for a prompt, not for an enduring personality profile.
