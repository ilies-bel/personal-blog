# Analytics — NOT ENABLED (deliberate)

**Status: nothing loads in production.** The owner decided (program decision
#4) to ship without analytics: no tracking script, no cookies, no consent
banner needed. This file is the ready-to-wire stub so that decision can be
reversed in one small PR when field data becomes worth the trade-off — the
`/behind-the-build` telemetry page already says "field CWV pending RUM" and
renders lab numbers only until then.

Edge-side traffic numbers are available TODAY without any client JS: the
Cloudflare dashboard's zone Analytics (requests, bandwidth, status codes,
cache ratio) — use those for the post-launch monitoring checklist in
`docs/RUNBOOK.md`.

## Option A — Cloudflare Web Analytics (recommended if/when enabled)

Privacy-first (no cookies, no localStorage, no fingerprinting, no cross-site
tracking), free, and the DNS already lives at Cloudflare.

1. Cloudflare dashboard → **Analytics & Logs → Web Analytics → Add a site**
   → enter `ilies-bel.dev` → choose **manual snippet** (automatic injection
   requires proxied traffic to rewrite HTML; the manual snippet is
   deterministic and CSP-friendly).
2. Copy the token and paste the snippet into `src/layouts/BaseLayout.astro`,
   just before `</body>`:

```html
<!-- Cloudflare Web Analytics -->
<script
  defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_TOKEN_HERE"}'
></script>
<!-- End Cloudflare Web Analytics -->
```

3. **CSP additions (required)** — the shipped policy blocks this today.
   Regenerate nothing; edit the Cloudflare rule value from
   `docs/SECURITY-HEADERS.md` by extending two directives:

   - `script-src` … append ` https://static.cloudflareinsights.com`
   - `connect-src` … append ` https://cloudflareinsights.com`

   (The beacon script is an external `src`, so no inline hash is involved;
   the `gen-csp-hashes.mjs --check` gate is unaffected.)

4. SPA note: the site uses Astro's ClientRouter (view transitions). The CF
   beacon counts SPA navigations automatically via the History API; verify
   route-change counts in the dashboard after a day.

## Option B — web-vitals RUM (field Core Web Vitals only, no pageviews)

If the ONLY need is field CWV for `/behind-the-build` (LCP/INP/CLS from real
visitors instead of lab numbers), wire Google's `web-vitals` library to any
beacon endpoint (Cloudflare Worker + Analytics Engine is the natural
zero-infra pair with this stack):

```sh
pnpm add web-vitals
```

```ts
// src/scripts/rum.ts — loaded from BaseLayout with <script> (bundled, hashed
// files are covered by script-src 'self'; no CSP hash churn).
import { onLCP, onINP, onCLS } from 'web-vitals';

function send(metric: { name: string; value: number; id: string }) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    path: location.pathname,
  });
  // sendBeacon survives page unload; keepalive fetch is the fallback.
  navigator.sendBeacon?.('/rum', body) ??
    fetch('/rum', { body, method: 'POST', keepalive: true });
}

onLCP(send);
onINP(send);
onCLS(send);
```

- `/rum` would be a Cloudflare Worker route on the zone writing to Analytics
  Engine (or any collector). Same-origin path ⇒ **no CSP change needed**; a
  cross-origin collector needs its origin appended to `connect-src`.
- Once ~28 days of data exist, promote the "field CWV pending RUM" prose on
  `/behind-the-build` to real percentiles (P75) and consider hardening the
  Lighthouse LCP/TBT assertions (see `docs/roadmaps/acceptance-gates.md`).

## Privacy note (ready-to-publish copy, for /about or a /privacy page)

> **Privacy.** This site collects the minimum it can get away with: nothing.
> There are no ads, no cookies, no fingerprinting, and no third-party
> trackers. If measurement is ever added, it will be cookie-less, aggregate
> performance telemetry (how fast pages load for real visitors), never
> individual tracking — and this note will say exactly what is collected.

If Option A is enabled, replace the middle sentence with:

> Aggregate, cookie-less traffic and performance statistics are measured with
> Cloudflare Web Analytics, which uses no cookies, no localStorage and no
> fingerprinting, and cannot follow you across sites.

## Checklist when enabling (either option)

- [ ] Add the snippet/module (above) in one commit.
- [ ] Update the Cloudflare CSP rule (Option A) — BEFORE deploying, or the
      beacon is blocked and the console fills with violations.
- [ ] Publish the privacy note.
- [ ] Verify in DevTools: no CSP violations, beacon request 2xx.
- [ ] Update this file's status line and the monitoring section of
      `docs/RUNBOOK.md` (some manual checks become dashboard reads).
