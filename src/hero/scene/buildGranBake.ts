// Red-giant granulation CUBEMAP bake — the vertex-bound-red-giant fix.
//
// THE PROBLEM: the settled red giant is VERTEX-bound (~37fps, DPR-independent).
// Its vertex shader evaluated, per vertex per frame, the full multi-scale
// granulation: cellular() (a 27-cell hash loop), warpFbm() (16 value-noise
// evals), fbm() — for ~1.2M vertices, every frame.
//
// THE KEY FACT: on the red giant that granulation is deliberately a PURE RIGID
// function of the spun sphere direction (disk.glsl.ts zeroes the churn drift via
// the rotation-lock; the spin enters ONLY by rotating the sample direction). So
// f(R(t)·d) — the analytic per-frame evaluation — equals bake(R(t)·d): the same
// fixed pattern, rigidly rotated. We therefore render the scalar field ONCE into
// a cubemap at boot (six tiny GPU draws, under the loader, following the GPGPU
// collapse-bake precedent) and the disk vertex shader replaces the whole noise
// block with ONE textureCube fetch of the spun direction. Byte-near-identical up
// to texture resolution; the analytic block STAYS in the shader for the other
// consumers (nebula boil / explosion turbulence, which need real time-evolution)
// and as the not-yet-baked / kill-switched fallback.
//
// CHANNELS (RGBA16F — half-float keeps the [0,1.3] gran range at far-sub-visual
// precision, and RGBA is universally renderable under EXT_color_buffer_float):
//   .r = granField(dir)        — the granulation scalar (heat = gran, relief = f(gran))
//   .g = granPhotoField(dir).x — the photosphere mottle m (vSunM; ~54 simplex evals,
//        the DOMINANT per-vertex cost — also rotation-locked: tt = 0 on the giant)
//   .b = granPhotoField(dir).y — the veins/sunspot darkening (vSunDark)
//   .a = granRaggedBase(dir)   — the collapse eating-front's pure-direction part
//        (fbm(dir*7.5+4) fringe + fbm(dir*2.3+11) lobes; also time-free)
// Both recipes come from the SAME exported GLSL snippets the disk vertex shader
// interpolates (GRAN_NOISE_GLSL / GRAN_FIELD_GLSL in shaders/disk.glsl.ts), so
// the two shaders can never drift.
//
// FACE SIZE 512: the granulation's finest features (uGranScale 26 cells/rad ≈
// 2.2°/cell) span ~12+ texels at 512²/face (~0.18°/texel), and the A/B parity
// screenshots (limb silhouette + dark intergranular lanes, baked vs analytic vs
// an analytic-reload noise floor) confirmed 512 is indistinguishable — so we
// stay at 512 (6 × 512² × 8B = 12.6 MB, trivial next to the sim flipbook).
//
// FAILURE CONTRACT: bake() is idempotent, wrapped in try/catch, and NEVER flips
// anything itself — the caller flips uGranBakeReady only when isBaked() reports
// success, so any failure (lost context, missing float-renderability) simply
// leaves the analytic path running: today's exact rendering.
import { BufferAttribute, BufferGeometry, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, Sphere, Texture, Vector3, WebGLCubeRenderTarget, WebGLRenderer } from 'three';
import { GRAN_FIELD_GLSL, GRAN_NOISE_GLSL, SUN_NOISE_GLSL } from '../shaders/disk.glsl';
import type { Rig } from './types';

/** Cube face edge in texels. See the face-size note in the header. */
export const GRAN_BAKE_FACE_SIZE = 512;

export interface GranBakeRig extends Rig {
  /** The baked cubemap (the render target's texture). Valid AFTER isBaked(). */
  texture: Texture;
  /** Render all six faces (idempotent — later calls are no-ops, success or fail).
   *  Six tiny fullscreen draws; the GPU does the noise math once, off the hot path. */
  bake: () => void;
  /** True only after a SUCCESSFUL bake — the caller's gate for uGranBakeReady. */
  isBaked: () => boolean;
  dispose: () => void;
}

export function buildGranBake(
  renderer: WebGLRenderer,
  granScale: number,
  size: number = GRAN_BAKE_FACE_SIZE,
): GranBakeRig {
  // No depth, no mips: the disk samples this from a VERTEX shader (implicit lod 0),
  // so mip levels would never be read. Linear filtering is core for 16F in WebGL2,
  // and WebGL2 cube sampling is seamless across face edges by spec.
  const target = new WebGLCubeRenderTarget(size, {
    format: RGBAFormat,
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // Fullscreen triangle (same construction as buildParticlePass's composite quad):
  // clip coords written directly, camera transform bypassed.
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geo.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e6);

  const mat = new ShaderMaterial({
    uniforms: {
      uGranScale: { value: granScale },
      uFace: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // The EXACT shared recipe — GRAN_NOISE_GLSL + GRAN_FIELD_GLSL are the same
    // snippets the disk vertex shader interpolates. faceDir() is the inverse of
    // the GL cube-map face-selection table (ES 3.0 §3.8.10): given the face and
    // the texel's (s,t), reconstruct the sampling direction — so a later
    // textureCube(dir) fetch returns exactly the value baked for that dir.
    // Baked with churn = vec3(0): the red giant's rotation-locked value.
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uGranScale;
      uniform float uFace; // 0..5 = +X,-X,+Y,-Y,+Z,-Z (three's setRenderTarget face order)
      varying vec2 vUv;
      ${GRAN_NOISE_GLSL}
      ${SUN_NOISE_GLSL}
      ${GRAN_FIELD_GLSL}
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
        vec2 photo = granPhotoField(dir, 0.0); // tt = 0: the red giant's rotation-locked value
        gl_FragColor = vec4(granField(dir, vec3(0.0), uGranScale), photo, granRaggedBase(dir));
      }
    `,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new Mesh(geo, mat);
  quad.frustumCulled = false;
  const bakeScene = new Scene();
  bakeScene.add(quad);
  // Dummy camera — the vertex shader writes clip coords directly.
  const bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
      // Leave `baked` false: the caller never flips uGranBakeReady, so the disk
      // keeps the analytic path — a failed bake can never break the rendering.
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
