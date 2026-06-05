// Post-processing chain: render pass -> bloom -> film grade -> nova whiteout.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CFG } from '../lib/config';
import { GradeShader, NovaShader } from '../shaders/post.glsl';

export interface PostRig {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  gradePass: ShaderPass;
  novaPass: ShaderPass;
  render: () => void;
  setSize: (w: number, h: number) => void;
  dispose: () => void;
}
export function buildPostChain(
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
