# Deploying the blog

The site is a static Astro build published to **GitHub Pages** on the custom
apex domain <https://ilies-bel.dev> (Cloudflare handles DNS; `public/CNAME`
binds the domain on every deploy).

## How deploys are triggered

### Primary path — local deploy (`pnpm run deploy`)

The fastest way to ship is directly from your machine:

```sh
pnpm run deploy
```

This runs `scripts/deploy.mjs`, which:

1. Checks for a dirty working tree (commit or stash first; pass `--allow-dirty`
   to override).
2. Runs `pnpm run build` (astro build).
3. Runs the same two dist gates as the Actions workflow:
   `check-links.mjs` then `check-asset-sizes.mjs`.
4. Asserts `dist/CNAME` contains `ilies-bel.dev` (custom-domain guard) and
   `dist/index.html` exists and is non-empty.
5. Publishes `dist/` to the `gh-pages` branch via a temporary git worktree
   (the main checkout is never mutated). Creates `gh-pages` as an orphan
   branch on first run if it does not exist.
6. Prints the live URL on success.

**Dry run** — builds and runs all gates but does not push:

```sh
pnpm run deploy -- --dry-run
```

Prints the target branch, commit message, file count, and total dist size,
then exits 0. Safe to run anytime to verify the build is clean.

**Dirty-tree override** (skip the uncommitted-files check):

```sh
pnpm run deploy -- --allow-dirty
```

#### Pages source

The repository's GitHub Pages source **must be set to the `gh-pages` branch**
(not the legacy `workflow` / `actions-artifact` mode). The Actions `deploy` job
uses the `actions/upload-pages-artifact` + `actions/deploy-pages` stack, which
publishes from an artifact, not from a branch — the two methods are mutually
exclusive. Switch to branch mode once and `pnpm run deploy` owns all future
publishes.

```sh
# Check current Pages config
gh api repos/ilies-bel/personal-blog/pages --jq '.source'

# Switch to gh-pages branch (root folder)
gh api --method PUT repos/ilies-bel/personal-blog/pages \
  -f source[branch]=gh-pages -f source[path]=/
```

### GitHub Actions deploy (`.github/workflows/deploy.yml`)

The Actions workflow triggers on **every push to `main`** and on
`workflow_dispatch`. It is NOT tag-triggered. The workflow builds the site,
runs both dist gates, and uploads the artifact — but the `deploy` job requires
`needs: [build, e2e]`, so it is blocked whenever the e2e job fails. The
workflow remains in the repo as a regression signal; it is not currently the
active publishing path.

To manually trigger it without a push:

- **GitHub UI:** Actions → *Deploy to GitHub Pages* → **Run workflow**.
- **CLI:** `gh workflow run deploy.yml`

## One-time repo setup (already done)

These are configured on the repository; recorded here so they can be restored if
the repo is ever recreated.

- **Pages build type must be `workflow`**, not `legacy`. Legacy mode serves the
  raw repo root (Jekyll-style) and ignores the Actions build entirely, so the
  Astro output never ships. Verify / fix with:

  ```sh
  gh api repos/ilies-bel/personal-blog/pages --jq .build_type   # -> "workflow"
  gh api --method PUT repos/ilies-bel/personal-blog/pages -f build_type=workflow
  ```

- **Custom domain**: `ilies-bel.dev` is set as the Pages custom domain (with
  *Enforce HTTPS* on) and `public/CNAME` contains the same value so a deploy
  can never unbind it. DNS lives at Cloudflare: apex A/AAAA records to GitHub
  Pages' IPs, `www` CNAME to `ilies-bel.github.io`.

## The workflow, in short

`.github/workflows/deploy.yml`:

1. **Setup pnpm** (`pnpm/action-setup`) — this repo is pnpm, not npm. The
   lockfile is `pnpm-lock.yaml`; there is no `package-lock.json`.
2. **Setup Node 22** with `cache: pnpm`.
3. `pnpm install --frozen-lockfile`
4. `pnpm run build` → emits `dist/`.
5. Upload `dist/` as a Pages artifact and deploy it.

> **pnpm, not npm.** An earlier version of this workflow used `cache: npm` +
> `npm ci`, which fails on this repo — there is no `package-lock.json`, so the
> npm cache step errors with *"Dependencies lock file is not found"*. Keep the
> pnpm steps.

## URLs and base path

`astro.config.mjs` sets `site: 'https://ilies-bel.dev'` and `base: '/'` because
the site lives at the root of a custom domain. Links, the sitemap, canonical
URLs, and icon hrefs (via `withBase()` in `src/consts.ts`) all follow from
those two values.

> **History:** this used to be a *project page* at
> `https://ilies-bel.github.io/personal-blog/` with `base: '/personal-blog'`.
> If you ever see that base path in docs, configs, or scripts, it is stale —
> `playwright.config.ts` and this file carried it for a while after the move.

## Staging (recommendation — owner-actioned, not yet set up)

There is currently no staging environment: tags deploy straight to
production. The recommended staging setup is **Cloudflare Pages preview
deployments** — the DNS already lives at Cloudflare, previews are free, and
each one gets an isolated URL with production-like edge behaviour (including
the Response Header Transform rules if scoped to the zone). Outline
(dashboard actions, tracked as part of `docs/INPUTS-NEEDED.md` #9):

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to
   Git** → select the `personal-blog` repo.
2. Build settings: framework preset **Astro**, build command `pnpm build`,
   output directory `dist`, environment variable `NODE_VERSION=22` (and
   nothing else — the build is self-contained).
3. **Production branch**: set it to a branch that never advances (e.g. a
   dedicated `cf-pages-prod` placeholder) so Cloudflare Pages never competes
   with GitHub Pages for "production" — you only want the *preview*
   deployments, one per pushed branch/PR, at
   `https://<hash>.<project>.pages.dev`.
4. Review flow: push a branch → CI runs the gates → open the Pages preview
   URL for visual/manual review on real devices → merge → cut a tag when
   ready (production deploy stays the tag-triggered GitHub Pages workflow).
5. Caveats: preview URLs run under `*.pages.dev` (not the custom domain), so
   absolute-URL features (canonical, OG images, JSON-LD `@id`s) will point at
   production — correct for review purposes, just don't index previews
   (Cloudflare Pages sends `X-Robots-Tag: noindex` on previews by default).
   The security headers from `docs/SECURITY-HEADERS.md` are zone-scoped
   transform rules and do NOT apply on `pages.dev`; header verification
   happens against production (the weekly prod-crawl workflow).

## Watching a deploy

```sh
gh run list  --repo ilies-bel/personal-blog --workflow deploy.yml --limit 5
gh run watch <run-id> --repo ilies-bel/personal-blog
```
