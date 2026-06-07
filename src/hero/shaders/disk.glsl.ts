// Accretion-disk GPU-particle shaders (vertex morph + fragment colour).
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.

import { NEBULA_PLACE_FN } from '../gravitySim';
import { LENS_GLSL } from './lens.glsl';

// Number of CONCURRENT click eruptions the PARTICLE red giant can host. Mirrors the
// yellow-star mesh's SUN_ERUPT_SLOTS (sun.glsl.ts) so the two bodies feel identical:
// the render loop keeps a JS pool of this size and copies it into uErupt/uEruptAge
// each frame, so rapid clicks stack into separate slots instead of clobbering an
// in-flight geyser. The giant keeps its OWN pool + uniforms (the mesh and the giant
// are never on screen at once, but separate pools avoid coupling the two effects).
export const DISK_ERUPT_SLOTS = 4;

export const diskVertexShader = /* glsl */ `
  // --- CLICK ERUPTIONS on the particle red giant (geyser jet + surface ripple) ---
  // N_ERUPT must equal DISK_ERUPT_SLOTS (and matches the mesh's N_ERUPT). ERUPT_LIFE
  // is the total lifetime of one eruption in seconds — the jet rises+falls and the
  // ripple expands+fades over this span; the render loop frees the slot at the same
  // age. Both values are byte-identical to the yellow-star mesh (sun.glsl.ts) so the
  // two bodies erupt with the same timing/feel.
  #define N_ERUPT 4
  #define ERUPT_LIFE 2.4
  attribute float aU;
  attribute float aPhase;
  attribute float aThickN;
  attribute float aSeed;
  // per-particle texel UV into the GPGPU sim position texture (nebula↔star window)
  attribute vec2 aSimUV;

  uniform float uTime, uOmega0, uSpinDir, uBetaScale, uBeamExp, uDoppler;
  uniform float uRin, uRout, uThick, uPixelRatio, uSec, uHole, uVertAsym, uHorizAsym, uDistrib;
  uniform float uBright;
  // Black-hole-only geometric shrink (1 = full disk, →small as the hole implodes).
  // Gated to uGiant==0 in the body so the red giant and later states are untouched.
  uniform float uBlackHoleScale;
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

  // nebula placement — SHARED VERBATIM with the GPGPU collapse sim's seed pass
  // (gravitySim.ts) so the sim starts looking exactly like the analytic nebula.
  // Depends on h31()/fbm() declared above.
  ${NEBULA_PLACE_FN}

  uniform float uGiant;     // 0 = remnant, 1 = sun (transition 2)
  uniform float uGiantR;    // sun radius in world units
  uniform vec3  uGiantCenter; // dev: world-space offset of the red-giant orb (debug slider)
  uniform float uGiantSpin;   // red-giant axial spin angle (radians; t * rate, tilted-axis)
  uniform float uGiantScale;  // red-giant-ONLY radius multiplier (nebula/dot/sun unaffected)
  uniform float uGranScale;     // granulation cell frequency across the surface

  // --- CLICK ERUPTIONS (geyser jet + travelling surface ripple) --------------
  // Up to N_ERUPT concurrent click eruptions on the PARTICLE red giant, mirroring
  // the mesh's uErupt/uEruptAge (sun.glsl.ts) — but here the effect is a VERTEX
  // displacement (the giant is a point cloud, so points physically jet OUTWARD and
  // ripple) plus a fragment glow, not the mesh's fragment-only recolour.
  //   uErupt[i].xyz = the eruption-centre unit direction on the sphere, captured at
  //     click in the giant's UNSPUN local frame (see the JS unspin in createScene).
  //     We compare it against the particle's UNSPUN 'sphere' dir, so the spin is
  //     cancelled consistently and the bump rides the rotating photosphere.
  //   uErupt[i].w   = intensity 0..1 (click-hold scaled: tap≈0.25 → ~1.5s hold = 1);
  //     w == 0 means the slot is idle and contributes nothing.
  //   uEruptAge[i]  = seconds since the eruption fired; the jet envelope + ripple
  //     radius advance with it and the whole event ends by ERUPT_LIFE.
  uniform vec4 uErupt[N_ERUPT];
  uniform float uEruptAge[N_ERUPT];

  // Rodrigues axis-angle rotation: spin a vector v about a (unit) axis by 'ang'.
  // Used to roll the whole red-giant photosphere around its own tilted pole.
  vec3 rotateAxis(vec3 v, vec3 axis, float ang){
    float c = cos(ang), s = sin(ang);
    return v*c + cross(axis, v)*s + axis*dot(axis, v)*(1.0 - c);
  }
  // --- Later lifecycle transitions, each scroll-driven 0..1 (declared so the
  //     timeline can drive them; the shader body morphs the star onward).
  //       uYellow: red giant  -> yellow (sun-like) star
  //       uNebula: yellow star -> nebula
  //       uDot:    nebula      -> pale blue dot
  uniform float uYellow, uNebula, uDot;
  // nebula light model strength (0 = flat self-emission, 1 = full ambient+depth+occlusion)
  uniform float uNebLight;
  // --- yellow star → red giant flash-swap channels (point-cloud only) ---
  //   uYrMix : 0 = smooth gold sphere (just after the swap), 1 = granular red giant
  //   uYrGrow: 0 = yellow radius (×0.35), 1 = red-giant radius (×1.0)
  uniform float uYrMix, uYrGrow;
  // --- GPGPU gravitational collapse (nebula → yellow star) ---
  // The collapse is BAKED to a flipbook at load (see gravitySim.bake): the real
  // sim runs once, snapshotting K frames into GPU textures. At scroll time we sample
  // the TWO snapshots bracketing the scroll position and blend them — so the collapse
  // is a PURE FUNCTION of scroll (perfectly scrubbable both ways, no per-frame physics,
  // no reseed/replay snap-back).
  //   uSimPos  : snapshot A (xyz = world pos, w = life). Sampled at aSimUV.
  //   uSimPosB : snapshot B — the next baked frame after A.
  //   uSimMix  : 0 → fully A, 1 → fully B (the inter-snapshot blend factor).
  //   uSimBlend: 0 = analytic placement, 1 = fully sim-driven. Ramps in over 3.5→3.4.
  uniform sampler2D uSimPos;
  uniform sampler2D uSimPosB;
  uniform float uSimMix;
  uniform float uSimBlend;

  varying float vBright;
  varying float vSeed;
  varying float vGiant;  // 0 = ember ramp, 1 = sun warm ramp
  varying float vHeat;   // temperature proxy → fragment colour ramp
  varying float vExplode;// explosion heat proxy → blue-white→amber→red ramp
  varying float vPlaceholder; // REVIEW: 0 none, 2 nebula, 3 dot
  varying float vNeb;    // nebula emission field → colour palette (0 teal OIII → 1 rust SII)
  varying float vNebLane;// nebula lane: 0 = diffuse haze, 1 = filament strand
  varying float vNebLight;// nebula depth/occlusion brightness factor (ambient+depth light model)
  // --- yellow (sun) state channels, ported from the standalone Sun render ---
  varying float vSunM;    // warm photosphere noise field (0..1) → colour ramp
  varying float vSunLimb; // limb factor (0 centre → 1 rim) → bright limb glow
  varying float vSunDark; // sunspot/chromosphere darkening (0..1)
  varying float vSunFlare;// 0 photosphere, 1 coronal loop / prominence, 2 footpoint knot
  varying float vSunHot;  // 0..1 white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette
  varying float vYrMix;   // 0 = smooth gold cloud sphere, 1 = granular red giant
  varying float vSimLife; // GPGPU collapse: 1 = free gas, →0 as it accretes onto the star
  varying float vEaten;   // core-swallow progress (0 = on surface, 1 = fallen to the core)
  varying float vEruptGlow; // click-eruption heat (jet root + ripple crest) → fragment brighten

  void main(){
    vPlaceholder = 0.0; // REVIEW placeholder tag (set in the giant/placeholder block)
    vEruptGlow = 0.0;   // no eruption by default (set in the red-giant sun branch)
    vSimLife = 1.0;     // default: free gas (no-op outside the collapse window)
    vSunM = 0.0; vSunLimb = 0.0; vSunDark = 0.0; // sun-photosphere channels (set below)
    vSunFlare = 0.0; vSunHot = 0.0;             // sun atmosphere channels
    vSunRed = 0.0;                              // 0 gold (yellow), 1 red giant
    vYrMix = 1.0;                               // default: granular red giant (no-op)
    vNeb = 0.0;                                 // nebula emission/colour field
    vNebLane = 0.0;                             // nebula lane (0 diffuse, 1 filament)
    vNebLight = 1.0;                            // nebula light factor (1 = full bright; no-op off-nebula)
    vEaten = 0.0;                               // core-swallow progress (set in the collapse block)
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

    // Hand the imploding radius off to the ejecta radius over a SHORT smooth band
    // around the breakout (0.44–0.50) instead of a hard step at 0.46, so the debris
    // doesn't snap from "collapsed seed" to "radial blast" in a single frame — it
    // transitions continuously, reading as one physical event (matter compresses,
    // detonates, then the remnant settles) rather than a scene cut.
    r = mix(rImplode, ejectaR, smoothstep(0.44, 0.50, uMorph));
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

    // Black-hole geometric shrink: contract the whole accretion-disk/seed/blast body
    // toward the origin so the HOLE reads as visibly SMALLER (not merely farther). The
    // shrink ramps in over the same window the gravitational lensing + shadow carve fade
    // out (uMorph ~0.1→0.5 below), so the FIXED screen-space shadow radii (uShadowR,
    // uHole) never fight the shrinking disk. It's a no-op past the implosion (the driver
    // returns ~1) and is irrelevant once uGiant>0 (the red-giant branch rebuilds pos).
    pos *= uBlackHoleScale;

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
      // UNSPUN copy of this particle's surface direction, captured BEFORE the axial
      // spin below. The click eruptions store their centre dir UNSPUN (the JS side
      // un-rotates the world hit by -uGiantSpin), so we test chord distance in this
      // unspun frame — that cancels the spin consistently with no per-eruption respin,
      // while the jet still displaces along the SPUN 'dir' so the bump rides the
      // rotating photosphere. (See the eruption block after 'pos = surf'.)
      vec3 sphereUnspun = sphere;

      // Is the DISPLAYED state the red giant? (Not yellow / nebula / dot — those keep
      // uGiant=1 but must NOT take the red-giant spin or size.) Computed here so the
      // spin + the red-giant-local radius scale share one gate.
      float rgActive = (uYellow < 0.5 && uNebula < 0.5 && uDot < 0.5) ? 1.0 : 0.0;
      // red-giant-ONLY radius multiplier (1.0 everywhere else → nebula/dot/sun keep
      // their uGiantR scale and the gravity-sim seed is untouched).
      float rgScale = mix(1.0, uGiantScale, rgActive);

      // AXIAL SPIN: roll the whole textured photosphere about its own TILTED pole
      // (≈23° from vertical, Earth-like) so the granulation rotates as one rigid
      // body — the star turns on its axis instead of the camera orbiting it. Because
      // "sphere" seeds the granulation lookup, "dir", the radius and the sun branch
      // alike, rotating it here spins the entire surface coherently. uGiantSpin is 0
      // at rest → no-op; gated to the red giant so held later states never rotate.
      if(rgActive > 0.5){
        vec3 spinAxis = normalize(vec3(0.39, 0.92, 0.0)); // ~23° tilt off vertical
        sphere = rotateAxis(sphere, spinAxis, uGiantSpin);
      }

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
      float giantR = uGiantR * relief * rgScale;  // rgScale = red-giant-only inflate
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

      // fields the ragged swallow front uses: a fine fbm octave for the fringe, and a
      // tiny per-particle jitter (aThickN + aSeed hash, 0-centred, static at uTime=0) so
      // the eating edge grains don't form a clean line.
      float fil      = fbm(dir*7.5 + 4.0);
      float grainJit = 0.5*aThickN + 0.5*(h31(vec3(aSeed*31.7, 3.1, aSeed*7.9)) - 0.5);

      // === CORE SWALLOW (hollowed outside-in) =============================
      // The star is devoured into its own CORE (the centre). The outer photosphere is
      // consumed first and the eating works progressively inward, hollowing the shell
      // from the OUTSIDE toward the core, until the whole star has poured into the centre.
      // Each particle falls radially from its surface point toward the origin as the
      // ragged eating front passes over it — patches go at STAGGERED, irregular times so
      // the shell tears in organically rather than deflating uniformly. The sink is the
      // ORIGIN, so collapseScale (radius) → 0 and the consumers just scale dir by it.
      //
      // per-particle eating threshold: a ragged fbm field over the surface (0..1) decides
      // WHEN each patch is taken. Coarse lobes + a fine octave + a tiny per-grain jitter
      // → an organic, irregular front (no clean shell, no per-grain shimmer). No
      // directional bias — patches all over the surface are eaten as the front sweeps.
      float ragged = fbm(dir*2.3 + 11.0)                       // coarse ragged lobes
                   + (fil - 0.5)*0.30                          // fine fringe detail
                   + grainJit*0.10;                            // per-grain fray
      float thresh = clamp(ragged, 0.0, 1.0);                  // when this patch is eaten

      // SWEEP the eating front inward with uCollapse. A patch is consumed once the front
      // passes its threshold. smoothstep WIDTH (0.30) is the soft eating edge. Endpoints:
      //   uCollapse=0 → front=1.25, top=1.55; thresh≤1 < 1.25 → eaten=0 EVERYWHERE → full
      //                 sphere (pinned).
      //   uCollapse=1 → front=-0.35, top=-0.05; thresh≥0 > -0.05 → eaten=1 EVERYWHERE →
      //                 every particle at the core (the point, pinned).
      // Both extremes sit strictly outside the [0,1] thresh range → pins are EXACT.
      float front = mix(1.25, -0.35, uCollapse);              // sweeps as uCollapse 0→1
      float swallow = smoothstep(front, front + 0.30, thresh); // 0 not-yet .. 1 eaten
      // ACCELERATE the infall once a patch is taken (gravity into the core): ease-in so it
      // starts drifting then plunges toward the centre.
      float eaten = pow(swallow, 1.6);
      vEaten = eaten;   // → fragment: heat the colour red→white and dim as it falls in

      // radial fall to the CORE: collapseScale is the particle's radius fraction. eaten=0
      // → 1.0 (on the surface); eaten=1 → collapseLo (≈the core point). The consumers
      // multiply dir (or the textured surface point) by this, so the gas falls straight
      // in toward the centre. Staggered eaten → the shell hollows outside-in, raggedly.
      float collapseLo = 0.04;
      float collapseScale = mix(1.0, collapseLo, eaten);

      // tangential swirl as the gas streams into the core — a curl-like vector projected
      // perpendicular to the radial fall (⊥ dir), drifting slowly with uTime so the
      // infalling sheet folds and shears on its way in rather than sliding glassy-straight.
      // UNIT-sphere space (consumers scale by radius). Faded by eaten*(1-eaten) so it is 0
      // at the surface AND 0 once at the core (the point pins exactly).
      vec3 dr = vec3(
        fbm(dir*3.4 +  7.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 19.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 41.0 + vec3(0.0, uTime*0.05, 0.0))
      ) - 0.5;
      dr -= dir*dot(dr, dir);                                  // ⊥ to the radial fall
      vec3 curlOff = dr * 0.18 * (eaten*(1.0 - eaten));        // unit-space swirl

      // default position (surface-renderer-inactive fallback): the radius pulled to the
      // core by collapseScale, plus the streaming swirl, scaled to the giant radius.
      pos = (dir*collapseScale + curlOff) * giantR;

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
        vYrMix = uYrMix;   // 0 = smooth gold cloud sphere (post-swap) → 1 = red giant
        // The cloud-side red-giant base radius MUST match the held sphere-identity
        // radius (line ~414: uGiantR * rgScale ≈ 9) — the old 2.35× made the cloud side
        // ~21 units, so the held sphere POPPED to >2× size the instant the YR slot took
        // over at stage 2.05. Use rgScale alone so both paths render the SAME ~9-unit
        // giant; the ×0.18 grow below then shrinks it to the true yellow size. The yellow
        // sun keeps its 0.92 (that branch is only hit when uYellow>0.5, inert here).
        float sunRadFac = (redGiant > 0.5) ? rgScale : 0.92;
        // yellow → red giant grow: at uYrGrow=0 the cloud is size-matched to the
        // yellow mesh (×0.18 = SUN_RIG_RADIUS/RED_GIANT_RADIUS), inflating to the
        // full red-giant radius at uYrGrow=1. No-op (×1.0) everywhere else.
        // KEEP 0.18 IN SYNC with SUN_RIG_RADIUS's factor so the swap stays seamless.
        sunRadFac *= mix(0.18, 1.0, uYrGrow);
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

        // relief flattens to a perfectly round ball at the gold start (uYrMix→0),
        // returning to the bumpy red-giant photosphere as it reddens (uYrMix→1).
        float sunRelief = 1.0 + 0.05*(m - 0.55) * uYrMix;
        // CORE SWALLOW (from the block above): collapseScale pulls each particle's
        // photosphere radius inward toward the core as the ragged eating front sweeps
        // over its patch; curlOff is the streaming swirl on the way in. At the full red
        // giant (uCollapse=0) eaten=0 → collapseScale=1, curlOff=0 → the sphere is
        // unchanged. At uCollapse=1 every patch has fallen to the core → the point.
        float sunR0 = uGiantR * sunRadFac;
        // apply the radial fall + swirl in unit space, then scale by the textured surface
        // radius (sunRelief mottle rides the surface part; it vanishes as gas reaches core).
        vec3 surf = (sphere * collapseScale * sunRelief + curlOff) * sunR0;
        pos  = surf;
        heat = m;

        // === CLICK ERUPTIONS: geyser COLUMN + travelling surface ripple =======
        // Physical VERTEX displacement (this is a point cloud, unlike the mesh's
        // fragment-only recolour). The JET is a real volcanic GEYSER: only a tiny cap
        // of grains at the vent launches, and it launches along ONE shared axis (the
        // eruption-centre normal) so the grains shoot up as a TALL, NARROW collimated
        // column that sprays off the limb — NOT a hemisphere of surface bulging out
        // along each point's own radius (which read as a rounded blister/spot). The
        // travelling RIPPLE is unchanged: a ring wave that wobbles each point along its
        // OWN radial 'sphere' dir, which is correct for a surface wave. Gated to the
        // RED GIANT (vSunRed=1) so the gold swap-in ball / yellow placeholder never
        // erupt; idle slots (w=0) are skipped, so it's a no-op until a click fires.
        // Chord distance is measured in the UNSPUN frame (sphereUnspun vs the
        // stored-unspun ed) — the spin is thereby cancelled — while the column launches
        // along edNow (ed re-spun into the CURRENT frame, exactly as the surface spins
        // 'sphere'), so the geyser sticks to the clicked spot as the limb rotates.
        // Bigger hold (intensity) → taller column reaching farther off the limb + wider/
        // stronger ripple. CONSTANTS mirror the mesh geyser feel, but the giant keeps red.
        vec3  eruptCol = vec3(0.0);  // accumulated COLUMN launch along the shared axis (× sunR0)
        float eruptRip = 0.0;        // accumulated radial ripple wobble (× sunR0, signed)
        // COL_MAX: at peak intensity the FURTHEST grains in the plume travel ~0.95×
        // radius off the vent — a tall prominence visibly clearing the silhouette. The
        // dense base sits much lower; only the sparse heavy tail reaches this far.
        const float COL_MAX = 0.95;
        for(int i = 0; i < N_ERUPT; i++){
          float inten = uErupt[i].w;
          if(inten <= 0.0) continue;                       // idle slot
          vec3  ed  = normalize(uErupt[i].xyz);            // eruption centre (UNSPUN frame)
          // edNow = the eruption axis re-spun into the CURRENT frame, the SAME way the
          // surface spins 'sphere' (rotateAxis about the ~23° tilted pole by uGiantSpin).
          // This is the column's launch direction — the geyser shoots straight up off
          // the vent along it, and it tracks the rotating limb so the plume stays glued
          // to the clicked spot. Declared locally because the surface 'spinAxis' above
          // is scoped to its own block.
          vec3 spinAxis = normalize(vec3(0.39, 0.92, 0.0)); // ~23° tilt off vertical (matches surface)
          vec3 edNow    = rotateAxis(ed, spinAxis, uGiantSpin);
          float age = uEruptAge[i];
          float life = clamp(age / ERUPT_LIFE, 0.0, 1.0);
          // chord distance on the unit sphere from THIS particle (unspun) to the
          // eruption centre (unspun) — 0 at the centre, up to 2 at the antipode. The
          // ripple is a circle in this distance, so it expands as a true ring across
          // the curved surface from the click point.
          float cd = length(sphereUnspun - ed);

          // -- JET / GEYSER COLUMN: only a TIGHT cap of grains at the vent erupts.
          // 'spread' is a SMALL angular footprint (≈0.07 at a tap, ≈0.16 at a full hold)
          // so the base is a narrow vent — not a hemisphere. 'core' is the Gaussian gate
          // that selects that cap; everything outside it stays put (the rest of the
          // giant is untouched). rise = sin(life*PI) makes it erupt → peak → settle.
          float spread = 0.07 + 0.09 * inten;              // TIGHT angular footprint of the vent
          float core   = exp(-pow(cd / spread, 2.0));      // cap selector — narrow vent, not a dome
          float rise   = sin(life * 3.14159265);           // 0→1→0: erupt, peak, settle
          // Per-grain HEIGHT with a HEAVY TAIL: pow(rand, 3.5) keeps MOST grains low
          // (the dense glowing base of the fountain) while a few fly far (the sparse
          // arcing embers off the limb). aSeed/aU give each grain a stable, distinct
          // throw so the plume reads as discrete spraying particles, not a solid spike.
          float grnd   = fract(aSeed*1.7 + aU*2.3);        // stable per-grain [0,1)
          float tail    = pow(grnd, 3.5);                  // heavy-tailed: most low, few high
          float height  = COL_MAX * inten * core * rise * (0.18 + 0.82 * tail);
          // Launch the cap MOSTLY along the shared column axis edNow (the collimated
          // up-shot), with a SMALL fraction along each grain's own radius so the very
          // base fans out a touch (a fountain mouth, not a pencil line). The dominant
          // term is edNow → a tall narrow column, the opposite of a radial bulge.
          eruptCol += height * (0.85 * edNow + 0.15 * sphere);
          // Tiny lateral jitter near the top so high-flying grains scatter sideways into
          // a spray/arc instead of a clean spike. hash33 gives a stable per-grain offset;
          // scaled by tail so only the far grains drift (the base stays collimated).
          vec3 jit = (hash33(vec3(aSeed*31.0, aU*17.0, aPhase*7.0)) * 2.0 - 1.0);
          eruptCol += jit * (height * tail * 0.18);

          // -- RIPPLE: an expanding ring wave in chord distance. radius marches outward
          // with life; reach + crest width scale with intensity. A Gaussian crest gives
          // the travelling bright leading edge; it fades over the life and is damped as
          // it nears the travel limit so it doesn't pop off the edge.
          float reach   = 0.45 + 1.15 * inten;             // how far the ring travels (chord units)
          float radius  = reach * life;                    // ring radius marches outward with age
          float width   = 0.10 + 0.22 * inten;             // crest thickness widens with intensity
          float off     = cd - radius;
          float crest   = exp(-pow(off / width, 2.0));     // bright travelling crest
          float ripFade = (1.0 - life) * (1.0 - smoothstep(reach*0.7, reach, cd));
          float ripple  = crest * ripFade * inten;
          // a few % of the radius of radial wobble so the surface visibly ripples as the
          // wave passes (signed: the crest lifts the surface).
          eruptRip += ripple * 0.06;

          // accumulate the fragment glow: hot at the column root, warm on the ripple
          // crest. (height already encodes the per-grain tail, so far grains glow as the
          // plume.) Clamped per-slot contribution; the total is clamped after the loop.
          vEruptGlow += clamp(height*4.0 + ripple*1.2, 0.0, 2.0);
        }
        vEruptGlow = clamp(vEruptGlow, 0.0, 2.0);
        // apply the column launch (along the shared spun axis, in WORLD/unit dir) and the
        // radial ripple wobble (along this point's own SPUN 'sphere' dir, a true surface
        // wave). Both scaled to the giant's radius. The column is tall+narrow (a geyser),
        // the ripple is a shallow travelling ring — the spot/blister bulge is gone.
        pos += eruptCol * sunR0;
        pos += sphere * (eruptRip * sunR0);

        // === (B) atmosphere: loops / prominences / spicules =================
        // Pick a stable subset for the atmosphere using per-particle hashes (no
        // uTime → identity is fixed, so a loop stays a loop frame to frame). The
        // red giant is cooler and far less magnetically active than the yellow
        // sun, so it gets noticeably FEWER, softer features.
        // atmosphere anchored to the (collapsing) surface radius so loops/jets ride
        // the photosphere inward as it caves in rather than hanging in empty space.
        float sunR  = uGiantR * sunRadFac * collapseScale;  // actual (collapsed) radius
        float atmoThresh = (redGiant > 0.5) ? 0.94 : 0.91;
        // suppress loops/prominences while the cloud is the smooth gold swap-in
        // ball: push the pick threshold to ~never (≥1) at low uYrMix, easing the
        // (rare) red-giant flares back in only as it reddens. No-op at uYrMix=1.
        atmoThresh = mix(1.01, atmoThresh, smoothstep(0.6, 1.0, uYrMix));
        // collapse gate: as the surface caves in, fade the off-surface atmosphere out
        // so a collapsing red giant has NO loops/prominences/spicules sticking past the
        // shrinking limb. uCollapse=0 (stable red giant) → no-op (mix→atmoThresh); by
        // uCollapse≈0.45 the threshold is ≥1.01 → pick can never exceed it → every
        // atmosphere particle falls through to the collapsing photosphere 'surf'.
        atmoThresh = mix(atmoThresh, 1.01, smoothstep(0.05, 0.45, uCollapse));
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
        // dev: rigidly translate the whole red-giant orb (body + atmosphere) by a
        // world-space offset so a debug slider can reposition the star. Gated on
        // redGiant so the held nebula/dot states (which also keep uGiant=1) and the
        // yellow placeholder are untouched; defaults to (0,0,0) → no-op in prod.
        pos += uGiantCenter * redGiant;
      }
      // -- nebula: a sprawling emission cloud (Hubble/SHO look) — see block below.
      if(uNebula > 0.5){
        // ===== Emission nebula (Hubble/SHO look) =================================
        // The old version read as a dense orange BALL with radial spokes — a fireball,
        // not a nebula. Real emission nebulae (Eagle, Carina, Orion) are SPRAWLING,
        // DIFFUSE, IRREGULAR clouds: most of the frame is dark space and dark DUST
        // LANES, with bright gas piling up against the dust, and the iconic colour is
        // the narrowband palette — TEAL/cyan (OIII, hot energetic gas) threading
        // against GOLD/green (Hα) and RUST/crimson (SII, cooler shock fronts). The
        // teal↔rust contrast is what makes the eye read "nebula".
        //
        // So we drop the radial colour ramp and the shell-anchored spoke filaments.
        // Two fields shape everything, sampled in a stable per-particle SPACE so the
        // structure is rigid (only a slow drift), not per-grain shimmer:
        //   • a DOMAIN-WARPED density field carves the sprawling cloud + dark voids,
        //   • an independent EMISSION field (vNeb: 0 teal → 1 rust) interleaves the
        //     palette through the whole volume instead of by radius.
        float laneH = h31(vec3(aSeed*53.7, aPhase*11.3, 3.0)); // 0..1 lane selector
        // a BIG, gently-ROUNDED, IRREGULAR volume (near-spherical, not a flat disc).
        // The axes are evened-out so the cloud reads as a round ball, with a touch of
        // irregularity kept so it still feels organic like Eagle/Carina, not CGI.
        // MUST stay byte-identical to the ELL in gravitySim.ts (sim seed shares it).
        vec3 ELL = vec3(1.04, 1.0, 1.02);
        float NR = uGiantR * 1.72;                          // overall nebula extent (bigger → larger sphere, fills the frame)
        // a slow wandering drift so the whole cloud rolls/breathes (not frozen).
        vec3 nDrift = vec3(uTime*0.006, uTime*0.004, -uTime*0.005);

        // -- base + warped position: a FULLY-HASHED point in the volume shaped into
        // the irregular ellipsoid and domain-warped into organic cloud + voids. This
        // is now the SHARED nebulaPlace() (above), used VERBATIM by the GPGPU collapse
        // sim's seed pass so the sim starts identical to this analytic placement.
        vec3 wp = nebulaPlace(aSeed, aU, aPhase, uTime, uGiantR);

        // -- DENSITY field: bright gas where fbm is high, DARK DUST LANES where it's
        // low. A WIDE gas band so most of the cloud is filled, continuous nebulosity;
        // only the low-fbm ridges carve dark dust lanes through it. fine adds patchy
        // brightness variation so the gas isn't a flat wall.
        float gas  = fbm(wp*0.58 + nDrift*0.6);             // 0..1 large gas masses
        float fine = fbm(wp*1.7  + 9.0 + nDrift);           // finer patchy detail
        float dens = smoothstep(0.30, 0.70, gas) * (0.55 + 0.55*fine);
        // dark dust lanes: only the LOWEST-fbm ridges punch holes → black space.
        float lane = smoothstep(0.26, 0.40, gas);           // 0 in a dust lane → 1 in gas
        dens *= lane;

        // -- EMISSION field (drives the BLUE ramp + brightness, INDEPENDENT of radius).
        // For the smoky-blue look the cloud is near-monochrome: hue stays in navy→cyan
        // and only the DENSE gas climbs toward the bright cyan/white end. So we drive
        // emission mostly from local DENSITY (smoke reads as brightness variation, not
        // a hue map), with a little independent noise for organic patchiness. Biased
        // hard COOL so the bulk of the cloud sits navy/blue and only the piled-up dense
        // pockets reach bright cyan — the white-hot cores come from vHeat in the frag.
        float emi = fbm(wp*0.80 + 61.0 + nDrift*0.4);       // 0..1 patchiness noise
        emi = clamp(dens*0.72 + emi*0.28, 0.0, 1.0);        // brightness follows the gas
        emi = pow(emi, 1.85);                               // bias hard cool → mostly navy/blue haze

        // -- LIGHT MODEL: diffuse ambient + depth (no star inside; the gas is self-
        // luminous). Two cheap effects give the flat glow a sense of 3D VOLUME:
        //   1. SELF-OCCLUSION: sample the density field a couple of steps TOWARD the
        //      camera. Dense gas in FRONT of this particle dims it (its glow is partly
        //      hidden / absorbed), so the cloud occludes itself front-to-back instead
        //      of every grain reading at full brightness. The cloud sits at the origin
        //      with an identity model matrix, so cameraPosition (world space) shares
        //      the gas field's space — toward-camera is just normalize(cam - wp).
        //   2. DEPTH FADE: gas farther from the camera is dimmer and shifts slightly
        //      bluer (atmospheric/volumetric depth), so near gas reads in front of far.
        // Result: gentle dimensionality, no hard shadows — the even sprawling glow is
        // preserved, just given depth. uNebLight (0..1) lets the look be dialled.
        vec3 toCam = normalize(cameraPosition - wp);
        float occ = 0.0;
        occ += smoothstep(0.28, 0.66, fbm((wp + toCam*(NR*0.16))*0.58 + nDrift*0.6));
        occ += smoothstep(0.28, 0.66, fbm((wp + toCam*(NR*0.34))*0.58 + nDrift*0.6));
        occ *= 0.5;                                          // 0 (clear in front) .. 1 (buried)
        float occLight = mix(1.0, 0.34, occ);               // dim gas hidden behind dense gas
        // depth: view-space distance from camera, normalised across the cloud span.
        // The cloud sits at the origin, so the camera-to-centre distance is just
        // length(cameraPosition); the cloud spans ~±NR*1.3 in front/behind that.
        float camDist = length(cameraPosition);
        float vz = -(modelViewMatrix * vec4(wp, 1.0)).z;     // >0, larger = farther
        float depth01 = clamp((vz - (camDist - NR*1.3)) / (NR*2.6), 0.0, 1.0);
        float depthLight = mix(1.0, 0.6, depth01);          // far gas dimmer
        float ambient = 0.18;                                // soft even base (never pitch self-dark)
        float nebLight = mix(1.0, ambient + (1.0 - ambient)*occLight*depthLight, uNebLight);
        // far gas shifts a touch toward teal/blue (atmospheric depth on colour).
        emi = clamp(emi - depth01*0.12*uNebLight, 0.0, 1.0);

        pos = wp;
        vNeb = emi;                                          // 0 teal OIII → 1 rust SII
        vNebLight = nebLight;                                // depth/occlusion brightness factor
        vPlaceholder = 2.0;

        if(laneH < 0.045){
          // ---- FILAMENT LANE: a FEW soft lit threads in the smoke (subtle accents,
          // not hard ropes). Rare (~4.5% of points) so the cloud reads as continuous
          // smoke, not a web of strands. Each strand starts at a random interior point
          // drifts in a random direction, gently bent, crossing the cloud organically.
          float STRANDS = 160.0;
          float sid = floor(h31(vec3(aSeed*1.7, aPhase*2.3, 0.5)) * STRANDS);
          float sH1 = h31(vec3(sid, 11.0, 3.0));
          float sH2 = h31(vec3(sid, 23.0, 7.0));
          float sH3 = h31(vec3(sid, 41.0, 9.0));
          float sH4 = h31(vec3(sid, 67.0, 5.0));
          // strand origin: a random point spread through the volume (rim-biased so
          // they don't all converge at the centre → no spokes).
          float su  = sH1*2.0 - 1.0;
          float sphi = sH2 * 6.2831;
          float ssp = sqrt(max(0.0, 1.0 - su*su));
          vec3 so = vec3(ssp*cos(sphi), su, ssp*sin(sphi));
          vec3 origin = vec3(so.x*ELL.x, so.y*ELL.y, so.z*ELL.z) * (NR * (0.35 + 0.55*sH3));
          // random strand axis (free orientation → no radial spokes)
          float au = sH3*2.0 - 1.0;
          float aphi = sH4 * 6.2831;
          float asp = sqrt(max(0.0, 1.0 - au*au));
          vec3 along = vec3(asp*cos(aphi), au, asp*sin(aphi));
          vec3 up = abs(along.y) > 0.9 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
          vec3 tA = normalize(cross(along, up));
          vec3 tB = normalize(cross(along, tA));
          float s   = h31(vec3(aSeed*5.0, aPhase*3.0, 13.0)) - 0.5; // -0.5..0.5 arc
          float len = NR * mix(0.30, 0.70, sH1);            // medium strands
          float wFrq = mix(1.5, 4.5, sH3);
          float wob  = sin(s*wFrq*6.2831 + sH4*6.2831 + uTime*0.15) * (NR*mix(0.05,0.14,sH2));
          float bend = (sH2-0.5) * NR * 0.25;
          pos = origin + along*(s*len) + tA*wob + tB*(cos(s*3.14159)*bend);
          // thickness across the rope
          pos += tA*(h31(vec3(aSeed,2.0,8.0))-0.5)*(NR*0.025);
          pos += tB*(h31(vec3(aSeed,4.0,6.0))-0.5)*(NR*0.025);
          // colour from local emission, biased toward the BRIGHT-CYAN end (the wisps
          // are the lit threads in the smoke, not warm shock fronts). Kept cool — the
          // ramp tops out at icy cyan, never gold/rust.
          float femi = clamp(fbm(pos*0.80 + 61.0 + nDrift*0.4)*0.5 + 0.50, 0.0, 1.0);
          vNeb = femi;
          heat = 0.55 + 0.5*pow(h31(vec3(aSeed*4.0, sid, 8.0)), 2.5); // soft lit threads
          vNebLane = 1.0;                                   // filament wisp
        } else {
          // ---- DIFFUSE GAS LANE: the dominant nebulosity (~90% of points). CULL by
          // local density so the gas is CONTINUOUS where it's present and FADES to
          // black space only in the dust lanes/voids. Keep a healthy floor everywhere
          // gas exists (so the big soft puffs overlap into smooth sheets, not a grainy
          // starfield) and cull almost everything where dens≈0 (the dark lanes).
          float keep = h31(vec3(aSeed*23.0, aU*5.0, 19.0));
          if(keep > 0.18 + 0.78*smoothstep(0.0, 0.5, dens)) vNebLane = -1.0; // -1 → culled
          // emission ∝ local gas density, but the DENSEST pockets push hard toward the
          // white-hot end so they bloom into glowing cores (the lit smoke in the
          // reference); thin gas stays a dim navy haze.
          heat = 0.10 + 0.85*dens + 0.85*smoothstep(0.55, 0.95, dens);
        }
        // ---- ionising young-star knots: a tiny fraction become small blue-white
        // points scattered through the gas (the cluster lighting the cloud). Spread,
        // not piled at the centre, so they don't form a single glaring core.
        if(laneH > 0.997){
          vNeb = 0.0;
          vNebLane = 0.0;
          heat = 1.3;
          vPlaceholder = 2.5;                               // star sub-tag (→ white-blue)
        }
      }
      // -- pale blue dot: collapse to a small, soft, cool sphere ------------
      if(uDot > 0.5){
        pos = sphere * (uGiantR * 0.018);
        heat = 0.5;
        vPlaceholder = 3.0;
      }
    }

    // === Real gravity sim collapse (nebula -> yellow star) ====================
    // The collapse is a STATEFUL N-body-style sim (gravitySim.ts) BAKED to a flipbook
    // at load: particles accelerate under a softened central well + strong curl
    // turbulence, swirl in chaotically from all directions, and accrete onto the core.
    // Here we read the two baked snapshots that bracket the scroll position and blend
    // them (uSimMix), then blend THAT into the analytic placement (uSimBlend). Because
    // the snapshots are fixed, the result is a pure function of scroll — scrubbing back
    // and forth lands on the exact same frame every time (no snap-back). The sim is
    // seeded from the same analytic placement, so at uSimBlend~0 simP~pos -> no pop.
    if(uSimBlend > 0.0){
      vec4 simA = texture2D(uSimPos,  aSimUV);  // snapshot A (xyz = world pos, w = life)
      vec4 simB = texture2D(uSimPosB, aSimUV);  // snapshot B (next baked frame)
      vec4 simP = mix(simA, simB, uSimMix);     // interpolate between the two snapshots
      pos = mix(pos, simP.xyz, uSimBlend);
      vSimLife = simP.w;                          // → frag brightens/dims accreting matter
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
    // RE-FORMATION shadow re-assert (scroll-UP only). The dissolve below was written
    // for the SUPERNOVA (forward / scroll-DOWN): once morph passes ~0.5 the dying
    // centre lets matter cross it. But while the hero is RE-FORMING (the feed beat,
    // morph 0.30..0.46) the black hole is fully present and its shadow MUST stay a
    // pure black void — the re-lit clumpy gas must not smear over the interior.
    // reCarve must HOLD near 1 across the WHOLE beat and fall to 0 at BOTH ends —
    // NOT track the feed's 0.46->0.30 ramp (that decays mid-beat, letting the front-
    // face gas re-paint the centre by ~0.36). Low-end ramp (0.10->0.20) keeps morph->0
    // exactly as-is (the existing carve already handles the resting hero); high-end
    // ramp drops sharply 0.44->0.47 so it is 0 by the breakout -> the supernova that
    // must fill the dying centre (morph>~0.47) is untouched.
    float reCarve = smoothstep(0.10, 0.20, uMorph) * smoothstep(0.47, 0.44, uMorph);
    // re-drop FAR-side particles inside the shadow for the WHOLE beat (the generic
    // carve above already fades out as morph rises). Only behindAmt>0.35 (far side)
    // is dropped, so the near face of the disk still shows IN FRONT of the hole.
    if(rFin < uHole*0.98 && behindAmt > 0.35 && reCarve > 0.5) drop = true;
    float coreFade;
    if(behindAmt > 0.35){
      coreFade = smoothstep(uHole*0.95, uHole*1.20, rFin);              // back: carved, soft edge
    } else {
      coreFade = mix(0.14, 1.0, smoothstep(uHole*0.10, uHole*1.05, rFin)); // front: subtle veil at centre, bright at edge
    }
    // dissolve the carve as the shadow dies, so the flare fills the centre
    coreFade = mix(coreFade, 1.0, smoothstep(0.15, 0.6, uMorph));
    // reShadow: 1 INSIDE the shadow disc during the re-formation beat, 0 outside the
    // rim (rFin >= uHole*1.15 -> photon ring survives) and 0 at the hero/supernova
    // (reCarve guard). Reused below to gate the additive infall glow so NOTHING paints
    // the interior during the beat.
    float reShadow = reCarve * (1.0 - smoothstep(uHole*0.85, uHole*1.15, rFin));
    // ...then RE-DARKEN the centre during the re-formation beat only: force coreFade->0
    // (black) inside the shadow disc. bright multiplies coreFade (below), so zeroing it
    // zeroes the organic-feed product too (feed * 0 = 0) — nothing multiplicative can
    // re-light the interior.
    coreFade = mix(coreFade, 0.0, reShadow);

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
    float morphFlare   = smoothstep(0.46, 0.70, uMorph);
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
    float seedDip = exp(-pow((uMorph-0.42)/0.04, 2.0));
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
    float seedSuppress = exp(-pow((uMorph-0.42)/0.035, 2.0));   // 1 at seed → 0 by flash
    float flashGate = (1.0 - 0.92*coreDark) * (1.0 - 0.80*seedSuppress*coreDark);
    bright += uFlash * (0.85 + 1.1*pv) * (0.6 + 0.4*useMag) * flashGate;
    // accretion stream: light ONLY on the strained infalling matter just OUTSIDE
    // the dark core (∝ inward strain), so you see glowing strands spiralling into
    // a black point — the "aspiration" read — instead of a glow blob. Never lights
    // the core itself ((1-coreDark)). infallGlow comes from the position block.
    // Also gate by (1-reShadow): during the RE-FORMATION beat this additive seed
    // glow must not paint the shadow interior either (coreFade only kills the
    // multiplicative path). reShadow is 0 outside the beat, so the seed/supernova
    // aspiration read past 0.44 is fully preserved.
    bright += infallGlow * (0.5 + 0.6*pv) * (1.0 - coreDark) * (1.0 - reShadow);

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
    float shellLight = band * (1.0 - 0.3*flare) * 5.2 * smoothstep(0.46, 0.66, uMorph);
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

      // overall scale — warm and richly lit. The real brightness fix is the lowered
      // grade tone-map compression (uToneComp) for the red giant; this scale just needs
      // to give the tone-map something to work with, so 1.1 is plenty (1.3 risked a wash
      // once the compression was relaxed). The deep-red ramp keeps it red, not white.
      float giantBright = photo * 1.1;

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
          // red giant: a big diffuse cool star. The parked comp frames the curved LIMB,
          // so the old heavy limb-darkening (limbMu 0.30) + deep-red palette + low
          // exposure crushed the surface to near-black. Lift the per-grain luminance
          // substantially (floor 0.30→0.46, ceiling 0.60→0.82) AND cut the red limb
          // darkening (limbMu 0.30→0.14) so the limb we're actually looking at reads as a
          // lit, glowing edge rather than a black silhouette. Still below the yellow
          // star's stack — the colour ramp stays deep red, so it brightens to a vivid red
          // photosphere, not a white blowout.
          float baseLo = mix(0.30, 0.80, vSunRed);
          float baseHi = mix(0.62, 1.05, vSunRed);
          float limbMu = mix(0.18, 0.12, vSunRed);
          float lum = (baseLo + baseHi*m) * (1.0 - vSunDark*0.85) * ((1.0-limbMu) + limbMu*mu);
          float arBright = smoothstep(0.86, 0.995, m) * mix(0.45, 0.40, vSunRed);
          // light the fresnel limb warmly (was 0.22 for red) so the curved edge glows.
          bright = (lum + arBright + limb*mix(0.30, 0.50, vSunRed));
          vHeat = m;
        }
      }
      // --- nebula lighting: glowing emission gas, not a lit surface -----------
      // The giant photosphere lighting above is meaningless for a scattered cloud,
      // so override it. Emission tracks LOCAL GAS DENSITY (heat, from the geometry
      // block) — bright clumps and filament cores glow, the thin veil between dust
      // lanes barely glows. No radial dimming any more: vNeb is the emission/colour
      // field now, so brightness is purely density-driven. Kept LOW per-particle
      // because the big overlapping grains accumulate additively — bloom/grade
      // supply the overall glow.
      if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
        float dens = clamp(heat, 0.0, 1.7);
        if(vNebLane > 0.5){
          // FILAMENT strands: the bright wispy web threading the gas — the structure
          // the eye latches onto. Crisp and luminous with brighter knots.
          bright = 0.40 + 1.30*dens*dens;
        } else {
          // DIFFUSE gas: dim soft nebulosity that the colour palette survives on,
          // NOT a bright wall that clips to cream. Scales with local density so the
          // gas masses glow and the dust lanes stay near-black.
          bright = 0.05 + 0.42*dens;
        }
        if(vPlaceholder > 2.4) bright = 3.0;     // central star cluster: bright point
        vHeat = dens;                            // keep density for the spine lift
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
    // Black-hole shrink moves grains CLOSER to the origin (smaller dist), which would
    // balloon them via the 16/dist term and mush the disk. Scale the grain size with the
    // shrink so the contracting disk stays crisp and grainy. Gated to uGiant==0 (step is
    // 1 only when uGiant==0); the red giant / later states keep their own sizing.
    baseSize *= mix(1.0, uBlackHoleScale, step(uGiant, 0.0));
    float surfSize = baseSize * 1.7;
    // yellow photosphere: enlarge the grains so ~1M points OVERLAP into a solid
    // surface (kills the sandy per-point speckle, leaving the big swirly cells).
    float yellowSurf = (vPlaceholder > 0.5 && vPlaceholder < 1.5 && vSunFlare < 0.5) ? 1.0 : 0.0;
    // red giant gets slightly FATTER grains (3.6 vs the yellow 3.0) so the photosphere
    // reads denser at the parked limb — closing the worst black gaps — while keeping
    // visible granulation (not a flat solid wall). vSunRed is 1 only for the red giant.
    float surfGrain = mix(3.0, 3.6, vSunRed);
    surfSize = mix(surfSize, baseSize * surfGrain, yellowSurf);
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
    // nebula: DIFFERENT sizing per lane. Filament wisps get fat soft grains that
    // overlap into glowing ropes; the surviving diffuse gas gets BIG soft puffs that
    // melt into continuous nebulosity (we view from outside now, so the grains must
    // be large to overlap into sheets rather than read as a grainy starfield).
    // Culled diffuse grains (vNebLane < 0) are sized to 0 so the voids stay black.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
      float sizeRand = 0.7 + 0.6*aSeed;                  // per-particle variety (tighter → smoother overlap)
      if(vNebLane > 0.5){
        gl_PointSize = clamp(baseSize * (1.3 + 1.8*vHeat) * sizeRand, 1.2, 8.0); // soft lit thread
      } else {
        // BIG soft puffs so ~1M grains overlap into continuous smoke (not a grainy
        // starfield). Larger floor/cap than before → fewer hard gaps between grains.
        gl_PointSize = clamp(baseSize * (3.0 + 3.2*vHeat) * sizeRand, 1.8, 16.0); // soft smoke puff
      }
      if(vPlaceholder > 2.4) gl_PointSize = clamp(baseSize*3.0, 2.5, 9.0); // young-star knot (small bright point)
      if(vNebLane < -0.5) gl_PointSize = 0.0;            // culled diffuse grain
    }
    if(vPlaceholder > 2.9){
      gl_PointSize = (aSeed < 0.000018) ? clamp(baseSize * 0.10, 0.35, 0.75) : 0.0;
    }
    if(drop) gl_PointSize = 0.0;
  }
`;

export const diskFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uSat;
  uniform float uYrFlash;   // yellow→red swap flash: whitens the gold cloud sphere
  varying float vBright;
  varying float vSeed;
  varying float vGiant;
  varying float vHeat;
  varying float vExplode;
  varying float vPlaceholder; // REVIEW: 0 none, 1 yellow, 2 nebula, 3 dot
  varying float vNeb;    // nebula emission field → colour palette (0 teal OIII → 1 rust SII)
  varying float vNebLane;// nebula lane: 0 = diffuse haze, 1 = filament strand
  varying float vNebLight;// nebula depth/occlusion brightness factor
  varying float vSunM;    // warm photosphere field for the yellow-sun ramp
  varying float vSunLimb; // limb factor → bright gold rim glow
  varying float vSunDark; // sunspot/network darkening
  varying float vSunFlare;// 0 photosphere, 1 loop/jet, 2 footpoint knot
  varying float vSunHot;  // white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette
  varying float vYrMix;   // 0 = smooth gold cloud sphere, 1 = granular red giant
  varying float vSimLife; // GPGPU collapse: 1 = free gas, →0 as it accretes onto the star
  varying float vEaten;   // core-swallow progress (0 = on surface, 1 = fallen to the core)
  varying float vEruptGlow; // click-eruption heat (jet root + ripple crest) → hot brightening
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
          // At the gold swap-in (vYrMix→0) flatten the mottle toward its mean so
          // the cloud reads as a SMOOTH gold ball (no granulation); it relaxes to
          // the true grainy field as it reddens (vYrMix→1). vYrMix is 1 (no-op)
          // for the settled red giant and every other stage.
          float mEff = mix(0.62, m, vYrMix);
          // gold (yellow sun) — unchanged; only reached when vSunRed<1 (mesh's job),
          // so for the cloud (vSunRed=1) this term is mixed out below.
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
          // red giant — deep, saturated red photosphere (built from mEff; dark
          // veins/limb scaled by vYrMix so the gold ball has no lanes). The whole ramp
          // is lifted warmer/brighter: the old blood-red mid-tones sank to near-black at
          // this exposure. The umbra is no longer near-black, the body reaches a vivid
          // red-orange across most of mEff, and the limb glows so the parked curved edge
          // reads as molten, not a silhouette.
          vec3 rc = vec3(0.68, 0.15, 0.04);                     // ember floor, lifted (deeper
          //   orange/red shadows brought UP a touch: 0.62,0.12,0.03 → 0.68,0.15,0.04).
          rc = mix(rc, vec3(0.94, 0.20, 0.04),  smoothstep(0.08, 0.34, mEff)); // deep red, richer
          rc = mix(rc, vec3(1.00, 0.26, 0.05),  smoothstep(0.30, 0.58, mEff)); // red
          rc = mix(rc, vec3(1.00, 0.40, 0.09),  smoothstep(0.56, 0.80, mEff)); // red-orange
          rc = mix(rc, vec3(0.96, 0.48, 0.14),  smoothstep(0.84, 1.0, mEff));  // hot orange, gold
          //   highlight dialled DOWN slightly (1.00,0.54,0.18 → 0.96,0.48,0.14).
          rc = mix(rc, vec3(0.22, 0.020, 0.0), vSunDark*vYrMix); // dark spots/veins (lifted off black)
          // warm, glowing red limb (forward-scattered) — the curved edge fills the comp.
          rc = mix(rc, vec3(1.00, 0.32, 0.08), vSunLimb*0.65*vYrMix);
          rc += vSunLimb * vec3(0.55, 0.12, 0.02) * vYrMix;

          // gold swap-in target: a clean warm gold that matches the yellow mesh,
          // so the flash-masked mesh→cloud handoff is seamless. Lerp gold → red
          // by vYrMix (single monotonic curve; no red→yellow→red path).
          vec3 goldC = mix(vec3(0.70, 0.30, 0.04), vec3(1.00, 0.66, 0.20),
                           smoothstep(0.2, 0.9, mEff));
          vec3 redBody = mix(goldC, rc, vYrMix);
          // vSunRed is 1 for the cloud, so this selects redBody; the mesh path
          // (vSunRed<1, gold sc) is unaffected.
          pcol = mix(sc, redBody, vSunRed);
          // whiten under the swap flash so the incoming gold cloud frames bloom to
          // match the mesh handoff (subtle — a warm brightening, not a white-out).
          // No-op when uYrFlash=0.
          pcol = mix(pcol, vec3(1.0, 0.92, 0.78), clamp(uYrFlash, 0.0, 1.0) * 0.08);

          // CORE-SWALLOW HEATING: as each patch of gas falls into the core (vEaten 0→1)
          // it compresses and HEATS — the colour ramps red → orange → white-hot. Two
          // stops so it lingers red for most of the fall then whitens near the core.
          // Gated by vSunRed so only the red giant heats (the gold sun path is untouched).
          float heatK = pow(clamp(vEaten, 0.0, 1.0), 1.5) * vSunRed;
          vec3 hotMid = vec3(1.0, 0.55, 0.15);                 // red → hot orange
          vec3 hotWhite = vec3(1.0, 0.95, 0.88);               // → near-white core
          pcol = mix(pcol, hotMid,   smoothstep(0.0, 0.6, heatK));
          pcol = mix(pcol, hotWhite, smoothstep(0.55, 1.0, heatK));

          // CLICK-ERUPTION HEAT: where points launch into the geyser column / the
          // ripple crest passes (vEruptGlow > 0) the plasma flares HOT — but it stays in
          // the RED-GIANT palette, NEVER whitening. The giant is blood-red, so its
          // eruption is hot RED plasma: it ramps from the giant's own blood-red up to a
          // bright RED-ORANGE at the column root (the equivalent of the mesh eruption's
          // fully-red end), staying in the same hue family as the surrounding surface —
          // brighter and more saturated, but no gold/white/pink. Gated by vSunRed (red
          // giant only); additive + capped so it can't blow to white under bloom. No-op
          // when vEruptGlow=0. (Stops mirror the red-giant ramp r3..r4 in sun.glsl.ts.)
          float eg = clamp(vEruptGlow, 0.0, 2.0) * vSunRed;
          vec3 eRed  = vec3(0.90, 0.18, 0.04);   // blood red (giant surface, hotter than body)
          vec3 eOrng = vec3(1.00, 0.34, 0.08);   // bright red-orange (plume body)
          vec3 eRoot = vec3(1.00, 0.45, 0.12);   // hottest RED-ORANGE at the column root (no white)
          pcol = mix(pcol, eRed,  smoothstep(0.0, 0.6, eg));   // base of the plume reddens hot
          pcol = mix(pcol, eOrng, smoothstep(0.5, 1.2, eg));   // brighter red-orange up the column
          pcol += eRoot * smoothstep(0.9, 1.8, eg) * 0.5;      // red-orange glow at the root (additive, NOT white)
        }
      } else if(vPlaceholder < 2.9){
        // nebula (smoky-blue, backlit-haze look): the eye should read SMOKE lit from
        // within — deep navy in the thin gas, climbing through teal/cyan as the gas
        // gets denser/hotter, blowing out to a cool WHITE in the bright cores. This is
        // a near-monochrome BLUE cloud (the iStock/Hubble blue-nebula reference), not
        // the multi-hue SHO rainbow: hue barely shifts, BRIGHTNESS carries the form.
        // vNeb walks the cool ramp; the hottest gas (vHeat) pushes toward white.
        float rr = clamp(vNeb, 0.0, 1.0);
        vec3 cNavy = vec3(0.04, 0.10, 0.30);  // 0.00 deep navy (thin outer haze)
        vec3 cBlue = vec3(0.10, 0.34, 0.72);  // 0.35 mid blue
        vec3 cCyan = vec3(0.34, 0.72, 0.96);  // 0.70 bright cyan (dense gas)
        vec3 cIce  = vec3(0.78, 0.92, 1.00);  // 1.00 icy near-white (hot cores)
        vec3 ncol = mix(cNavy, cBlue, smoothstep(0.00, 0.40, rr));
        ncol = mix(ncol, cCyan, smoothstep(0.35, 0.78, rr));
        ncol = mix(ncol, cIce,  smoothstep(0.74, 1.00, rr));
        // MASS → HEAT → COLOUR: the densest gas clusters carry the most mass, so
        // they read HOTTER — pushed hard toward hot blue-white (the same heat
        // language as the young forming star). vHeat already tracks local density
        // (dens), so high vHeat = dense = hot. The bright cores bloom to blue-white.
        float core = smoothstep(0.85, 1.70, vHeat);              // dense/hot cores
        ncol = mix(ncol, vec3(0.62, 0.80, 1.00), core*0.55);     // hot azure
        ncol = mix(ncol, vec3(0.92, 0.97, 1.00), smoothstep(1.25, 1.75, vHeat)*0.7); // white-hot peak
        // scattered young stars read crisp blue-white, off-ramp.
        ncol = mix(ncol, vec3(0.85, 0.92, 1.00), step(2.4, vPlaceholder));
        // GRAVITATIONAL COLLAPSE: as gas accretes onto the forming star (vSimLife
        // 1→0) it is COMPRESSED → heats up → drives toward hot blue-white, matching
        // the young blue star it feeds (mass→heat). The star then cools blue→yellow
        // as it grows. No-op for free gas (vSimLife=1).
        float accreteHeat = 1.0 - clamp(vSimLife, 0.0, 1.0);
        ncol = mix(ncol, vec3(0.80, 0.90, 1.00), smoothstep(0.1, 0.85, accreteHeat));
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
        // The gold swap-in BALL (vYrMix→0) used to be LIFTED 1.4× — but that made the
        // particle cloud noticeably BRIGHTER than the dimmer mesh sun that swaps in,
        // so the swap read as a brightness DROP (bright white blob → dim gold sphere).
        // Pull the cloud-ball factor DOWN to 0.50 so the smooth particle sphere lands
        // at/just-below the mesh brightness → the cloud→mesh handoff is continuous.
        // (vYrMix=1, the settled red giant + every other stage, is the 1.0 no-op end.)
        inten = a * (0.22 + 0.42*clamp(vBright, 0.0, 1.3)) * mix(0.50, 1.0, vYrMix);
      }
      // CORE-SWALLOW DIM: as the gas falls into the core (vEaten→1) the photosphere
      // collapses to a dense speck and DIMS — hold full brightness through most of the
      // fall, then fade in the last third so the collapsed core reads dark, not a bright
      // dot. Ramps only in the back half of the swallow so the bright body holds first.
      float eatenDim = smoothstep(0.45, 1.0, vEaten);
      inten *= 1.0 - 0.82*eatenDim;
      // CLICK-ERUPTION LIFT: erupting/rippling grains glow brighter so the jet + crest
      // read as luminous plasma, not just a recolour. Additive on top of the body
      // brightness; capped so the giant stays in gamut. No-op when vEruptGlow=0.
      inten *= 1.0 + 1.1*clamp(vEruptGlow, 0.0, 2.0);
    }
    // nebula: per-grain intensity stays MODERATE so the overlapping soft grains
    // accumulate additively into luminous gas WITHOUT clipping to white — the SHO
    // colour ramp (teal → rust) must survive. The diffuse gas carries the glow now
    // (it's the dominant lane, viewed from outside), so it's lifted enough to read as
    // continuous nebulosity; filaments are the brighter wisps. Bloom glows on top.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.4){
      if(vNebLane > 0.5){
        inten = a * (0.10 + 0.34*clamp(vBright, 0.0, 2.2));   // soft lit thread
      } else {
        // diffuse smoke: thin haze stays DIM, but the dense pockets (high vHeat) bloom
        // into bright lit cores → the strong dim↔bright contrast of backlit smoke.
        float coreBoost = smoothstep(0.7, 1.4, vHeat);        // 0 in haze → 1 in dense cores
        inten = a * (0.04 + 0.26*clamp(vBright, 0.0, 1.3)) * (1.0 + 2.2*coreBoost);
      }
      inten *= vNebLight;   // ambient+depth light model: dim far / self-occluded gas
    } else if(vPlaceholder > 2.4 && vPlaceholder < 2.9){
      inten = a * clamp(vBright, 0.0, 4.0);          // young-star knot: bright point
    }
    // GPGPU collapse glow: as gas accretes onto the core (vSimLife 1→0) give it a
    // GENTLE brightening as it heats/compresses, then fade it OUT as it parks so the
    // opaque mesh star owns the core (the gas in front must not wash the blue star).
    // Kept subtle (≤1.4×) so the forming star reads cleanly. No-op for free gas.
    float accrete = 1.0 - clamp(vSimLife, 0.0, 1.0);   // 0 free gas → 1 fully parked
    inten *= 1.0 + 0.4*accrete*(1.0 - accrete)*4.0;     // gentle heat brightening
    inten *= mix(1.0, 0.0, smoothstep(0.55, 0.9, accrete)); // fade out as it parks
    gl_FragColor = vec4(col * inten, 1.0);
  }
`;
