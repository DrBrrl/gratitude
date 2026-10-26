# Gentle streaks and calendar home

Design for review, 2026-10-26, based on merged main `0003485`. This PR specifies the feature; it does not implement a calendar, streak counters or new navigation. The user wants repairable streaks, a browsable calendar in the welcome-page box, entry-coloured date circles and a return path to the same calendar month.

## Experience and placement

Use the box currently headed **A moment to notice** on `/`, beneath the Gratitude welcome copy. For a signed-in user, this becomes **Your gratitude calendar**, a private month view and a small positive progress summary. Retain the dark ink background, glass surface, yellow main accent and existing rainbow entry colours. Do not replace Today's prompt card with the calendar.

The welcome page currently has no authentication or repository subscription; those live in `/journal/`. The proposed implementation shares that session and confirmed projection between both routes. Signed-out visitors see the welcome introduction and a clear sign-in/open-journal action, with an explanation of the calendar. They never see another account's calendar or a fictional calendar presented as their history. During account restoration, show loading rather than an empty history or zero streak.

Proposed routing: a user who starts from `/` returns there after sign-in and sees the calendar. **Open your journal** continues into the existing Today/Journal experience. A direct `/journal/` visit retains its existing rule: Today before today's first saved entry, Journal afterwards. Add **Home** to the existing three-button journal navigation so the calendar can be revisited from Today, Journal and Settings; select it on the calendar home. The four items are **Home · Today · Journal · Settings**. Writing still hides the bar. An explicit Today, Journal or Settings tab choice is honoured after route/auth restoration; automatic Today/Journal selection applies only when there is no explicit destination. Adding this fourth item, and the signed-in welcome-page interpretation, are explicit review proposals rather than changes already made.

### Mobile composition sketch

```text
Let us find joy in the small things
Gratitude.
A space to practice being thankful every day

┌────────────────────────────────────┐
│ Your gratitude calendar            │
│ 8 days together                    │
│ Longest stretch: 8 days            │
│                                    │
│ ‹       October 2026 ▾          ›  │
│ Mon  Tue  Wed  Thu  Fri  Sat  Sun   │
│                 1    2    3    4   │
│  5    6    7    8    9   10   11   │
│ 12   13   14   15   16   17   18   │
│ 19   20   21   22   23   24   25   │
│ 26   27   28   29   30   31        │
│                                    │
│ A small moment is enough.          │
└────────────────────────────────────┘
Open your journal →

          Home  Today  Journal  Settings
```

This is a layout sketch with fictional counts, not a data fixture or screenshot. Occupied dates get rings in the exact corresponding entry colour; empty dates have no ring. Use a separate small neutral Today marker and a distinct focus/selection outline so yellow never masquerades as a saved entry. Future dates are subdued and cannot open a writing flow. Empty days are available moments, never red failures, broken chains or overdue warnings.

## What counts as a day

A date counts once when at least one saved projected entry belongs to it. Use `entryTimestamp(entry)` (`entryAt`, falling back to `recordedAt` for legacy entries), then the same local-day convention already used by Today. Do not count the server ingestion day instead of the reflection's chosen date.

- Backfilled and imported entries count exactly like other entries. An imported null prompt shown as `[No prompt]` still counts.
- A saved photo-only reflection counts. AI availability, a summary, word count and prompt type do not affect eligibility.
- Several entries on one date contribute one day. They remain separate, independently editable entries.
- A draft, pending save, pending import confirmation, prompt request or attached photo without a saved reflection does not fill a day.
- Only confirmed projection updates change saved-day credit. Offline editing remains a draft/pending save until acknowledgement; label its pending state separately.
- Saving a date edit moves that entry's contribution. The old day empties only if no other saved entry remains; the new day fills. Unsaved date edits never change counts or circles.
- Reimporting identical records adds no days. Future dates never earn credit; apply existing save validation and exclude future local days from summaries.

The inputs to the calendar selectors are the current confirmed entries, the current clock and the viewer's timezone. **Proposal:** retain today's device-local timezone semantics. Devices in different timezones can group boundary-hour entries differently, and travel can change counts. Midnight must update the view even without a new event. A fixed account timezone would be a separate, explicit product decision; do not silently add one or reinterpret stored instants as source-offset dates.

## Repairable streak rules

A stretch is a maximal run of consecutive occupied calendar dates. The numbers describe the current saved journal, including later backfills; they are not an audit of which days the app was opened or when writing actually happened.

| Summary | Definition |
| --- | --- |
| Current stretch | If today is occupied, the run ending today. Otherwise, if yesterday is occupied, the run ending yesterday; an unfinished today does not break it. Otherwise zero internally. |
| Most recent stretch | The run ending on the latest occupied date, even if it is older than yesterday. |
| Longest stretch | The largest run anywhere in the saved calendar, recalculated after backfills and date edits. |
| Days reflected on | Number of distinct occupied local dates, not number of entries or events. |

When a current stretch exists, use friendly copy such as **8 days together**, without a countdown. With older history and no current stretch, lead with **24 days reflected on** and optionally **Most recent stretch: 3 days** rather than a conspicuous zero. With no entries, use **Your first moment can be today—or another day you remember.** Keep the calendar useful in every state. No irreversible reset events, loss notifications, repair fees, deadlines, streak freezes, rewards or automatic reminders are introduced.

Example: on 8 October, entries dated 1–3 and 5–8 October give a current stretch of four days. Saving a reflection dated 4 October joins them into eight days immediately after acknowledgement. Saving a second entry on the 4th changes neither count nor stretch. On the morning of the 9th, the eight-day stretch is still current while that day is open. If the 9th is later missed, a later backfill can join the stretches again. No permanent record declares the earlier stretch lost.

Adding a backfill may bridge two runs, extend one, or create a separate run; not every backfill increases the current stretch. A date edit may shorten a run. Show the resulting history accurately with neutral copy rather than guaranteeing that every repair increases a counter. Keep all past runs visible through the calendar.

## Calendar behaviour

Start on the current local month unless a valid return context or requested month is available. Use Monday-first weekday headings with full accessible names. Render a six-row grid consistently, reserving adjacent-month positions without pretending those dates are in the selected month. Use actual calendar boundaries, leap years and local DST rules.

Support swiping horizontally between months, plus labelled **Previous month** / **Next month** buttons and a month/year chooser. Ordinary vertical page scrolling must remain available; do not hijack it for month changes. Allow jumping directly across years so an imported multi-year journal does not require dozens of taps. **This month** returns to the current month. Disable next-month navigation beyond the present month. Browsing earlier empty months is allowed within the editor's supported date range; the earliest existing entry is not a barrier to adding an older reflection. Render only the active month and, if needed for a gesture, its immediate neighbours.

### Date circles and multiple entries

**Proposed default:** a date's full circle uses the first-created entry currently belonging to that day, following the same stable primary-entry selection used by `todayReflection`. Here first-created means its order in the canonical projection, as used by Today—not the earliest chosen date/time or the source app’s creation timestamp. Use `colours[entry.colour]`; never assign a new colour from the date, month, visible order or streak position. Repeated colours are normal.

For multiple entries, add a small count indicator and an accessible label such as **26 October 2026, 2 reflections**. The circle represents the primary entry; the day list shows every entry with its own existing tint. Do not create arbitrarily thin ring segments or silently hide extra entries. Re-evaluate the primary when date membership changes: moving the primary away selects the next entry, and moving an earlier-created entry into a day can make it primary. Text/prompt edits, browsing and clock changes do not recolour a date. A segmented or concentric ring is an alternative for review, not the initial implementation contract.

Colour is not the only signal: occupied dates have a visible ring and a saved-reflection label; empty dates have an explicit accessible label. Keep the day numeral readable. Give Today, keyboard focus and the selected date distinct shapes/styles. Aim for at least 44px date/control targets, reducing outer padding on narrow screens rather than forcing horizontal overflow. Check both 320px and the existing 390px mobile viewport, as well as desktop.

### Choosing a date

| Date state | Result |
| --- | --- |
| One entry | Open that entry's full view directly. |
| Multiple entries | Open a day list labelled with its full local date. Show all entries, their prompts, time, colour and photo indicators in normal chronological order. Selecting one opens its full view. Offer Add another reflection. |
| Empty past day or today | Open the independent reflection composer for that date. Make it clear that the date was selected from the calendar and keep the date/time editable. Saving is always explicit. |
| Future day | No writing action; expose an understandable disabled state. |
| Initial history still loading | Show loading; do not infer missing days from an incomplete initial replay. |

For a new historical reflection, propose local noon on the chosen date as the initial editable time, avoiding routine midnight/DST boundary problems. For today use now, so the default is not accidentally in the future. Validate the civil date/time round-trip through the existing editor; never silently move a selected day because a timezone skipped it. Explain the default time so it is not mistaken for recovered historical precision. Calendar selection never edits an existing reflection or starts an AI call automatically.

## Returning to the same month

Replace entry detail's assumption that its origin is always Journal with a typed navigation origin:

```text
Journal origin: query, expanded cards, scroll and initiating entry button
Calendar origin: displayed month, selected local day, scroll and date-button focus
Entry origin: parent origin plus entry ID (for nested edit/back)
```

Keep this UI context outside the event stream and separate from reflection drafts, Today state and saved-entry dates. Preserve the calendar month across component unmounts, entry viewing, editing, confirmation and Back. A validated `month=YYYY-MM` on Home can restore the displayed month after reload; account-scoped session navigation context can retain the selected day and return target. Do not put reflection text or photo data in URLs or persist return targets across accounts. Invalid/stale context falls back to Home's current month or ordinary Journal navigation without crashing.

- From a single-entry date, the full entry's compact back control says **Home** and restores that month, selected cell, scroll and focus.
- From a multiple-entry day list, full-entry Back returns to that day list; its back control says **Home**. Preserve the same month through both steps.
- **Edit reflection** returns to the originating entry on editor Back. Its nested origin still leads back to the calendar. Saving shows the existing confirmation; **Done** returns to Home at the captured month for calendar-origin work, while existing Journal/Today flows keep their current Done behaviour.
- Creating a backfill from an empty date uses **Home** for editor Back; it preserves the draft and original month. After save, Done returns to that month with the new circle and recalculated summary.
- If the user changes the entry date to another month, Back/Done still uses the captured origin month, not the edited entry month. The vacated date's circle/count updates appropriately. Offer normal calendar navigation to find the new date.
- Browser Back/Forward should follow those same destinations. Reloading an entry must preserve a valid return context where possible; direct entry opens with no context use the normal Journal fallback. Explicitly selecting a navigation tab leaves the calendar flow rather than being redirected back later.
- A background sync updates calendar data but never jumps months, opens an entry or steals focus. If a selected day changes from one to several entries, resolve against the latest projection when it is activated. If a referenced entry becomes unavailable, keep the return path and show a recoverable message.

## Event sourcing, caching and privacy

No new event type is needed for streaks or calendar browsing. Existing ReflectionWritten (including explicit dates), ReflectionImported and photo-backed saved entries provide the source of truth. Never append StreakUpdated, DayCompleted, StreakBroken or computed calendar snapshots. Calendar navigation, selected month and return context are local UI state. No AI request, scheduler, Cloud Function, Firebase schema/Rules change or new secret is required by this design.

Keep projection version 6 and its existing IndexedDB checkpoint/tail replay. Add pure presentation selectors, proposed in `src/lib/calendar.ts`, over the loaded projection:

- `indexCalendarDays(entries, zone)` groups IDs by occupied civil day, retaining creation order for the primary ring and chronological order for a day list.
- `summarizeStretches(dayIndex, today)` derives the four summaries from occupied date keys.
- `monthCells(dayIndex, month, today)` creates the small active-month view model.

These are proposed interfaces, not implemented exports. Reuse or extend `entryTimestamp`, `localDay`, `todayReflection` and `chronologicalEntries` consistently rather than introducing competing date/colour rules. Sort occupied days for run detection; do not scan every day since the first entry. Recompute or memoize the day index by confirmed projection cursor and timezone; recompute summaries/cells when the civil day, timezone or selected month changes. Count civil-date adjacency using calendar arithmetic, not `24 * 60 * 60 * 1000` differences between local-midnight instants. DST can produce 23- or 25-hour days.

Keep clock/zone-dependent presentation out of the canonical reducer and durable checkpoint. Discarding an optional presentation memo must recreate the same result from the same projection, clock and zone. Browsing a month reads neither Firestore nor Storage and does not replay the full stream. Photos load only where the existing entry/day presentation needs them; the month grid needs no image downloads.

Share a single account-scoped auth/repository lifecycle between Home and Journal, so navigating routes does not create duplicate listeners or reset drafts/outboxes. Both routes must wait for restoration and enforce the same owner isolation. Scope session navigation/memo data to Firebase project, base path, UID and stream generation, and clear in-memory view state on sign-out or account switch. Never flash the previous account's rings, counts or private text. Keep preview and production namespaces separate.

A reopened warm cache can supply known saved dates while offline, labelled **Saved on this device**. Missing cells/counts may be incomplete until sync; do not present them as verified omissions or a final zero. Distinguish initial loading, cached/offline, syncing and confirmed states. A brand-new offline session retains the app's existing cold-start limitations; this feature does not claim offline authentication or cross-device drafts. Reconnection updates the calendar from confirmed events and never generates AI or automatically submits a repair.

## Implementation slices

Each slice is a working feature with its own focused commit(s) and relevant tests; review the policy choices before implementation.

1. **Pure calendar and stretch model.** Implement selectors and unit fixtures, including a sparse imported history, logical entry dates versus receipt time, current-day grace, run bridging and moving dates. Prove full replay and cached-tail replay feed equivalent calendar results for a fixed clock/zone. No UI or backend migration.
2. **Private calendar home.** Extract shared auth/repository ownership without changing direct `/journal/` landing selection. Add the signed-in calendar in the welcome box, four-item navigation, month browsing/jump, loading/empty/offline states, coloured rings and summaries. Add mobile/desktop E2E coverage for sign-in, browsing and account isolation. Preserve existing branding and direct journal entry flows.
3. **Entry navigation and day lists.** Add single-entry opens, multi-entry lists, typed return context, restored month/focus/scroll and browser history. Cover reload and existing Journal search/expanded-card return behaviour. Entry text/prompt/photo formatting remains shared with the existing journal views.
4. **Calendar repair and editing.** Start dated independent drafts from empty days, protect an existing unsaved independent draft with Resume/discard choice, and retain the selected date if the user must return to it. Scope draft metadata/return context independently; never overwrite a Today or saved-entry draft. Connect save/confirmation/Done, date changes and cross-device updates to calendar derivation. Add action-by-action backfill and repair scenarios.
5. **Acceptance and rollout.** Review all new/affected screenshots, generated walkthroughs, live preview and the policy examples below. Run applicable Svelte/unit/emulator/deployment/E2E checks in pinned Nix. Confirm there are no new computed events, duplicate listeners or automatic AI requests. Update status documentation only after delivery.

If a resumed draft belongs to a different day than the selected empty cell, show that fact and offer **Resume existing draft**, **Keep draft and return to calendar**, or explicit discard before creating the selected-day draft. Do not silently retarget its date. Draft key strategy is an implementation detail to settle with this interaction; preserving existing writing is mandatory.

## Verification contract

Follow E2E_GUIDE.md: every click, swipe, date selection, typing action, back navigation and reload has a screenshot comparison; generated checks appear underneath the full-page image. No masking, cropping or hidden content. Keep `maxDiffPixels: 0` and `threshold: 0`. Freeze clocks/timezones and use fictional source events; make sync and image readiness observable rather than adding sleeps. Do not regenerate any screenshots for this design-only PR.

| Layer | Required cases |
| --- | --- |
| Unit/replay | Empty history; one day; duplicate/same-day entries; photo-only; legacy timestamps; imported backfills and null prompts; gaps at either end and in the middle; joining two runs; today unfilled; missed yesterday; longest/latest/current distinction; moving the only entry versus one of several; stable primary colour; month/year/leap-day boundaries; 23/25-hour DST days; different viewer timezones; future exclusion; projection-cache equivalence. |
| Calendar E2E | Welcome/sign-in/private home; month swipes and buttons; direct year/month jump; 320/390px and desktop layout; no future creation; empty and loaded states; coloured circles, multi-entry indicator and all entries accessible; keyboard-only navigation and non-colour labels. |
| Return navigation E2E | Choose a past month/day, open entry, Back to the identical month/cell; multi-entry list; nested edit and cancel; save/Done; entry moved to another month; browser Back/Forward; reload; journal-origin back/query/scroll unchanged. |
| Repair E2E | Select a gap, choose date/time, write/save, see the ring and joined count; second entry gives no extra day; pending/offline save gives no confirmed credit; reload/draft recovery; draft conflict choice; photo-only repair; imported history; cross-device save/date-edit updates without month jumps. |
| Privacy/regression | Sign-out/account switch clears history; preview/prod session namespaces; no cross-user state; no inference from browsing/replay; optional AI only through existing explicit controls; unchanged Markdown format and historical entry dates; no new Rules needed. |

Use the next available E2E scenario numbers when implementation begins (currently after 016). Add a narrow 320px layout case rather than silently changing existing mobile baselines. Check calendar accessibility with keyboard/focus assertions and an accessible day label, not just image inspection.

## Review decisions

The user requirements are repairable streaks, a browsable welcome-box calendar, entry-coloured occupied dates, entry access and return to the source month. Proposed choices to confirm during review are the private Home route/fourth navigation item, device-local day boundaries, first-created primary ring plus a multiple-entry count, and noon as an editable default for historical dates. These choices are not implemented by this PR and can be revised before coding.
