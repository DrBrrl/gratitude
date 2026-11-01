# Friends, hugs and community gratitude

Friends lives in the heart tab between Journal and Settings. Account controls remain in Settings. Implemented here: chosen profiles, partial username discovery, consent-based requests, one hug per local day, optional individual streak sharing and repairable community streaks. Browser notifications remain a separate delivery decision; the app currently does not request permission or deliver background push.

## Names and discovery

A Firebase UID owns relationships. An editable display name and case-insensitive unique username are separate from Google identity. Handles use 3–24 ASCII letters, digits or underscores, starting with a letter. Renaming releases the old handle atomically without transferring existing friendships. All displayed handles, including `@`, are italicised.

Search accepts at least three characters from any part of a handle: `jam` finds both `jamie_spanou` and `testing_jamie`. Results use ten-row pages ordered by username, with a **More matches** action. There is no directory or email search in the UI. Discoverable names and handles are public to signed-in Google users; paging and minimum input length are usability/read-cost bounds, not an anti-enumeration guarantee. Additional abuse limits and rename-frequency policy remain open.

Each discoverable profile has a disposable search projection containing unique substrings of at least three characters (at most 253). Its writes must match the canonical profile. Once present, profile changes must update or delete that index atomically, keeping hidden/renamed profiles out of queries. Rules cannot prove a query against a cross-document join, so indexed reads rely on this write invariant instead of checking another profile for every returned row.

Existing profiles bootstrap their search index when their owner next opens the app; exact-handle lookup remains a fallback before that happens. Old open tabs may need refreshing before editing an indexed profile. The index can be rebuilt from current profiles; substrings never appear in source events. The composite `terms CONTAINS, username ASCENDING` Firestore index is required before publishing the frontend.

## Friend cards and hugs

Only accepted, unblocked friends can exchange hugs. The card has a four-point gratitude star and the chosen name/italic handle; an outlined yellow heart sits on its right. Sending fills it for that date and confirms **Hug sent!** A user can pause incoming hugs, remove a connection or block someone, including directly from search. Unblocking does not restore friendship. Requests still have a 24-hour repeat delay.

New `HugSent` actions use schema 2 and capture the sender’s observed UTC offset in minutes. This is clock context for the action, not a precomputed date or streak. Server timestamps and bounded quarter-hour offsets (−12 to +14 hours) enforce a strictly advancing local-date bucket. A hug at 23:59 can be followed by one at 00:00; another on the same date is rejected. The previous action’s captured offset handles daylight-saving changes. Moving back to an earlier local date does not renew the allowance. The recipient’s preference and current relationship are checked on every write.

Existing schema-1 hug history replays with its original 24-hour rule. Its final legacy cooldown is retained until the first schema-2 hug; modern senders cannot downgrade to schema 1 to bypass daily checks. Pair-head timestamps preserve canonical sub-millisecond precision during unrelated actions.

Hug source history and existing private read acknowledgements remain intact, but the former inbox UI is replaced with **Community gratitude**. Sending confirms persistence, not that the recipient has seen the gesture. Full replay never sends an old hug again.

## Sharing dates and streaks

The profile form defaults **Share my gratitude streaks with friends** on and explains that friends see gratitude dates and streaks, while prompts, reflections and photos remain private. Saving explicitly records `GratitudeSharingChosen` with the checkbox and selected IANA timezone. Existing users must review and save this new choice; the app does not silently publish their history. Sharing can be off while discovery and hugs remain on.

A lightweight owner publisher runs after sign-in, independently of opening Friends. Only a confirmed, synchronized private journal projection can publish. Its shared projection contains unique civil dates derived from `entryAt` (falling back to `recordedAt`) in the chosen shared-calendar timezone. Imports, backfills and date edits participate identically to ordinary entries; multiple entries on one day count once. Text-only changes do not rewrite the shared dates. A private receipt ties each new publication to the current journal source cursor. Rules check ownership, exact schema, consent, atomic provenance and source-prefix freshness; they do not recompute the owner’s entire journal on a server. Status is an owner-maintained projection, not a tamper-proof attestation.

Shared records expose no journal text, prompts, photos, summaries, entry identifiers/counts, exact writing times or private journal cursor. Accepted friends alone can read dates while sharing is enabled. Disabling sharing atomically deletes both the shared snapshot and private receipt; removing/blocking a friendship denies subsequent reads immediately. Already viewed information cannot be recalled. Raw sharing-choice history and publication provenance stay owner-only.

The friend’s current streak appears beside their name as **(N days of gratitude in a row)**. It is absent when sharing is off/unavailable. Individual streaks use that person’s shared-calendar timezone. Community gratitude intersects both sets of civil dates and uses the earlier of their current local dates; today being unfinished retains yesterday’s run. For an active run: **Jamie and Robin have a 4 day gratitude streak.** Once it ends, show their longest shared run. A missing day repaired by either friend restores the shared run. Empty copy: **Your community streaks will show up here!**

Only live, server-confirmed peer consent/snapshots enter the UI. Peer dates are not saved in the application’s IndexedDB checkpoint; consent changes and friendship revocation remove the in-memory result. Unavailable information is omitted, not treated as a missed day. Sharing never grants access to the private journal stream or credentials.

## Source streams and projections

| Record | Purpose and access |
| --- | --- |
| `friendProfiles/{uid}/events/{id}` | Immutable literal name, handle and discoverability choices; owner-only. |
| `friendProfiles/{uid}` | Current chosen profile and source cursor. |
| `friendUsernames/{key}` | Atomic normalized handle reservation; listing denied. |
| `friendSearch/{uid}` | Disposable discoverable name/handle substring index; Google-authenticated, bounded queries. |
| `friendPairs/{id}/events/{id}` | Immutable request, answer, cancellation, removal, blocking, hug-preference and hug actions; participants only. |
| `friendPairs/{id}` | Validated relationship state, daily hug clock context and source cursor. |
| `friendLinks/{uid}/peers/{otherUid}` | Reciprocal pointers preventing duplicate/concurrent pair streams. |
| `friendInboxes/{uid}/events/{id}` | Preserved owner-only legacy read acknowledgements; never sender read receipts. |
| `friendSharing/{uid}/events/{id}` | Immutable literal sharing/timezone choices; owner-only. |
| `friendSharing/{uid}` | Current consent projection; owner/current accepted friends. |
| `friendGratitude/{uid}` | Disposable date-only publication; owner/current accepted friends with consent. |
| `users/{uid}/privateProjections/gratitudeDays` | Owner-only publication receipt and private journal source cursor. |

Profile and pair actions commit atomically with their projections; Rules reject detached/fabricated state, stale predecessors, unauthorized actors and source mutation. An owner/deployment-scoped version-3 IndexedDB checkpoint has a digest and caches own sharing, profile, pair and legacy read projections. Warm opens fetch source tails; **Rebuild friends view** replays accessible source streams. The date publication is regenerated from full private journal replay and sharing choices, with no stored streak events. Online connectivity is required for social writes; there is no social outbox.

## Notifications and remaining decisions

The prior implementation only stored in-app hugs, which explains why Firefox on Android did not show device alerts. Browser notifications need permission requested from a user gesture. Android delivery should use a service worker’s notification API. Showing an alert while Gratitude is open can use its live connection; delivery after it closes needs a trusted push sender and revocable private device registrations. A service worker alone does not create that sender.

Before background delivery is enabled, choose/provision its backend, define per-device opt-in, duplicate suppression and current friendship/preference checks, and test Firefox on a real Android device. Rebuilds and first synchronization must never notify old hugs. No push infrastructure or billed backend is added by this change. See [MDN’s notification guidance](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API) and [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API). Private invitation links remain a possible later convenience.

## Verification

Pure tests cover substring bounds, logical-date selection, repaired intersections, sharing replay, midnight/DST handling and legacy-version restrictions. Firebase emulator tests cover bounded paged search, atomic rename/hiding, explicit sharing and private provenance, revocation, stale writes, per-day hug enforcement and rejected forged/downgraded actions. Browser walkthroughs 036–039 and 043 cover both viewports, screenshot every user action with zero tolerance and generate checks under each image.
