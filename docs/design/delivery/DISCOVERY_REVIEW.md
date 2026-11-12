# Discovery and review prompts: implementation handoff

Status: draft specification only. Stage 5 of the [approved workflow](../TOPIC_AWARE_PROMPTS.md), following one-topic regular generation. No scheduler, lunar dependency or new AI instruction is enabled by this PR.

## Choices to settle

| Question | Proposed starting policy |
| --- | --- |
| Lunar versus calendar cadence | Keep automatic scheduling off until the user chooses; do not infer a preference from enabling AI |
| Discovery | Explicitly named occasion using regular least-reflected-on topic selection initially |
| Review | Matching-topic reflections from the previous 30 complete local days, within the existing twenty-unit budget |
| Automatic occasions | Today only, at most one successful visible offer per chosen occasion |
| Backfills and reserve generation | Regular unless the user explicitly requests another mode |
| Declining an occasion | **Regular prompt instead**, preserving ordinary generation |
| Sparse history | Valid open review invitation, without implying the AI knows about missing events |

The original notes propose new-moon discovery and full-moon review. Review those choices against a calendar-based monthly option before implementing automatic scheduling. A different discovery weighting or lookback requires a separate decision; a new label must not imply a different algorithm where none exists.

## Visible behaviour

Give the occasion a visible **Discovery** or **Monthly review** label before the user writes. “Why this prompt?” explains the actual mode, selected topic and supplied date window. Changing to Regular is always available and does not erase a draft. Date edits of a reflection must not silently replace its chosen prompt or mode.

Use candidate instruction C from the parent design as the review baseline, subject to wording review. It invites a connection, change or overlooked detail without asserting a pattern, diagnosis or feeling. Regular prompts retain their own instruction. An empty review context must not produce claims of having read writing that was not supplied. Preserve scope, word limit and all independent sharing switches.

Only a successful prompt that becomes visible consumes a scheduled occasion. Failed calls remain retryable with the same request identity. Background reserve generation does not consume it. Existing reserve prompts are retained rather than rewritten; only prompts with known mode provenance can be represented as a scheduled review.

## Time and replay contract

For lunar scheduling, compute the astronomical phase instant offline using a reviewed, pinned calculation/library. Determine the eligible civil day in the captured timezone. Document the supported date range, accuracy and fixture provenance. No dependency is selected in this draft, and no unverified phase table is presented as fact.

Record literal user scheduling choices, timezone and versioned request inputs. Derive eligibility and consumed-occasion state from those choices and successful visible offers. Do not write computed phase dates or counters as user-action events. Persist external AI responses exactly as the existing event model requires; replay never recalculates a different request or calls an AI.

Version the phase calculation independently from selector/instruction versions. Existing requests keep their original mode and inputs after an upgrade. For a phase near midnight, test both sides in the captured timezone, DST transitions and year boundaries. Reconcile concurrent offers across devices without claiming an offline exactly-once guarantee; a previously recorded visible occasion must prevent another automatic one on the next synchronized request.

If calendar cadence is selected instead, specify the chosen day/timezone and short-month behaviour explicitly. Use civil-date arithmetic rather than adding fixed milliseconds. Do not ship both policies merely to avoid choosing one.

## Small working commits

1. Add an explicit user-selected Review action using versioned context and instruction C. Test empty, sparse and classified histories with the 600/601-character weighting rule. Keep automatic scheduling off.
2. Add visible mode/provenance and **Regular prompt instead** to Today/editor explanations, with replay, drafts and date-edit coverage.
3. After cadence review, add opt-in scheduling and a pure deterministic eligibility calculation, including migration and consent checks.
4. Add cross-device offer reconciliation and mobile/desktop walkthroughs for retry, escape, midnight and backfill behaviour.

## Ready criteria

Unit and Firebase tests prove mode/version validation, reference integrity, consent changes, successful-visible consumption, full/tail replay and boundary dates. Mobile/desktop walkthroughs compare screenshots after every action with no masking, `maxDiffPixels: 0` and `threshold: 0`, and generated checks beneath each image. Controlled fictional provider responses run in CI; personal journal review is performed only through explicit in-app consent.

Curated long-term user notes remain deferred. This stage reviews reflections for a prompt, not for an enduring personality profile.
