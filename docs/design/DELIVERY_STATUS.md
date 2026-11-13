# Current review queue

Updated 13 November 2026. Pull requests remain the source for current CI results and merge status.

| PR | Reviewable result | State of the feature |
| --- | --- | --- |
| [#30 — Reflection topics](https://github.com/DrBrrl/gratitude/pull/30) | Editable topics, source/replay/Rules, JSON metadata and mobile/desktop walkthroughs | Merged; no AI classification yet |
| [#35 — Today buttons](https://github.com/DrBrrl/gratitude/pull/35) | Full-width writing/AI actions with a smaller starter/backup row | Merged |
| [#31 — Gratitude together](https://github.com/DrBrrl/gratitude/pull/31) | Two-part daily hearts, repairable shared streaks, received-hug labels and explicit publication status | Implemented on the review branch |
| [#32 — Classification](https://github.com/DrBrrl/gratitude/pull/32) | Consent, source/projection contract, resumable batches and acceptance tests | Specification draft; no live classifier |
| [#33 — One-topic prompts](https://github.com/DrBrrl/gratitude/pull/33) | Topic rotation, matching history, versioned instructions and acceptance tests | Specification draft; existing generation unchanged |
| [#34 — Discovery and review](https://github.com/DrBrrl/gratitude/pull/34) | Visible modes, cadence decisions, replay and boundary tests | Specification draft; no scheduler enabled |

PRs #30 and #35 are merged. The open PRs target main, and #31 incorporates both merged features. The Friends feature is separate from the AI stages. Its updated walkthroughs preserve the new Today action layout alongside the shared gratitude table and daily received-hug status.

The remaining AI implementation sequence is classification, regular one-topic generation, then discovery/review. Instruction wording, precise selection windows and lunar versus calendar scheduling remain explicit review choices in the [parent workflow](TOPIC_AWARE_PROMPTS.md). The draft PRs make the work concrete without enabling new processing of personal journals.

For an existing profile with no saved sharing choice, review and save **Share my gratitude streaks with friends** in Friends → Edit friends profile. A checked draft checkbox alone is not consent. Once enabled, the app confirms a matching date publication or offers **Sync shared streak**. The received-hug label follows the recipient’s device day and does not remove the source hug when it clears.
