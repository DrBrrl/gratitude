# Personalised backup prompts

The application retains a private reserve of questions in each user's source stream and caches its projection on each signed-in device. The refill target is 30 unused questions. Imported questions may exceed that target; none are trimmed to make room.

A backup can be selected instantly on Today or in the reflection editor, without invoking a model. “Show another” cycles through the reserve and retains skipped questions. “I won’t use this prompt” offers an explicit removal confirmation. The selected question stays with the local reflection draft. A question becomes used when a reflection is saved with it. Editing that reflection afterward does not make the question unused again. Questions referenced by saved reflections remain resolvable after removal or use.

## Sources and replay

- `BackupPromptImported` records a literal user-supplied question. Its stable content identity makes identical imports idempotent. The bounded single-column XLSX importer previews its count and destination account, accepts an optional header, and rejects formulas, macros and external links.
- `BackupPromptRemoved` records the user's decision to remove a question. Offline removals are stored in the account-scoped outbox before the UI acknowledges them and append on reconnect.
- `AIChoicesConfirmed` version 3 adds `backupEnabled` and `backupProvider` independently of the interactive provider. Older choice events never enable automatic inference.
- `PromptRequested` versions 7/8 record a backup request to Gemini/LM Studio respectively. They use the existing exact system instruction, mixed twenty-reflection selector, entry dates, explicit feedback and saved sharing permissions. `purpose: backup` is the source request intent, not a computed result.
- The existing `PromptResponseReceived` records the exact external answer and model. Replay adds it to the reserve instead of changing Today. Failed requests create no usable question. Replay never repeats a request.

Projection version 9 derives questions, usage, removals and availability. Counts, statuses and generated availability lists are never placed in source events. Equivalent whitespace/case variants are excluded from the usable count, including variants of previously used or removed questions. Request/source timestamps, revision references and selection seeds retain their existing reproducibility guarantees.

## Refill

Automatic refill requires enabled AI prompts and a saved backup preference. The chooser starts with LM Studio selected; it does not silently authorize cloud processing. Source sharing is still governed by the existing journal/feedback switches. A generic-only Gemini deployment continues to exclude personal context.

The open, visible, synchronized client generates one question at a time until there are at least 30 available. A transaction claims the shared AI control before inference, and Rules prevent another backup request from taking over an unfinished claim for three minutes. Ordinary foreground requests and consent changes can supersede a backup; stale results cannot replace them. Local generation uses the configured device connection, tab-private authentication and thinking-off behavior. There is no fallback to another model provider.

Gemini requests are spaced by at least fifteen seconds within the active client, including recent foreground Gemini requests. Cross-device claims serialize inference; the managed gateway remains the quota authority. Failed attempts back off (one minute, five minutes, then pause); three repeated duplicate answers pause refilling too. Settings exposes the status and a retry control. Closing the application stops the scheduler. No Cloud Functions or closed-app background service is involved.

## Offline use and rollout

A service worker caches only public build-listed app assets and prerendered pages, with a distinct cache namespace for each deployment scope. A previous successful online visit, locally persisted Firebase authentication and a valid account checkpoint are required for an offline reload. No API responses, private photos, tokens or journal data are placed in the public asset cache. The local checkpoint is available immediately and its anchor is verified before accepting a server tail. Clearing browser storage or signing out removes access until online sign-in; unsynchronized saves retain the existing outbox behavior.

The supplied personal workbook is excluded from the repository. Its raw questions are staged in owner-readable, administrator-write-only `users/{uid}/backupPromptImports/{contentId}` documents in the two authorized Firebase projects. The upgraded client verifies each identity and promotes those literal inputs to its canonical source stream. Retaining stable staged input makes retries safe. This bridge lets production keep running its older source reader before merge; loading the upgraded application performs the import. An ordinary user's in-app workbook import appends directly to their source stream after confirmation.

## Verification

Unit tests cover replay, 102 imports, consumption, removal, duplicate variants, legacy opt-in behavior, malformed sources, provider separation, pacing, failure limits and stale claims. The Firebase integration suite checks source privacy, exact retries, concurrent-device claims, the independent local provider, consumption, removal and staged-input permissions. Walkthroughs 027/028 use fictional questions, workbook contents, provider outputs and credentials. Each action is followed by a full-page screenshot comparison with no masking and zero pixel tolerance; generated checks appear below the screenshot.
