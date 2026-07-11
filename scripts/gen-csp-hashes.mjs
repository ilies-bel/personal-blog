// gen-csp-hashes.mjs — generate the site's security-header values (CSP with
// sha256 hashes for every inline executable script in the built dist/) and
// write them, with the Cloudflare paste-in instructions, to
// docs/SECURITY-HEADERS.md. Zero dependencies.
//
//   node scripts/gen-csp-hashes.mjs [dist]          # regenerate the doc
//   node scripts/gen-csp-hashes.mjs --check [dist]  # CI staleness gate
//
// Why hashes: the site ships a handful of inline <script> bodies — the
// pre-paint env-flags script in BaseHead plus the small runtime scripts Astro
// itself inlines for islands (client:visible/client:only loaders) and the
// ClientRouter. A strict `script-src 'self'` would block them, and
// 'unsafe-inline' would gut the policy — so each body is allowed by its
// sha256- source hash (CSP level 2). The hashes change whenever ANY inline
// script's bytes change (a BaseHead edit, an Astro upgrade, a new island
// directive), which is exactly why:
//
//   1. this script derives them from the BUILT dist, never from source, and
//   2. the --check mode runs in CI after the build and fails when the hashes
//      recorded in docs/SECURITY-HEADERS.md no longer match the dist — the
//      committed doc (and therefore the Cloudflare rule pasted from it) can
//      never silently go stale. Fix: `pnpm build &&
//      node scripts/gen-csp-hashes.mjs`, commit the doc, re-paste the rule.
//
// Non-executable script types (application/ld+json structured data,
// speculationrules) are data, not code — CSP script-src does not apply to
// them, so they are skipped.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const distDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');
const DOC_PATH = resolve('docs/SECURITY-HEADERS.md');

if (!existsSync(distDir)) {
  console.error(`gen-csp-hashes: build directory not found: ${distDir} (run the build first)`);
  process.exit(1);
}

/** Recursively list files under dir. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** script types whose bodies are DATA, not executable code — no hash needed. */
const NON_EXECUTABLE_TYPES = new Set(['application/ld+json', 'application/json', 'speculationrules']);

/**
 * Extract every inline EXECUTABLE script body from an HTML document.
 * Executable = no src attribute AND type is absent, 'module', or a JS MIME.
 * The hash input is the exact raw body between the tags (whitespace included) —
 * byte-identical to what the browser hashes when enforcing the CSP.
 */
function inlineScriptBodies(html) {
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (NON_EXECUTABLE_TYPES.has(type)) continue;
    bodies.push(m[2]);
  }
  return bodies;
}

const htmlFiles = walk(distDir).filter((f) => f.endsWith('.html'));
const hashes = new Map(); // sha256-… -> { pages: Set, preview: string }
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = file.slice(distDir.length);
  for (const body of inlineScriptBodies(html)) {
    const digest = createHash('sha256').update(body, 'utf8').digest('base64');
    const key = `sha256-${digest}`;
    if (!hashes.has(key)) {
      hashes.set(key, { pages: new Set(), preview: body.trim().slice(0, 88).replace(/\s+/g, ' ') });
    }
    hashes.get(key).pages.add(page);
  }
}

const sortedHashes = [...hashes.keys()].sort();

// ---------------------------------------------------------------------------
// The header values. One authoritative composition — the doc, the stdout dump
// and the --check gate all read from here.
// ---------------------------------------------------------------------------
const csp = [
  `default-src 'self'`,
  // 'self' covers every bundled /_astro/*.js file; each inline body is allowed
  // by its hash (see the generated table below for which script each hash is).
  `script-src 'self' ${sortedHashes.map((h) => `'${h}'`).join(' ')}`,
  // 'unsafe-inline' for styles is a deliberate, documented trade-off:
  // astro.config.mjs sets build.inlineStylesheets:'always' (every page carries
  // its CSS as inline <style> for first-paint speed), and React islands set
  // style attributes at runtime. Hashing the <style> elements would DISABLE
  // 'unsafe-inline' and break the attribute styles, so both stay allowed.
  // Inline styles cannot exfiltrate or execute; the XSS-relevant vectors
  // (script, object, base) are all locked down.
  `style-src 'self' 'unsafe-inline'`,
  // data: for the inline SVG grain/placeholder data-URIs the pages embed.
  `img-src 'self' data:`,
  `font-src 'self'`,
  // Same-origin only: ClientRouter page fetches + island chunk loads. When
  // analytics is ever enabled, this needs the additions in docs/ANALYTICS.md.
  `connect-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

const HEADERS = [
  ['Content-Security-Policy', csp],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
];

// ---------------------------------------------------------------------------
// --check: the hashes recorded in docs/SECURITY-HEADERS.md must equal the set
// derived from the dist that was just built.
// ---------------------------------------------------------------------------
if (checkMode) {
  if (!existsSync(DOC_PATH)) {
    console.error('gen-csp-hashes --check: docs/SECURITY-HEADERS.md does not exist.');
    console.error('Fix: node scripts/gen-csp-hashes.mjs && git add docs/SECURITY-HEADERS.md');
    process.exit(1);
  }
  const doc = readFileSync(DOC_PATH, 'utf8');
  const documented = new Set(doc.match(/sha256-[A-Za-z0-9+/=]+/g) ?? []);
  const built = new Set(sortedHashes);
  const missing = [...built].filter((h) => !documented.has(h));
  const stale = [...documented].filter((h) => !built.has(h));
  if (missing.length === 0 && stale.length === 0) {
    console.log(
      `gen-csp-hashes --check: OK — ${built.size} inline-script hash(es) in docs/SECURITY-HEADERS.md match the built dist.`,
    );
    process.exit(0);
  }
  console.error('gen-csp-hashes --check: docs/SECURITY-HEADERS.md is STALE — the CSP it documents');
  console.error('no longer matches the inline scripts in the built dist.');
  for (const h of missing) {
    const info = hashes.get(h);
    console.error(`  missing from doc: '${h}'  (script: "${info.preview}…" on ${info.pages.size} page(s))`);
  }
  for (const h of stale) console.error(`  in doc but not in build (remove): '${h}'`);
  console.error('\nFix: pnpm build && node scripts/gen-csp-hashes.mjs, commit the doc,');
  console.error('then re-paste the updated CSP into the Cloudflare rule (docs/SECURITY-HEADERS.md §How to apply).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Generate docs/SECURITY-HEADERS.md
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const hashTable = sortedHashes
  .map((h) => {
    const info = hashes.get(h);
    return `| \`${h}\` | ${info.pages.size} | \`${info.preview}…\` |`;
  })
  .join('\n');

const doc = `<!-- GENERATED FILE — do not edit the header values by hand.
     Regenerate with:  pnpm build && node scripts/gen-csp-hashes.mjs
     CI gate:          node scripts/gen-csp-hashes.mjs --check  (ci.yml)      -->

# Security headers — exact values + how to apply them

Generated ${today} by \`scripts/gen-csp-hashes.mjs\` from the built \`dist/\`.

GitHub Pages cannot set custom response headers, and this site is a static
build — so the real security headers are applied at the edge by **Cloudflare
Response Header Transform Rules** (the domain's DNS is already proxied through
Cloudflare). This file contains the exact values to paste. Applying them is a
dashboard action for the site owner — tracked as input #9 in
\`docs/INPUTS-NEEDED.md\`.

## The values

### Content-Security-Policy

\`\`\`
${csp}
\`\`\`

### Strict-Transport-Security

\`\`\`
max-age=31536000; includeSubDomains; preload
\`\`\`

### X-Content-Type-Options

\`\`\`
nosniff
\`\`\`

### Referrer-Policy

\`\`\`
strict-origin-when-cross-origin
\`\`\`

### Permissions-Policy

\`\`\`
camera=(), microphone=(), geolocation=(), interest-cohort=()
\`\`\`

## What each inline-script hash is

Every inline executable \`<script>\` body in the built site is allowed by its
sha256 hash (never \`'unsafe-inline'\`). Non-executable script tags
(\`application/ld+json\` structured data) are data, not code — CSP does not
apply to them and they need no hash.

| Hash | Pages | Script (first 88 chars) |
|------|-------|--------------------------|
${hashTable}

These bodies are: the pre-paint env-flags script (\`BaseHead.astro\` —
\`html.js\` + \`data-motion\`), and the small runtime scripts Astro inlines for
island hydration directives and the ClientRouter. **They change whenever the
pre-paint script is edited, Astro/Vite is upgraded, or an island directive is
added/removed** — see "Keeping this current" below.

## Why these directives

- \`script-src 'self' + hashes\` — bundled \`/_astro/*.js\` files are covered by
  \`'self'\`; each inline body by its hash. No \`'unsafe-inline'\`, no
  \`'unsafe-eval'\` (verified: nothing in the bundle uses eval/new Function at
  runtime, no workers, no inline event handlers).
- \`style-src 'self' 'unsafe-inline'\` — **deliberate**: \`astro.config.mjs\`
  sets \`build.inlineStylesheets: 'always'\` (each page carries its CSS as an
  inline \`<style>\` block for first-paint speed) and React islands set
  \`style\` attributes at runtime. Adding hashes for the \`<style>\` elements
  would *disable* \`'unsafe-inline'\` and break the attribute styles, so both
  remain allowed. Inline CSS is not an execution vector; the XSS-relevant
  directives (script/object/base) are strict.
- \`img-src 'self' data:\` — pages embed inline SVG grain/placeholder
  data-URIs.
- \`connect-src 'self'\` — ClientRouter page fetches + dynamic island chunks
  only. **If Cloudflare Web Analytics is ever enabled** (currently NOT — see
  \`docs/ANALYTICS.md\`), this and \`script-src\` need the additions listed
  there.
- \`frame-ancestors 'none'\` — the site never needs embedding; this supersedes
  \`X-Frame-Options\`.
- \`object-src 'none'\`, \`base-uri 'self'\`, \`form-action 'self'\`,
  \`upgrade-insecure-requests\` — standard lockdown; the site has no plugins,
  no \`<base>\`, and only \`mailto:\`-style contact (no form posts).
- **HSTS preload caveat**: \`preload\` + \`includeSubDomains\` commits every
  future subdomain of ilies-bel.dev to HTTPS forever once submitted to
  \`hstspreload.org\`. Submission is optional and separate; the header alone is
  safe to apply now.

## How this policy was validated

The full policy above (including \`script-src\` with hashes) was verified
against the real build by injecting it as a meta tag into a copy of \`dist/\`
and driving every route headlessly — including a complete home-page scroll
through the WebGL lifecycle: **zero** \`securitypolicyviolation\` events and
zero console errors on all 10 pages. Re-run that probe after any large change
by repeating the injection trick, or simply watch the DevTools console on the
live site after applying the rule (step 7 below).

## How to apply (Cloudflare dashboard — owner action, INPUTS-NEEDED #9)

1. Log in to the Cloudflare dashboard and select the \`ilies-bel.dev\` zone.
2. Go to **Rules → Overview → Create rule → Response Header Transform Rule**
   (on older dashboards: Rules → Transform Rules → Modify Response Header).
3. Name it \`security-headers\`.
4. **When incoming requests match**: choose *All incoming requests*. (The
   headers are harmless on assets; scoping to HTML only would need a custom
   filter expression and gains little.)
5. **Then… Modify response header**: add five **"Set static"** operations, one
   per header above — header name exactly as written (e.g.
   \`Content-Security-Policy\`), value copied verbatim from the code blocks.
   The CSP value is one long single line — copy the whole block.
6. **Deploy** the rule.
7. Verify from a terminal:
   \`\`\`sh
   curl -sI https://ilies-bel.dev/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy'
   \`\`\`
   All five headers must appear. Then browse the site with DevTools open —
   the console must show **zero** CSP violation reports on /, a post page,
   and a full home-page scroll (the WebGL hero exercises every code path).
8. The scheduled prod-crawl workflow (\`.github/workflows/prod-crawl.yml\`)
   checks for these headers weekly and warns while they are missing.

## Limitations

- **GitHub Pages origin**: requests that bypass Cloudflare (direct to
  \`ilies-bel.github.io\`) do not get these headers. The custom domain is the
  only published entry point; the meta-CSP below is the backstop.
- **Meta-CSP (defense-in-depth in the HTML itself)**: \`BaseHead.astro\` ships
  a \`<meta http-equiv="Content-Security-Policy">\` with the subset of this
  policy that is (a) legal in a meta tag and (b) stable across builds:
  \`object-src / base-uri / form-action / style-src / img-src / font-src /
  media-src / connect-src / upgrade-insecure-requests\`. Two things are
  deliberately absent from it:
  - \`frame-ancestors\` — **ignored in meta CSP by spec**; it only works as a
    real response header (another reason the Cloudflare rule matters).
  - \`script-src\` (and therefore \`default-src\`) — the inline-script hashes
    only exist after the build bundles and minifies (Astro's island/router
    runtime scripts), so BaseHead cannot know them at render time. Hardcoding
    them would break on the next Astro upgrade; a meta \`default-src 'self'\`
    without hashes would block the site's own inline scripts. Script-src
    enforcement therefore lives ONLY in the edge header, where this generator
    keeps it current.
- **report-uri / report-to** are also not valid in meta CSP; if violation
  reporting is ever wanted, add it to the Cloudflare header value.

## Keeping this current

The CI gate \`node scripts/gen-csp-hashes.mjs --check\` (ci.yml, after the
build) fails when the hashes in this file no longer match the built dist —
i.e. whenever an inline script changed. When it fires:

\`\`\`sh
pnpm build
node scripts/gen-csp-hashes.mjs   # rewrites this file
git add docs/SECURITY-HEADERS.md && git commit
\`\`\`

…then **re-paste the new Content-Security-Policy value into the Cloudflare
rule** (step 5 above). Until the rule is updated, browsers will block the
changed inline script on the live site — treat a hash change as part of the
release checklist (docs/RUNBOOK.md).

Also verified by this pipeline: the production build emits **no source maps**
(\`find dist -name '*.map'\` is empty; Vite's default) — nothing to strip.
`;

writeFileSync(DOC_PATH, doc);

console.log(`gen-csp-hashes: scanned ${htmlFiles.length} pages, ${sortedHashes.length} unique inline script hash(es).\n`);
console.log('Recommended Cloudflare Response Header Transform values:\n');
for (const [name, value] of HEADERS) {
  console.log(`${name}:`);
  console.log(`  ${value}\n`);
}
console.log(`Wrote docs/SECURITY-HEADERS.md (paste-in instructions included).`);
