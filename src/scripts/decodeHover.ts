// DECODE HOVER — the sitewide text gesture for mono instrument labels.
//
// Any element carrying [data-decode] scrambles through readout glyphs and
// resolves left→right (~0.3s) when the pointer enters it, like an instrument
// re-acquiring a signal. One delegated listener pair on `document` serves the
// whole site and survives every ClientRouter swap (the document node is never
// replaced), so no per-page or per-node binding is needed — including React
// islands that render [data-decode] labels after hydration.
//
// Rules of the gesture:
//   • MONO LABELS ONLY. The scramble reads as terminal decode in IBM Plex Mono
//     (fixed advance = zero layout shift). Display/prose text never scrambles.
//   • POINTER ONLY. Keyboard focus deliberately does NOT scramble: a screen
//     reader computes the accessible name around focus time, and a mid-scramble
//     name would announce as garbage. Focus keeps the underline/tick/color
//     treatments the CSS already provides.
//   • Reduced motion → no-op (the hover color/underline still confirms).
//   • The original text is ALWAYS restored — on completion and on early leave.
//
// Elements must contain plain text only (no element children); every current
// consumer (nav labels, footer labels, back-links, contact links, HUD rail
// titles) satisfies this.
import { resolveMotionPreference } from '../lib/motionPreference';
import { DECODE_HOVER_MS as DURATION_MS } from '../lib/transitionDurations';

const GLYPHS = '#/\\|<>[]{}=+*%$@!?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Per-element churn pool. Mono labels can churn through anything (fixed
 *  advance), but display-font titles (writing rows, entry names) would jitter
 *  in width on thin/wide glyphs — so the pool is built mostly from the text's
 *  OWN characters (near-identical widths, reads like a cipher re-sorting
 *  itself) plus a pinch of digits for the instrument flavor. */
function poolFor(original: string): string {
  const own = original.replace(/\s+/g, '');
  return own.length >= 4 ? own + own.toUpperCase() + '0123456789' : GLYPHS;
}

/** Live animation state per element, so re-entry restarts cleanly and leave
 *  can cancel. WeakMap: nodes swapped out by ClientRouter just fall away. */
const running = new WeakMap<HTMLElement, number>();


function stop(el: HTMLElement): void {
  const raf = running.get(el);
  if (raf !== undefined) {
    window.cancelAnimationFrame(raf);
    running.delete(el);
  }
  // Restore the true label whether we finished or bailed mid-scramble.
  const original = el.dataset.decodeText;
  if (original !== undefined) el.textContent = original;
}

function start(el: HTMLElement): void {
  if (resolveMotionPreference()) return;
  if (running.has(el)) return; // already decoding — let it finish
  // Capture the true label PER RUN (not once): dynamic readouts (the graveyard
  // HUD name, scroll-spied titles) change their text between hovers, and a
  // once-captured value would restore a stale label. While an animation runs
  // the guard above blocks re-capture, so a half-scrambled frame can never be
  // taken as "the original".
  el.dataset.decodeText = el.textContent ?? '';
  const original = el.dataset.decodeText;
  if (!original.trim()) return;
  const pool = poolFor(original);
  const randomGlyph = (): string => pool[Math.floor(Math.random() * pool.length)];

  const startedAt = performance.now();
  const tick = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / DURATION_MS);
    // Resolve left→right: the first `settled` chars are final, the rest churn.
    const settled = Math.floor(progress * original.length);
    let next = '';
    for (let i = 0; i < original.length; i++) {
      const ch = original[i];
      // Spaces and punctuation hold still — only letterforms churn, which keeps
      // the word silhouette readable through the decode.
      next += i < settled || ch === ' ' ? ch : randomGlyph();
    }
    el.textContent = next;
    if (progress < 1) {
      running.set(el, window.requestAnimationFrame(tick));
    } else {
      running.delete(el);
      el.textContent = original;
    }
  };
  running.set(el, window.requestAnimationFrame(tick));
}

/** Resolve the decode label + its hover SCOPE from an event target. The label
 *  usually sits INSIDE a larger interactive box (a nav link's padding, its tick
 *  frame, its dim caption) — hovering anywhere in that box should decode the
 *  label, so the scope is the enclosing link/button when one exists. */
function resolveLabel(target: Element): { scope: Element; el: HTMLElement } | null {
  const direct = target.closest<HTMLElement>('[data-decode]');
  if (direct) return { scope: direct.closest('a, button') ?? direct, el: direct };
  const scope = target.closest('a, button');
  if (!scope) return null;
  const el = scope.querySelector<HTMLElement>('[data-decode]');
  return el ? { scope, el } : null;
}

// Bind ONCE per session. mouseover/mouseout bubble (mouseenter does not), so a
// single document-level pair covers every present and future [data-decode].
declare global {
  interface Window {
    __bhDecodeHoverBound?: boolean;
  }
}
if (!window.__bhDecodeHoverBound) {
  window.__bhDecodeHoverBound = true;
  document.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const found = resolveLabel(target);
    if (!found) return;
    // Ignore pointer moves WITHIN the scope (child → child bubbling).
    const from = event.relatedTarget;
    if (from instanceof Node && found.scope.contains(from)) return;
    start(found.el);
  });
  document.addEventListener('mouseout', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const found = resolveLabel(target);
    if (!found) return;
    const to = event.relatedTarget;
    if (to instanceof Node && found.scope.contains(to)) return;
    stop(found.el);
  });
}

export {};
