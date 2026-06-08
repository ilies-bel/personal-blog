// hudLuminance.ts — a synthetic local-luminance model for the LEFT, vertically-
// centered HUD rail.
//
// The HUD sits over the live WebGL canvas, but the renderer is created WITHOUT
// `preserveDrawingBuffer` (see scene/createScene.ts), so reading the canvas
// pixels back returns black — a real per-frame readback is impossible without
// degrading the renderer. Instead we MODEL the luminance the rail sits over as a
// pure function of the lifecycle stage (the `legacyStageForProgress` fractional
// stage). Each control point below is a hand-authored estimate of how bright AND
// how noisy (busy with particle/bloom texture) the scene is *behind the left
// rail specifically* at that stage — the black hole's horizontal bloom and dense
// disk are bright + noisy on the left; the pale-blue-dot opening is near black.
//
// `luma` models perceptual luminance. Even though it is synthesized rather than
// measured, it is on the same 0..1 scale a Rec.709 luma would produce from the
// pixels — Rec.709 weights are 0.2126 R / 0.7152 G / 0.0722 B (exported below as
// LUMA_COEFFICIENTS for reference / any future real sampling path). `noise`
// models how textured/busy the region is (0 = flat field, 1 = dense grain), used
// to drive outline/scrim strength and the active-node emphasis.
//
// This module is PURE: no window/performance access, SSR-safe. The caller
// (HeroIsland) owns throttling, smoothing, hysteresis and the CSS writes.

/** Rec.709 luma coefficients. `luma` here is synthesized, not measured from
 *  pixels, but it lives on the same perceptual-luminance scale these define. */
export const LUMA_COEFFICIENTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

export interface HudLuminanceSample {
  /** Perceptual luminance behind the left rail, 0 (black) .. 1 (white). */
  luma: number;
  /** Texture/busyness of the region, 0 (flat) .. 1 (dense grain/bloom). */
  noise: number;
}

export interface HudLuminanceControlPoint {
  /** `legacyStageForProgress` fractional stage this point is authored for. */
  stage: number;
  luma: number;
  noise: number;
}

// Control points behind the LEFT rail, sorted by `stage` ASCENDING. These are
// the single tuning surface for the adaptive contrast: bump a luma/noise pair to
// change how the HUD reacts at that lifecycle beat. Stages map to lifecycle
// states (see CLAUDE.md): 0 = black hole, 0.32 = supernova whiteout, 1.05 =
// collapse, 2.05 = red giant, 2.9 = yellow star, 3.5 = nebula, 4.7 = pale dot.
export const HUD_LUMINANCE_TABLE: readonly HudLuminanceControlPoint[] = [
  // BLACK HOLE — bright horizontal bloom + dense particle noise across the frame.
  { stage: 0.0, luma: 0.8, noise: 0.85 },
  // SUPERNOVA — full whiteout blast.
  { stage: 0.32, luma: 0.95, noise: 0.8 },
  // COLLAPSE — bright core caving in, still busy.
  { stage: 1.05, luma: 0.45, noise: 0.55 },
  // RED GIANT — large warm orb, smoother surface.
  { stage: 2.05, luma: 0.4, noise: 0.3 },
  // YELLOW STAR — centered/right, so the left rail sits over a darker field.
  { stage: 2.9, luma: 0.34, noise: 0.2 },
  // NEBULA — soft smoky gas, low brightness, medium grain.
  { stage: 3.5, luma: 0.26, noise: 0.4 },
  // PALE BLUE DOT — a lone speck in a vast black field; near black.
  { stage: 4.7, luma: 0.06, noise: 0.05 },
] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Sample the synthetic luminance model at a lifecycle `stage`. Uses
 * nearest-two control-point linear interpolation and clamps at the table ends
 * (stages below the first / above the last point return that endpoint's values).
 * Pure math — no window access, safe to call during SSR or in a worker.
 */
export function sampleHudLuminance(stage: number): HudLuminanceSample {
  const table = HUD_LUMINANCE_TABLE;
  const first = table[0];
  const last = table[table.length - 1];

  if (stage <= first.stage) return { luma: first.luma, noise: first.noise };
  if (stage >= last.stage) return { luma: last.luma, noise: last.noise };

  // Table is sorted ascending; find the bracketing pair [lo, hi].
  for (let i = 0; i < table.length - 1; i += 1) {
    const lo = table[i];
    const hi = table[i + 1];
    if (stage >= lo.stage && stage <= hi.stage) {
      const span = hi.stage - lo.stage;
      const t = span === 0 ? 0 : (stage - lo.stage) / span;
      return {
        luma: lerp(lo.luma, hi.luma, t),
        noise: lerp(lo.noise, hi.noise, t),
      };
    }
  }

  // Unreachable given the clamps above, but keep the function total.
  return { luma: last.luma, noise: last.noise };
}
