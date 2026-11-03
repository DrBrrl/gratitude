# Onboarding image-generation prompts

These files contain the exact prompts submitted to the built-in `image_gen` tool for the fourteen-screen onboarding review. No CLI/API fallback or external image manipulation was used. The five currently selected PNGs were copied unchanged to [`../../mockups/onboarding-review/`](../../mockups/onboarding-review/).

| Final board | Generation prompt | Input |
| --- | --- | --- |
| [01 · Welcome, identity and colour · v2](../../mockups/onboarding-review/01-welcome-identity-colour-v2.png) | [Exact revision prompt](01-welcome-identity-colour-v2.txt) | Edit the [previous board](../../mockups/onboarding-review/01-welcome-identity-colour.png) to remove the title, revise the two-sentence introduction to the questions, and shorten the colour card after removing its caption. |
| [02 · Interests and prompts](../../mockups/onboarding-review/02-interests-and-prompts.png) | [Exact prompt](02-interests-and-prompts.txt) | New generation. |
| [03 · AI and Friends · v2](../../mockups/onboarding-review/03-ai-and-friends-v2.png) | [Exact revision prompt](03-ai-and-friends-v2.txt) | Edit the [previous board](../../mockups/onboarding-review/03-ai-and-friends.png) to separate service/model choice and depict Ollama with a Hermes model. |
| [04 · Review and writing](../../mockups/onboarding-review/04-review-sharing-and-writing.png) | [Exact prompt](04-review-sharing-and-writing.txt) | New generation. |
| [05 · Expanded welcome](../../mockups/onboarding-review/05-welcome-expanded.png) | [Exact prompt](05-welcome-expanded.txt) | New generation: one page at two scroll positions, showing all seven feature descriptions. |

Eight tool calls produced the five current boards and their earlier versions. The first welcome board came from [the initial prompt](01-welcome-identity-colour.txt), followed by [the first refinement](01-welcome-identity-colour-refine.txt); the first connections board came from [its original prompt](03-ai-and-friends.txt). The initial, superseded welcome render is not part of the review set; its prompt documents how the first refinement’s input was produced. Earlier selected boards and the existing M01–M24 assets were not overwritten.

Style and content were informed by the current application’s mobile walkthroughs, the existing onboarding board, the supplied account palette and [ONBOARDING_DESIGN.md](../../../../ONBOARDING_DESIGN.md). Application screenshots were inspected locally, not supplied as tool inputs. Image-edit inputs were the generated welcome board and, for the later revisions, the two earlier selected boards linked above. All identity and connection examples are fictional. The `hermes3:8b` identifier in the updated connection illustration is a real model name from Ollama’s catalogue; the pictured connection was not a live test.

Root [PROMPTS.md](../../../../PROMPTS.md) records the user’s requests and scope clarifications verbatim. [The visual review guide](../../ONBOARDING_REVIEW.md) maps O01–O14 to the proposal and explains the depicted alternatives.
