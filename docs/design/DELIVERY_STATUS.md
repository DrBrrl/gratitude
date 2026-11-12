# Current review queue

Updated 12 November 2026. Pull requests remain the source for current CI results and merge status.

| PR | Reviewable result | State of the feature |
| --- | --- | --- |
| [#30 — Reflection topics](https://github.com/DrBrrl/gratitude/pull/30) | Editable topics, source/replay/Rules, JSON metadata and mobile/desktop walkthroughs | Implemented; no AI classification yet |
| [#31 — Gratitude together](https://github.com/DrBrrl/gratitude/pull/31) | Two-part daily hearts, repairable shared streaks, received-hug labels and explicit publication status | Implemented on the review branch |
| [#32 — Classification](https://github.com/DrBrrl/gratitude/pull/32) | Consent, source/projection contract, resumable batches and acceptance tests | Specification draft; no live classifier |
| [#33 — One-topic prompts](https://github.com/DrBrrl/gratitude/pull/33) | Topic rotation, matching history, versioned instructions and acceptance tests | Specification draft; existing generation unchanged |
| [#34 — Discovery and review](https://github.com/DrBrrl/gratitude/pull/34) | Visible modes, cadence decisions, replay and boundary tests | Specification draft; no scheduler enabled |

Merge #30 first. The other branches are based on its event contract and must be retargeted to main after it merges. The Friends feature is separate from the AI stages, but needs the newer event decoder because PR previews share a Firebase development event stream.

The remaining AI implementation sequence is classification, regular one-topic generation, then discovery/review. Instruction wording, precise selection windows and lunar versus calendar scheduling remain explicit review choices in the [parent workflow](TOPIC_AWARE_PROMPTS.md). The draft PRs make the work concrete without enabling new processing of personal journals.

For an existing profile with no saved sharing choice, review and save **Share my gratitude streaks with friends** in Friends → Edit friends profile. A checked draft checkbox alone is not consent. Once enabled, the app confirms a matching date publication or offers **Sync shared streak**. The received-hug label follows the recipient’s device day and does not remove the source hug when it clears.
