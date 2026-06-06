// Accretion-disk GPU-particle rig (1.2M points; two lensed images share one geometry).
import * as THREE from 'three';
import { CFG } from '../lib/config';
import { simDimensions } from '../gravitySim';
import { diskVertexShader, diskFragmentShader } from '../shaders/disk.glsl';
import type { Uniforms } from './types';

export interface DiskRig {
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
export function buildDisk(scene: THREE.Scene, particleCount: number, pixelRatio: number): DiskRig {
  const N = Math.floor(particleCount);
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
    uBright: { value: 1.25 }, // disk brightness multiplier (brightened)
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
    // geometry offset — so uGiantCenter defaults to origin. The dev panel can still
    // nudge the orb in world space via __bhGiantCenter for inspection.
    uGiantScale: { value: 8.5 / 4.2 }, // red-giant-only radius ×base. MEDIUM (~8.5, dense) not
    //   the old bloated ~17.6 — the fixed grain count goes sparse on a huge sphere. The
    //   lifecycle ramps this during the reveal (small newborn → this held size); kept in
    //   sync with lifecycle's GIANT_FULL so the held giant doesn't pop.
    uGiantCenter: { value: new THREE.Vector3(0, 0, 0) }, // centred; framing is a camera move
    uGiantSpin: { value: 0 }, // axial spin angle (radians); driven per-frame from uTime
    uGranScale: { value: 26.0 }, // granulation cell frequency across the surface
    // --- Later lifecycle transitions (scroll-driven 0..1 each). The scroll
    //     timeline drives these per frame; the shader body consumes them to morph
    //     the star onward. They sit on the timeline AFTER the red giant:
    //       uYellow: red giant → yellow (sun-like) star   (transition 3)
    //       uNebula: yellow star → nebula                 (transition 4)
    //       uDot:    nebula → pale blue dot               (transition 5)
    uYellow: { value: 0 },
    uNebula: { value: 0 },
    uDot: { value: 0 },
    uNebLight: { value: 1 }, // nebula ambient+depth light model strength (0 flat → 1 full)
    // --- yellow star → red giant flash-swap (transition 3, scroll 3→2). These
    //     drive ONLY the point-cloud's gold→red sphere during the yellow⇄red
    //     slot; all three default to a no-op so every other stage is unchanged.
    uYrFlash: { value: 0 }, // brief swap flash: whitens the freshly-spawned gold sphere
    uYrMix: { value: 1 }, // 0 = smooth gold sphere, 1 = granular red giant
    uYrGrow: { value: 1 }, // 0 = yellow radius (×0.35), 1 = red-giant radius
    // --- deterministic scroll-driven collapse (nebula → yellow star) ---
    // uNebCollapse: 0 = resting nebula, 1 = gas swirled onto the forming star. A pure
    // function of scroll (look.collapse), so it scrubs exactly both directions — no
    // stateful sim, no one-way drift. uSimPos/uSimBlend are retained (the sim still
    // seeds the look) but no longer drive the render path.
    uNebCollapse: { value: 0 },
    uSimPos: { value: null }, // sim position texture (set per-frame from the sim)
    uSimBlend: { value: 0 }, // legacy GPGPU blend — kept at 0 (collapse is shader-driven now)
  };

  const primary = new THREE.ShaderMaterial({
    uniforms,
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
