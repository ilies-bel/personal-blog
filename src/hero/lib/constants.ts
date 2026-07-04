// Centralized magic strings and scroll/beat tuning thresholds for the hero island.
// Keeping the DOM/storage keys, scroll-direction literals and debug-hook names in
// one module means a class string or localStorage key is never spelled inline.

// --- DOM / storage keys ----------------------------------------------------
/** Toggled on <body> once scroll leaves the top, fading the opening chrome. */
export const SCROLLED_BODY_CLASS = 'is-scrolled';
/** Toggled on <body> while scroll is still in the OPENING hold (progress <=
 *  SCROLL_HINT_DISMISS_AT, the black-hole opening frame). While present the page
 *  shows only the three opening layers — brand (top-left), the bottom-centre
 *  status readout, and the central focus dot — and the full section nav
 *  (.overlay-blog) + left HUD rail (.hud-system) are held hidden. Removed once the
 *  visitor scrolls past the opening hold, fading the nav/HUD in (and the dot out)
 *  on their existing eased transitions. Reuses the SAME SCROLL_HINT_DISMISS_AT seam
 *  the boot readout uses to hand the bottom-centre slot to the live compass, so
 *  "the visitor has moved" is one consistent boundary. Spelled here once. */
export const AT_OPENING_BODY_CLASS = 'at-opening';
/** Toggled on <body> once the HUD is powered (the boot FSM's `ready` state).
 *  Drives the cockpit chrome: the name grows, the top-right section labels
 *  brighten and lift, the corner frame ticks appear. Powered EITHER by scroll
 *  reaching the lifecycle's ending (auto-boot, first-visit story beat) or by the
 *  corner power button — one power bit, owned solely by the FSM in BaseLayout. */
export const HUD_ACTIVE_BODY_CLASS = 'hud-active';
/** Toggled on <body> while the HUD power-on sequence is playing — the loader /
 *  flicker / scan-sweep beat that sits BETWEEN idle and a fully-lit HUD. Owned by
 *  the boot FSM (BaseLayout's inline script). The rail / compass / menu stay DARK
 *  while it is present and only ignite once it is removed and HUD_ACTIVE_BODY_CLASS
 *  goes on. Centralized here so the class string is never spelled inline — it is
 *  referenced from the inline FSM AND from hud.css / scene.css. */
export const HUD_BOOTING_BODY_CLASS = 'hud-booting';
/** Toggled on <body> for the duration of a cinematic dive (a marker plunge into a
 *  star). Set by HeroIsland.beginDive the moment the dive is armed and cleared when
 *  the island unmounts (the SPA navigation the dive triggers). While present, the HUD
 *  chrome that would read as clutter mid-plunge is faded out — specifically the
 *  bottom-left instrument readout (.hud-frame-readout), so the age/station text
 *  disappears as the camera dives in. Centralized here so the string is never spelled
 *  inline — referenced from HeroIsland AND hud.css. */
export const DIVING_BODY_CLASS = 'bh-diving';
/** Toggled on <body> once the hero has painted its FIRST real frame (the GPU
 *  cloud is actually on the canvas). Drives the instant intro loader's fade-out:
 *  the loader is full-opacity at load (pure SSR markup, zero JS), and adding this
 *  class transitions it to transparent + pointer-events:none. The trigger is the
 *  ACTUAL first paint — the scene dispatches SCENE_READY_EVENT after its first
 *  frame() composites — NOT a blind timeout. A safety timeout only adds the class
 *  if that event somehow never arrives (e.g. a failed WebGL context) so the loader
 *  can never get stuck over a dead canvas. Centralized here so the string is never
 *  spelled inline — referenced from the inline loader script (index.astro) AND from
 *  scene.css. This class is ORTHOGONAL to the HUD body classes above: the loader
 *  fades on first paint, the HUD boot FSM ignites later at the black hole — they
 *  never touch each other's class. */
export const SCENE_READY_BODY_CLASS = 'scene-ready';
/** Toggled on <body> when the hero's WebGL visual cannot run — either WebGL is
 *  unavailable at mount (no/blocked context, so createScene throws before building
 *  the renderer) OR the GPU context was lost and could not be safely restored. It
 *  is the on-brand graceful-degradation signal: CSS keys a themed "this experience
 *  needs WebGL — here's the short version" note off it (the manifesto copy + the
 *  section nav links remain real, scroll-driven DOM, so they stay usable with no
 *  canvas). HeroIsland adds it from the dynamic-import `.catch()` (WebGL-at-mount
 *  failure) and from the scene's context-lost hook; the same path also reveals BOTH
 *  the loader (SCENE_READY_BODY_CLASS) AND the loader-gone gate
 *  (LOADER_GONE_BODY_CLASS) immediately so the page is never trapped behind the
 *  loader waiting out the 8s safety backstop, and the in-scene markers/nav are not
 *  left inert behind the loader-gone gate. Spelled here once so the class string is
 *  never inline. */
export const WEBGL_UNAVAILABLE_BODY_CLASS = 'webgl-unavailable';
/** Toggled on <body> once the intro loader is FULLY GONE — i.e. the dark
 *  `.scene-loader::before` background-opacity fade has COMPLETED and the scene
 *  is fully revealed. This is STRICTLY LATER than SCENE_READY_BODY_CLASS:
 *  scene-ready merely STARTS the dissolve (dot+name fade during the glide, then
 *  the dark layer fades out ~glide-start + glide-dur later). The in-scene star
 *  markers gate their interactivity on this class — they must be non-clickable,
 *  non-hoverable AND not Tab-focusable while the loader is still up (they sit
 *  UNDER the loader at z-index 60 but are live <a> links). Wired by the inline
 *  loader script in index.astro: it listens for the `transitionend` of the
 *  ::before opacity fade (the LAST thing to finish) and also arms a timeout
 *  backstop so the class is set even if that transitionend is missed
 *  (interrupted / reduced-motion / no-WebGL safety reveal). Idempotent. The
 *  inline script can't import this module (no bundler on an is:inline script)
 *  so it spells the SAME literal via define:vars and MUST be kept in sync.
 *  CSS gates pointer-events on `body:not(.loader-gone)` (hud.css); StarMarker
 *  also reads this class to drive tabIndex/aria so the <a> leaves the tab order
 *  until the loader is gone. */
export const LOADER_GONE_BODY_CLASS = 'loader-gone';
/** Minimum time (ms) the instant intro loader is held on the FIRST load of a
 *  browser session, so the boot sequence (LOADING → READY → glide-to-HUD) reads
 *  fully even when the scene paints fast. It is a FLOOR, never a cap: on first
 *  load the loader lifts at `max(scene:ready, LOADER_MIN_MS)`; a slower scene
 *  still waits for its real first frame. Kept comfortably under the 8s safety
 *  backstop (see the inline script in index.astro) so the two compose cleanly —
 *  the floor raises the early bound, the safety caps the late bound. Spelled here
 *  once and passed into the inline loader script via define:vars so there is no
 *  inline magic number. */
export const LOADER_MIN_MS = 2500;
/** sessionStorage key recording that the minimum-time loader has already played
 *  once THIS browser session. On first load the key is absent → apply the
 *  LOADER_MIN_MS floor, then set it; on subsequent loads in the same session
 *  (reloads, navigations back home) the key is present → skip the floor and
 *  reveal as soon as scene:ready fires. sessionStorage (NOT localStorage) is
 *  deliberate: the full boot shows once per session and a fresh session (new tab
 *  after close, next day) shows it again. Access is wrapped in try/catch (private
 *  mode / disabled storage must never throw). Spelled here once and passed into
 *  the inline loader script via define:vars. */
export const LOADER_SEEN_STORAGE_KEY = 'loader-seen';
/** localStorage key persisting the chosen exploration-HUD target. */
export const HUD_SELECTED_STORAGE_KEY = 'hud-selected';
/** localStorage key persisting the visitor's MANUAL reduced-motion override (a
 *  bare 'true'/'false' string). When present it WINS over the OS
 *  prefers-reduced-motion default and survives reloads + in-app navigations;
 *  when absent the OS preference is the source of truth. Written by the corner
 *  reduce-motion toggle (useReducedMotionPreference). Access is wrapped in
 *  try/catch (private mode / disabled storage must never throw). */
export const REDUCED_MOTION_STORAGE_KEY = 'bh:reduced-motion';
/** localStorage flag (a bare 'true') recording that the one-time OS-driven
 *  reduced-motion EXPLANATION modal has been shown. The page never animates for an
 *  OS reduced-motion visitor, so this explanatory modal ("you're seeing the still
 *  version because your system requests it") shows once and then stays dismissed
 *  across reloads — it must not nag on every load. The manual-toggle confirmation is
 *  separate and always shows on the click. Access wrapped in try/catch (private mode
 *  / disabled storage must never throw). */
export const REDUCED_MOTION_EXPLAINED_STORAGE_KEY = 'bh:reduced-motion-explained';
/** localStorage key persisting the HUD power state across reloads. The boot FSM
 *  writes a small JSON blob `{ powered: boolean, userChosen: boolean }` here on
 *  every transition and restores it on init, so a returning visitor finds the HUD
 *  lit (or dark) exactly as they left it — without being marched back through the
 *  ~3.6s boot. `userChosen` records that the visitor has ever clicked the power
 *  button; while true, scroll no longer auto-boots the HUD (legacy blobs' `forced`
 *  flag migrates to it on read). All access is wrapped in try/catch (private mode
 *  / disabled storage must never throw). */
export const HUD_STATE_STORAGE_KEY = 'hud-state';

// --- cross-layer events ----------------------------------------------------
/** The window CustomEvent HeroIsland dispatches to REQUEST a HUD power change. The
 *  island no longer owns body.hud-active directly — the boot FSM does — so it only
 *  signals intent. The detail is `{ on: boolean; source: 'scroll' }`: `on` is true
 *  once real scroll reaches the lifecycle's ending, false when it leaves. The FSM
 *  is the single owner of the body classes and decides what to do with the request
 *  (auto-boot only while the visitor has never touched the power button, plus the
 *  once-booted-stays-powered rule). The name lives here so the dispatcher
 *  (HeroIsland) and the listener (the inline FSM) never disagree on the string. */
export const HUD_POWER_EVENT = 'hud:power';
/** Detail payload carried by HUD_POWER_EVENT. */
export interface HudPowerEventDetail {
  /** Requested power state: true = power on, false = power off. */
  on: boolean;
  /** Where the request came from (only 'scroll' today; kept for future sources). */
  source: 'scroll';
}
/** The HUD boot duration, in milliseconds. The single source of truth for "how
 *  long does powering-up take" — referenced by the inline FSM's boot timer AND by
 *  hud.css's --hud-boot-dur (which MUST be kept in sync: the inline script also
 *  pushes this value into the CSS var on init so the two can never drift). ~3.6s:
 *  long enough to read like a machine running its start-up self-check. */
export const HUD_BOOT_DURATION_MS = 3600;
/** "Brief solo, then HUD arms": how long the closing pale-blue-dot beat holds ALONE
 *  before HeroIsland asks the boot FSM to power the HUD up. When real scroll first
 *  reaches the physical bottom (the lonely speck / 'beginning' scene), the island
 *  WAITS this long before dispatching HUD_POWER_EVENT{on:true}, so the lone dot lands
 *  in silence for a beat and only THEN does the rail/compass boot in. Scrolling back
 *  UP off the bottom before the timer fires CANCELS the pending power-on (the dot was
 *  only glanced, not arrived at). This is the tunable hold length — dial UP for a
 *  longer solo, DOWN (toward 0) to arm the HUD the instant the dot lands. It is the
 *  pre-boot pause; the ~3.6s boot loader (HUD_BOOT_DURATION_MS) still plays after. */
export const HUD_DOT_SOLO_HOLD_MS = 1100;
/** The window CustomEvent the scene dispatches ONCE, after its first frame has
 *  rendered + composited (see createScene's frame()). The instant intro loader
 *  listens for it to fade itself out (add SCENE_READY_BODY_CLASS). The name lives
 *  here so the dispatcher (createScene) and the listener (the inline loader script
 *  in index.astro) can never disagree on the string. The inline script can't import
 *  this module — no bundler on an is:inline script — so it spells the SAME literal
 *  and MUST be kept in sync with this value. */
export const SCENE_READY_EVENT = 'scene:ready';

// --- scroll direction ------------------------------------------------------
export type ScrollDirection = 'down' | 'up';
export const SCROLL_DOWN: ScrollDirection = 'down';
export const SCROLL_UP: ScrollDirection = 'up';

/** Which outer edge of a beat's opacity trapezoid is pinned full-open. */
export type BeatEdge = 'leading' | 'trailing';

// --- scroll / chrome / exploration thresholds ------------------------------
/** Ignore scroll deltas smaller than this so sub-pixel jitter never flips the
 *  big-line direction swap. */
export const DIRECTION_DEADZONE = 0.0008;
/** Past this scroll fraction the opening chrome (name + menu) fades out; small
 *  enough that the very first wheel nudge begins the hide. */
export const CHROME_HIDE_AT = 0.015;
/** Once the visitor has moved this far, the opening hold is over. Also marks the
 *  compass's at-top vs recovery boundary: at/below this the bottom-centre compass
 *  is still in the opening hold and stays in plain SEEKING-SIGNAL scan; past it, a
 *  mid-transition idle band switches the compass to its SCROLL-BACK recovery cue. */
export const SCROLL_HINT_DISMISS_AT = 0.035;
/** Scroll fraction at which the final selected-work HUD would arm. NOTE: the HUD
 *  is now ALWAYS visible (see HeroIsland — explorationMode starts true), so nothing
 *  reads this anymore; kept for reference / a possible future re-gate. */
export const EXPLORATION_TRIGGER_AT = 0.82;
/** Delay before the HUD reveals after the trigger; kept scroll-immediate. */
export const EXPLORATION_REVEAL_DELAY_MS = 0;

// --- per-beat opacity trapezoid --------------------------------------------
/** Half-width of a beat's fully-shown plateau. */
export const BEAT_HOLD = 0.055;
/** Ramp distance on each side of the plateau. */
export const BEAT_FADE = 0.045;

// --- debug capture hooks (window.__bh*) ------------------------------------
// Capture scripts pin a held frame by setting these on window. Reads go through
// readDebugNumber() so the property name is spelled once, here.
export const DEBUG_WINDOW_KEYS = {
  morph: '__bhMorph',
  flash: '__bhFlash',
  flashDir: '__bhFlashDir',
  nebulaFlash: '__bhNebulaFlash',
  nebLight: '__bhNebLight',
  backdropStage: '__bhBackdropStage',
  streak: '__bhStreak',
  /** Hold a click eruption (0..1 intensity) at a fixed camera-facing point so the
   *  geyser + ripple can be inspected without actually clicking the star. */
  erupt: '__bhErupt',
  /** Hold a click eruption (0..1 intensity) at a fixed camera-facing point on the
   *  PARTICLE red giant so its jet + surface ripple can be inspected without clicking
   *  (pair with __bhMorph at a red-giant stage, e.g. ≈2.3). */
  giantErupt: '__bhGiantErupt',
  /** DEV live-tune: master strength of the yellow-star click-ripple DOMAIN WARP (how hard
   *  the granulation cells stream with the travelling wavefront). 0 = frozen texture, 1 =
   *  default. Set window.__waveFlow in the console; removed once the look is dialled in. */
  waveFlow: '__waveFlow',
  /** DEV framing panel: override the held red-giant world radius live (only while pinned
   *  at the held giant). Resolved into a base-scale factor and fed to applyLook. */
  giantSize: '__bhGiantSize',
  /** DEV framing panel: nudge the red-giant off-centre composition live on the X axis
   *  (baked into RED_COMPOSITION; rides the red-giant beat weight so no snap). */
  giantPosX: '__bhGiantPosX',
  /** DEV framing panel: nudge the red-giant off-centre composition live on the Y axis
   *  (baked into RED_COMPOSITION; rides the red-giant beat weight so no snap). */
  giantPosY: '__bhGiantPosY',
  /** Force the device tier ('high' | 'low') so the low-end fallback can be tested on
   *  any machine without spoofing hardware. Read as a STRING via readDebugString and
   *  honoured FIRST by detectDeviceTier (overrides the cheap auto-detect signals). */
  tier: '__bhTier',
  /** Set truthy (e.g. 1) to make the scene PUBLISH a per-frame `window.__bhLook`
   *  snapshot of the resolved collapse-handoff scalars (stage, sim availability/bake
   *  state, the cloudBright/nebFade envelopes, body weights, camera distance) so a
   *  capture script can assert what a pinned frame actually computed (pairs with
   *  __bhMorph; see scratchpad/shoot-nebula-handoff.mjs). Unlike the other keys this
   *  gates an OUTPUT; it costs nothing while unset. */
  inspect: '__bhInspect',
} as const;

// --- cross-layer cursor bridge (window.__bh*) ------------------------------
// Not a debug-capture hook: a real runtime function the scene publishes so the
// standalone custom-cursor IIFE (src/components/CustomCursor.astro) can ask
// whether a point is over the red giant — without importing three.js / the
// scene. HeroIsland sets it on mount and deletes it on unmount. The cursor reads
// the SAME literal name (it can't import this module), so keep the two in sync.
export const CURSOR_WINDOW_KEYS = {
  /** (clientX, clientY) → boolean: is the point over either clickable star body?
   *  Returns true for the live red-giant sphere (redGiantClickable beat) OR the
   *  yellow-star photosphere mesh (sunClickable beat). Never depends on HUD state. */
  hitGiant: '__bhHitGiant',
} as const;

/** Read a numeric debug-hook override off window, or undefined if unset. */
export function readDebugNumber(key: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** Read a string debug-hook override off window, or undefined if unset. Mirrors
 *  readDebugNumber's SSR guard + window access; used by detectDeviceTier to honour
 *  the __bhTier ('high' | 'low') force-override before any auto-detect signal. */
export function readDebugString(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
