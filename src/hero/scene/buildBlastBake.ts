// Supernova blast-field CUBEMAP bake — the vertex-bound collapse-flash fix.
//
// THE PROBLEM: the collapse-flash beat was VERTEX-bound (26.8fps on the host
// high tier): the disk vertex shader evaluated four fbm fields over the blast
// direction — lane (fbm·2.2), fil (fbm·6.0), crushBias (fbm·1.6) and spdLobe
// (fbm·1.3) — per vertex per frame during the blast (~16 value-noise calls).
//
// THE KEY FACT: all four are PURE functions of the per-particle unit blastDir
// (deliberately so — the blast is shaped by CONTINUOUS spatial fields, no aSeed
// or uTime term, so neighbouring particles travel as coherent sheets). So, per
// the granulation-bake precedent (buildGranBake.ts), they bake into ONE RGBA16F
// cubemap off the critical path and the shader swaps four fbm evaluations for
// one texture fetch — gated on uBlastBakeReady, with the analytic blastField()
// as the byte-identical fallback. Channels (RAW fields; the cheap shaping math
// stays in the vertex shader): .r lane, .g fil, .b crushBias, .a spdLobe — see
// BLAST_FIELD_GLSL in shaders/disk.glsl.ts, the SINGLE shared recipe.
//
// FACE SIZE 256: the finest field is fil at frequency 6.0 (feature scale ~1/6
// rad ≈ 9.5°); 256²/face is ~0.35°/texel, ~27 texels per feature — comfortably
// above the visibility floor (the granulation bake needed 512 for its 26-cells/
// rad field; this one is 4× coarser). 6 × 256² × 8B = 3.1 MB.
//
// SCHEDULING: baked at idle time after the first composited frame, in
// createScene's scheduleGpuWarm chain (the flash is mid-scroll — it cannot be
// reached in the first seconds). Kill-switch: ?blastbake=0 (resolveBlastBake).
import type * as THREE from 'three';
import { BLAST_FIELD_GLSL, GRAN_NOISE_GLSL } from '../shaders/disk.glsl';
import { buildFieldBake, type FieldBakeRig } from './buildFieldBake';

/** Cube face edge in texels. See the face-size note in the header. */
export const BLAST_BAKE_FACE_SIZE = 256;

export function buildBlastBake(renderer: THREE.WebGLRenderer): FieldBakeRig {
  // GRAN_NOISE_GLSL supplies the exact fbm/vnoise/h31 recipe the disk vertex
  // shader uses; BLAST_FIELD_GLSL is the shared blastField(dir) on top of it.
  return buildFieldBake(
    renderer,
    BLAST_BAKE_FACE_SIZE,
    /* glsl */ `
      ${GRAN_NOISE_GLSL}
      ${BLAST_FIELD_GLSL}
      vec4 bakeField(vec3 dir){ return blastField(dir); }
    `,
  );
}
