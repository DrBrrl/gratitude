# Project learning log

Record meaningful discoveries, decisions, and unanswered questions as work proceeds. Keep evidence distinct from assumptions. Append dated entries, and explicitly note when later evidence supersedes an earlier conclusion.

For future entries, capture the context, observation or decision, supporting evidence, implications, and any follow-up. At completion, add a retrospective covering outcomes, useful practices, mistakes, and remaining questions.

## 2026-09-10 — Project foundation

### Confirmed requirements

- The project is called Gratitude and is being started on a Nix system.
- It will be a responsive SPA with a daily AI-generated gratitude prompt and a way for the user to respond.
- Prompting should adapt to the user over time.
- The project will use GPLv3.
- Development prompts must be retained verbatim, and lessons must be recorded for later review.

Evidence: the initial user request in [PROMPTS.md](PROMPTS.md).

### Observations and initial decisions

- The workspace was empty and had no Git repository. A local repository was initialized with a `main` branch.
- The project begins with documentation; no application stack or AI provider has been selected.
- The license is recorded as GPL-3.0-only, using the GNU-published GPLv3 text. The request names version 3 without specifying an “or later” grant.
- A reproducible Nix development environment is planned, but its contents depend on the stack selection.
- Privacy controls, a journal history, feedback, and the other experience details in VISION.md are proposed design requirements derived from the product idea. They have not been implemented or validated with users.

### Hypotheses to test

- A daily prompt makes it easier to start reflecting than an empty journal page.
- Explicit preferences and feedback may provide useful personalization without custom model training.
- Optional participation and gentle wording help make the practice sustainable.

### Open questions

- Who is the first intended user, and what would make a prompt appropriate for them?
- What frontend and backend, if any, fit the intended deployment and Nix workflow?
- Should journal data remain local, synchronize across devices, or live on a server?
- Which model will generate prompts, what context may it receive, and what cost and latency are acceptable?
- How will personalization be explained, reset, and evaluated?
- How should time zones, missed days, offline use, and failed generation behave?
- What marks the first release and the point for the project retrospective?

## 2026-09-10 — Keep the vision focused on the end state

The user clarified that VISION.md contains only end-state statements: no roadmap, judgement, evaluation, or qualifications about implementation status. The initial version mixed these concerns into the vision. Removed them and corrected the README's description of the document. This supersedes the earlier framing of the vision as a place for scope and evaluation planning.

Evidence: the vision content correction in [PROMPTS.md](PROMPTS.md). Future vision edits must describe the finished product; process, discoveries, and status belong in other project records.

## 2026-09-10 — Preparing the first GitHub pull request

GitHub CLI was not on PATH. Running `nix shell nixpkgs#gh -c gh …` makes it available without changing the system configuration. GitHub CLI initially had no authenticated account; browser device authorization is required to log in.

An empty initial commit on `main` provides the base for a separate documentation branch, allowing all six project files to be reviewed together in the first pull request.

## 2026-09-10 — GitHub authentication and visibility

GitHub CLI authentication completed successfully for `DrBrrl`, using HTTPS for Git operations. The user explicitly requested a public repository; this supersedes the assistant's proposed private default.
