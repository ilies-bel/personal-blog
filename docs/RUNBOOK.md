# Operations runbook — ilies-bel.dev

Rollback, incident triage, release discipline, and archival for the static
Astro site on GitHub Pages (Cloudflare DNS in front). Companion docs:
`docs/DEPLOY.md` (how deploys work), `docs/SECURITY-HEADERS.md` (edge
headers), `docs/roadmaps/acceptance-gates.md` (the release gates).

## Rollback

Deploys are tag-triggered and build from the tag's exact tree, so every
published build is reproducible: **rolling back = re-running the deploy
workflow on the previous good tag.** No revert commit needed to get the site
healthy; fix forward on `main` afterwards.

```sh
# 1. find the previous good tag (deploys only run on v* tags)
git tag --sort=-creatordate | head -5

# 2. re-run the deploy workflow ON THAT TAG
gh workflow run deploy.yml --repo ilies-bel/personal-blog --ref v1.2.3

# 3. watch it land
gh run list  --repo ilies-bel/personal-blog --workflow deploy.yml --limit 3
gh run watch <run-id> --repo ilies-bel/personal-blog

# 4. verify the live site (Cloudflare may serve cached HTML briefly;
#    purge in the dashboard — Caching → Configuration → Purge Everything —
#    if the old build lingers)
curl -s https://ilies-bel.dev/ | grep -o '<title>[^<]*'
```

Alternative when the bad deploy came from a workflow_dispatch (no tag): find
the last green deploy run and re-run it as-is:

```sh
gh run list --repo ilies-bel/personal-blog --workflow deploy.yml --status success --limit 5
gh run rerun <good-run-id> --repo ilies-bel/personal-blog
```

**Rehearsal**: once a real remote/first deploy exists, run one deliberate
rollback (deploy tag N, then re-run tag N−1, verify content flipped back)
so the first real incident isn't the first rehearsal.

## Incident quick-checks

Work outside-in; each step isolates a layer.

1. **Is it just you?** `curl -sI https://ilies-bel.dev/` from another network
   or https://downforeveryoneorjustme.com.
2. **GitHub Pages status**: https://www.githubstatus.com (Pages component),
   and the repo's Pages state:
   `gh api repos/ilies-bel/personal-blog/pages --jq '{status, build_type, cname: .cname, https: .https_enforced}'`
   — `status` should be `built`, `build_type` `workflow`, cname
   `ilies-bel.dev`, https_enforced `true`.
3. **DNS (Cloudflare)**: apex A/AAAA must point at GitHub Pages' IPs, `www`
   CNAME at `ilies-bel.github.io`:
   ```sh
   dig +short ilies-bel.dev A
   dig +short ilies-bel.dev AAAA
   dig +short www.ilies-bel.dev CNAME
   ```
   GitHub Pages IPv4s are 185.199.108.153 / .109. / .110. / .111.
4. **Certificate**: `curl -svI https://ilies-bel.dev/ 2>&1 | grep -iE 'subject|expire'`
   — a cert error usually means Cloudflare SSL mode or the Pages cert
   renewal; check Cloudflare SSL/TLS mode is "Full" and the Pages custom
   domain still shows "Enforce HTTPS" checked.
5. **Origin vs edge**: if `https://ilies-bel.github.io` serves fine but the
   apex doesn't, the problem is Cloudflare (DNS/proxy/rules); if both fail,
   it's Pages/deploy.
6. **Last deploy**: `gh run list --repo ilies-bel/personal-blog --workflow deploy.yml --limit 3`
   — a red run means the site is still the previous build (Pages keeps
   serving the last successful artifact; that is usually fine, not an outage).
7. The weekly **prod-crawl** workflow (`.github/workflows/prod-crawl.yml`)
   runs these checks automatically; its last run is a quick health snapshot:
   `gh run list --repo ilies-bel/personal-blog --workflow prod-crawl.yml --limit 1`.

## Release procedure (submission builds)

The Awwwards submission build is a release like any other, plus a freeze
schedule counted back from the **submission date (T)**:

| Deadline | Freeze | Meaning |
|----------|--------|---------|
| T−14 days | **Content freeze** | Copy, projects, articles, images final. Only defect fixes to content after this. |
| T−7 days | **Feature freeze** | No new features/routes/scenes. Polish, tuning and bug fixes only. |
| T−3 days | **Code freeze** | Only release-blocking fixes, each re-running the full gate suite. The judged tag is cut from this frozen state. |

**Release-candidate checklist** (every RC, from
`docs/roadmaps/acceptance-gates.md` — the standing per-commit gates plus the
phase-exit criteria):

1. `pnpm build && pnpm check && pnpm test && pnpm knip`
2. `node scripts/check-links.mjs dist && node scripts/check-asset-sizes.mjs dist && node scripts/check-bundle-budgets.mjs dist && node scripts/gen-perf-report.mjs --check dist && node scripts/gen-csp-hashes.mjs --check dist && node scripts/optimize-public-images.mjs --check && node scripts/check-figure-staleness.mjs`
3. `npx html-validate "dist/**/*.html"`
4. Full Playwright matrix green (all projects in CI; chromium + mobile-chrome
   locally).
5. Perf report regenerated if what ships changed:
   `pnpm build && node scripts/gen-perf-report.mjs && pnpm build`, commit.
6. If the CSP staleness gate fired: regenerate `docs/SECURITY-HEADERS.md` and
   **re-paste the CSP into the Cloudflare rule** before tagging.
7. Manual pass: home scroll on a real device, one article, 404, no-JS.

**Three-clean-RC rule**: the submission tag may only be cut after **three
consecutive release candidates pass the full checklist with zero fixes in
between** (a fix resets the count to zero — RC-(n+1) starts over). Each RC is
a tag (`v2.0.0-rc1`, `-rc2`, `-rc3`); the dossier for each lives in
`docs/rc/` (created at P14 with the RC template).

## Post-launch monitoring (first 48 h, manual — no analytics by design)

There is deliberately no RUM/analytics (`docs/ANALYTICS.md`), so the first
48 hours after a deploy are watched by hand. Checklist, at deploy + 1 h,
+ 12 h, + 24 h, + 48 h:

- [ ] `curl -sI https://ilies-bel.dev/` → `HTTP/2 200`, security headers
      present (`grep -i content-security-policy`).
- [ ] Home page full scroll in a real browser, DevTools console open:
      zero errors, zero CSP violations.
- [ ] One article + /projects + /404 spot-check (styles, images, fonts load).
- [ ] `https://ilies-bel.dev/sitemap-index.xml` reachable.
- [ ] Manually trigger the prod crawl and read its summary:
      `gh workflow run prod-crawl.yml --repo ilies-bel/personal-blog`
- [ ] Search Console (if connected): no new coverage/CWV alerts.
- [ ] Cloudflare dashboard → Analytics (edge-side, no client JS needed):
      traffic is being served, no error-rate spike, cache hit ratio sane.

Anything red → the Rollback section above.

## Archive procedure (the judged build)

When the submission tag is final, freeze a self-contained archive of exactly
what the jury sees — the site can keep evolving afterwards without destroying
the evidence.

```sh
TAG=v2.0.0            # the judged tag
git archive --format=tar.gz -o archive/site-$TAG-src.tar.gz $TAG

# the built artifact, from that exact tree
git -c advice.detachedHead=false checkout $TAG
pnpm install --frozen-lockfile && pnpm build
tar -czf archive/site-$TAG-dist.tar.gz dist
git checkout -
```

Plus the **capture set** (stored alongside, not in the repo):

- the submission stills/reel produced by the P12 capture tooling
  (`scripts/shoot-submission.mjs`, `scripts/record-reel.mjs`),
- a full-page screenshot of every route at 1920×1080 and 390×844,
- the RC dossier (`docs/rc/`) and the commit SHA the tag points at
  (`git rev-list -n1 $TAG`),
- a copy of `docs/SECURITY-HEADERS.md` + a `curl -sI` header dump of the live
  site on submission day (proves what actually shipped at the edge).

Store the archive off-repo (release asset on the GitHub release for the tag
is the natural place: `gh release create $TAG archive/site-$TAG-*.tar.gz`).
