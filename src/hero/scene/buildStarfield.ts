// Lensed starfield + plain distant-star rigs.
import * as THREE from 'three';
import { CFG, densityCompensation } from '../lib/config';
import { starVertexShader, starFragmentShader, distantStarVertexShader, distantStarFragmentShader } from '../shaders/star.glsl';
import type { Uniforms } from './types';

export interface StarRig {
  pts: THREE.Points; // primary lensed starfield (frame toggles .visible)
  secPts: THREE.Points; // secondary image (kept hidden — caustic pile-up)
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  matSec: THREE.ShaderMaterial; // secondary material (cloned uniforms, sign -1)
  uniforms: Uniforms; // primary's shared block (matSec clones it)
  dispose: () => void;
}
export function buildStarfield(scene: THREE.Scene, particleCount: number, pixelRatio: number, lowTier = false): StarRig {
  const starN = Math.max(2500, Math.floor(particleCount * 0.11 * CFG.starDensity));
  // Low-tier density compensation, gated on the explicit lowTier flag (the tier
  // signal) so the starfield brightens in lockstep with the disk on the low fallback
  // and stays a no-op (1.0) on the high path + every high-tier width bucket → high
  // path byte-identical. Only brightGain is used here (the lensed starfield reads as
  // points; size is left to the shader). The boost is now LIGHTER (see config) since
  // the low tier regained a cheap bloom and ~2× the grains.
  const comp = densityCompensation(particleCount, CFG.diskParticles, lowTier);
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

  // ~one revolution every 1200s (~20 min) — very slow, subtle drift to reveal the lensing warp.
  const STAR_ORBIT_SPEED = (Math.PI * 2) / 1200; // (2π)/1200 ≈ 0.00524 rad/s
  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uStarBright: { value: CFG.starBright * comp.brightGain }, // ×brightGain on the low
    //   tier ONLY (1.0 at full count → stays exactly CFG.starBright): fewer, un-bloomed
    //   star grains accumulate less additive light, so each emits harder to stay visible.
    uHole: { value: 0.12 },
    uRotSpeed: { value: STAR_ORBIT_SPEED },
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
export interface DistantStarRig {
  pts: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  uniforms: Uniforms;
  dispose: () => void;
}
export function buildDistantStar(scene: THREE.Scene, pixelRatio: number): DistantStarRig {
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
