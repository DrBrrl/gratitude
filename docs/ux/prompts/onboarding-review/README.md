# Onboarding image-generation prompts

These files contain the exact prompts submitted to the built-in `image_gen` tool for the twelve-screen onboarding review. No CLI/API fallback or post-generation image editing was used. The four selected PNGs were copied unchanged to [`../../mockups/onboarding-review/`](../../mockups/onboarding-review/).

| Final board | Generation prompt | Input |
| --- | --- | --- |
| [01 · Welcome, identity and colour](../../mockups/onboarding-review/01-welcome-identity-colour.png) | [Initial prompt](01-welcome-identity-colour.txt), followed by [targeted refinement](01-welcome-identity-colour-refine.txt) | Generate the initial board, then edit that output to move the star after the wordmark and remove redundant unlabeled sample controls. |
| [02 · Interests and prompts](../../mockups/onboarding-review/02-interests-and-prompts.png) | [Exact prompt](02-interests-and-prompts.txt) | New generation. |
| [03 · AI and Friends](../../mockups/onboarding-review/03-ai-and-friends.png) | [Exact prompt](03-ai-and-friends.txt) | New generation. |
| [04 · Review and writing](../../mockups/onboarding-review/04-review-sharing-and-writing.png) | [Exact prompt](04-review-sharing-and-writing.txt) | New generation. |

Five tool calls produced the four final boards. The initial, superseded welcome render is not part of the review set; its prompt is retained to document how the refinement’s input was produced. The existing M01–M24 boards and prompts were not overwritten.

Style and content were informed by the current application’s mobile walkthroughs, the existing onboarding board, the supplied account palette and [ONBOARDING_DESIGN.md](../../../../ONBOARDING_DESIGN.md). Those application screenshots were inspected locally, not supplied as tool inputs. The only image edit input was the newly generated welcome board. All names, profile details, the local-server address and token presentation are fictional.

Root [PROMPTS.md](../../../../PROMPTS.md) records the user’s request verbatim. [The visual review guide](../../ONBOARDING_REVIEW.md) maps O01–O12 to the proposal and explains the depicted alternatives.
