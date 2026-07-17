// Post-processing chain: render pass -> bloom -> film grade -> nova whiteout.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CFG, FILM_GRAIN_AMT, resolveGrainAmt } from '../lib/config';
import { GradeShader, NovaShader } from '../shaders/post.glsl';
import type { Rig } from './types';

// Bloom build mode. 'full' is the desktop/high pass — the UnrealBloom mip pyramid
// runs at the FULL composer resolution (byte-identical default). 'cheap' is the
// low tier: the SAME pass, but its internal render targets are sized to a fraction
// of the composer (bloomScale below) so the mip-blur pyramid costs ~¼ the pixels —
// and, as a free bonus, rendering the blur at low res naturally softens/spreads it,
// which is exactly the grain-smoothing the sparse low-tier cloud needs. 'none' skips
// the pass entirely (chain becomes RenderPass → Grade → Nova, `bloom` left null).
export type BloomQuality = 'full' | 'cheap' | 'none';

// Fraction of the composer resolution each bloom mode renders its blur pyramid at.
// 'full' = 1.0 (high path, unchanged). 'cheap' = 0.5 → a quarter of the pixels
// (CONSERVATIVE; halving each axis), which both cuts the cost and softens the glow.
// 'cheap' was 0.5; 0.3 (~1/11 the pixels of full) buys back most of the remaining
// pyramid cost on software rasterisers while spreading the glow slightly wider —
// which is the low tier's grain-smoothing job anyway. 'full' stays byte-identical.
const BLOOM_SCALE: Record<BloomQuality, number> = { full: 1.0, cheap: 0.3, none: 1.0 };
// The cheap (low-res) bloom is the low tier's main grain-smoother (it spreads each
// sparse grain's light into a glow), so we keep its strength at full and give it a
// slightly WIDER radius than the high pass — the extra spread melts the convection
// granules of the red giant together into a smooth molten surface. 1.0 = identical to
// CFG, so the 'full' path is byte-identical (these only apply to the 'cheap' variant).
const BLOOM_STRENGTH_MUL: Record<BloomQuality, number> = { full: 1.0, cheap: 1.0, none: 1.0 };
const BLOOM_RADIUS_MUL: Record<BloomQuality, number> = { full: 1.0, cheap: 1.15, none: 1.0 };

// PostRig is a plain Rig (no shared `uniforms` block): its tunable values live on
// the bloom pass + the grade/nova ShaderPasses, not one shared uniform object.
export interface PostRig extends Rig {
  composer: EffectComposer;
  // Null only when bloomQuality === 'none': the bloom pass is skipped entirely, so
  // the chain runs RenderPass → Grade → Nova. Callers that write to bloom MUST
  // null-guard. Non-null on BOTH the 'full' (high) and 'cheap' (low) paths — on low
  // it is now a quarter-res UnrealBloom rather than nothing, so the existing
  // per-frame `if (bloom)` writes (strength/radius) execute and drive it correctly.
  bloom: UnrealBloomPass | null;
  gradePass: ShaderPass;
  novaPass: ShaderPass;
  render: () => void;
  setSize: (w: number, h: number) => void;
  dispose: () => void;
}
export function buildPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  bloomQuality: BloomQuality = 'full',
  // Tier-default luminance-adaptive grain strength (uGrainAmt). createScene
  // passes FILM_GRAIN_AMT_MID on the mid tier (the stronger grain that textures
  // the half-density cloud's wider dark gaps); everyone else gets the shipped
  // FILM_GRAIN_AMT. An explicit ?grain= still overrides (resolveGrainAmt).
  grainAmtDefault: number = FILM_GRAIN_AMT,
): PostRig {
  // RT precision: the 'full'/'none' chains keep the shipped HalfFloat targets
  // (HDR headroom for the bloom threshold — byte-identical high/mid path). The
  // 'cheap' (low-tier) chain runs UnsignedByte targets instead: on the software
  // rasterisers the low tier classifies (SwiftShader et al), FP16 blending of the
  // additive sprite cloud is the single most expensive raster mode — byte targets
  // measured ~4-6ms/frame cheaper on the bench. The cost is clamping >1.0
  // accumulation before bloom, which slightly flattens the very brightest core —
  // masked on low by the wider cheap-bloom spread + adaptive grain.
  const rtType = bloomQuality === 'cheap' ? THREE.UnsignedByteType : THREE.HalfFloatType;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: rtType }));
  composer.addPass(new RenderPass(scene, camera));
  // Bloom is the most expensive pass (a mip pyramid of blurs). 'full' builds it at
  // the composer resolution EXACTLY as before (high path, byte-identical). 'cheap'
  // builds the SAME pass but sizes its mip pyramid to bloomScale·resolution (¼ the
  // pixels at scale 0.5) — far cheaper, and softer (the low-res blur spreads), which
  // smooths the sparse low-tier grains. 'none' leaves `bloom` null (no pass at all).
  const bloomScale = BLOOM_SCALE[bloomQuality];
  let bloom: UnrealBloomPass | null = null;
  if (bloomQuality !== 'none') {
    bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      CFG.bloomStr * BLOOM_STRENGTH_MUL[bloomQuality],
      CFG.bloomRad * BLOOM_RADIUS_MUL[bloomQuality],
      0.55,
    );
    composer.addPass(bloom);
    // UnrealBloomPass hardcodes HalfFloatType for its internal mip targets; on the
    // 'cheap' (low-tier) chain retype them to UnsignedByte to match the composer
    // (same FP16-blending cost story as above). dispose() drops the yet-unused GPU
    // allocation; three lazily re-allocates each target with the new type on first
    // use. 'full' never enters this branch — high/mid bloom is byte-identical.
    if (bloomQuality === 'cheap') {
      for (const rt of [...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical, bloom.renderTargetBright]) {
        rt.texture.type = THREE.UnsignedByteType;
        rt.dispose();
      }
    }
  }
  const gradePass = new ShaderPass(GradeShader);
  gradePass.uniforms.uExposure.value = CFG.exposure;
  gradePass.uniforms.uGrain.value = CFG.grain;
  // Luminance-adaptive film grain strength (?grain= A/B lever; the tier default
  // threaded in by the caller — FILM_GRAIN_AMT, or FILM_GRAIN_AMT_MID on mid —
  // 0 = off → the grain term contributes exactly 0). Resolved ONCE at chain
  // build; the per-frame uGrainSeed re-seed lives in createScene's loop.
  gradePass.uniforms.uGrainAmt.value = resolveGrainAmt(grainAmtDefault);
  gradePass.uniforms.uWarmth.value = CFG.warmth;
  gradePass.uniforms.uSat.value = CFG.saturation;
  gradePass.uniforms.uOlive.value = CFG.olive;
  gradePass.renderToScreen = false; // the nova whiteout is now the final pass
  composer.addPass(gradePass);
  // The supernova whiteout MUST composite AFTER grade — the grade tone-map +
  // vignette + clamp would otherwise swallow the white to muddy grey. This pass
  // takes over renderToScreen and mixes the graded frame toward (capped) white
  // by the time-based `uNova` envelope driven each frame in frame().
  const novaPass = new ShaderPass(NovaShader);
  novaPass.renderToScreen = true;
  composer.addPass(novaPass);

  const setSize = (w: number, h: number): void => {
    // The composer (scene + grade + nova) ALWAYS renders at full resolution — DPR is
    // already capped at 1.0 on the low tier, so "full res" is itself cheap there. Only
    // the bloom mip pyramid is shrunk: at bloomScale 0.5 it blurs a quarter-res buffer,
    // which is both far cheaper and softer. At scale 1.0 ('full') this is bloom.setSize(w,h)
    // verbatim → high path byte-identical. setSize re-applies the scale on every resize.
    composer.setSize(w, h);
    if (bloom) bloom.setSize(Math.round(w * bloomScale), Math.round(h * bloomScale)); // skipped only when 'none'
  };
  const render = (): void => {
    composer.render();
  };
  const dispose = (): void => {
    composer.dispose();
    gradePass.material.dispose();
    novaPass.material.dispose();
    if (bloom) bloom.dispose(); // skipped only when bloomQuality === 'none'
  };

  return { composer, bloom, gradePass, novaPass, render, setSize, dispose };
}
