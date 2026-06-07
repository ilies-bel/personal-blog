// Centralized magic strings and scroll/beat tuning thresholds for the hero island.
// Keeping the DOM/storage keys, scroll-direction literals and debug-hook names in
// one module means a class string or localStorage key is never spelled inline.

// --- DOM / storage keys ----------------------------------------------------
/** Toggled on <body> once scroll leaves the top, fading the opening chrome. */
export const SCROLLED_BODY_CLASS = 'is-scrolled';
/** localStorage key persisting the chosen exploration-HUD target. */
export const HUD_SELECTED_STORAGE_KEY = 'hud-selected';

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
/** Scroll fraction at which the final selected-work HUD arms. */
export const EXPLORATION_TRIGGER_AT = 0.992;
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
} as const;

/** Read a numeric debug-hook override off window, or undefined if unset. */
export function readDebugNumber(key: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = (window as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}
