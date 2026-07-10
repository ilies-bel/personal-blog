// Tangential warp-arc rig (background light bent around the shadow).
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, Scene, ShaderMaterial, Sphere, UniformsUtils, Vector3 } from 'three';
import { CFG } from '../lib/config';
import { warpVertexShader, warpFragmentShader } from '../shaders/warp.glsl';
import type { Uniforms, UniformRig } from './types';

export interface WarpRig extends UniformRig {
  seg: LineSegments; // primary arc image
  seg2: LineSegments; // secondary arc image
  geo: BufferGeometry;
  mat: ShaderMaterial;
  matSec: ShaderMaterial; // secondary material (cloned uniforms, sign -1)
  uniforms: Uniforms; // primary's shared block (matSec clones it)
  dispose: () => void;
}
export function buildWarp(scene: Scene, particleCount: number): WarpRig {
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
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(warpPos, 3));
  geo.setAttribute('aSeed', new BufferAttribute(warpSeed, 1));
  geo.setAttribute('aS', new BufferAttribute(warpSPar, 1));
  geo.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e7);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uShadowR: { value: 0.1 },
    uThetaE: { value: 0.15 },
    uAspect: { value: 1.0 },
    uImageSign: { value: 1.0 },
    uWarp: { value: CFG.warp },
    uHole: { value: 0.12 },
  };
  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: warpVertexShader,
    fragmentShader: warpFragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const matSec = mat.clone();
  matSec.uniforms = UniformsUtils.clone(uniforms);
  matSec.uniforms.uImageSign.value = -1.0;

  const seg = new LineSegments(geo, mat);
  seg.frustumCulled = false;
  scene.add(seg);
  const seg2 = new LineSegments(geo, matSec);
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
