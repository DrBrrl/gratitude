# GitHub Pages deployment

The [CI and Pages workflow](.github/workflows/ci-pages.yml) builds and tests pull requests and `main`. Successful same-repository PR builds publish to:

```text
https://drbrrl.github.io/gratitude/pr-preview/pr-<number>/
```

Successful `main` builds publish to [the production site](https://drbrrl.github.io/gratitude/). The publish job's summary contains the URL. Closing or merging a PR removes its preview. Fork PRs run checks but do not publish because their tokens lack write permissions. Preview deployment is intended for trusted contributors with branches in this repository.

## Build and publication

SvelteKit uses `adapter-static`, prerendering, and trailing slashes. `BASE_PATH` is `/gratitude` for production and `/gratitude/pr-preview/pr-<number>` for a preview. CI runs the E2E tests, including zero-pixel screenshot comparisons, against a build with that exact base path. It uses the locked Nix browser and fonts and verifies generated scenario READMEs are committed. New routes must remain compatible with static prerendering; use SvelteKit's path helpers for internal links and assets. GitHub Pages provides no application server or private secret storage.

The `gh-pages` branch stores the combined production site and open previews. `scripts/assemble_pages.py` replaces only the destination being published, preserves the others, and prunes previews whose PRs are closed. Publication is serialized across the repository. Stale builds are skipped before assembling; queued runs can be superseded, so each publication reconciles all closed previews rather than relying only on close events. A failed build leaves the previously published site available. Reopen a PR or push another commit to rebuild its preview.

The combined site is uploaded and published with GitHub's official Pages artifact actions. This is an explicit Actions deployment, not a branch-triggered Pages build: [commits made with `GITHUB_TOKEN` do not trigger a branch-source Pages build](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The workflow uses the repository token and OIDC; no personal access token is needed.

## Repository setup

These settings are required once for a new copy of the repository:

1. Create a `gh-pages` branch containing an `index.html` and `.nojekyll`. The first scaffold preview can coexist with a placeholder production page until the app is merged.
2. Under Settings → Pages, select **GitHub Actions** as the publishing source.
3. Configure the `github-pages` environment to permit deployments from this repository's PR refs as well as `main` (no deployment branch restriction). The workflow itself limits publishing to same-repository PRs and `main`.
4. Enable Actions and allow the workflow's explicit `contents: write`, `pages: write`, and `id-token: write` permissions. The publish job also reads PRs to prune closed previews.

The [official custom-workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes Pages permissions and environments. Restricting the environment to `main` prevents PR previews from deploying.

For this repository the initial setup is performed with the scaffold PR. Production receives the app after merge; the scaffold PR does not merge itself.

## Verification and recovery

Run the commands in [E2E_GUIDE.md](E2E_GUIDE.md) for local and deployed checks. CI retains the tested static build for seven days and the browser reports for fourteen days. Deployment assembly also has Python unit tests (`npm run test:deployment`).

A failed publication can be rerun in Actions. After this workflow is on `main`, manually dispatch it on `main` to rebuild production and reconcile preview cleanup. Preserve the `gh-pages` branch: it contains the currently retained previews. It is generated deployment state, not the branch for application development. If the branch is lost, restore it from history or bootstrap it again, then rebuild production and each open PR preview.
