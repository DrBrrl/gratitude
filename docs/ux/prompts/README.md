# Image generation record

The five numbered text files contain the exact prompts submitted to the built-in image generation tool. Each produces a board with three mobile screens. The matching final PNG is stored in `../mockups/` with the same base name.

For board 03, `03-choice-and-history-edit.txt` was then applied to the first generated board as an image edit. The final image retains that edit; the discarded initial version is not committed. No CLI/API fallback was used.

The common styling instructions are repeated in each prompt so the board specifications are self-contained. Generated icon shapes and minor spacing vary; UX_DESIGN.md defines the interaction contract. User instructions are preserved separately in the repository's PROMPTS.md.
