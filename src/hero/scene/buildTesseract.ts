// Tesseract corridor — a self-contained mini-scene (NOT wired into the heavy hero
// createScene). It owns ONE WebGLRenderer drawing a single fullscreen-quad
// ShaderMaterial that raymarches the infinite nested-frame "bookcase" tunnel
// (tesseract.glsl.ts). The post page mounts it on a <canvas> and drives setLook()
// from the pointer; the handle below owns the rAF loop, the look-lerp, the ambient
// push-in, resize, visibility-pause and disposal — same rig idiom as the other
// build*.ts factories (exported handle interface + dispose).
import * as THREE from 'three';
import { tesseractVertexShader, tesseractFragmentShader } from '../shaders/tesseract.glsl';

/** Public handle returned by buildTesseract — the surface the mounting script uses. */
export interface TesseractRig {
  /** The renderer's canvas. The caller appends it (or passes its own — see options). */
  canvas: HTMLCanvasElement;
  /** Start the rAF loop (lerps look, advances time + push-in, renders each frame). */
  start: () => void;
  /** Stop the rAF loop. Idempotent. The GL context stays alive (call dispose to free). */
  stop: () => void;
  /** Render exactly one frame without starting the loop (reduced-motion / static use). */
  renderOnce: () => void;
  /** Set the pointer look-around TARGET in -1..1 (centre = 0,0). The loop eases toward it. */
  setLook: (x: number, y: number) => void;
  /** Resize the renderer + uniforms to a CSS pixel box (DPR is capped internally). */
  resize: (width: number, height: number) => void;
  /** Tear down: stop the loop, drop listeners, dispose geometry/material/renderer. */
  dispose: () => void;
}

export interface TesseractOptions {
  /** Render into this canvas instead of the renderer creating its own. */
  canvas?: HTMLCanvasElement;
  /** Max device-pixel-ratio (perf cap). Defaults to 2. */
  maxPixelRatio?: number;
  /** Master brightness (keep it dim/atmospheric so the reading text stays readable). */
  dim?: number;
}

export function buildTesseract(options: TesseractOptions = {}): TesseractRig {
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  const dim = options.dim ?? 0.85;

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: false, // the raymarch supersamples its own edges; AA would only cost
    alpha: false, // opaque: the corridor is the bottom layer, nothing behind it
    powerPreference: 'low-power', // it's an ambient backdrop, not the showpiece
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  // A fullscreen quad rendered with a camera-agnostic clip-space vertex shader: the
  // vertex shader writes gl_Position straight from the [-1,1] quad, so the camera's
  // matrices are never used — any camera works. We reuse PerspectiveCamera (the type
  // createScene.ts uses, so it type-checks cleanly under astro-check) purely as an
  // inert render target; its parameters are irrelevant here.
  const camera = new THREE.PerspectiveCamera();

  const uniforms: Record<string, { value: number | THREE.Vector2 }> = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
    uLook: { value: new THREE.Vector2(0, 0) },
    uAdvance: { value: 0 },
    uDim: { value: dim },
    uFrameGap: { value: 1.05 },
    uStreak: { value: 1.1 },
    uCore: { value: 0.7 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: tesseractVertexShader,
    fragmentShader: tesseractFragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  // Pointer look — TARGET (set by the caller) and the eased CURRENT (lerped each frame).
  const lookTarget = new THREE.Vector2(0, 0);
  const lookCurrent = new THREE.Vector2(0, 0);

  let rafId = 0;
  let running = false;
  let lastT = 0;

  const resize = (width: number, height: number): void => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(w, h, false);
    const dpr = renderer.getPixelRatio();
    (uniforms.uResolution.value as THREE.Vector2).set(w * dpr, h * dpr);
    uniforms.uAspect.value = w / h;
  };

  const renderOnce = (): void => {
    renderer.render(scene, camera);
  };

  const frame = (now: number): void => {
    if (!running) return;
    const dt = lastT === 0 ? 0.016 : Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // Ease the look toward the pointer target (smooth peer-around, never snaps).
    lookCurrent.x += (lookTarget.x - lookCurrent.x) * 0.06;
    lookCurrent.y += (lookTarget.y - lookCurrent.y) * 0.06;
    (uniforms.uLook.value as THREE.Vector2).copy(lookCurrent);

    uniforms.uTime.value = (uniforms.uTime.value as number) + dt;
    // Ambient push-in along Z. Wraps within one frame gap so the march never drifts
    // out of float precision over a long session (the structure is Z-periodic anyway).
    const gap = uniforms.uFrameGap.value as number;
    let adv = (uniforms.uAdvance.value as number) + dt * 0.16;
    if (adv > gap) adv -= gap;
    uniforms.uAdvance.value = adv;

    renderer.render(scene, camera);
    rafId = window.requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    lastT = 0;
    rafId = window.requestAnimationFrame(frame);
  };

  const stop = (): void => {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const setLook = (x: number, y: number): void => {
    lookTarget.set(x, y);
  };

  // Pause the loop when the tab is hidden (don't burn GPU on a backdrop nobody sees).
  const onVisibility = (): void => {
    if (document.hidden) {
      stop();
    } else if (!running) {
      start();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const dispose = (): void => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    quad.geometry.dispose();
    material.dispose();
    scene.remove(quad);
    renderer.dispose();
  };

  return { canvas, start, stop, renderOnce, setLook, resize, dispose };
}
