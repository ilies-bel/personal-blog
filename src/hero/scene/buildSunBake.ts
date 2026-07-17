// Yellow-star photosphere CUBEMAP bake — the LOW-tier fragment-bound sun fix.
//
// THE PROBLEM: the yellow-star photosphere (shaders/sun.glsl.ts) runs 8 fbm
// evaluations of 6 simplex octaves each (48 snoise calls) PER PIXEL PER FRAME —
// 51.8 ms/frame on the software-GL low tier (19.3fps, the only hard 30fps
// failure in the per-scene bench). High/mid render it comfortably (120fps).
//
// THE FIX (LOW tier only): the three scalars the shader consumes (m — the big
// mottle field, ch — the chromospheric network, granMul — the combined
// granulation brightness multiplier) are pure functions of the surface
// direction at frozen time/no click-warp, so they bake into ONE RGBA16F cubemap
// and the fragment stack collapses to a single fetch. The slow time scroll is
// kept by ROTATING the lookup direction (see sunSurfaceField's baked branch) —
// no re-bake. High/mid never build this rig and keep the analytic path
// byte-identical; ?sunbake=0 (resolveSunBake) is the low-tier kill-switch, and
// a failed bake leaves uSunBakeReady at 0 → the analytic fallback.
//
// FACE SIZE 256: the finest baked octave is gran3 at domain frequency 2.4·28 ≈
// 67 rad⁻¹ (feature scale ≈ 0.85°) — ~2.4 texels/feature at 256²/face
// (0.35°/texel), which slightly softens the very finest stipple. That octave
// carries a 0.07 weight inside a brightness multiplier, and this path only ever
// runs on the LOW tier (small render targets, software rasterisers) where the
// analytic alternative is 19fps — the trade is deliberate. 512 would quadruple
// the SwiftShader bake cost (the bake itself runs the full 48-snoise stack per
// texel, once). 6 × 256² × 8B = 3.1 MB.
import type * as THREE from 'three';
import { SUN_NOISE_GLSL, SUN_SURFACE_FIELD_GLSL } from '../shaders/sun.glsl';
import { buildFieldBake, type FieldBakeRig } from './buildFieldBake';

/** Cube face edge in texels. See the face-size note in the header. */
export const SUN_BAKE_FACE_SIZE = 256;

export function buildSunBake(renderer: THREE.WebGLRenderer): FieldBakeRig {
  // SUN_NOISE_GLSL supplies the exact snoise/fbm recipe the photosphere fragment
  // uses; SUN_SURFACE_FIELD_GLSL is the shared sunSurfaceField() on top of it.
  // Baked with t = 0 and waveDisp = vec3(0): the frozen-time, no-click values —
  // the runtime lookup re-introduces the time scroll by rotating the direction.
  return buildFieldBake(
    renderer,
    SUN_BAKE_FACE_SIZE,
    /* glsl */ `
      ${SUN_NOISE_GLSL}
      ${SUN_SURFACE_FIELD_GLSL}
      vec4 bakeField(vec3 dir){ return vec4(sunSurfaceField(dir, 0.0, vec3(0.0)), 0.0); }
    `,
  );
}
