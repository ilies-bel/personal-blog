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
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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

  ${LENS_GLSL}

  varying float vBright;
  varying float vSeed;

  void main(){
    // radius from the parameter — adjustable radial distribution (uDistrib)
    float r = uRin + (uRout-uRin) * pow(aU, uDistrib);
    float thick = aThickN * uThick * (0.5 + r/uRout);

    // Keplerian orbit
    float omega = uOmega0 * pow(r, -1.5);
    float phi   = aPhase + uSpinDir * omega * uTime;
    float cs = cos(phi), sn = sin(phi);
    vec3 pos = vec3(r*cs, thick, r*sn);

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

    if(uImageSign > 0.0){
      ndcFinal = mix(ndcU, ndcL, behindAmt);
      useMag   = mix(1.0, min(mag, 1.9), behindAmt);
      if(behindAmt > 0.5 && screenR < uShadowR*0.985) drop = true;
    } else {
      // secondary image: scale its RADIUS (uSec) -> size control
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
    vec2 bhN = clipBH.xy / clipBH.w;
    vec2 dFin = ndcFinal - bhN;
    float rFin = length(vec2(dFin.x*uAspect, dFin.y));
    if(rFin < uHole*0.95 && behindAmt > 0.35) drop = true;
    float coreFade;
    if(behindAmt > 0.35){
      coreFade = smoothstep(uHole*0.95, uHole*1.20, rFin);              // back: carved, soft edge
    } else {
      coreFade = mix(0.14, 1.0, smoothstep(uHole*0.10, uHole*1.05, rFin)); // front: subtle veil at centre, bright at edge
    }

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
    if(drop) bright = 0.0;

    vBright = bright;
    vSeed   = aSeed;
    gl_Position = outClip;

    float dist = -viewP.z;
    float size = uPixelRatio * (1.0 + 0.6*sqrt(min(bright,6.0))) * (16.0/dist);
    gl_PointSize = clamp(size, 0.6, 4.5);
    if(drop) gl_PointSize = 0.0;
  }
`;

const diskFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uSat;
  varying float vBright;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);

    // near-monochrome ramp (a hint of warmth in the highlights)
    float t = vBright / (vBright + 1.6);
    vec3 cLow = vec3(0.78, 0.80, 0.85);
    vec3 cMid = vec3(0.93, 0.93, 0.94);
    vec3 cHot = vec3(1.00, 1.00, 1.00);
    vec3 col = mix(cLow, cMid, smoothstep(0.0, 0.45, t));
    col = mix(col, cHot, smoothstep(0.45, 0.92, t));
    // desaturate toward grey
    float luma = dot(col, vec3(0.299,0.587,0.114));
    col = mix(vec3(luma), col, uSat);

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
  uniform float uTime, uPixelRatio, uShadowR, uAspect, uHole, uVertAsym, uHorizAsym, uRingBright;
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

function createScene(container: HTMLElement, reduced: boolean): () => void {
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

  function frame(): void {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const t = (now - t0) / 1000;

    // dezoom progress (0 close → 1 rest). Reduced motion lands at the rest frame.
    const intro = reduced ? 1 : easeOut(Math.min(t / INTRO_DUR, 1));
    const distFactor = NEAR_FACTOR + (1 - NEAR_FACTOR) * intro;
    const dist = CFG.camDist * distFactor;

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
//  Public component — a thin React shell that owns the canvas container.
// ---------------------------------------------------------------------------
export default function BlackHole() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = prefersReducedMotion();
    const dispose = createScene(host, reduced);
    return dispose;
  }, []);

  return <div className="bh-stage" ref={hostRef} aria-hidden="true" />;
}
