# Friends and hugs — first design sketch

This is a proposal for review. Friends, shared daily status, display names, invitations and hugs are not implemented.

## Names and finding friends

Unique usernames are optional. Gratitude already uses a Firebase Authentication UID for each account and for access to its private journal. Friend relationships should use that identity too; changing a visible name must not change relationships or ownership.

Proposed starting experience:

- When enabling Friends, choose an editable display name such as “Jamie”. Names need not be unique. Show what will be shared before confirming; do not automatically expose the Google account’s full name, email address or photo.
- Add someone using a private invitation link, with a copyable invitation code as an alternative. The code represents an invitation, not a permanent public account identifier.
- Invitations expire and can be revoked. Opening a link does not grant access or create a friendship by itself. Both people explicitly confirm the connection, with an opportunity for the inviter to check who is joining before any daily status is shared.
- Existing friends see the chosen name. There is no public user directory or email search in this proposal.

A unique searchable handle, such as `@jamie`, can be added if that discovery experience is wanted. It would need availability checks, name reservation and a decision about who can find an account. It should remain separate from account identity and authentication.

Firebase documents UID, display name and email as separate user properties: [Manage users](https://firebase.google.com/docs/auth/web/manage-users). This proposal uses the existing UID and a deliberately chosen friend-facing name; it does not make Google profile details public.

## A small Friends space

Propose a Friends entry in the existing Settings menu initially, without changing the bottom navigation. It contains pending invitations, accepted friends and a hug inbox. The exact placement and visual design remain open for review.

Each friend card shows their chosen name, an optional daily status and a Send a hug action. A simple acknowledgement confirms a hug was sent; delivery does not imply the recipient has seen it.

Sharing today’s reflection status is a separate opt-in choice, not an automatic consequence of accepting friendship. A person can receive hugs without sharing whether they have written. Share only whether a saved reflection exists for the displayed local date, never its prompt, text, photos, AI summaries, entry count or writing time.

Use the sharing person’s chosen timezone and display the date so that friends in different timezones can understand “today”. Entry dates, including imports, backfills and date edits, determine the status. The exact timezone-setting behaviour still needs design. Stale or unavailable information is labelled accordingly, rather than interpreted as a missed reflection.

Keep hugs available even if someone has already reflected. This is a personal gesture, not an automatic reminder campaign. Recipients control whether hugs are allowed and whether they produce notifications. Include mute, remove-friend and block controls, with sensible sending limits.

## Events, privacy and notifications

Keep the existing private journal stream private. Add friendship, invitation, naming, sharing-choice and hug user actions separately, with cached, rebuildable projections. Source events contain the actions and user-supplied choices; friendship state, daily completion flags, counts and notification delivery state belong in projections or operational records.

Shared reads must be restricted to accepted friends with the relevant current consent. Friend access must never require permission to read the private journal stream. Disabling sharing or ending a friendship stops subsequent shared reads and deliveries; information already viewed cannot be recalled. The shared status projection and its permission checks need a detailed design before implementation.

Record hugs durably for the in-app inbox. Optional device push needs a trusted sender outside the public SPA, private device registrations and duplicate-safe processing. Replaying events must not send old hugs again. The service choice, notification preferences, revocation behaviour and real-device delivery tests remain implementation-design work; no infrastructure has been provisioned.

## Suggested first implementation slice

Start with choosing a friend-facing name, issuing/revoking an invitation, confirming a friendship, and sending/receiving a hug in the app. Add the consent-controlled daily status and optional device notifications as separately reviewable slices. Each working feature needs permission tests and mobile/desktop action-by-action E2E screenshots under the existing zero-pixel, no-masking contract.

This ordering is a proposal, not a commitment to omit status or notifications from the completed feature. The user’s intended feature includes both gentle daily-status sharing and hugs that can notify their recipient.
