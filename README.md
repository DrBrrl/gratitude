# Gratitude

Gratitude is a planned responsive single-page application (SPA) for daily gratitude reflection. Each day, an AI generates a prompt the user can respond to. Over time, it should learn which prompts suit that person and adapt to their preferences and feedback.

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
npm run test:deployment
npm run test:e2e
```

See [E2E_GUIDE.md](E2E_GUIDE.md) for scenarios, reports, and testing on Nix or other systems. [DEPLOYMENT.md](DEPLOYMENT.md) explains automatic production deployments and per-PR previews on GitHub Pages. Production is served at [drbrrl.github.io/gratitude](https://drbrrl.github.io/gratitude/) through the Pages workflow.

The proposed MVP uses Firebase with Google sign-in for cross-device event streams and planned Firebase AI Logic calls whose responses are recorded as events. See [MVP_DESIGN.md](MVP_DESIGN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the design and provisioning status. This PR implements the first Firebase slice; Gemini integration remains planned.

## Firebase development

Use the Node 24 Nix shell for the app and Firebase emulators (Java is included):

```sh
nix develop -c npm ci
nix develop -c npm run test:firebase:all
```

For interactive use, run `nix develop -c npm run emulators` and, in another terminal, `nix develop -c npm run dev:firebase`. Open `/journal/` and create a fictional Google account in the Auth emulator popup. Tests use `demo-gratitude` and never call the live project or Gemini.

Saved user actions are appended in a browser transaction. Security Rules enforce ownership, exact schemas, contiguous ordering, expected revisions and immutable events. The head and per-entry event pointer must be updated atomically with each event. IndexedDB holds a disposable checkpoint and a pending-save outbox; rebuilding the local view replays the cloud stream. Editor text is persisted only when Save is selected. Offline cold starts, automatic draft saving, photos, AI, search, export and deletion are future increments.

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
