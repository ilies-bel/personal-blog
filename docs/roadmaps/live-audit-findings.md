# Live Audit Findings — ilies-bel.dev

**Audit date:** 2026-07-10  
**Auditor:** Automated adversarial crawl (Claude agent)  
**Method:** curl requests against production; Python HTML analysis of downloaded pages; header inspection with and without Accept-Encoding negotiation. Read-only toward production — no changes made.  
**Scope:** All public routes, HTTP headers (security, caching, compression), favicon set, RSS/feed discovery, sitemap, structured data, OG/Twitter cards, print stylesheets, third-party requests, inline asset strategy, and deployment platform constraints. Two pre-verified facts excluded per brief: /dev-blueprint returns 404; unknown paths return 404.

---

## Priority legend (inherits from soty-readiness-backlog.md)

| Priority | Meaning |
|---|---|
| P0 | Submission blocker — failure makes the judged experience unavailable, misleading, legally unsafe, inaccessible, or operationally fragile. |
| P1 | Required for a credible SOTY campaign. May not block a basic launch, but blocks award submission. |
| P2 | Competitive leverage after the core campaign is sound. Must not displace unresolved P0/P1 work. |
| P3 | Optional amplification or post-award investment. |

---

## AUDIT-01 — Protocol-relative double-slash favicon URLs render all icon links broken

**Severity:** P0  
**Backlog extension:** Extends ENG-002 ("Stable icon and resource URL resolution") — ENG-002's exit criterion requires "zero 404s" but does not surface the root-cause mechanism identified here.  
**Status:** NEW finding

### Evidence

All eight `<link rel="icon">` and `<link rel="apple-touch-icon">` elements in every page use protocol-relative `//` paths instead of root-relative `/` paths:

```html
<!-- Actual production output (ilies-bel.dev, 2026-07-10) -->
<link rel="icon" type="image/svg+xml" href="//favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: light)" href="//favicon-32x32.png">
<link rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: dark)" href="//favicon-32x32-dark.png">
<link rel="icon" type="image/png" sizes="16x16" media="(prefers-color-scheme: light)" href="//favicon-16x16.png">
<link rel="icon" type="image/png" sizes="16x16" media="(prefers-color-scheme: dark)" href="//favicon-16x16-dark.png">
<link rel="icon" href="//favicon.ico" sizes="any">
<link rel="apple-touch-icon" sizes="180x180" media="(prefers-color-scheme: light)" href="//apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="180x180" media="(prefers-color-scheme: dark)" href="//apple-touch-icon-dark.png">
```

A URL starting with `//` is a [protocol-relative URL](https://url.spec.whatwg.org/#concept-url-parser). The browser treats everything after `//` and before the next `/` as the hostname. Because there is no `/` after the filename, the browser interprets `//favicon.svg` as `https://favicon.svg/` (treating `favicon.svg` as the hostname). This domain does not exist:

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" "https://favicon.svg/"
HTTP 000   # connection refused — no such host
```

The files exist at the correct root paths:
```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/favicon.svg
HTTP 200
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/favicon.ico
HTTP 200
```

**Root cause (source-code level):** `src/components/BaseHead.astro` uses:
```astro
href={`${import.meta.env.BASE_URL}/favicon.svg`}
```
When `base: '/'` in `astro.config.mjs`, Astro sets `BASE_URL = "/"`. The template then produces `"/" + "/favicon.svg"` = `"//favicon.svg"`. The fix is either:
- Drop the leading slash from the template: `href={`${import.meta.env.BASE_URL}favicon.svg`}`
- Or use hard-coded root paths: `href="/favicon.svg"`

**Impact:** All `<link rel="icon">` programmatic hints fail in every browser. The only reason any favicon shows at all is that browsers also check `/favicon.ico` by browser convention (not via the broken link tag). Consequences:
- Dark/light favicon variants never load (light favicon always displayed regardless of `prefers-color-scheme`)
- `apple-touch-icon` installation for "Add to Home Screen" silently fails
- Tab icons and bookmark icons are wrong in any browser that respects link tags before fallback discovery
- ENG-002's HAR evidence will record 0-byte responses to `https://favicon.svg/` rather than valid icon loads

### Proposed task

Tighten `BaseHead.astro` favicon href template to not emit a leading slash when `BASE_URL` already ends with one. Add a production network check in the E2E suite that asserts all `<link rel="icon" href>` values resolve to HTTP 200 on the canonical host (not just file-existence in the build output). Severity: P0 because incorrect favicons appear in every juror's browser tab and on bookmark cards, directly impaging the judged experience.

---

## AUDIT-02 — Zero HTTP security headers on production

**Severity:** P1  
**Backlog extension:** Extends REL-001 ("Production platform certification covering … TLS/headers pass") — REL-001 mentions headers in passing but does not enumerate them or establish the current baseline as zero.  
**Status:** NEW finding (evidence baseline for REL-001)

### Evidence

Request to `https://ilies-bel.dev/` with and without `Accept-Encoding: gzip` (2026-07-10):

```
HTTP/2 200
server: GitHub.com
content-type: text/html; charset=utf-8
cache-control: max-age=600
vary: Accept-Encoding
# — all other response headers —
# ABSENT: Strict-Transport-Security
# ABSENT: Content-Security-Policy
# ABSENT: X-Content-Type-Options
# ABSENT: X-Frame-Options
# ABSENT: Referrer-Policy
# ABSENT: Permissions-Policy
# ABSENT: Cross-Origin-Opener-Policy
# ABSENT: Cross-Origin-Resource-Policy
```

Confirmed via grep: `curl -s -D - https://ilies-bel.dev/ -o /dev/null | grep -iE "strict-transport|content-security|x-content-type|x-frame|referrer|permissions"` returns no output.

**Impact by missing header:**
- **HSTS absent** — no downgrade protection; a network-path attacker can strip HTTPS on first connection before HSTS preload takes effect.
- **CSP absent** — any XSS vector (injected ad, supply-chain compromise, browser extension bypass) has unrestricted script/style execution scope.
- **X-Content-Type-Options absent** — MIME-type sniffing enabled; browsers may interpret a crafted response as executable.
- **X-Frame-Options / CSP frame-ancestors absent** — site can be framed for clickjacking.
- **Referrer-Policy absent** — full canonical URL (including hash fragments) leaks to outbound links (GitHub, X/Twitter) as `Referer` header.
- **Permissions-Policy absent** — no restriction on camera/microphone/geolocation access for injected third-party content.

**Root cause:** GitHub Pages does not support per-repository HTTP response header configuration. All header injection requires either (a) a reverse-proxy layer (Cloudflare, Fastly) or (b) migration to a platform that supports custom headers (Netlify, Vercel, Cloudflare Pages). This is an architectural constraint, not a code bug.

### Proposed task

Create a deployment-platform evaluation task (NEW, blocking REL-001) that compares GitHub Pages against Netlify/Vercel/Cloudflare Pages on: custom header support, Brotli compression, per-filetype Cache-Control, HSTS preload eligibility, preview deploy URLs, and cost at current traffic. Surface a recommendation and migration plan as input to the release certification phase. Until migration, document the specific header gap in the REL-001 evidence artifact so jurors reviewing the technical discipline find an honest assessment rather than a gap.

---

## AUDIT-03 — GitHub Pages forces max-age=600 on ALL assets, defeating content-hash caching

**Severity:** P1  
**Backlog extension:** Extends PERF-013 ("CSS, font, and HTML delivery budgets") and REL-001 ("CDN/cache" in production certification) — neither task records the platform-imposed caching ceiling.  
**Status:** NEW finding

### Evidence

Content-hashed assets — whose URLs change on every content edit and therefore SHOULD be served with long-term immutable caching — are served with only 10-minute TTL:

```
# Woff2 font (hashed filename)
$ curl -s -I https://ilies-bel.dev/_astro/space-grotesk-latin.DPT1xrvW.woff2
cache-control: max-age=600
expires: Fri, 10 Jul 2026 12:21:42 GMT
content-length: 22320

# JS chunk (hashed filename)
$ curl -s -I https://ilies-bel.dev/_astro/index.astro_astro_type_script_index_0_lang.CFmhruxA.js
cache-control: max-age=600

# Static PNG image
$ curl -s -I https://ilies-bel.dev/og-default.png
cache-control: max-age=600

# HTML (expected short TTL — correctly 600s)
$ curl -s -I https://ilies-bel.dev/
cache-control: max-age=600
```

The correct cache policy for content-hashed assets is `Cache-Control: public, max-age=31536000, immutable` (1 year). GitHub Pages applies a blanket `max-age=600` to every file regardless of URL pattern. This cannot be overridden through repository configuration.

**Impact:**
- Returning visitors after 10 minutes re-download 2 WOFF2 fonts (~44 KB total), all JS chunks, and all images
- Repeat-visit LCP and TBT are effectively cold-cache every session
- The inlineStylesheets trade-off (CSS bundled into HTML to save one round-trip) is rendered moot because hashed fonts still trigger network fetches
- PERF-008 field CWV targets (LCP ≤2.5 s p75, TBT ≤200 ms) become harder to sustain without immutable caching

**Root cause:** GitHub Pages platform constraint — identical to AUDIT-02's root cause. Same migration to a CDN-capable host would resolve both.

### Proposed task

Document this constraint explicitly as a blocker for PERF-013 and PERF-008, and include it in the deployment-platform evaluation recommended in AUDIT-02. Add a CI step that checks `Cache-Control` headers on hashed asset URLs after deployment so the constraint is visible and not silently accepted as "correct behaviour."

---

## AUDIT-04 — No RSS or Atom feed; no autodiscovery link in head

**Severity:** P1  
**Backlog extension:** NEW — not covered by any existing backlog task.  
**Status:** NEW finding

### Evidence

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/rss.xml
HTTP 404
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/feed.xml
HTTP 404
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/atom.xml
HTTP 404
```

No `<link rel="alternate" type="application/rss+xml">` or `<link rel="alternate" type="application/atom+xml">` tags are present in any page `<head>`. The two published posts are discoverable only through `/writing/`. RSS autodiscovery is a browser and feed-reader convention relied upon by the developer community most likely to be in the Awwwards jury pool.

**Impact:** Technical readers using feed readers (Feedly, NetNewsWire, etc.) cannot subscribe. Developer-community engagement — a factor in SOTD voting — is reduced when there is no subscribe-in-feed-reader path. `@astrojs/rss` can generate a feed from existing content collections in one integration file.

### Proposed task

Implement RSS feed at `/rss.xml` via `@astrojs/rss`, including all published posts with `title`, `pubDate`, `description`, and `link`. Add `<link rel="alternate" type="application/rss+xml" title="Iliès — Writing" href="/rss.xml">` to `BaseHead.astro`. Validate the feed with the W3C Feed Validator. Severity P1 because it is a standard expectation for a technical writing section and signals content maturity to developer jurors.

---

## AUDIT-05 — No web app manifest; icon-192.png referenced by nothing and not declared

**Severity:** P2  
**Backlog extension:** NEW — not covered by any existing backlog task.  
**Status:** NEW finding

### Evidence

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/site.webmanifest
HTTP 404
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/manifest.json
HTTP 404
```

No `<link rel="manifest">` in any page `<head>`. The file `public/icon-512.png` exists and `icon-512-dark.png` exists, and `icon-192.png` returns 404:

```
$ curl -s -o /dev/null -w "HTTP %{http_code} size=%{size_download}\n" https://ilies-bel.dev/icon-192.png
HTTP 404 size=9379
```

**Impact:**
- Chrome on Android cannot prompt "Add to Home Screen" with the correct name, icon, and theme colour
- The `theme-color` meta (`#0a1017`) declared in HTML is redundant without a manifest to reinforce it
- PWA installability criteria are unmet (manifest is a hard requirement)
- Without a 192×192 icon declared in a manifest, Android/Chrome uses the apple-touch-icon as fallback (which itself fails due to AUDIT-01)

### Proposed task

Create `public/site.webmanifest` with `name`, `short_name`, `start_url`, `display: "browser"`, `background_color`, `theme_color`, and two icon entries (192×192 and 512×512). Add `<link rel="manifest" href="/site.webmanifest">` to `BaseHead.astro`. Generate the missing `icon-192.png` from existing assets. This is a one-hour task that closes a visible gap for any mobile-first juror.

---

## AUDIT-06 — All internal navigation links lack trailing slash, triggering a 301 redirect on every click

**Severity:** P2  
**Backlog extension:** Extends ENG-009 ("Complete per-route metadata") — partial overlap, but ENG-009 does not audit link-level redirect chains.  
**Status:** NEW finding

### Evidence

The homepage DOM emits non-trailing-slash links for every canonical destination:

```html
<!-- Actual navigation links in production (2026-07-10) -->
<a href="/projects">…</a>
<a href="/writing">…</a>
<a href="/about">…</a>
<a href="/graveyard">…</a>
<a href="/behind-the-build">…</a>
```

Each triggers a 301 redirect before serving the destination:

```
GET /projects     HTTP 301 → Location: /projects/    → HTTP 200
GET /writing      HTTP 301 → Location: /writing/     → HTTP 200
GET /about        HTTP 301 → Location: /about/       → HTTP 200
GET /graveyard    HTTP 301 → Location: /graveyard/   → HTTP 200
GET /behind-the-build  HTTP 301 → Location: /behind-the-build/  → HTTP 200
```

The sitemap correctly uses trailing-slash URLs (`/projects/`, `/about/`, etc.). `astro.config.mjs` sets `trailingSlash: 'ignore'`; switching to `'always'` or fixing the nav link templates would align link href values with the canonical form and eliminate the redirect round-trip.

**Impact per redirect:**
- ~100 ms extra RTT on first navigation (before keep-alive eliminates connection overhead)
- `Referer` header on the 301 response leaks the originating URL to the redirect target's server log
- Search engine crawl budget is wasted on redundant redirect hops
- SPA navigation via Astro View Transitions still triggers a full fetch on redirect, breaking smooth transitions

### Proposed task

Audit every `<a href>` in navigation templates (`BaseLayout.astro`, `SiteNav`, footer links) and update them to use trailing-slash paths matching the sitemap canonical form, OR change `trailingSlash: 'always'` in `astro.config.mjs` so Astro's link helper automatically appends slashes. Add an E2E assertion that confirms no navigation link from any page produces a 3xx response.

---

## AUDIT-07 — Default OG image is 312 KB; missing og:image:width and og:image:height

**Severity:** P2  
**Backlog extension:** Partially extends EXP-052 ("Route-specific OG cards" — P2) and PERF-004 ("Responsive Golden Record media set") — neither task addresses the weight of the shared default image.  
**Status:** NEW finding (distinct from EXP-052 which is about per-route uniqueness, not weight)

### Evidence

```
$ curl -s -o /dev/null -w "size=%{size_download}\n" https://ilies-bel.dev/og-default.png
size=319635
```

Dimensions (PNG header parse): **1200×630 px**, file size **~312 KB**.

All routes — homepage, both blog posts, projects, writing, about, behind-the-build, graveyard — serve the same `og-default.png`:

```html
<meta property="og:image" content="https://ilies-bel.dev/og-default.png">
```

No `og:image:width` or `og:image:height` tags are present on any route:

```
$ grep -c "og:image:width" /tmp/homepage.html
0
$ grep -c "og:image:height" /tmp/homepage.html  
0
```

**Impact:**
- Facebook's crawler must download and decode the full 312 KB PNG to determine dimensions before it can validate the card; images above 200 KB are sometimes downscaled, causing fuzzy previews
- LinkedIn limits OG images to 5 MB but recommends ≤8 MB; however images below 200 KB load perceptibly faster in feed previews
- Without `og:image:width` / `og:image:height`, every social crawler that encounters the card must open an additional connection to the image to compute its aspect ratio
- The same unbranded placeholder appears on all shared links, providing zero differentiation across the writing and project portfolio

### Proposed task

Compress `og-default.png` to a ≤120 KB AVIF or WebP (or aggressive PNG optimization via `optipng`/`pngquant`) and confirm the result still passes Facebook's Open Graph debugger. Add `og:image:width` (1200) and `og:image:height` (630) to all routes in `BaseHead.astro`. This unblocks the path to per-route OG images (EXP-052) by first cleaning up the shared baseline.

---

## AUDIT-08 — Homepage `<title>` is six characters; insufficient for search and share context

**Severity:** P2  
**Backlog extension:** Extends ENG-009 ("Unique title … validates on every route") — ENG-009 requires uniqueness but does not set a descriptor-completeness threshold.  
**Status:** NEW finding

### Evidence

```
$ python3 -c "
import re
with open('/tmp/homepage.html') as f: html = f.read()
title = re.search(r'<title[^>]*>(.*?)</title>', html)
print(title.group(1))
"
Iliès
```

Six characters. Other routes carry descriptive suffixes (`Projects · Iliès`, `Writing · Iliès`, `Behind the Build · Iliès`) but the homepage itself provides no role, specialty, or value proposition.

**Impact:**
- Search result snippets show "Iliès" alone — zero signal about what the site does or who it is for
- When shared as a bare link (Slack, Notion, Discord), the link preview title gives no context
- For an SOTD juror arriving via a private or incognito session, the first five seconds of tab context are blank

### Proposed task

Update the homepage `<title>` to include a brief descriptor, e.g. "Iliès — Creative Developer" or "Iliès · From supernova to pale blue dot" (the brand metaphor). Keep it ≤60 characters for full display in Google SERPs. The OG/Twitter `content` attributes should be updated to match. Update ENG-009's exit criteria to include a minimum-descriptor check alongside uniqueness.

---

## AUDIT-09 — No print stylesheet on any route

**Severity:** P2  
**Backlog extension:** NEW — not covered by any existing backlog task.  
**Status:** NEW finding

### Evidence

```
$ python3 -c "
import re
with open('/tmp/homepage.html') as f: html = f.read()
styles = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
all_css = ''.join(styles)
print(all_css.count('@media print'))
"
0
```

No `@media print` CSS exists in the 110 KB of inlined styles. The same check against the memory-leak article page returns 0. No `<link media="print">` references exist either.

**Impact:**
- The 5,000+ word "Memory Leak: Search and Destroy" article will print with dark backgrounds wasting toner, invisible text (white-on-dark), and navigation chrome cluttering every printed page
- Readers who save articles to PDF for later reading get the full night-mode layout rendered literally
- Print is an expected affordance for long-form technical writing and signals content maturity to developer jurors

### Proposed task

Add a `@media print` block to the global stylesheet covering: `background: white; color: black` on body/article; `display: none` on navigation, hero, footer, and interactive controls; `font-size: 12pt; line-height: 1.5` on body copy; `page-break-inside: avoid` on code blocks and figures. Test with Chrome's Print Preview and Firefox's Print Preview before closing the task.

---

## AUDIT-10 — Twitter/X cards lack `twitter:site` and `twitter:creator` attribution

**Severity:** P2  
**Backlog extension:** Extends ENG-009 ("OG/Twitter metadata validates on every route") — ENG-009 does not enumerate which Twitter card fields are required.  
**Status:** NEW finding

### Evidence

```html
<!-- Production Twitter card (2026-07-10) -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Iliès">
<meta name="twitter:description" content="Technical writing on web development, tooling, and software craft…">
<meta name="twitter:image" content="https://ilies-bel.dev/og-default.png">
<!-- ABSENT: twitter:site -->
<!-- ABSENT: twitter:creator -->
```

The account `@ilies_without_y` is linked in navigation but not surfaced in card metadata.

**Impact:**
- When articles are shared on X/Twitter, no account attribution appears on the card — jurors and readers cannot follow or mention the account from the preview alone
- X's card validator flags `twitter:creator` as recommended for article cards
- Missing attribution breaks the campaign outreach loop: if a juror shares a link, their followers see no creator attribution

### Proposed task

Add `<meta name="twitter:site" content="@ilies_without_y">` and `<meta name="twitter:creator" content="@ilies_without_y">` to `BaseHead.astro`. Validate with the [Card Validator](https://cards-dev.twitter.com/validator). Update ENG-009 exit criteria to explicitly include `twitter:site` and `twitter:creator`.

---

## AUDIT-11 — Brotli compression not served by GitHub Pages

**Severity:** P2  
**Backlog extension:** Extends PERF-013 (delivery budgets) and REL-001 — neither documents Brotli availability.  
**Status:** NEW finding

### Evidence

```
$ curl -s -I -H "Accept-Encoding: br" https://ilies-bel.dev/ | grep -i content-encoding
content-encoding: gzip
$ curl -s -I -H "Accept-Encoding: br, gzip" https://ilies-bel.dev/ | grep -i content-encoding
content-encoding: gzip
```

When a browser sends `Accept-Encoding: br` (which all modern browsers do), GitHub Pages falls back to gzip. The inline CSS block (110 KB raw) compresses to ~30 KB gzip and would reach ~24–26 KB with Brotli (15–20% gain). The same ratio applies to all JS and font assets.

**Impact:** Every visitor on a modern browser pays a ~15% compression tax on text assets relative to what a Brotli-capable CDN would serve. This compounds with the caching problem identified in AUDIT-03 — assets are both under-cached and under-compressed.

### Proposed task

Include Brotli support in the deployment-platform evaluation recommended in AUDIT-02. If Cloudflare is added as a proxy layer (even without migrating from GitHub Pages for origin), Cloudflare's edge automatically serves Brotli to capable clients. Document the Brotli gap explicitly in PERF-013 and PERF-008 evidence artifacts.

---

## AUDIT-12 — `meta name="generator"` exposes Astro version in every production response

**Severity:** P3  
**Backlog extension:** NEW — not covered by any existing backlog task.  
**Status:** NEW finding

### Evidence

```
$ curl -s https://ilies-bel.dev/ | grep 'meta.*generator'
<meta name="generator" content="Astro v6.4.2">
```

Present on every route.

**Impact:** Assists automated vulnerability scanners in fingerprinting the framework version. When a CVE is published for a specific Astro version, this tag immediately identifies the site as a target. There is no user-facing benefit in production.

**Fix (trivial):** Astro 3+ exposes a build-time hook to strip or replace this tag. Alternatively, a post-build `sed` pass can remove it. No content or functionality is affected.

### Proposed task

Remove the `meta[name=generator]` tag from the production build. Either configure Astro to suppress it (check `astro.config.mjs` `experimental` options) or add a build step that strips it from generated HTML. Add to E2E suite: assert no `meta[name=generator]` exists in any production-built page.

---

## AUDIT-13 — Sitemap lacks `<lastmod>` elements; no content freshness signal for crawlers

**Severity:** P3  
**Backlog extension:** Extends ENG-009 ("sitemap intent validates") — ENG-009's exit criteria do not include `lastmod`.  
**Status:** NEW finding

### Evidence

```xml
<!-- Full sitemap-0.xml (2026-07-10) — every <url> has only <loc> -->
<url><loc>https://ilies-bel.dev/</loc></url>
<url><loc>https://ilies-bel.dev/about/</loc></url>
<url><loc>https://ilies-bel.dev/behind-the-build/</loc></url>
<url><loc>https://ilies-bel.dev/graveyard/</loc></url>
<url><loc>https://ilies-bel.dev/posts/memory-leak-search-and-destroy/</loc></url>
<url><loc>https://ilies-bel.dev/posts/thanks-for-scrolling-to-the-bottom/</loc></url>
<url><loc>https://ilies-bel.dev/projects/</loc></url>
<url><loc>https://ilies-bel.dev/writing/</loc></url>
```

No `<lastmod>`, `<changefreq>`, or `<priority>` elements. Blog posts have `datePublished` in JSON-LD, so the data is available.

**Impact:** Google's indexing crawler cannot use freshness signals to prioritise re-crawl of updated posts. `@astrojs/sitemap` supports `lastmod` via the `serialize` callback; this is a configuration-only change.

### Proposed task

Configure `@astrojs/sitemap`'s `serialize` callback to emit `<lastmod>` for each URL, sourcing the date from MDX frontmatter `pubDate`/`updatedDate` for posts and from build timestamp for static routes. Validate the resulting XML against the [Sitemap protocol validator](https://www.sitemaps.org/protocol.html).

---

## AUDIT-14 — `/posts/` index returns 404; dead end for URL-manipulating users

**Severity:** P2  
**Backlog extension:** Extends ENG-008 ("Correct branded 404 routing") — ENG-008 focuses on unknown-path 404 behavior; this is a missing logical index that users reasonably expect.  
**Status:** NEW finding

### Evidence

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ilies-bel.dev/posts/
HTTP 404
```

Individual posts are accessible at `/posts/memory-leak-search-and-destroy/` and `/posts/thanks-for-scrolling-to-the-bottom/`. A reader who trims the post slug to find a listing of all posts hits a GitHub Pages 404. The canonical listing is at `/writing/` instead, but this is not discoverable by URL manipulation.

**Impact:** Any external link shared as `/posts/` (e.g., in a conference talk slide) returns an unbranded GitHub 404, breaking the narrative experience. Search engines may also surface the dead URL if it appears in web archives or cached link aggregators.

### Proposed task

Add a `/posts/` → `/writing/` 301 redirect rule (or a `src/pages/posts/index.astro` that redirects), ensuring that `/posts/` navigates to the writing index rather than hitting GitHub's generic 404. Document in ENG-008's exit criteria that all "near-miss" URL patterns (section roots, common aliases) either resolve or produce the branded 404 page.

---

## AUDIT-15 — `og:locale` uses BCP 47 format (`en`) instead of OG spec format (`en_US`)

**Severity:** P3  
**Backlog extension:** Extends ENG-009 — not explicitly flagged.  
**Status:** NEW finding

### Evidence

```html
<meta property="og:locale" content="en">
```

The [Open Graph Protocol](https://ogp.me/#metadata) specifies locale as IETF language tag with underscore separator: `en_US`, `fr_FR`. The value `en` is accepted by Facebook's parser but triggers a linting warning in the Open Graph Debugger and may cause unexpected behaviour in regional targeting for paid social amplification.

### Proposed task

Change `og:locale` to `en_US` in `BaseHead.astro`. Update ENG-009's exit criterion to explicitly require OG-spec locale format.

---

## AUDIT-16 — `<meta name="title">` is a non-standard tag emitted on every page

**Severity:** P3  
**Backlog extension:** Extends ENG-009 — not flagged.  
**Status:** NEW finding

### Evidence

```html
<meta name="title" content="Iliès">
```

`name="title"` is not defined in the HTML5 living standard, the WHATWG metadata spec, or the Dublin Core metadata element set as a browser-consumed tag. It is not read by Google, Bing, or social crawlers. The `<title>` element is the correct and only standard mechanism. This tag is harmless but adds unused bytes and may confuse tooling that naively reads `meta[name=title]` as the page title (which would duplicate the value rather than supplement it).

### Proposed task

Remove `<meta name="title">` from `BaseHead.astro`. Confirm that `<title>` remains and all OG/Twitter title tags are present. Add to ENG-009's exit: no non-standard meta `name` attributes are emitted in production builds.

---

## AUDIT-17 — Personal Gmail used as sole contact address; no domain-based email

**Severity:** P3  
**Backlog extension:** Extends EXP-033 ("Dedicated Contact route") — EXP-033 is a P1 future deliverable; this finding applies to the current mailto link.  
**Status:** NEW finding

### Evidence

```html
<!-- /about/ page, 2026-07-10 -->
<a href="mailto:beldjilali.ilies@gmail.com">…</a>
```

No domain email (`ilies@ilies-bel.dev` or equivalent) exists. Gmail is the sole contact path.

**Impact:** For a portfolio targeting an SOTY campaign, a Gmail address under the custom domain lowers the first-impression trust signal for prospective clients and collaborators who arrive via a juror referral. It also means email deliverability and spam reputation are tied to Google's infrastructure rather than the author's brand.

**Note:** This is a content/operational finding and requires no code change — only DNS/email configuration. `@ilies-bel.dev` can be forwarded to Gmail via Cloudflare Email Routing at zero cost.

### Proposed task

Set up Cloudflare Email Routing (or equivalent) to forward `ilies@ilies-bel.dev` to the existing Gmail. Update the mailto link in `BaseHead.astro` and the About page. This is a 15-minute operational task.

---

## Summary table

| ID | Severity | Title | Extends Backlog ID | Status |
|---|---|---|---|---|
| AUDIT-01 | P0 | Protocol-relative `//` favicon URLs break all icon links | ENG-002 | NEW |
| AUDIT-02 | P1 | Zero HTTP security headers on production | REL-001 | NEW |
| AUDIT-03 | P1 | GitHub Pages forces max-age=600 on hashed assets | PERF-013, REL-001 | NEW |
| AUDIT-04 | P1 | No RSS/Atom feed or autodiscovery link | — | NEW |
| AUDIT-05 | P2 | No web app manifest; icon-192.png missing | — | NEW |
| AUDIT-06 | P2 | All nav links trigger 301 redirect (missing trailing slash) | ENG-009 | NEW |
| AUDIT-07 | P2 | Default OG image is 312 KB; no dimension metadata | EXP-052, PERF-004 | NEW |
| AUDIT-08 | P2 | Homepage title is 6 characters — no role/specialty descriptor | ENG-009 | NEW |
| AUDIT-09 | P2 | No print stylesheet on any route | — | NEW |
| AUDIT-10 | P2 | Twitter cards lack `twitter:site` and `twitter:creator` | ENG-009 | NEW |
| AUDIT-11 | P2 | Brotli compression not served (GitHub Pages limitation) | PERF-013, REL-001 | NEW |
| AUDIT-12 | P3 | `meta[name=generator]` exposes Astro version in production | — | NEW |
| AUDIT-13 | P3 | Sitemap has no `<lastmod>` elements | ENG-009 | NEW |
| AUDIT-14 | P2 | `/posts/` index returns 404 | ENG-008 | NEW |
| AUDIT-15 | P3 | `og:locale` uses `en` instead of OG-spec `en_US` | ENG-009 | NEW |
| AUDIT-16 | P3 | `<meta name="title">` is non-standard HTML | ENG-009 | NEW |
| AUDIT-17 | P3 | Personal Gmail as sole contact; no domain-based email | EXP-033 | NEW |

---

## Platform constraint note (AUDIT-02, AUDIT-03, AUDIT-11)

Three of the most impactful findings (security headers, asset caching TTL, Brotli) share a single root cause: **GitHub Pages does not support custom HTTP response headers**. All three are resolved by adding a CDN/proxy layer or migrating to a hosting platform with configurable headers (Cloudflare Pages, Netlify, Vercel). This is an architectural decision that should be resolved before REL-001 can pass, and a single migration task would close all three findings simultaneously. The deployment-platform evaluation proposed in AUDIT-02 is the correct first step.

---

## Baseline request/response log — 2026-07-10

```
GET / HTTP/2  →  200  150,667 bytes raw / 30,212 bytes gzip  cache-control: max-age=600
GET /projects/  →  200  server: GitHub.com
GET /writing/   →  200
GET /about/     →  200
GET /graveyard/ →  200
GET /behind-the-build/  →  200
GET /work/      →  404
GET /contact/   →  404
GET /posts/     →  404
GET /rss.xml    →  404
GET /feed.xml   →  404
GET /site.webmanifest  →  404
GET /manifest.json     →  404
GET /icon-192.png      →  404
GET /sitemap-index.xml →  200
GET /sitemap-0.xml     →  200  (8 URLs, no <lastmod>)
GET /robots.txt        →  200
GET /favicon.ico       →  200  (9,662 bytes)
GET /favicon.svg       →  200  (878 bytes)
GET /apple-touch-icon.png   →  200  (4,759 bytes)
GET /og-default.png    →  200  (319,635 bytes)
www redirect:  HTTP/2 301 → https://ilies-bel.dev/
HTTP redirect: HTTP/1.1 301 → https://ilies-bel.dev/
Security headers present: NONE
Brotli: Not supported (falls back to gzip)
Compression (gzip): Served when Accept-Encoding: gzip sent
```
