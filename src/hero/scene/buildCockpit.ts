// Cockpit canopy rig. The structural hull and all trim junctions are authored
// once, flattened to a single RGBA plate, and composited after the main post
// chain. Runtime never assembles the frame from intersecting strokes.
//
// The plate is also the exact image used by CockpitFrame.tsx for reduced
// motion. Live WebGL adds only a restrained solid-colour response to the
// lifecycle light; because this private scene renders after bloom, the plate
// cannot glow. The moving white HUD remains a separate lightweight mesh.
import * as THREE from 'three';
import { COCKPIT_H, COCKPIT_PLATE_URL, COCKPIT_W } from '../cockpitPlate';
import {
  cockpitHudFragmentShader,
  cockpitHudVertexShader,
  cockpitPlateFragmentShader,
  cockpitPlateVertexShader,
} from '../shaders/cockpit.glsl';
import { buildHudGeometry } from './cockpitHud';
import type { Rig, Uniforms } from './types';

export interface CockpitRig extends Rig {
  /** Update projected light, lifecycle state, render clock and power state. */
  frame(ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean, nova: number): void;
  /** Composite over the graded canvas. No-op while fully cloaked. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
}

const HUD_WHITE = new THREE.Color(0.88, 0.92, 0.99);

// Chapter light keys mirror the lifecycle colour without changing cockpit
// topology. Values are interpolated into the preallocated scratch colour.
const STAR_KEYS: ReadonlyArray<{ s: number; c: [number, number, number]; i: number }> = [
  { s: 0.0, c: [0.88, 0.86, 0.8], i: 0.85 },
  { s: 0.5, c: [1.0, 1.0, 1.0], i: 1.35 },
  { s: 1.6, c: [1.0, 0.6, 0.36], i: 1.05 },
  { s: 2.9, c: [1.0, 0.84, 0.52], i: 1.2 },
  { s: 4.0, c: [0.78, 0.85, 1.0], i: 0.85 },
  { s: 4.5, c: [0.74, 0.82, 1.0], i: 0.72 },
];

function starLightAt(stage: number, outColor: THREE.Color): number {
  let a = STAR_KEYS[0];
  let b = STAR_KEYS[STAR_KEYS.length - 1];
  for (let i = 0; i < STAR_KEYS.length - 1; i++) {
    if (stage >= STAR_KEYS[i].s && stage <= STAR_KEYS[i + 1].s) {
      a = STAR_KEYS[i];
      b = STAR_KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(1e-5, b.s - a.s);
  const k = Math.min(1, Math.max(0, (stage - a.s) / span));
  outColor.setRGB(
    a.c[0] + (b.c[0] - a.c[0]) * k,
    a.c[1] + (b.c[1] - a.c[1]) * k,
    a.c[2] + (b.c[2] - a.c[2]) * k,
  );
  return a.i + (b.i - a.i) * k;
}

function buildPlateGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([0, 0, 0, COCKPIT_W, 0, 0, COCKPIT_W, COCKPIT_H, 0, 0, COCKPIT_H, 0]),
      3,
    ),
  );
  // TextureLoader flips image data on upload. These UVs preserve the SVG's
  // top-left design-space origin when sampled by the full-screen quad.
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
  return geometry;
}

const overlayMatOpts = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide,
} as const;

export function buildCockpit(): CockpitRig {
  const overlay = new THREE.Scene();

  const shared = {
    uDecloak: { value: 0 },
    uHudDeploy: { value: 0 },
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector2(COCKPIT_W / 2, COCKPIT_H * 0.43) },
    uStarColor: { value: new THREE.Color(0.88, 0.86, 0.8) },
    uStarIntensity: { value: 0.65 },
    uNova: { value: 0 },
    uAlpha: { value: 0 },
    uHalfW: { value: 0.55 },
  };

  // One texture, one structural draw. No runtime stroke extrusion, patches,
  // or per-junction meshes exist in this path.
  const plateTexture = new THREE.TextureLoader().load(COCKPIT_PLATE_URL);
  plateTexture.generateMipmaps = false;
  plateTexture.minFilter = THREE.LinearFilter;
  plateTexture.magFilter = THREE.LinearFilter;

  const plateGeo = buildPlateGeometry();
  const plateUniforms: Uniforms = { ...shared, uPlate: { value: plateTexture } };
  const plateMat = new THREE.ShaderMaterial({
    uniforms: plateUniforms,
    vertexShader: cockpitPlateVertexShader,
    fragmentShader: cockpitPlateFragmentShader,
    ...overlayMatOpts,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.frustumCulled = false;
  plate.renderOrder = 40;
  plate.visible = false;
  overlay.add(plate);

  const hudGeo = buildHudGeometry();
  const hudUniforms: Uniforms = { ...shared, uHud: { value: HUD_WHITE.clone() } };
  const hudMat = new THREE.ShaderMaterial({
    uniforms: hudUniforms,
    vertexShader: cockpitHudVertexShader,
    fragmentShader: cockpitHudFragmentShader,
    ...overlayMatOpts,
  });
  const hud = new THREE.Mesh(hudGeo, hudMat);
  hud.frustumCulled = false;
  hud.renderOrder = 41;
  hud.visible = false;
  overlay.add(hud);

  const meshes = [plate, hud];

  let decloak = 0;
  let animFrom = 0;
  let animStart = -1;
  let target: boolean | null = null;
  const scratchColor = new THREE.Color();

  const frame = (
    ndcX: number,
    ndcY: number,
    stage: number,
    t: number,
    hudActive: boolean,
    nova: number,
  ): void => {
    if (target === null || hudActive !== target) {
      target = hudActive;
      animFrom = decloak;
      animStart = t;
    }

    const dur = target ? 1.8 : 0.8;
    const raw = Math.min(1, Math.max(0, (t - animStart) / dur));
    const e = target ? raw * (0.85 + 0.15 * raw) : raw * raw;
    decloak = animFrom + ((target ? 1 : 0) - animFrom) * e;

    const on = decloak > 0.001;
    plate.visible = on;
    hud.visible = on;
    if (!on) return;

    shared.uDecloak.value = decloak;
    shared.uHudDeploy.value = Math.min(1, Math.max(0, (decloak - 0.46) / 0.48));
    shared.uTime.value = t;
    shared.uAlpha.value = 1;
    shared.uNova.value = nova;

    const lx = Math.max(-200, Math.min(COCKPIT_W + 200, (ndcX * 0.5 + 0.5) * COCKPIT_W));
    const ly = Math.max(-200, Math.min(COCKPIT_H + 200, (1 - (ndcY * 0.5 + 0.5)) * COCKPIT_H));
    (shared.uLight.value as THREE.Vector2).set(lx, ly);
    shared.uStarIntensity.value = starLightAt(stage, scratchColor);
    (shared.uStarColor.value as THREE.Color).copy(scratchColor);

    // Only the moving HUD uses this physical half-pixel width. The plate's
    // authored widths are already baked at the 1920×1080 design resolution.
    shared.uHalfW.value = 0.5 * (COCKPIT_H / window.innerHeight);
  };

  const render = (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void => {
    if (decloak <= 0.001) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(overlay, camera);
    renderer.autoClear = prevAutoClear;
  };

  const dispose = (): void => {
    for (const mesh of meshes) overlay.remove(mesh);
    plateGeo.dispose();
    hudGeo.dispose();
    plateMat.dispose();
    hudMat.dispose();
    plateTexture.dispose();
  };

  return { frame, render, dispose };
}
