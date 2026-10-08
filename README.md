# Gratitude

Gratitude is a responsive single-page application (SPA) for daily gratitude reflection. Its intended daily experience starts with an AI-generated prompt the user can respond to. Over time, it should learn which prompts suit that person and adapt to their preferences and feedback.

The aim is to make reflection approachable, personal, and useful—whether someone has a few words to share or wants to write at length.

## Status

The repository contains a Svelte 5 / SvelteKit application with a responsive dark landing page, a Nix development shell, Playwright functional and screenshot tests, and GitHub Pages deployment. The Firebase foundation adds Google sign-in, a private event stream, reflection save/edit, cross-device synchronization, and cached projection recovery. The production and preview Firebase projects have Google sign-in and Sydney Firestore databases. The application writes directly through Firestore transactions protected by Security Rules; no Cloud Functions or billing linkage is needed for this foundation (see [setup status](FIREBASE_SETUP.md)). AI prompts and the remaining MVP experience are planned.

## Intended experience

- Open the app on a phone, tablet, or desktop and receive a daily gratitude prompt.
- Write a response, with the freedom to skip a prompt or ask for another.
- Give feedback about what feels helpful, repetitive, or inappropriate.
- Receive prompts that become more relevant over time, with control over personalization.
- Revisit past reflections in a private journal.

The full experience below remains the product target; the current journal uses a fixed starter prompt. See [VISION.md](VISION.md) for the project’s intended end state.

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

The proposed MVP uses Firebase with Google sign-in for cross-device event streams and planned Firebase AI Logic calls whose responses are recorded as events. See [MVP_DESIGN.md](MVP_DESIGN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the design and provisioning status. The journal now includes browsing, search, durable local drafts and Markdown/JSON export; Gemini integration remains planned.

## Local UI review

Run `nix develop -c npm run dev:ui -- --port 5173 --strictPort` and open [the local journal](http://127.0.0.1:5173/journal/). This development-only mode starts signed in as a fictional review user and replays `src/lib/dev/journal-events.json` through the real projection reducer. It needs no Firebase login or emulators and never accesses cloud journal data.

Seven sample reflections cover all rainbow colours, short and long text, search, and an edited entry. Changes and drafts remain in a separate browser-local review store across reloads. Settings → UI review provides **Restore sample journal** and **Show empty journal**. Signing out lets you inspect the sign-in screen; its button reopens the review session. This mode exposes the currently implemented screens; planned onboarding, AI and photo screens still need implementation.

The current interface follows the mobile mockups with a Today prompt, separate writing and saved-reflection screens, content-sized rainbow journal cards, and a Settings menu. Collapsed cards show up to three rendered reflection lines across paragraphs, with an ellipsis for interrupted sentences and separate expansion controls. Export opens a Markdown/JSON chooser with preparation and download steps. AI settings shows the planned controls disabled, with an explanation that personalization and photo summaries are not implemented.

Today uses the device’s local calendar date and its own draft. Editing another journal entry keeps a separate durable draft; it cannot change Today’s prompt, colour or continue-writing state. Once today’s reflection is saved, Today continues that same entry and retains its projected colour. Existing journals with multiple entries on the same day use the first one for Today; other entries remain independently editable.

The reviewed interface is covered by mobile and desktop E2E walkthroughs, including paragraph writing, card expansion, search, independent drafts, Settings and export. Each action compares a full-page screenshot with zero pixel tolerance and no masking. Use the normal app and emulator workflows to validate changes before publication; `dev:ui` remains available for quick visual iteration.

## Firebase development

Use the Node 24 Nix shell for the app and Firebase emulators (Java is included):

```sh
nix develop -c npm ci
nix develop -c npm run test:firebase:all
```

For interactive use, run `nix develop -c npm run emulators` and, in another terminal, `nix develop -c npm run dev:firebase`. Open `/journal/` and create a fictional Google account in the Auth emulator popup. Tests use `demo-gratitude` and never call the live project or Gemini.

Saved user actions are appended in a browser transaction. Security Rules enforce ownership, exact schemas, contiguous ordering, expected revisions and immutable events. The head and per-entry event pointer must be updated atomically with each event. IndexedDB holds a disposable checkpoint and a pending-save outbox; rebuilding the local view replays the cloud stream. Editor drafts persist on this device as you type and recover after reload. Today/Journal/Settings navigation, content-sized rainbow cards, full-entry editing and accent-insensitive search are implemented. Markdown and JSON exports reconstruct all saved entries from a verified cloud event prefix, independent of search filters; they exclude unfinished drafts and require a connection. Markdown dates use the exporting device’s local timezone in `YYYY-MM-DD HH:mm:ss` format. Offline cold starts, cross-device drafts, photos, AI and deletion remain future increments.

## Project records

- [VISION.md](VISION.md): the project’s intended end state.
- [MVP_DESIGN.md](MVP_DESIGN.md): proposed Firebase/Gemini architecture, source events, and replayable cached projections.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): reviewable implementation increments and acceptance gates.
- [UX_DESIGN.md](UX_DESIGN.md): mobile user stories, generated screen mockups, and interaction behavior.
- [PROMPTS.md](PROMPTS.md): verbatim user instructions given to the coding assistant, recorded chronologically. This is separate from the application's daily gratitude prompts.
- [LEARNINGS.md](LEARNINGS.md): discoveries, decisions, assumptions, and open questions for the eventual project retrospective.
- [AGENTS.md](AGENTS.md): instructions for maintaining these records during future assistant work.

## License

Gratitude is licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE) for the full license text.
