# Deploy — GitHub Pages

Grid Operator is a static, zero-build ES-module site, so it deploys straight from the
repository with no pipeline.

## Live site

**https://theshawbit.github.io/energy-game/** — HTTPS enforced.

## How it's wired

- **Source:** GitHub Pages, "Deploy from a branch" → `main`, path `/` (repo root).
- **Trigger:** every push/merge to `main` rebuilds and redeploys automatically. There is
  no build step — Pages serves the committed files as-is. **Deploy is not CI-gated** (there
  is nothing to build), but **tests are**: a GitHub Action runs `npm test` on every push and
  PR (`.github/workflows/test.yml`). Deploying is still the act of merging to `main`.
- **`.nojekyll`** (repo root) tells Pages to skip Jekyll processing and publish the tree
  verbatim.
- **Subpath-safe:** the site lives under `/energy-game/`, so every reference is
  **relative** — `index.html` loads `styles/live.css` and `src/live/main.js`, and the
  modules import each other with `./` / `../` paths. There are no absolute `/…` paths, no
  `<base>` tag, and no service worker, so the same files also run from `file://`-less
  local servers or any other host.

## Release checklist

Because there is no build step, the deployed build can't stamp itself — so the version is a
**hand-bumped constant**, and bumping it is part of releasing. On a release:

1. **Bump `VERSION`** in [`src/live/version.js`](../src/live/version.js) to the version being
   shipped, in the **same commit/PR** as the release (never after — a stamp that lags the deploy
   is worse than none).
2. `npm test` green locally; the CI Action must also be green on the PR.
3. Merge to `main` (this *is* the deploy).
4. Verify (below), and confirm the on-page stamp beside the "Grid Operator" wordmark reads the
   version you just shipped.

## Verifying a deploy

```bash
# the commit Pages last built should match main's HEAD
gh api repos/theshawbit/energy-game/pages/builds/latest --jq '{status,commit:.commit[0:9]}'
git rev-parse HEAD
```

Then load the live URL, check the browser console is clean, the live HUD renders, and the
version stamp beside the "Grid Operator" wordmark matches the `VERSION` you shipped.

## Changing the hosting

- Inspect: `gh api repos/theshawbit/energy-game/pages`
- Re-point source: `gh api repos/theshawbit/energy-game/pages -X PUT -f 'source[branch]=main' -f 'source[path]=/'`
- A custom domain would go in a `CNAME` file at the repo root plus the Pages settings.

The turn-based reference build at [`batch/index.html`](../batch/index.html) ships in the
same tree, reachable at `…/energy-game/batch/`.
