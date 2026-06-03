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
  // secondary-image (lower band) screen-space nudge — used to close the seam
  uniform float uSecOffsetX, uSecOffsetY;
  // --- Transition 1: reverse supernova (driven by scroll). 0 = black hole.
  //   uMorph ∈ [0,1]: implosion (0→0.45), flash (~0.5), flare-out (0.55→1).
  //   uFlash is a precomputed 0..1 burst envelope peaking at the flash.
  //   uCollapse ∈ [0,1]: the red-giant SURFACE collapse. 0 = full red-giant
  //     sphere; 1 = the surface has shrunk to the point (the flash/seed). The
  //     non-homogeneous shrink of the sphere IS the explosion — laggard regions
  //     of the surface stick out as the finger-spikes (see the giant block). ---
  uniform float uMorph, uFlash, uCollapse;

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

  // --- Ashima 3D simplex noise + fbm (the photosphere recipe ported verbatim
  //     from the standalone Sun render) -----------------------------------
  vec3 sMod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 sMod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 sPermute(vec4 x){return sMod289(((x*34.0)+1.0)*x);}
  vec4 sTaylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = sMod289(i);
    vec4 p = sPermute( sPermute( sPermute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 sp0 = vec3(a0.xy, h.x);
    vec3 sp1 = vec3(a0.zw, h.y);
    vec3 sp2 = vec3(a1.xy, h.z);
    vec3 sp3 = vec3(a1.zw, h.w);
    vec4 norm = sTaylorInvSqrt(vec4(dot(sp0,sp0), dot(sp1,sp1), dot(sp2,sp2), dot(sp3,sp3)));
    sp0 *= norm.x; sp1 *= norm.y; sp2 *= norm.z; sp3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0 * dot(m*m, vec4(dot(sp0,x0), dot(sp1,x1), dot(sp2,x2), dot(sp3,x3)));
  }
  float sfbm(vec3 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<6;i++){ v += a*snoise(p); p*=2.02; a*=0.5; }
    return v;
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
  varying float vPlaceholder; // REVIEW: 0 none, 2 nebula, 3 dot
  varying float vNeb;    // nebula radial factor (0 hot core → 1 rusty rim)
  // --- yellow (sun) state channels, ported from the standalone Sun render ---
  varying float vSunM;    // warm photosphere noise field (0..1) → colour ramp
  varying float vSunLimb; // limb factor (0 centre → 1 rim) → bright limb glow
  varying float vSunDark; // sunspot/chromosphere darkening (0..1)
  varying float vSunFlare;// 0 photosphere, 1 coronal loop / prominence, 2 footpoint knot
  varying float vSunHot;  // 0..1 white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette

  void main(){
    vPlaceholder = 0.0; // REVIEW placeholder tag (set in the giant/placeholder block)
    vSunM = 0.0; vSunLimb = 0.0; vSunDark = 0.0; // sun-photosphere channels (set below)
    vSunFlare = 0.0; vSunHot = 0.0;             // sun atmosphere channels
    vSunRed = 0.0;                              // 0 gold (yellow), 1 red giant
    vNeb = 0.0;                                 // nebula radial factor
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
    // Everything that shapes the blast is sampled from CONTINUOUS fields over the
    // (spatial) blastDir — no per-particle aSeed term — so neighbouring particles
    // (nearby blastDir) get nearly-identical reach/velocity and travel together as
    // coherent sheets & filaments rather than as independent grains.
    float lane = fbm(blastDir*2.2 + 11.0);
    lane = pow(smoothstep(0.28, 0.90, lane), 2.2);  // sharp finger spikes
    float fil  = fbm(blastDir*6.0 + 4.0);
    float jet  = 0.40 + 2.6*lane + 0.30*fil;        // ~0.40 (void) .. ~3.5 (spike)
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
    // seedShrink: 1 early in the implosion → ~0.03 right before the flash, so the
    // ball collapses from ~rIn-scale down to a TRUE speck. The camera also pulls
    // WAY back at the seed (see the zoom story in frame()), so the combination
    // reads as a tiny point in a vast dark field next to the huge hero black hole.
    // ORGANIC crush: one side collapses into the seed slightly AHEAD of the other
    // (low-freq lobe over the stable blast direction → no flicker), so the implosion
    // is lopsided, not a perfect uniform shrink. Endpoints stay pinned (1 early, 0.03
    // by the blast) so the hero and the blast structure are unchanged.
    float crushBias = clamp(fbm(blastDir*1.6 + 23.0)*2.0 - 1.0, -1.0, 1.0);
    float crushLo = clamp(0.14 - 0.10*crushBias, 0.0, 0.30);
    float crushHi = clamp(0.46 - 0.10*crushBias, 0.34, 0.60);
    float seedShrink = mix(1.0, 0.03, smoothstep(crushLo, crushHi, uMorph));
    float coreR    = uRin * (0.7 + 1.1*aU) * seedShrink;  // shrinks to a tiny seed
    float rImplode = mix(r0, coreR, implodeE);

    // -- blast: radius flung outward from the small seed, fast leading edge ----
    // The ejecta is BIG: a sprawling remnant of rays and sheets, not a contained
    // fireball. The camera pulls WAY back across the blast (see the zoom story in
    // frame()), so the cloud can fill far more world-space and still sit inside the
    // frame. The reach magnitude is a CONTINUOUS field over blastDir (a smooth
    // low-frequency speed lobe × the jet lanes) — NOT a per-particle aSeed term —
    // so neighbouring particles share a velocity and the cloud expands as coherent
    // membranes & filaments. Bulk lands ~0.4–0.7 rOut; the fastest jets spike past
    // rOut into long spikes.
    float spdLobe = 0.78 + 0.55*fbm(blastDir*1.3 + 31.0);  // smooth spatial speed field
    float speed   = uRout * 0.42 * spdLobe * jet;          // neighbour-coherent reach
    float reach   = pow(flare, 0.55);                      // fast launch, easing
    // LIVING blast: the ejecta isn't frozen at a held scroll position — it slowly
    // BREATHES in and out over time so the remnant reads as turbulent plasma, not a
    // static frame. The pulse phase comes from blastDir (a smooth spatial field), so
    // whole lobes swell and ebb TOGETHER (neighbour-coherent) — sheets billowing,
    // not per-grain shimmer. Two octaves: a slow global heave + a faster regional
    // ripple. Gated by flare so it only animates once the blast has launched (the
    // hero black hole and the seed stay perfectly still).
    float pulsePhase = fbm(blastDir*1.7 + 5.0) * 6.2831;       // spatial phase per lobe
    float breathe = 0.16 * sin(uTime*0.55 + pulsePhase)        // slow heave (±16%)
                  + 0.07 * sin(uTime*1.30 + pulsePhase*2.3);   // faster regional ripple
    reach *= 1.0 + breathe * flare;                           // grow/shrink over time
    float ejectaR = coreR + speed * reach;

    r = mix(rImplode, ejectaR, step(0.46, uMorph));
    r = max(r, uRin*0.03);                          // off the singularity (true speck ok)

    // orbits spin up HARD as they fall in (angular-momentum feel, accelerating
    // into the flash) so the debris visibly WHIPS around the tiny seed — the
    // accretion read — then the flung-out cloud keeps only a slow residual tumble.
    float spinUp = mix(1.0, 5.5, implodeE) * mix(1.0, 0.30, flare);

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
    // Hand off to the radial blast LATER so a residual orbital swirl persists at
    // the seed — debris reads as ACCRETING around the tiny core (not a static
    // collapse) — then goes fully radial as the blast launches.
    float toRay = smoothstep(0.20, 0.52, uMorph);
    vec3 pos = mix(orbitPos, blastPos, toRay);

    // --- subtle accretion pull toward the dark seed -------------------------
    // In the seed window the dark core exerts a gentle inward tug on nearby
    // debris: radius eased inward along a slightly-spiral path (a touch of extra
    // tangential lead), strongest just outside the core and only while the seed
    // exists. This is a small GEOMETRIC nudge — not a glow — so matter reads as
    // being aspirated into the point. Vanishes by the blast (toRay→1 → pull→0),
    // and is a no-op at the hero (pullWin≈0 at uMorph=0).
    float pullWin   = exp(-pow((uMorph-0.49)/0.07, 2.0));            // seed window
    float nearCore  = 1.0 - smoothstep(coreR, coreR + uRin*1.6, r);  // 1 near seed
    float pullAmt   = pullWin * nearCore * (1.0 - toRay) * 0.22;     // subtle
    float rPull     = r * (1.0 - 0.5*pullAmt);
    float phiPull   = phi + uSpinDir * pullAmt * 1.4;               // tangential lead
    vec3 spiralPos  = vec3(rPull*cos(phiPull), thick*(1.0-0.4*pullAmt), rPull*sin(phiPull));
    pos = mix(pos, spiralPos, pullWin);
    // strained-stream light: passed to the lighting block, where it adds light
    // ONLY on the infalling stream (∝ inward strain), never on the dark core.
    float infallGlow = pullAmt * 4.0;

    // organic billowing so the rays aren't glassy-straight. A SMOOTH transverse
    // displacement field over blastDir (three decorrelated fbm channels → a
    // curl-like vector), built ONLY from the spatial direction (no aSeed), so
    // neighbouring particles are pushed the SAME way → the ejecta folds into
    // coherent rolling sheets and lobes instead of per-grain fuzz. Scaled by the
    // distance flung out so the deformation grows organically with the expansion.
    // The sample point DRIFTS with uTime, so the sheets slowly roll and re-fold
    // over time (living turbulence) rather than holding one frozen shape — the
    // drift is a shared offset, so coherence between neighbours is preserved.
    vec3 swDrift = vec3(0.0, uTime*0.06, 0.0);
    vec3 swirl = vec3(
      fbm(blastDir*3.4 +  7.0 + swDrift),
      fbm(blastDir*3.4 + 19.0 + swDrift),
      fbm(blastDir*3.4 + 41.0 + swDrift)
    ) - 0.5;
    // project onto the plane perpendicular to the ray so it reads as sideways
    // billowing, not extra radial reach.
    swirl -= blastDir * dot(swirl, blastDir);
    pos += swirl * (r * 0.45 + uRin * 0.5) * flare;

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

      // ================= UNIFIED NON-HOMOGENEOUS SURFACE COLLAPSE ============
      // THE explosion. There is no separate radial blast — the spiky "explosion"
      // IS this red-giant surface caving in unevenly. Each patch of the sphere
      // collapses inward at its OWN rate; the laggard patches stay near full radius
      // (and extend PAST it) while their neighbours shrink, so they read as long
      // radial finger-spikes streaming off a churning core (ref Image-3). It is
      // always ONE connected surface — never a big shell + a small core at once.
      //
      // Driven by uCollapse (0 = full red-giant sphere, 1 = collapsed to the point,
      // where the legacy supernova flash fires). ALL the motion fields are fbm over
      // the spatial dir (no aSeed term), so neighbouring particles share their
      // timers → the fingers move as COHERENT groups, not per-grain shimmer.
      vec3 dir = sphere;

      // per-region remap of the global collapse progress -----------------------
      float bias = fbm(dir*1.6 + 23.0)*2.0 - 1.0;     // broad lobes: lead / lag
      float lump = fbm(dir*4.0 +  9.0);               // patch-scale lumpiness
      float fil  = fbm(dir*7.5 +  4.0);               // fine sub-filament detail
      float regOffset = bias*0.30;                    // some regions start earlier/later
      float regSlope  = 1.0 + bias*0.55 + (lump-0.5)*0.4;  // …and collapse faster/slower
      // sparse LAGGARD field: the high tail of a sharpened lobe → a minority of
      // regions that resist the collapse the longest. These become the fingers.
      float lagField = pow(smoothstep(0.45, 0.92, fbm(dir*2.2 + 11.0)), 2.2);
      lagField = clamp(lagField + 0.25*fil*lagField, 0.0, 1.5);  // split into threads

      // per-region collapse 0→1. The per-region offset/slope/hold are all gated by
      // a window that is 0 at BOTH ends (uCollapse·(1-uCollapse)), so the endpoints
      // pin EXACTLY: uCollapse=0 → kReg=0 (full sphere, every region) and
      // uCollapse=1 → kReg=1 (the point, every region). Only the MIDDLE desyncs →
      // the non-homogeneous caving-in, with laggards trailing the bulk into fingers.
      float desync = uCollapse*(1.0 - uCollapse)*4.0;  // 0 at ends, 1 at mid
      float kReg = uCollapse + (regOffset + uCollapse*(regSlope - 1.0))*desync*0.5;
      kReg = kReg - lagField*desync*0.9;               // laggards trail the bulk
      kReg = clamp(kReg, 0.0, 1.0);

      // independent per-region LIFE timer: even at a held scroll position the
      // fingers extend / retract on their own clocks → a living, churning core.
      // Phase from dir (spatial) so whole lobes pulse together; uTime=0 under
      // reduced motion → perfectly static.
      float fphase = fbm(dir*1.7 + 5.0)*6.2831;
      float fingerLife = 0.18*sin(uTime*0.5 + fphase) + 0.08*sin(uTime*1.2 + fphase*2.3);

      // collapseScale: per-region radial scale, NORMALISED so 1.0 = the full giant
      // surface radius. The bulk shrinks toward ~0 (collapseLo) while LAGGARD regions
      // stay near 1 and EXTEND past it (>1) → the finger-spikes. This factor is
      // applied to whatever radius the surface renderer uses (the sun/red-giant
      // branch below), so the actual photosphere caves in and spikes — there is no
      // separate blast and never a two-scale frame.
      float collapseLo = 0.04;                                  // bulk near-point
      float baseScale  = mix(1.0, collapseLo, kReg);            // the COLLAPSING bulk
      // FINGER scale: the laggard regions HOLD near the full giant radius while the
      // bulk caves in — that radial CONTRAST is what makes the long streaming spikes
      // (ref Image-3). The fingers are CAPPED at the original sphere surface (scale
      // 1.0) and never punch past it (user constraint). They reach UP toward the
      // surface as the collapse deepens, then taper back toward the bulk near the
      // point so everything reaches the seed for the flash. fingerLife only modulates
      // how far UP toward 1.0 a finger reaches (always ≤ 1.0), never beyond.
      float extendWin = smoothstep(0.0, 0.30, uCollapse) * (1.0 - smoothstep(0.80, 1.0, uCollapse));
      // how close to the full surface this finger reaches (0..1), per region + life.
      float fingerReach = clamp(extendWin * (0.7 + 0.5*lagField) * (0.85 + 0.15*fingerLife), 0.0, 1.0);
      // finger tip scale: between the collapsing bulk and the original surface (1.0),
      // never above it. max() so a finger can only stick OUT relative to the bulk.
      float fingerScale = max(baseScale, mix(baseScale, 1.0, fingerReach));
      // only the sparse laggard regions become fingers; everything else is the bulk.
      float fingerMask = smoothstep(0.10, 0.5, lagField);
      float collapseScale = mix(baseScale, fingerScale, fingerMask);

      // STREAK the fingers: a finger isn't a displaced shell — it's a long trail of
      // matter from the core out to the tip. Spread each finger particle's radius
      // across [bulk core .. finger tip] using a stable per-particle parameter
      // (aThickN, ~[-1,1] → 0..1), so the laggard regions read as long radial streaks
      // populated along their whole length, not stubs. Non-finger (bulk) particles
      // are unaffected (fingerMask≈0 → streakScale==collapseScale==baseScale).
      float along = 0.5 + 0.5*aThickN;                 // 0..1 stable per particle
      along = pow(along, 0.7);                          // bias toward the tip a little
      // streak radius runs from the bulk surface up to this finger's full reach.
      float streakScale = mix(baseScale, collapseScale, mix(1.0, along, fingerMask));

      // tangential curl so the fingers STREAM rather than sit glassy-radial: a
      // curl-like vector (3 decorrelated fbm channels) projected onto the plane
      // perpendicular to dir, drifting slowly with uTime. In UNIT-radius space
      // (multiplied by the surface radius where it's applied). Only on the spikes
      // (scaled by lagField) and only once the collapse is underway.
      vec3 dr = vec3(
        fbm(dir*3.4 +  7.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 19.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 41.0 + vec3(0.0, uTime*0.05, 0.0))
      ) - 0.5;
      dr -= dir*dot(dr, dir);
      // small TANGENTIAL sway (perpendicular to dir → barely affects radius, so the
      // surface cap holds) just to keep the fingers from being glassy-straight.
      vec3 curlOff = dr*(collapseScale*0.22)*lagField*smoothstep(0.05, 0.5, uCollapse);

      // default position for the (rare) case the surface renderer below is inactive:
      // the unit sphere scaled by the (streaked) collapse. The sun/red-giant branch
      // re-applies streakScale + curlOff to its own textured surface radius.
      pos = dir*(giantR*streakScale) + curlOff*giantR;

      // === REVIEW PLACEHOLDERS (no real morph) ===========================
      // Minimal stand-ins for the three new states so their slot + look can be
      // reviewed. They HARD-SWAP (uYellow/uNebula/uDot arrive as 0 or 1) and
      // reshape/retint the same particle sphere. Replace this whole block (and
      // the matching fragment tint) with the real morphs later.
      //   reuse: sphere (unit sphere coord), giantR, gran/heat, churn.
      // -- yellow (sun-like) star: the standalone Sun render, ported ---------
      // Two coupled parts (matching the reference render):
      //  (A) a high-contrast mottled PHOTOSPHERE — domain-warped simplex fbm with
      //      crushed midtones (bright gold cells / deep dark inter-granular lanes),
      //      sunspots and a fine granule octave;
      //  (B) a thin ATMOSPHERE — a stable ~12% subset of particles is lifted off
      //      the surface into coronal LOOPS (arcs that rise over the limb and fall
      //      back to a conjugate foot), radial PROMINENCE jets, and white-hot
      //      FOOTPOINT knots at the loop bases.
      // Channels to the fragment: vSunM (photosphere ramp), vSunLimb (limb glow),
      // vSunDark (network/spots), vSunFlare (1 loop/jet), vSunHot, vSunRed (palette).
      //
      // The SAME recipe drives two states by palette + radius:
      //   - red giant : uGiant alone (no later state) → big, deep red, vSunRed=1
      //   - yellow sun: uYellow → smaller, gold, vSunRed=0
      float redGiant = (uYellow < 0.5 && uNebula < 0.5 && uDot < 0.5) ? 1.0 : 0.0;
      float sunOn    = (uYellow > 0.5 || redGiant > 0.5) ? 1.0 : 0.0;
      if(sunOn > 0.5){
        vPlaceholder = 1.0;
        vSunRed = redGiant;
        // red giants are BIG and bloated; the yellow sun is a tighter orb.
        float sunRadFac = (redGiant > 0.5) ? 1.45 : 0.92;
        float tt = uTime * 0.05;

        // === (A) photosphere field ==========================================
        // Big swirling convection cells (the reference's flowing mottle), NOT
        // high-frequency sand. A LOW base frequency with heavy IQ domain-warp
        // makes large gold cells; deep dark filamentary veins are carved between
        // them so the surface reads bold and structured, not pale and grainy.
        vec3 sp = sphere * 1.25;                           // big cells
        vec3 q2 = vec3(
          sfbm(sp + vec3(0.0,0.0,tt)),
          sfbm(sp + vec3(5.2,1.3,2.7) + tt),
          sfbm(sp + vec3(1.7,9.2,3.4) - tt)
        );
        // two-level warp = swirly, flowing currents
        vec3 q3 = vec3(
          sfbm(sp + 3.0*q2 + vec3(1.7,9.2,3.4)),
          sfbm(sp + 3.0*q2 + vec3(8.3,2.8,4.1)),
          sfbm(sp + 3.0*q2 + vec3(2.6,6.3,7.9))
        );
        float nn = sfbm(sp + 4.5*q3 + tt*0.5);
        float m = clamp(nn*0.5 + 0.5, 0.0, 1.0);
        m = pow(m, 0.62);                                  // brighten cell cores hard
        // medium mottle riding on the big cells (keeps it from looking flat)
        float gran2 = sfbm(sp*2.6 + tt*0.8)*0.5 + 0.5;
        m *= 0.74 + 0.40*gran2;
        // deep dark filamentary VEINS between the cells (the carved orange look)
        float vein = warpFbm(sphere*2.0 + q3 + tt*0.3);    // reuse cheap warp fbm
        float veins = smoothstep(0.58, 0.40, vein);        // network of lanes
        // sunspots: broad low-freq cool patches
        float spotF = sfbm(sphere*1.1 + 11.0);
        float spot  = smoothstep(0.44, 0.30, spotF);
        float dark  = clamp(veins*0.9 + spot*0.95, 0.0, 1.0);
        m *= 1.0 - 0.82*dark;                              // carve veins/spots DEEP
        m = clamp(m, 0.0, 1.0);

        vSunM    = m;
        vSunDark = dark;

        float sunRelief = 1.0 + 0.05*(m - 0.55);
        // collapseScale / curlOff (from the unified surface-collapse block) make the
        // red-giant photosphere cave in non-homogeneously: the bulk shrinks toward the
        // point while laggard regions extend into the finger-spikes. At the full red
        // giant (uCollapse=0) collapseScale=1 and curlOff=0 → the sphere is unchanged.
        float sunR0 = uGiantR * sunRadFac;
        // streakScale spreads finger particles along [core..surface] so the spikes
        // are long populated trails; capped at the surface so they never exceed it.
        vec3 surf = sphere * (sunR0 * sunRelief * streakScale) + curlOff*sunR0;
        pos  = surf;
        heat = m;

        // === (B) atmosphere: loops / prominences / spicules =================
        // Pick a stable subset for the atmosphere using per-particle hashes (no
        // uTime → identity is fixed, so a loop stays a loop frame to frame). The
        // red giant is cooler and far less magnetically active than the yellow
        // sun, so it gets noticeably FEWER, softer features.
        // atmosphere anchored to the (collapsing) surface radius so loops/jets ride
        // the photosphere inward as it caves in rather than hanging in empty space.
        float sunR  = uGiantR * sunRadFac * collapseScale;  // actual (collapsed) radius
        float atmoThresh = (redGiant > 0.5) ? 0.955 : 0.91;
        float pick = h31(vec3(aSeed*53.1, aPhase*11.7, aU*7.3));
        if(pick > atmoThresh){
          // which active region this particle belongs to (a few clustered sites)
          float site = floor(h31(vec3(aSeed*7.0, 2.0, aPhase*3.0)) * 7.0);
          // a stable base direction per active region (clustered, not uniform)
          vec3 rnd = hash33(vec3(site*13.1, site*7.7, site*3.3))*2.0 - 1.0;
          vec3 cdir = normalize(rnd + 1e-3);
          // tangent basis at the active-region centre
          vec3 up0 = abs(cdir.y) < 0.95 ? vec3(0,1,0) : vec3(1,0,0);
          vec3 t1 = normalize(cross(up0, cdir));
          vec3 t2 = cross(cdir, t1);

          float kind = h31(vec3(aPhase*9.0, aSeed*5.0, 4.0));
          float s    = aU;                                  // 0..1 param along feature
          float hp   = sin(3.14159265*s);                   // arch height profile

          if(kind < 0.66){
            // --- coronal LOOP: arch from one foot, over the limb, to the other ---
            float sep  = 0.10 + 0.14*h31(vec3(site, aSeed*3.0, 8.0)); // foot half-sep
            float kH   = 0.12 + 0.28*h31(vec3(site, 9.0, aPhase));     // arch height (contained)
            float az   = h31(vec3(site, aSeed, 1.0)) * 6.2831;         // loop plane spin
            vec3 span  = normalize(cos(az)*t1 + sin(az)*t2);
            // rotate base dir from -sep..+sep around the loop-plane normal
            vec3 axis  = normalize(cross(cdir, span));
            float ang  = (s - 0.5) * 2.0 * sep;
            float ca = cos(ang), sa = sin(ang);
            vec3 base = cdir*ca + cross(axis, cdir)*sa + axis*dot(axis,cdir)*(1.0-ca);
            float rad = sunR * (0.94 + kH*hp);               // rise above the surface
            vec3 lpos = normalize(base) * rad;
            // thin thread jitter so the loop reads as plasma, not a wire
            float thick = sunR * 0.010 * (0.3 + 0.7*hp);
            lpos += span * (h31(vec3(aSeed*31.0, aU*17.0, 5.0))-0.5) * thick;
            pos = lpos;
            float foot = pow(1.0 - hp, 1.6);                 // bright/hot near feet
            vSunFlare = 1.0;
            vSunHot   = clamp(0.25 + 0.65*foot, 0.0, 1.0);
          } else if(kind < 0.82){
            // --- PROMINENCE / jet: short radial spray rising off the surface ---
            float az  = h31(vec3(site, aSeed, 2.0)) * 6.2831;
            vec3 latd = normalize(cos(az)*t1 + sin(az)*t2);
            float hgt = sunR * (0.08 + 0.16*h31(vec3(site, aPhase, 6.0))); // contained
            vec3 jdir = normalize(cdir + latd*0.10);
            float lat = sunR*0.025*sin(s*8.0 + aSeed*6.0)*pow(s,0.7);
            vec3 jpos = jdir * (sunR*0.94 + hgt*s) + latd*lat;
            pos = jpos;
            vSunFlare = 1.0;
            vSunHot   = clamp(0.55 - 0.4*s, 0.0, 1.0);       // hot root, cooler tip
          } else {
            // --- SPICULE spray: short fine threads fanning up off the surface
            //     (a soft bright fringe at the active region, not a hard knot).
            vec3 jit = (hash33(vec3(aSeed*61.0, aPhase*23.0, aU*9.0))*2.0-1.0);
            vec3 sdir = normalize(cdir + (t1*jit.x + t2*jit.y)*0.18);
            float len = sunR * (0.05 + 0.10*h31(vec3(aU*5.0, aSeed, 3.0)));
            pos = sdir * (sunR*0.95 + len*s);
            vSunFlare = 1.0;                            // treat as thin plasma thread
            vSunHot   = clamp(0.5 - 0.3*s, 0.0, 1.0);   // hot root → cooler tip
          }
        }
      }
      // -- nebula: a sprawling, filamentary supernova remnant (Crab-like) -----
      // Abstracted from the reference: a big, organically-clustered VOLUME — not a
      // shell of rays. Each particle gets a stable position inside a soft-edged,
      // slightly-flattened ELLIPSOID (filled, not a sphere surface), then a drifting
      // 3D domain-warped fbm field carves a tangled WEB of bright filaments against
      // dark voids. The web (not the geometry) is what reads as the Crab's tendrils,
      // so there are NO radial spokes — it's a 3D cloud seen from outside. The warp
      // drifts with uTime ("wave styling") so the whole web slowly rolls and folds
      // → texture + cohesion (liant). Per-particle size/colour come from the web
      // density (heat) and the position in the cloud (vNeb), so dense strands are
      // fat & bright while void dust is tiny & faint. Camera pulls WAY back here.
      if(uNebula > 0.5){
        // stable per-particle position in a FILLED ellipsoid. Direction from the
        // even-area sphere map; radius from a cube-root so the volume fills evenly
        // (not surface-biased). Squashed on Y → a broad oval like the reference.
        float rrnd = h31(vec3(aSeed*91.7, aU*13.3, 7.0));
        float fillR = pow(rrnd, 0.40);                     // even volume fill, slight core bias
        vec3 cell = vec3(sphere.x, sphere.y*0.66, sphere.z); // flattened oval
        vec3 p0   = cell * (uGiantR * 3.6 * fillR);        // big sprawling volume (~0..15)

        // --- drifting 3D filament web: domain-warped fbm over the WORLD position
        //     carves ropey, branching lanes (the tendrils). Two warp octaves give
        //     the tangled look; the drift makes it roll slowly over time.
        vec3 nDrift = vec3(uTime*0.020, uTime*0.014, -uTime*0.016);
        vec3 wp = p0 * 0.34;
        vec3 wq = vec3(
          fbm(wp + 3.0 + nDrift),
          fbm(wp + 17.0 + nDrift),
          fbm(wp + 41.0 + nDrift)
        );
        float web = fbm(wp*1.7 + 2.4*wq + nDrift*1.3);     // 0..1 ropey field
        float strand = smoothstep(0.46, 0.78, web);        // thin high band → strand
        float vein   = pow(strand, 1.5);                   // crisp strand cores
        float voidF  = 1.0 - smoothstep(0.30, 0.48, web);  // dark interior voids

        // --- wave displacement: pull particles TOWARD the nearest filament ridge
        //     (gradient of the web field) so matter visibly clusters onto the
        //     strands, and add a slow transverse sway. Both drift with uTime so the
        //     web breathes. This is a small NUDGE in world space — no radial bias,
        //     so the cloud stays volumetric (no spokes).
        float e = uGiantR*0.18;
        float wx = fbm((p0+vec3(e,0,0))*0.34*1.7 + nDrift*1.3) - fbm((p0-vec3(e,0,0))*0.34*1.7 + nDrift*1.3);
        float wy = fbm((p0+vec3(0,e,0))*0.34*1.7 + nDrift*1.3) - fbm((p0-vec3(0,e,0))*0.34*1.7 + nDrift*1.3);
        float wz = fbm((p0+vec3(0,0,e))*0.34*1.7 + nDrift*1.3) - fbm((p0-vec3(0,0,e))*0.34*1.7 + nDrift*1.3);
        vec3 grad = vec3(wx, wy, wz);                      // points uphill (toward ridges)
        vec3 toRidge = grad * (uGiantR * 1.1);             // condense onto strands
        // slow billow so the gas isn't glassy-static (the "wave"/liant motion)
        vec3 sway = vec3(
          fbm(p0*0.16 +  9.0 + nDrift*0.7),
          fbm(p0*0.16 + 23.0 + nDrift*0.7),
          fbm(p0*0.16 + 51.0 + nDrift*0.7)
        ) - 0.5;
        pos = p0 + toRidge + sway * (uGiantR * 0.9);

        // density/brightness proxy for the fragment colour ramp + sizing.
        float dens = clamp(0.12 + 1.25*vein + 0.18*(1.0-voidF), 0.0, 1.4);
        // radial factor: hot bluish-teal core → cooler rusty rim (reference palette).
        float rN = clamp(length(pos) / (uGiantR*3.4), 0.0, 1.0);
        vNeb  = rN;                                        // 0 core → 1 rim (colour)
        heat  = dens;                                      // strand density (lum + size)
        vPlaceholder = 2.0;
      }
      // -- pale blue dot: collapse to a small, soft, cool sphere ------------
      if(uDot > 0.5){
        pos = sphere * (uGiantR * 0.18);
        heat = 0.5;
        vPlaceholder = 3.0;
      }
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
      // uSecOffset (aspect-space) nudges the secondary band toward/away from the
      // primary so the hard seam between the two layers can be closed.
      ndcFinal = bhN + vec2((dA.x + uSecOffsetX)/uAspect, dA.y + uSecOffsetY);
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

    // === center-out feed (scroll-UP: seed → hero disk) =====================
    // During the transition the disk lights from the CENTER OUTWARD: at high
    // uMorph only the inner ring glows; as uMorph→0 a front sweeps to the rim so
    // the full hero disk is lit (the disk "charges up" from a central source).
    // NO-OP at the hero (uMorph=0): the front sits past the rim → feed=1 for all
    // aU, so the resting disk is exactly unchanged. Only active for uMorph<0.46,
    // below the implosion lighting, so it never fights the explosion.
    float feedActive = smoothstep(0.46, 0.30, uMorph);          // 1 below 0.30 → 0 above 0.46
    float feedFront  = mix(1.25, 0.0, smoothstep(0.0, 0.45, uMorph)); // aU front: 1.25 @0 → 0 @0.45
    float feed       = smoothstep(feedFront + 0.22, feedFront, aU);   // inner (aU small) lit first
    float feedHot    = exp(-pow((aU - feedFront)/0.10, 2.0)) * 0.8;   // traveling feeding point
    feed = mix(1.0, feed * (1.0 + feedHot), feedActive);        // relax to 1.0 when inactive
    bright *= feed;

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
    // The dense core goes genuinely DARK — the light has fallen into the point, so
    // the seed reads as a real black hole, not a painted glow. Widen the dark zone
    // (uRin*0.6) and broaden+deepen the dip (σ0.07, 0.97) so the core holds near-
    // black across the whole seed beat. coreDark is declared ONCE here and reused
    // by the accretion-stream light and the flash gate below.
    float coreDark = 1.0 - smoothstep(uRin*0.15, uRin*0.6, r); // 1 deep in the core
    // centred just BEFORE the flash and narrow, so the core is near-black at the
    // seed but releases by the breakout (0.50) → the loud flash survives.
    float seedDip = exp(-pow((uMorph-0.45)/0.04, 2.0));
    bright *= 1.0 - 0.97*seedDip*coreDark;
    // peak-compression dip — edge-shaping; the JS uBright cut + the ceiling
    // below do the heavy lifting against a whiteout, this softens the burst rim.
    float compress = exp(-pow((uMorph-0.5)/0.15, 2.0));
    bright *= 1.0 - 0.40*compress;
    // the shock-breakout burst — the one bright beat we DO want for the supernova
    // proper, but GATED so it never paints a glow blob over the dark seed: the
    // dense core gets almost none of it (it must read black), and the additive
    // glow is extra-suppressed right in the seed window. The spread-out SHELL and
    // fingers (coreDark≈0 out there) keep the full loud breakout, so the detonation
    // is unchanged — only the central blob is removed.
    // narrow + early so it darkens the seed (≤0.47) but is RELEASED by the flash
    // peak (0.50) — otherwise it eats the loud breakout the user wants to keep.
    float seedSuppress = exp(-pow((uMorph-0.45)/0.035, 2.0));   // 1 at seed → 0 by flash
    float flashGate = (1.0 - 0.92*coreDark) * (1.0 - 0.80*seedSuppress*coreDark);
    bright += uFlash * (0.85 + 1.1*pv) * (0.6 + 0.4*useMag) * flashGate;
    // accretion stream: light ONLY on the strained infalling matter just OUTSIDE
    // the dark core (∝ inward strain), so you see glowing strands spiralling into
    // a black point — the "aspiration" read — instead of a glow blob. Never lights
    // the core itself ((1-coreDark)). infallGlow comes from the position block.
    bright += infallGlow * (0.5 + 0.6*pv) * (1.0 - coreDark);

    // -- expanding shock shell -----------------------------------------------
    // A thin bright spherical front sweeps outward AHEAD of the bulk debris
    // (exponent 0.5 < the bulk's 0.62 reach), lighting particles near it then
    // passing them; it dims as it inflates and thins (E∝1/r²). Additive, so it
    // flashes through voids too. shellFront/band are reused by the heat proxy.
    // This bright front is the structural hero of the blast — it stays vivid
    // once the matter has SPREAD (low density) so it can't whiteout. Its radius
    // tracks the (now modest) ejecta so it lights real particles, not empty space.
    float shellFront = uRout * (0.06 + 0.55*pow(flare, 0.42)); // 0.06→0.61 rOut, faster
    float shellW     = uRout * 0.05;                            // thin crisp band
    float band       = exp(-pow((r - shellFront)/shellW, 2.0));
    // brighter, launches earlier — a wall of light sweeping outward. The shell is
    // LOW-density (matter has spread), so it can be bright without a whiteout.
    float shellLight = band * (1.0 - 0.3*flare) * 5.2 * smoothstep(0.49, 0.60, uMorph);
    bright += shellLight * (0.6 + 1.2*pv);

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
    // flash, AND the surface collapsing to its point) clamp per-particle emission so
    // ~1.2M additively-blended overlapping dots cannot stack into an edge-to-edge
    // white plate. The ceiling lifts as the matter spreads out (density falls) so
    // the shell/jets/fingers keep their punch.
    float dense = exp(-pow((uMorph-0.48)/0.12, 2.0));     // 1 at the flash → 0 away
    // also clamp the packed point of the surface collapse — but ONLY while the giant
    // surface model is active (uGiant>0). At the hero (uGiant=0) uCollapse is pinned
    // at 1, so without this gate it would wrongly dim the black-hole disk.
    dense = max(dense, smoothstep(0.6, 1.0, uCollapse) * step(0.001, uGiant));
    float ceil  = mix(40.0, 3.4, dense);                  // cap at the flash (a touch higher → louder)
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

      // Hold the photosphere lighting on through the COLLAPSE so the shrinking,
      // spiking surface stays a lit (red→warm) surface rather than greying into the
      // dark ember ramp early. g rides uGiant for the gather/red-giant, but is
      // floored to ~1 across the collapse window (1-uCollapse only releases it right
      // at the point, where the legacy flash/ember ramp takes over). At uGiant=0 it
      // is 0 → the hero/seed disk is untouched.
      float g = smoothstep(0.0, 1.0, uGiant);
      g = max(g, smoothstep(0.04, 0.30, uGiant) * (1.0 - smoothstep(0.85, 1.0, uCollapse)));
      bright = mix(bright, giantBright, g);

      // heat channel for the colour ramp: deep red base, hot plage highlights.
      float hch = clamp(gran*(1.0 - 0.85*umbra) + plage*1.2, 0.0, 1.15);
      vHeat = mix(0.5, hch, g);
      vGiant = g;

      // --- sun override: brightness from the ported photosphere recipe ------
      // The standalone Sun render lights its surface by the warm field vSunM,
      // limb darkening, active-region lift and a bright fresnel limb. The same
      // lighting drives the red giant (vSunRed=1), only cooler and dimmer so it
      // reads as a big, deep-red, matte star rather than a vivid gold sun.
      if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
        float limb = pow(1.0 - mu, 2.0);              // fresnel limb (pow 2)
        vSunLimb = limb;
        if(vSunFlare > 0.5){
          // coronal LOOP / prominence thread — glowing plasma, hotter toward
          // the feet/root (vSunHot), softer at the apex/tip. Red giant runs its
          // (rare) features dimmer and cooler.
          bright = (0.7 + 1.5*vSunHot) * mix(1.0, 0.7, vSunRed);
        } else {
          // PHOTOSPHERE — warm cells bright, veins/spots dark. Kept deliberately
          // LOW so ~1M additively-blended points don't stack into a white centre;
          // the colour ramp carries the hue, brightness only modulates it. A
          // gentle limb-darkening keeps the disc edge from glaring.
          float m = vSunM;
          // red giant: lower overall luminance + a bit more limb darkening (a
          // big diffuse cool star, dimmer toward the rim).
          float baseLo = mix(0.30, 0.22, vSunRed);
          float baseHi = mix(0.62, 0.50, vSunRed);
          float limbMu = mix(0.18, 0.30, vSunRed);
          float lum = (baseLo + baseHi*m) * (1.0 - vSunDark*0.85) * ((1.0-limbMu) + limbMu*mu);
          float arBright = smoothstep(0.86, 0.995, m) * mix(0.45, 0.25, vSunRed);
          bright = (lum + arBright + limb*mix(0.30, 0.22, vSunRed));
          vHeat = m;
        }
      }
      // --- nebula lighting: glowing filament gas, not a lit surface -----------
      // The giant photosphere lighting above is meaningless for a scattered cloud,
      // so override it. Emission tracks the strand density (heat=dens from the
      // geometry block): bright filament cores, faint void dust. The radial factor
      // (vNeb) dims the rusty outer rim a touch so the teal core reads as the hot
      // heart of the remnant. Kept LOW per-particle because the big overlapping
      // grains accumulate additively — the bloom/grade supply the overall glow.
      if(vPlaceholder > 1.5 && vPlaceholder < 2.5){
        float dens = clamp(heat, 0.0, 1.4);
        // HIGH-CONTRAST: voids near-dark, strand cores glow. The cloud must read
        // as a filament web against black (the reference is mostly dark space),
        // not a uniform luminous blob — so keep the floor very low and let only
        // the dense strands light up.
        bright = 0.05 + 0.95*dens*dens;          // strand cores glow, voids near-dark
        // the cyan HEART glows brightest (an illuminated central region, like the
        // reference's lit core); the rusty rim falls off.
        bright *= 1.0 + 0.7*(1.0 - vNeb);        // core brighter than rim
        vHeat = dens;                            // keep density for the colour ramp
        vGiant = 1.0;                            // (unused by the nebula tint path)
      }
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
    // yellow photosphere: enlarge the grains so ~1M points OVERLAP into a solid
    // surface (kills the sandy per-point speckle, leaving the big swirly cells).
    float yellowSurf = (vPlaceholder > 0.5 && vPlaceholder < 1.5 && vSunFlare < 0.5) ? 1.0 : 0.0;
    surfSize = mix(surfSize, baseSize * 3.0, yellowSurf);
    // ejecta grains swell modestly during the blast so the debris reads as
    // glowing embers/streamers, but not so much that they overlap into a wash.
    float blastSize = baseSize * 1.5;
    float size = mix(baseSize, blastSize, morphFlare);
    size = mix(size, surfSize, vGiant);
    float maxSize = mix(mix(4.5, 6.0, morphFlare), 7.0, vGiant);
    maxSize = mix(maxSize, 13.0, yellowSurf);   // bigger grains may overlap solid
    gl_PointSize = clamp(size, 0.6, maxSize);
    // yellow-sun atmosphere: loop/jet threads are THIN; footpoint knots a bit
    // larger and bright. Overrides the generic surface sizing above.
    if(vSunFlare > 1.5){
      gl_PointSize = clamp(baseSize * 0.9, 0.8, 2.8);    // footpoint grain (small)
    } else if(vSunFlare > 0.5){
      gl_PointSize = clamp(baseSize * 0.8, 0.6, 2.4);    // loop / jet thread
    }
    // nebula: DIFFERENT sizing across the cloud (user ask). Dense filament cores
    // get fat soft grains that overlap into glowing gas; sparse void dust gets tiny
    // grains. A per-particle seed adds spread so the cloud isn't uniform. The big
    // soft grains are what make the scattered points read as continuous nebulosity
    // rather than a field of sand.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.5){
      float sizeRand = 0.5 + 0.9*aSeed;                  // per-particle variety
      float nebSize  = baseSize * (0.8 + 2.6*vHeat) * sizeRand; // strands fat, voids small
      gl_PointSize = clamp(nebSize, 0.6, 11.0);
    }
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
  varying float vPlaceholder; // REVIEW: 0 none, 1 yellow, 2 nebula, 3 dot
  varying float vNeb;    // nebula radial factor (0 hot core → 1 rusty rim)
  varying float vSunM;    // warm photosphere field for the yellow-sun ramp
  varying float vSunLimb; // limb factor → bright gold rim glow
  varying float vSunDark; // sunspot/network darkening
  varying float vSunFlare;// 0 photosphere, 1 loop/jet, 2 footpoint knot
  varying float vSunHot;  // white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    // soft round falloff that fills the photosphere.
    float a = smoothstep(0.5, 0.04, d);
    // yellow photosphere: a smooth GAUSSIAN profile (no flat disc core) so the
    // big overlapping grains average into a continuous surface instead of a
    // field of hard little discs — this is what kills the sandy speckle.
    if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
      a = (vSunFlare < 0.5) ? exp(-d*d*7.0) : exp(-d*d*9.0);
    }
    // nebula: a soft wide gaussian so the big varied grains melt into continuous
    // glowing gas with no hard edges (cloud, not confetti).
    if(vPlaceholder > 1.5 && vPlaceholder < 2.5){
      a = exp(-d*d*4.5);
    }

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

    // === STATE TINTS ======================================================
    // Yellow (sun) is a full port of the standalone Sun render's colour grade;
    // nebula and pale-blue-dot remain flat placeholders.
    if(vPlaceholder > 0.5){
      vec3 pcol = col;
      if(vPlaceholder < 1.5){
        // -- sun (ported recipe): gold for the yellow star, deep red for the
        //    red giant. vSunRed (0 gold / 1 red) selects the palette. ---------
        if(vSunFlare > 0.5){
          // coronal loops / prominences: hot plasma, deep cool tip → bright root.
          float ht = clamp(vSunHot, 0.0, 1.0);
          // gold-sun flare ramp
          vec3 gfc = mix(vec3(1.0, 0.40, 0.06), vec3(1.0, 0.72, 0.26), smoothstep(0.2, 0.6, ht));
          gfc = mix(gfc, vec3(1.0, 0.94, 0.78), smoothstep(0.6, 1.0, ht));
          // red-giant flare ramp: dark blood-red → red-orange (never white-hot)
          vec3 rfc = mix(vec3(0.55, 0.05, 0.01), vec3(0.95, 0.26, 0.04), smoothstep(0.2, 0.65, ht));
          rfc = mix(rfc, vec3(1.0, 0.45, 0.12), smoothstep(0.65, 1.0, ht));
          pcol = mix(gfc, rfc, vSunRed);
        } else {
          // PHOTOSPHERE: the warm field vSunM drives a 5-stop ramp. The gold ramp
          // (umbra→red→orange→gold→pale yellow) is the standalone Sun render; the
          // red-giant ramp stays deep maroon→blood-red→red-orange (no gold/white)
          // so the big star reads unmistakably RED.
          float m = vSunM;
          // gold (yellow sun)
          vec3 sc = vec3(0.20, 0.028, 0.0);
          sc = mix(sc, vec3(0.72, 0.17, 0.01), smoothstep(0.10, 0.34, m));
          sc = mix(sc, vec3(1.00, 0.44, 0.06), smoothstep(0.28, 0.52, m));
          sc = mix(sc, vec3(1.00, 0.64, 0.16), smoothstep(0.52, 0.76, m));
          sc = mix(sc, vec3(1.00, 0.84, 0.40), smoothstep(0.84, 0.99, m));
          sc = mix(sc, vec3(0.20, 0.030, 0.0), vSunDark);
          sc += smoothstep(0.88, 0.99, m) * vec3(0.5, 0.28, 0.07);
          sc = mix(sc, vec3(1.0, 0.74, 0.30), vSunLimb*0.72);
          sc += vSunLimb * vec3(0.6, 0.32, 0.08);
          sc *= 1.15;
          // red giant — deep, saturated red photosphere
          vec3 rc = vec3(0.14, 0.012, 0.004);                   // near-black umbra
          rc = mix(rc, vec3(0.46, 0.05, 0.012), smoothstep(0.08, 0.34, m)); // dark blood red
          rc = mix(rc, vec3(0.78, 0.13, 0.02),  smoothstep(0.30, 0.58, m)); // red
          rc = mix(rc, vec3(0.95, 0.26, 0.04),  smoothstep(0.56, 0.80, m)); // red-orange
          rc = mix(rc, vec3(1.00, 0.40, 0.10),  smoothstep(0.84, 1.0, m));  // hot orange (rare)
          rc = mix(rc, vec3(0.12, 0.010, 0.0), vSunDark);       // deep dark spots/veins
          // cool, dusky red limb (forward-scattered, not bright gold)
          rc = mix(rc, vec3(0.85, 0.20, 0.05), vSunLimb*0.55);
          rc += vSunLimb * vec3(0.30, 0.05, 0.01);

          pcol = mix(sc, rc, vSunRed);
        }
      } else if(vPlaceholder < 2.5){
        // nebula (Crab-like): a teal/green luminous core grading out to rusty
        // orange filament edges, exactly the reference palette. vNeb is the radial
        // factor (0 core → 1 rim); vHeat is the strand density (faint dust → bright
        // strand core). The hue walks cyan → green → gold → rust as we move out,
        // and the brightest strands push toward warm white so the web glows.
        // Palette walks the reference: a luminous teal/cyan HEART filling most of
        // the cloud, greening through the mid filaments, and only the OUTERMOST
        // tendrils warming to gold then rust. Teal/green dominate (the bulk); gold
        // and rust are squeezed into the far rim so the remnant reads cyan-cored.
        float rr = clamp(vNeb, 0.0, 1.0);
        vec3 cCore = vec3(0.40, 0.86, 0.96);   // hot bluish-cyan heart
        vec3 cTeal = vec3(0.20, 0.74, 0.66);   // teal-green inner web
        vec3 cGreen= vec3(0.50, 0.78, 0.34);   // yellow-green mid filaments
        vec3 cGold = vec3(0.95, 0.64, 0.20);   // amber strand
        vec3 cRust = vec3(0.82, 0.28, 0.10);   // rusty orange outer tendrils
        vec3 ncol = mix(cCore, cTeal, smoothstep(0.0, 0.30, rr));
        ncol = mix(ncol, cGreen, smoothstep(0.30, 0.55, rr));
        ncol = mix(ncol, cGold,  smoothstep(0.55, 0.76, rr));
        ncol = mix(ncol, cRust,  smoothstep(0.76, 0.96, rr));
        // dense strand cores brighten toward warm white (the glowing filament spine)
        float spine = smoothstep(0.85, 1.35, vHeat);
        ncol = mix(ncol, vec3(0.85, 0.97, 0.92), spine*0.45);  // cool-white spine, not gold
        // a faint cool fill in the voids so the whole volume reads as gas, not gaps
        ncol = mix(vec3(0.05, 0.16, 0.22), ncol, smoothstep(0.04, 0.45, vHeat));
        pcol = ncol;
      } else {
        // pale blue dot: the famous faint blue point.
        pcol = vec3(0.55, 0.72, 0.95);
      }
      col = pcol;
    }

    float inten = vBright * a;
    // Yellow (sun): the photosphere ramp colour already encodes surface
    // luminance, so drive its intensity mostly from coverage (×a) with a gentle
    // lift — keeps the gold gradient true instead of clipping to white, and lets
    // the bloom/grade passes supply the glow (as the standalone render's bloom
    // does). Atmosphere particles (loops/jets/knots) keep their full additive
    // brightness so they read as glowing plasma against the disc.
    if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
      if(vSunFlare > 0.5){
        inten = a * clamp(vBright, 0.0, 2.2);
      } else {
        // bigger overlapping photosphere grains accumulate additively → keep
        // per-grain intensity low so the disc stays in gamut and the cells show.
        inten = a * (0.22 + 0.42*clamp(vBright, 0.0, 1.3));
      }
    }
    // nebula: keep per-grain intensity LOW so the many overlapping soft grains
    // accumulate additively into luminous gas WITHOUT clipping to white — the
    // colour ramp (teal core → rust rim) must survive, not blow out to cream. The
    // voids stay dark; only the dense strands build up brightness. Bloom adds the
    // glow on top, so per-grain emission stays well under 1.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.5){
      inten = a * (0.16 + 0.62*clamp(vBright, 0.0, 1.6));
    }
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
  uniform float uRingScale;
  varying float vB;
  void main(){
    vec4 bhC = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    vec2 ndcBH = bhC.xy / bhC.w;
    // SIZE-COUPLED RING. The photon ring is BRIGHTEST at the hero (uMorph≈0),
    // where the black hole is largest, and dims as the hole shrinks toward the
    // seed during the morph — the rim of light reads as a property of the hole's
    // size. It is fully gone before the shadow collapses to the seed/flash so the
    // remnant isn't haloed. bloom is the master 1->0 envelope.
    float bloom = 1.0 - smoothstep(0.10, 0.42, uMorph); // full at the hero, gone before the seed
    // As the ring dims it also tightens onto the rim and slims its band, so the
    // fade reads as the rim collapsing to a finer hairline, not just dropping out.
    float tighten = mix(1.0, 0.94, bloom);         // a touch tighter as it dims (bloom→0)
    float spread  = mix(0.012, 0.03, bloom);       // thinner radial band as it dims
    // uRingScale (dev): radius of the ring relative to the dark-core rim.
    float r = uHole * uRingScale * tighten * (1.0 + (aSeed-0.5)*spread);  // thin ring at the dark-core rim
    vec2 dir = vec2(cos(aAng), sin(aAng));
    vec2 ndc = ndcBH + vec2(dir.x * r / uAspect, dir.y * r);
    gl_Position = vec4(ndc, 0.0, 1.0);
    float tw = 0.78 + 0.22*sin(uTime*1.4 + aSeed*53.0);
    // complete, crisp circle in front of the stars: high floor, approaching side a touch brighter
    float dop = 0.85 + 0.40*smoothstep(0.55, -0.7, dir.x + 0.22*dir.y);
    // Baseline ~50% dimmer than before (a subtle rim, never a blazing halo).
    vB = tw * dop * (0.6 + 0.4*aSeed) * 1.45 * uRingBright * 0.5;
    // adjustable top/bottom and left/right asymmetries
    vB *= clamp(1.0 + uVertAsym * dir.y, 0.0, 3.0);
    vB *= clamp(1.0 - uHorizAsym * dir.x, 0.0, 3.0);
    // Gate by the size-coupled envelope: full at the hero, fading as the hole
    // shrinks, then gone before the shadow collapses.
    vB *= bloom;
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

// ===========================================================================
//  YELLOW-STAR SUN RIG (the standalone "The Sun · Three.js" render, ported)
//
//  The yellow lifecycle stage swaps the particle cloud out for a faithful port
//  of the reference render: a real IcosahedronGeometry photosphere mesh, a
//  BackSide inner-glow shell, a camera-facing corona billboard, and a separate
//  CPU-built Points system of coronal loops / prominences / spicules with a
//  per-particle foot-to-foot "jet whip" lifecycle.
//
//  The reference's standalone scaffolding (its own bloom pipeline, OrbitControls
//  drag/zoom, HUD, loader, fonts, starfield) is dropped — this scene already owns
//  the camera, scroll, post (UnrealBloom + GradeShader) and starfield. The rig is
//  added to the shared scene so the existing post pipeline grades it for free.
//
//  Ported to three ^0.180 from r128: the GLSL is unchanged (raw ShaderMaterial
//  fragment output is not auto color-managed), but the result is sRGB-encoded on
//  output and run through GradeShader, so the on-screen look is tuned via the
//  render-loop yellow grade rather than copied 1:1 from the reference's ACES.
// ===========================================================================

// Ashima 3D simplex noise + fbm — kept verbatim from the reference so the
// photosphere/corona match exactly (independent of the disk's own simplex above).
const SUN_NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<6;i++){ v += a*snoise(p); p*=2.02; a*=0.5; }
  return v;
}
`;

// --- photosphere mesh (high-contrast mottled gold surface) ---
const sunSurfaceVert = /* glsl */ `
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vObj = normalize(position);
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const sunSurfaceFrag = SUN_NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  // uRed ∈ [0,1]: 0 = yellow star (gold, bright), 1 = red giant (deep red, dim).
  // Drives the photosphere from a hot gold palette toward a cool, matte, deep-red
  // one and pulls overall brightness down — the COOLING half of the inflation.
  uniform float uRed;
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vec3 p = vObj * 2.4;
    float t = uTime * 0.05;
    vec3 q;
    q.x = fbm(p + vec3(0.0,0.0,t));
    q.y = fbm(p + vec3(5.2,1.3,2.7) + t);
    q.z = fbm(p + vec3(1.7,9.2,3.4) - t);
    float n = fbm(p + 3.2*q + t*0.5);
    float m = clamp(n*0.5+0.5, 0.0, 1.0);

    // gold (yellow-star) photosphere ramp
    vec3 g0 = vec3(0.24,0.035,0.0);
    vec3 g1 = vec3(0.72,0.17,0.01);
    vec3 g2 = vec3(1.00,0.44,0.06);
    vec3 g3 = vec3(1.00,0.64,0.16);
    vec3 g4 = vec3(1.00,0.84,0.40);
    // red-giant ramp: deep maroon → blood red → red-orange (never gold/white)
    vec3 r0 = vec3(0.10,0.008,0.003);
    vec3 r1 = vec3(0.42,0.04,0.01);
    vec3 r2 = vec3(0.72,0.11,0.02);
    vec3 r3 = vec3(0.90,0.22,0.04);
    vec3 r4 = vec3(1.00,0.34,0.08);
    // cross-fade each stop from gold → red as uRed rises (linear recolour)
    vec3 c0 = mix(g0, r0, uRed);
    vec3 c1 = mix(g1, r1, uRed);
    vec3 c2 = mix(g2, r2, uRed);
    vec3 c3 = mix(g3, r3, uRed);
    vec3 c4 = mix(g4, r4, uRed);

    vec3 col = c0;
    col = mix(col, c1, smoothstep(0.14,0.40,m));
    col = mix(col, c2, smoothstep(0.34,0.58,m));
    col = mix(col, c3, smoothstep(0.55,0.78,m));
    col = mix(col, c4, smoothstep(0.80,0.96,m));

    float ch = fbm(p*1.4 + 2.0*q.yzx + t*0.3);
    float chMask = smoothstep(0.12, -0.05, ch);
    col = mix(col, mix(vec3(0.20,0.030,0.0), vec3(0.08,0.006,0.0), uRed), chMask*0.55);

    float spot = smoothstep(0.34, -0.20, ch) * smoothstep(0.45,0.2,m);
    col = mix(col, vec3(0.06,0.01,0.0), spot*0.6);

    float gran = fbm(p*7.0 + t*1.0);
    col *= 0.86 + 0.26*(gran*0.5+0.5);

    // bright active-region speckle fades out toward the (quiet) red giant
    float ar = smoothstep(0.88, 0.99, m) * (1.0 - 0.85*uRed);
    col += ar * vec3(0.5,0.28,0.07);

    vec3 vd = normalize(-vViewPos);
    float fres = 1.0 - max(dot(vd, vViewN), 0.0);
    float limb = pow(fres, 2.0);
    // gold limb → dusky red limb; weaken it for the red giant
    vec3 limbCol = mix(vec3(1.0,0.74,0.30), vec3(0.78,0.18,0.04), uRed);
    col = mix(col, limbCol, limb*mix(0.72, 0.5, uRed));
    col += limb * mix(vec3(0.6,0.32,0.08), vec3(0.26,0.05,0.01), uRed);

    // overall luminance: bright gold sun → dim matte red giant (light leads size)
    col *= mix(1.15, 0.5, uRed);
    gl_FragColor = vec4(col, 1.0);
  }`;

// --- inner chromosphere glow (BackSide additive shell) ---
const sunGlowVert = /* glsl */ `
  varying vec3 vN; varying vec3 vP;
  void main(){ vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
    gl_Position=projectionMatrix*mv; }`;
const sunGlowFrag = /* glsl */ `
  uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
  void main(){ vec3 vd=normalize(-vP);
    float i=pow(1.0-max(dot(vd,vN),0.0), 2.2);
    gl_FragColor=vec4(uColor*i*1.6, 1.0); }`;

// --- soft corona haze (camera-facing additive billboard) ---
const sunCoronaVert = /* glsl */ `
  varying vec2 vUv; void main(){ vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const sunCoronaFrag = SUN_NOISE_GLSL + /* glsl */ `
  uniform float uTime; uniform float uDiskFrac; varying vec2 vUv;
  // uRed ∈ [0,1]: redden + fade the corona as the yellow star inflates into the
  // (magnetically quiet, coronae-poor) red giant. uDiskFrac is updated per frame
  // so the halo tracks the growing disc.
  uniform float uRed;
  void main(){
    vec2 pp = (vUv-0.5)*2.0;
    float r = length(pp);
    float a = atan(pp.y, pp.x);
    float df = uDiskFrac;
    float halo = exp(-max(r-df,0.0)*7.0);
    float st = fbm(vec3(cos(a)*0.8, sin(a)*0.8, uTime*0.02));
    st = st*0.5+0.5;
    float streamer = pow(st,3.5)*exp(-max(r-df,0.0)*2.0);
    float corona = halo*0.50 + streamer*0.22;
    corona *= smoothstep(df-0.02, df+0.04, r);
    corona *= smoothstep(1.0, df+0.05, r);
    vec3 c = mix(vec3(1.0,0.56,0.16), vec3(1.0,0.78,0.38), st*0.7);
    c = mix(c, vec3(0.85,0.20,0.05), uRed);          // gold corona → dim red haze
    gl_FragColor = vec4(c*corona*0.6*mix(1.0, 0.35, uRed), 1.0);
  }`;

// --- dedicated yellow-stage star backdrop (plain, depth-tested) ---
// Unlike the lensed starfield (which warps around the dead black hole and draws
// with depthTest OFF so it bleeds through the opaque sun), this is a simple
// far-away dome of twinkling stars rendered with real depth testing, so the
// solid photosphere occludes the stars behind it. It only exists for the yellow
// stage and rides inside the sun rig group, so it shows/hides with the sun.
const sunStarVert = /* glsl */ `
  attribute float aSeed;
  attribute float aMag;            // 0..1 magnitude → size + base brightness
  uniform float uTime, uPixelRatio, uOpacity, uBright;
  varying float vB;
  varying float vTint;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // slow, per-star twinkle (a few stars shimmer, most hold steady)
    float tw = 0.78 + 0.22 * sin(uTime * (0.4 + 0.9*aSeed) + aSeed * 39.0);
    // brighter, larger stars are rarer (aMag near 1). The overall scale (uBright)
    // is pushed up so the points survive the tone-map + olive grade + vignette.
    float lum = mix(0.55, 2.4, aMag*aMag);
    vB = lum * tw * uOpacity * uBright;
    vTint = fract(aSeed * 17.0);   // 0..1 → cool/neutral/warm star colour
    // size scales with magnitude; the dome sits ~640u out, so the world→pixel
    // factor keeps stars as crisp pinpoints with a few larger standouts.
    float dist = -mv.z;
    gl_PointSize = clamp(uPixelRatio * (1.3 + 4.5*aMag*aMag) * (640.0/dist), 1.0, 6.0);
  }
`;
const sunStarFrag = /* glsl */ `
  precision highp float;
  varying float vB;
  varying float vTint;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // subtle stellar colour: cool blue-white → neutral → warm gold
    vec3 cool = vec3(0.80, 0.88, 1.00);
    vec3 warm = vec3(1.00, 0.92, 0.78);
    vec3 col = mix(cool, warm, smoothstep(0.35, 0.85, vTint));
    gl_FragColor = vec4(col * vB * a, a);
  }
`;

// --- coronal loops / prominences / footpoints (animated Points) ---
const sunLoopVert = /* glsl */ `
  attribute vec3 aColor; attribute float aSize; attribute float aSeed;
  attribute float aU; attribute float aBright;
  attribute vec3 aSeedPos; attribute float aLifeOff; attribute float aLifePer;
  attribute float aOn; attribute float aSweep; attribute float aSeq;
  uniform float uPix; uniform float uTime; uniform float uPS;
  varying vec3 vCol; varying float vB; varying float vHot;
  void main(){
    vCol = aColor;
    float phase = fract(uTime/aLifePer + aLifeOff);
    float a     = phase / aOn;                       // 0..1 across active window
    float inWin = step(phase, aOn);

    // arches fire in sequence (lowest first): this arch begins at aSeq and its
    // jet whips fast from one foot to the other like a fountain stream A -> B.
    float JET   = 0.12;                              // per-arch crossing time (fast)
    float la    = (a - aSeq) / JET;                  // local jet progress for this arch
    float started = step(aSeq, a);
    float d     = la - aSweep;                       // >0 once the jet head passed this particle
    float emerge= smoothstep(0.0, 0.10, d) * started;
    float fade  = 1.0 - smoothstep(0.80, 1.0, a);    // whole flare cools at the very end
    float flash = exp(-pow(max(d,0.0)/0.05, 2.0)) * step(0.0,d) * started * inWin * fade;

    float grow  = emerge * (1.0 + 0.08*smoothstep(0.5,1.0,a));   // seed -> final
    vec3 wp     = mix(aSeedPos, position, clamp(grow, 0.0, 1.06));

    float flick = 0.85 + 0.15*sin(uTime*3.0 + aSeed*6.2831);
    vB   = aBright*flick*emerge*fade*inWin + 1.7*flash;
    vHot = flash;

    vec4 mv = modelViewMatrix*vec4(wp,1.0);
    gl_PointSize = aSize*uPix*(uPS/-mv.z) * (0.5 + 0.5*emerge + 0.9*flash);
    gl_Position = projectionMatrix*mv;
  }`;
const sunLoopFrag = /* glsl */ `
  varying vec3 vCol; varying float vB; varying float vHot;
  // uFade ∈ [0,1]: dims the loops/prominences toward the (quiet) red giant.
  uniform float uFade;
  void main(){
    float d = length(gl_PointCoord-0.5);
    float a = smoothstep(0.5,0.0,d);
    a = pow(a,1.25);              // soft core -> overlapping points form a line
    vec3 col = mix(vCol, vec3(1.0,0.96,0.86), clamp(vHot,0.0,0.85));  // white-hot leading edge
    gl_FragColor = vec4(col*a*vB*1.3*uFade, a*uFade);
  }`;

// Handles the render loop needs to drive + tear down the sun rig.
interface SunRig {
  group: THREE.Group;
  surfaceMat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
  coronaMat: THREE.ShaderMaterial;
  loopMat: THREE.ShaderMaterial;
  starMat: THREE.ShaderMaterial;
  corona: THREE.Mesh;
  dispose: () => void;
}

// Build the standalone-Sun rig (photosphere mesh + inner glow + corona billboard
// + animated loops/prominences Points), all centred at the world origin and
// scaled to `R` world units. Added to `scene` hidden; the render loop reveals it
// only during the yellow stage and advances its uTime uniforms. `pixelRatio`
// feeds the loop Points' size, matching the reference's gl_PointSize math.
function buildSunRig(scene: THREE.Scene, R: number, pixelRatio: number): SunRig {
  const group = new THREE.Group();
  group.visible = false;

  // --- (A) photosphere mesh ---
  // uRed (0 yellow → 1 red giant) reddens + dims the surface for the inflation.
  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRed: { value: 0 } },
    vertexShader: sunSurfaceVert,
    fragmentShader: sunSurfaceFrag,
  });
  const surface = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 24), surfaceMat);
  group.add(surface);

  // --- (B) inner chromosphere glow (BackSide additive) ---
  // uColor is driven per frame (gold → dim red) so the glow cools with the star.
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.55, 0.16) } },
    vertexShader: sunGlowVert,
    fragmentShader: sunGlowFrag,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 1.08, 16), glowMat);
  group.add(glow);

  // --- (C) soft corona haze (camera-facing billboard) ---
  // uDiskFrac is the disc radius as a fraction of the billboard half-size; it is
  // updated per frame as the rig scales so the halo hugs the growing photosphere.
  const coronaHalf = R * 4.0;
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDiskFrac: { value: R / coronaHalf }, uRed: { value: 0 } },
    vertexShader: sunCoronaVert,
    fragmentShader: sunCoronaFrag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(coronaHalf * 2.0, coronaHalf * 2.0), coronaMat);
  group.add(corona);

  // --- (D) coronal loops + footpoints + prominences (CPU build, ported) ---
  // small CPU vec helpers (reference's, verbatim)
  type V3 = [number, number, number];
  const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vscale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
  const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vlen = (a: V3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const vnorm = (a: V3): V3 => {
    const l = vlen(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const vcross = (a: V3, b: V3): V3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const rotAround = (v: V3, axis: V3, ang: number): V3 => {
    const c = Math.cos(ang),
      s = Math.sin(ang),
      d = vdot(axis, v),
      cr = vcross(axis, v);
    return [
      v[0] * c + cr[0] * s + axis[0] * d * (1 - c),
      v[1] * c + cr[1] * s + axis[1] * d * (1 - c),
      v[2] * c + cr[2] * s + axis[2] * d * (1 - c),
    ];
  };
  const frameBasis = (c: V3): [V3, V3] => {
    const up: V3 = Math.abs(c[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const t1 = vnorm(vcross(up, c));
    const t2 = vcross(c, t1);
    return [t1, t2];
  };
  const randn = (): number => {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const cl01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

  const POS: number[] = [],
    COL: number[] = [],
    SZ: number[] = [],
    SEED: number[] = [],
    UU: number[] = [],
    BR: number[] = [],
    SEEDPOS: number[] = [],
    LOFF: number[] = [],
    LPER: number[] = [],
    LON: number[] = [],
    SWP: number[] = [],
    SEQ: number[] = [];
  const CUR = { off: 0.0, per: 10.0, on: 0.45, dir: 0, seq: 0.0 };
  const push = (p: V3, c: V3, s: number, u: number, b: number): void => {
    POS.push(p[0], p[1], p[2]);
    const L = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) || 1; // on-surface seed
    SEEDPOS.push((p[0] / L) * R * 1.006, (p[1] / L) * R * 1.006, (p[2] / L) * R * 1.006);
    COL.push(c[0], c[1], c[2]);
    SZ.push(s);
    SEED.push(Math.random() * 6.2831);
    UU.push(u);
    BR.push(b);
    SWP.push(CUR.dir ? 1.0 - u : u);
    SEQ.push(CUR.seq);
    LOFF.push(CUR.off);
    LPER.push(CUR.per);
    LON.push(CUR.on);
  };

  // camera-facing tangent frame at an active region -> loops arc toward the camera
  const arFrame = (c: V3): [V3, V3] => {
    const h: V3 = [1, 0, 0];
    let span = vnorm(vsub(h, vscale(c, vdot(h, c))));
    if (vlen(span) < 0.2) span = vnorm(vsub([0, 0, 1], vscale(c, vdot([0, 0, 1], c))));
    const depth = vnorm(vcross(c, span));
    return [span, depth];
  };

  interface Arcade {
    c: V3;
    sep: number;
    nArch: number;
    kBase: number;
    archLean: number;
    fan: number;
    spanAz: number;
  }
  const buildLoops = (ar: Arcade): void => {
    const c = ar.c;
    const fr0 = arFrame(c);
    const span = rotAround(fr0[0], c, ar.spanAz || 0);
    const depth = vnorm(vcross(c, span));
    const A0 = rotAround(c, depth, -ar.sep);
    const B0 = rotAround(c, depth, ar.sep);
    const kMin = ar.kBase * 0.42,
      kMax = ar.kBase * 1.62;
    const chainSpan = 0.4;

    for (let L = 0; L < ar.nArch; L++) {
      const t = ar.nArch > 1 ? L / (ar.nArch - 1) : 0.5;
      CUR.seq = t * chainSpan;
      const k = kMin + t * (kMax - kMin) + (Math.random() - 0.5) * 0.035;
      const kN = (k - kMin) / (kMax - kMin + 1e-6);
      const lean = (0.1 + 0.9 * kN) * ar.archLean + randn() * ar.fan;
      const np = 110 + Math.floor(k * 430);
      const thick = R * (0.0014 + Math.random() * 0.0026);
      for (let j = 0; j < np; j++) {
        let u = (j + (Math.random() - 0.5) * 0.16) / (np - 1);
        u = cl01(u);
        const hp = Math.sin(Math.PI * u);
        const ang = (u - 0.5) * 2.0 * ar.sep;
        let base = rotAround(c, depth, ang);
        base = rotAround(base, c, lean * hp);
        const rad = R * (1.0 + k * hp);
        let P = vscale(base, rad);
        const tw = thick * (0.25 + 0.75 * hp);
        P = vadd(P, vscale(depth, randn() * tw));
        P = vadd(P, vscale(base, randn() * tw * 0.4));
        const foot = Math.pow(1.0 - hp, 1.7);
        const col: V3 = [1.0, Math.min(1.0, 0.64 + foot * 0.3), Math.min(1.0, 0.18 + foot * 0.52)];
        const bright = Math.max(0.16, (0.5 + 0.55 * foot) * (1.0 - 0.4 * kN) + 0.1 * Math.random());
        const size = Math.max(0.1, 0.15 + Math.random() * 0.15 + foot * 0.16);
        push(P, col, size, u, bright);
      }
    }
    // compact bright footpoint knots + tiny rooted threads
    CUR.seq = 0.0;
    let fi = 0;
    for (const F of [A0, B0]) {
      const uFoot = fi === 0 ? 0.015 : 0.985;
      fi++;
      const ff = frameBasis(F);
      for (let n = 0; n < 70; n++) {
        const sc = 0.026 + Math.random() * 0.018;
        const dir = vnorm(vadd(F, vadd(vscale(ff[0], randn() * sc), vscale(ff[1], randn() * sc))));
        const lift = R * (1.0 + Math.random() * 0.045);
        const P = vscale(dir, lift);
        const bigp = Math.random() < 0.12;
        const col: V3 = bigp ? [1.0, 0.94, 0.78] : [1.0, 0.85, 0.55];
        const size = bigp ? 0.7 + Math.random() * 0.8 : 0.26 + Math.random() * 0.38;
        const bright = bigp ? 1.5 + Math.random() * 0.6 : 0.9 + Math.random() * 0.55;
        push(P, col, size, uFoot + (Math.random() - 0.5) * 0.02, bright);
      }
      // short upward spray threads from the foot
      for (let s2 = 0; s2 < 5; s2++) {
        const tang = vnorm(vadd(vscale(ff[0], randn()), vscale(ff[1], randn())));
        const len = R * (0.06 + Math.random() * 0.14),
          npf = 28;
        for (let j = 0; j < npf; j++) {
          const s = j / (npf - 1);
          const dir = vnorm(vadd(F, vscale(tang, s * 0.1)));
          const P = vscale(dir, R * (1.0 + (len / R) * Math.sin(s * 1.4)));
          const fo = Math.pow(1.0 - s, 1.4);
          push(
            P,
            [1.0, 0.78, 0.42],
            0.16 + fo * 0.16,
            uFoot + (Math.random() - 0.5) * 0.02,
            (0.7 + 0.5 * fo) * (0.7 + 0.5 * Math.random()),
          );
        }
      }
    }
  };

  // feathery red->orange erupting prominence (dense flame with glowing root)
  const buildProminence = (c: V3, scale: number): void => {
    scale = scale || 1.0;
    CUR.seq = 0.0;
    const fr = frameBasis(c);
    const lean = vnorm(vadd(vscale(fr[0], 0.35), vscale(fr[1], 0.15)));
    const root = Math.round(90 * scale);
    for (let n = 0; n < root; n++) {
      const sc = 0.045 * scale;
      const dir = vnorm(vadd(c, vadd(vscale(fr[0], randn() * sc), vscale(fr[1], randn() * sc))));
      const rad = R * (1.0 + Math.random() * 0.1 * scale);
      const s = (rad / R - 1.0) / (0.1 * scale + 1e-6);
      const col: V3 = [1.0, 0.08 + s * 0.1, 0.01 + s * 0.02];
      push(vscale(dir, rad), col, 0.5 + Math.random() * 0.5, Math.random(), 0.6 + Math.random() * 0.3);
    }
    const nFil = Math.round(30 * scale);
    for (let f = 0; f < nFil; f++) {
      const dir0 = vnorm(vadd(c, vadd(vscale(fr[0], randn() * 0.018), vscale(fr[1], randn() * 0.018))));
      const height = R * (0.18 + Math.random() * 0.18) * scale;
      const wAmp = R * (0.01 + Math.random() * 0.026);
      const wFreq = 3.0 + Math.random() * 3.5;
      const phase = Math.random() * 6.28;
      const latDir = vnorm(vadd(vscale(fr[0], Math.cos(phase)), vscale(fr[1], Math.sin(phase))));
      const npf = 100 + Math.floor(Math.random() * 40);
      for (let j = 0; j < npf; j++) {
        const s = j / (npf - 1);
        const rad = R + height * s;
        const lat = wAmp * Math.sin(s * wFreq * Math.PI + phase) * Math.pow(s, 0.7);
        const curl = R * 0.055 * scale * Math.pow(s, 1.4);
        const fray = Math.pow(s, 2.0) * R * 0.024 * randn();
        let P = vadd(vscale(dir0, rad), vscale(latDir, lat));
        P = vadd(P, vscale(lean, curl));
        P = vadd(P, vadd(vscale(fr[0], randn() * fray), vscale(fr[1], randn() * fray)));
        const col: V3 = [1.0, 0.06 + s * 0.2, 0.004 + s * 0.025];
        const bright = (0.85 - s * 0.35) * (0.85 + 0.4 * Math.random());
        const size = 0.46 + Math.random() * 0.34 + (1.0 - s) * 0.55;
        push(P, col, size, s, bright);
      }
    }
  };

  const randDir = (): V3 => {
    const z = 2 * Math.random() - 1,
      ph = Math.random() * Math.PI * 2,
      r = Math.sqrt(Math.max(0, 1 - z * z));
    return [r * Math.cos(ph), z, r * Math.sin(ph)];
  };
  const setLife = (): void => {
    CUR.off = Math.random();
    CUR.per = 7.0 + Math.random() * 9.0;
    CUR.on = 0.4 + Math.random() * 0.16;
    CUR.dir = Math.random() < 0.5 ? 0 : 1;
  };

  // More PROMINENT flares for the yellow star: more loop arcades, more of them
  // "big", and noticeably more (and taller) erupting prominences than the ported
  // reference — so the active yellow sun reads as energetic, not calm.
  const NA = 22; // loop arcades (was 16)
  for (let i = 0; i < NA; i++) {
    setLife();
    const big = i < 7; // more big arcades (was 4)
    buildLoops({
      c: randDir(),
      sep: 0.13 + Math.random() * (big ? 0.19 : 0.12),
      nArch: big ? 14 + Math.floor(Math.random() * 8) : 6 + Math.floor(Math.random() * 6),
      kBase: (big ? 0.4 : 0.22) + Math.random() * 0.18, // arch higher off the limb
      archLean: (Math.random() * 2 - 1) * (big ? 0.7 : 0.5),
      fan: 0.07 + Math.random() * 0.06,
      spanAz: Math.random() * Math.PI * 2,
    });
  }
  const NP = 15; // erupting prominences / jets (was 9)
  for (let i = 0; i < NP; i++) {
    setLife();
    CUR.dir = 0; // prominences always spray base -> tip
    buildProminence(randDir(), 0.7 + Math.random() * 0.8); // taller/denser (was 0.5+0.7)
  }

  const loopGeo = new THREE.BufferGeometry();
  loopGeo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(POS), 3));
  loopGeo.setAttribute('aColor', new THREE.BufferAttribute(Float32Array.from(COL), 3));
  loopGeo.setAttribute('aSize', new THREE.BufferAttribute(Float32Array.from(SZ), 1));
  loopGeo.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from(SEED), 1));
  loopGeo.setAttribute('aU', new THREE.BufferAttribute(Float32Array.from(UU), 1));
  loopGeo.setAttribute('aBright', new THREE.BufferAttribute(Float32Array.from(BR), 1));
  loopGeo.setAttribute('aSeedPos', new THREE.BufferAttribute(Float32Array.from(SEEDPOS), 3));
  loopGeo.setAttribute('aLifeOff', new THREE.BufferAttribute(Float32Array.from(LOFF), 1));
  loopGeo.setAttribute('aLifePer', new THREE.BufferAttribute(Float32Array.from(LPER), 1));
  loopGeo.setAttribute('aOn', new THREE.BufferAttribute(Float32Array.from(LON), 1));
  loopGeo.setAttribute('aSweep', new THREE.BufferAttribute(Float32Array.from(SWP), 1));
  loopGeo.setAttribute('aSeq', new THREE.BufferAttribute(Float32Array.from(SEQ), 1));
  // large bound so the loops/prominences are never frustum-culled
  loopGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R * 8);

  const loopMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPix: { value: pixelRatio }, uPS: { value: 70.0 }, uFade: { value: 1 } },
    vertexShader: sunLoopVert,
    fragmentShader: sunLoopFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const loops = new THREE.Points(loopGeo, loopMat);
  loops.frustumCulled = false;
  group.add(loops);

  // --- (E) dedicated star backdrop ---------------------------------------
  // A far, dense dome of twinkling stars sitting BEHIND the opaque photosphere.
  // It's a child of the rig group (R-independent radius), so the sun naturally
  // occludes the stars it covers (real depth test) while the rest fill the empty
  // black space around it. Distributed on a thick spherical shell so parallax
  // from the slow camera drift gives the field a touch of depth.
  const STAR_BACK_N = 4200;
  const STAR_BACK_R = R * 165; // ~640 world units: far behind the sun, well inside the camera far plane
  const sbPos = new Float32Array(STAR_BACK_N * 3);
  const sbSeed = new Float32Array(STAR_BACK_N);
  const sbMag = new Float32Array(STAR_BACK_N);
  for (let i = 0; i < STAR_BACK_N; i++) {
    const rad = STAR_BACK_R * (0.85 + Math.random() * 0.3); // thick shell for parallax
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    sbPos[i * 3 + 0] = rad * s * Math.cos(th);
    sbPos[i * 3 + 1] = rad * u;
    sbPos[i * 3 + 2] = rad * s * Math.sin(th);
    sbSeed[i] = Math.random();
    // magnitude skewed dim (square) so bright/large stars are rarer standouts
    // while the bulk still reads as a fine, populated field
    sbMag[i] = Math.pow(Math.random(), 2);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sbPos, 3));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sbSeed, 1));
  starGeo.setAttribute('aMag', new THREE.BufferAttribute(sbMag, 1));
  starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), STAR_BACK_R * 1.3);
  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: 1.0 }, // faded in/out by the render loop at the stage edges
      uBright: { value: 2.2 }, // overall scale so points survive the post grade
    },
    vertexShader: sunStarVert,
    fragmentShader: sunStarFrag,
    transparent: true,
    depthWrite: false, // additive points: don't occlude each other...
    depthTest: true, // ...but DO get occluded by the opaque photosphere
    blending: THREE.AdditiveBlending,
  });
  const starBack = new THREE.Points(starGeo, starMat);
  starBack.frustumCulled = false;
  group.add(starBack);

  scene.add(group);

  const dispose = (): void => {
    scene.remove(group);
    surface.geometry.dispose();
    glow.geometry.dispose();
    corona.geometry.dispose();
    loopGeo.dispose();
    starGeo.dispose();
    surfaceMat.dispose();
    glowMat.dispose();
    coronaMat.dispose();
    loopMat.dispose();
    starMat.dispose();
  };

  return { group, surfaceMat, glowMat, coronaMat, loopMat, starMat, corona, dispose };
}

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

// ---------------------------------------------------------------------------
//  DEV-ONLY tuning panel. Lets the two disk light-layers (primary bright
//  crescent + secondary lower band) plus the photon ring + interior blackout
//  sphere be tuned live: per-layer density, secondary scale/offset (seam),
//  radial spread, thickness, ring size, blackout-sphere size. Live tuning only —
//  read the values off the panel and bake the ones you like into CFG, then
//  delete this builder + its call + the dbgCtl block + the writes that read it.
// ---------------------------------------------------------------------------
interface DiskTuneState {
  densityPrimary: number;
  densitySecondary: number;
  sec: number;
  secOffsetX: number;
  secOffsetY: number;
  distrib: number;
  thick: number;
  ringScale: number;
  holeScale: number;
}

interface SliderSpec {
  key: keyof DiskTuneState;
  label: string;
  min: number;
  max: number;
  step: number;
}

function buildDebugPanel(state: DiskTuneState): () => void {
  const sliders: readonly SliderSpec[] = [
    { key: 'densityPrimary', label: 'density · crescent', min: 0, max: 3, step: 0.01 },
    { key: 'densitySecondary', label: 'density · lower band', min: 0, max: 3, step: 0.01 },
    { key: 'sec', label: 'secondary scale', min: 0.3, max: 1.6, step: 0.005 },
    { key: 'secOffsetX', label: 'secondary X', min: -0.6, max: 0.6, step: 0.002 },
    { key: 'secOffsetY', label: 'secondary Y (seam)', min: -0.6, max: 0.6, step: 0.002 },
    { key: 'distrib', label: 'radial spread', min: 0.3, max: 2.5, step: 0.01 },
    { key: 'thick', label: 'thickness', min: 0, max: 0.8, step: 0.005 },
    { key: 'ringScale', label: 'ring size', min: 0.3, max: 3, step: 0.01 },
    { key: 'holeScale', label: 'blackout sphere size', min: 0.3, max: 3, step: 0.01 },
  ];

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'z-index:99999',
    'width:240px',
    'padding:12px 14px',
    'background:rgba(8,10,8,0.82)',
    'backdrop-filter:blur(6px)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:10px',
    'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#cfe0c0',
    'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'disk layers · dev';
  title.style.cssText = 'font-weight:600;letter-spacing:0.04em;margin-bottom:10px;opacity:0.7;text-transform:uppercase';
  panel.appendChild(title);

  for (const spec of sliders) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:8px 0';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const val = document.createElement('span');
    val.style.cssText = 'opacity:0.85;font-variant-numeric:tabular-nums';
    val.textContent = state[spec.key].toFixed(3);
    head.appendChild(name);
    head.appendChild(val);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(state[spec.key]);
    input.style.cssText = 'width:100%;accent-color:#b9d089;cursor:ew-resize';
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      state[spec.key] = v;
      val.textContent = v.toFixed(3);
    });

    row.appendChild(head);
    row.appendChild(input);
    panel.appendChild(row);
  }

  const dump = document.createElement('button');
  dump.textContent = 'log values';
  dump.style.cssText = [
    'margin-top:10px',
    'width:100%',
    'padding:6px',
    'background:rgba(185,208,137,0.16)',
    'border:1px solid rgba(185,208,137,0.35)',
    'border-radius:6px',
    'color:#dcecca',
    'font:inherit',
    'cursor:pointer',
  ].join(';');
  dump.addEventListener('click', () => {
    // eslint-disable-next-line no-console
    console.log('[disk tune]', JSON.stringify(state, null, 2));
  });
  panel.appendChild(dump);

  document.body.appendChild(panel);
  return () => {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
  };
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
    uSecOffsetX: { value: 0 }, // dev: nudge secondary band L/R (NDC-aspect units)
    uSecOffsetY: { value: 0 }, // dev: nudge secondary band up/down to close the seam
    uHole: { value: 0.12 },
    uVertAsym: { value: CFG.vertAsym },
    uHorizAsym: { value: CFG.horizAsym },
    uDistrib: { value: CFG.diskDistrib },
    uBright: { value: 1.25 }, // disk brightness multiplier (brightened)
    uMorph: { value: 0 }, // transition 1: reverse supernova (scroll-driven)
    uFlash: { value: 0 }, // central burst envelope (peaks mid-morph)
    uCollapse: { value: 0 }, // red-giant surface collapse (0 sphere → 1 point)
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
    uRingScale: { value: 1.0 }, // dev: ring radius × (relative to dark-core rim)
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

  // --- yellow-star sun rig (revealed only during the yellow stage) ---
  // Sized to be exactly 30% SMALLER than the red giant (the spec for the
  // red giant → yellow star transition). The red giant is the point cloud at
  // uGiantR (4.2) × its sunRadFac (1.45) = 6.09 world units, so the yellow star
  // lands at 6.09 × 0.70 = 4.263 — a clearly tighter orb than the bloated giant.
  const RED_GIANT_RADIUS = 4.2 * 1.45; // point-cloud red giant world radius
  const SUN_RIG_RADIUS = RED_GIANT_RADIUS * 0.7; // yellow star: 30% smaller
  const sunRig = buildSunRig(scene, SUN_RIG_RADIUS, renderer.getPixelRatio());

  // --- lens uniforms (recomputed each frame from camera geometry) ---
  function updateLensUniforms(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const D = camera.position.distanceTo(lookTarget);
    const shadowAng = CFG.coreSize / D;
    const ndcShadow = shadowAng / Math.tan(fovY / 2);
    const thetaE = ndcShadow * CFG.lens;
    // dev: holeScale resizes the interior blackout sphere (the dark shadow disc).
    // The disk carve, the star/warp inner cutoff and the ring radius all key off
    // uHole, so this scales the whole void consistently.
    const holeR = ndcShadow * CFG.holeFactor * dbgCtl.holeScale;
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

  // --- DEV tuning panel state (delete the panel + this block when done) -------
  // Live overrides. Density values MULTIPLY the per-layer base brightness (so the
  // frame's auto-exposure logic is preserved); the rest are written to uniforms.
  // holeScale resizes the interior blackout sphere; ringScale resizes the photon
  // ring. Seeded from CFG so the panel opens on the current look.
  const dbgCtl = {
    densityPrimary: 1.0, // bright crescent (primary lensed image) brightness ×
    densitySecondary: 1.0, // lower grainy band (secondary image) brightness ×
    sec: CFG.secScale, // secondary image scale (uSec)
    secOffsetX: 0.0, // secondary band L/R nudge (NDC-aspect)
    secOffsetY: 0.0, // secondary band up/down nudge — closes the seam
    distrib: CFG.diskDistrib, // radial spread (uDistrib): <1 outer, >1 inner
    thick: CFG.diskThickness, // vertical thickness (uThick)
    ringScale: 1.0, // photon-ring radius × (relative to the dark-core rim)
    holeScale: 1.0, // interior blackout-sphere (shadow disc) radius ×
  };

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
    // --- the unified surface collapse ---------------------------------------
    // The red-giant SURFACE collapse is one continuous beat: the textured sphere
    // shrinks non-homogeneously and its laggard regions stream off as the finger-
    // spikes (the "explosion" is the surface caving in, not a separate blast). It
    // runs across stage 1.05 (full red giant) → 0.5 (the surface reaches the point,
    // where the legacy supernova FLASH fires and the seed/black-hole machinery
    // below takes over). kCollapse drives the shader's per-region shrink.
    const COLLAPSE_HI = 1.05; // stage where the surface is still the full sphere
    const COLLAPSE_LO = 0.5;  // stage where the surface has shrunk to the point
    const kCollapse = Math.min(1, Math.max(0, (COLLAPSE_HI - stage) / (COLLAPSE_HI - COLLAPSE_LO)));
    // `giant` now means "the sphere-identity model is active" — it must be 1 across
    // the ENTIRE collapse window so the unified surface block owns the geometry (no
    // co-existing radial blast → no two-scale artifact). It rises as we leave the
    // black-hole side (stage 0.5 → 1.05) and stays 1 for the red giant and above.
    const giant = Math.min(1, Math.max(0, (stage - COLLAPSE_LO) / (COLLAPSE_HI - COLLAPSE_LO)));

    // --- transition 1: reverse supernova ---
    diskMatPrimary.uniforms.uMorph.value = morph;
    diskMatSecondary.uniforms.uMorph.value = morph;
    ringMat.uniforms.uMorph.value = morph;
    ringMat.uniforms.uRingScale.value = dbgCtl.ringScale; // dev: live ring size
    // flash envelope: a sharp, BRIGHT shock-breakout burst centred on the
    // compression peak (the one blinding beat of the explosion) — loud, but
    // ASYMMETRIC: a quick rise (σ 0.055) and a FASTER decay (σ 0.04) so the glow
    // clears soon after the peak and the dispersing debris rays get a clean dark
    // beat to read against before the gather, instead of staying washed out.
    const flashSigma = morph <= 0.5 ? 0.055 : 0.04;
    const flash = 1.45 * Math.exp(-Math.pow((morph - 0.5) / flashSigma, 2.0));
    diskMatPrimary.uniforms.uFlash.value = flash;
    diskMatSecondary.uniforms.uFlash.value = flash;
    // surface-collapse progress (0 full red-giant sphere → 1 collapsed to the point)
    diskMatPrimary.uniforms.uCollapse.value = kCollapse;
    diskMatSecondary.uniforms.uCollapse.value = kCollapse;

    // --- transitions 3-5: yellow star → nebula → pale blue dot ---
    // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
    // slot snaps to that state's stand-in at the stage midpoint so its look + slot
    // can be reviewed in isolation. Replace this block (and the matching shader
    // placeholders, marked "REVIEW PLACEHOLDER") with the real morphs later; the
    // timeline placement stays the same.
    //   yellow star  : active across stage 2→3  (snap at 2.5)
    //   nebula       : active across stage 3→4  (snap at 3.5)
    //   pale blue dot: active across stage 4→5  (snap at 4.5)
    const yellow = stage >= 2.5 ? 1 : 0;
    const nebula = stage >= 3.5 ? 1 : 0;
    const dot = stage >= 4.5 ? 1 : 0;
    // Once a later state is active the sphere is held (uGiant pinned to 1) so the
    // placeholder branch has a sphere to reshape; only the latest-reached state shows.
    const laterActive = yellow || nebula || dot;
    const giantHeld = laterActive ? 1 : giant;

    // --- transition 2: red giant (held at 1 once a later placeholder takes over) ---
    diskMatPrimary.uniforms.uGiant.value = giantHeld;
    diskMatSecondary.uniforms.uGiant.value = giantHeld;
    // The POINT CLOUD is always the RED GIANT (its grainy body), never the yellow
    // star — the yellow star is the mesh sun rig. So the cloud's uYellow stays 0;
    // the yellow JS flag below still gates the timeline (laterActive / grade).
    diskMatPrimary.uniforms.uYellow.value = 0;
    diskMatSecondary.uniforms.uYellow.value = 0;
    diskMatPrimary.uniforms.uNebula.value = nebula;
    diskMatSecondary.uniforms.uNebula.value = nebula;
    diskMatPrimary.uniforms.uDot.value = dot;
    diskMatSecondary.uniforms.uDot.value = dot;

    // --- yellow star ⇄ red giant: GROW / COOL / GROW-PARTICLES transition -----
    // Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR
    // (stage 3, mesh sun rig — tight, gold, bright) INFLATES into the RED GIANT
    // (stage 2, point cloud — big, deep red, dim, grainy). Scrolling up plays it
    // forward; scrolling down plays the reverse. There is no shrink-and-pop.
    //
    // The mesh rig carries the whole inflation: it GROWS toward the red-giant
    // radius and COOLS (reddens + dims) via uRed. The grainy red-giant point
    // cloud is ramped IN on top of the growing surface (uBright 0→full) so the
    // star gains its particle texture as it bloats; the mesh then fades behind
    // the now-complete particle giant. "Light leads size": the cool/redden curve
    // runs slightly AHEAD of the grow curve, so it cools then bloats.
    //
    // redAmt: 0 at the settled yellow star (stage ≥2.9) → 1 at the settled red
    // giant (stage ≤2.1). redColor leads redScale by ~0.08 stage (cool-then-grow).
    const redAmt   = smoothstep01((2.9 - stage) / 0.8);              // overall progress
    const redColor = smoothstep01((2.98 - stage) / 0.8);            // dim/redden — LEADS
    const redScale = smoothstep01((2.82 - stage) / 0.8);           // inflate — TRAILS
    const inYRWindow = stage > 2.02 && stage < 3.2 && !nebula;      // the yellow⇄red slot

    // mesh grows from yellow radius → red-giant radius (SUN_RIG_RADIUS×(1/0.7))
    const meshGrow = 1 + (RED_GIANT_RADIUS / SUN_RIG_RADIUS - 1) * redScale;
    sunRig.group.scale.setScalar(meshGrow);
    // cool the mesh: redden + dim surface/corona, fade the (quiet-giant) flares,
    // and cool the inner glow from gold → dim red.
    sunRig.surfaceMat.uniforms.uRed.value = redColor;
    sunRig.coronaMat.uniforms.uRed.value = redColor;
    sunRig.loopMat.uniforms.uFade.value = 1 - smoothstep01(redColor / 0.85); // flares gone by ~0.85
    (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(
      1.0 - 0.6 * redColor, 0.55 - 0.4 * redColor, 0.16 - 0.13 * redColor,
    );
    // corona halo hugs the growing disc (uDiskFrac = discR / coronaHalf, and the
    // group scale grows both, so the ratio is constant — but keep it explicit).
    // Mesh visible across the slot; it fades out at the red end as the particle
    // giant takes over (redAmt 0.82→0.98), and is hidden entirely at the red giant.
    const meshFade = 1 - smoothstep01((redAmt - 0.82) / 0.16);
    sunRig.group.visible = inYRWindow && meshFade > 0.001;
    sunRig.starMat.uniforms.uOpacity.value = (1 - redAmt); // backdrop fades as giant fills in

    // Ramp the grainy point-cloud red giant IN on the growing surface: invisible
    // at the yellow star, brightening from redAmt 0.25 → 1 so the particle texture
    // accrues as the body bloats. The cloud renders the red-giant sphere (uYellow
    // is 0 here, uGiant pinned to 1), so it lands exactly co-located with the mesh.
    const particleIn = smoothstep01((redAmt - 0.25) / 0.75);
    const cloudShown = inYRWindow ? particleIn > 0.001 : !nebula; // outside slot keep prior behaviour
    diskPrimary.visible = cloudShown;
    diskSecondary.visible = cloudShown;
    // Hide the lensed background starfield while the opaque mesh body is present
    // (it would bleed through); restore it as the mesh fades to the particle giant.
    starPts.visible = inYRWindow ? meshFade < 0.5 : true;

    // sunWindow drives the bright-gold grade below; keep it on across the yellow
    // half of the slot (mesh still dominant) and hand to the red-giant grade as
    // the cloud takes over. Aligns the grade switch with the geometry handoff.
    const sunWindow = inYRWindow && redAmt < 0.55;

    // the star/warp lensing only makes sense while the hole exists — fade it.
    // Once the SUN forms we drop the gravitational-warp background entirely and
    // restore the plain starfield to full brightness behind the star.
    const lensLive = 1 - Math.min(1, Math.max(0, (morph - 0.1) / 0.4));
    starMat.uniforms.uStarBright.value =
      CFG.starBright * (0.4 + 0.6 * lensLive) * (1 - 0.45 * giantHeld) + CFG.starBright * 0.45 * giantHeld;
    // Completely remove ALL gravity once the star forms: the warp arcs, the
    // secondary (lensed) disk image, and the photon ring are switched off — a
    // star has no event horizon bending light around it. The plain (un-lensed)
    // starfield behind it is restored via uStarBright above. Below ~giant 0.02
    // these are gone entirely.
    const gravityGone = giantHeld > 0.02;
    warpSeg.visible = !gravityGone;
    warpSeg2.visible = !gravityGone;
    diskSecondary.visible = !gravityGone;   // no lensed disk ghost behind the star
    ringPts.visible = !gravityGone;          // no photon ring around the star
    starSecPts.visible = false;              // secondary lensed star image stays off
    // Tame the bloom as the remnant inflates; let the flash punch it briefly. The
    // red giant is meant to be DIM, so pull bloom right down once it forms.
    const flareAmt = Math.min(1, Math.max(0, (morph - 0.46) / 0.54));
    // SEED window (matches the shader's dark-core dip): the collapsed matter must
    // read as a small DARK point, not a bloomed glow. Narrow + EARLY (centred 0.45)
    // so it releases by the breakout (0.50) and never dims the loud flash.
    const seedZone = Math.exp(-Math.pow((morph - 0.45) / 0.035, 2.0));
    // brief bloom spike at the breakout — the loudest visual beat — but suppressed
    // inside the seed window so it doesn't re-inflate the dark seed into a glow.
    bloom.strength = CFG.bloomStr * (1 - 0.7 * flareAmt) + flash * 0.55 * (1 - 0.9 * seedZone);
    bloom.strength = bloom.strength * (1 - 0.6 * giantHeld) + 0.12 * giantHeld;
    bloom.strength *= 1 - 0.9 * seedZone; // kill bloom hard at the dark seed
    // The imploded core packs the whole disk into a small, dense, additively-
    // blended region — brightness there is enormous. Cut the disk's base emission
    // hard across the compression window so it never clips to an edge-to-edge
    // whiteout; the flash term is the one bright beat we DO want, narrow.
    const hotZone = Math.exp(-Math.pow((morph - 0.5) / 0.15, 2.0));
    // In the yellow⇄red slot, the grainy point-cloud red giant is RAMPED IN on the
    // growing mesh surface (particleIn 0→1), so its emission fades up as the body
    // bloats — the "add particles on the surface" read. Outside the slot, full base.
    const cloudGain = inYRWindow ? particleIn : 1;
    const baseBright = 1.25 * (1 - 0.92 * hotZone) * cloudGain;
    diskMatPrimary.uniforms.uBright.value = baseBright * dbgCtl.densityPrimary;
    diskMatSecondary.uniforms.uBright.value = baseBright * dbgCtl.densitySecondary;
    // --- DEV: live layer geometry (delete with the panel) ---
    diskMatPrimary.uniforms.uSec.value = dbgCtl.sec;
    diskMatSecondary.uniforms.uSec.value = dbgCtl.sec;
    diskMatSecondary.uniforms.uSecOffsetX.value = dbgCtl.secOffsetX;
    diskMatSecondary.uniforms.uSecOffsetY.value = dbgCtl.secOffsetY;
    diskMatPrimary.uniforms.uDistrib.value = dbgCtl.distrib;
    diskMatSecondary.uniforms.uDistrib.value = dbgCtl.distrib;
    diskMatPrimary.uniforms.uThick.value = dbgCtl.thick;
    diskMatSecondary.uniforms.uThick.value = dbgCtl.thick;
    // Auto-exposure: pull down across the flash, dip at the seed (so the tiny
    // black-hole point reads dim and dense), and settle a touch lower for the
    // dim red giant so it reads warm and matte, not glaring. A VERY NARROW punch
    // (σ≈0.045 ≪ hotZone σ≈0.15) briefly over-exposes EXACTLY at the breakout and
    // recovers immediately → the supernova reads as a detonation, not a flat wash.
    // The punch is suppressed in the seed window so it never undoes the dark-core
    // dip — the breakout (morph 0.5, where seedZone has fallen off) keeps near-full
    // punch, so the detonation is intact while the seed stays a dark point.
    const flashPunch = Math.exp(-Math.pow((morph - 0.5) / 0.045, 2.0));
    gradePass.uniforms.uExposure.value =
      CFG.exposure * (1 - 0.58 * hotZone) * (1 - 0.18 * giantHeld) * (1 - 0.35 * seedZone)
      * (1 + 0.9 * flashPunch * (1 - 0.7 * seedZone));
    // Grade through the explosion: the blue-white→amber→red debris wants strong
    // warmth & saturation and the olive/green background tint pulled right back,
    // or the blast reads as a grey-green fog. exGrade is a sharp envelope over
    // the actual blast window (morph ~0.5–0.9), decaying as the giant takes over.
    const exGrade = Math.exp(-Math.pow((morph - 0.66) / 0.2, 2.0)) * (1 - giantHeld);
    gradePass.uniforms.uOlive.value = CFG.olive * (1 - 0.85 * giantHeld) * (1 - 0.92 * exGrade);
    gradePass.uniforms.uWarmth.value = CFG.warmth + 0.06 * giantHeld + 0.12 * exGrade;
    gradePass.uniforms.uSat.value = CFG.saturation + 0.5 * giantHeld + 0.7 * exGrade;
    // lift the disk's IN-SHADER saturation across the blast so the explosion ramp
    // colours (warm amber/red, hot blue-white) survive instead of being crushed
    // toward grey by the global desaturation.
    const exSat = CFG.saturation + 0.55 * exGrade + 0.5 * giantHeld;
    diskMatPrimary.uniforms.uSat.value = exSat;
    diskMatSecondary.uniforms.uSat.value = exSat;

    // --- sun grade: bold, saturated, un-washed. The yellow star reads as vivid
    // gold; the RED GIANT reads as a big, deep, matte red star. Both use the same
    // restrained bloom (a thin halo, not a frame-filling glow), no olive cast and
    // full saturation so the photosphere colour survives. The red giant is
    // crossfaded in over the gather so the explosion grade hands off cleanly.
    // redGiantPhase: giant formed, no later state yet.
    const redGiantPhase = giantHeld > 0.5 && !yellow && !nebula && !dot;
    if (sunWindow) {
      // The yellow star is the MESH sun rig (a bright, opaque, real photosphere),
      // not the dim particle placeholder. The reference renders it blazing gold
      // with a strong glowing limb halo, so push exposure + bloom UP (not down)
      // and keep the grade out of the way: no tone-map crush, no olive, no
      // desaturation — let the bright gold body and white-hot limb survive.
      bloom.strength = 0.7;         // bright limb/corona halo, but keep a crisp edge
      bloom.radius = 0.5;           // tighter so the solid sphere edge stays defined
      gradePass.uniforms.uExposure.value = 1.0;   // full exposure (reference ACES was 1.0)
      gradePass.uniforms.uOlive.value = 0.0;
      gradePass.uniforms.uWarmth.value = 0.0;
      gradePass.uniforms.uSat.value = 1.0;   // full saturation → vivid gold
    } else if (redGiantPhase) {
      // gg eases the red-giant grade in as the star finishes gathering (giant
      // 0→1), so the blast→giant handoff doesn't snap.
      const gg = Math.min(1, Math.max(0, (giant - 0.4) / 0.6));
      bloom.strength = bloom.strength * (1 - gg) + 0.22 * gg; // dim, contained halo
      bloom.radius = CFG.bloomRad;
      gradePass.uniforms.uExposure.value =
        gradePass.uniforms.uExposure.value * (1 - gg) + CFG.exposure * 0.7 * gg;
      gradePass.uniforms.uOlive.value *= 1 - gg;             // kill the olive cast
      gradePass.uniforms.uWarmth.value = gradePass.uniforms.uWarmth.value * (1 - gg) + 0.14 * gg;
      gradePass.uniforms.uSat.value = gradePass.uniforms.uSat.value * (1 - gg) + 1.0 * gg;
      const rSat = diskMatPrimary.uniforms.uSat.value * (1 - gg) + 1.0 * gg;
      diskMatPrimary.uniforms.uSat.value = rSat;
      diskMatSecondary.uniforms.uSat.value = rSat;
    } else if (nebula && !dot) {
      // nebula grade: a soft, luminous gas cloud. Wide bloom so the filament web
      // glows and the void dust hazes together; no olive cast (the teal/rust hues
      // must survive); full saturation so the Crab palette reads. Exposure a touch
      // up so the sprawling, low-density cloud isn't muddy. Eased in as the state
      // arrives (nebula snaps at 3.5) so the handoff from yellow isn't a hard pop.
      const ne = smoothstep01((stage - 3.5) / 0.35);
      // a CONTAINED glow: the reference is mostly dark space with bright filaments,
      // so keep bloom moderate (a soft halo on the strands, not a frame-filling
      // wash) and exposure near neutral so the teal/rust colour ramp survives
      // instead of clipping to cream.
      bloom.strength = bloom.strength * (1 - ne) + 0.45 * ne;  // soft strand glow
      bloom.radius = CFG.bloomRad * (1 - ne) + 0.7 * ne;       // wide soft halo
      gradePass.uniforms.uExposure.value =
        gradePass.uniforms.uExposure.value * (1 - ne) + 0.80 * ne;
      gradePass.uniforms.uOlive.value *= 1 - ne;               // no olive cast
      gradePass.uniforms.uWarmth.value *= 1 - ne;
      gradePass.uniforms.uSat.value = gradePass.uniforms.uSat.value * (1 - ne) + 1.15 * ne;
      const nSat = diskMatPrimary.uniforms.uSat.value * (1 - ne) + 1.0 * ne;
      diskMatPrimary.uniforms.uSat.value = nSat;
      diskMatSecondary.uniforms.uSat.value = nSat;
    } else {
      bloom.radius = CFG.bloomRad;
    }

    // dezoom progress (0 close → 1 rest). Reduced motion lands at the rest frame.
    const intro = reduced ? 1 : easeOut(Math.min(t / INTRO_DUR, 1));
    const distFactor = NEAR_FACTOR + (1 - NEAR_FACTOR) * intro;

    // --- lifecycle zoom choreography (the scale story) ---
    // A black hole is tiny-but-massive; a star is huge-but-diffuse. The scale
    // story is told by the CAMERA: sit CLOSE on the hero black hole so it fills
    // the frame and reads ENORMOUS, then rocket WAY BACK as the matter collapses
    // to its speck so the seed is a tiny point in a vast dark field, then ease
    // back to resting so the red giant lands at a middling on-screen size. The
    // size ranking reads BH(close) > red giant > seed(far). Reduced motion = 1.
    let zoom = 1.0;
    if (!reduced) {
      const ZOOM_HERO = 0.6; // close at the hero BH → dist≈12 (BH fills the frame)
      const ZOOM_SEED = 2.6; // far at the seed     → dist≈52 (speck in a vast field)
      const ZOOM_BLAST = 2.0; // pulled back across the blast → dist≈40 (big remnant fits)
      const ZOOM_OUT = 1.0; // resting at the red giant
      // hero push-in eases out as the implosion gets underway (stage 0 → 0.18)
      const heroT = smoothstep01(stage / 0.18);
      // seed pull-back, IN SYNC with the world-space seed collapse (0.18 → 0.46)
      const shrinkT = smoothstep01((stage - 0.18) / (0.46 - 0.18));
      // hold WAY back across the blast so the now-much-bigger ejecta (rays reach
      // past rOut) stays framed — ease from the seed distance to the blast hold as
      // the shell breaks out (0.46 → 0.62), then keep it wide through the blast.
      const blastT = smoothstep01((stage - 0.46) / (0.62 - 0.46));
      // grow back to resting only ABOVE the collapse window (stage 1.05 → 1.5), so
      // the camera stays pulled WAY back across the whole surface-collapse/spike
      // window (stage 0.5–1.05) — the finger-spikes reach ~10 units and would clip
      // the frame at the resting distance, so they need the blast hold to stay framed.
      const growT = easeOut(Math.min(Math.max((stage - 1.05) / 0.45, 0), 1));
      const heroZoom = ZOOM_HERO + (1.0 - ZOOM_HERO) * heroT; // 0.6 → 1.0
      const seedZoom = heroZoom + (ZOOM_SEED - heroZoom) * shrinkT; // → 2.6
      const blastZoom = seedZoom + (ZOOM_BLAST - seedZoom) * blastT; // 2.6 → 2.0
      zoom = blastZoom + (ZOOM_OUT - blastZoom) * growT; // → 1.0
      // nebula: pull WAY back so the sprawling remnant fills the frame as one big
      // object (user ask: "unzoomed a lot"). Ease out from resting as the nebula
      // arrives (stage 3.1 → 3.7), hold wide across the nebula, then pull back IN
      // toward the pale blue dot (stage 4.3 → 4.7) so the dot reads as a tiny point.
      const ZOOM_NEBULA = 2.7; // dist≈54 → frames a ~14-unit sprawling cloud
      const nebIn  = smoothstep01((stage - 3.1) / 0.6);
      const nebOut = smoothstep01((stage - 4.3) / 0.4);
      const nebT = nebIn * (1 - nebOut);
      zoom = zoom + (ZOOM_NEBULA - zoom) * nebT;
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

    // sun rig: animate the photosphere flow, corona streamers and loop jets only
    // while it is visible; keep the corona plane facing the camera (billboard).
    if (sunRig.group.visible) {
      sunRig.surfaceMat.uniforms.uTime.value = ut;
      sunRig.coronaMat.uniforms.uTime.value = ut;
      sunRig.loopMat.uniforms.uTime.value = ut;
      sunRig.starMat.uniforms.uTime.value = ut;
      sunRig.corona.quaternion.copy(camera.quaternion);
    }

    updateLensUniforms();
    composer.render();
  }

  onResize();
  frame();

  // DEV tuning panel (delete this line + buildDebugPanel + dbgCtl when done)
  const disposeDebugPanel = buildDebugPanel(dbgCtl);

  // --- teardown ---
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    disposeDebugPanel();
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
    sunRig.dispose();
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

// Once scroll progress passes this fraction the opening chrome (name + menu)
// fades out, so the lifecycle scene plays uninterrupted; it returns at the top.
// Small enough that the very first nudge of the wheel begins the hide.
const CHROME_HIDE_AT = 0.015;

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
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a
  // ref so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);

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
      // Cinematic chrome: the name (.bh-identity) and the top-right menu
      // (.overlay-blog, owned by the layout) belong to the opening frame only.
      // Once the scroll leaves the top they fade away so the lifecycle scene
      // plays uninterrupted; they return the moment you're back at the top. A
      // class on <body> drives both (the menu lives outside this island), with a
      // small threshold + hysteresis so a hair of jitter never flickers it.
      const top = s.progress < CHROME_HIDE_AT;
      if (top !== chromeVisibleRef.current) {
        chromeVisibleRef.current = top;
        document.body.classList.toggle('is-scrolled', !top);
      }
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
      // Leave the body in a clean state if the island unmounts mid-scroll.
      document.body.classList.remove('is-scrolled');
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
