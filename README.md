# Gratitude

Gratitude is a planned responsive single-page application (SPA) for daily gratitude reflection. Each day, an AI generates a prompt the user can respond to. Over time, it should learn which prompts suit that person and adapt to their preferences and feedback.

The aim is to make reflection approachable, personal, and useful—whether someone has a few words to share or wants to write at length.

## Status

This repository currently contains the project documentation. The application, AI integration, storage model, and development environment have not been implemented.

## Intended experience

- Open the app on a phone, tablet, or desktop and receive a daily gratitude prompt.
- Write a response, with the freedom to skip a prompt or ask for another.
- Give feedback about what feels helpful, repetitive, or inappropriate.
- Receive prompts that become more relevant over time, with control over personalization.
- Revisit past reflections in a private journal.

These are product intentions, not currently available features. See [VISION.md](VISION.md) for the project’s intended end state.

## Development

The project is being started on a Nix system. We intend to provide a reproducible Nix development environment once the application stack is selected. There is no `flake.nix`, development shell, or runnable application yet.

Early technical decisions include the frontend framework, persistence and authentication approach, AI provider or local model, and the mechanism for adapting prompts. Each decision should account for accessibility, privacy, cost, and maintainability.

## Project records

- [VISION.md](VISION.md): the project’s intended end state.
- [UX_DESIGN.md](UX_DESIGN.md): mobile user stories, generated screen mockups, and interaction behavior.
- [PROMPTS.md](PROMPTS.md): verbatim user instructions given to the coding assistant, recorded chronologically. This is separate from the application's daily gratitude prompts.
- [LEARNINGS.md](LEARNINGS.md): discoveries, decisions, assumptions, and open questions for the eventual project retrospective.
- [AGENTS.md](AGENTS.md): instructions for maintaining these records during future assistant work.

## License

Gratitude is licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE) for the full license text.
