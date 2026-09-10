# 001 — Landing page serves

As a visitor, I can open Gratitude and see its name.

The same scenario runs at mobile and desktop widths against the production build. It verifies HTTP 200, the document title, and the visible main heading. It runs at the configured base URL, including GitHub Pages project and PR-preview paths.

The helper attaches a numbered screenshot and a Markdown verification record to the Playwright report. They are run artifacts, not visual-regression baselines.
