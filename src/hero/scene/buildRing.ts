// Photon-ring rig (thin circle at the shadow rim).
import * as THREE from 'three';
import { CFG } from '../lib/config';
import { ringVertexShader, ringFragmentShader } from '../shaders/ring.glsl';
import type { Uniforms, UniformRig } from './types';

export interface RingRig extends UniformRig {
  pts: THREE.Points; // the ring band (frame toggles .visible)
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  uniforms: Uniforms;
  dispose: () => void;
}
export function buildRing(scene: THREE.Scene, pixelRatio: number): RingRig {
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
