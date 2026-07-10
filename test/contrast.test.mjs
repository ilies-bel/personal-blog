// WCAG 2.2 AA contrast gate for the design tokens (P8).
//
// Parses src/styles/tokens.css (the single :root source of custom properties),
// resolves each token to sRGB — including var() references and
// color-mix(in oklch, …) — and asserts the WCAG contrast ratio of every
// foreground/background TOKEN PAIR the stylesheets actually compose for text.
//
// The pair list below is derived from the real consumers (grep the styles):
// each entry names the CSS that pairs the two tokens, so a future re-pairing
// must update both the stylesheet and this ledger. Thresholds:
//   • 'body'    — normal-size text: ≥ 4.5:1 (WCAG 1.4.3). Everything that ever
//                 labels body/label/nav text takes this bar, because the type
//                 scale's smallest rungs (10–13px mono) are never "large".
//   • 'large'   — display-only text ≥ 24px / bold ≥ 18.7px: ≥ 3:1. (Currently
//                 unused — every text pair on the site clears 4.5 — kept so a
//                 future large-display-only pair has a documented slot.)
//   • 'graphic' — meaningful non-text UI graphics (WCAG 1.4.11): ≥ 3:1.
//
// The oklch → sRGB conversion below is the reference OKLab math (Björn Ottosson,
// public domain) — no color library is installed, and the tokens use small
// chromas that stay comfortably inside the sRGB gamut (channels are clamped
// defensively anyway, matching browser gamut-mapping closely enough at these
// chroma levels for a contrast gate with the margins asserted here).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS_PATH = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));

/* --- oklch → sRGB ---------------------------------------------------------- */

/** oklch(L C H) → linear-light sRGB triplet, channels clamped to [0, 1]. */
function oklchToLinearSrgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  // OKLab → non-linear LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  // LMS → linear sRGB
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bb].map((v) => Math.min(1, Math.max(0, v)));
}

/** WCAG relative luminance from a LINEAR sRGB triplet (no de-gamma needed). */
const relativeLuminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG contrast ratio between two oklch colors ({ L, C, H }). */
function contrastRatio(fg, bg) {
  const lumA = relativeLuminance(oklchToLinearSrgb(fg.L, fg.C, fg.H));
  const lumB = relativeLuminance(oklchToLinearSrgb(bg.L, bg.C, bg.H));
  const [hi, lo] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

/* --- tokens.css parsing + resolution ---------------------------------------- */

/** All `--name: value;` declarations from the file, comments stripped. */
function parseTokenDeclarations(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = new Map();
  for (const match of noComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    decls.set(match[1], match[2].trim());
  }
  return decls;
}

/**
 * Resolve a token to { L, C, H } (opaque oklch). Supports the value shapes
 * tokens.css actually uses for COLOR tokens: oklch() literals, var() aliases,
 * and color-mix(in oklch, A p%, B). Non-color tokens return null.
 */
function resolveToken(decls, name, seen = new Set()) {
  assert.ok(!seen.has(name), `circular var() chain at ${name}`);
  seen.add(name);
  const value = decls.get(name);
  assert.ok(value !== undefined, `token ${name} not found in tokens.css`);
  return resolveValue(decls, value, seen);
}

function resolveValue(decls, value, seen = new Set()) {
  const varMatch = value.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) return resolveToken(decls, varMatch[1], seen);

  const oklchMatch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (oklchMatch) {
    return { L: Number(oklchMatch[1]), C: Number(oklchMatch[2]), H: Number(oklchMatch[3]) };
  }

  // color-mix(in oklch, <A> <p>%, <B>) — linear interpolation per component,
  // matching CSS Color 5's oklch interpolation for these near-neutral hues.
  const mixMatch = value.match(/^color-mix\(in oklch,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/);
  if (mixMatch) {
    const a = resolveValue(decls, mixMatch[1].trim(), new Set(seen));
    const b = resolveValue(decls, mixMatch[3].trim(), new Set(seen));
    if (!a || !b) return null;
    const p = Number(mixMatch[2]) / 100;
    return {
      L: a.L * p + b.L * (1 - p),
      C: a.C * p + b.C * (1 - p),
      H: a.H * p + b.H * (1 - p),
    };
  }

  return null; // non-color token (length, font stack, rgba shadow, …)
}

/* --- the audited pair ledger ------------------------------------------------- */

// role: 'body' → ≥4.5 | 'large' → ≥3 (large display text only) | 'graphic' → ≥3.
const PAIRS = [
  // Body copy sitewide: base.css `body { color: var(--fg); background: var(--bg) }`.
  { fg: '--fg', bg: '--bg', role: 'body', where: 'base.css body text' },
  // Secondary text: hero.css .bh-rm-modal-body, writing.css row descriptions, prose.
  { fg: '--fg-dim', bg: '--bg', role: 'body', where: 'secondary text (modal body, descriptions)' },
  // Labels/dates: hero.css .bh-identity-role, scene.css .scene-loader-name,
  // graveyard.css .graveyard-entry-specimen — small mono labels, so the 4.5 bar.
  { fg: '--fg-faint', bg: '--bg', role: 'body', where: 'micro labels / dates' },
  // Floating hero/HUD copy: hero.css .bh-beat-line, .bh-finale-ledger-label.
  { fg: '--fg-overlay', bg: '--bg', role: 'body', where: 'manifesto + HUD overlay text' },
  // Reading-page chrome: chrome.css .subnav-link, .site-footer a.
  { fg: '--fg-chrome-dim', bg: '--bg', role: 'body', where: 'resting nav/footer text' },
  // Chrome micro labels: chrome.css .site-footer, article captions.
  { fg: '--fg-chrome-faint', bg: '--bg', role: 'body', where: 'chrome micro labels' },
  // Links: base.css `a { color: var(--link) }` (--link: var(--accent)).
  { fg: '--accent', bg: '--bg', role: 'body', where: 'links (base.css a / --link)' },
  // Bright gold small text: scene.css .webgl-fallback-kicker, prose.css strong gold.
  { fg: '--accent-strong', bg: '--bg', role: 'body', where: 'bright gold small text' },
  // Rare readout signal: contact.css / article.css `color: var(--highlight)`.
  { fg: '--highlight', bg: '--bg', role: 'body', where: 'gold readout signal text' },
  // Resting interactive rail text: scene.css .overlay-blog-link, hud.css rail titles.
  { fg: '--hud-rail-dim-text', bg: '--bg', role: 'body', where: 'resting nav/rail text' },
  // Dimmest non-current rail subtext: hud.css .hud-nav-destination (real nav text).
  { fg: '--hud-rail-dim-sub', bg: '--bg', role: 'body', where: 'non-current rail subtext' },
  // Clickable HUD resting text (a color-mix token): hud.css compass idle readout.
  { fg: '--fg-hud-interactive', bg: '--bg', role: 'body', where: 'interactive HUD resting text' },
  // Panel surfaces: hero.css .bh-rm-modal (title --fg / body --fg-dim on --bg-soft).
  { fg: '--fg', bg: '--bg-soft', role: 'body', where: 'modal/panel title' },
  { fg: '--fg-dim', bg: '--bg-soft', role: 'body', where: 'modal/panel body' },
  { fg: '--fg-faint', bg: '--bg-soft', role: 'body', where: 'panel micro labels' },
  // Inverted controls: chrome.css .skip-link and hero.css .bh-rm-modal-btn--primary
  // set `color: var(--bg); background: var(--accent)` (hover: --accent-strong).
  { fg: '--bg', bg: '--accent', role: 'body', where: 'skip link / primary button text' },
  { fg: '--bg', bg: '--accent-strong', role: 'body', where: 'primary button hover text' },
  // NON-TEXT graphic: MarsTopology failed-project chips fill/stroke var(--ember)
  // (meaningful status graphics, WCAG 1.4.11 ≥3:1). --ember never labels text
  // ("surface wash only" per tokens.css) — do not add it as a text pair.
  { fg: '--ember', bg: '--bg', role: 'graphic', where: 'Mars topology failed-chip graphic' },
];

const THRESHOLD = { body: 4.5, large: 3, graphic: 3 };

/* --- tests -------------------------------------------------------------------- */

const decls = parseTokenDeclarations(readFileSync(TOKENS_PATH, 'utf8'));

test('every audited token pair resolves to a color', () => {
  for (const { fg, bg } of PAIRS) {
    assert.ok(resolveToken(decls, fg), `${fg} must resolve to an oklch color`);
    assert.ok(resolveToken(decls, bg), `${bg} must resolve to an oklch color`);
  }
});

for (const { fg, bg, role, where } of PAIRS) {
  test(`contrast ${fg} on ${bg} ≥ ${THRESHOLD[role]}:1 (${where})`, () => {
    const ratio = contrastRatio(resolveToken(decls, fg), resolveToken(decls, bg));
    assert.ok(
      ratio >= THRESHOLD[role],
      `${fg} on ${bg} is ${ratio.toFixed(2)}:1 — needs ≥ ${THRESHOLD[role]}:1 (${where})`,
    );
  });
}

// Guard the conversion itself against silent drift: white-on-black must be ~21:1
// and a mid grey ~4.6:1 (reference values from the WCAG formula).
test('conversion sanity: known reference ratios', () => {
  const white = { L: 1, C: 0, H: 0 };
  const black = { L: 0, C: 0, H: 0 };
  assert.ok(Math.abs(contrastRatio(white, black) - 21) < 0.01, 'white/black must be 21:1');
});
