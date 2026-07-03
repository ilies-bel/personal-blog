// WARP TRANSITION — the Star-Wars "jump to hyperspace" navigation into the About
// page. Clicking any About link doesn't just swap the page: the viewport bursts
// into radial light-streaks that stretch from the centre and accelerate to a
// white flash, THEN we SPA-navigate to /about, where the streaks decelerate back
// into a calm starfield and fade as the About panel resurfaces.
//
// It layers cleanly on the site's existing navigation choreography (BaseLayout):
//   • A dedicated full-viewport <canvas data-warp-overlay transition:persist> is
//     mounted once in BaseLayout, a sibling of the dive bloom overlay. Because it
//     is transition:persist'ed it SURVIVES the ClientRouter body swap, so the same
//     canvas keeps animating straight across the navigation — the jump-out on the
//     origin page and the drop-in on About are one continuous render loop.
//   • On click we set a `bh:warp` sessionStorage flag (mirroring the dive's
//     `bh:dive`). BaseLayout's before-swap arbiter already skips the native
//     view-transition when a warp flag is present, so the streaks aren't doubled
//     by a snapshot cross-fade; the page-load resurface handler reads the flag to
//     play the deceleration on arrival.
//
// Same single-listener delegation idiom as sceneToggle.ts / decodeHover.ts: one
// document-level capture-phase click listener, bound once per session, covers the
// About link on every page and every swap — no per-swap rebind.
//
// Reduced motion: the whole streak animation is skipped. The click just navigates
// (BaseLayout's resurface handler no-ops the deceleration too), so a reduced-motion
// visitor gets a plain, instant swap with no light show.

const WARP_FLAG = 'bh:warp';

// --- Timing (ms) -----------------------------------------------------------
// The jump-out: the field starts almost DARK (a few faint drifting sparks — the
// ship still at sub-light), holds a beat while the HUD flickers + the readout
// counts up, THEN accelerates HARD into the light and slams into the white flash.
// We navigate at the flash apex so the swap is hidden behind the brightest frame.
// Longer than a snappy nav on purpose — this is a set-piece, not a page turn.
const JUMP_MS = 1500;
// The arrival: the streaks STAY fully stretched (no decelerate / contract-back)
// and the whole field simply fades out as the About content shows through — the
// jump carries its momentum right onto the page instead of braking.
const ARRIVE_MS = 750;
// Navigate this long before the jump animation nominally ends, i.e. right at the
// white-flash apex, so the (already-prepared) swap lands under the peak brightness.
const NAV_BEFORE_END_MS = 130;

// The body class that gates the sitewide HUD flicker (hud.css) for the jump.
const WARP_ACTIVE_CLASS = 'warp-active';

// The bottom-centre readout copy, swapped across the jump so the instrument
// narrates the jump like a cockpit callout. Timed as fractions of JUMP_MS.
const WARP_LINES: Array<{ at: number; label: string }> = [
  { at: 0, label: 'ENGAGING HYPERDRIVE' },
  { at: 0.34, label: 'BEGINNING LIGHTSPEED TRAVEL' },
  { at: 0.72, label: 'PUNCH IT' },
];

// --- Starfield geometry ----------------------------------------------------
const STAR_COUNT = 460;

interface WarpStar {
  // Direction unit vector from centre + a normalized radius along it (0..1 of the
  // half-diagonal). Stars stream OUTWARD as speed rises; a streak is drawn from the
  // star's current radius back toward the centre, its length scaling with speed.
  angle: number;
  // Base radius seed (0..1). Stars nearer the edge move fastest (perspective), so
  // the seed also biases speed.
  seed: number;
  // Per-star brightness + faint colour jitter (the reference has cool violet/teal
  // sparks among the white), so the field isn't a flat white.
  hue: number;
  bright: number;
}

interface WarpState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stars: WarpStar[];
  dpr: number;
  w: number;
  h: number;
  raf: number;
  // Wall-clock start of the current phase, and which phase we're in.
  phase: 'idle' | 'jump' | 'arrive';
  start: number;
  navigated: boolean;
  href: string | null;
  // The bottom-centre readout element (mounted beside the canvas) and the timers
  // that swap its callout copy across the jump — cleared on teardown.
  readout: HTMLElement | null;
  lineTimers: number[];
}

declare global {
  interface Window {
    __bhWarp?: WarpState;
    __bhWarpBound?: boolean;
  }
}

/** Deterministic per-index pseudo-random in [0,1) — no Math.random so the field is
 *  stable and SSR-safe-adjacent (this only runs client-side, but a fixed field also
 *  means the jump-out and drop-in share the same star layout across the swap). */
function rand(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildStars(): WarpStar[] {
  const stars: WarpStar[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      angle: rand(i, 1) * Math.PI * 2,
      seed: rand(i, 2),
      // Mostly white (hue ~0 handled specially), with a minority of cool sparks.
      hue: rand(i, 3),
      bright: 0.45 + rand(i, 4) * 0.55,
    });
  }
  return stars;
}

function ensureState(): WarpState | null {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-warp-overlay]');
  if (!canvas) return null;
  const existing = window.__bhWarp;
  // The canvas node is transition:persist'ed, so it is the SAME element across
  // swaps — reuse the state if it still points at the live canvas.
  if (existing && existing.canvas === canvas) return existing;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const state: WarpState = {
    canvas,
    ctx,
    stars: buildStars(),
    dpr: 1,
    w: 0,
    h: 0,
    raf: 0,
    phase: 'idle',
    start: 0,
    navigated: false,
    href: null,
    readout: document.querySelector<HTMLElement>('[data-warp-readout]'),
    lineTimers: [],
  };
  window.__bhWarp = state;
  return state;
}

/** Set the bottom-centre callout copy (the label span inside the readout). */
function setReadout(state: WarpState, label: string): void {
  const el = state.readout ?? document.querySelector<HTMLElement>('[data-warp-readout]');
  if (!el) return;
  state.readout = el;
  const labelEl = el.querySelector<HTMLElement>('[data-warp-label]');
  if (labelEl) labelEl.textContent = label;
}

/** Show/hide the readout by toggling its own active attribute (CSS fades it). */
function showReadout(state: WarpState, on: boolean): void {
  const el = state.readout ?? document.querySelector<HTMLElement>('[data-warp-readout]');
  if (!el) return;
  state.readout = el;
  if (on) el.dataset.warpReadoutActive = '1';
  else delete el.dataset.warpReadoutActive;
}

function clearLineTimers(state: WarpState): void {
  while (state.lineTimers.length) window.clearTimeout(state.lineTimers.pop());
}

function resize(state: WarpState): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  state.dpr = dpr;
  state.w = w;
  state.h = h;
  state.canvas.width = Math.round(w * dpr);
  state.canvas.height = Math.round(h * dpr);
  state.canvas.style.width = `${w}px`;
  state.canvas.style.height = `${h}px`;
}

function easeInQuad(t: number): number {
  return t * t;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Draw one frame. `speed` scales streak length/outward radius (0 = a still
 *  starfield of points, 1 = full hyperspace stretch). `flash` (0..1) is a central
 *  white bloom for the jump apex. `alpha` fades the whole field for the arrival. */
function drawFrame(state: WarpState, speed: number, flash: number, alpha: number): void {
  const { ctx, w, h, dpr, stars } = state;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  const cx = w / 2;
  const cy = h / 2;
  const half = Math.hypot(cx, cy); // half-diagonal — the reach of the field

  ctx.globalCompositeOperation = 'lighter';

  // BRIGHTNESS ramps with speed so the field starts nearly DARK (faint sub-light
  // sparks) and only blazes once the acceleration kicks — killing the "too much
  // light at the beginning". A small floor keeps a few sparks visible at rest.
  const glow = 0.1 + Math.pow(speed, 1.4) * 0.9;

  for (const star of stars) {
    // Fast stars (high seed) sit further out and stretch more, giving the
    // perspective tunnel: near-centre stars barely move, edge stars scream past.
    const speedBias = 0.25 + star.seed * 0.75;
    const reach = speed * speedBias;
    // The streak's leading (outer) point and trailing (inner) point along the ray.
    const rOuter = (0.04 + reach * 1.15) * half;
    // Length grows with speed so points become long lines at the jump apex — and
    // stretch further at full speed (×1.25) so the tunnel reads faster/longer.
    const len = (0.015 + reach * 1.25) * half;
    const rInner = Math.max(0, rOuter - len);

    const dx = Math.cos(star.angle);
    const dy = Math.sin(star.angle);
    const x1 = cx + dx * rOuter;
    const y1 = cy + dy * rOuter;
    const x0 = cx + dx * rInner;
    const y0 = cy + dy * rInner;

    // Colour: mostly white; a cool violet/teal minority like the reference frame.
    let stroke: string;
    const a = star.bright * alpha * glow;
    if (star.hue < 0.68) {
      stroke = `rgba(238, 240, 255, ${a})`;
    } else if (star.hue < 0.86) {
      stroke = `rgba(150, 140, 255, ${a})`; // violet spark
    } else {
      stroke = `rgba(120, 210, 235, ${a})`; // teal spark
    }

    ctx.strokeStyle = stroke;
    // Streaks thin out as they stretch (motion blur reads as fine lines).
    ctx.lineWidth = Math.max(0.6, (1.6 - speed) * 1.1 * dpr);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';

  // Central white flash at the jump apex — a radial bloom that whites out the
  // frame just as we swap the page underneath.
  if (flash > 0) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, half);
    grad.addColorStop(0, `rgba(255, 255, 255, ${flash})`);
    grad.addColorStop(0.35, `rgba(244, 246, 255, ${flash * 0.7})`);
    grad.addColorStop(1, 'rgba(230, 235, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function stopLoop(state: WarpState): void {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

/** Speed curve for the jump. A near-flat dark hold at the start (the field barely
 *  moves — the HUD flickers, the readout counts up), then a HARD exponential lunge
 *  into the light. `pow(t, 3.4)` keeps ~the first third almost still and slams the
 *  last third; the small linear term guarantees a hair of drift from frame one so
 *  it never looks frozen. Clamped ≤ 1. */
function jumpSpeed(t: number): number {
  return Math.min(1, Math.pow(t, 3.4) + t * 0.06);
}

/** The jump-out loop: a dark, held start that ACCELERATES hard into a white flash;
 *  the HUD flickers and the readout narrates the callouts; we navigate at the apex. */
function runJump(state: WarpState, href: string): void {
  state.phase = 'jump';
  state.href = href;
  state.navigated = false;
  state.canvas.dataset.warpActive = 'jump';
  resize(state);

  // Flicker the sitewide HUD for the jump (hud.css keys off this body class).
  document.body.classList.add(WARP_ACTIVE_CLASS);

  // Bottom-centre callouts: show the readout, seed the first line, and schedule the
  // rest across the jump so it reads like a cockpit sequence.
  clearLineTimers(state);
  showReadout(state, true);
  setReadout(state, WARP_LINES[0].label);
  for (let i = 1; i < WARP_LINES.length; i++) {
    const line = WARP_LINES[i];
    state.lineTimers.push(
      window.setTimeout(() => setReadout(state, line.label), JUMP_MS * line.at),
    );
  }

  const startCtx = window.performance ? performance.now() : 0;
  state.start = startCtx;

  const frame = (now: number): void => {
    const t = Math.min(1, (now - state.start) / JUMP_MS);
    // Hard-accelerating speed (dark hold → lunge). The flash is confined to the
    // final ~18% and ramps steeply so it BLOOMS at the apex, not gradually.
    const speed = jumpSpeed(t);
    const flash = t > 0.82 ? easeInQuad((t - 0.82) / 0.18) : 0;
    drawFrame(state, speed, flash, 1);

    // Navigate at the flash apex. Guarded so it fires exactly once.
    if (!state.navigated && now - state.start >= JUMP_MS - NAV_BEFORE_END_MS) {
      state.navigated = true;
      navigateNow(href);
    }

    if (t < 1) {
      state.raf = requestAnimationFrame(frame);
    } else {
      // Hold the white peak for a couple of frames until the swap's page-load
      // fires and hands us into runArrive(). If navigation somehow didn't happen
      // (engine race), keep painting a static bright frame — arrive will reset it.
      state.raf = requestAnimationFrame(() => drawFrame(state, 1, 1, 1));
    }
  };
  state.raf = requestAnimationFrame(frame);
}

/** The arrival loop: the streaks STAY fully stretched at lightspeed (no decelerate,
 *  no contract-back) and the whole field simply FADES OUT as the About content shows
 *  through — the jump keeps its momentum onto the page instead of braking. */
function runArrive(state: WarpState): void {
  stopLoop(state);
  state.phase = 'arrive';
  state.canvas.dataset.warpActive = 'arrive';
  resize(state);
  // The HUD flicker + readout belong to the jump only — stand them down on arrival.
  document.body.classList.remove(WARP_ACTIVE_CLASS);
  clearLineTimers(state);
  showReadout(state, false);
  state.start = window.performance ? performance.now() : 0;

  const frame = (now: number): void => {
    const t = Math.min(1, (now - state.start) / ARRIVE_MS);
    const e = easeOutCubic(t);
    // Speed is PINNED at full stretch — no shrink. Only the field's alpha (and the
    // receding flash) fall, so the streaks dissolve mid-flight at lightspeed.
    const speed = 1;
    const flash = (1 - e) * 0.45; // the flash recedes as the page appears
    const alpha = 1 - e;
    drawFrame(state, speed, flash, alpha);
    if (t < 1) {
      state.raf = requestAnimationFrame(frame);
    } else {
      // Done — clear the canvas and stand down so it never blocks a later frame.
      state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
      state.phase = 'idle';
      delete state.canvas.dataset.warpActive;
      stopLoop(state);
    }
  };
  state.raf = requestAnimationFrame(frame);
}

// --- Navigation ------------------------------------------------------------
// We use Astro's ClientRouter programmatic navigate() so the swap is a real SPA
// transition (no reload flash) and the persisted warp canvas keeps animating
// straight across it. The import is dynamic so this bundled script has no hard
// dependency ordering with the router.
function navigateNow(href: string): void {
  try {
    sessionStorage.setItem(WARP_FLAG, '1');
  } catch {
    /* private mode — arrival just won't play the decel; the jump still showed */
  }
  import('astro:transitions/client')
    .then(({ navigate }) => navigate(href))
    .catch(() => {
      // Router unavailable → hard nav. The flag is still set, so if the router
      // comes back on the destination the arrival still plays; otherwise it's a
      // plain load (the flag is single-use and cleared by the resurface handler).
      window.location.assign(href);
    });
}

// --- Reduced motion --------------------------------------------------------
function prefersReduced(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// --- Click interception ----------------------------------------------------
// Capture-phase so we run before any other click handler / the router's own link
// interception. We only claim clicks on same-origin About links with no modifier
// keys (so cmd/ctrl-click to open a new tab still works normally).
function isAboutLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Match the About route regardless of the base path: the path segment ends in
  // /about (trailing slash tolerant). The base (e.g. /personal-blog) prefixes it.
  const path = url.pathname.replace(/\/+$/, '');
  if (!/\/about$/.test(path)) return null;
  // Don't warp if we're already on About (a same-page click is a no-op nav).
  const here = window.location.pathname.replace(/\/+$/, '');
  if (here === path) return null;
  return anchor;
}

function onClick(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const anchor = isAboutLink(event.target);
  if (!anchor) return;
  // Reduced motion: let the click fall through to the normal navigation (the
  // router / plain link handles it); no light show.
  if (prefersReduced()) return;

  const state = ensureState();
  if (!state) return; // no canvas mounted → normal navigation

  event.preventDefault();
  // If a jump is already in flight, ignore repeat clicks.
  if (state.phase === 'jump') return;
  stopLoop(state);
  runJump(state, anchor.href);
}

// --- Arrival hook ----------------------------------------------------------
// Runs on every ClientRouter navigation (and the initial load). If we arrived via
// a warp (the single-use bh:warp flag), play the deceleration; otherwise ensure
// the canvas is clear so a normal load never shows streaks. Framed = the dev
// pre-load iframe (see BaseLayout's resurface handler) — bail so it doesn't eat
// the flag before the real swap reads it.
function onPageLoad(): void {
  if (window.self !== window.top) return;
  let warped = false;
  try {
    warped = sessionStorage.getItem(WARP_FLAG) === '1';
    sessionStorage.removeItem(WARP_FLAG);
  } catch {
    /* private mode — treat as a normal load */
  }
  const state = ensureState();
  if (!state) return;
  // The readout node is re-queried per load (ensureState caches it); refresh the
  // handle so a swapped-in DOM is picked up.
  state.readout = document.querySelector<HTMLElement>('[data-warp-readout]');
  if (warped && !prefersReduced()) {
    runArrive(state);
  } else {
    // Normal load / reduced motion: stand everything down so no streaks, flicker,
    // or callout linger on a page that wasn't reached via a warp.
    stopLoop(state);
    clearLineTimers(state);
    document.body.classList.remove(WARP_ACTIVE_CLASS);
    showReadout(state, false);
    state.phase = 'idle';
    delete state.canvas.dataset.warpActive;
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }
}

if (!window.__bhWarpBound) {
  window.__bhWarpBound = true;
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('astro:page-load', onPageLoad);
  window.addEventListener('resize', () => {
    const state = window.__bhWarp;
    if (state && state.phase !== 'idle') resize(state);
  });
}

export {};
