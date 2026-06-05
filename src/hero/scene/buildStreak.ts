// Hyperspace-streak rig — the Star Wars "jump to lightspeed" the NEBULA itself makes
// as the camera dezooms out to the beginning dot. Each streak is a real 2-vertex
// LINE SEGMENT anchored at a point inside the nebula's own gas volume: the inner
// vertex sits at that gas point's projected screen position, and the outer vertex
// stretches radially outward from the vanishing point (screen centre) so the gas
// grain trails into a long clean lane that can reach the frame edge — the dots
// themselves trail (there is no synthetic separate field). Sparse by construction
// (a few hundred lanes) so the field reads as separated streaks on black, not a
// fur ball. See shaders/streak.glsl for the projection + stretch.
import * as THREE from 'three';
import { CFG } from '../lib/config';
import { streakVertexShader, streakFragmentShader } from '../shaders/streak.glsl';
import type { Uniforms } from './types';

export interface StreakRig {
  seg: THREE.LineSegments; // the streak field (frame toggles .visible)
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  uniforms: Uniforms;
  dispose: () => void;
}

// nebula extent — mirrors the disk shader's nebula block (NR = uGiantR * 1.30,
// ELL = the flattened ellipsoid) so the streak anchors live in the SAME volume the
// gas occupies. Kept in sync with disk.glsl's nebula placement.
const GIANT_R = 4.2;
const NR = GIANT_R * 1.3;
const ELL = new THREE.Vector3(1.55, 0.78, 1.15);

export function buildStreak(scene: THREE.Scene, _particleCount: number, pixelRatio: number): StreakRig {
  // Sparse: a few hundred distinct lanes. Independent of the particle budget — the
  // look wants separated streaks, not density. Each streak is one line segment.
  const STREAKS = 520;
  const V = STREAKS * 2;
  const anchor = new Float32Array(V * 3); // world-space gas anchor (shared by both verts)
  const seed = new Float32Array(V);
  const end = new Float32Array(V); // 0 = inner (at the gas point), 1 = outer (stretched out)
  for (let i = 0; i < STREAKS; i++) {
    // a hashed point inside the nebula ellipsoid volume (rim-biased a touch so the
    // lanes spread across the frame rather than clustering dead-centre).
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const sp = Math.sqrt(Math.max(0, 1 - u * u));
    const rad = NR * (0.25 + 0.75 * Math.cbrt(Math.random())); // volume-even-ish, rim-biased
    const x = sp * Math.cos(phi) * ELL.x * rad;
    const y = u * ELL.y * rad;
    const z = sp * Math.sin(phi) * ELL.z * rad;
    const sd = Math.random();
    const i0 = i * 2;
    const i1 = i0 + 1;
    anchor[i0 * 3] = x; anchor[i0 * 3 + 1] = y; anchor[i0 * 3 + 2] = z;
    anchor[i1 * 3] = x; anchor[i1 * 3 + 1] = y; anchor[i1 * 3 + 2] = z;
    seed[i0] = sd; seed[i1] = sd;
    end[i0] = 0; end[i1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(anchor, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7);

  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uAspect: { value: 1.0 },
    uStreak: { value: 0 }, // 0 = no jump, 1 = full lightspeed
    uStreakDir: { value: 1 }, // +1 stretch OUT (toward the dot), -1 pull IN (toward nebula)
  };
  void CFG;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: streakVertexShader,
    fragmentShader: streakFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const seg = new THREE.LineSegments(geo, mat);
  seg.frustumCulled = false;
  seg.visible = false; // off until the nebula→dot jump
  scene.add(seg);

  const dispose = (): void => {
    scene.remove(seg);
    geo.dispose();
    mat.dispose();
  };

  return { seg, geo, mat, uniforms, dispose };
}
