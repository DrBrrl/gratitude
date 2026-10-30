# Friends and hugs — first design sketch

This is a proposal for review. Friends, shared daily status, display names, invitations and hugs are not implemented.

## Names and finding friends

The user has chosen searchable usernames as a way to find friends. Gratitude already uses a Firebase Authentication UID for each account and for access to its private journal. Friend relationships should use that identity too; changing a username or visible name must not change relationships or journal ownership.

Distinguish three things:

- **Username:** a unique searchable handle such as `@jamie`, with case-insensitive matching. Availability and claiming must be checked atomically so two accounts cannot claim the same handle. Character/length rules, rename frequency and old-name reuse still need specification.
- **Display name:** an editable label such as “Jamie”, shown alongside the handle so people can check whom they are adding. Display names need not be unique.
- **Account identity:** the existing UID, used internally for relationships and access checks. A username is never a login credential or permission check.

Proposed starting experience:

1. When enabling Friends, choose a display name and an available username. Show exactly what will be discoverable before confirming. Do not automatically expose the Google account’s full name, email address or photo.
2. Open Add a friend and search for a username. Start with case-insensitive exact-handle lookup, accepting input with or without `@`; partial-name suggestions are an open UX choice.
3. Show the matching username and chosen display name, then send a friend request. Finding an account or sending a request grants no access to its journal or daily status.
4. The recipient checks the sender’s name and handle and accepts or declines. Only accepted friends can exchange hugs, subject to their preferences. Sharing daily status requires separate consent.

A searchable profile exposes only the chosen handle and display name to signed-in people looking it up. Do not offer a browsable public directory or email search. Exact username lookups can still be guessed: discoverable handles and names are not secrets. The lookup surface needs abuse limits and a clear explanation of discoverability.

Private invitation links and copyable invitation codes remain a possible additional convenience, not a requirement for finding someone. If included, invitations expire, can be revoked, and require explicit confirmation before connecting or sharing status.

Firebase documents UID, display name and email as separate user properties: [Manage users](https://firebase.google.com/docs/auth/web/manage-users). The friend-facing profile and username index must remain separate from private journal records. Username/profile selections are user actions; normalized lookup keys and availability/ownership indexes are projections or coordination records, not computed values inserted into source events. Removing or renaming a handle must never transfer an existing friendship to the account that later claims it.

## A small Friends space

Propose a Friends entry in the existing Settings menu initially, without changing the bottom navigation. It contains the chosen name/username, Add a friend, incoming/outgoing requests, accepted friends and a hug inbox. The exact placement and visual design remain open for review.

Each friend card shows their chosen name, an optional daily status and a Send a hug action. A simple acknowledgement confirms a hug was sent; delivery does not imply the recipient has seen it.

Sharing today’s reflection status is a separate opt-in choice, not an automatic consequence of accepting friendship. A person can receive hugs without sharing whether they have written. Share only whether a saved reflection exists for the displayed local date, never its prompt, text, photos, AI summaries, entry count or writing time.

Use the sharing person’s chosen timezone and display the date so that friends in different timezones can understand “today”. Entry dates, including imports, backfills and date edits, determine the status. The exact timezone-setting behaviour still needs design. Stale or unavailable information is labelled accordingly, rather than interpreted as a missed reflection.

Keep hugs available even if someone has already reflected. This is a personal gesture, not an automatic reminder campaign. Recipients control whether hugs are allowed and whether they produce notifications. Include mute, remove-friend and block controls, with sensible sending limits.

## Events, privacy and notifications

Keep the existing private journal stream private. Add friendship, invitation, naming, sharing-choice and hug user actions separately, with cached, rebuildable projections. Source events contain the actions and user-supplied choices; friendship state, daily completion flags, counts and notification delivery state belong in projections or operational records.

Shared reads must be restricted to accepted friends with the relevant current consent. Friend access must never require permission to read the private journal stream. Disabling sharing or ending a friendship stops subsequent shared reads and deliveries; information already viewed cannot be recalled. The shared status projection and its permission checks need a detailed design before implementation.

Record hugs durably for the in-app inbox. Optional device push needs a trusted sender outside the public SPA, private device registrations and duplicate-safe processing. Replaying events must not send old hugs again. The service choice, notification preferences, revocation behaviour and real-device delivery tests remain implementation-design work; no infrastructure has been provisioned.

## Suggested first implementation slice

Start with choosing a friend-facing name and unique username, finding an account by its handle, sending/accepting/declining a friend request, and sending/receiving a hug in the app. Add the consent-controlled daily status and optional device notifications as separately reviewable slices. Each working feature needs permission tests and mobile/desktop action-by-action E2E screenshots under the existing zero-pixel, no-masking contract.

This ordering is a proposal, not a commitment to omit status or notifications from the completed feature. The user’s intended feature includes both gentle daily-status sharing and hugs that can notify their recipient.
