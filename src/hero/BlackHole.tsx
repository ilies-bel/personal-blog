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
import { BEATS, STAGE_COUNT, BUILT_STAGES } from './beats';
import { lifecycle, easeOut, smoothstep01 } from './lifecycle';
import { buildGravitySim, simDimensions, type GravitySim } from './gravitySim';
import HudNavigation, { HUD_NAV_BY_ID, type HudTargetId } from './HudNavigation';
import { CFG, lookOffsetX, lookOffsetY, prefersReducedMotion, tuneParticlesForDevice } from './lib/config';
import {
  SCROLLED_BODY_CLASS,
  HUD_SELECTED_STORAGE_KEY,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  type BeatEdge,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  EXPLORATION_TRIGGER_AT,
  EXPLORATION_REVEAL_DELAY_MS,
  BEAT_HOLD,
  BEAT_FADE,
  DEBUG_WINDOW_KEYS,
  readDebugNumber,
} from './lib/constants';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
//  GLSL shader sources live in ./shaders/*.glsl.ts (grouped by rig). They are
//  imported here and wired into materials by the build*() factories below.
// ---------------------------------------------------------------------------
import { diskVertexShader, diskFragmentShader } from './shaders/disk.glsl';
import {
  starVertexShader,
  starFragmentShader,
  distantStarVertexShader,
  distantStarFragmentShader,
} from './shaders/star.glsl';
import { warpVertexShader, warpFragmentShader } from './shaders/warp.glsl';
import { ringVertexShader, ringFragmentShader } from './shaders/ring.glsl';
import { GradeShader, NovaShader } from './shaders/post.glsl';
import {
  sunSurfaceVert,
  sunSurfaceFrag,
  sunGlowVert,
  sunGlowFrag,
  sunCoronaVert,
  sunCoronaFrag,
  sunStarVert,
  sunStarFrag,
  sunLoopVert,
  sunLoopFrag,
} from './shaders/sun.glsl';

// Star-dome base brightness (mesh sun rig). Not GLSL — used by buildSunRig and
// the render loop, so it stays here next to the scene wiring.
const STAR_BACK_BASE_BRIGHT = 2.2;

// Handles the render loop needs to drive + tear down the sun rig.
interface SunRig {
  group: THREE.Group;
  surfaceMat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
  coronaMat: THREE.ShaderMaterial;
  loopMat: THREE.ShaderMaterial;
  starMat: THREE.ShaderMaterial;
  // The twinkling star backdrop dome. It is a SEPARATE scene object (NOT a child
  // of `group`) so the render loop can show it behind BOTH the yellow star and the
  // red giant (which is drawn by the point cloud, not this rig) and so the rig's
  // forming-scale never shrinks the far star field. Visibility is toggled on its
  // own (s.starBackVisible), independent of group.visible.
  starBack: THREE.Points;
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
    uniforms: { uTime: { value: 0 }, uRed: { value: 0 }, uBlue: { value: 0 } },
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
    uniforms: { uTime: { value: 0 }, uDiskFrac: { value: R / coronaHalf }, uRed: { value: 0 }, uFade: { value: 1 } },
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
  // It is a SEPARATE scene object (centred at the origin, like the rig), NOT a
  // child of `group` — so the render loop can reveal it behind the RED GIANT too
  // (which is drawn by the point cloud, not this rig) and so the rig's forming-
  // scale never shrinks the far field. Real depth test → the opaque photosphere
  // occludes the stars it covers while the rest fill the black space around it.
  // Distributed on a thick spherical shell so parallax from the slow camera drift
  // gives the field a touch of depth.
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
      uBright: { value: STAR_BACK_BASE_BRIGHT }, // overall scale so points survive the post grade
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
  starBack.visible = false; // shown by the render loop behind the yellow star + red giant
  scene.add(starBack);

  scene.add(group);

  const dispose = (): void => {
    scene.remove(group);
    scene.remove(starBack);
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

  return { group, surfaceMat, glowMat, coronaMat, loopMat, starMat, starBack, corona, dispose };
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
  /** Active HUD target. The render loop uses this only for a quiet focus boost;
   *  the stage preview itself still flows through getStage(). */
  getFocusTarget?: () => HudTargetId | null;
  /** True while the final HUD is controlling previews. Suppresses cinematic-only
   *  effects such as the supernova whiteout so menu hover never becomes flashy. */
  isExplorationMode?: () => boolean;
}

// ---------------------------------------------------------------------------
//  Inline-renderer factories. Each build*() owns one piece of the scene's
//  geometry construction, material/shader wiring, attribute loops and its own
//  disposal — mirroring buildSunRig/SunRig above (the canonical pattern). They
//  return a small "rig" object that createScene wires into resize/frame, and a
//  dispose() that tears the rig down (construction + disposal co-located). No
//  shader source, uniform value or geometry math changes here vs the old inline
//  blocks — this is a pure split-out of what createScene used to build by hand.
// ---------------------------------------------------------------------------

// The 1.2M-point GPU accretion-disk cloud. Two lensed images share ONE geometry
// + ONE shared `uniforms` object: the PRIMARY (uImageSign +1) bright crescent
// and the SECONDARY (uImageSign -1) lower band, whose material clones the
// uniforms so its sign can flip independently. The cloud also doubles as the
// red-giant / nebula / dot body later in the lifecycle (driven by uGiant/etc).
interface DiskRig {
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

function buildDisk(scene: THREE.Scene, particleCount: number, pixelRatio: number): DiskRig {
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
    uNebLight: { value: 1 }, // nebula ambient+depth light model strength (0 flat → 1 full)
    // --- yellow star → red giant flash-swap (transition 3, scroll 3→2). These
    //     drive ONLY the point-cloud's gold→red sphere during the yellow⇄red
    //     slot; all three default to a no-op so every other stage is unchanged.
    uYrFlash: { value: 0 }, // brief swap flash: whitens the freshly-spawned gold sphere
    uYrMix: { value: 1 }, // 0 = smooth gold sphere, 1 = granular red giant
    uYrGrow: { value: 1 }, // 0 = yellow radius (×0.35), 1 = red-giant radius
    // --- GPGPU gravitational collapse (nebula → yellow star) ---
    uSimPos: { value: null }, // sim position texture (set per-frame from the sim)
    uSimBlend: { value: 0 }, // 0 = analytic nebula, 1 = fully sim-driven collapse
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
interface StarRig {
  pts: THREE.Points; // primary lensed starfield (frame toggles .visible)
  secPts: THREE.Points; // secondary image (kept hidden — caustic pile-up)
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  matSec: THREE.ShaderMaterial; // secondary material (cloned uniforms, sign -1)
  uniforms: Uniforms; // primary's shared block (matSec clones it)
  dispose: () => void;
}

function buildStarfield(scene: THREE.Scene, particleCount: number, pixelRatio: number): StarRig {
  const starN = Math.max(2500, Math.floor(particleCount * 0.11 * CFG.starDensity));
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uStarBright: { value: CFG.starBright },
    uHole: { value: 0.12 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const matSec = mat.clone();
  matSec.uniforms = THREE.UniformsUtils.clone(uniforms);
  matSec.uniforms.uImageSign.value = -1.0;

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const secPts = new THREE.Points(geo, matSec);
  secPts.frustumCulled = false;
  secPts.visible = false; // secondary point image piles into a hot point near the caustic
  scene.add(secPts);

  const dispose = (): void => {
    scene.remove(pts);
    scene.remove(secPts);
    geo.dispose();
    mat.dispose();
    matSec.dispose();
  };

  return { pts, secPts, geo, mat, matSec, uniforms, dispose };
}

interface DistantStarRig {
  pts: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  uniforms: Uniforms;
  dispose: () => void;
}

function buildDistantStar(scene: THREE.Scene, pixelRatio: number): DistantStarRig {
  const N = 9;
  const pos = new Float32Array(N * 3);
  const shard = new Float32Array(N);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    shard[i] = i / (N - 1);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aShard', new THREE.BufferAttribute(shard, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uHole: { value: 0.12 },
    uPresence: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: distantStarVertexShader,
    fragmentShader: distantStarFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  const dispose = (): void => {
    scene.remove(pts);
    geo.dispose();
    mat.dispose();
  };

  return { pts, geo, mat, uniforms, dispose };
}

// The warp arcs: short line segments that trace each background star's lensed
// arc, intensifying the "spacetime bent around the hole" read. Like the disk
// and starfield they carry a PRIMARY (+1) and SECONDARY (-1) image off one geo.
interface WarpRig {
  seg: THREE.LineSegments; // primary arc image
  seg2: THREE.LineSegments; // secondary arc image
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  matSec: THREE.ShaderMaterial; // secondary material (cloned uniforms, sign -1)
  uniforms: Uniforms; // primary's shared block (matSec clones it)
  dispose: () => void;
}

function buildWarp(scene: THREE.Scene, particleCount: number): WarpRig {
  const WARP_STARS = Math.max(2000, Math.floor(particleCount * 0.02));
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(warpPos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(warpSeed, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(warpSPar, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uWarp: { value: CFG.warp },
    uHole: { value: 0.12 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: warpVertexShader,
    fragmentShader: warpFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const matSec = mat.clone();
  matSec.uniforms = THREE.UniformsUtils.clone(uniforms);
  matSec.uniforms.uImageSign.value = -1.0;

  const seg = new THREE.LineSegments(geo, mat);
  seg.frustumCulled = false;
  scene.add(seg);
  const seg2 = new THREE.LineSegments(geo, matSec);
  seg2.frustumCulled = false;
  scene.add(seg2);

  const dispose = (): void => {
    scene.remove(seg);
    scene.remove(seg2);
    geo.dispose();
    mat.dispose();
    matSec.dispose();
  };

  return { seg, seg2, geo, mat, matSec, uniforms, dispose };
}

// The photon ring: a single dense Points band sitting just outside the shadow
// rim (the bright lensed-light circle). One image only — no secondary sign.
interface RingRig {
  pts: THREE.Points; // the ring band (frame toggles .visible)
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  uniforms: Uniforms;
  dispose: () => void;
}

function buildRing(scene: THREE.Scene, pixelRatio: number): RingRig {
  const ringN = 64000;
  const ringAng = new Float32Array(ringN);
  const ringSeed = new Float32Array(ringN);
  for (let i = 0; i < ringN; i++) {
    ringAng[i] = Math.random() * Math.PI * 2;
    ringSeed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringN * 3), 3));
  geo.setAttribute('aAng', new THREE.BufferAttribute(ringAng, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(ringSeed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uShadowR: { value: 0.1 },
    uAspect: { value: 1.0 },
    uHole: { value: 0.12 },
    uVertAsym: { value: CFG.vertAsym },
    uHorizAsym: { value: CFG.horizAsym },
    uRingBright: { value: CFG.ringBright },
    uRingScale: { value: 1.0 }, // dev: ring radius × (relative to dark-core rim)
    uMorph: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  const dispose = (): void => {
    scene.remove(pts);
    geo.dispose();
    mat.dispose();
  };

  return { pts, geo, mat, uniforms, dispose };
}

// The post chain: EffectComposer wrapping RenderPass → UnrealBloomPass →
// GradePass (tone-map/grade/vignette, NOT rendered to screen) → NovaPass (the
// supernova whiteout, the FINAL pass to screen so the grade can't swallow the
// white). frame() drives bloom.strength/radius + grade/nova uniforms each tick.
interface PostRig {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  gradePass: ShaderPass;
  novaPass: ShaderPass;
  render: () => void;
  setSize: (w: number, h: number) => void;
  dispose: () => void;
}

function buildPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostRig {
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
    composer.setSize(w, h);
    bloom.setSize(w, h);
  };
  const render = (): void => {
    composer.render();
  };
  const dispose = (): void => {
    composer.dispose();
    gradePass.material.dispose();
    bloom.dispose();
  };

  return { composer, bloom, gradePass, novaPass, render, setSize, dispose };
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

  // ---- renderers ----
  // Each piece (disk / starfield / warp arcs / photon ring / post chain) is now
  // built by its own build*() factory above (mirroring buildSunRig). The rigs own
  // their geometry, materials and disposal; createScene just wires them into the
  // resize/frame loops below. The shared uniform blocks + sub-objects are pulled
  // out into the same local names the loop already used, so the per-frame writes
  // and updateLensUniforms() stay byte-for-byte identical.
  const pr0 = renderer.getPixelRatio();

  const diskRig = buildDisk(scene, diskParticles, pr0);
  const diskMatPrimary = diskRig.primary;
  const diskMatSecondary = diskRig.secondary;
  const diskPrimary = diskRig.primaryPts;
  const diskSecondary = diskRig.secondaryPts;

  const starRig = buildStarfield(scene, diskParticles, pr0);
  const starUniforms = starRig.uniforms; // updateLensUniforms() writes through this
  const starMat = starRig.mat;
  const starMatSec = starRig.matSec;
  const starPts = starRig.pts;
  const starSecPts = starRig.secPts;

  const distantStarRig = buildDistantStar(scene, pr0);
  const distantStarUniforms = distantStarRig.uniforms;
  const distantStarPts = distantStarRig.pts;

  const warpRig = buildWarp(scene, diskParticles);
  const warpUniforms = warpRig.uniforms; // updateLensUniforms() writes through this
  const warpMat = warpRig.mat;
  const warpMatSec = warpRig.matSec;
  const warpSeg = warpRig.seg;
  const warpSeg2 = warpRig.seg2;

  const ringRig = buildRing(scene, pr0);
  const ringUniforms = ringRig.uniforms; // updateLensUniforms() writes through this
  const ringMat = ringRig.mat;
  const ringPts = ringRig.pts;

  const postRig = buildPostChain(renderer, scene, camera);
  const bloom = postRig.bloom;
  const gradePass = postRig.gradePass;
  const novaPass = postRig.novaPass;

  // --- yellow-star sun rig (revealed only during the yellow stage) ---
  // The yellow star is a small anchor that GROWS into the red giant. The red
  // giant is the point cloud at uGiantR (4.2) × its sunRadFac (2.35) = 9.87 world
  // units, so the dying star lands at 9.87 × 0.18 ≈ 1.78 — a small isolated orb
  // that inflates to the bloated giant. NOTE: the cloud's grow-start factor in the
  // vertex shader (`mix(0.18, 1.0, uYrGrow)`) MUST equal this 0.18 so the gold
  // particle sphere is size-matched to the mesh at the swap.
  const RED_GIANT_RADIUS = 4.2 * 2.35; // point-cloud red giant world radius
  const SUN_RIG_RADIUS = RED_GIANT_RADIUS * 0.18; // dying star: small grow anchor
  const sunRig = buildSunRig(scene, SUN_RIG_RADIUS, renderer.getPixelRatio());

  // --- GPGPU gravitational collapse (nebula → yellow star) ---
  // A stateful gravity sim that collapses the nebula particles inward to feed the
  // mesh star (see gravitySim.ts). Seeded from the SAME analytic nebula placement
  // the disk shader uses, so it starts pop-free. Skipped under reduced motion;
  // returns a no-op {available:false} if float targets are unsupported → the
  // hero degrades to the analytic hard-swap. The accretion core matches the star
  // photosphere (SUN_RIG_RADIUS); uGgiantR (4.2) is the nebula extent scale.
  const gravitySim: GravitySim = reduced
    ? { available: false, step: () => {}, getPosTexture: () => null, dispose: () => {} }
    : buildGravitySim({
        renderer,
        count: diskRig.count,
        aSeed: diskRig.aSeed,
        aU: diskRig.aU,
        aPhase: diskRig.aPhase,
        giantR: diskMatPrimary.uniforms.uGiantR.value as number,
        coreR: SUN_RIG_RADIUS,
        halfFloat: diskParticles <= 240_000,
      });

  // --- lens uniforms (recomputed each frame from camera geometry) ---
  function updateLensUniforms(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const D = camera.position.length();
    const shadowAng = CFG.coreSize / D;
    const ndcShadow = shadowAng / Math.tan(fovY / 2);
    const thetaE = ndcShadow * CFG.lens;
    // dev: holeScale resizes the interior blackout sphere (the dark shadow disc).
    // The disk carve, the star/warp inner cutoff and the ring radius all key off
    // uHole, so this scales the whole void consistently.
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
    distantStarUniforms.uShadowR.value = ndcShadow;
    distantStarUniforms.uThetaE.value = starThetaE;
    distantStarUniforms.uHole.value = holeR;
    distantStarUniforms.uAspect.value = aspect;
    distantStarUniforms.uPixelRatio.value = pr;
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
    postRig.setSize(w, h); // composer.setSize + bloom.setSize, co-located in the rig
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gradePass.uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    novaPass.uniforms.uAspect.value = w / h;
    updateLensUniforms();
  }
  window.addEventListener('resize', onResize);

  // --- animation: intro dezoom travelling, then slow rotation drift ---
  // The camera starts close (CFG.camDist * NEAR_FACTOR) and eases out to its
  // resting distance over INTRO_DUR seconds, once. After that it keeps a slow
  // azimuth rotation forever. A gentle pointer parallax rides on top.
  const NEAR_FACTOR = 0.42; // how close the travelling begins (× resting distance)
  const INTRO_DUR = 6.0; // seconds for the dezoom
  const ROTATE_SPEED = 0.018; // rad/s of resting drift

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

  // easeOut (cubic) + smoothstep01 are the single-source-of-truth easings, now
  // owned by lifecycle.ts (imported above). The stateful clock below still needs
  // them: easeOut for the intro dezoom ramp, smoothstep01 for the nova rise.

  // The lifecycle position is eased toward its scroll target each frame so a
  // flick of the wheel glides through the transitions instead of snapping.
  // stage 0→1 = reverse supernova; 1→2 = red giant.
  let stage = 0;
  let focusGlow = 0;
  // previous-frame stage for the gravity sim (more substeps on a fast scroll).
  let prevSimStage = 0;

  // --- supernova whiteout: a TIME-based flash envelope, decoupled from scroll ---
  // The old flash was a Gaussian in `morph` (scroll position) ~0.1 wide, so a fast
  // scroll skipped it entirely. Instead we TRIGGER on the breakout crossing and run
  // our own clock to completion, so the blast is always seen at full length no
  // matter how fast the visitor scrolls. `nova` (0..1) is the master envelope that
  // drives the whiteout pass + the particle/bloom/exposure beats.
  let novaStart = -1;     // performance.now() ms at fire; -1 = idle
  let novaArmed = true;   // hysteresis latch: re-arm only after leaving the band
  let prevMorph = 0;      // previous-frame morph, for crossing detection
  // direction the blast plays, latched at fire and held for the whole envelope:
  //   +1 EXPLODE  — scroll UP, red giant → black hole (morph FALLING through 0.5),
  //                 time forward: a star collapses, detonates, blasts outward.
  //   -1 IMPLODE  — scroll DOWN, black hole → red giant (morph RISING through 0.5),
  //                 time backward: the "un-explosion", light gathers inward.
  let novaDir = 1;
  const NOVA_TRIGGER = 0.5;  // breakout (where the legacy flash fired)
  const NOVA_ARM = 0.12;     // must move |morph-0.5| beyond this to re-arm
  const NOVA_RISE = 0.12;    // s: dark → blinding peak
  const NOVA_HOLD = 0.22;    // s: hold at peak white
  const NOVA_DECAY = 1.2;    // s: cool-out, reveal the remnant
  const NOVA_DUR = NOVA_RISE + NOVA_HOLD + NOVA_DECAY; // 1.54 s total
  const NOVA_COOLDOWN = 900; // ms minimum between fires (anti-strobe backstop)
  let nebulaFlashStart = -1;
  let nebulaFlashArmed = true;
  let prevNebulaStage = 0;
  const NEBULA_FLASH_TRIGGER = 3.5;
  const NEBULA_FLASH_ARM = 0.18;
  const NEBULA_FLASH_RISE = 0.08;
  const NEBULA_FLASH_HOLD = 0.18;
  const NEBULA_FLASH_DECAY = 1.55;
  const NEBULA_FLASH_DUR = NEBULA_FLASH_RISE + NEBULA_FLASH_HOLD + NEBULA_FLASH_DECAY;
  const NEBULA_FLASH_COOLDOWN = 1200;
  const frameLookTarget = new THREE.Vector3();
  const flashOrigin = new THREE.Vector3();

  function frame(): void {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const t = (now - t0) / 1000;

    // --- lifecycle position, smoothed toward the scroll target ---
    const exploring = hooks.isExplorationMode?.() === true;
    const focusTarget = exploring ? hooks.getFocusTarget?.() ?? null : null;
    const stageTarget = hooks.getStage();
    stage += (stageTarget - stage) * (reduced ? 1 : 0.12);
    // DEBUG: window.__bhMorph forces the stage to an exact value (no smoothing)
    // so the explosion can be inspected frame-by-frame from a capture script.
    const morphOverride = readDebugNumber(DEBUG_WINDOW_KEYS.morph);
    if (typeof morphOverride === 'number') stage = morphOverride;
    // `morph` (= min(1, stage)) is needed HERE for the stateful nova clock's
    // breakout-crossing detection below; lifecycle() recomputes it from the same
    // formula for the look scalars. (Kept local + cheap — it's the clock's input.)
    const morph = Math.min(1, stage);              // transition 1 progress (0..1)

    // --- transition 1: reverse supernova ---
    diskMatPrimary.uniforms.uMorph.value = morph;
    diskMatSecondary.uniforms.uMorph.value = morph;
    ringMat.uniforms.uMorph.value = morph;
    // --- supernova flash: time-based envelope, fired on the breakout crossing ---
    // Detect a crossing of the breakout (morph through 0.5) in EITHER scroll
    // direction. Fire once, then latch: re-arm only after morph has clearly left
    // the band (so parking on 0.5 or jittering at the edge can't machine-gun it),
    // with a hard cooldown as an anti-strobe backstop. Reduced-motion never fires.
    const crossed = (prevMorph < NOVA_TRIGGER) !== (morph < NOVA_TRIGGER);
    if (
      crossed && novaArmed && !reduced && !exploring &&
      (novaStart < 0 || now - novaStart > NOVA_COOLDOWN)
    ) {
      novaStart = now;
      novaArmed = false;
      // latch the blast direction from how morph crossed the breakout: RISING
      // (scroll down, BH→giant) plays the IMPLODE; FALLING (scroll up, giant→BH)
      // plays the EXPLODE. Held until the next fire so the whole envelope is one
      // coherent direction even if the scroll reverses mid-blast.
      novaDir = morph > prevMorph ? -1 : 1;
    }
    if (!novaArmed && Math.abs(morph - NOVA_TRIGGER) > NOVA_ARM) novaArmed = true;
    prevMorph = morph;
    // evaluate the envelope on its OWN clock (rise → hold → ease-out decay), so it
    // always plays to completion regardless of where scroll has gone meanwhile.
    let nova = 0;
    if (novaStart >= 0) {
      const te = (now - novaStart) / 1000; // seconds since fire
      if (te >= NOVA_DUR) novaStart = -1; // expired → idle
      else if (te < NOVA_RISE) nova = smoothstep01(te / NOVA_RISE);
      else if (te < NOVA_RISE + NOVA_HOLD) nova = 1.0;
      else {
        const p = (te - NOVA_RISE - NOVA_HOLD) / NOVA_DECAY; // 0..1 across the tail
        nova = 1.0 - p * p * (3.0 - 2.0 * p); // smoothstep ease-out (light dissipating)
      }
    }
    // DEBUG: window.__bhFlash pins the envelope to a held value so capture scripts
    // can screenshot the rise/peak/decay (the time-based flash would otherwise
    // expire during their settle wait). Pairs with __bhMorph (which pins stage).
    const flashOverride = readDebugNumber(DEBUG_WINDOW_KEYS.flash);
    if (typeof flashOverride === 'number') nova = Math.max(0, Math.min(1, flashOverride));

    const crossedNebula = (prevNebulaStage < NEBULA_FLASH_TRIGGER) !== (stage < NEBULA_FLASH_TRIGGER);
    if (
      crossedNebula && nebulaFlashArmed && !reduced && !exploring &&
      (nebulaFlashStart < 0 || now - nebulaFlashStart > NEBULA_FLASH_COOLDOWN)
    ) {
      nebulaFlashStart = now;
      nebulaFlashArmed = false;
    }
    if (!nebulaFlashArmed && Math.abs(stage - NEBULA_FLASH_TRIGGER) > NEBULA_FLASH_ARM) nebulaFlashArmed = true;
    prevNebulaStage = stage;
    let nebulaFlash = 0;
    if (nebulaFlashStart >= 0) {
      const te = (now - nebulaFlashStart) / 1000;
      if (te >= NEBULA_FLASH_DUR) nebulaFlashStart = -1;
      else if (te < NEBULA_FLASH_RISE) nebulaFlash = smoothstep01(te / NEBULA_FLASH_RISE);
      else if (te < NEBULA_FLASH_RISE + NEBULA_FLASH_HOLD) nebulaFlash = 1.0;
      else {
        const p = (te - NEBULA_FLASH_RISE - NEBULA_FLASH_HOLD) / NEBULA_FLASH_DECAY;
        nebulaFlash = 1.0 - p * p * (3.0 - 2.0 * p);
      }
    }
    const nebulaFlashOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebulaFlash);
    if (typeof nebulaFlashOverride === 'number') nebulaFlash = Math.max(0, Math.min(1, nebulaFlashOverride));

    const screenNova = Math.max(nova * 0.82, nebulaFlash);
    const nebulaFlashOwnsScreen = nebulaFlash >= nova * 0.82;
    novaPass.uniforms.uNova.value = screenNova;
    novaPass.uniforms.uPeak.value = nebulaFlashOwnsScreen ? 0.985 : 0.88;
    // DEBUG: window.__bhFlashDir pins the blast direction (+1 explode / -1 implode)
    // so a capture script can inspect either variant without scrolling to trigger it.
    const flashDirOverride = readDebugNumber(DEBUG_WINDOW_KEYS.flashDir);
    novaPass.uniforms.uNovaDir.value = nebulaFlashOwnsScreen ? 1 : typeof flashDirOverride === 'number' ? flashDirOverride : novaDir;

    // dezoom progress (0 close → 1 rest). Reduced motion lands at the rest frame.
    // This is the second piece of the stateful clock (time-based intro ramp); like
    // `nova` it is resolved HERE and fed into lifecycle() as an input.
    const intro = reduced ? 1 : easeOut(Math.min(t / INTRO_DUR, 1));

    // === lifecycle() — the pure choreography ================================
    // All the per-frame look DECISIONS (the ~48 scalars that used to live inline:
    // kCollapse, giant, giantHeld, yellow/nebula/dot, flash, the yellow⇄red swap,
    // gravity teardown, bloom/exposure/grade beats, the zoom story) are computed by
    // the pure lifecycle() module from the resolved clock inputs (eased `stage`,
    // `t`, `nova`, `intro`). frame() stays the thin impure shell: it just WRITES the
    // returned StarState into uniforms / bloom / exposure / grade / camera below.
    const s = lifecycle({
      stage,
      t,
      reduced,
      nova,
      intro,
      rotateSpeed: ROTATE_SPEED,
      nearFactor: NEAR_FACTOR,
      cfg: CFG,
    });
    focusGlow += ((focusTarget ? 1 : 0) - focusGlow) * (reduced ? 1 : 0.08);
    const focusEmission = 1 + focusGlow * 0.18;
    const focusBloom = 1 + focusGlow * 0.12;

    // the particle-side shock-breakout glow follows the SAME time envelope, so
    // the additive blast core peaks together with the screen whiteout. The shader's
    // morph gates (smoothstep(0.40,0.50,uMorph), flashGate) still apply, so the seed
    // stays dark before the breakout regardless of `nova`.
    diskMatPrimary.uniforms.uFlash.value = s.flash;
    diskMatSecondary.uniforms.uFlash.value = s.flash;
    // surface-collapse progress (0 full red-giant sphere → 1 collapsed to the point)
    diskMatPrimary.uniforms.uCollapse.value = s.kCollapse;
    diskMatSecondary.uniforms.uCollapse.value = s.kCollapse;

    // --- transitions 3-5: yellow star → nebula → pale blue dot ---
    // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
    // slot snaps to that state's stand-in at the stage midpoint (see lifecycle.ts
    // for s.yellow/s.nebula/s.dot). Replace this block (and the matching shader
    // placeholders, marked "REVIEW PLACEHOLDER") with the real morphs later; the
    // timeline placement stays the same.

    // --- transition 2: red giant (held at 1 once a later placeholder takes over) ---
    diskMatPrimary.uniforms.uGiant.value = s.giantHeld;
    diskMatSecondary.uniforms.uGiant.value = s.giantHeld;
    // The POINT CLOUD is always the RED GIANT (its grainy body), never the yellow
    // star — the yellow star is the mesh sun rig. So the cloud's uYellow stays 0;
    // the s.yellow flag still gates the timeline (laterActive / grade) inside lifecycle.
    diskMatPrimary.uniforms.uYellow.value = 0;
    diskMatSecondary.uniforms.uYellow.value = 0;
    // uNebula is 1 across the real nebula AND the gravitational-collapse window so
    // the cloud holds the analytic nebula placement (the sim's seed/home) while the
    // sim collapses it inward via uSimBlend below.
    diskMatPrimary.uniforms.uNebula.value = s.nebulaShader ? 1 : 0;
    diskMatSecondary.uniforms.uNebula.value = s.nebulaShader ? 1 : 0;
    diskMatPrimary.uniforms.uDot.value = s.dot ? 1 : 0;
    diskMatSecondary.uniforms.uDot.value = s.dot ? 1 : 0;

    // --- GPGPU gravitational collapse: step the sim + feed its texture to the cloud ---
    // The sim collapses the nebula particles inward to form the yellow star. It's
    // stepped only inside the window (s.collapse / s.simBlend > 0); otherwise the
    // home-spring would idle. uSimBlend morphs the disk from analytic → sim positions.
    let simBlend = 0;
    if (gravitySim.available && (s.simBlend > 0.001 || s.collapse > 0.001)) {
      // more substeps on a fast scroll so a flick still visibly collapses.
      const dStage = Math.abs(stage - prevSimStage);
      const substeps = 1 + Math.min(3, Math.floor(dStage / 0.05));
      gravitySim.step(s.collapse, t, substeps);
      const tex = gravitySim.getPosTexture();
      diskMatPrimary.uniforms.uSimPos.value = tex;
      diskMatSecondary.uniforms.uSimPos.value = tex;
      simBlend = s.simBlend;
    }
    prevSimStage = stage;
    diskMatPrimary.uniforms.uSimBlend.value = simBlend;
    diskMatSecondary.uniforms.uSimBlend.value = simBlend;
    // nebula light model strength (ambient+depth+self-occlusion). Always full; the
    // factor only touches nebula particles. DEBUG: window.__bhNebLight pins it (0 =
    // flat self-emission, 1 = full light model) so the look can be A/B'd live.
    const nebLightOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebLight);
    const nebLightValue = typeof nebLightOverride === 'number' ? nebLightOverride : 1;
    diskMatPrimary.uniforms.uNebLight.value = nebLightValue;
    diskMatSecondary.uniforms.uNebLight.value = nebLightValue;

    // --- yellow star → red giant: FLASH-SWAP transition ----------------------
    // Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR
    // (mesh sun rig — small, gold, textured) becomes the RED GIANT (point cloud —
    // big, deep red, grainy) as `stage` falls 3 → 2. The two bodies have totally
    // different textures, so we DON'T crossfade them co-located (that showed two
    // entities + a colour flicker). Instead (see lifecycle.ts for the windows):
    //   1. The yellow MESH owns its whole slot (stage 3.0 → 3.5, up to the nebula
    //      snap) — nothing red ever shows before it.
    //   2. A SUBTLE light flash fires at SWAP_STAGE; under it the mesh hands off
    //      to a smooth GOLD gaussian particle sphere (one short crossfade, hidden
    //      by the bloom — never two distinct textures on screen at once).
    //   3. That gold sphere then GROWS (uYrGrow) from the yellow radius to the
    //      red-giant radius while its colour LERPS gold → red (uYrMix), a single
    //      monotonic curve — so no red→yellow→red wobble.
    diskMatPrimary.uniforms.uYrFlash.value = s.yrFlash;
    diskMatSecondary.uniforms.uYrFlash.value = s.yrFlash;

    // grow + colour curves default to 1 (no-op) outside cloudSide.
    diskMatPrimary.uniforms.uYrGrow.value  = s.cloudSide ? s.yrGrow  : 1;
    diskMatSecondary.uniforms.uYrGrow.value = s.cloudSide ? s.yrGrow  : 1;
    diskMatPrimary.uniforms.uYrMix.value   = s.cloudSide ? s.yrColor : 1;
    diskMatSecondary.uniforms.uYrMix.value = s.cloudSide ? s.yrColor : 1;

    // The MESH holds small + fully gold across its whole side (no early redden,
    // no early shrink) — all the growing/cooling is the cloud's job now. This
    // removes the dual-schedule overlap that caused the two-entity + flicker bugs.
    // GRAVITATIONAL-COLLAPSE handoff: while the nebula collapses to feed the star
    // (s.starFormed 0→1) the mesh GROWS from a tiny core to full size as the gas
    // accretes onto it (the star is fed into existence), hidden under the bloom +
    // the bright converging cloud. Outside the window it sits at full size.
    const growing = s.starFormed > 0 && s.starFormed < 1;
    sunRig.group.scale.setScalar(s.starFormed > 0 ? 0.05 + 0.95 * s.starFormed : 1.0);
    // HOT YOUNG STAR: blue-white while still small/forming (mass→heat), cooling to
    // gold as it reaches full size. Stays blue through most of the growth and only
    // cools to gold near full size (1 - starFormed² holds the blue longer) so the
    // young-star colour actually reads before it settles.
    sunRig.surfaceMat.uniforms.uBlue.value = s.starFormed > 0 ? 1 - s.starFormed * s.starFormed : 0;
    sunRig.surfaceMat.uniforms.uRed.value = 0;
    sunRig.coronaMat.uniforms.uRed.value = 0;
    // FLARES (coronal loops + corona haze) only AFTER the star is fully sized:
    // suppressed entirely while growing, ramping in over the last 3% of growth so
    // the young forming star is a clean orb, not a flaring one. 1 outside the window.
    const flarePresence = s.starFormed > 0 ? smoothstep01((s.starFormed - 0.97) / 0.03) : 1;
    const dyingStarQuiet = s.meshSide && !growing ? 0.22 : 1;
    sunRig.loopMat.uniforms.uFade.value = flarePresence * dyingStarQuiet;
    sunRig.coronaMat.uniforms.uFade.value = flarePresence * dyingStarQuiet;
    // the glow shell cools blue→gold with the star as it grows.
    if (growing) {
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(
        0.35 + 0.65 * s.starFormed,
        0.55 * s.starFormed + 0.55 * (1 - s.starFormed),
        0.16 + 0.74 * (1 - s.starFormed),
      );
    } else {
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(1.0, 0.55, 0.16);
    }
    sunRig.starMat.uniforms.uOpacity.value = 1;

    // Mesh visible across its side, plus a short overhang into the bright flash so
    // the handoff cross-dissolves under the bloom rather than hard-cutting. The
    // gold particle sphere appears at/just-below the peak (cloudSide) under the
    // same flash → the two textures are never both clearly visible.
    sunRig.group.visible = s.sunRigVisible;
    // The twinkling star backdrop dome is a SEPARATE scene object, so it can sit
    // behind BOTH the yellow star (mesh rig) and the RED GIANT (point cloud) — the
    // two states share one star field — while staying hidden for the black hole
    // (which keeps the warping lensed starfield), the nebula, the dot and the
    // collapse window. See s.starBackVisible in lifecycle().
    sunRig.starBack.visible = s.starBackVisible;
    // Compensate the dome's brightness for the red giant's dimmer post grade so the
    // shared star field reads the SAME behind both star states (see starBackBright).
    sunRig.starMat.uniforms.uBright.value = STAR_BACK_BASE_BRIGHT * s.starBackBright * (1 + focusGlow * 0.08);
    // Outside the yellow⇄red slot the cloud renders the red giant, the nebula AND
    // the pale-blue-dot. Inside the slot, the cloud body only shows on the cloud
    // side (the opaque mesh owns the yellow side).
    diskPrimary.visible = s.cloudShown;
    diskSecondary.visible = s.cloudShown;
    // Hide the lensed background starfield while the opaque mesh body is present
    // (it would bleed through); restore it once the cloud body takes over. ALSO
    // hide it across the NEBULA (the gas cloud sits alone against pure black).
    starPts.visible = s.starPtsVisible;

    // the star/warp lensing only makes sense while the hole exists — fade it (the
    // s.lensLive ramp + s.starBright are computed in lifecycle()). Once the SUN
    // forms we drop the gravitational-warp background entirely and restore the plain
    // starfield to full brightness (s.starBright) behind the star.
    starMat.uniforms.uStarBright.value = s.starBright;
    distantStarPts.visible = !s.gravityGone && stage < 0.45;
    distantStarUniforms.uPresence.value = distantStarPts.visible ? 1 - smoothstep01((stage - 0.08) / 0.34) : 0;
    // Completely remove ALL gravity once the star forms (s.gravityGone): the warp
    // arcs, the secondary (lensed) disk image, and the photon ring are switched off
    // — a star has no event horizon bending light around it. The plain (un-lensed)
    // starfield behind it is restored via uStarBright above. Below ~giant 0.02 these
    // are gone entirely.
    warpSeg.visible = !s.gravityGone;
    warpSeg2.visible = !s.gravityGone;
    diskSecondary.visible = !s.gravityGone;   // no lensed disk ghost behind the star
    ringPts.visible = !s.gravityGone;          // no photon ring around the star
    starSecPts.visible = false;              // secondary lensed star image stays off
    // The point-cloud red giant body renders at full base brightness; in the
    // yellow→red slot it simply appears under the swap flash (no ramp-in — its
    // gold→red look is driven by uYrMix/uYrFlash in the shader, not by emission).
    // Collapse cloud brightness (s.cloudBright): inside the collapse window it
    // brightens the converging infall (light pouring into the star) then fades the
    // cloud out as the mesh star forms — clean handoff. Exactly 1 outside the window.
    diskMatPrimary.uniforms.uBright.value = s.baseBright * s.cloudBright * focusEmission;
    diskMatSecondary.uniforms.uBright.value = s.baseBright * s.cloudBright * focusEmission;
    // Bloom + auto-exposure + grade + disk-saturation are all resolved by
    // lifecycle() (including the sun / red-giant / nebula branch overrides), so the
    // shell just assigns the finals. See lifecycle.ts for the per-beat reasoning
    // (the nebula branch carries the SHO-palette grade tuning).
    const nebulaDark = exploring
      ? 0
      : smoothstep01((stage - 3.30) / 0.17) * (1 - smoothstep01((stage - 3.50) / 0.17));
    const preFlashDarken = 1 - 0.88 * nebulaDark * (1 - nebulaFlash);
    bloom.strength = s.bloomStrength * focusBloom * preFlashDarken + nebulaFlash * 0.18;
    bloom.radius = s.bloomRadius;
    gradePass.uniforms.uExposure.value = s.exposure * preFlashDarken;
    gradePass.uniforms.uOlive.value = s.olive;
    gradePass.uniforms.uWarmth.value = s.warmth;
    gradePass.uniforms.uSat.value = s.gradeSat;
    gradePass.uniforms.uGrain.value = s.grain; // per-state film grain (0 in the nebula)
    diskMatPrimary.uniforms.uSat.value = s.diskSat;
    diskMatSecondary.uniforms.uSat.value = s.diskSat;

    // --- lifecycle zoom choreography (the scale story) ---
    // A black hole is tiny-but-massive; a star is huge-but-diffuse. The scale
    // story is told by the CAMERA (computed in lifecycle()): sit CLOSE on the hero
    // black hole so it fills the frame, rocket WAY BACK as the matter collapses to
    // its speck, then ease back to resting for the red giant. distFactor folds in
    // the intro dezoom; zoom is the lifecycle scale story; the novaKick is a subtle
    // outward shove timed to the blast (rides the TIME envelope, so a fast scroller
    // still feels the world recoil from the detonation).
    const dist = CFG.camDist * s.distFactor * s.zoom * s.novaKick;

    const incl = THREE.MathUtils.degToRad(CFG.inclDeg);
    const horiz = dist * Math.cos(incl);
    const camY0 = dist * Math.sin(incl);

    // --- idle liveliness: layered "breathing" so the resting camera never reads
    // as locked-off. Three incommensurate octaves on the vertical bob (their
    // periods don't share a common multiple, so the motion never visibly loops),
    // plus the pointer parallax. Folded together as yWobble below.
    const idleBob = reduced
      ? 0
      : Math.sin(t * 0.055) * 0.16 + Math.sin(t * 0.13 + 1.7) * 0.035 + Math.sin(t * 0.31 + 4.1) * 0.014;

    // azimuth: a small extra sweep during the intro, then steady rotation (both
    // shaped in lifecycle()). A slow lateral handheld sway + the pointer parallax
    // ride on top here, in the impure shell, since they are DOM/time input rather
    // than lifecycle state.
    const baseAz = THREE.MathUtils.degToRad(CFG.rotation);
    const idleSway = reduced ? 0 : Math.sin(t * 0.041 + 0.6) * 0.0025; // sub-degree drift
    const a = baseAz + s.introSweep + s.rotation + idleSway + mouseX * 0.04;
    const yWobble = idleBob + -mouseY * 0.25;

    camera.position.set(Math.sin(a) * horiz, camY0 + yWobble, Math.cos(a) * horiz);
    const redFrame =
      smoothstep01((stage - 1.58) / 0.42) *
      (1 - smoothstep01((stage - 2.86) / 0.34));
    const dyingFrame =
      smoothstep01((stage - 2.72) / 0.20) *
      (1 - smoothstep01((stage - 3.44) / 0.20));
    frameLookTarget.copy(lookTarget);
    frameLookTarget.x += redFrame * -2.25 + dyingFrame * 0.72;
    frameLookTarget.y += redFrame * 0.42 + dyingFrame * -0.18;
    camera.lookAt(frameLookTarget);

    flashOrigin.set(0, 0, 0).project(camera);
    novaPass.uniforms.uCenter.value.set(
      Math.max(0, Math.min(1, flashOrigin.x * 0.5 + 0.5)),
      Math.max(0, Math.min(1, flashOrigin.y * 0.5 + 0.5)),
    );

    // --- supernova shake/rumble + idle roll (applied AFTER lookAt) -------------
    // lookAt rewrites the camera's orientation every frame, so the roll + local
    // translations below are self-clearing — they never accumulate. Two layers:
    //
    //   • idle roll: a barely-there, slow view-axis tilt so the horizon breathes
    //     even at rest (handheld feel). Sub-0.1°.
    //   • blast shake: when s.shakeAmp is hot, a SUBTLE rumble — multi-axis local-
    //     space jitter (screen-relative shudder) + a small view-axis roll. Driven
    //     by layered high-frequency sines at incommensurate rates so it reads as
    //     organic rumble, not a clean wobble. Amplitude is shakeAmp, a hump that
    //     peaks as the whiteout CLEARS (see lifecycle.ts), so the rattle lands on
    //     the reveal, not behind the white.
    //
    // The positional shudder is scaled by `dist` so it's a constant ANGULAR shake
    // (same on-screen amplitude whether we're close on the BH or way back at the
    // remnant — a fixed world offset would vanish at the far blast distance).
    if (!reduced) {
      const idleRoll = Math.sin(t * 0.067 + 2.3) * 0.0016; // rad, ~0.09°
      const sh = s.shakeAmp;
      if (sh > 0.0001) {
        const f = t * 47.0; // fast carrier for the rumble
        const amp = dist * 0.009 * sh; // angular shudder scale (≈0.9% of frame at peak)
        // local-space positional shudder (X = screen horizontal, Y = vertical)
        const jx = (Math.sin(f * 1.00) + Math.sin(f * 2.30 + 1.3)) * 0.5 * amp;
        const jy = (Math.sin(f * 1.37 + 0.7) + Math.sin(f * 2.90 + 3.1)) * 0.5 * amp;
        const jz = Math.sin(f * 0.83 + 2.0) * amp * 0.6; // dolly punch in/out
        camera.translateX(jx);
        camera.translateY(jy);
        camera.translateZ(jz);
        // view-axis roll: a soft "blast" cue — the horizon eases off level.
        // ~1.6° at peak (0.028 rad) so the tilt is felt, not jarring.
        const shakeRoll = (Math.sin(f * 0.91 + 0.4) + Math.sin(f * 1.70 + 2.6)) * 0.5 * 0.028 * sh;
        camera.rotateZ(idleRoll + shakeRoll);
      } else {
        camera.rotateZ(idleRoll);
      }
    }

    // --- FOV breath on the detonation -----------------------------------------
    // The lens widens a touch on the blast then settles. fovKick is 0 at rest,
    // so the projection matrix is only rebuilt while the kick is live.
    const fov = CFG.fovDeg + s.fovKick;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const ut = reduced ? 0 : t;
    diskMatPrimary.uniforms.uTime.value = ut;
    diskMatSecondary.uniforms.uTime.value = ut;
    starMat.uniforms.uTime.value = ut;
    starMatSec.uniforms.uTime.value = ut;
    distantStarUniforms.uTime.value = ut;
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
      sunRig.corona.quaternion.copy(camera.quaternion);
    }
    // The star backdrop dome twinkles behind both the yellow star and the red
    // giant, so advance its clock whenever IT is visible (the mesh group is hidden
    // for the red giant), independent of the rest of the rig.
    if (sunRig.starBack.visible) {
      sunRig.starMat.uniforms.uTime.value = ut;
    }

    updateLensUniforms();
    postRig.render();
  }

  onResize();
  frame();

  // --- teardown ---
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);

    // Each rig disposes its own geos + materials (and, for post, the composer +
    // bloom + grade material) — construction and teardown are now co-located in
    // the build*() factories, so this just calls each rig's dispose().
    postRig.dispose();
    diskRig.dispose();
    starRig.dispose();
    distantStarRig.dispose();
    warpRig.dispose();
    ringRig.dispose();
    sunRig.dispose();
    gravitySim.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
  };
}

// ---------------------------------------------------------------------------
//  The manifesto — one beat per lifecycle state (six states, six beats, each
//  roughly one viewport tall), pinned over the canvas and cross-faded as the
//  scroll morph passes its window.
//
//  The timeline + copy themselves (the ManifestoBeat shape, the BEATS array,
//  and the derived STAGE_COUNT / BUILT_STAGES) live in ./beats so the SSR
//  fallback and scroll track in index.astro share one source of truth with this
//  live overlay; see that module for the full narrative rationale.
// ---------------------------------------------------------------------------
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Per-beat opacity: a trapezoid centred on `at` — ramp in, hold across a flat
// top, ramp out — so neighbouring beats cross-dissolve. `edge` pins the open side
// so the first/last beats never leave a dead band at the page extremes: 'leading'
// holds full opacity before the centre (the opening black-hole beat sits at the
// very top), 'trailing' holds it after (so the closing pale-blue-dot beat stays
// reachable all the way to the bottom).
function beatOpacity(progress: number, at: number, edge?: BeatEdge): number {
  if (edge === 'leading' && progress <= at) return 1;
  if (edge === 'trailing' && progress >= at) return 1;
  const distance = Math.abs(progress - at);
  if (distance <= BEAT_HOLD) return 1;
  if (distance >= BEAT_HOLD + BEAT_FADE) return 0;
  return clamp01((BEAT_HOLD + BEAT_FADE - distance) / BEAT_FADE);
}

// ---------------------------------------------------------------------------
//  Public component — a thin React shell that owns the canvas container, the
//  scroll tracker, and the manifesto overlay.
// ---------------------------------------------------------------------------
interface BlackHoleProps {
  /** Backdrop mode: render only the scene canvas (no manifesto beats, no chrome,
   *  no scroll subscription) pinned to a fixed lifecycle frame. Used by reading
   *  pages (about, …) that want the signature object as a dimmed, static backdrop
   *  behind their copy — the same room as the hero, pushed back. */
  backdrop?: boolean;
  /** The lifecycle frame to pin in backdrop mode, in getStage transition-space
   *  (0 = black hole … 5 = the smoky-blue nebula at the end of the rewind). The
   *  nebula is the calmest, coolest, most on-palette still — cobalt room, no warm
   *  sphere — so reading copy sits over atmosphere, not a hot disk. */
  backdropStage?: number;
}

export default function BlackHole({ backdrop = false, backdropStage = 5 }: BlackHoleProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Live scroll progress (0..1) drives both the morph (via a ref the render loop
  // reads) and the manifesto opacities (via React state, updated on scroll).
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  // Scroll direction drives the big-line swap. 'down' is the default (rewind /
  // hopeful arc); 'up' swaps in the forward / tragic line. A small deadzone keeps
  // sub-pixel jitter from flipping it.
  const lastProgressRef = useRef(0);
  const [direction, setDirection] = useState<ScrollDirection>(SCROLL_DOWN);
  const [reduced, setReduced] = useState(false);
  const [explorationMode, setExplorationMode] = useState(false);
  const [previewHudId, setPreviewHudId] = useState<HudTargetId | null>(null);
  const [selectedHudId, setSelectedHudId] = useState<HudTargetId | null>(() => {
    try {
      const stored = localStorage.getItem(HUD_SELECTED_STORAGE_KEY);
      return stored && stored in HUD_NAV_BY_ID ? (stored as HudTargetId) : null;
    } catch {
      return null;
    }
  });
  const explorationModeRef = useRef(false);
  const explorationTimerRef = useRef<number | null>(null);
  const selectedHudRef = useRef<HudTargetId | null>(selectedHudId);
  const activeHudRef = useRef<HudTargetId | null>(selectedHudId);
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a
  // ref so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);

    // Backdrop mode: no scroll, no morph timeline. The scene is pinned to a fixed
    // lifecycle frame and rendered as a static, dimmed atmosphere behind page
    // copy (reading pages). None of the scroll wiring, beat opacities, or the
    // `is-scrolled` chrome toggle apply here.
    if (backdrop) {
      const fallback = Math.min(BUILT_STAGES, Math.max(0, backdropStage));
      // window.__bhBackdropStage lets a capture script A/B the pinned frame live
      // (mirrors the home's __bhMorph debug hook). Defaults to the prop.
      const pinnedStage = (): number => {
        const override = readDebugNumber(DEBUG_WINDOW_KEYS.backdropStage);
        const value = typeof override === 'number' ? override : fallback;
        return Math.min(BUILT_STAGES, Math.max(0, value));
      };
      const dispose = createScene(host, isReduced, {
        getStage: pinnedStage,
      });
      return () => dispose();
    }

    const clearExplorationTimer = (): void => {
      if (explorationTimerRef.current == null) return;
      window.clearTimeout(explorationTimerRef.current);
      explorationTimerRef.current = null;
    };
    const openExploration = (): void => {
      explorationModeRef.current = true;
      setExplorationMode(true);
    };

    const tracker = new ScrollTracker(STAGE_COUNT);
    const unsub = tracker.subscribe((s) => {
      progressRef.current = s.progress;
      setProgress(s.progress);
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = s.progress - lastProgressRef.current;
      if (delta > DIRECTION_DEADZONE) setDirection(SCROLL_DOWN);
      else if (delta < -DIRECTION_DEADZONE) setDirection(SCROLL_UP);
      if (explorationModeRef.current && selectedHudRef.current && Math.abs(delta) > DIRECTION_DEADZONE) {
        selectedHudRef.current = null;
        activeHudRef.current = null;
        setSelectedHudId(null);
        try { localStorage.removeItem(HUD_SELECTED_STORAGE_KEY); } catch { /* noop */ }
      }
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
        document.body.classList.toggle(SCROLLED_BODY_CLASS, !top);
      }

      if (s.progress >= EXPLORATION_TRIGGER_AT) {
        if (!explorationModeRef.current && explorationTimerRef.current == null) {
          explorationTimerRef.current = window.setTimeout(() => {
            explorationTimerRef.current = null;
            openExploration();
          }, isReduced ? 0 : EXPLORATION_REVEAL_DELAY_MS);
        }
      } else if (!explorationModeRef.current) {
        clearExplorationTimer();
      }
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);

    // Lifecycle position over the scroll. Each stage is 1/STAGE_COUNT of the page;
    // the five transitions span stage 0→1, 1→2, ... 4→5. Clamp to the number of
    // transitions built so the bottom of the page holds the final state.
    const getStage = (): number => {
      const activeItem = explorationModeRef.current && !isReduced && activeHudRef.current
        ? HUD_NAV_BY_ID[activeHudRef.current]
        : null;
      return activeItem?.stage ?? Math.min(BUILT_STAGES, progressRef.current * STAGE_COUNT);
    };

    const dispose = createScene(host, isReduced, {
      getStage,
      getFocusTarget: () => activeHudRef.current,
      isExplorationMode: () => explorationModeRef.current,
    });
    return () => {
      clearExplorationTimer();
      unsub();
      tracker.stop();
      dispose();
      // Leave the body in a clean state if the island unmounts mid-scroll.
      document.body.classList.remove(SCROLLED_BODY_CLASS);
    };
  }, []);

  const base = import.meta.env.BASE_URL ?? '/';
  const activeHudId = explorationMode ? previewHudId ?? selectedHudId : null;

  const handleHudPreview = (id: HudTargetId): void => {
    if (!explorationModeRef.current) return;
    activeHudRef.current = id;
    setPreviewHudId(id);
  };

  const handleHudPreviewEnd = (): void => {
    setPreviewHudId(null);
    activeHudRef.current = selectedHudRef.current;
  };

  const handleHudActivate = (id: HudTargetId): void => {
    if (!explorationModeRef.current) return;
    selectedHudRef.current = id;
    activeHudRef.current = id;
    setPreviewHudId(null);
    setSelectedHudId(id);
    try { localStorage.setItem(HUD_SELECTED_STORAGE_KEY, id); } catch { /* noop */ }
  };

  const handleHudClearSelection = (): void => {
    selectedHudRef.current = null;
    activeHudRef.current = null;
    setPreviewHudId(null);
    setSelectedHudId(null);
    try { localStorage.removeItem(HUD_SELECTED_STORAGE_KEY); } catch { /* noop */ }
  };

  // Backdrop mode renders only the scene canvas — the reading page owns its own
  // chrome and copy, and dims this layer via CSS (.bh-backdrop).
  if (backdrop) {
    return (
      <div className="bh-root bh-root--backdrop">
        <div className="bh-stage bh-backdrop" ref={hostRef} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="bh-root" data-exploring={explorationMode}>
      <div className="bh-stage" ref={hostRef} aria-hidden="true" />

      {/* Persistent identity — fixed top-left across every beat. The sole
          top-left mark on the bare home (the small wordmark is hidden there). */}
      <a className="bh-identity" href={base.replace(/\/+$/, '') || '/'}>
        <span className="bh-identity-name">ILIÈS BELDJILALI</span>
        <span className="bh-identity-role">Software Engineer</span>
      </a>

      <div
        className="bh-overlay"
        data-exploring={explorationMode}
        style={{ opacity: explorationMode && !reduced ? 0 : undefined }}
      >
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
            </div>
          );
        })}
      </div>

      <HudNavigation
        visible={explorationMode}
        activeId={activeHudId}
        selectedId={selectedHudId}
        base={base}
        onPreview={handleHudPreview}
        onPreviewEnd={handleHudPreviewEnd}
        onActivate={handleHudActivate}
        onClearSelection={handleHudClearSelection}
      />

      {!reduced && progress < 0.02 && <p className="bh-hint">scroll to rewind ↓</p>}
    </div>
  );
}
