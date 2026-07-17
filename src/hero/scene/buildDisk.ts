// Accretion-disk GPU-particle rig (1.2M points; two lensed images share one geometry).
import * as THREE from 'three';
import { CFG, densityCompensation } from '../lib/config';
import { simDimensions } from '../gravitySim';
import { diskVertexShader, diskFragmentShader, DISK_ERUPT_SLOTS, DISK_TAIL_EPS } from '../shaders/disk.glsl';
import type { Uniforms, UniformRig } from './types';

export interface DiskRig extends UniformRig {
  primary: THREE.ShaderMaterial; // bright crescent (primary lensed image)
  secondary: THREE.ShaderMaterial; // lower grainy band (secondary image, sign -1)
  primaryPts: THREE.Points; // the primary Points object (frame toggles .visible)
  secondaryPts: THREE.Points; // the secondary Points object (.visible too)
  geo: THREE.BufferGeometry;
  uniforms: Uniforms; // shared uniform block (primary's; secondary clones it)
  // per-particle identity arrays — handed to the GPGPU collapse sim so its seed
  // pass reproduces the exact analytic nebula placement for these same particles.
  aSeed: Float32Array;
  aU: Float32Array;
  aPhase: Float32Array;
  count: number;
  dispose: () => void;
}
export function buildDisk(scene: THREE.Scene, particleCount: number, pixelRatio: number, lowTier = false, forceDensityComp = false): DiskRig {
  const N = Math.floor(particleCount);
  // Low-tier density compensation (no-op unless lowTier → high path + every high-tier
  // width bucket stay byte-identical; only the low fallback buckets are boosted). The
  // low tier draws ~2× fewer grains than the desktop cloud and runs only a CHEAP
  // quarter-res bloom, so we still lift per-grain emission (brightGain) and grain size
  // (pointGain) to keep the cloud legible — but only MODESTLY now that bloom + the 2×
  // particle bump carry most of the load. See densityCompensation() in config.ts for
  // the (lighter) sublinear formula and the tier gate. `forceDensityComp` is the
  // debug ?density= A/B path (resolveDensityScale < 1): the scaled count flows
  // through the SAME ratio-based compensation the low tier uses (tier gate + sanity
  // bound bypassed), so sprites auto-fatten as the cloud thins.
  const comp = densityCompensation(N, CFG.diskParticles, lowTier, forceDensityComp);
  const aU = new Float32Array(N);
  const aPhase = new Float32Array(N);
  const aThickN = new Float32Array(N);
  const aSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    aU[i] = Math.random();
    aPhase[i] = Math.random() * Math.PI * 2.0;
    const th = Math.random() * 2.0 - 1.0;
    aThickN[i] = th * th * th;
    aSeed[i] = Math.random();
  }
  // per-particle texel UV into the GPGPU collapse sim's position texture. Maps
  // vertex index i → texel-center UV in the (width × height) sim grid, matching
  // buildGravitySim's row-major seed layout. (No-op unless uSimBlend > 0.)
  const sim = simDimensions(N);
  const aSimUV = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    aSimUV[i * 2 + 0] = ((i % sim.width) + 0.5) / sim.width;
    aSimUV[i * 2 + 1] = (Math.floor(i / sim.width) + 0.5) / sim.height;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aThickN', new THREE.BufferAttribute(aThickN, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute('aSimUV', new THREE.BufferAttribute(aSimUV, 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    // dedicated always-live clock for the opening pale-blue-dot's brightness breath
    // (uTime is frozen across the nebula window, which includes the dot — see frame()).
    uDotTime: { value: 0 },
    uOmega0: { value: CFG.omega0 },
    uSpinDir: { value: CFG.spinDir },
    uBetaScale: { value: CFG.betaScale },
    uBeamExp: { value: CFG.beamExp },
    uDoppler: { value: CFG.doppler },
    uRin: { value: CFG.rIn },
    uRout: { value: CFG.rOut },
    uThick: { value: CFG.diskThickness },
    uPixelRatio: { value: pixelRatio },
    uThetaE: { value: 0.1 },
    uShadowR: { value: 0.1 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uSat: { value: CFG.saturation },
    uSec: { value: CFG.secScale },
    uSecOffsetX: { value: 0 }, // dev: nudge secondary band L/R (NDC-aspect units)
    uSecOffsetY: { value: 0 }, // dev: nudge secondary band up/down to close the seam
    uHole: { value: 0.12 },
    uVertAsym: { value: CFG.vertAsym },
    uHorizAsym: { value: CFG.horizAsym },
    uDistrib: { value: CFG.diskDistrib },
    // Black-hole-only geometric shrink: 1 = full accretion disk, →small as the hole
    // implodes toward the seed (driven per-frame from lifecycle.blackHoleScale). The
    // shader gates it to uGiant==0, so the red giant / nebula / dot / sim seed are all
    // untouched. It makes the HOLE read as visibly smaller (not just farther away).
    uBlackHoleScale: { value: 1 },
    uBright: { value: 1.25 * comp.brightGain }, // disk brightness multiplier (brightened).
    //   ×comp.brightGain on the low tier ONLY (1.0 on high + every high-tier width bucket →
    //   stays exactly 1.25): the thinned grain cloud accumulates less additive light, so each
    //   grain emits a touch harder to keep the object from going dim/sparse. This is now a
    //   MODEST lift (the cheap quarter-res bloom + ~2× grains restore most of the brightness);
    //   see config's densityCompensation (lighter sublinear formula, capped, tier-gated).
    uSizeScale: { value: 1 }, // half-res particle pass: the offscreen target's resolution ÷ the
    //   composer's. 1 (default) = full-res single pass, exact shader no-op. createScene sets it to
    //   the particle-pass scale when the split is active, so sprite SCREEN footprints (and, via
    //   vSizeComp, raster-floored sprite energy) match the full-res raster. Static — set once.
    uTailEps: { value: DISK_TAIL_EPS }, // invisible-tail discard epsilon (fill-rate trim).
    //   Fragments whose final additive intensity lands under this are discarded before the
    //   blend (they're below the HalfFloat pipeline's visible threshold). Overridable at
    //   runtime via __bhTailEps for A/B (0 = off → original output, byte-identical).
    uPointGain: { value: comp.pointGain }, // grain-SIZE multiplier, low tier ONLY (1.0 at full
    //   count → byte-identical high path). Fattens each grain so the sparse low-tier cloud
    //   overlaps back into continuous gas (e.g. the red-giant photosphere stops reading as a
    //   dotted ring). Multiplied into baseSize in the vertex shader (propagates to every
    //   point-size branch) and into the per-branch clamp ceilings so the gain isn't capped away.
    uMorph: { value: 0 }, // transition 1: reverse supernova (scroll-driven)
    uFlash: { value: 0 }, // central burst envelope (peaks mid-morph)
    uCollapse: { value: 0 }, // red-giant surface collapse (0 sphere → 1 point)
    uGiant: { value: 0 }, // transition 2: remnant cloud → sun
    uGiantR: { value: 4.2 }, // base scale (world units). SHARED by red giant, yellow
    //   star, nebula extent AND the gravity-sim seed — do NOT repurpose it for the
    //   red-giant size alone (that's uGiantScale below). Keep at 4.2.
    // Red giant ONLY: it grows BIG and bloated but stays CENTRED at the world origin
    // (the supernova collapses centred, the star grows centred). The big off-centre
    // "vast limb" framing is a CAMERA move (see createScene's red-giant park), NOT a
    // geometry offset — so uGiantCenter defaults to origin.
    uGiantScale: { value: 10.5 / 4.2 }, // red-giant-only radius ×base. MEDIUM (~10.5, dense) not
    //   the old bloated ~17.6 — the fixed grain count goes sparse on a huge sphere. The
    //   lifecycle ramps this during the reveal (small newborn → this held size). This is
    //   the SAME value as transitions.ts' GIANT_RADIUS_SCALE (= 10.5/4.2), the single
    //   source shared with lifecycle's GIANT_FULL + createScene's RED_GIANT_RADIUS — keep
    //   in sync (left as the literal here so this uniform default reads at a glance).
    uGiantCenter: { value: new THREE.Vector3(0, 0, 0) }, // centred; framing is a camera move
    uGiantSpin: { value: 0 }, // axial spin angle (radians); driven per-frame from uTime
    uGranScale: { value: 26.0 }, // granulation cell frequency across the surface
    // --- baked red-giant granulation cubemap (scene/buildGranBake.ts) ---------
    // uGranBakeReady stays 0 (the analytic per-frame path — today's exact shader)
    // until createScene's boot-time bake completes and flips it; it NEVER flips on
    // the low tier, under ?rgbake=0, or if the bake fails. uGranTex is only ever
    // sampled behind that gate (three binds a default cube texture while null).
    uGranTex: { value: null },
    uGranBakeReady: { value: 0 },
    // --- baked supernova blast-field cubemap (scene/buildBlastBake.ts) --------
    // uBlastBakeReady stays 0 (the analytic per-frame blastField() — today's
    // exact shader) until createScene's idle-time bake completes and flips it; it
    // never flips under ?blastbake=0, without WebGL2, or if the bake fails.
    // uBlastTex is only ever sampled behind that gate (three binds a default
    // cube texture while null).
    uBlastTex: { value: null },
    uBlastBakeReady: { value: 0 },
    // --- Later lifecycle transitions (scroll-driven 0..1 each). The scroll
    //     timeline drives these per frame; the shader body consumes them to morph
    //     the star onward. They sit on the timeline AFTER the red giant:
    //       uYellow: red giant → yellow (sun-like) star   (transition 3)
    //       uNebula: yellow star → nebula                 (transition 4)
    //       uDot:    nebula → pale blue dot               (transition 5)
    uYellow: { value: 0 },
    uNebula: { value: 0 },
    uDot: { value: 0 },
    uNebulaGrow: { value: 1 },
    uNebLight: { value: 1 }, // nebula ambient+depth light model strength (0 flat → 1 full)
    uNebFade: { value: 1 }, // global gas-density fade across the collapse window (1 full gas → 0 fully agglomerated). Applied AFTER the frag's per-grain intensity floors, which uBright cannot cross.
    // --- yellow star → red giant flash-swap (transition 3, scroll 3→2). These
    //     drive ONLY the point-cloud's gold→red sphere during the yellow⇄red
    //     slot; all three default to a no-op so every other stage is unchanged.
    uYrFlash: { value: 0 }, // brief swap flash: whitens the freshly-spawned gold sphere
    uYrMix: { value: 1 }, // 0 = smooth gold sphere, 1 = granular red giant
    uYrGrow: { value: 1 }, // 0 = yellow radius (×0.35), 1 = red-giant radius
    // --- nebula → yellow star: gravitational collapse ---
    // BAKED collapse flipbook (see gravitySim.bake): two snapshot textures bracketing
    // the scroll position + the blend between them. The render loop sets these per
    // frame from gravitySim.sampleAt(look.collapse); uSimBlend morphs the result into
    // the analytic nebula placement across the collapse window.
    uSimPos: { value: null }, // snapshot A (xyz = world pos, w = life)
    uSimPosB: { value: null }, // snapshot B (next baked frame)
    uSimMix: { value: 0 }, // 0 → A, 1 → B (inter-snapshot blend)
    uSimBlend: { value: 0 }, // 0 = analytic placement, 1 = fully sim-driven
    // --- CLICK ERUPTIONS on the particle red giant (geyser jet + surface ripple) ---
    // Up to DISK_ERUPT_SLOTS concurrent eruptions, mirroring the yellow-star mesh's
    // uErupt/uEruptAge (buildSunRig.ts). Each slot is a vec4 (xyz = UNSPUN object-space
    // eruption-centre dir, w = intensity 0..1) plus an age in seconds; all start idle
    // (intensity 0). The render loop owns a JS pool and copies it into these arrays each
    // frame. NOTE: secondary = primary.clone() DEEP-clones these arrays (UniformsUtils),
    // so the render loop writes BOTH disk materials separately (as it does for uGiant
    // etc.) — see createScene's giant-eruption pool advance.
    uErupt: { value: Array.from({ length: DISK_ERUPT_SLOTS }, () => new THREE.Vector4(0, 1, 0, 0)) },
    uEruptAge: { value: Array.from({ length: DISK_ERUPT_SLOTS }, () => 0) },
  };

  const primary = new THREE.ShaderMaterial({
    uniforms,
    // NEB_LOW_TRIM (LOW tier only): compiles OUT the nebula light model's two
    // toward-camera self-occlusion fbm resamples — the costliest slice of the
    // nebula vertex branch for its subtlest cue (nebula-collapse measured
    // 27.3fps on the software-GL low tier, a marginal 30fps fail). The ambient +
    // depth-fade terms are kept. Mid/high compile without the define →
    // byte-identical GLSL to before. (secondary = primary.clone() carries the
    // same defines.)
    defines: lowTier ? { NEB_LOW_TRIM: 1 } : {},
    vertexShader: diskVertexShader,
    fragmentShader: diskFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const secondary = primary.clone();
  secondary.uniforms = THREE.UniformsUtils.clone(uniforms);
  secondary.uniforms.uImageSign.value = -1.0;

  const primaryPts = new THREE.Points(geo, primary);
  const secondaryPts = new THREE.Points(geo, secondary);
  primaryPts.frustumCulled = false;
  secondaryPts.frustumCulled = false;
  scene.add(primaryPts);
  scene.add(secondaryPts);

  const dispose = (): void => {
    scene.remove(primaryPts);
    scene.remove(secondaryPts);
    geo.dispose();
    primary.dispose();
    secondary.dispose();
  };

  return { primary, secondary, primaryPts, secondaryPts, geo, uniforms, aSeed, aU, aPhase, count: N, dispose };
}

// The lensed background starfield: a spherical shell of points bent by the same
// gravitational lens as the disk. PRIMARY (uImageSign +1) is the only visible
// image; the SECONDARY (sign -1) image piles into a hot caustic point and is
// kept hidden, but built so the lensing math has its counterpart available.
