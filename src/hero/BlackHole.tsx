// ===========================================================================
// BlackHole.tsx — a Schwarzschild black hole hero, built as a self-contained
// vanilla-three scene mounted inside a client-only React island.
//
// The image is a GPU particle system: ~1M dots form the accretion disk (each on
// a Keplerian orbit), with gravitational lensing bending the far side up over
// the shadow, relativistic Doppler beaming flaring the approaching side, and a
// gravitationally-redshifted inner edge. A lensed starfield + tangential warp
// arcs wrap the background light around the shadow, and a thin photon ring traces
// the rim. Post: bloom + a neutral/olive film grade with grain and vignette.
//
// There is intentionally no control panel — the scene auto-runs. On load the
// camera performs a single eased "dezoom" travelling (starts close, pulls back
// to its resting distance over a few seconds), then settles into a slow
// continuous rotation drift. Everything is tuned a touch brighter than a
// reference still so the hero reads as luminous. Reduced motion freezes to the
// settled frame. Lazy island → three.js never blocks the page below.
// ===========================================================================
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ScrollTracker } from './scroll';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
//  Config (rs = 1; the hole sits at the world origin). Physics adapted from
//  github.com/vlwkaos/threejs-blackhole: Keplerian orbits, relativistic
//  beaming ∝ δ³, gravitational redshift, T ∝ r^-3/4.
//
//  Brightness-related values are lifted above the moody reference still so the
//  hero reads as clearly luminous (see uExposure / bloomStr / disk brightness).
// ---------------------------------------------------------------------------
interface Config {
  rIn: number;
  rOut: number;
  diskThickness: number;
  diskParticles: number;
  diskDistrib: number;
  coreSize: number;
  holeFactor: number;
  ringBright: number;
  omega0: number;
  spinDir: number;
  betaScale: number;
  beamExp: number;
  doppler: number;
  lens: number;
  secScale: number;
  vertAsym: number;
  horizAsym: number;
  inclDeg: number;
  camDist: number;
  fovDeg: number;
  rotation: number;
  exposure: number;
  bloomStr: number;
  bloomRad: number;
  grain: number;
  warmth: number;
  saturation: number;
  olive: number;
  warp: number;
  starBright: number;
  starDensity: number;
}

const CFG: Config = {
  // --- disk ---
  rIn: 2.4,
  rOut: 18.0,
  diskThickness: 0.215,
  diskParticles: 1_200_000,
  diskDistrib: 0.9,
  coreSize: 1.86,
  holeFactor: 0.85,
  ringBright: 0.62, // brighter rim (ref: 0.44)

  // --- physics ---
  omega0: 0.5,
  spinDir: -1.0,
  betaScale: 0.53,
  beamExp: 2.7,
  doppler: 0.55,
  lens: 1.5,
  secScale: 0.85,
  vertAsym: 1.0,
  horizAsym: 0.56,

  // --- camera (resting pose; the intro travels in to this) ---
  inclDeg: 5.0,
  camDist: 20.0,
  fovDeg: 30.0,
  rotation: 35.0,

  // --- render (brightened) ---
  exposure: 0.85, // ref: 0.50 → noticeably brighter
  bloomStr: 0.78, // ref: 0.56
  bloomRad: 0.45,
  grain: 0.16,
  warmth: 0.01,
  saturation: 0.38,
  olive: 1.6,
  warp: 0.6,
  starBright: 3.6, // ref: 3.0
  starDensity: 7.6,
};

// Fixed screen scale.
const lookOffsetX = -0.55;
const lookOffsetY = 0.1;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Density adapted to the device.
function tuneParticlesForDevice(): number {
  if (typeof window === 'undefined') return CFG.diskParticles;
  const w = window.innerWidth;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || w < 760;
  if (w < 480) return 95_000;
  if (mobile) return 150_000;
  if (w < 1280) return 240_000;
  return CFG.diskParticles;
}

// ---------------------------------------------------------------------------
//  Shared GLSL: gravitational lensing (point lens)
// ---------------------------------------------------------------------------
const LENS_GLSL = /* glsl */ `
  uniform float uThetaE;
  uniform float uShadowR;
  uniform float uAspect;
  uniform float uImageSign;

  vec4 lensClip(vec4 clipP, vec4 clipBH, out float mag, out float screenR){
    vec2 ndcP  = clipP.xy  / clipP.w;
    vec2 ndcBH = clipBH.xy / clipBH.w;
    vec2 off   = ndcP - ndcBH;
    vec2 aoff  = vec2(off.x * uAspect, off.y);
    float beta = max(length(aoff), 1e-4);
    vec2  dir  = aoff / beta;

    float u = beta / uThetaE;
    float root = sqrt(u*u + 4.0);
    float img = (uImageSign > 0.0) ? 0.5*(u + root) : 0.5*(u - root);
    float theta = img * uThetaE;

    float core = (u*u + 2.0) / (2.0 * u * root);
    mag = (uImageSign > 0.0) ? abs(core + 0.5) : abs(core - 0.5);

    vec2 newA = dir * theta;
    vec2 newOff = vec2(newA.x / uAspect, newA.y);
    vec2 newNdc = ndcBH + newOff;

    screenR = abs(theta);
    return vec4(newNdc * clipP.w, clipP.z, clipP.w);
  }
`;

// ---------------------------------------------------------------------------
//  Accretion disk (GPU particles). rIn / rOut / thickness are computed in the
//  shader from uniforms.
// ---------------------------------------------------------------------------
const diskVertexShader = /* glsl */ `
  attribute float aU;
  attribute float aPhase;
  attribute float aThickN;
  attribute float aSeed;

  uniform float uTime, uOmega0, uSpinDir, uBetaScale, uBeamExp, uDoppler;
  uniform float uRin, uRout, uThick, uPixelRatio, uSec, uHole, uVertAsym, uHorizAsym, uDistrib;
  uniform float uBright;
  // --- Transition 1: reverse supernova (driven by scroll). 0 = black hole.
  //   uMorph ∈ [0,1]: implosion (0→0.45), flash (~0.5), flare-out (0.55→1).
  //   uFlash is a precomputed 0..1 burst envelope peaking at the flash. ---
  uniform float uMorph, uFlash;

  ${LENS_GLSL}

  // cheap value-noise hash for the turbulent flare displacement
  float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  // smooth 3D value noise (for the red-giant granulation / convection)
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=h31(i+vec3(0,0,0)), n100=h31(i+vec3(1,0,0));
    float n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1));
    float n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float s=0.0, a=0.5;
    for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; }
    return s;
  }
  vec3 hash33(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453);
  }
  // 3D cellular noise → returns F1 (nearest feature distance) and F2 in .xy.
  // Used for solar granulation: bright granule centres, dark intergranular lanes.
  vec2 cellular(vec3 p){
    vec3 ip = floor(p), fp = fract(p);
    float f1 = 1e9, f2 = 1e9;
    for(int k=-1;k<=1;k++)
    for(int j=-1;j<=1;j++)
    for(int i=-1;i<=1;i++){
      vec3 g = vec3(float(i),float(j),float(k));
      vec3 o = hash33(ip+g);
      vec3 r = g + o - fp;
      float d = dot(r,r);
      if(d < f1){ f2 = f1; f1 = d; }
      else if(d < f2){ f2 = d; }
    }
    return vec2(sqrt(f1), sqrt(f2));
  }
  // domain-warped fbm — the swirly inter-granular turbulence (IQ warp)
  float warpFbm(vec3 p){
    vec3 q = vec3(fbm(p), fbm(p+vec3(5.2,1.3,2.8)), fbm(p+vec3(1.7,9.2,3.4)));
    return fbm(p + 3.0*q);
  }

  uniform float uGiant;     // 0 = remnant, 1 = sun (transition 2)
  uniform float uGiantR;    // sun radius in world units
  uniform float uGranScale;     // granulation cell frequency across the surface
  // --- Later lifecycle transitions, each scroll-driven 0..1 (declared so the
  //     timeline can drive them; the shader body morphs the star onward).
  //       uYellow: red giant  -> yellow (sun-like) star
  //       uNebula: yellow star -> nebula
  //       uDot:    nebula      -> pale blue dot
  uniform float uYellow, uNebula, uDot;

  varying float vBright;
  varying float vSeed;
  varying float vGiant;  // 0 = ember ramp, 1 = sun warm ramp
  varying float vHeat;   // temperature proxy → fragment colour ramp
  varying float vExplode;// explosion heat proxy → blue-white→amber→red ramp

  void main(){
    // radius from the parameter — adjustable radial distribution (uDistrib)
    float r0 = uRin + (uRout-uRin) * pow(aU, uDistrib);
    float r = r0;
    float thick = aThickN * uThick * (0.5 + r/uRout);

    // === Reverse-supernova morph (cinematic shock-breakout) =================
    // Run a real shock-breakout backwards-then-forwards in three beats:
    //   1. IMPLODE (uMorph 0→0.42): the disk accelerates inward — faster and
    //      faster (cubic ease-in) — collapsing into a tight, spun-up hot ball.
    //   2. FLASH (~0.46–0.54): peak compression detonates (uFlash burst).
    //   3. BLAST (0.46→1): every particle is flung straight OUTWARD along its
    //      own radial ray — absorption inverted. A low-frequency angular field
    //      makes whole sectors punch further → finger-like plasma jets, and a
    //      thin shock shell (computed in the lighting block) races out ahead.
    float implode = smoothstep(0.0, 0.42, uMorph);  // 0→1 fall-in
    float flare   = smoothstep(0.46, 1.0, uMorph);  // 0→1 blast-out (gap = flash)

    // -- deterministic 3D radial blast direction ----------------------------
    // A STABLE outward unit vector per particle, built from the SAME area-even
    // spherical mapping the red-giant gather uses (aSeed→cosθ, aPhase+aU→azimuth)
    // so the ejecta fills a full 3D sphere (a normalize(pos) blast would stay in
    // the flat disk plane) AND lands exactly where the star will later gather it.
    // Reusing aPhase as azimuth keeps angular identity → coherent rays, not fog.
    float bu   = aSeed*2.0 - 1.0;                   // cos(theta)
    float bth  = aPhase + aU*6.2831;                // azimuth
    float bsp  = sqrt(max(0.0, 1.0 - bu*bu));
    vec3 blastDir = vec3(bsp*cos(bth), bu, bsp*sin(bth));

    // -- finger-like plasma jets --------------------------------------------
    // A LOW-frequency field over the blast direction picks lanes that shoot
    // much further than the bulk (Rayleigh–Taylor fingers); a finer octave adds
    // sub-filaments. The contrast is pushed HARD so the explosion reads as
    // distinct radial RAYS spiking out of a core, not a uniform fog ball.
    float lane = fbm(blastDir*2.6 + 11.0);
    lane = pow(smoothstep(0.30, 0.92, lane), 2.4);  // sharp finger spikes
    float fil  = fbm(blastDir*7.0 + 4.0);
    float jet  = 0.35 + 1.9*lane + 0.25*fil;        // ~0.35 (void) .. ~2.5 (spike)
    // filament brightness from the STABLE lane field (no uTime / post-pos), so
    // bright wisps hold still as the remnant expands. High contrast: the rays
    // glow, the voids between them stay dark → the radial structure reads.
    float clump = clamp(0.05 + 1.5*lane + 0.35*fil, 0.0, 2.0);

    // -- implosion: collapse the whole black hole into a TINY dense seed -------
    // The black hole physically SHRINKS to a small, dense point (the "seed black
    // hole") before it reverse-explodes. coreR starts as a loose ball and is then
    // crushed down hard as the morph nears the flash — so the matter visibly
    // contracts to a tiny core. A modest per-particle spread is kept (and the
    // camera pushes IN, see the frame loop) so the seed reads without whiteout.
    float implodeE = implode*implode*implode;       // cubic ease-IN (speeds up)
    // seedShrink: 1 early in the implosion → ~0.12 right before the flash, so the
    // ball collapses from ~rIn-scale down to a tiny dense point.
    float seedShrink = mix(1.0, 0.12, smoothstep(0.18, 0.46, uMorph));
    float coreR    = uRin * (0.7 + 1.1*aU) * seedShrink;  // shrinks to a tiny seed
    float rImplode = mix(r0, coreR, implodeE);

    // -- blast: radius flung outward from the small seed, fast leading edge ----
    // Reach is kept TIGHT so the ejecta reads as a contained fireball with rays
    // against dark space — not a frame-filling fog. The visible frame at the
    // origin only spans ~10 units (cam ~20 out, 30° FOV), and the disk's rOut is
    // 18, so the bulk must stay within a few units. Bulk lands ~0.18–0.34 rOut
    // (~3–6 units); the fastest finger jets spike to ~0.85 rOut.
    float speed   = uRout * (0.18 + 0.16*aSeed) * jet;  // per-particle reach
    float reach   = pow(flare, 0.55);                   // fast launch, easing
    float ejectaR = coreR + speed * reach;

    r = mix(rImplode, ejectaR, step(0.46, uMorph));
    r = max(r, uRin*0.12);                          // off the singularity (tiny seed ok)

    // orbits spin up as they fall in (angular-momentum feel, accelerating into
    // the flash), then the flung-out cloud keeps only a slow residual tumble.
    float spinUp = mix(1.0, 3.6, implodeE) * mix(1.0, 0.30, flare);

    // Keplerian orbit (spun up during the implosion)
    float omega = uOmega0 * pow(r0, -1.5) * spinUp;
    float phi   = aPhase + uSpinDir * omega * uTime;
    float cs = cos(phi), sn = sin(phi);
    vec3 orbitPos = vec3(r*cs, thick, r*sn);        // spinning disk/implosion

    // Hand the flat spinning disk off to a 3D RADIAL form EARLY — during the
    // implosion — so by the flash the matter is already a 3D ball collapsing
    // along each particle's own blast ray (not a flat plate of overlapping dots,
    // the other half of the whiteout fix). It then continues straight out as the
    // ejecta rays emanating from the core.
    vec3 blastPos = blastDir * r;
    float toRay = smoothstep(0.12, 0.50, uMorph);   // 3D well before the flash
    vec3 pos = mix(orbitPos, blastPos, toRay);

    // a little persistent turbulence so the rays aren't glassy-straight: a low
    // perpendicular-ish jitter that grows with the blast (reuses fbm).
    float wob = fbm(blastDir*3.0 + aSeed*7.0) - 0.5;
    pos += blastDir.yzx * wob * uRin * 0.6 * flare;

    // === Transition 2: remnant cloud → a detailed Sun =======================
    // As uGiant goes 0→1 the scattered remnant GATHERS into a textured star.
    // The particles form the granular PHOTOSPHERE on the sphere surface.
    float heat = 0.0;       // surface temperature proxy → fragment colour ramp
    if(uGiant > 0.0){
      // stable spherical coordinate per particle (even-ish area distribution)
      float u = aSeed*2.0 - 1.0;                 // cos(theta) in [-1,1]
      float th = aPhase + aU*6.2831;             // azimuth
      float sp = sqrt(max(0.0, 1.0 - u*u));
      vec3 sphere = vec3(sp*cos(th), u, sp*sin(th));

      // -- multi-scale granulation (Voronoi cells + warped fbm + supergranules) --
      vec3 churn = vec3(0.0, uTime*0.025, 0.0);
      vec2 cell = cellular(sphere*uGranScale + churn);
      float granCells = 1.0 - smoothstep(0.0, 0.5, cell.x);    // bright granule centres
      float edge      = cell.y - cell.x;                       // ~0 on cell boundary
      float laneDark  = 1.0 - smoothstep(0.0, 0.06, edge);     // dark intergranular lane
      float turb = warpFbm(sphere*uGranScale*0.5 + churn*1.3); // swirly mottle
      float supergran = fbm(sphere*2.4 + churn*0.5);           // broad bright/dark regions
      // higher-contrast mix: bright cells, deep dark lanes between them
      float gran = clamp(0.55*granCells + 0.4*turb + 0.12, 0.0, 1.0);
      gran = mix(gran, gran*gran*1.4, 0.5);                    // crush toward contrast
      gran *= mix(0.72, 1.28, supergran);                      // supergranule modulation
      gran *= (1.0 - laneDark*0.7);                            // carve the dark lanes
      gran = clamp(gran, 0.0, 1.3);
      heat = gran;

      // giant radius with a little granular relief so the limb isn't a perfect
      // circle (bumpy photosphere)
      float relief = 1.0 + 0.025*(gran - 0.6);
      float giantR = uGiantR * relief;
      vec3 giantPos = sphere * giantR;

      // ease the gather aggressively (remnant is scattered over a huge volume)
      float g = smoothstep(0.0, 0.6, uGiant);
      g = g*g*(3.0-2.0*g);
      vec3 surfacePos = giantPos;

      pos = mix(pos, surfacePos, g);
    }

    vec4 viewP  = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipP  = projectionMatrix * viewP;
    vec4 viewBH = modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    vec4 clipBH = projectionMatrix * viewBH;

    float dz = viewBH.z - viewP.z;                 // >0 if behind the BH
    float behindAmt = smoothstep(0.0, 3.0, dz);

    float mag, screenR;
    vec4 lClip = lensClip(clipP, clipBH, mag, screenR);
    vec2 ndcU = clipP.xy / clipP.w;
    vec2 ndcL = lClip.xy / lClip.w;

    bool drop = false;
    vec2 ndcFinal; float useMag;

    // The lens bends the far side of the disk up over the shadow. As the shadow
    // dies during the morph, ease the lensing off so the remnant flies straight.
    // Once the star forms (uGiant>0) lensing is killed entirely — no gravity.
    float lensAmt = behindAmt * (1.0 - smoothstep(0.1, 0.5, uMorph)) * (1.0 - step(0.001, uGiant));
    if(uImageSign > 0.0){
      ndcFinal = mix(ndcU, ndcL, lensAmt);
      useMag   = mix(1.0, min(mag, 1.9), lensAmt);
      if(uMorph < 0.4 && behindAmt > 0.5 && screenR < uShadowR*0.985) drop = true;
    } else {
      // secondary (lensed) image: only meaningful while the black hole exists.
      // It fades out as the shadow dies, so the remnant/star isn't doubled.
      if(uMorph > 0.25 || uGiant > 0.0) drop = true;
      vec2 bhN = clipBH.xy / clipBH.w;
      vec2 dN  = ndcL - bhN;
      vec2 dA  = vec2(dN.x*uAspect, dN.y) * uSec;     // isotropic scaling (aspect space)
      ndcFinal = bhN + vec2(dA.x/uAspect, dA.y);
      float sR = screenR * uSec;                      // radius after scaling
      useMag   = min(mag, 1.8);
      if(sR < uShadowR*1.0) drop = true;              // never inside the shadow
      if(sR > uShadowR*2.8) drop = true;              // outer guard
    }

    // dark core: only carve away matter BEHIND the shadow (it would be occluded).
    // The near face passes IN FRONT of the BH -> light visible in front.
    // Once the morph starts the shadow is collapsing, so the carve fades out:
    // the imploding/flaring matter is free to cross the (vanishing) centre.
    bool carve = uMorph < 0.5;
    vec2 bhN = clipBH.xy / clipBH.w;
    vec2 dFin = ndcFinal - bhN;
    float rFin = length(vec2(dFin.x*uAspect, dFin.y));
    if(carve && rFin < uHole*0.95 && behindAmt > 0.35) drop = true;
    float coreFade;
    if(behindAmt > 0.35){
      coreFade = smoothstep(uHole*0.95, uHole*1.20, rFin);              // back: carved, soft edge
    } else {
      coreFade = mix(0.14, 1.0, smoothstep(uHole*0.10, uHole*1.05, rFin)); // front: subtle veil at centre, bright at edge
    }
    // dissolve the carve as the shadow dies, so the flare fills the centre
    coreFade = mix(coreFade, 1.0, smoothstep(0.15, 0.6, uMorph));

    vec4 outClip = vec4(ndcFinal * clipP.w, clipP.z, clipP.w);

    // Doppler / relativistic beaming
    vec3 velW = uSpinDir * vec3(-sn, 0.0, cs);
    vec3 velV = normalize(mat3(modelViewMatrix) * velW);
    vec3 toCam = normalize(-viewP.xyz);
    float cosA = dot(velV, toCam);
    float beta = clamp(uBetaScale * inversesqrt(r), 0.0, 0.85);
    float gamma = inversesqrt(1.0 - beta*beta);
    float delta = 1.0 / (gamma * (1.0 - beta*cosA));
    float beam  = mix(1.0, pow(delta, uBeamExp), uDoppler);

    // gravitational redshift (darkens the interior)
    float grav = sqrt(max(0.0, 1.0 - 1.0/r));

    // radial emissivity (inner peak, softened thin-disk)
    float x = r / uRin;
    float emiss = pow(x, -2.0) * (1.0 - 0.62*sqrt(uRin/r));
    emiss = max(emiss, 0.0);

    float pv = 0.45 + 0.55*aSeed;
    float bright = 3.3 * uBright * beam * grav * emiss * useMag * pv * coreFade;
    // adjustable asymmetries: top/bottom and left/right (relative to BH centre, screen space)
    float yN = (rFin > 1e-4) ? dFin.y / rFin : 0.0;            // +up / -down
    float xN = (rFin > 1e-4) ? (dFin.x*uAspect) / rFin : 0.0;  // +right / -left
    bright *= clamp(1.0 + uVertAsym * yN, 0.0, 3.0);
    bright *= clamp(1.0 - uHorizAsym * xN, 0.0, 3.0);
    if(uImageSign < 0.0) bright *= 1.15;   // secondary halo blended into the Doppler

    // === Reverse-supernova lighting & heat ==================================
    // Implosion glow on the way in, a punchy shock-breakout flash, a thin shock
    // SHELL racing outward, then a structured filamentary remnant whose light
    // falls as the shell inflates (energy conservation) but whose bright wisps
    // persist. A heat proxy (vExplode) drives the blue-white→amber→red ramp.
    float morphImplode = smoothstep(0.0, 0.46, uMorph);
    // morphFlare ramps FAST (done by ~0.66) so the structured hollow-shell
    // remnant takes over from the bright dense bulk as soon as the blast starts
    // — otherwise the bright implosion glow lingers and buries the radial rays.
    float morphFlare   = smoothstep(0.47, 0.66, uMorph);
    bright *= 1.0 + 1.2*morphImplode*(1.0 - morphFlare);  // hotter as it compresses
    // SEED BLACK HOLE: just before the flash the collapsed matter darkens so it
    // reads as a tiny dense seed (a small black hole) — the light has fallen into
    // the point — then the shock-breakout flash erupts from it. The dip is centred
    // slightly BEFORE the flash (0.44); it darkens the very dense CORE (small
    // absolute radius) while keeping a thin bright rim on the shell just outside,
    // so the seed reads as a compact point with a glowing edge, not a soft blob.
    float seedDip = exp(-pow((uMorph-0.44)/0.05, 2.0));   // narrow, pre-flash
    float coreDark = 1.0 - smoothstep(uRin*0.15, uRin*0.5, r); // 1 deep in the core
    bright *= 1.0 - 0.9*seedDip*coreDark;
    // peak-compression dip — edge-shaping; the JS uBright cut + the ceiling
    // below do the heavy lifting against a whiteout, this softens the burst rim.
    float compress = exp(-pow((uMorph-0.5)/0.15, 2.0));
    bright *= 1.0 - 0.40*compress;
    // the shock-breakout burst — the one bright beat we DO want, but restrained:
    // the matter is densely packed at the flash, so a big additive term here
    // stacks into a whiteout. Keep it a firm, contained glow.
    bright += uFlash * (0.55 + 0.9*pv) * (0.6 + 0.4*useMag);

    // -- expanding shock shell -----------------------------------------------
    // A thin bright spherical front sweeps outward AHEAD of the bulk debris
    // (exponent 0.5 < the bulk's 0.62 reach), lighting particles near it then
    // passing them; it dims as it inflates and thins (E∝1/r²). Additive, so it
    // flashes through voids too. shellFront/band are reused by the heat proxy.
    // This bright front is the structural hero of the blast — it stays vivid
    // once the matter has SPREAD (low density) so it can't whiteout. Its radius
    // tracks the (now modest) ejecta so it lights real particles, not empty space.
    float shellFront = uRout * (0.06 + 0.30*pow(flare, 0.5));  // 0.06→0.36 rOut
    float shellW     = uRout * 0.05;                            // thin crisp band
    float band       = exp(-pow((r - shellFront)/shellW, 2.0));
    float shellLight = band * (1.0 - 0.4*flare) * 3.2 * smoothstep(0.5, 0.62, uMorph);
    bright += shellLight * (0.6 + 1.0*pv);

    // remnant: a HOLLOW expanding shell of radial rays. The matter has left the
    // centre, so brightness peaks out at the shell front and falls toward the
    // core (a hollow bubble, like a real supernova remnant) — this carves a dark
    // interior so the radial finger structure reads against it instead of being
    // buried under a solid bright disc. Modulated hard by the jet/clump field so
    // the bright RAYS stand out over near-dark voids between them.
    float shellProfile = smoothstep(coreR, shellFront, r);   // 0 core → 1 at front
    shellProfile *= smoothstep(shellFront + shellW*2.5, shellFront, r); // fade past front
    // sharpen the rays: bright fingers glow, the voids between them go darker,
    // so the radial structure reads as fingers instead of a uniform dust ball —
    // but keep a real floor so the whole bubble stays visible.
    float rays = pow(clump*0.7, 1.7);                        // radial fingers
    float remnant = (0.05 + 0.95*shellProfile) * (0.35 + 1.9*rays);
    bright = mix(bright, remnant, morphFlare);

    // -- whiteout ceiling: while matter is still dense (implosion → just past the
    // flash) clamp per-particle emission so ~1.2M additively-blended overlapping
    // dots cannot stack into an edge-to-edge white plate. The ceiling lifts as
    // the ejecta spreads out (density falls) so the shell/jets keep their punch.
    float dense = exp(-pow((uMorph-0.48)/0.12, 2.0));     // 1 at the flash → 0 away
    float ceil  = mix(40.0, 2.4, dense);                  // tight cap at the flash
    bright = min(bright, ceil);

    // -- explosion HEAT proxy (drives the colour ramp) -----------------------
    // 1 = blue-white (flash / shock front), → amber → ~0 deep red as the bulk
    // cools and spreads outward. Gated off until the flash so the black-hole
    // ember ramp is untouched during the implosion.
    float cool = 1.0 - smoothstep(coreR, shellFront + shellW, r); // 1 inner→0 far
    float heatExp = clamp(
        0.30*morphFlare        // warm amber base so debris isn't all dark-red
      + 0.85*uFlash            // blinding blue-white at breakout
      + 0.65*band              // shock front stays hot
      + 0.55*cool*morphFlare   // hotter toward the still-dense interior
      + 0.35*clump,            // bright filaments run hotter than voids
      0.0, 1.2);
    vExplode = heatExp * smoothstep(0.40, 0.50, uMorph);

    // === Sun surface lighting (transition 2) ================================
    // Replace the black-hole/remnant lighting with a textured photosphere as
    // uGiant rises: physical limb darkening, multi-scale granulation, dark
    // sunspots with bright penumbrae, and bright plage/active regions.
    float spotMask = 0.0;
    if(uGiant > 0.0){
      vec3 nrm = normalize(pos);
      float mu = clamp(dot(nrm, toCam), 0.0, 1.0);  // cos(angle from disk centre)

      // canonical solar limb darkening (linear law, u≈0.6): centre bright, rim
      // dim. Keep a thin bright limb rim (chromosphere/forward-scattered corona).
      float limbDark = 1.0 - 0.62*(1.0 - mu);
      float rimGlow  = smoothstep(0.30, 0.0, mu) * 0.85;

      float gran = heat;                            // multi-scale granulation 0..1.3

      // dark sunspot regions: low-frequency mask carves cool umbrae with a
      // slightly brighter penumbral ring around them.
      float spotF = fbm(nrm*1.4 + 11.0);
      float umbra   = smoothstep(0.40, 0.30, spotF);          // deep dark core
      float penumbra= smoothstep(0.52, 0.44, spotF) - umbra;  // ring around it
      spotMask = umbra;
      float surf = (0.5 + 0.85*gran);
      surf *= mix(1.0, 0.18, umbra);                 // umbra very dark
      surf *= mix(1.0, 0.7, max(penumbra,0.0));      // penumbra a touch cooler

      // bright plage / active regions: broad hot patches near (but not in) spots
      float plage = smoothstep(0.55, 0.7, spotF) * 0.4;
      surf += plage;

      float photo = (surf * limbDark + rimGlow);

      // overall scale — warm and richly lit but not a blinding white disc
      float giantBright = photo * 0.7;

      float g = smoothstep(0.0, 1.0, uGiant);
      bright = mix(bright, giantBright, g);

      // heat channel for the colour ramp: deep red base, hot plage highlights.
      float hch = clamp(gran*(1.0 - 0.85*umbra) + plage*1.2, 0.0, 1.15);
      vHeat = mix(0.5, hch, g);
      vGiant = g;
    } else {
      vHeat = 0.5;
      vGiant = 0.0;
    }

    if(drop) bright = 0.0;

    vBright = bright;
    vSeed   = aSeed;
    gl_Position = outClip;

    float dist = -viewP.z;
    // photosphere grains sit larger so the surface reads as solid.
    float baseSize = uPixelRatio * (1.0 + 0.6*sqrt(min(bright,6.0))) * (16.0/dist);
    float surfSize = baseSize * 1.7;
    // ejecta grains swell modestly during the blast so the debris reads as
    // glowing embers/streamers, but not so much that they overlap into a wash.
    float blastSize = baseSize * 1.5;
    float size = mix(baseSize, blastSize, morphFlare);
    size = mix(size, surfSize, vGiant);
    gl_PointSize = clamp(size, 0.6, mix(mix(4.5, 6.0, morphFlare), 7.0, vGiant));
    if(drop) gl_PointSize = 0.0;
  }
`;

const diskFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uSat;
  varying float vBright;
  varying float vSeed;
  varying float vGiant;
  varying float vHeat;
  varying float vExplode;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    // soft round falloff that fills the photosphere.
    float a = smoothstep(0.5, 0.04, d);

    // --- ember / black-hole ramp (near-monochrome, warm highlights) ---
    float t = vBright / (vBright + 1.6);
    vec3 cLow = vec3(0.78, 0.80, 0.85);
    vec3 cMid = vec3(0.93, 0.93, 0.94);
    vec3 cHot = vec3(1.00, 1.00, 1.00);
    vec3 emberCol = mix(cLow, cMid, smoothstep(0.0, 0.45, t));
    emberCol = mix(emberCol, cHot, smoothstep(0.45, 0.92, t));
    float luma = dot(emberCol, vec3(0.299,0.587,0.114));
    emberCol = mix(vec3(luma), emberCol, uSat);

    // --- sun ramp: deep maroon → blood red → orange → amber → white-hot,
    //     driven by the temperature proxy. Base photosphere stays deep red;
    //     only the brightest plage reaches the hot orange/amber end. ---
    float h = clamp(vHeat, 0.0, 1.15);
    vec3 gDark = vec3(0.16, 0.018, 0.004);  // cool intergranular lanes / umbrae
    vec3 gRed  = vec3(0.62, 0.10, 0.015);   // base photosphere red
    vec3 gOrng = vec3(0.96, 0.34, 0.04);    // bright granule / network
    vec3 gAmbr = vec3(1.00, 0.62, 0.14);    // hot plage
    vec3 gWhite= vec3(1.00, 0.93, 0.72);    // brightest plage highlight
    vec3 sunCol = mix(gDark, gRed,  smoothstep(0.10, 0.40, h));
    sunCol = mix(sunCol, gOrng,  smoothstep(0.42, 0.66, h));
    sunCol = mix(sunCol, gAmbr,  smoothstep(0.66, 0.86, h));
    sunCol = mix(sunCol, gWhite, smoothstep(0.90, 1.08, h));

    // --- explosion ramp: deep red → amber → white-hot → blue-white, driven by
    //     the shock-breakout heat proxy. Cooled outer filaments sit deep red;
    //     the shock front and flash core run white- and blue-hot. Sits between
    //     the monochrome ember ramp and the sun ramp. ---
    float e = clamp(vExplode, 0.0, 1.2);
    vec3 eRed   = vec3(0.55, 0.06, 0.02);   // cooled outer filaments
    vec3 eAmbr  = vec3(1.00, 0.42, 0.10);   // amber mid debris
    vec3 eWhite = vec3(1.00, 0.95, 0.82);   // white-hot
    vec3 eBlue  = vec3(0.82, 0.93, 1.00);   // blue-white flash core
    vec3 exCol = mix(eRed,  eAmbr,  smoothstep(0.12, 0.45, e));
    exCol = mix(exCol, eWhite, smoothstep(0.45, 0.80, e));
    exCol = mix(exCol, eBlue,  smoothstep(0.92, 1.12, e));
    float exLuma = dot(exCol, vec3(0.299,0.587,0.114));
    exCol = mix(vec3(exLuma), exCol, uSat);  // respect global desaturation

    // ember (black hole) → explosion (morph) → sun (giant)
    vec3 col = mix(emberCol, exCol, clamp(vExplode, 0.0, 1.0));
    col = mix(col, sunCol, vGiant);

    float inten = vBright * a;
    gl_FragColor = vec4(col * inten, 1.0);
  }
`;

// ---------------------------------------------------------------------------
//  Lensed starfield — wraps around the hole
// ---------------------------------------------------------------------------
const starVertexShader = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uThetaE, uAspect, uImageSign, uStarBright, uHole;
  varying float vB;
  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    vec4 bhC  = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    bool drop = (clip.w <= 0.0);
    vec2 ndc   = clip.xy / max(clip.w, 1e-4);
    vec2 ndcBH = bhC.xy / max(bhC.w, 1e-4);
    vec2 off = ndc - ndcBH;
    vec2 a   = vec2(off.x*uAspect, off.y);
    float beta = max(length(a), 2e-4);
    vec2 dir = a / beta;

    float root = sqrt(beta*beta + 4.0*uThetaE*uThetaE);
    float thetaImg = (uImageSign > 0.0) ? 0.5*(beta + root) : 0.5*(beta - root);
    float u = beta / uThetaE;
    float magCore = (u*u + 2.0) / (u*sqrt(u*u + 4.0));
    float mag = (uImageSign > 0.0) ? abs(0.5*(magCore + 1.0)) : abs(0.5*(magCore - 1.0));

    vec2 aNew   = dir * thetaImg;
    vec2 offNew = vec2(aNew.x/uAspect, aNew.y);
    vec2 ndcNew = ndcBH + offNew;
    float rNew  = length(aNew);

    if(rNew < uHole) drop = true;
    if(uImageSign < 0.0 && rNew > uThetaE*1.25) drop = true;

    gl_Position = vec4(ndcNew, 0.0, 1.0);
    float tw = 0.55 + 0.45*sin(uTime*0.7 + aSeed*40.0);
    // The photon over-density at the rim comes from the COMPRESSION of positions
    // near the ring (points pile up), not from a brightness factor that saturates
    // to a hot point. So we keep brightness near-flat.
    float mg = clamp(mag, 0.5, 1.2);
    float caustic = smoothstep(uThetaE*0.04, uThetaE*0.75, beta); // damp very near alignment
    vB = (0.30 + 0.70*aSeed) * tw * mg * uStarBright * mix(0.5, 1.0, caustic);
    if(uImageSign < 0.0) vB *= 0.4;
    gl_PointSize = uPixelRatio * (0.7 + 1.5*aSeed) * (uImageSign > 0.0 ? 1.0 : 0.85);
    if(drop) gl_PointSize = 0.0;
  }
`;

const starFragmentShader = /* glsl */ `
  precision highp float; varying float vB;
  void main(){
    vec2 c = gl_PointCoord-0.5; if(length(c)>0.5) discard;
    float a = smoothstep(0.5,0.0,length(c));
    gl_FragColor = vec4(vec3(0.95,0.96,0.98)*vB*a*1.05, 1.0);
  }
`;

// ---------------------------------------------------------------------------
//  Warp — real lensing: each star stretched into a tangential ARC
// ---------------------------------------------------------------------------
const warpVertexShader = /* glsl */ `
  attribute float aSeed; attribute float aS;     // aS ∈ [-1,1] along the arc
  uniform float uTime, uShadowR, uThetaE, uAspect, uImageSign, uWarp, uHole;
  varying float vB; varying float vAbs;
  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    vec4 bhC  = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    bool drop = (clip.w <= 0.0);
    vec2 ndc   = clip.xy / max(clip.w,1e-4);
    vec2 ndcBH = bhC.xy  / max(bhC.w,1e-4);
    vec2 off = ndc - ndcBH; vec2 a = vec2(off.x*uAspect, off.y);
    float beta = max(length(a), 2e-4); vec2 dir = a/beta;

    // point-lens deflection (same formulae as the starfield)
    float root = sqrt(beta*beta + 4.0*uThetaE*uThetaE);
    float thetaImg = (uImageSign>0.0) ? 0.5*(beta+root) : 0.5*(beta-root);
    float u = beta/uThetaE;
    float magCore = (u*u+2.0)/(u*sqrt(u*u+4.0));
    float mag = (uImageSign>0.0) ? abs(0.5*(magCore+1.0)) : abs(0.5*(magCore-1.0));

    vec2 aImg = dir * thetaImg;                  // image position (may be opposite)
    float rNew = length(aImg);
    vec2 idir = aImg / max(rNew, 1e-5);          // radial direction of the IMAGE
    float phi0 = atan(idir.y, idir.x);

    // tangential magnification μ_t = θ/β
    float tang = rNew / beta;
    // lensed stretch: ONLY in a thin band near the ring (no orbit).
    // Beyond that, stars stay point-like -> it's the DENSITY that deforms.
    float prox = smoothstep(uThetaE*1.4, uThetaE*1.03, rNew);
    float dPhi = min(prox * 0.30 * clamp(tang-1.0, 0.0, 6.0) * uWarp, 0.20); // very short half-width (rad)
    float phi = phi0 + aS * dPhi;                // arc along the circle of radius rNew
    vec2 aP = rNew * vec2(cos(phi), sin(phi));
    vec2 ndcNew = ndcBH + vec2(aP.x/uAspect, aP.y);

    if(rNew < uHole) drop = true;
    if(uImageSign<0.0 && rNew > uThetaE*1.35) drop = true; // 2nd image confined near the ring

    gl_Position = vec4(ndcNew, 0.0, 1.0);
    float tw = 0.65 + 0.35*sin(uTime*0.7 + aSeed*40.0);
    float caustic = smoothstep(uThetaE*0.05, uThetaE*0.6, beta); // avoid near-aligned arcs being too bright
    vB = (0.2 + 0.8*aSeed) * tw * (0.3 + 0.7*prox) * clamp(mag, 0.4, 1.8) * mix(0.3, 1.0, caustic);
    if(uImageSign<0.0) vB *= 0.7;
    if(drop) vB = 0.0;
    vAbs = abs(aS);                              // 0 at the arc centre -> 1 at the ends
  }
`;

const warpFragmentShader = /* glsl */ `
  precision highp float; varying float vB; varying float vAbs;
  void main(){
    float fade = smoothstep(1.0, 0.05, vAbs);    // bright at centre, fades at the ends
    gl_FragColor = vec4(vec3(0.95,0.96,0.99) * vB * fade * 0.9, 1.0);
  }
`;

// ---------------------------------------------------------------------------
//  Photon ring (thin complete circle at the shadow rim)
// ---------------------------------------------------------------------------
const ringVertexShader = /* glsl */ `
  attribute float aAng; attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uAspect, uHole, uVertAsym, uHorizAsym, uRingBright, uMorph;
  varying float vB;
  void main(){
    vec4 bhC = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    vec2 ndcBH = bhC.xy / bhC.w;
    float r = uHole * (1.0 + (aSeed-0.5)*0.03);    // thin ring at the dark-core rim
    vec2 dir = vec2(cos(aAng), sin(aAng));
    vec2 ndc = ndcBH + vec2(dir.x * r / uAspect, dir.y * r);
    gl_Position = vec4(ndc, 0.0, 1.0);
    float tw = 0.78 + 0.22*sin(uTime*1.4 + aSeed*53.0);
    // complete, crisp circle in front of the stars: high floor, approaching side a touch brighter
    float dop = 0.85 + 0.40*smoothstep(0.55, -0.7, dir.x + 0.22*dir.y);
    vB = tw * dop * (0.6 + 0.4*aSeed) * 1.45 * uRingBright;
    // adjustable top/bottom and left/right asymmetries
    vB *= clamp(1.0 + uVertAsym * dir.y, 0.0, 3.0);
    vB *= clamp(1.0 - uHorizAsym * dir.x, 0.0, 3.0);
    // the photon ring traces the shadow rim; as the shadow dies it brightens
    // briefly (last flash of the rim) then vanishes with the morph.
    vB *= (1.0 - smoothstep(0.12, 0.45, uMorph)) * (1.0 + 1.6*smoothstep(0.0, 0.18, uMorph));
    gl_PointSize = uPixelRatio * (0.7 + 0.8*aSeed);
  }
`;

const ringFragmentShader = /* glsl */ `
  precision highp float; varying float vB;
  void main(){
    vec2 c = gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.97,0.97,0.96) * vB * a * 1.0, 1.0);
  }
`;

// ---------------------------------------------------------------------------
//  Post-process (tone + neutral/olive grade + grain + vignette)
// ---------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 },
    uGrain: { value: 0.05 },
    uWarmth: { value: 0.05 },
    uSat: { value: 0.1 },
    uOlive: { value: 0.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGrain, uWarmth, uSat, uOlive;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
      // soft tone map (preserves the white core)
      col = col / (col + vec3(0.78));
      col = pow(col, vec3(0.92));
      // desaturate -> grey
      float luma = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(luma), col, uSat);
      // slight warm tint in the highlights
      col *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth*0.85);
      // dark OLIVE tint of the background + halo falloff
      float shW = 1.0 - smoothstep(0.0, 0.5, luma);          // weight in the shadows
      col *= mix(vec3(1.0), vec3(1.02, 1.08, 0.55), uOlive*shW);
      col += vec3(0.020, 0.024, 0.010) * uOlive;             // dark olive floor
      col += vec3(0.005);                                     // slight neutral floor
      // fine grain
      float g = hash(vUv*uResolution + fract(uTime)*97.0);
      col += (g-0.5)*uGrain;
      // vignette
      vec2 q = vUv-0.5;
      float vig = smoothstep(1.10, 0.28, length(q)*1.25);
      col *= mix(0.66, 1.0, vig);
      col = clamp(col,0.0,1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
//  Scene controller — owns all three.js state for one mount.
// ---------------------------------------------------------------------------
type Uniforms = Record<string, { value: unknown }>;

interface SceneHooks {
  /** Returns the current lifecycle position. Sampled once per frame.
   *  0→1 = transition 1 (black hole → reverse supernova remnant),
   *  1→2 = transition 2 (remnant → red giant). Later stages extend the range. */
  getStage: () => number;
}

function createScene(container: HTMLElement, reduced: boolean, hooks: SceneHooks): () => void {
  const diskParticles = tuneParticlesForDevice();
  const bCritShadow = 2.598; // (3√3/2) rs — shadow radius (informational)
  void bCritShadow;

  // --- renderer / scene / camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fovDeg, window.innerWidth / window.innerHeight, 0.1, 4000);
  const lookTarget = new THREE.Vector3(lookOffsetX, lookOffsetY, 0);

  // ---- disk ----
  const N = Math.floor(diskParticles);
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
  const diskGeo = new THREE.BufferGeometry();
  diskGeo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  diskGeo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  diskGeo.setAttribute('aThickN', new THREE.BufferAttribute(aThickN, 1));
  diskGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  diskGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  diskGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);

  const diskUniforms: Uniforms = {
    uTime: { value: 0 },
    uOmega0: { value: CFG.omega0 },
    uSpinDir: { value: CFG.spinDir },
    uBetaScale: { value: CFG.betaScale },
    uBeamExp: { value: CFG.beamExp },
    uDoppler: { value: CFG.doppler },
    uRin: { value: CFG.rIn },
    uRout: { value: CFG.rOut },
    uThick: { value: CFG.diskThickness },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uThetaE: { value: 0.1 },
    uShadowR: { value: 0.1 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uSat: { value: CFG.saturation },
    uSec: { value: CFG.secScale },
    uHole: { value: 0.12 },
    uVertAsym: { value: CFG.vertAsym },
    uHorizAsym: { value: CFG.horizAsym },
    uDistrib: { value: CFG.diskDistrib },
    uBright: { value: 1.25 }, // disk brightness multiplier (brightened)
    uMorph: { value: 0 }, // transition 1: reverse supernova (scroll-driven)
    uFlash: { value: 0 }, // central burst envelope (peaks mid-morph)
    uGiant: { value: 0 }, // transition 2: remnant cloud → sun
    uGiantR: { value: 4.2 }, // sun radius (world units) — a contained orb
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
  };

  const diskMatPrimary = new THREE.ShaderMaterial({
    uniforms: diskUniforms,
    vertexShader: diskVertexShader,
    fragmentShader: diskFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const diskMatSecondary = diskMatPrimary.clone();
  diskMatSecondary.uniforms = THREE.UniformsUtils.clone(diskUniforms);
  diskMatSecondary.uniforms.uImageSign.value = -1.0;

  const diskPrimary = new THREE.Points(diskGeo, diskMatPrimary);
  const diskSecondary = new THREE.Points(diskGeo, diskMatSecondary);
  diskPrimary.frustumCulled = false;
  diskSecondary.frustumCulled = false;
  scene.add(diskPrimary);
  scene.add(diskSecondary);

  // ---- stars ----
  const starN = Math.max(2500, Math.floor(diskParticles * 0.11 * CFG.starDensity));
  const starPos = new Float32Array(starN * 3);
  const starSeed = new Float32Array(starN);
  for (let i = 0; i < starN; i++) {
    const r = 200 + Math.random() * 320;
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3 + 0] = r * s * Math.cos(t);
    starPos[i * 3 + 1] = r * u;
    starPos[i * 3 + 2] = r * s * Math.sin(t);
    starSeed[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
  starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const starUniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uStarBright: { value: CFG.starBright },
    uHole: { value: 0.12 },
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const starMatSec = starMat.clone();
  starMatSec.uniforms = THREE.UniformsUtils.clone(starUniforms);
  starMatSec.uniforms.uImageSign.value = -1.0;

  const starPts = new THREE.Points(starGeo, starMat);
  starPts.frustumCulled = false;
  scene.add(starPts);
  const starSecPts = new THREE.Points(starGeo, starMatSec);
  starSecPts.frustumCulled = false;
  starSecPts.visible = false; // secondary point image piles into a hot point near the caustic
  scene.add(starSecPts);

  // ---- warp arcs ----
  const WARP_STARS = Math.max(2000, Math.floor(diskParticles * 0.02));
  const K = 7;
  const V = WARP_STARS * K * 2;
  const warpPos = new Float32Array(V * 3);
  const warpSeed = new Float32Array(V);
  const warpSPar = new Float32Array(V);
  let v = 0;
  for (let i = 0; i < WARP_STARS; i++) {
    const r = 150 + Math.random() * 360;
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const x = r * s * Math.cos(t);
    const y = r * u;
    const z = r * s * Math.sin(t);
    const sd = Math.random();
    for (let k = 0; k < K; k++) {
      const a0 = (k / K) * 2 - 1;
      const a1 = ((k + 1) / K) * 2 - 1;
      warpPos[v * 3] = x; warpPos[v * 3 + 1] = y; warpPos[v * 3 + 2] = z; warpSeed[v] = sd; warpSPar[v] = a0; v++;
      warpPos[v * 3] = x; warpPos[v * 3 + 1] = y; warpPos[v * 3 + 2] = z; warpSeed[v] = sd; warpSPar[v] = a1; v++;
    }
  }
  const warpGeo = new THREE.BufferGeometry();
  warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPos, 3));
  warpGeo.setAttribute('aSeed', new THREE.BufferAttribute(warpSeed, 1));
  warpGeo.setAttribute('aS', new THREE.BufferAttribute(warpSPar, 1));
  warpGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const warpUniforms: Uniforms = {
    uTime: { value: 0 },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uWarp: { value: CFG.warp },
    uHole: { value: 0.12 },
  };
  const warpMat = new THREE.ShaderMaterial({
    uniforms: warpUniforms,
    vertexShader: warpVertexShader,
    fragmentShader: warpFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const warpMatSec = warpMat.clone();
  warpMatSec.uniforms = THREE.UniformsUtils.clone(warpUniforms);
  warpMatSec.uniforms.uImageSign.value = -1.0;

  const warpSeg = new THREE.LineSegments(warpGeo, warpMat);
  warpSeg.frustumCulled = false;
  scene.add(warpSeg);
  const warpSeg2 = new THREE.LineSegments(warpGeo, warpMatSec);
  warpSeg2.frustumCulled = false;
  scene.add(warpSeg2);

  // ---- photon ring ----
  const ringN = 64000;
  const ringAng = new Float32Array(ringN);
  const ringSeed = new Float32Array(ringN);
  for (let i = 0; i < ringN; i++) {
    ringAng[i] = Math.random() * Math.PI * 2;
    ringSeed[i] = Math.random();
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringN * 3), 3));
  ringGeo.setAttribute('aAng', new THREE.BufferAttribute(ringAng, 1));
  ringGeo.setAttribute('aSeed', new THREE.BufferAttribute(ringSeed, 1));
  ringGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const ringUniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uShadowR: { value: 0.1 },
    uAspect: { value: 1.0 },
    uHole: { value: 0.12 },
    uVertAsym: { value: CFG.vertAsym },
    uHorizAsym: { value: CFG.horizAsym },
    uRingBright: { value: CFG.ringBright },
    uMorph: { value: 0 },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const ringPts = new THREE.Points(ringGeo, ringMat);
  ringPts.frustumCulled = false;
  scene.add(ringPts);

  // --- post ---
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CFG.bloomStr, CFG.bloomRad, 0.55);
  composer.addPass(bloom);
  const gradePass = new ShaderPass(GradeShader);
  gradePass.uniforms.uExposure.value = CFG.exposure;
  gradePass.uniforms.uGrain.value = CFG.grain;
  gradePass.uniforms.uWarmth.value = CFG.warmth;
  gradePass.uniforms.uSat.value = CFG.saturation;
  gradePass.uniforms.uOlive.value = CFG.olive;
  gradePass.renderToScreen = true;
  composer.addPass(gradePass);

  // --- lens uniforms (recomputed each frame from camera geometry) ---
  function updateLensUniforms(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const D = camera.position.distanceTo(lookTarget);
    const shadowAng = CFG.coreSize / D;
    const ndcShadow = shadowAng / Math.tan(fovY / 2);
    const thetaE = ndcShadow * CFG.lens;
    const holeR = ndcShadow * CFG.holeFactor;
    const starThetaE = holeR * 1.55;
    const pr = renderer.getPixelRatio();

    for (const m of [diskMatPrimary, diskMatSecondary]) {
      m.uniforms.uAspect.value = aspect;
      m.uniforms.uShadowR.value = ndcShadow;
      m.uniforms.uThetaE.value = thetaE;
      m.uniforms.uHole.value = holeR;
      m.uniforms.uPixelRatio.value = pr;
    }
    ringUniforms.uShadowR.value = ndcShadow;
    ringUniforms.uAspect.value = aspect;
    ringUniforms.uHole.value = holeR;
    ringUniforms.uPixelRatio.value = pr;
    for (const u of [starUniforms, starMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
      u.uPixelRatio.value = pr;
    }
    for (const u of [warpUniforms, warpMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
    }
  }

  function onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gradePass.uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    updateLensUniforms();
  }
  window.addEventListener('resize', onResize);

  // --- animation: intro dezoom travelling, then slow rotation drift ---
  // The camera starts close (CFG.camDist * NEAR_FACTOR) and eases out to its
  // resting distance over INTRO_DUR seconds, once. After that it keeps a slow
  // azimuth rotation forever. A gentle pointer parallax rides on top.
  const NEAR_FACTOR = 0.42; // how close the travelling begins (× resting distance)
  const INTRO_DUR = 6.0; // seconds for the dezoom
  const ROTATE_SPEED = 0.045; // rad/s of resting drift

  let mouseX = 0;
  let mouseY = 0;
  const onPointerMove = (e: PointerEvent): void => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('pointermove', onPointerMove);

  const t0 = performance.now();
  let raf = 0;
  let stopped = false;

  // easeOutCubic — fast pull-back that settles softly into the resting pose
  const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);
  // clamped smoothstep over [0,1] — used for the lifecycle zoom choreography
  const smoothstep01 = (x: number): number => {
    const t = x < 0 ? 0 : x > 1 ? 1 : x;
    return t * t * (3 - 2 * t);
  };

  // The lifecycle position is eased toward its scroll target each frame so a
  // flick of the wheel glides through the transitions instead of snapping.
  // stage 0→1 = reverse supernova; 1→2 = red giant.
  let stage = 0;

  function frame(): void {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const t = (now - t0) / 1000;

    // --- lifecycle position, smoothed toward the scroll target ---
    const stageTarget = hooks.getStage();
    stage += (stageTarget - stage) * (reduced ? 1 : 0.12);
    // DEBUG: window.__bhMorph forces the stage to an exact value (no smoothing)
    // so the explosion can be inspected frame-by-frame from a capture script.
    const dbg = (window as unknown as { __bhMorph?: number }).__bhMorph;
    if (typeof dbg === 'number') stage = dbg;
    const morph = Math.min(1, stage);              // transition 1 progress (0..1)
    // Transition 2 (gather into a star) overlaps the END of transition 1 so the
    // dispersing remnant flows straight into the forming star — no empty frame at
    // the stage boundary. Gather ramps over stage 0.7 → 1.3 (mostly done by 1.3).
    const giant = Math.min(1, Math.max(0, (stage - 0.7) / 0.6));

    // --- transition 1: reverse supernova ---
    diskMatPrimary.uniforms.uMorph.value = morph;
    diskMatSecondary.uniforms.uMorph.value = morph;
    ringMat.uniforms.uMorph.value = morph;
    // flash envelope: a sharp, narrow, BRIGHT shock-breakout burst centred on
    // the compression peak (the one blinding beat of the explosion).
    const flash = 1.15 * Math.exp(-Math.pow((morph - 0.5) / 0.06, 2.0));
    diskMatPrimary.uniforms.uFlash.value = flash;
    diskMatSecondary.uniforms.uFlash.value = flash;

    // --- transition 2: red giant ---
    diskMatPrimary.uniforms.uGiant.value = giant;
    diskMatSecondary.uniforms.uGiant.value = giant;

    // --- transitions 3-5: yellow star → nebula → pale blue dot ---
    // Scroll-timeline placement only — these ramp 0→1 across their stage with a
    // small overlap into the previous one (same trick the red giant uses against
    // the supernova tail) so no empty boundary frame shows. The shader body is
    // yours to consume them; nothing here decides what they render.
    //   yellow star  : ramps over stage ~2→3
    //   nebula       : ramps over stage ~3→4
    //   pale blue dot: ramps over stage ~4→5
    const yellow = Math.min(1, Math.max(0, (stage - 1.7) / 0.6));
    const nebula = Math.min(1, Math.max(0, (stage - 2.7) / 0.6));
    const dot = Math.min(1, Math.max(0, (stage - 3.7) / 0.6));
    diskMatPrimary.uniforms.uYellow.value = yellow;
    diskMatSecondary.uniforms.uYellow.value = yellow;
    diskMatPrimary.uniforms.uNebula.value = nebula;
    diskMatSecondary.uniforms.uNebula.value = nebula;
    diskMatPrimary.uniforms.uDot.value = dot;
    diskMatSecondary.uniforms.uDot.value = dot;

    // the star/warp lensing only makes sense while the hole exists — fade it.
    // Once the SUN forms we drop the gravitational-warp background entirely and
    // restore the plain starfield to full brightness behind the star.
    const lensLive = 1 - Math.min(1, Math.max(0, (morph - 0.1) / 0.4));
    starMat.uniforms.uStarBright.value =
      CFG.starBright * (0.4 + 0.6 * lensLive) * (1 - 0.45 * giant) + CFG.starBright * 0.45 * giant;
    // Completely remove ALL gravity once the star forms: the warp arcs, the
    // secondary (lensed) disk image, and the photon ring are switched off — a
    // star has no event horizon bending light around it. The plain (un-lensed)
    // starfield behind it is restored via uStarBright above. Below ~giant 0.02
    // these are gone entirely.
    const gravityGone = giant > 0.02;
    warpSeg.visible = !gravityGone;
    warpSeg2.visible = !gravityGone;
    diskSecondary.visible = !gravityGone;   // no lensed disk ghost behind the star
    ringPts.visible = !gravityGone;          // no photon ring around the star
    starSecPts.visible = false;              // secondary lensed star image stays off
    // Tame the bloom as the remnant inflates; let the flash punch it briefly. The
    // red giant is meant to be DIM, so pull bloom right down once it forms.
    const flareAmt = Math.min(1, Math.max(0, (morph - 0.46) / 0.54));
    bloom.strength = CFG.bloomStr * (1 - 0.7 * flareAmt) + flash * 0.22;
    bloom.strength = bloom.strength * (1 - 0.6 * giant) + 0.12 * giant;
    // SEED window: kill bloom hard just before the flash so the collapsed matter
    // reads as a small, crisp, dim seed point — not a big bloomed glow.
    const seedZone = Math.exp(-Math.pow((morph - 0.44) / 0.05, 2.0));
    bloom.strength *= 1 - 0.75 * seedZone;
    // The imploded core packs the whole disk into a small, dense, additively-
    // blended region — brightness there is enormous. Cut the disk's base emission
    // hard across the compression window so it never clips to an edge-to-edge
    // whiteout; the flash term is the one bright beat we DO want, narrow.
    const hotZone = Math.exp(-Math.pow((morph - 0.5) / 0.15, 2.0));
    const baseBright = 1.25 * (1 - 0.92 * hotZone);
    diskMatPrimary.uniforms.uBright.value = baseBright;
    diskMatSecondary.uniforms.uBright.value = baseBright;
    // Auto-exposure: pull down across the flash, dip at the seed (so the tiny
    // black-hole point reads dim and dense), and settle a touch lower for the
    // dim red giant so it reads warm and matte, not glaring.
    gradePass.uniforms.uExposure.value =
      CFG.exposure * (1 - 0.58 * hotZone) * (1 - 0.18 * giant) * (1 - 0.35 * seedZone);
    // Grade through the explosion: the blue-white→amber→red debris wants strong
    // warmth & saturation and the olive/green background tint pulled right back,
    // or the blast reads as a grey-green fog. exGrade is a sharp envelope over
    // the actual blast window (morph ~0.5–0.9), decaying as the giant takes over.
    const exGrade = Math.exp(-Math.pow((morph - 0.66) / 0.2, 2.0)) * (1 - giant);
    gradePass.uniforms.uOlive.value = CFG.olive * (1 - 0.85 * giant) * (1 - 0.92 * exGrade);
    gradePass.uniforms.uWarmth.value = CFG.warmth + 0.06 * giant + 0.12 * exGrade;
    gradePass.uniforms.uSat.value = CFG.saturation + 0.5 * giant + 0.7 * exGrade;
    // lift the disk's IN-SHADER saturation across the blast so the explosion ramp
    // colours (warm amber/red, hot blue-white) survive instead of being crushed
    // toward grey by the global desaturation.
    const exSat = CFG.saturation + 0.55 * exGrade + 0.5 * giant;
    diskMatPrimary.uniforms.uSat.value = exSat;
    diskMatSecondary.uniforms.uSat.value = exSat;

    // dezoom progress (0 close → 1 rest). Reduced motion lands at the rest frame.
    const intro = reduced ? 1 : easeOut(Math.min(t / INTRO_DUR, 1));
    const distFactor = NEAR_FACTOR + (1 - NEAR_FACTOR) * intro;

    // --- lifecycle zoom choreography (the scale story) ---
    // A black hole is tiny-but-massive; a star is huge-but-diffuse. To make the
    // scale read we PUSH IN as the hole shrinks to its tiny seed (so the seed is
    // still visible), HOLD through the explosion, then PULL BACK as the star
    // grows so the red giant lands at its resting on-screen size — bigger than
    // the seed, smaller than the original black hole. Reduced motion stays at 1.
    let zoom = 1.0;
    if (!reduced) {
      // shrink: push in GENTLY and IN SYNC with the world-space seed collapse
      // (which happens over morph 0.18 → 0.46). A gentle factor keeps the tiny
      // seed readable without the still-bright imploding matter washing the frame.
      const ZOOM_IN = 0.72; // closest factor at the seed (gentle)
      const shrinkT = smoothstep01((stage - 0.18) / (0.46 - 0.18));
      // grow: stage 0.7 → 1.3 eases back out to ZOOM_OUT× — pulled WELL past
      // resting so the red giant lands clearly SMALLER on screen than the
      // original black hole (a star is huge in reality but here we keep the BH
      // as the largest object: BH > giant > seed).
      const ZOOM_OUT = 1.7;
      const growT = easeOut(Math.min(Math.max((stage - 0.7) / 0.6, 0), 1));
      const shrunk = 1 + (ZOOM_IN - 1) * shrinkT;          // 1 → 0.72
      zoom = shrunk + (ZOOM_OUT - shrunk) * growT;          // 0.72 → 1.16
    }
    const dist = CFG.camDist * distFactor * zoom;

    const incl = THREE.MathUtils.degToRad(CFG.inclDeg);
    const horiz = dist * Math.cos(incl);
    const camY0 = dist * Math.sin(incl);

    // azimuth: a small extra sweep during the intro, then steady rotation
    const baseAz = THREE.MathUtils.degToRad(CFG.rotation);
    const introSweep = reduced ? 0 : (1 - intro) * 0.45; // eases out as we settle
    const rotation = reduced ? 0 : t * ROTATE_SPEED;
    const a = baseAz + introSweep + rotation + mouseX * 0.1;
    const yWobble = (reduced ? 0 : Math.sin(t * 0.055) * 0.5) + -mouseY * 0.8;

    camera.position.set(Math.sin(a) * horiz, camY0 + yWobble, Math.cos(a) * horiz);
    camera.lookAt(lookTarget);

    const ut = reduced ? 0 : t;
    diskMatPrimary.uniforms.uTime.value = ut;
    diskMatSecondary.uniforms.uTime.value = ut;
    starMat.uniforms.uTime.value = ut;
    starMatSec.uniforms.uTime.value = ut;
    warpMat.uniforms.uTime.value = ut;
    warpMatSec.uniforms.uTime.value = ut;
    ringMat.uniforms.uTime.value = ut;
    gradePass.uniforms.uTime.value = ut;

    updateLensUniforms();
    composer.render();
  }

  onResize();
  frame();

  // --- teardown ---
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);

    composer.dispose();
    for (const g of [diskGeo, starGeo, warpGeo, ringGeo]) g.dispose();
    for (const m of [
      diskMatPrimary,
      diskMatSecondary,
      starMat,
      starMatSec,
      warpMat,
      warpMatSec,
      ringMat,
      gradePass.material,
    ])
      m.dispose();
    bloom.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
  };
}

// ---------------------------------------------------------------------------
//  The manifesto — one beat per lifecycle state (six states, six beats, each
//  roughly one viewport tall), pinned over the canvas and cross-faded as the
//  scroll morph passes its window.
//
//  Core mechanic: each beat has TWO big lines and the big line SWAPS on scroll
//  DIRECTION. Scrolling DOWN rewinds time (the hopeful arc: from the black hole
//  at the end, back to the pale blue dot at the beginning); scrolling UP runs
//  time forward (the tragic arc: from one good decision out to the inevitable
//  collapse). The whisper is shared and does NOT swap.
//
//  All copy is real, selectable DOM text (never baked into the canvas) so it
//  stays indexable. Straight quotes only; no em/en dashes, no curly quotes.
// ---------------------------------------------------------------------------
interface ManifestoBeat {
  /** Scroll-progress centre of the beat (it owns a ~1/6 slot around this). */
  at: number;
  /** The lifecycle state this beat narrates (for the label / a11y). */
  state: string;
  /** Big line shown while scrolling DOWN (rewind / hopeful arc). */
  down: string;
  /** Big line shown while scrolling UP (forward / tragic arc). */
  up: string;
  /** Small dim elaboration. Shared across both directions; never swaps. */
  whisper: string;
}

// Six lifecycle states divide the scroll track into six full-viewport stages;
// the five morphs run across stage boundaries 0→1 … 4→5. BUILT_STAGES caps the
// lifecycle position so the bottom of the page rests on the final state instead
// of running off the end.
const STAGE_COUNT = 6;
const BUILT_STAGES = 5;
// Direction deadzone: ignore scroll deltas smaller than this (in progress units)
// so sub-pixel jitter never flips the big-line swap.
const DIR_DEADZONE = 0.0008;

// Six states evenly spaced on the scroll timeline, black hole at the top
// (progress 0), pale blue dot at the bottom (progress ~0.86). With STAGE_COUNT
// = 6 the morph for state N settles around stage N (progress N/6), so each
// beat's centre is placed on its state's settled frame.
const BEATS: ManifestoBeat[] = [
  {
    at: 0.02,
    state: 'black hole',
    down: 'every project ends. eventually.',
    up: 'every project ends. eventually.',
    whisper: 'the part nobody sees is what holds it together.',
  },
  {
    at: 1 / 6,
    state: 'reverse supernova',
    down: 'doomed to explode?',
    up: 'and one day it blows up.',
    whisper: 'fast to build. faster to fall apart.',
  },
  {
    at: 2 / 6,
    state: 'red giant',
    down: "bigger isn't the same as lasting.",
    up: 'then it grows faster than anyone can hold.',
    whisper: "the ai keeps adding. nobody's left who understands it.",
  },
  {
    at: 3 / 6,
    state: 'yellow star',
    down: 'or could it just burn steady?',
    up: 'for a while, it just works.',
    whisper: "the part that's still up at 3am. that's engineering.",
  },
  {
    at: 4 / 6,
    state: 'nebula',
    down: 'everything starts here.',
    up: "a few more, and it's a real thing.",
    whisper: 'stars are born from what the last one left behind.',
  },
  {
    at: 5 / 6,
    state: 'pale blue dot',
    down: 'in the beginning.',
    up: 'it starts with one good decision.',
    whisper: "every line you'll ever ship fits on that dot. worth doing properly, then.",
  },
];

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Per-beat opacity: a trapezoid centred on `at` — ramp in, hold across a flat
// top, ramp out — so neighbouring beats cross-dissolve. Half-width HOLD keeps
// the line steady through the middle of its slot; FADE softens the edges.
//
// `edge` pins the open side so the first/last beats never leave a dead band at
// the page extremes: 'leading' holds full opacity for everything BEFORE the
// centre (the opening black-hole beat sits at the very top), 'trailing' holds
// full opacity for everything AFTER the centre (so the closing pale-blue-dot
// beat — and its contact bridge — stays reachable all the way to the bottom).
const BEAT_HOLD = 0.055; // half-width of the fully-shown plateau
const BEAT_FADE = 0.045; // ramp distance on each side
function beatOpacity(progress: number, at: number, edge?: 'leading' | 'trailing'): number {
  if (edge === 'leading' && progress <= at) return 1;
  if (edge === 'trailing' && progress >= at) return 1;
  const d = Math.abs(progress - at);
  if (d <= BEAT_HOLD) return 1;
  if (d >= BEAT_HOLD + BEAT_FADE) return 0;
  return clamp01((BEAT_HOLD + BEAT_FADE - d) / BEAT_FADE);
}

// ---------------------------------------------------------------------------
//  Public component — a thin React shell that owns the canvas container, the
//  scroll tracker, and the manifesto overlay.
// ---------------------------------------------------------------------------
export default function BlackHole() {
  const hostRef = useRef<HTMLDivElement>(null);
  // Live scroll progress (0..1) drives both the morph (via a ref the render loop
  // reads) and the manifesto opacities (via React state, updated on scroll).
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  // Scroll direction drives the big-line swap. 'down' is the default (rewind /
  // hopeful arc); 'up' swaps in the forward / tragic line. A small deadzone keeps
  // sub-pixel jitter from flipping it.
  const lastProgressRef = useRef(0);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);

    const tracker = new ScrollTracker(STAGE_COUNT);
    const unsub = tracker.subscribe((s) => {
      progressRef.current = s.progress;
      setProgress(s.progress);
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = s.progress - lastProgressRef.current;
      if (delta > DIR_DEADZONE) setDirection('down');
      else if (delta < -DIR_DEADZONE) setDirection('up');
      lastProgressRef.current = s.progress;
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);

    // Lifecycle position over the scroll. Each stage is 1/STAGE_COUNT of the page;
    // the five transitions span stage 0→1, 1→2, ... 4→5. Clamp to the number of
    // transitions built so the bottom of the page holds the final state.
    const getStage = (): number =>
      Math.min(BUILT_STAGES, progressRef.current * STAGE_COUNT);

    const dispose = createScene(host, isReduced, { getStage });
    return () => {
      unsub();
      tracker.stop();
      dispose();
    };
  }, []);

  const base = import.meta.env.BASE_URL ?? '/';
  const contactHref = `${base}/about#get-in-touch`.replace(/\/+/g, '/');

  return (
    <div className="bh-root">
      <div className="bh-stage" ref={hostRef} aria-hidden="true" />

      {/* Persistent identity — fixed top-left across every beat. The sole
          top-left mark on the bare home (the small wordmark is hidden there). */}
      <a className="bh-identity" href={base.replace(/\/+$/, '') || '/'}>
        <span className="bh-identity-name">ILIÈS BELDJILALI</span>
        <span className="bh-identity-role">Software Engineer</span>
      </a>

      <div className="bh-overlay">
        {BEATS.map((beat, i) => {
          // Under reduced motion every beat is shown (so all copy is reachable);
          // otherwise the trapezoid fade reveals one beat at a time. The first and
          // last beats pin their outer edge so nothing goes blank at progress 0/1.
          const isLast = i === BEATS.length - 1;
          const edge = i === 0 ? 'leading' : isLast ? 'trailing' : undefined;
          const opacity = reduced ? 1 : beatOpacity(progress, beat.at, edge);
          const visible = opacity > 0.5;
          return (
            <div
              className="bh-beat"
              key={i}
              style={{ opacity }}
              aria-hidden={!reduced && !visible}
            >
              {/* Big line: both directions rendered, crossfaded by `direction`.
                  Under reduced motion both are shown stacked (no crossfade). */}
              <h2 className="bh-beat-big">
                <span
                  className="bh-beat-line bh-beat-line--down"
                  data-active={reduced || direction === 'down'}
                >
                  {beat.down}
                </span>
                <span
                  className="bh-beat-line bh-beat-line--up"
                  data-active={reduced || direction === 'up'}
                  aria-hidden={!reduced && direction !== 'up'}
                >
                  {beat.up}
                </span>
              </h2>

              <p className="bh-beat-whisper">
                <span className="bh-beat-state">{beat.state}</span>
                {beat.whisper}
              </p>

              {/* Beat 6 tail: the loop invitation and the contact bridge, each
                  progressively more faded, stacked under the dot whisper. */}
              {isLast && (
                <div className="bh-tail">
                  <p className="bh-tail-loop">time only goes one way. scroll up to see it.</p>
                  <a
                    className="bh-tail-contact"
                    href={contactHref}
                    style={{ pointerEvents: reduced || visible ? 'auto' : 'none' }}
                  >
                    Make it last, or don't make it. Sounds interesting? Let's connect..
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!reduced && progress < 0.02 && <p className="bh-hint">scroll to rewind ↓</p>}
    </div>
  );
}
