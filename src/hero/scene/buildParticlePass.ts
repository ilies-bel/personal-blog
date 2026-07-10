// Half-resolution particle pass — the fill-rate lever for the heavy soft fields.
//
// THE PROBLEM: the hero is GPU-fill-rate-bound. The ~1.2M-sprite additive gaussian
// disk cloud (plus its ~1.2M-sprite lensed ghost at the black hole) blends tens of
// millions of soft overlapping fragments per frame; the main thread is mostly idle
// while the raster/blend units saturate. Particle COUNT, canvas DPR and bloom
// quality are all pinned (owner constraints) — so the win is to PAINT the same
// field on fewer pixels.
//
// THE SPLIT: the two disk draws are moved onto their own scene LAYER
// (PARTICLE_RT_LAYER) and rendered each frame into an offscreen HalfFloat target
// sized `scale`× the composer's render target (scale 0.5 → ¼ the blended
// fragments). A fullscreen triangle IN THE SCENE then upsample-composites that
// target (bilinear, additive) into the full-res scene render, BEFORE the bloom
// pass reads it — so bloom sees the same total energy field as the single-pass
// path and its thresholds behave identically.
//
// WHY A SCENE OBJECT (not a composer pass): render-order correctness. The rigs
// routed here are additive + depthTest:false + depthWrite:false — they never read
// or write depth. The ONE non-commuting interaction in the scene is the sun-rig
// photosphere MESH (premultiplied alpha, effectively REPLACES what's under it):
// today the cloud draws BEFORE the mesh (lowest object ids in the transparent
// queue), so the mesh occludes the cloud behind it and the swap-band dissolve
// (uMeshFade < 1) blends over live cloud pixels. The composite triangle carries
// renderOrder -1, which slots it EXACTLY where the disk used to sit — before the
// mesh, before everything — so mesh-over-cloud occlusion and the cross-dissolve
// are preserved byte-for-byte in compositing terms. Every other rig is purely
// additive (commutes), and the loop/dome depth tests only ever interact with the
// mesh's depth, which is untouched. Consequently the half-res target needs NO
// depth attachment at all — that is the whole depth story, by construction.
//
// FORMAT: HalfFloatType, matching the composer's scene target, so the additive
// accumulation has the same headroom/precision and the bloom threshold sees the
// same values. Both targets are offscreen → three keys the same Linear-output
// program variants for the disk materials, so routing them here re-uses the exact
// programs the boot warm pass already compiled (zero new disk variants). The one
// NEW program — this composite triangle — lives in the scene graph, so the
// existing renderer.compileAsync(scene, camera) warm pass compiles it under the
// loader with everything else (no mid-scroll compile).
//
// KILL-SWITCH CONTRACT: this rig is only ever CONSTRUCTED when scale < 1
// (createScene short-circuits at scale === 1 — no layer moves, no extra target,
// no composite object, no per-frame branch cost — the original single-pass path,
// byte-identical). ?prtres=1 forces that path for A/B (see resolveParticleRTScale).
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, HalfFloatType, Mesh, PerspectiveCamera, Scene, ShaderMaterial, Sphere, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Rig } from './types';

/** The scene layer the half-res rigs live on. The camera's default mask (layer 0)
 *  excludes them from the composer's RenderPass automatically; renderInto() flips
 *  the camera to this layer for the offscreen pass only. */
export const PARTICLE_RT_LAYER = 1;

export interface ParticlePassRig extends Rig {
  /** The additive upsample-composite fullscreen triangle (a SCENE object, renderOrder
   *  -1 so it occupies the disk's old first-in-the-transparent-queue slot). frame()
   *  toggles `.visible` to whether any half-res rig drew this frame. */
  quad: Mesh;
  /** The offscreen half-res HalfFloat target the heavy rigs render into. */
  target: WebGLRenderTarget;
  /** Resize on the composer's resize path: `scale` × (css size × pixel ratio) —
   *  i.e. it tracks the composer's render-target size (DPR included) automatically. */
  setSize: (w: number, h: number, pixelRatio: number) => void;
  /** Render the PARTICLE_RT_LAYER subset of `scene` into the half-res target.
   *  Saves/restores the renderer's clear colour (the room tint), autoClear, the
   *  bound target and the camera's layer mask — the caller's state is untouched. */
  renderInto: (renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) => void;
  dispose: () => void;
}

export function buildParticlePass(scene: Scene, scale: number): ParticlePassRig {
  // No depth/stencil: every rig routed here is depthTest:false + depthWrite:false
  // (see the header). LinearFilter (the render-target default) gives the bilinear
  // upsample when the full-res composite samples it.
  const target = new WebGLRenderTarget(2, 2, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // Fullscreen triangle (covers clip space; fragments outside the viewport are
  // clipped). The vertex shader writes clip coords directly — the camera transform
  // is bypassed, so the triangle composites 1:1 in screen space.
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geo.boundingSphere = new Sphere(new Vector3(0, 0, 0), 1e6);

  const mat = new ShaderMaterial({
    uniforms: { uTex: { value: target.texture } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // Alpha 1.0 with AdditiveBlending (srcFactor SRC_ALPHA) adds the sampled light
    // at full strength — the same vec4(rgb, 1.0) contract the disk fragment shader
    // itself uses, so the composited energy matches the single-pass path.
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uTex;
      varying vec2 vUv;
      void main(){
        gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0);
      }
    `,
    transparent: true, // joins the transparent queue, where renderOrder -1 leads it
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new Mesh(geo, mat);
  quad.frustumCulled = false;
  quad.renderOrder = -1; // the disk's old slot: first in the transparent queue, under the mesh
  quad.visible = false; // frame() reveals it only when a half-res rig actually drew
  scene.add(quad);

  const setSize = (w: number, h: number, pixelRatio: number): void => {
    target.setSize(
      Math.max(1, Math.round(w * pixelRatio * scale)),
      Math.max(1, Math.round(h * pixelRatio * scale)),
    );
  };

  // Scratch for the clear-colour save/restore (the renderer clears to the per-scene
  // room tint; the particle target must clear to transparent black so the additive
  // composite adds ONLY particle light — the tint would otherwise be added twice).
  const savedClearColor = new Color();

  const renderInto = (
    renderer: WebGLRenderer,
    sceneRef: Scene,
    camera: PerspectiveCamera,
  ): void => {
    const savedMask = camera.layers.mask;
    const savedAlpha = renderer.getClearAlpha();
    const savedAutoClear = renderer.autoClear;
    renderer.getClearColor(savedClearColor);

    camera.layers.set(PARTICLE_RT_LAYER);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.clear(true, false, false); // colour only — the target has no depth/stencil
    renderer.render(sceneRef, camera);

    renderer.setRenderTarget(null);
    renderer.autoClear = savedAutoClear;
    renderer.setClearColor(savedClearColor, savedAlpha);
    camera.layers.mask = savedMask;
  };

  const dispose = (): void => {
    scene.remove(quad);
    geo.dispose();
    mat.dispose();
    target.dispose();
  };

  return { quad, target, setSize, renderInto, dispose };
}
