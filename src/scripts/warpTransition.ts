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

import { getMotion } from '../lib/motion';

const WARP_FLAG = 'bh:warp';

// --- Timing (ms) -----------------------------------------------------------
// The jump-out: the field starts almost DARK (a few faint drifting sparks — the
// ship still at sub-light), then accelerates HARD into the light and slams into
// the white flash. We navigate at the flash apex so the swap is hidden behind
// the brightest frame.
//
// P9 BUDGET: route transitions must stay UNDER 700ms PERCEIVED. The About copy
// is on screen the moment the swap lands (JUMP_MS - NAV_BEFORE_END_MS ≈ 450ms)
// and the arrival fade only dissolves the residual streaks OVER the already-
// readable page, so the perceived transition is ~JUMP_MS (≤ 700). The old
// 1500/750 set-piece read as a loading screen; the same acceleration curve at
// this length reads as a cut. test/route-transitions.test.mjs pins these.
const JUMP_MS = 560;
// The arrival: the streaks STAY fully stretched (no decelerate / contract-back)
// and the whole field simply fades out as the About content shows through — the
// jump carries its momentum right onto the page instead of braking.
const ARRIVE_MS = 380;
// Navigate this long before the jump animation nominally ends, i.e. right at the
// white-flash apex, so the (already-prepared) swap lands under the peak brightness.
const NAV_BEFORE_END_MS = 110;

// The body class that gates the sitewide HUD flicker (hud.css) for the jump.
const WARP_ACTIVE_CLASS = 'warp-active';

// The bottom-centre readout copy, swapped across the jump so the instrument
// narrates the jump like a cockpit callout. Timed as fractions of JUMP_MS.
// Two lines only at the P9 length — three callouts in ~560ms was unreadable.
const WARP_LINES: Array<{ at: number; label: string }> = [
  { at: 0, label: 'ENGAGING HYPERDRIVE' },
  { at: 0.5, label: 'PUNCH IT' },
];

// --- Starfield geometry ----------------------------------------------------
const STAR_COUNT = 460;

interface WarpStar {
  // Direction of travel from the centre (each star streaks outward along this ray).
  angle: number;
  // DEPTH position along the tunnel, 0 (far, near centre) → 1 (rushing past the
  // camera at the edge). This ADVANCES every frame by the star's own velocity, and
  // WRAPS back to ~0 when it exits — so the field is a continuous stream, not one
  // synchronised expansion. Mutated per frame (this is the whole trick).
  depth: number;
  // Per-star velocity multiplier. This is the key to the varied-speed look: a near
  // star (high vel) SCREAMS past as a long trail and respawns while a far star (low
  // vel) is still creeping — so at any instant the frame holds a spread of speeds,
  // exactly "stars passing so fast we only see the trail" mixed with slower ones.
  vel: number;
  // Per-star brightness + faint colour jitter (the reference has cool violet/teal
  // sparks among the white), so the field isn't a flat white.
  hue: number;
  bright: number;
  // DENSITY GATE (0..1): the star only lights up once the jump's density ramp
  // passes this threshold. Low-threshold stars appear first (a sparse field at
  // sub-light), high-threshold ones fill in as we accelerate — so the field starts
  // nearly EMPTY and grows in count, rather than showing all 460 from frame one.
  visThreshold: number;
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
  // Timestamp of the previous drawn frame, for the per-frame dt (framerate-
  // independent star advance). 0 = no prior frame yet (dt defaults to ~1/60).
  lastFrame: number;
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
    // vel spread is WIDE (0.35 → ~2.15, squared so most are slow-ish with a fast
    // tail): the squaring makes the fast streaks a minority, so the frame reads as a
    // slower field STREAKED THROUGH by a few blisteringly fast trails — the depth
    // cue. depth is seeded spread across the tunnel so the stream is populated from
    // frame one (not all bunched at the centre).
    const v = rand(i, 2);
    stars.push({
      angle: rand(i, 1) * Math.PI * 2,
      depth: rand(i, 5),
      vel: 0.35 + v * v * 1.8,
      // Mostly white (hue ~0 handled specially), with a minority of cool sparks.
      hue: rand(i, 3),
      bright: 0.45 + rand(i, 4) * 0.55,
      // Skewed toward 1 (via the cube) so only a SMALL fraction of stars have a low
      // threshold — the field opens with a sparse handful and the bulk fill in only
      // as the density ramp climbs near full speed.
      visThreshold: Math.pow(rand(i, 6), 0.6),
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
    lastFrame: 0,
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

/** Advance + draw one frame. `speed` is the global throttle (0 = the tunnel is
 *  crawling, 1 = full lightspeed); `dt` is the frame delta in seconds so motion is
 *  framerate-independent. Each star ADVANCES through the tunnel by its OWN velocity
 *  × speed, wrapping when it exits — so stars pass at different rates and the fast
 *  ones read as pure trails. `flash` is the central apex bloom; `alpha` fades the
 *  whole field on arrival. */
function drawFrame(
  state: WarpState,
  speed: number,
  dt: number,
  flash: number,
  alpha: number,
): void {
  const { ctx, w, h, dpr, stars } = state;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  const cx = w / 2;
  const cy = h / 2;
  const half = Math.hypot(cx, cy); // half-diagonal — the reach of the field

  ctx.globalCompositeOperation = 'lighter';

  // BRIGHTNESS ramps with speed so the field starts DIM (faint sub-light sparks)
  // and blazes once the acceleration kicks — killing the "too much light at the
  // beginning". The 0.28 floor is high enough that the varied-speed trails are
  // clearly VISIBLE through the middle of the jump (an earlier 0.1 floor left them
  // invisible until the very end); depth-brightness below still keeps near stars
  // brighter than far ones so the tunnel reads.
  const glow = 0.28 + Math.pow(speed, 1.1) * 0.72;
  // How far the whole field advances this frame. The 1.15 base rate is tuned so a
  // mid-velocity star crosses the tunnel in a beat at full speed; dt keeps it stable
  // across framerates. Clamp dt so a stall (tab blur, GC) can't teleport every star.
  const advance = speed * 1.15 * Math.min(dt, 0.05);
  // DENSITY ramp: how much of the field is lit this frame. Starts tiny (a sparse
  // handful of sparks at sub-light — the `0.06` seed) and climbs a touch AHEAD of
  // raw speed (pow < 1) so stars keep FILLING IN as we accelerate, reaching the full
  // 460 only at lightspeed. A star is drawn iff its visThreshold ≤ density; a narrow
  // band just below the threshold FADES it in so new stars don't pop.
  const density = Math.min(1, 0.06 + Math.pow(speed, 0.7) * 1.05);
  // LENGTH ramp: the global stretch factor for trails. Near zero at the start (stars
  // read as POINTS / tiny dashes) and grows super-linearly with speed so the dashes
  // only lengthen into streaks as we accelerate — no long dashes from frame one.
  const stretch = Math.pow(speed, 1.35);

  for (const star of stars) {
    // ADVANCE this star through the tunnel by its own velocity, and WRAP when it
    // exits past the camera (depth ≥ 1) back to just past the centre — the wrap is
    // what makes the stream continuous + the speeds independent.
    star.depth += advance * star.vel;
    if (star.depth >= 1) {
      star.depth -= 1; // recycle: reappears near the centre and races out again
    }

    // DENSITY GATE: skip stars the ramp hasn't reached yet, and fade in the ones
    // right at the frontier so the field grows smoothly instead of popping stars on.
    if (star.visThreshold > density) continue;
    const densFade = Math.min(1, (density - star.visThreshold) / 0.12);

    // Perspective: radius grows with the SQUARE of depth so a star accelerates as it
    // nears the camera (creeps at the centre, screams at the edge) — a real dolly
    // through a starfield, not a linear slide.
    const d = star.depth;
    const rOuter = (0.02 + d * d * 1.25) * half;
    // The TRAIL length is (instantaneous per-frame travel) × the global stretch —
    // so at low speed even a fast-moving star is a near-POINT (stretch → 0) and only
    // at speed does it draw a real streak. The tiny 0.004 floor keeps a visible spark
    // rather than a zero-length line. This is what makes the field open as DOTS and
    // lengthen into dashes/streaks as we accelerate.
    const instSpeed = advance * star.vel;
    const len = (0.004 + instSpeed * (0.3 + d * 2.4) * (0.15 + stretch)) * half;
    const rInner = Math.max(0, rOuter - len);

    const dx = Math.cos(star.angle);
    const dy = Math.sin(star.angle);
    const x1 = cx + dx * rOuter;
    const y1 = cy + dy * rOuter;
    const x0 = cx + dx * rInner;
    const y0 = cy + dy * rInner;

    // Colour: mostly white; a cool violet/teal minority like the reference frame.
    // Brightness rises with depth (near stars are brighter) and fades right at the
    // very edge so a star dims out gracefully instead of popping on wrap.
    let stroke: string;
    const edgeFade = d > 0.92 ? (1 - d) / 0.08 : 1;
    const a = star.bright * alpha * glow * (0.35 + d * 0.65) * edgeFade * densFade;
    if (star.hue < 0.68) {
      stroke = `rgba(238, 240, 255, ${a})`;
    } else if (star.hue < 0.86) {
      stroke = `rgba(150, 140, 255, ${a})`; // violet spark
    } else {
      stroke = `rgba(120, 210, 235, ${a})`; // teal spark
    }

    ctx.strokeStyle = stroke;
    // Near stars (high depth) are thicker; all thin out as the field speeds up so
    // fast trails read as fine light lines.
    ctx.lineWidth = Math.max(0.5, (0.6 + d * 1.4) * (1.4 - speed * 0.6) * dpr);
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

/** Seconds since the previous drawn frame (defaults to ~1/60 on the first frame),
 *  and record `now` for the next call. Framerate-independent star advance. */
function frameDelta(state: WarpState, now: number): number {
  const dt = state.lastFrame ? (now - state.lastFrame) / 1000 : 1 / 60;
  state.lastFrame = now;
  return dt;
}

/** Speed curve for the jump. A brief dark hold at the very start (the field barely
 *  drifts — the HUD flickers, the readout counts up), then a steady acceleration so
 *  the varied-speed trails are ON DISPLAY through the middle before it maxes into the
 *  flash. `pow(t, 1.9)` gives the accelerating feel without crushing all the motion
 *  into the last frames (an earlier, harsher curve left the middle of the jump nearly
 *  still + dark); the linear term keeps a hair of drift from frame one. Clamped ≤ 1. */
function jumpSpeed(t: number): number {
  return Math.min(1, Math.pow(t, 1.9) * 0.9 + t * 0.12);
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
  state.lastFrame = 0;

  const frame = (now: number): void => {
    const dt = frameDelta(state, now);
    // Clamp to [0,1]. The rAF timestamp of the first frame can be a hair EARLIER
    // than state.start (rAF `now` is the frame-start time; state.start is captured
    // when we scheduled it), giving a tiny NEGATIVE t — and jumpSpeed()'s
    // Math.pow(t, 1.9) on a negative base is NaN, which then poisons every star's
    // depth. Flooring t at 0 makes the first frame a clean speed-0 frame.
    const t = Math.max(0, Math.min(1, (now - state.start) / JUMP_MS));
    // Hard-accelerating speed (dark hold → lunge). The flash is confined to the
    // final ~18% and ramps steeply so it BLOOMS at the apex, not gradually.
    const speed = jumpSpeed(t);
    const flash = t > 0.82 ? easeInQuad((t - 0.82) / 0.18) : 0;
    drawFrame(state, speed, dt, flash, 1);

    // Navigate at the flash apex. Guarded so it fires exactly once.
    if (!state.navigated && now - state.start >= JUMP_MS - NAV_BEFORE_END_MS) {
      state.navigated = true;
      navigateNow(href);
    }

    if (t < 1) {
      state.raf = requestAnimationFrame(frame);
    } else {
      // Hold the white peak (streaks kept advancing at full speed) for a couple of
      // frames until the swap's page-load hands us into runArrive(). If navigation
      // somehow didn't happen (engine race), keep painting — arrive will reset it.
      state.raf = requestAnimationFrame((n) => drawFrame(state, 1, frameDelta(state, n), 1, 1));
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
  state.lastFrame = 0;

  const frame = (now: number): void => {
    const dt = frameDelta(state, now);
    const t = Math.max(0, Math.min(1, (now - state.start) / ARRIVE_MS));
    const e = easeOutCubic(t);
    // Speed stays at full lightspeed — the stars keep streaking past at their own
    // varied rates; only the field's alpha (and the receding flash) fall, so the
    // trails dissolve mid-flight instead of braking.
    const speed = 1;
    const flash = (1 - e) * 0.45; // the flash recedes as the page appears
    const alpha = 1 - e;
    drawFrame(state, speed, dt, flash, alpha);
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
// Resolved motion preference (manual override ?? OS) from the sitewide module.
function prefersReduced(): boolean {
  return getMotion() === 'reduced';
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
