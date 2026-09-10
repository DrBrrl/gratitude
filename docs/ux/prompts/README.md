# Image generation record

The eight `*-yellow-final.txt` files contain the exact prompts for the final M01–M24 boards. They were submitted to the built-in image tool; no CLI/API fallback was used. Final PNGs are in `../mockups/`. User instructions remain verbatim in the root PROMPTS.md.

The first seven final calls are image edits using `referenced_image_paths`; the photo board is a new generation.

| Final prompt | Reference image | Source |
| --- | --- | --- |
| 01-onboarding-yellow-final.txt | 01-onboarding-dark.png | Onboarding intermediate |
| 02-today-and-choice-yellow-final.txt | 02-today-and-choice-dark.png | Today intermediate |
| 03-writing-and-feedback-yellow-final.txt | 03-writing-and-feedback-dark.png | 90c4e4c |
| 04-rainbow-journal-search-yellow-final.txt | 04-rainbow-journal-search-dark.png | 90c4e4c |
| 05-settings-ai-export-yellow-final.txt | 05-settings-ai-export-dark.png | 90c4e4c |
| 06-privacy-and-recovery-yellow-final.txt | 06-privacy-and-recovery-dark.png | 90c4e4c |
| 07-empty-search-and-explanation-yellow-final.txt | 07-empty-search-and-explanation-dark.png | 90c4e4c |
| 08-photos-and-summaries-yellow-final.txt | None | New generation |

References marked `90c4e4c` are the prior mockups under `docs/ux/mockups/` at that Git commit. For onboarding and Today, first apply the corresponding prompt in `archive/yellow-intermediate/` to that prior mockup, then use its result as the final edit reference. These two intermediate renders were inspected before editing.

The remaining first-pass yellow renders were superseded by the navigation and photo instructions arriving during generation and are not part of the review set. All first-pass prompts are retained in `archive/yellow-intermediate/`; the earlier dark-aurora prompts and card-layout corrections are in `archive/violet-aurora/`. Original light-mode prompts remain directly in `archive/`. Earlier image files remain in Git history.

Generated mockups illustrate appearance; UX_DESIGN.md defines exact layout, full prompt preservation, photo-summary handling, and interaction behavior.
