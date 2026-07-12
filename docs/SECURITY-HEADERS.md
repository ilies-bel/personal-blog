<!-- GENERATED FILE — do not edit the header values by hand.
     Regenerate with:  pnpm build && node scripts/gen-csp-hashes.mjs
     CI gate:          node scripts/gen-csp-hashes.mjs --check  (ci.yml)      -->

# Security headers — exact values + how to apply them

Generated 2026-07-12 by `scripts/gen-csp-hashes.mjs` from the built `dist/`.

GitHub Pages cannot set custom response headers, and this site is a static
build — so the real security headers are applied at the edge by **Cloudflare
Response Header Transform Rules** (the domain's DNS is already proxied through
Cloudflare). This file contains the exact values to paste. Applying them is a
dashboard action for the site owner — tracked as input #9 in
`docs/INPUTS-NEEDED.md`.

## The values

### Content-Security-Policy

```
default-src 'self'; script-src 'self' 'sha256-/hxIIQWyLcEtUD7MUq/0IQnSNRhkXZUa/EjOOcCaSTc=' 'sha256-3ae2aKZbrIMgCRPIThzuUlp0rcVILo8dJZk9o+M+yiI=' 'sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=' 'sha256-RTS1/UGQIM0gORRloMCDqwUBoXGwj9jRgu8/32H4jL0=' 'sha256-SaCkFfPruIdTXT8/97JArQmGxiJAL2o4bBDvSgJ5y3Q=' 'sha256-VP47XM8VZ7ZD7hE9ny6Gy36zHbTIS86OHxy/HVu0yEQ=' 'sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=' 'sha256-xTVqFR1HgrF6yrgUxov2eSyLUPUR8XgKtxNaQIaIi1c=' 'sha256-yxW6gZ01YVyHggX8EbobxkxNSB2HxPAwOxEgWM65aVk='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

### Strict-Transport-Security

```
max-age=31536000; includeSubDomains; preload
```

### X-Content-Type-Options

```
nosniff
```

### Referrer-Policy

```
strict-origin-when-cross-origin
```

### Permissions-Policy

```
camera=(), microphone=(), geolocation=(), interest-cohort=()
```

## What each inline-script hash is

Every inline executable `<script>` body in the built site is allowed by its
sha256 hash (never `'unsafe-inline'`). Non-executable script tags
(`application/ld+json` structured data) are data, not code — CSP does not
apply to them and they need no hash.

| Hash | Pages | Script (first 88 chars) |
|------|-------|--------------------------|
| `sha256-/hxIIQWyLcEtUD7MUq/0IQnSNRhkXZUa/EjOOcCaSTc=` | 10 | `document.addEventListener("astro:page-load",()=>{if(window.self!==window.top)return;cons…` |
| `sha256-3ae2aKZbrIMgCRPIThzuUlp0rcVILo8dJZk9o+M+yiI=` | 10 | `let e=!0;document.addEventListener("astro:page-load",()=>{if(window.self!==window.top)re…` |
| `sha256-Q2BPg90ZMplYY+FSdApNErhpWafg2hcRRbndmvxuL/Q=` | 2 | `(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value=="object"?i.v…` |
| `sha256-RTS1/UGQIM0gORRloMCDqwUBoXGwj9jRgu8/32H4jL0=` | 10 | `document.addEventListener("astro:before-swap",t=>{if(window.self!==window.top)return;t.n…` |
| `sha256-SaCkFfPruIdTXT8/97JArQmGxiJAL2o4bBDvSgJ5y3Q=` | 3 | `(()=>{var g=Object.defineProperty;var w=(c,s,d)=>s in c?g(c,s,{enumerable:!0,configurabl…` |
| `sha256-VP47XM8VZ7ZD7hE9ny6Gy36zHbTIS86OHxy/HVu0yEQ=` | 1 | `function n(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").r…` |
| `sha256-eIXWvAmxkr251LJZkjniEK5LcPF3NkapbJepohwYRIc=` | 2 | `(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.di…` |
| `sha256-xTVqFR1HgrF6yrgUxov2eSyLUPUR8XgKtxNaQIaIi1c=` | 10 | `document.documentElement.classList.add('js'); (function () { var motion = null; …` |
| `sha256-yxW6gZ01YVyHggX8EbobxkxNSB2HxPAwOxEgWM65aVk=` | 2 | `function u(){const a="hud-active",n="hud-booting",c="hud-shutting-down",i="hud-state",o=…` |

These bodies are: the pre-paint env-flags script (`BaseHead.astro` —
`html.js` + `data-motion`), and the small runtime scripts Astro inlines for
island hydration directives and the ClientRouter. **They change whenever the
pre-paint script is edited, Astro/Vite is upgraded, or an island directive is
added/removed** — see "Keeping this current" below.

## Why these directives

- `script-src 'self' + hashes` — bundled `/_astro/*.js` files are covered by
  `'self'`; each inline body by its hash. No `'unsafe-inline'`, no
  `'unsafe-eval'` (verified: nothing in the bundle uses eval/new Function at
  runtime, no workers, no inline event handlers).
- `style-src 'self' 'unsafe-inline'` — **deliberate**: `astro.config.mjs`
  sets `build.inlineStylesheets: 'always'` (each page carries its CSS as an
  inline `<style>` block for first-paint speed) and React islands set
  `style` attributes at runtime. Adding hashes for the `<style>` elements
  would *disable* `'unsafe-inline'` and break the attribute styles, so both
  remain allowed. Inline CSS is not an execution vector; the XSS-relevant
  directives (script/object/base) are strict.
- `img-src 'self' data:` — pages embed inline SVG grain/placeholder
  data-URIs.
- `connect-src 'self'` — ClientRouter page fetches + dynamic island chunks
  only. **If Cloudflare Web Analytics is ever enabled** (currently NOT — see
  `docs/ANALYTICS.md`), this and `script-src` need the additions listed
  there.
- `frame-ancestors 'none'` — the site never needs embedding; this supersedes
  `X-Frame-Options`.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests` — standard lockdown; the site has no plugins,
  no `<base>`, and only `mailto:`-style contact (no form posts).
- **HSTS preload caveat**: `preload` + `includeSubDomains` commits every
  future subdomain of ilies-bel.dev to HTTPS forever once submitted to
  `hstspreload.org`. Submission is optional and separate; the header alone is
  safe to apply now.

## How this policy was validated

The full policy above (including `script-src` with hashes) was verified
against the real build by injecting it as a meta tag into a copy of `dist/`
and driving every route headlessly — including a complete home-page scroll
through the WebGL lifecycle: **zero** `securitypolicyviolation` events and
zero console errors on all 10 pages. Re-run that probe after any large change
by repeating the injection trick, or simply watch the DevTools console on the
live site after applying the rule (step 7 below).

## How to apply (Cloudflare dashboard — owner action, INPUTS-NEEDED #9)

1. Log in to the Cloudflare dashboard and select the `ilies-bel.dev` zone.
2. Go to **Rules → Overview → Create rule → Response Header Transform Rule**
   (on older dashboards: Rules → Transform Rules → Modify Response Header).
3. Name it `security-headers`.
4. **When incoming requests match**: choose *All incoming requests*. (The
   headers are harmless on assets; scoping to HTML only would need a custom
   filter expression and gains little.)
5. **Then… Modify response header**: add five **"Set static"** operations, one
   per header above — header name exactly as written (e.g.
   `Content-Security-Policy`), value copied verbatim from the code blocks.
   The CSP value is one long single line — copy the whole block.
6. **Deploy** the rule.
7. Verify from a terminal:
   ```sh
   curl -sI https://ilies-bel.dev/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy'
   ```
   All five headers must appear. Then browse the site with DevTools open —
   the console must show **zero** CSP violation reports on /, a post page,
   and a full home-page scroll (the WebGL hero exercises every code path).
8. The scheduled prod-crawl workflow (`.github/workflows/prod-crawl.yml`)
   checks for these headers weekly and warns while they are missing.

## Limitations

- **GitHub Pages origin**: requests that bypass Cloudflare (direct to
  `ilies-bel.github.io`) do not get these headers. The custom domain is the
  only published entry point; the meta-CSP below is the backstop.
- **Meta-CSP (defense-in-depth in the HTML itself)**: `BaseHead.astro` ships
  a `<meta http-equiv="Content-Security-Policy">` with the subset of this
  policy that is (a) legal in a meta tag and (b) stable across builds:
  `object-src / base-uri / form-action / style-src / img-src / font-src /
  media-src / connect-src / upgrade-insecure-requests`. Two things are
  deliberately absent from it:
  - `frame-ancestors` — **ignored in meta CSP by spec**; it only works as a
    real response header (another reason the Cloudflare rule matters).
  - `script-src` (and therefore `default-src`) — the inline-script hashes
    only exist after the build bundles and minifies (Astro's island/router
    runtime scripts), so BaseHead cannot know them at render time. Hardcoding
    them would break on the next Astro upgrade; a meta `default-src 'self'`
    without hashes would block the site's own inline scripts. Script-src
    enforcement therefore lives ONLY in the edge header, where this generator
    keeps it current.
- **report-uri / report-to** are also not valid in meta CSP; if violation
  reporting is ever wanted, add it to the Cloudflare header value.

## Keeping this current

The CI gate `node scripts/gen-csp-hashes.mjs --check` (ci.yml, after the
build) fails when the hashes in this file no longer match the built dist —
i.e. whenever an inline script changed. When it fires:

```sh
pnpm build
node scripts/gen-csp-hashes.mjs   # rewrites this file
git add docs/SECURITY-HEADERS.md && git commit
```

…then **re-paste the new Content-Security-Policy value into the Cloudflare
rule** (step 5 above). Until the rule is updated, browsers will block the
changed inline script on the live site — treat a hash change as part of the
release checklist (docs/RUNBOOK.md).

Also verified by this pipeline: the production build emits **no source maps**
(`find dist -name '*.map'` is empty; Vite's default) — nothing to strip.
