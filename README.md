# Gratitude

Gratitude is a responsive single-page application (SPA) for daily gratitude reflection. Its intended daily experience starts with an AI-generated prompt the user can respond to. Over time, it should learn which prompts suit that person and adapt to their preferences and feedback.

The aim is to make reflection approachable, personal, and useful—whether someone has a few words to share or wants to write at length.

## Status

The repository contains a Svelte 5 / SvelteKit application with a responsive dark landing page, a Nix development shell, Playwright functional and screenshot tests, and GitHub Pages deployment. The Firebase foundation adds Google sign-in, a private event stream, reflection save/edit, cross-device synchronization, and cached projection recovery. The production and preview Firebase projects have Google sign-in and Sydney Firestore databases. The application writes directly through Firestore transactions protected by Security Rules; no Cloud Functions or billing linkage is needed for this foundation (see [setup status](FIREBASE_SETUP.md)). AI prompts, explicit sharing choices and freeform prompt feedback are implemented; private photo attachments and editable AI image summaries are implemented; a cloud-backed, on-device personalised backup-prompt reserve supports offline selection, XLSX import and optional automatic local/cloud refilling; onboarding and erasure remain planned.

## Intended experience

- Open the app on a phone, tablet, or desktop and receive a daily gratitude prompt.
- Write a response, with the freedom to skip a prompt or ask for another.
- Give feedback about what feels helpful, repetitive, or inappropriate.
- Receive prompts that become more relevant over time, with control over personalization.
- Revisit past reflections in a private journal.

The journal offers a bundled starter prompt and optional Gemini or LM Studio prompts. Preview and production builds use paid Gemini, with personalization controlled by each user’s saved sharing choices. See [VISION.md](VISION.md) for the project’s intended end state.

## Development

Use the locked Nix shell for Node 24, Chromium, and repository tooling:

```sh
nix develop
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. To validate a production build:

```sh
npm run check
npm run test:unit
npm run test:deployment
npm run test:e2e
```

See [E2E_GUIDE.md](E2E_GUIDE.md) for scenarios, reports, and testing on Nix or other systems. [DEPLOYMENT.md](DEPLOYMENT.md) explains automatic production deployments and per-PR previews on GitHub Pages. Production is served at [drbrrl.github.io/gratitude](https://drbrrl.github.io/gratitude/) through the Pages workflow.

The proposed MVP uses Firebase with Google sign-in for cross-device event streams and Firebase AI Logic calls whose responses are recorded as events. See [MVP_DESIGN.md](MVP_DESIGN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the design and provisioning status. The journal now includes browsing, search, durable local drafts and Markdown/JSON export; Gemini prompts have durable response events and explicit retry/recovery.

## Local UI review

Run `nix develop -c npm run dev:ui -- --port 5173 --strictPort` and open [the local journal](http://127.0.0.1:5173/journal/). This development-only mode starts signed in as a fictional review user and replays `src/lib/dev/journal-events.json` through the real projection reducer. It needs no Firebase login or emulators and never accesses cloud journal data.

Seven sample reflections demonstrate consecutive date colours, short and long text, search, and an edited entry. Changes and drafts remain in a separate browser-local review store across reloads. Settings → UI review provides **Restore sample journal** and **Show empty journal**. Signing out shows the public landing page with an empty greyed-out calendar; its Sign in link reopens the review session. This mode exposes the currently implemented screens; live Gemini requires the Firebase preview; photo controls and Gemini need the Firebase preview; onboarding still needs implementation.

The current interface follows the mobile mockups with a Today prompt, separate writing and saved-reflection screens, content-sized rainbow journal cards, and a Settings menu. Collapsed cards show up to three rendered reflection lines across paragraphs, with an ellipsis for interrupted sentences and separate expansion controls. Export opens a Markdown/JSON chooser with preparation and download steps. AI settings controls optional prompts, sharing choices and preferences. Paid mode makes journal and feedback sharing available; both remain off until the user opts in. Photo attachments and editable AI summaries are available on configured Firebase sites.

Today uses the device’s local calendar date and its own draft. Editing another journal entry keeps a separate durable draft; its unsaved changes do not change Today’s prompt, colour or continue-writing state. Saving a date change into or out of the local day updates Today’s saved-entry selection. Once today’s reflection is saved, Today continues that same entry and uses that date’s colour. Days with multiple entries use the first-created reflection for Today; other entries remain independently editable.

Use **Journal → New entry** to backfill an earlier local date/time or add another reflection today. After today’s first save, **Today → Write another reflection** opens the same independent composer. Its draft is separate from Today’s draft and saved-entry edits, and **New entry** resumes that draft until it is saved or discarded. Future times cannot be saved. Every reflection editor, including Today’s first response and saved-entry edits, exposes **Entry date and time** in your device’s local timezone. Date changes stay in the draft until you save the reflection; blank/invalid and future times cannot be saved. Edits retain entry identity and the original save timestamp; changing the local entry date changes its colour. Unchanged dates retain their existing meaning. The prompt stays unchanged unless you explicitly replace it in the editor. Journal cards and Markdown exports sort by the entry date/time, with newer-created entries first when times match to the second. Backfills do not complete Today.

Signed-in sessions start on Today until a reflection has been saved for the local day, then start on Journal. A new local day starts on Today again. The saved-reflection confirmation shares the journal card typography and a centered page heading; Done opens Journal after ordinary new reflections and edits; calendar flows restore their dated journal or invoking calendar/week box. The bottom navigation uses a nearly opaque frosted surface so entries behind it stay subdued.

The reviewed interface is covered by mobile and desktop E2E walkthroughs, including paragraph writing, card expansion, search, independent drafts, Settings and export. Each action compares a full-page screenshot with zero pixel tolerance and no masking. Use the normal app and emulator workflows to validate changes before publication; `dev:ui` remains available for quick visual iteration.

Long journals initially render twenty cards and load twenty more as you scroll. Search still covers the complete local projection, including photo summaries, and returning from an entry retains the loaded range. The Sunday-first week strips support horizontal swipes/scroll gestures and left/right arrow keys, keeping future dates disabled. Your calendar shows current, longest and most recent streaks, the total reflection count and distinct gratitude days.

The landing page is anchored from the top, with an extra wordmark-capital's height of breathing room: changing between shorter and taller months extends the calendar downward without recentering the title or month controls. The arrows remain top-aligned when a month name wraps on narrow screens.

Dates with photos show a softened thumbnail inside their entry-coloured circle, behind a clear white number, in the landing month, week strips and scrolling calendar. The most recent dated reflection with photos supplies its first remaining photo. Thumbnails load near the visible area, share a bounded in-memory cache while signed in, and are cleared on sign-out. Missing or offline images keep the date readable and usable; the signed-out calendar never displays private photos.

The favicon and install icons share the yellow four-point star with a small heart rotated −45° on a transparent background. The install manifest keeps each deployment’s scope separate and opens the journal. Regenerate PNG sizes from the vector with `nix develop -c node scripts/render-app-icons.mjs`.

## Firebase development

Use the Node 24 Nix shell for the app and Firebase emulators (Java is included):

```sh
nix develop -c npm ci
nix develop -c npm run test:firebase:all
```

For interactive use, run `nix develop -c npm run emulators` and, in another terminal, `nix develop -c npm run dev:firebase`. Open `/journal/` and create a fictional Google account in the Auth emulator popup. Tests use `demo-gratitude` and never call the live project or Gemini.

Saved user actions are appended in a browser transaction. Security Rules enforce ownership, exact schemas, contiguous ordering, expected revisions and immutable events. The head and per-entry event pointer must be updated atomically with each event. IndexedDB holds a disposable checkpoint and a pending-save outbox; rebuilding the local view replays the cloud stream. Editor drafts persist on this device as you type and recover after reload. Today/Journal/Settings navigation, content-sized rainbow cards, full-entry editing and accent-insensitive search are implemented. Markdown and JSON exports reconstruct all saved entries from a verified cloud event prefix, independent of search filters; they exclude unfinished drafts and require a connection. Markdown dates use the entry’s chosen time (or the original save time for older entries), rendered in the exporting device’s local timezone in `YYYY-MM-DD HH:mm:ss` format. JSON archive version 2 preserves both `entryAt` and the actual server `createdAt`; the event stream remains versioned independently. Offline reloads require a previously cached public app shell, persisted sign-in and an account checkpoint; first-time offline sign-in, cross-device drafts and deletion remain future increments.

## AI prompts

**Already have a Gemini API key?** This integration uses Firebase-managed authorization and needs no supplied Gemini key. See [where keys belong and how to enable paid personalization](FIREBASE_SETUP.md#where-to-put-a-gemini-api-key).

Open **Settings → AI settings**, enable AI prompts and save your choices. On Today, choose **Find me a prompt**. You can request another before writing, use the starter, and leave a short note under **Why this prompt? → Give prompt feedback**. Review saved prompt/feedback pairs under **AI settings → What informs your prompts**. **Edit feedback** saves a replacement immediately; **Delete feedback** removes that pair from the list and future context. The existing sharing switch controls whether the latest 20 pairs are sent to either provider, and the list remains visible with sharing off. Earlier event history and saved prompts remain unchanged. A draft and a saved reflection retain the question they started with. New requests use the revised `gratitude-v2` instruction for a personalised gratitude prompt under 100 words; older `gratitude-v1` requests and saved outputs remain replayable. The existing 600-character response bound remains.

AI results are immutable events: their exact visible text, reported model version and completion reason are stored against the initiating request. Reopening, syncing and rebuilding never call either AI provider. An interrupted request needs an explicit retry; a received response waiting to sync is stored on this device and can be retried without inference. Changing sharing choices cancels pending requests across tabs/devices. Gemini calls have a 30-second timeout; local LM Studio inference has a 120-second timeout. Neither is automatically retried.

Both deployment configurations select `aiDataMode: "paid"`, and billing was verified enabled for both Firebase projects on 2026-10-15. App Check, Google sign-in and a 5-request/minute/user gateway quota protect requests. AI prompts and sharing remain opt-in. Personalization uses only approved sources: optional preferences (500 characters), up to 20 saved reflections (1,000 characters each) and 20 current prompt/feedback pairs (the original question up to 600 characters and complete feedback up to 500 characters each). Draft text, account identity, photos and photo summaries are never included in daily-prompt context. Authentication still identifies the account to the Firebase gateway.

[Firebase setup](FIREBASE_SETUP.md) records deployment and live verification. The private repository Gemini key is unused and never enters the frontend. This integration needs no Cloud Functions.

## Local models with LM Studio

Open **Settings → AI settings → AI model**, choose **LM Studio**, enter the server URL and model identifier (`google/gemma-4-31b` by default), and put the API token in the local password field. **Test connection** discovers capabilities without inference; **Save model settings** saves the provider to your account and the connection details on this device. The token stays in the tab session by default. Optional **Account token sync → Remember token in my account** stores the bound server/model/token in private account settings for other devices; **Forget saved token** removes that copy. Credentials stay outside journal events and exports. Existing sharing switches and twenty-reflection selection apply to local prompts; vision-capable models can also summarize photos.

Provider selection syncs across devices. Each device needs a reachable server address; account token sync can restore the saved connection without re-entry. Failures never trigger a Gemini fallback. For Firefox on a phone, use a private HTTPS address such as Tailscale Serve; localhost points to the phone itself. [LM_STUDIO_SETUP.md](LM_STUDIO_SETUP.md) explains server authentication/CORS, private HTTPS, thinking-off requests, context windows and recovery. Journal and photo storage still use Firebase. Projection version 9 rebuilds older caches from recorded events without inference.

## Four-week rainbow

Cards, editor previews, Today and saved-date circles use 28 distinct shades selected by the entry’s local calendar date. Sunday **25 October 2026** is yellow (`#e5e561`); the same yellow repeats every four weeks, including 27 September and 22 November. Between those dates, hues flow through green, blue, pink/red and amber back to yellow. Same-day entries share a colour; backfills and imports use their original logical dates. Changing an editor date previews the new shade immediately, while a saved card changes only after save. Search, extra entries and import order never shift other dates.

The rule uses civil dates in the viewer’s timezone, so travel/timezone changes can change boundary-hour entries’ displayed dates and colours. JSON export includes the displayed date colour; Markdown stays unchanged. Colours are computed presentation values, with no colour events or backend reservation. Legacy creation indices remain in disposable projections for compatibility and are not used to render the palette.

## Personalised reflection context

[AI_CONTEXT_DESIGN.md](AI_CONTEXT_DESIGN.md) describes up to twenty reflections selected by logical entry date: eight around anniversaries, seven least recently used in successful AI prompts and five sampled from the preceding fortnight, with deduplication and sparse-history fallback. The reference day is Today or the editor’s chosen date; same-day/future entries, the edited target, unfinished writing and photo-only entries are excluded. Imported entries use their original dates. Sources are captured once per request, including opted-in backup refills; successful responses update replayable usage, while failures do not. Old five-entry requests remain replayable. Gemini-curated monthly user notes are recorded there as a deferred idea and are neither generated nor sent.

## Calendar and gentle streaks

Today and Journal show the same Sunday-first current-week box headed **N days of gratitude in a row**. Saved dates have journal-coloured circles, unfilled dates are neutral and future dates are greyed out. Select a date to open its sole entry, or a journal for that date when it has several entries or none. An empty dated journal offers **Write a reflection for this date**; a historical draft starts at editable local noon. An existing independent draft requires an explicit Resume/Keep/discard choice.

Open the box to browse the continuously scrolling calendar, jump to a month/year or return to This month. The existing Gratitude link opens a private, non-scrolling single-month calendar on the landing page after sign-in. Its top-right controls are **< · Current month · >**; click the month heading for separate editable Month and Year dropdowns. These replace the heading inline, using nine-character month and four-character year fields with padding. Navigation uses compact square chevrons beside Current month. The extra calendar title, streak heading and standalone jump controls are omitted there. Fresh visits open the current local month; returning from an entry restores its originating month. The frame, controls and focus highlights use yellow, while saved-date rings retain their entry colours. Before sign-in, an empty greyed-out calendar is disabled beneath a small sign-in notice. Its **Sign in** link and **Sign in and open your journal →** footer open authentication and then Journal; signed-in users keep **Open your journal →**. Navigation retains the three tabs. Back, browser history, entry reload and save/Done preserve the originating date/month and scroll context, including when an edit moves an entry elsewhere.

Streaks count saved logical entry dates in the viewing device's timezone. An unfinished today retains yesterday's run; backfills and imports can repair gaps. Multiple entries count once, and all entries on a date share its calendar-ring colour. Drafts and unacknowledged saves earn no credit. Counts are derived from confirmed projected events, with no stored streak events or automatic AI calls. A warm cached prefix is labelled as waiting to sync when the backend is unavailable; missing dates may be incomplete until synchronization. Offline reloads use the previously cached app shell, sign-in and account checkpoint; first-time offline sign-in remains unsupported. See [STREAKS_DESIGN.md](STREAKS_DESIGN.md) for the rules and implementation details.

## Project records

- [LM_STUDIO_SETUP.md](LM_STUDIO_SETUP.md): local model configuration, private HTTPS, credentials, provider consent and replay.
- [AI_CONTEXT_DESIGN.md](AI_CONTEXT_DESIGN.md): implemented instruction and twenty-reflection selection, with a deferred curated-notes idea.
- [IMPORT_PLAN.md](IMPORT_PLAN.md): implemented alternate ZIP import, provenance, limits and recovery contract.
- [STREAKS_DESIGN.md](STREAKS_DESIGN.md): implemented gentle streak rules, calendar interactions, return navigation and verification.
- [VISION.md](VISION.md): the project’s intended end state.
- [MVP_DESIGN.md](MVP_DESIGN.md): proposed Firebase/Gemini architecture, source events, and replayable cached projections.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): reviewable implementation increments and acceptance gates.
- [UX_DESIGN.md](UX_DESIGN.md): mobile user stories, generated screen mockups, and interaction behavior.
- [PROMPTS.md](PROMPTS.md): verbatim user instructions given to the coding assistant, recorded chronologically. This is separate from the application's daily gratitude prompts.
- [LEARNINGS.md](LEARNINGS.md): discoveries, decisions, assumptions, and open questions for the eventual project retrospective.
- [AGENTS.md](AGENTS.md): instructions for maintaining these records during future assistant work.

## License

Gratitude is licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE) for the full license text.

## Photo attachments

Use **Add photo** while writing, on a saved reflection, or in its full entry view. Choose JPEG, PNG or WebP files up to 10 MB each, with up to four photos per entry. The browser applies image orientation, resizes to at most 2048 pixels on the longest side, and re-encodes to JPEG without original EXIF/location metadata. Review the preview and choose **Attach & summarize** or **Attach without AI**. Paid Gemini and App Check must be configured for summaries; photo storage works without AI prompts being enabled.

A selected photo is staged on this device and survives reload. Confirming attachment uploads it immediately to your private Firebase account, including while reflection text is still a local draft; the UI explains this boundary. Save a reflection with text, attached photos, or both. Discarding an unsaved reflection removes its attached files; discarding an edit keeps the saved entry’s independently synchronized attachments. Attachment/summary changes on saved entries sync immediately, independently of text edits. Initial selection and upload require an already opened journal; attaching and generating require a connection. There is no automatic inference on reconnect or replay.

Gemini receives only the selected, normalized photo and a visible-content instruction. The service does not receive other journal entries, preferences or the account name as model input. The first confirmation links [Google’s paid-service data terms](https://ai.google.dev/gemini-api/terms#paid-services). AI summary consent is per photo, separate from daily prompts and personalization; no inference happens when choosing **Attach without AI**. After attachment, **Summarize photo** or **Retry summary** explicitly authorizes a call. Each received summary and model identifier is stored as an event, and a received result that cannot sync stays in the device outbox. Replay never calls Gemini.

Read the summary beside the photo, choose **Edit summary** (or **Write summary**) and **Save summary** to correct it. Clearing it removes that description from search. Search includes current summaries with the same case/accent-insensitive matching as reflections. Manual edits and removal invalidate late AI results. A photo-only reflection must retain at least one photo until text is added. Removed files are deleted; failed file cleanup is recorded locally and offers retry, including after reload. Removing a photo excludes its summary from current search/export; its historical summary remains in the immutable stream. Full historical data erasure is a separate planned feature.

Exports with photos produce a ZIP containing the existing Markdown or JSON journal and private `attachments/*.jpg` files with their current summaries. Exports without photos keep the existing single-file format. A missing or inaccessible photo fails preparation visibly; no partial archive is labeled complete. Storage bytes are fetched with Google-authenticated Firebase requests, not public or permanent token URLs. Replaying the event stream restores attachment references and summaries; displaying/exporting the images additionally requires the retained Storage objects.

## Choose or write a reflection prompt

Inside **Your reflection**, choose **Generate AI prompt** to request a question using your saved AI sharing choices. Review the generated option and choose **Use this prompt** or **Keep current prompt**. This works for first entries, additional entries, backfills and saved-entry edits. Editor generation does not change Today’s selected question or overwrite response text. AI prompts must be enabled in Settings; manual editing is available independently.

Double-click the displayed question to edit it, or use **Edit prompt** on touch screens or with the keyboard. Enter a nonblank question of up to 600 characters, then **Save prompt** to keep it in the local draft. **Cancel prompt edit** keeps the existing question. Save the reflection to synchronize the changed prompt and response together; discarding the draft leaves the saved question unchanged. Confirmed prompt edits and selected AI options survive draft reload. Unconfirmed text in the inline prompt editor is not saved.

An AI result is a separate option and cannot replace a manual edit automatically. An already-received option waiting for sync survives reload without another model call. Its request identifies the entry, and exact AI output remains in response events. Manually written questions are literal source input in ReflectionWritten schemas 5/6, with revisions protecting concurrent edits. Full replay and cached replay reconstruct both kinds of question.

## Import an existing journal

Open **Settings → Import journal**, choose the alternate app’s ZIP containing `gratitudeEntries.json` and its JPEGs, review the counts and date span, then confirm the signed-in destination account. Original writing, prompts and historical instants are retained; missing prompts display `[No prompt]`. Photo-only and multiple-per-day entries remain separate. Photos use the app’s private metadata-free JPEG format. Import makes no Gemini requests.

You can pause and explicitly resume. Reload restores the chosen ZIP on this device without running it; another device can select the ZIP again. Identical completed source records are skipped and preserve later edits. Changed source records block import instead of overwriting entries. JSON exports with imported entries use version 3 and retain original source fields under `origin`; other journals retain version 2. Keep your original archive until you have checked the imported journal and complete photo export. See [supported format, limits and recovery details](IMPORT_PLAN.md#limits-and-recovery-behaviour). This is an alternate-format importer, not a native JSON backup restore tool.

## Personalised backup prompts

Open **Settings → AI settings → Backup prompts** to see the unused questions cached on this device. **Import backup prompts** accepts a single-column XLSX with an optional “Prompt” header, previews its count and signed-in destination, and retains all imported questions even above 30. The spreadsheet and questions stay in that private account. Reimporting the same workbook adds no duplicates.

On Today or in the reflection editor, **Choose a backup prompt** opens saved personalised questions instantly. **Show another** keeps the skipped question. **Use this backup** retains the question with your draft. Saving a reflection consumes it; **I won’t use this prompt → Remove permanently** excludes a question you do not want. Offline selections, drafts and removals survive reload, and removals sync on reconnect. Used/removed questions remain readable in older reflections.

Under **Backup preferences**, choose whether to refill automatically and select **Local LLM · LM Studio** or **Cloud LLM · Gemini** independently of your normal prompt provider. LM Studio is the initial choice; configure its device-private connection under **Local backup connection** when your normal provider is Gemini. The existing journal/feedback switches govern both providers. Automatic refill generates one question at a time toward 30 while the app is open, visible, synchronized and able to reach that model; it keeps imported overage, paces cloud requests, and pauses after repeated failures or duplicate answers. It never silently switches providers. A used or removed question makes room for another at the next successful refill. No Cloud Functions are needed.

After a successful online visit has installed the app shell and cached your signed-in journal, the app can reopen offline to read entries and choose saved prompts. First-time sign-in and an uncached installation still need a connection; pending reflection saves retain the existing sync controls. Public app files alone enter the service-worker cache, isolated by deployment scope; private questions remain in account-scoped IndexedDB and Firebase. See [BACKUP_PROMPTS_DESIGN.md](BACKUP_PROMPTS_DESIGN.md) and walkthroughs [027](tests/e2e/027-backup-prompts/README.md) and [028](tests/e2e/028-backup-refill/README.md).

Signed-out visits to any app page show the public landing page with the empty, disabled calendar and Google sign-in links. `/settings/` is also a direct Settings entry point for signed-in users. The footer’s sign-in link opens Journal after authentication. Cancelling sign-in leaves the landing page available for retry.

## Friends and hugs

Open **Settings → Your account → Friends & hugs** on a configured Firebase site. Choose a display name and a unique username, then find someone by their full username and send a request. Usernames ignore case and accept an optional leading `@`; they use 3–24 ASCII letters, digits or underscores, starting with a letter. Display names are editable and need not be unique. Saving explicitly chooses what will be discoverable; Google names, emails, account photos and journal contents are not published.

Only accepted friends can send hugs. Hugs arrive in the Friends inbox while that page is open and remain saved for later visits. Recipients can mark them as read, pause hugs from a friend, remove a friend or block someone. Sending is limited to one hug per friend per 24 hours; declining or cancelling a request prevents another request to that person for 24 hours. Unblocking does not restore a friendship. You can hide your profile from new searches or change your username without moving existing relationships to a different account.

Friends uses separate source streams and a cached local projection. **Rebuild friends view** reconstructs it from the saved actions without sending old hugs again. Actions require a connection; there is no social outbox in this first slice. Loading starts when you open Friends, keeping normal journal and Settings navigation independent of social history. The development-only fictional UI review does not connect to the social backend; use the Firebase emulator or PR preview for these flows.

Daily gratitude-status sharing, private invitation links and device push notifications remain planned. This release provides a durable in-app inbox and does not request browser notification permission. See [FRIENDS_DESIGN.md](FRIENDS_DESIGN.md) for the implemented boundaries and next design questions.
