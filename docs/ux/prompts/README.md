# Image generation record

The seven `*-dark.txt` files contain the exact prompts for the current M01–M21 boards, generated with the built-in image tool. The matching final PNGs are in `../mockups/`. No CLI/API fallback was used.

The first six calls revised existing images, supplied through `referenced_image_paths`. The seventh was a new generation. Reference images are retained in Git history at commit `40c7879` under `docs/ux/mockups/`. Their original generation prompts are preserved in `archive/`.

| Current prompt | Reference image at 40c7879 |
| --- | --- |
| 01-onboarding-dark.txt | 01-start-and-today.png |
| 02-today-and-choice-dark.txt | 01-start-and-today.png |
| 03-writing-and-feedback-dark.txt | 02-write-and-save.png |
| 04-rainbow-journal-search-dark.txt | 03-choice-and-history.png |
| 05-settings-ai-export-dark.txt | 04-personalization-and-data.png |
| 06-privacy-and-recovery-dark.txt | 05-recovery-and-empty.png |
| 07-empty-search-and-explanation-dark.txt | None — new generation |

For board 04, apply `04-rainbow-journal-search-dark-edit.txt` to the first result, then `04-rainbow-journal-search-dark-edit2.txt` to that edited result. The first correction had little visual effect; the second recomposed the card typography and layout. Only the final selected image is committed. Exact pixel equality and search highlights remain requirements in UX_DESIGN.md; generated geometry is illustrative.

User instructions remain verbatim in the root PROMPTS.md.
