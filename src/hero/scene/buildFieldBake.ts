// Generic pure-direction-field CUBEMAP bake — the buildGranBake precedent,
// factored so the supernova blast-field bake (buildBlastBake) and the low-tier
// yellow-star photosphere bake (buildSunBake) share one rig instead of each
// re-implementing the six-face render loop.
//
// THE PATTERN (see buildGranBake.ts for the full story): a shader field that is
// a PURE function of a unit direction can be rendered ONCE into a cubemap (six
// tiny fullscreen draws, off the critical path) and the hot shader's noise
// stack replaced by ONE textureCube fetch. bake() is idempotent, wrapped in
// try/catch, and NEVER flips anything itself — the caller flips the shader's
// `u*BakeReady` uniform only when isBaked() reports success, so any failure
// (lost context, missing float renderability) leaves the analytic path running:
// today's exact rendering.
//
// FORMAT: RGBA16F (HalfFloatType) — all baked fields live in small ranges
// around [0, 1.6], far-sub-visual precision at half float, and RGBA16F is
// universally renderable under WebGL2's EXT_color_buffer_float (the same
// contract the granulation bake already ships on all tiers). No mips, no depth:
// consumers sample at implicit lod 0 (vertex stage or a coarse fragment field).
import * as THREE from 'three';
import type { Rig } from './types';

export interface FieldBakeRig extends Rig {
  /** The baked cubemap (the render target's texture). Valid AFTER isBaked(). */
  texture: THREE.Texture;
  /** Render all six faces (idempotent — later calls are no-ops, success or fail). */
  bake: () => void;
  /** True only after a SUCCESSFUL bake — the caller's gate for the ready uniform. */
  isBaked: () => boolean;
  dispose: () => void;
}

/**
 * Build a cubemap bake rig for a pure function of direction.
 *
 * @param renderer  the live WebGL2 renderer (callers gate on isWebGL2).
 * @param size      cube face edge in texels.
 * @param fieldGlsl GLSL snippet(s) declaring `vec4 bakeField(vec3 dir)` — the
 *                  exact shared recipe the consuming shader also interpolates,
 *                  so the baked and analytic paths can never drift.
 */
export function buildFieldBake(
  renderer: THREE.WebGLRenderer,
  size: number,
  fieldGlsl: string,
): FieldBakeRig {
  const target = new THREE.WebGLCubeRenderTarget(size, {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // Fullscreen triangle (same construction as buildGranBake / buildParticlePass):
  // clip coords written directly, camera transform bypassed.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFace: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // faceDir() is the inverse of the GL cube-map face-selection table (ES 3.0
    // §3.8.10): given the face and the texel's (s,t), reconstruct the sampling
    // direction — so a later textureCube(dir) fetch returns exactly the value
    // baked for that dir. Identical to buildGranBake's table.
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uFace; // 0..5 = +X,-X,+Y,-Y,+Z,-Z (three's setRenderTarget face order)
      varying vec2 vUv;
      ${fieldGlsl}
      vec3 faceDir(float face, vec2 st){
        vec2 uv = st * 2.0 - 1.0;                       // (sc, tc) in [-1, 1]
        if(face < 0.5)      return vec3( 1.0, -uv.y, -uv.x); // +X
        else if(face < 1.5) return vec3(-1.0, -uv.y,  uv.x); // -X
        else if(face < 2.5) return vec3( uv.x,  1.0,  uv.y); // +Y
        else if(face < 3.5) return vec3( uv.x, -1.0, -uv.y); // -Y
        else if(face < 4.5) return vec3( uv.x, -uv.y,  1.0); // +Z
        else                return vec3(-uv.x, -uv.y, -1.0); // -Z
      }
      void main(){
        vec3 dir = normalize(faceDir(uFace, vUv));
        gl_FragColor = bakeField(dir);
      }
    `,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  const bakeScene = new THREE.Scene();
  bakeScene.add(quad);
  // Dummy camera — the vertex shader writes clip coords directly.
  const bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let attempted = false;
  let baked = false;

  const bake = (): void => {
    if (attempted) return; // idempotent — one attempt settles it (success OR failure)
    attempted = true;
    const savedTarget = renderer.getRenderTarget();
    const savedAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = false; // the triangle covers every texel — no clear needed
      for (let face = 0; face < 6; face++) {
        mat.uniforms.uFace.value = face;
        renderer.setRenderTarget(target, face);
        renderer.render(bakeScene, bakeCamera);
      }
      baked = true;
    } catch {
      // Leave `baked` false: the caller never flips the ready uniform, so the
      // consumer keeps the analytic path — a failed bake can never break rendering.
    } finally {
      renderer.setRenderTarget(savedTarget);
      renderer.autoClear = savedAutoClear;
    }
  };

  const isBaked = (): boolean => baked;

  const dispose = (): void => {
    bakeScene.remove(quad);
    geo.dispose();
    mat.dispose();
    target.dispose();
  };

  return { texture: target.texture, bake, isBaked, dispose };
}
