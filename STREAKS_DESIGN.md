# Gentle streaks, week boxes and a scrolling calendar

Implemented in PR #11 after the 2026-10-26 design review, based on merged main `0003485`. This document describes the delivered calendar, gentle streak rules and return-navigation contract. The source event schemas and projection version remain unchanged.

## Experience and placement

Keep the existing **Today · Journal · Settings** navigation. The landing page remains reachable through the **Gratitude** brand link. Neither the landing page nor the full calendar gets a new tab. Keep the existing direct `/journal/` rule: Today before today's first saved entry, Journal afterwards; explicit tab choices still take priority over automatic selection.

Use one shared week-box component in two places:

- **Today:** directly below the Gratitude/date header and above **Reflection time**.
- **Journal:** directly below **Your journal** and above **New entry**.

The box shows the present local week, **Sunday through Saturday**, regardless of which historical calendar month was last browsed. At its top display the current streak as **8 days of gratitude in a row** (with singular **1 day**). Below it, show weekday labels and day numbers for all seven dates. Filled dates use their journal-coloured circle, unfilled dates through today are neutral without a ring, and future dates are greyed out and disabled. Mark today separately from saved-day colour. Give the week a visible date/month range, including both months/years when it crosses a boundary.

Activating the box header, its calendar-open control or non-date space opens the shared full calendar at the current local month. A day button instead follows the common date-selection rules below, without also firing the calendar-open action. Provide a labelled keyboard-accessible **Open calendar** control; do not nest date buttons inside another button. The same click behaviour and component are used on both pages.

The originally teased **A moment to notice** box on `/` becomes a private calendar for signed-in users, showing one non-scrolling month with **< · Current month · >** controls in the top-right corner. Clicking its month heading opens separate editable Month and Year dropdowns. These replace the heading inline, using nine-character month and four-character year fields with padding. Navigation uses compact square chevrons beside Current month. It has no separate calendar title, streak heading or always-visible jump controls. Fresh visits default to the current local month; entry Back/history restores the captured month. The frame and control accents use yellow; saved-date rings keep their journal-entry colours. The existing Gratitude link is its entry point; do not add another navigation item. Keep the welcome copy and reachable **Open your journal** action. Signed-out visitors see an empty greyed-out calendar with every date/month control disabled and a small overlaid sign-in notice. Its Sign in link and the signed-out-only **Sign in and open your journal →** footer open authentication and then Journal. The signed-in footer remains **Open your journal →**. The preview never contains another account's calendar or a fictional personal history. A persistent application shell in the shared layout owns the single authenticated session and repository across both routes. During restoration, show loading rather than empty history.

The dedicated calendar is a secondary view opened from a week box, with a compact **Today** or **Journal** back control according to its origin. It does not select or create a Calendar tab. Explicit navigation-tab selection leaves that flow. Writing still hides the navigation bar. Retain the dark ink background, glass surfaces, yellow accent and existing entry colours.

### Mobile composition sketches

```text
TODAY                              JOURNAL
Gratitude ✧       Monday 26 October Your journal
┌────────────────────────────────┐ ┌────────────────────────────────┐
│ 8 days of gratitude in a row  ▦ │ │ 8 days of gratitude in a row  ▦ │
│ This week · 25–31 October       │ │ This week · 25–31 October       │
│ Sun  Mon  Tue  Wed  Thu  Fri Sat│ │ Sun  Mon  Tue  Wed  Thu  Fri Sat│
│ (25) (26)  27   28   29   30 31│ │ (25) (26)  27   28   29   30 31│
└────────────────────────────────┘ └────────────────────────────────┘
          Reflection time          New entry
        [existing prompt]          [search and existing cards]

             SCROLLING CALENDAR
             ‹ Today
             [This month] [Jump to month/year]
             October 2026
             Sun Mon Tue Wed Thu Fri Sat
                              1   2   3
               4   5   6   7   8   9  10
              ...
             November 2026
             Sun Mon Tue Wed Thu Fri Sat
               1   2   3   4   5   6   7
              ...

             Today  Journal  Settings
```

These are layout sketches with fictional counts, not fixtures or screenshots. Parentheses stand in for the real entry-coloured rings. Future 27–31 October in the week sketch are grey in the actual design, not marked as empty missed days. The calendar is a continuous vertical month list, not a one-month pager. Empty days are available moments, never red failures, broken chains or overdue warnings.

## What counts as a day

A date counts once when at least one saved projected entry belongs to it. Use `entryTimestamp(entry)` (`entryAt`, falling back to `recordedAt` for legacy entries), then the same local-day convention already used by Today. Do not count the server ingestion day instead of the reflection's chosen date.

- Backfilled and imported entries count exactly like other entries. An imported null prompt shown as `[No prompt]` still counts.
- A saved photo-only reflection counts. AI availability, a summary, word count and prompt type do not affect eligibility.
- Several entries on one date contribute one day. They remain separate, independently editable entries.
- A draft, pending save, pending import confirmation, prompt request or attached photo without a saved reflection does not fill a day.
- Only confirmed projection updates change saved-day credit. Offline editing remains a draft/pending save until acknowledgement; label its pending state separately.
- Saving a date edit moves that entry's contribution. The old day empties only if no other saved entry remains; the new day fills. Unsaved date edits never change counts or circles.
- Reimporting identical records adds no days. Future dates never earn credit; apply existing save validation and exclude future local days from summaries.

The inputs to the calendar selectors are the current confirmed entries, the current clock and the viewer's timezone. The implementation retains today's device-local timezone semantics. Devices in different timezones can group boundary-hour entries differently, and travel can change counts. Midnight must update the view even without a new event. A fixed account timezone would be a separate, explicit product decision; do not silently add one or reinterpret stored instants as source-offset dates.

## Repairable streak rules

A stretch is a maximal run of consecutive occupied calendar dates. The numbers describe the current saved journal, including later backfills; they are not an audit of which days the app was opened or when writing actually happened.

| Summary | Definition |
| --- | --- |
| Current stretch | If today is occupied, the run ending today. Otherwise, if yesterday is occupied, the run ending yesterday; an unfinished today does not break it. Otherwise zero internally. |
| Most recent stretch | The run ending on the latest occupied date, even if it is older than yesterday. |
| Longest stretch | The largest run anywhere in the saved calendar, recalculated after backfills and date edits. |
| Days reflected on | Number of distinct occupied local dates, not number of entries or events. |

At the top of each week box, display the current stretch using the requested **N days of gratitude in a row** format. For zero, keep the same neutral styling and offer supportive copy such as **A moment can be added for any day**; do not present it as a failure. Never substitute total days or a past stretch into a label claiming consecutive current days. With no entries, supporting copy can say **Your first moment can be today—or another day you remember.** Longest/latest stretches and total days may be secondary details in the calendar, without crowding the compact week box. Keep the calendar useful in every state and use no countdown. No irreversible reset events, loss notifications, repair fees, deadlines, streak freezes, rewards or automatic reminders are introduced.

Example: on 8 October, entries dated 1–3 and 5–8 October give a current stretch of four days. Saving a reflection dated 4 October joins them into eight days immediately after acknowledgement. Saving a second entry on the 4th changes neither count nor stretch. On the morning of the 9th, the eight-day stretch is still current while that day is open. If the 9th is later missed, a later backfill can join the stretches again. No permanent record declares the earlier stretch lost.

Adding a backfill may bridge two runs, extend one, or create a separate run; not every backfill increases the current stretch. A date edit may shorten a run. Show the resulting history accurately with neutral copy rather than guaranteeing that every repair increases a counter. Keep all past runs visible through the calendar.

## Calendar behaviour

All calendars use **Sunday-first** weekday headings with full accessible names, matching the current-week boxes. Each month has a clear month/year heading and its own date grid; adjacent-month positions are blank so dates are not duplicated as actionable cells in neighbouring months. Use actual month boundaries, leap years and local DST rules.

The full calendar is an **infinitely scrolling vertical list of months**. Start with the current month anchored in view when opened from a week box. Scrolling up reveals earlier months; scrolling down reveals later months, including greyed-out future dates. Continue through empty months and beyond the earliest saved entry within the supported civil-date range. There is no artificial history cutoff, finite stack of preloaded years or horizontal month-pager requirement. Date selection in future months remains disabled. **This month** returns to now, and an accessible month/year chooser allows direct jumps across a multi-year imported journal without replacing continuous scrolling.

The dedicated calendar view uses a bounded scroll viewport in its available content area. The landing-page calendar instead shows a single month navigated by its three buttons and clickable month heading. Keep the landing-page journal action and surrounding navigation reachable. Virtualize/window the month list so indefinite browsing does not create an indefinitely large DOM or document. Render seven months at a time, recenter the window as scrolling advances, and compensate the scroll offset to preserve the visible month/day. Month controls and headings must remain accessible; do not recycle away the focused date without preserving a usable focus target. There is no keyboard focus trap. Scrolling requires no new journal fetch, event replay or image download.

Maintain a stable scroll anchor while months load into the rendered window or background synchronization updates circles. Save an anchor month/day plus local offset, rather than relying only on a document pixel coordinate that becomes invalid after virtualization. Restore the same logical month/position after entry viewing, editing and browser Back, even if that month was recycled out of the DOM. Future months are viewable but never writable.

### Date circles and multiple entries

**Implemented colour rule:** every saved date uses the 28-day palette position for that local civil date, with Sunday 25 October 2026 anchored on yellow. A four-week separation gives the same shade. Use the same pure selector as journal cards, Today, editor previews and JSON exports; legacy entry creation indices do not choose visible colours. Backfills and imports use their original logical dates, and date edits move an entry to the new date's shade.

For multiple entries, add a small count indicator and an accessible label such as **26 October 2026, 2 reflections**. All entries on a date share the ring's colour, so no primary-entry or segmented-colour choice is needed. The date-filtered journal still shows every independent entry. Moving one entry does not recolour other dates, and an empty date has no saved ring.

Colour is not the only signal: occupied dates have a visible ring and a saved-reflection label; empty dates have an explicit accessible label. Keep the day numeral readable. Give Today, keyboard focus and the selected date distinct shapes/styles. Aim for at least 44px date targets; the landing navigation controls use the user-requested compact 32px height and square arrow buttons. Preserve the week-box date targets, reducing outer padding on narrow screens rather than forcing horizontal overflow. Check both 320px and the existing 390px mobile viewport, as well as desktop.

### Choosing a date

| Date state | Result |
| --- | --- |
| One entry | Open that entry's full view directly. |
| Multiple entries | Open the journal filtered to that date, labelled with its full local date. Reuse the normal journal cards, prompts, times, colours and photo indicators in chronological order. View entry opens a chosen full entry. Offer a date-aware New entry/Add another reflection. |
| Empty past day or today | Open the same date-filtered journal with an empty state and an explicit Write a reflection for this date action. Only that action opens the independent dated composer; browsing an empty day never creates or overwrites a draft. |
| Future day | No writing action; expose an understandable disabled state. |
| Initial history still loading | Show loading; do not infer missing days from an incomplete initial replay. |

Use this dispatcher for **every date button**: both week boxes, the landing-page calendar and the dedicated scrolling calendar. Single-entry dates go directly to the entry; multiple-entry and empty dates go to the date-filtered journal. A date filter is separate from ordinary journal search; returning to a pre-existing journal restores its prior search, expansion and scroll state.

For a new historical reflection, use local noon on the chosen date as the initial editable time, avoiding routine midnight/DST boundary problems. For today use now, so the default is not accidentally in the future. Validate the civil date/time round-trip through the existing editor; never silently move a selected day because a timezone skipped it. Explain the default time so it is not mistaken for recovered historical precision. Calendar selection never edits an existing reflection or starts an AI call automatically.

## Returning to the same calendar position

Replace entry detail's assumption that its origin is always Journal with a typed navigation origin:

```text
Journal origin: query, expanded cards, scroll and initiating entry button
Week-box origin: Today/Journal, current-week date button, parent scroll/focus
Calendar origin: landing/dedicated view, anchor month/day, viewport offset, parent origin
Date-journal origin: selected local date, card/search state, parent week/calendar origin
Entry origin: parent origin plus entry ID (for nested edit/back)
```

Keep this context outside the event stream and separate from reflection drafts, Today state and saved-entry dates. A validated `month=YYYY-MM` or account-scoped session context can restore the initial calendar anchor after reload; preserve the exact anchor/offset in local navigation state for an existing flow. Do not put reflection text or photos in URLs or retain navigation context across accounts. Invalid/stale context falls back to the current month or ordinary Journal without crashing.

- Opening the full calendar from Today/Journal and going Back restores that page's week box and its focus/scroll. The week box still shows the present week, not the past week browsed in the calendar.
- A single-entry date opened from a full calendar has a compact **Calendar** back control (or **Home** for the embedded landing-page calendar), returning to its captured month/day/offset. If opened directly from a week box, its back destination is **Today** or **Journal**, restoring that box's selected date button.
- A multiple-entry or empty date opens a date-filtered journal. Its back control restores the invoking calendar position or week box. An entry opened within it returns to that dated journal, then back to its parent. Do not drop the date filter or silently return to the unfiltered journal.
- **Edit reflection** returns to its entry on editor Back. Saving uses the existing confirmation; **Done** returns to the captured date-journal when there is one, or the invoking calendar/week-box surface for a direct-entry flow. Existing non-calendar Today/Journal Done behaviour is retained. Keep the parent chain so the user can still get back to the same calendar month.
- Starting a repair from an empty date requires the dated journal's explicit write action. Editor Back restores that dated journal and preserves the draft. After save, Done restores the dated journal with the new entry; Back restores the calendar at the same month with its new circle and recalculated streak.
- Moving an entry to another month does not replace its navigation origin. The original dated journal may now show an empty state or fewer entries; the original calendar anchor is restored, and its circles/counts update. The new date is discoverable through normal calendar navigation.
- Browser Back/Forward and reload follow the same parent chain where valid context exists. A direct entry open without a parent uses the ordinary Journal fallback. Explicit navigation-tab selection exits the flow rather than being redirected back later.
- A background sync updates data but never jumps the calendar, opens an entry or steals focus. Resolve the entry count against the latest confirmed projection at activation. If a referenced entry disappears from a date, keep the return path and show a recoverable state.

## Event sourcing, caching and privacy

No new event type is needed for streaks or calendar browsing. Existing ReflectionWritten (including explicit dates), ReflectionImported and photo-backed saved entries provide the source of truth. Never append StreakUpdated, DayCompleted, StreakBroken or computed calendar snapshots. Calendar navigation, selected month and return context are local UI state. No AI request, scheduler, Cloud Function, Firebase schema/Rules change or new secret is required by this design.

Keep projection version 6 and its existing IndexedDB checkpoint/tail replay. Pure presentation selectors in `src/lib/calendar.ts` operate over the loaded projection:

- `indexCalendarDays(entries, zone)` groups IDs by occupied civil day, retaining creation order for the primary ring and chronological order for a day list.
- `summarizeStretches(dayIndex, today)` derives the four summaries from occupied date keys.
- `weekCells(dayIndex, today)` creates the seven Sunday–Saturday cells for the present local week.
- `monthCells(dayIndex, month, today)` creates a month grid for the virtualized list.
- A shared date-selection resolver chooses a direct entry or date-filtered journal consistently across all calendar surfaces.

These selectors are implemented exports. Reuse or extend `entryTimestamp`, `localDay`, `todayReflection` and `chronologicalEntries` consistently rather than introducing competing date/colour rules. Sort occupied days for run detection; do not scan every day since the first entry. Recompute or memoize the day index by confirmed projection cursor and timezone; recompute summaries/week cells at civil-day or timezone changes, and month cells when their rendered month or underlying day index changes. Refresh on local midnight, focus and visibility restoration; roll from Saturday to a new Sunday-first week without needing a saved event. Count civil-date adjacency using calendar arithmetic, not `24 * 60 * 60 * 1000` differences between local-midnight instants. DST can produce 23- or 25-hour days.

Keep clock/zone-dependent presentation out of the canonical reducer and durable checkpoint. Discarding an optional presentation memo must recreate the same result from the same projection, clock and zone. Browsing a month reads neither Firestore nor Storage and does not replay the full stream. Photos load only where the existing entry/day presentation needs them; the month grid needs no image downloads.

Share a single account-scoped auth/repository lifecycle between the landing page and Journal, so navigating routes does not create duplicate listeners or reset drafts/outboxes. Both routes must wait for restoration and enforce the same owner isolation. Scope session navigation/memo data to Firebase project, base path, UID and stream generation, and clear in-memory view state on sign-out or account switch. Never flash the previous account's rings, counts or private text. Keep preview and production namespaces separate.

A reopened warm cache can supply known saved dates while offline, labelled **Saved on this device**. Missing cells/counts may be incomplete until sync; do not present them as verified omissions or a final zero. Distinguish initial loading, cached/offline, syncing and confirmed states. A brand-new offline session retains the app's existing cold-start limitations; this feature does not claim offline authentication or cross-device drafts. Reconnection updates the calendar from confirmed events and never generates AI or automatically submits a repair.

## Implementation slices

Each slice is a working feature with its own focused commit(s) and relevant tests. The latest user feedback settles week placement, Sunday-first ordering, the streak wording, common date selection, three-tab navigation and infinite scrolling. The policy defaults used by the implementation are recorded below.

1. **Pure calendar and stretch model.** Implement selectors and unit fixtures, including a sparse imported history, logical entry dates versus receipt time, current-day grace, run bridging and moving dates. Prove full replay and cached-tail replay feed equivalent calendar results for a fixed clock/zone. No UI or backend migration.
2. **Shared current-week boxes.** Add a shared WeekBox between the Today header and Reflection time, and between Your journal and New entry. Include the requested streak heading, Sunday-first dates, coloured saved circles, neutral unfilled days, disabled grey future dates and a separate calendar-open action. Preserve the three tabs and existing Gratitude link. Add placement, date-state, rollover and action-by-action E2E checks.
3. **Scrolling calendar and shared date navigation.** Share authenticated session ownership with the welcome route, add a single-month landing calendar and the virtualized vertical month calendar as a secondary view opened from week boxes, and implement the common direct-entry/date-filtered-journal resolver. Include typed parent context, restored month/day/offset/focus, browser history and month/year jump. Test long scrolls in both directions, window recycling and exact returns. Reuse existing card/detail formatting and protect ordinary journal search/scroll.
4. **Calendar repair and editing.** Start dated independent drafts through an empty dated journal’s explicit write action, protect an existing unsaved independent draft with Resume/discard choice, and retain the selected date if the user must return to it. Scope draft metadata/return context independently; never overwrite a Today or saved-entry draft. Connect save/confirmation/Done, date changes and cross-device updates to calendar derivation. Add action-by-action backfill and repair scenarios.
5. **Acceptance and rollout.** Review all new/affected screenshots, generated walkthroughs, live preview and the policy examples below. Run applicable Svelte/unit/emulator/deployment/E2E checks in pinned Nix. Confirm there are no new computed events, duplicate listeners or automatic AI requests. Update status documentation only after delivery.

If a resumed draft belongs to a different day than the selected empty date, show that fact and offer **Resume existing draft**, **Keep draft and return to this date**, or explicit discard before creating the selected-day draft. Do not silently retarget its date. Draft key strategy is an implementation detail to settle with this interaction; preserving existing writing is mandatory.

## Verification contract

Follow E2E_GUIDE.md: every click, swipe, date selection, typing action, back navigation and reload has a screenshot comparison; generated checks appear underneath the full-page image. No masking, cropping or hidden content. Keep `maxDiffPixels: 0` and `threshold: 0`. Freeze clocks/timezones and use fictional source events; make sync and image readiness observable rather than adding sleeps. Scenarios 017–022 provide the new walkthroughs; affected existing baselines are regenerated for the visible week boxes.

| Layer | Required cases |
| --- | --- |
| Unit/replay | Empty history; one day; duplicate/same-day entries; photo-only; legacy timestamps; imported backfills and null prompts; gaps at either end and in the middle; joining two runs; today unfilled; missed yesterday; longest/latest/current distinction; moving the only entry versus one of several; stable date-based colour; month/year/leap-day boundaries; 23/25-hour DST days; different viewer timezones; future exclusion; projection-cache equivalence. |
| Calendar/week E2E | Exact week-box placements on Today/Journal; Sunday-first dates crossing month/year boundaries; requested streak heading; saved/unfilled/future states; box-open versus day-click dispatch; welcome/sign-in/private calendar; vertical scrolling both ways, window recycling and stable anchors; direct year/month jump; 320/390px and desktop layout; no future creation; empty and loaded states; coloured circles, multi-entry indicator and all entries accessible; keyboard-only navigation and non-colour labels. |
| Return navigation E2E | Choose a past month/day, open entry, Back to the identical month/cell; multiple-entry date-filtered journal; empty dated journal; direct week-cell origin; nested edit and cancel; save/Done; entry moved to another month; browser Back/Forward; reload; journal-origin back/query/scroll unchanged. |
| Repair E2E | Select a gap, open the empty dated journal, explicitly start writing, choose date/time and save, see the ring and joined count; second entry gives no extra day; pending/offline save gives no confirmed credit; reload/draft recovery; draft conflict choice; photo-only repair; imported history; cross-device save/date-edit updates without month jumps. |
| Privacy/regression | Sign-out/account switch clears history; preview/prod session namespaces; no cross-user state; no inference from browsing/replay; optional AI only through existing explicit controls; unchanged Markdown format and historical entry dates; no new Rules needed. |

Scenarios 017–022 cover calendar navigation, the private landing calendar, repairs/date edits, narrow-screen access and cached backend recovery. Add a narrow 320px layout case rather than silently changing existing mobile baselines. Check calendar accessibility with keyboard/focus assertions and an accessible day label, not just image inspection.

## Review decisions

Confirmed by the latest user feedback: the two exact week-box placements, Sunday–Saturday ordering, **N days of gratitude in a row** heading, grey future days, box-to-calendar opening, consistent entry/date-filtered-journal date selection across all calendar surfaces, infinite vertical scrolling and no additional navigation tabs. The landing page remains accessible through the existing Gratitude link. These replace the earlier Home-tab and month-pager proposals.

Implementation defaults are device-local day boundaries, the 28-day date-based ring plus a count for multiple entries, and editable noon for historical writing. These follow the existing Today selection and local-date contracts and remain revisable through explicit product changes.

## Delivered structure

`GratitudeApp.svelte` persists in the shared layout and owns auth, repository, drafts and navigation. `WeekBox`, `CalendarDay`, `LandingCalendar` and `GratitudeCalendar` share the pure day index. The scrolling calendar renders seven fixed-height months and compensates scroll offsets when recycling them; it does not create full-history DOM or huge spacer elements. `calendar-navigation.ts` validates typed parent frames. SvelteKit history state and account/project/base-path-scoped session storage retain the return context; URLs carry only a calendar-flow marker. Sign-out/account changes clear active context.

Warm checkpoint validation distinguishes a temporarily unavailable server from a corrupt or stale prefix. Digest-checked saved entries remain provisional during the outage; a server tail revalidates the checkpoint anchor before reporting synchronization. Authentication and app HTML must still be available. No offline cold-start support or automatic submission of repairs is added.
