# Repository instructions

## Maintain the project record

- Append every new user prompt related to this project to `PROMPTS.md` verbatim. Preserve spelling, punctuation, and formatting; put dates and contextual notes outside the prompt text.
- Record prompts before carrying out their work whenever practical. Include follow-up instructions received while working, and do not duplicate already recorded prompts.
- Preserve prior entries. If a correction or omission is discovered, append a clearly labeled correction or missing entry rather than silently rewriting history.
- This log concerns user instructions to the coding assistant. Do not add system or developer instructions, tool output, or private application journal data.
- Update `LEARNINGS.md` when work produces meaningful discoveries, decisions, changed assumptions, or unresolved questions. Include the evidence and implications; distinguish confirmed facts from proposals.
- At project completion, use the prompt and learning logs to write a retrospective in `LEARNINGS.md`.

## Project direction

- Read `README.md` and `VISION.md` before substantive implementation.
- The project targets a responsive SPA and a reproducible development workflow on Nix.
- Keep documentation accurate about what is implemented versus planned.
- Preserve the project's GPLv3 licensing.
- Keep `VISION.md` limited to end-state statements. Do not include roadmaps, judgement, evaluation, or qualifications about implementation status.

## E2E screenshot contract

- No screenshot masking is allowed in any circumstance. Keep `maxDiffPixels: 0` and `threshold: 0`.
- Make clocks and fixture inputs deterministic; never hide, replace or crop rendered content to bypass a screenshot difference.
- Follow each user action with a screenshot comparison and generate walkthroughs with checks underneath the image, as described in `E2E_GUIDE.md`.
