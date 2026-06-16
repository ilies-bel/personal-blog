// Sun / red-giant mesh rig: textured photosphere, glow shell, corona, star dome, loops.
import * as THREE from 'three';
import {
  sunSurfaceVert, sunSurfaceFrag, sunGlowVert, sunGlowFrag,
  sunCoronaVert, sunCoronaFrag, sunStarVert, sunStarFrag, sunLoopVert, sunLoopFrag,
  SUN_ERUPT_SLOTS,
} from '../shaders/sun.glsl';
import type { Rig } from './types';

export const STAR_BACK_BASE_BRIGHT = 2.2;

// SunRig is a plain Rig (no shared `uniforms` block): each mesh carries its own
// material with its own uniforms, so there is no single block to widen to UniformRig.
export interface SunRig extends Rig {
  group: THREE.Group;
  surfaceMat: THREE.ShaderMaterial;
  // The photosphere mesh itself. Exposed so the render loop's click raycaster can
  // target ONLY the solid surface (clicks on the surrounding corona/loops shouldn't
  // erupt). Its live world transform is what the raycaster intersects.
  surface: THREE.Mesh;
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
export function buildSunRig(scene: THREE.Scene, R: number, pixelRatio: number): SunRig {
  const group = new THREE.Group();
  group.visible = false;

  // --- (A) photosphere mesh ---
  // uRed (0 yellow → 1 red giant) reddens + dims the surface for the inflation.
  // uErupt/uEruptAge host up to SUN_ERUPT_SLOTS concurrent click eruptions: each
  // slot is a vec4 (xyz = object-space eruption-centre direction, w = intensity)
  // plus an age in seconds. All start idle (intensity 0). The render loop owns the
  // JS-side pool and copies it into these arrays each frame (it mutates the same
  // Vector4 / number entries in place, so there is no per-frame allocation).
  const uEruptInit: THREE.Vector4[] = [];
  const uEruptAgeInit: number[] = [];
  for (let i = 0; i < SUN_ERUPT_SLOTS; i++) {
    uEruptInit.push(new THREE.Vector4(0, 1, 0, 0)); // dir +Y, intensity 0 = idle
    uEruptAgeInit.push(0);
  }
  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // uMeshFade: yellow↔red swap cross-dissolve opacity (1 = fully present; <1 ONLY
      // across the tight swap band, where the mesh fades in over the gold cloud). The
      // render loop drives it from meshW. Default 1 → identical to the old opaque body.
      uMeshFade: { value: 1 },
      uRed: { value: 0 },
      uBlue: { value: 0 },
      // uSeedGlow: newborn-seed emission lift (>1 only while the forming star is a tiny
      // pinpoint; the render loop drives it from starFormed). Default 1 → no-op everywhere.
      uSeedGlow: { value: 1 },
      // uDetail: surface-DETAIL ramp (0 = clean evenly-lit glowing sphere, all granulation/
      // mottle/sunspot/network texture suppressed; 1 = full granulated photosphere). The
      // render loop drives it from starFormed so the newborn SEED is a clean (blue) dot-sphere
      // that GAINS its yellow-star texture as it grows. Default 1 → full detail = no-op everywhere.
      uDetail: { value: 1 },
      uErupt: { value: uEruptInit },
      uEruptAge: { value: uEruptAgeInit },
      // uWaveFlow: master strength of the click-ripple domain warp (the granulation cells
      // streaming with the wavefront). 0 = surface texture frozen; 1 = tuned default. Lives
      // purely in object space so there is no atlas/seam. Live-tunable via window.__wave.flow.
      uWaveFlow: { value: 1 },
    },
    vertexShader: sunSurfaceVert,
    fragmentShader: sunSurfaceFrag,
    // Transparent + premultiplied so uMeshFade can dissolve the (convex) photosphere
    // over the gold cloud at the swap. depthWrite stays ON: the sphere is convex, so
    // the depth test alone draws front faces over back faces correctly without a sort,
    // and keeping the depth write lets the additive atmosphere layers occlude properly.
    // At uMeshFade=1 (everywhere outside the swap) this composites identically to the
    // former opaque body (alpha 1 over the cleared/non-cloud background).
    transparent: true,
    depthWrite: true,
    premultipliedAlpha: true,
  });
  const surface = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 24), surfaceMat);
  group.add(surface);

  // --- (B) inner chromosphere glow (BackSide additive) ---
  // uColor is driven per frame (gold → dim red) so the glow cools with the star.
  const glowMat = new THREE.ShaderMaterial({
    // uFade: swap cross-dissolve presence (1 = full glow; the render loop drives it from
    // meshW so the chromosphere rim dissolves in with the photosphere). Default 1 → no-op.
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.55, 0.16) }, uFade: { value: 1 } },
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
  // Half-size pulled in (R*4.0 → R*2.4): with the steeper falloff in sunCoronaFrag
  // the halo is now a tight rim glow, so the billboard doesn't need to span far —
  // a smaller plane keeps uDiskFrac larger (disc fills more of the quad) so the
  // glow stays anchored right at the rim instead of floating out in dead space.
  const coronaHalf = R * 2.4;
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

  // The reference sun's activity is dominated by graceful ARCING coronal LOOPS that
  // curve off the limb and return to the surface — NOT straight erupting spikes. So
  // the loop arcades are the hero (kept plentiful) and the straight prominences are
  // cut right back (they were reading as an urchin of spikes). The loops also arc a
  // touch higher so the rainbow-arc shape is unmistakable.
  const NA = 24; // loop arcades — the dominant feature
  for (let i = 0; i < NA; i++) {
    setLife();
    const big = i < 8; // a good number of dramatic, tall arcades
    buildLoops({
      c: randDir(),
      sep: 0.15 + Math.random() * (big ? 0.20 : 0.13), // wider feet → broader arcs
      nArch: big ? 14 + Math.floor(Math.random() * 8) : 6 + Math.floor(Math.random() * 6),
      kBase: (big ? 0.46 : 0.26) + Math.random() * 0.18, // arch higher off the limb (taller rainbow)
      archLean: (Math.random() * 2 - 1) * (big ? 0.7 : 0.5),
      fan: 0.07 + Math.random() * 0.06,
      spanAz: Math.random() * Math.PI * 2,
    });
  }
  // Straight erupting prominences: CUT from 15 → 4 and made shorter. A few jets read
  // as energetic; fifteen tall ones read as a spiky sea-urchin that hides the disc.
  const NP = 4;
  for (let i = 0; i < NP; i++) {
    setLife();
    CUR.dir = 0; // prominences always spray base -> tip
    buildProminence(randDir(), 0.45 + Math.random() * 0.45); // shorter/denser, not towering spikes
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

  return { group, surfaceMat, surface, glowMat, coronaMat, loopMat, starMat, starBack, corona, dispose };
}
