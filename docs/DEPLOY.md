# Deploying the blog

The site is a static Astro build published to **GitHub Pages** on the custom
apex domain <https://ilies-bel.dev> (Cloudflare handles DNS; `public/CNAME`
binds the domain on every deploy).

## How deploys are triggered

Deploys run on **version tags only** — not on every push to `main`.

Pushing commits to `main` no longer spends CI minutes or republishes the site.
A deploy is a deliberate act: you cut a tag when you want the current `main` to
go live.

```sh
# 1. make sure main is up to date and pushed
git push origin main

# 2. cut a version tag and push it — this triggers the deploy
git tag v1.0.0
git push origin v1.0.0
```

Any tag matching `v*` (`v1.0.0`, `v2`, `v1.2.3-rc1`, …) fires the
`.github/workflows/deploy.yml` workflow, which builds with Astro and publishes
`dist/` to Pages.

Because deploys are tag-triggered, every published build is **immutable and
re-runnable**: rolling back means re-running the deploy workflow on the
previous good tag (see `docs/RUNBOOK.md`).

### Manual deploy (no tag)

The workflow also has `workflow_dispatch`, so you can deploy the current default
branch without cutting a tag:

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

## Watching a deploy

```sh
gh run list  --repo ilies-bel/personal-blog --workflow deploy.yml --limit 5
gh run watch <run-id> --repo ilies-bel/personal-blog
```
