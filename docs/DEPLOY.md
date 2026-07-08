# Deploying the blog

The site is a static Astro build published to **GitHub Pages** at
<https://ilies-bel.github.io/personal-blog/>.

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

`astro.config.mjs` sets `base: '/personal-blog'` and
`site: 'https://ilies-bel.github.io'` because this is a **project page**. If the
site ever moves to a user page (`https://ilies-bel.github.io`) or a custom
domain, set `base` to `'/'` and update `site` — links, sitemap, and canonical
URLs all follow from those two values.

## Watching a deploy

```sh
gh run list  --repo ilies-bel/personal-blog --workflow deploy.yml --limit 5
gh run watch <run-id> --repo ilies-bel/personal-blog
```
