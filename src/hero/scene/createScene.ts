// The scene controller: builds renderer/camera + all rigs, runs the per-frame loop, tears down.
import * as THREE from 'three';
import { CFG, tuneParticlesForDevice, tuneRenderPixelRatio } from '../lib/config';
import { DEBUG_WINDOW_KEYS, SCENE_READY_EVENT, readDebugNumber } from '../lib/constants';
import { lifecycle, easeOut, smoothstep01, type StarState } from '../lifecycle';
import { GIANT_RADIUS_SCALE, YELLOW_RED_RADIUS_RATIO } from '../transitions';
import { buildGravitySim, type GravitySim } from '../gravitySim';
import { cameraPoseForProgress, progressForLegacyStage } from '../timeline';
import { settledIdForStage } from '../sceneTable';
import { STAR_BACK_BASE_BRIGHT, buildSunRig } from './buildSunRig';
import { buildDisk } from './buildDisk';
import { buildStarfield, buildDistantStar } from './buildStarfield';
import { buildWarp } from './buildWarp';
import { buildStreak } from './buildStreak';
import { buildRing } from './buildRing';
import { buildPostChain } from './buildPostChain';
import type { SceneHandle, SceneHooks } from './types';

/**
 * The few frame-local STATEFUL multipliers applyLook needs that are NOT pure
 * functions of `look` alone. They are resolved each frame (from the focusGlow
 * ease, the gravity-sim sample, the streak latch and the debug overrides) and
 * passed IN so applyLook stays a single straight `look → uniforms` projection
 * with no recomputation. A single instance is created once and MUTATED in place
 * each frame, so calling applyLook allocates nothing on the hot path.
 */
interface ApplyLookCtx {
  /** disk emission multiplier from the HUD focus ease (1 + focusGlow*0.18). */
  focusEmission: number;
  /** bloom multiplier from the HUD focus ease (1 + focusGlow*0.12). */
  focusBloom: number;
  /** dome-star brightness multiplier from the HUD focus ease (1 + focusGlow*0.08). */
  focusDome: number;
  /** hyperspace gas dim (1 - 0.6*streakValue), latched in frame(). */
  streakGasDim: number;
  /** resolved disk uSimBlend after the gravity-sim sample (0 if no sample). */
  simBlend: number;
  /** red-giant uGiantScale after the giantSize debug override. */
  giantScale: number;
  /** nebula uNebLight after the nebLight debug override. */
  nebLight: number;
  /** debug-only additive bloom (nebulaFlash * 0.18); 0 in normal play. */
  nebulaFlashBloom: number;
}

export function createScene(container: HTMLElement, reduced: boolean, hooks: SceneHooks): SceneHandle {
  const diskParticles = tuneParticlesForDevice();
  const bCritShadow = 2.598; // (3√3/2) rs — shadow radius (informational)
  void bCritShadow;

  // --- renderer / scene / camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(tuneRenderPixelRatio(reduced));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fovDeg, window.innerWidth / window.innerHeight, 0.1, 4000);
  // ---- renderers ----
  // Each piece (disk / starfield / warp arcs / photon ring / post chain) is now
  // built by its own build*() factory above (mirroring buildSunRig). The rigs own
  // their geometry, materials and disposal; createScene just wires them into the
  // resize/frame loops below. The shared uniform blocks + sub-objects are pulled
  // out into the same local names the loop already used, so the per-frame writes
  // and updateLensUniforms() stay byte-for-byte identical.
  const pixelRatio = renderer.getPixelRatio();

  const diskRig = buildDisk(scene, diskParticles, pixelRatio);
  const diskMatPrimary = diskRig.primary;
  const diskMatSecondary = diskRig.secondary;
  const diskPrimary = diskRig.primaryPts;
  const diskSecondary = diskRig.secondaryPts;

  const starRig = buildStarfield(scene, diskParticles, pixelRatio);
  const starUniforms = starRig.uniforms; // updateLensUniforms() writes through this
  const starMat = starRig.mat;
  const starMatSec = starRig.matSec;
  const starPts = starRig.pts;
  const starSecPts = starRig.secPts;

  const distantStarRig = buildDistantStar(scene, pixelRatio);
  const distantStarUniforms = distantStarRig.uniforms;
  const distantStarPts = distantStarRig.pts;

  const warpRig = buildWarp(scene, diskParticles);
  const warpUniforms = warpRig.uniforms; // updateLensUniforms() writes through this
  const warpMat = warpRig.mat;
  const warpMatSec = warpRig.matSec;
  const warpSeg = warpRig.seg;
  const warpSeg2 = warpRig.seg2;

  // hyperspace streak rig: the nebula's own gas grains trail into Star Wars lanes
  // during the dezoom out to the beginning dot (off outside that window).
  const streakRig = buildStreak(scene, diskParticles, pixelRatio);
  const streakUniforms = streakRig.uniforms;
  const streakMat = streakRig.mat;
  const streakSeg = streakRig.seg;

  const ringRig = buildRing(scene, pixelRatio);
  const ringUniforms = ringRig.uniforms; // updateLensUniforms() writes through this
  const ringMat = ringRig.mat;
  const ringPts = ringRig.pts;

  const postRig = buildPostChain(renderer, scene, camera);
  const bloom = postRig.bloom;
  const gradePass = postRig.gradePass;
  const novaPass = postRig.novaPass;

  // --- yellow-star sun rig (revealed only during the yellow stage) ---
  // The yellow star is a small anchor the red giant CONTRACTS into. The red giant's
  // TRUE world radius is uGiantR (4.2) × uGiantScale (GIANT_RADIUS_SCALE) = 10.5 units
  // (the held medium-dense giant). So the dying star lands at 10.5 × 0.18 ≈ 1.89 — the
  // exact size the cloud shrinks to. The grow factor in the vertex shader
  // (`mix(0.18, 1.0, uYrGrow)`) MUST equal this YELLOW_RED_RADIUS_RATIO so the gold
  // particle sphere is size-matched to the mesh at the swap (no pop); the shader
  // interpolates the SAME constant in (see disk.glsl.ts). The held-giant scale is the
  // single source GIANT_RADIUS_SCALE (shared with buildDisk + lifecycle's GIANT_FULL).
  const RED_GIANT_RADIUS = 4.2 * GIANT_RADIUS_SCALE; // = 10.5; uGiantR × uGiantScale (held giant)
  const SUN_RIG_RADIUS = RED_GIANT_RADIUS * YELLOW_RED_RADIUS_RATIO; // dying star: small grow anchor
  const sunRig = buildSunRig(scene, SUN_RIG_RADIUS, renderer.getPixelRatio());

  // --- GPGPU gravitational collapse (nebula → yellow star) ---
  // A stateful N-body-style gravity sim (see gravitySim.ts): particles accelerate under
  // a softened central well + curl turbulence and accrete onto the core — genuinely
  // chaotic/organic, not a symmetric formula. The collapse is BAKED to a flipbook
  // once at load (gravitySim.bake) and scrubbed by blending the two snapshots
  // bracketing the scroll position (gravitySim.sampleAt) — a pure function of scroll,
  // so it scrubs both directions with no state/replay/snap-back. Seeded from the SAME
  // analytic nebula placement the disk shader uses, so it starts pop-free. Skipped under
  // reduced motion; {available:false} (no-op) if float targets are unsupported.
  const gravitySim: GravitySim = reduced
    ? { available: false, step: () => {}, bake: () => {}, isBaked: () => false, sampleAt: () => null, dispose: () => {} }
    : buildGravitySim({
        renderer,
        count: diskRig.count,
        aSeed: diskRig.aSeed,
        aU: diskRig.aU,
        aPhase: diskRig.aPhase,
        giantR: diskMatPrimary.uniforms.uGiantR.value as number,
        coreR: SUN_RIG_RADIUS,
        halfFloat: diskParticles <= 240_000,
      });

  // --- lens uniforms (recomputed each frame from camera geometry) ---
  function updateLensUniforms(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const fovY = THREE.MathUtils.degToRad(camera.fov);
    const cameraDistance = camera.position.length();
    const shadowAng = CFG.coreSize / cameraDistance;
    const ndcShadow = shadowAng / Math.tan(fovY / 2);
    const thetaE = ndcShadow * CFG.lens;
    // dev: holeScale resizes the interior blackout sphere (the dark shadow disc).
    // The disk carve, the star/warp inner cutoff and the ring radius all key off
    // uHole, so this scales the whole void consistently.
    const holeR = ndcShadow * CFG.holeFactor;
    const starThetaE = holeR * 1.55;
    const pixelRatio = renderer.getPixelRatio();

    for (const m of [diskMatPrimary, diskMatSecondary]) {
      m.uniforms.uAspect.value = aspect;
      m.uniforms.uShadowR.value = ndcShadow;
      m.uniforms.uThetaE.value = thetaE;
      m.uniforms.uHole.value = holeR;
      m.uniforms.uPixelRatio.value = pixelRatio;
    }
    ringUniforms.uShadowR.value = ndcShadow;
    ringUniforms.uAspect.value = aspect;
    ringUniforms.uHole.value = holeR;
    ringUniforms.uPixelRatio.value = pixelRatio;
    for (const u of [starUniforms, starMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
      u.uPixelRatio.value = pixelRatio;
    }
    distantStarUniforms.uShadowR.value = ndcShadow;
    distantStarUniforms.uThetaE.value = starThetaE;
    distantStarUniforms.uHole.value = holeR;
    distantStarUniforms.uAspect.value = aspect;
    distantStarUniforms.uPixelRatio.value = pixelRatio;
    for (const u of [warpUniforms, warpMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
    }
    streakUniforms.uAspect.value = aspect;
    streakUniforms.uPixelRatio.value = pixelRatio;
  }

  function onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(tuneRenderPixelRatio(reduced));
    renderer.setSize(w, h);
    postRig.setSize(w, h); // composer.setSize + bloom.setSize, co-located in the rig
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gradePass.uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    novaPass.uniforms.uAspect.value = w / h;
    updateLensUniforms();
  }
  window.addEventListener('resize', onResize);

  // --- animation: intro dezoom travelling, then slow rotation drift ---
  // The camera starts close (CFG.camDist * NEAR_FACTOR) and eases out to its
  // resting distance over INTRO_DUR seconds, once. After that it keeps a slow
  // azimuth rotation forever. A gentle pointer parallax rides on top.
  const NEAR_FACTOR = 0.42; // how close the travelling begins (× resting distance)
  const INTRO_DUR = 6.0; // seconds for the dezoom
  const ROTATE_SPEED = 0.018; // rad/s of resting drift
  // Red-giant axial spin: ~one rotation per 180 s on its tilted pole (2π/180). Slow
  // and cinematic — 3× slower than before — the surface barely rolls, the camera no
  // longer orbits it (see the red-giant orbit freeze below).
  const RED_GIANT_SPIN_RATE = (Math.PI * 2) / 180; // rad/s
  // Red-giant off-centre framing now lives ENTIRELY in the camera keyframes (timeline's
  // RED_COMPOSITION → COLLAPSE_PULL → SUPERNOVA_RECOIL): the camera flies from the yellow
  // hold to the corner in ONE continuous travel, holds + starts collapsing there, then
  // drifts monotonically toward centre through the supernova into the (unchanged)
  // black-hole ending. There is no separate "park" add any more — that bolt-on
  // double-offset on top of the keyframes and ramped out mid-collapse, which is what made
  // the camera read as centre→corner→centre.
  // These bands are used ONLY by the dev framing-nudge hooks (RedGiantDebugPanel): they
  // shape the in/out weight of a live tuning nudge so it matches the beat and never
  // snaps. Production applies no nudge (the hooks are unset).
  const RED_GIANT_NUDGE_IN: readonly [number, number] = [0.46, 0.514];
  const RED_GIANT_NUDGE_OUT: readonly [number, number] = [0.62, 0.70];

  let mouseX = 0;
  let mouseY = 0;
  const onPointerMove = (e: PointerEvent): void => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };
  if (!reduced) window.addEventListener('pointermove', onPointerMove);

  // --- CLICK ERUPTIONS on the idle star (geyser plume + surface ripple) ------
  // Clicking the fully-formed sun-rig mesh fires a prominence at the click point: a
  // bright plume off the limb plus an expanding ripple across the photosphere. Hold
  // LONGER → bigger eruption (taller plume, wider/stronger ripple), capped at ~1.5s.
  // The whole interaction lives in the scene layer (like the pointermove parallax) —
  // no React. A small fixed pool lets rapid clicks stack instead of clobbering.
  const ERUPT_LIFE = 2.4; // seconds; must match ERUPT_LIFE in sun.glsl.ts — yellow-star MESH only
  // The PARTICLE red giant erupts on its OWN, much longer clock so the geyser lofts,
  // hangs at the apex, and falls back SLOWLY ("feel the gravity"). MUST stay numerically
  // identical to GIANT_ERUPT_LIFE in disk.glsl.ts: the giant slot is freed (and the debug
  // clock wrapped) at this exact age, matching the shader's `life = age / GIANT_ERUPT_LIFE`
  // span — if the two drift the slot would free (intensity→0) before the shader finished
  // the plume's flight and it would vanish mid-air. The mesh stays on ERUPT_LIFE=2.4.
  const GIANT_ERUPT_LIFE = 5.5; // seconds; must match GIANT_ERUPT_LIFE in disk.glsl.ts
  const ERUPT_HOLD_MAX = 1.5; // seconds of hold that maps to a full-intensity blast
  interface Eruption {
    dir: THREE.Vector3; // object-space unit direction of the eruption centre
    intensity: number; // 0 = free slot; >0 = active (click-hold scaled)
    age: number; // seconds since fired
  }
  const eruptPool: Eruption[] = Array.from({ length: sunRig.surfaceMat.uniforms.uErupt.value.length }, () => ({
    dir: new THREE.Vector3(0, 1, 0),
    intensity: 0,
    age: 0,
  }));
  // Reused across pointer events / frames so the hot path never allocates.
  const eruptRaycaster = new THREE.Raycaster();
  const eruptPointerNdc = new THREE.Vector2();
  const eruptLocalDir = new THREE.Vector3();
  // Updated every frame from the render loop: true only when the star mesh is shown
  // AND fully formed (not growing) — i.e. the settled yellow star or the red-giant
  // hold when the mesh is visible. The pointerdown handler reads it before raycasting.
  let sunClickable = false;
  // Pending hold: set on a pointerdown that HIT the sun, cleared on up/cancel. Stores
  // the object-space eruption direction captured at press time and the press timestamp.
  let holdStart = 0;
  let holdDir: THREE.Vector3 | null = null;

  // --- CLICK ERUPTIONS on the PARTICLE red giant (geyser jet + surface ripple) ----
  // The red giant is a DIFFERENT body from the yellow star: it's the ~1.2M-point GPU
  // particle cloud (the disk rig), not the sun-rig mesh. So it has NO mesh to raycast.
  // Instead we intersect an invisible sphere at the world origin (the giant geometry
  // stays centred there — its off-centre FRAMING is a camera move baked into the
  // red-giant keyframes, not a geometry offset — and the point cloud has no parent
  // transform, so world space == the giant's spun frame).
  // A SEPARATE pool/uniforms keeps the two
  // effects decoupled (mesh and giant are never on screen at once). The same shape as
  // the mesh pool above so the spawn/age/copy logic is identical.
  const giantEruptPool: Eruption[] = Array.from(
    { length: (diskMatPrimary.uniforms.uErupt.value as THREE.Vector4[]).length },
    () => ({ dir: new THREE.Vector3(0, 1, 0), intensity: 0, age: 0 }),
  );
  // Reused instances (no per-frame / hot-path allocation): the giant's raycast sphere,
  // a scratch world hit point, and the tilted spin axis (MUST match the disk vertex
  // shader's spinAxis = normalize(vec3(0.39,0.92,0.0)) and uGiantSpin so the stored
  // local dir un-rotates exactly onto the spinning photosphere — see disk.glsl.ts).
  const giantSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  const giantHitPoint = new THREE.Vector3();
  const giantSpinAxis = new THREE.Vector3(0.39, 0.92, 0.0).normalize();
  // Updated every frame from the render loop: true only when the settled, full-size,
  // idle red giant is the visible body (not the yellow swap, the collapse, the nebula,
  // the dot, or the yellow mesh). The pointerdown handler reads it before raycasting.
  let redGiantClickable = false;
  // Pending hold on the giant (mutually exclusive with holdDir — the two bodies are
  // never both clickable). Stores the UNSPUN local-frame eruption dir + press time.
  let holdStartGiant = 0;
  let holdDirGiant: THREE.Vector3 | null = null;

  // Write an eruption into the oldest/free slot of the pool (free slots first, else
  // the slot nearest the end of its life) so rapid clicks stack instead of replacing.
  const spawnEruption = (dir: THREE.Vector3, intensity: number): void => {
    let slot = 0;
    let oldest = -1;
    for (let i = 0; i < eruptPool.length; i++) {
      if (eruptPool[i].intensity <= 0) {
        slot = i;
        oldest = -1; // found a truly free slot; take it
        break;
      }
      if (eruptPool[i].age > oldest) {
        oldest = eruptPool[i].age;
        slot = i;
      }
    }
    const e = eruptPool[slot];
    e.dir.copy(dir);
    e.intensity = intensity;
    e.age = 0;
  };

  // Same free/oldest-slot policy as spawnEruption, but into the GIANT'S pool. `dir`
  // is the UNSPUN local-frame eruption centre (the shader re-tracks it on the spinning
  // surface), so rapid clicks stack into separate plumes/ripples on the red giant.
  const spawnGiantEruption = (dir: THREE.Vector3, intensity: number): void => {
    let slot = 0;
    let oldest = -1;
    for (let i = 0; i < giantEruptPool.length; i++) {
      if (giantEruptPool[i].intensity <= 0) {
        slot = i;
        oldest = -1; // found a truly free slot; take it
        break;
      }
      if (giantEruptPool[i].age > oldest) {
        oldest = giantEruptPool[i].age;
        slot = i;
      }
    }
    const e = giantEruptPool[slot];
    e.dir.copy(dir);
    e.intensity = intensity;
    e.age = 0;
  };

  // Shared red-giant raycast: map a client point to canvas NDC, cast through the
  // live camera, and intersect the giant's invisible origin sphere (radius =
  // uGiantR × uGiantScale, the held ≈9.0-unit giant). Returns whether it hit and,
  // on a hit, leaves the world hit point in `giantHitPoint` for the caller. Reuses
  // the scratch ndc/raycaster/sphere/vec3 — no per-call allocation — so both the
  // click handler AND the cursor hit-test (hitTestGiant below) can drive it.
  const giantSphereHit = (clientX: number, clientY: number): boolean => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    eruptPointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    eruptRaycaster.setFromCamera(eruptPointerNdc, camera);
    giantSphere.radius =
      (diskMatPrimary.uniforms.uGiantR.value as number) * (diskMatPrimary.uniforms.uGiantScale.value as number);
    return eruptRaycaster.ray.intersectSphere(giantSphere, giantHitPoint) !== null;
  };

  // Cursor hit-test exposed to HeroIsland (→ window.__bhHitGiant → the custom
  // cursor's hexagon). Cheap no-op unless the settled, full-size, idle red giant is
  // the body on screen (redGiantClickable — the same beat gate the click path uses),
  // so the hexagon only appears during the red-giant beat AND over its projected disk.
  const hitTestGiant = (clientX: number, clientY: number): boolean =>
    redGiantClickable && giantSphereHit(clientX, clientY);

  // Unified pointerdown: the mesh and the particle giant are never both clickable, so
  // we branch on which body is on screen. The handler maps the pointer to canvas NDC
  // once, then raycasts the active body (the mesh surface, OR the giant's invisible
  // origin sphere). A press that misses leaves scrolling and other UI untouched.
  const onPointerDownSun = (e: PointerEvent): void => {
    if (!sunClickable && !redGiantClickable) return;
    // NDC of the pointer within the canvas (handles canvas not filling the window).
    const rect = renderer.domElement.getBoundingClientRect();
    eruptPointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    eruptRaycaster.setFromCamera(eruptPointerNdc, camera);
    if (sunClickable) {
      // --- yellow-star MESH path: raycast the photosphere mesh directly. ---
      const hit = eruptRaycaster.intersectObject(sunRig.surface, false)[0];
      if (!hit) return;
      // Convert the world hit point into the surface mesh's LOCAL space and normalize —
      // that is the same object space as the shader's vObj, so the eruption centre lines
      // up with the clicked spot regardless of the rig's spin/scale.
      holdDir = sunRig.surface.worldToLocal(hit.point.clone()).normalize();
      holdStart = performance.now();
    } else {
      // --- particle RED-GIANT path: raycast an invisible sphere at the world origin. ---
      // The giant geometry stays centred at the origin (the off-centre framing slides the
      // CAMERA via the keyframes, not the geometry) and the point cloud has no parent transform, so world
      // == the giant's spun frame. Effective world radius = uGiantR × uGiantScale (the
      // held medium-dense giant, ≈9.0). The
      // raycast itself is the shared giantSphereHit (also used by the cursor hit-test),
      // which leaves the world hit point in giantHitPoint on a hit.
      if (!giantSphereHit(e.clientX, e.clientY)) return;
      // world hit → unit dir (giant at origin, so world == spun local). UNSPIN by the
      // current uGiantSpin about the SAME tilted axis the shader uses, so the stored dir
      // is in the giant's UNSPUN frame (the shader compares it against the unspun sphere
      // dir, cancelling the spin — see disk.glsl.ts's eruption block).
      const giantDir: THREE.Vector3 = giantHitPoint.clone().sub(giantSphere.center).normalize();
      giantDir.applyAxisAngle(giantSpinAxis, -(diskMatPrimary.uniforms.uGiantSpin.value as number));
      holdDirGiant = giantDir;
      holdStartGiant = performance.now();
    }
  };

  const onPointerUpSun = (): void => {
    // Same hold→intensity mapping for both bodies (tap floor 0.25, ~1.5s hold = 1.0).
    if (holdDir) {
      const holdSeconds = (performance.now() - holdStart) / 1000;
      const intensity = Math.max(0.25, Math.min(1, 0.25 + holdSeconds / ERUPT_HOLD_MAX));
      spawnEruption(holdDir, intensity);
    } else if (holdDirGiant) {
      const holdSeconds = (performance.now() - holdStartGiant) / 1000;
      const intensity = Math.max(0.25, Math.min(1, 0.25 + holdSeconds / ERUPT_HOLD_MAX));
      spawnGiantEruption(holdDirGiant, intensity);
    }
    holdDir = null;
    holdStart = 0;
    holdDirGiant = null;
    holdStartGiant = 0;
  };

  const cancelHold = (): void => {
    holdDir = null;
    holdStart = 0;
    holdDirGiant = null;
    holdStartGiant = 0;
  };

  if (!reduced) {
    // Listen on `window`, NOT renderer.domElement — same as the parallax pointermove
    // above. The canvas (.bh-stage) is position:fixed; z-index:0 and sits UNDER the
    // scroll track: the page's .scene-track / .scene-stage divs (no pointer-events:none)
    // stack on top of it, so they win hit-testing and swallow every canvas-targeted
    // pointerdown/up before the canvas ever sees them. `window` receives the events
    // regardless of which element is actually hit; onPointerDownSun then maps clientX/Y
    // into canvas-relative NDC via getBoundingClientRect (so the raycast is correct even
    // though the canvas wasn't the event target). A press that misses the sphere yields
    // no `hit` and is ignored, leaving scrolling and other UI untouched.
    window.addEventListener('pointerdown', onPointerDownSun);
    window.addEventListener('pointerup', onPointerUpSun);
    window.addEventListener('pointercancel', cancelHold);
    window.addEventListener('pointerleave', cancelHold);
  }

  const t0 = performance.now();
  let raf = 0;
  let stopped = false;
  // One-shot guard for the "scene is ready" signal. The instant intro loader (a
  // pure-SSR overlay in index.astro) sits over this black canvas at full load and
  // must fade out the moment the GPU cloud is ACTUALLY on screen — not on a blind
  // timeout. So after the first frame composites we dispatch SCENE_READY_EVENT once
  // (the loader's inline listener fades itself out). Backdrop mode (reading pages)
  // has no loader, so the event is harmless there. See frame().
  let firstFramePainted = false;

  // easeOut (cubic) is a single-source-of-truth easing owned by lifecycle.ts
  // (imported above). The intro dezoom ramp below still uses it. The supernova
  // `nova` is now a clockless Gaussian in `stage` (see frame()), so no nova-rise
  // easing is needed here.

  // The lifecycle position is eased toward its scroll target each frame so a
  // flick of the wheel glides through the transitions instead of snapping.
  // stage 0→1 = reverse supernova; 1→2 = red giant.
  let stage = hooks.getStage();
  let progress = hooks.getProgress?.() ?? progressForLegacyStage(stage);
  let focusGlow = 0;
  // latch so the settled yellow-star glow colour (constant gold) is written once,
  // not re-set every frame while the star holds.
  let glowSettled = false;
  // previous-frame stage for the hyperspace-streak flow direction (latched on a
  // deadzone so sub-pixel jitter at rest never flips the lightspeed streak flow).
  let prevStreakStage = stage;
  let streakDir = 1;
  // previous-frame time (seconds) for the eruption pool's age advance — clamped to a
  // sane dt so a backgrounded-tab time jump never teleports a ripple across the disc.
  let prevEruptT = 0;

  // --- supernova whiteout: a SCROLL-anchored flash envelope, NO clock ---
  // `nova` (0..1) is now a deterministic Gaussian in `stage`, centred on the
  // breakout (stage 0.5 == morph 0.5), computed inline in frame(). It depends ONLY
  // on scroll position, so it is identical every visit and replays symmetrically
  // when scrubbed in either direction (the supernova is fully reversible). No
  // performance.now() clock, no trigger/arm latch, no direction-at-fire state.
  // Nebula-intro flash — REMOVED (it read as a cheap grey exposure glitch as the
  // nebula appeared). Only the previous-stage tracker survives so the crossing is
  // still computed for clarity; the whiteout never fires. See the block in frame().
  let prevNebulaStage = stage;
  const NEBULA_FLASH_TRIGGER = 3.5;
  const frameLookTarget = new THREE.Vector3();
  const flashOrigin = new THREE.Vector3();
  const onVisibilityChange = (): void => {
    if (!document.hidden && !stopped && raf === 0) frame();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // --- look → uniforms/bloom/grade projection (the de-duplicated twin-write) ---
  // setDisk expresses the primary/secondary disk twin-write ONCE, so a uniform
  // can never be half-written (the old forgotten-secondary bug becomes impossible).
  // Created here (outside frame) so the hot path never allocates a closure. Both
  // materials share the SAME uniform NAMES (secondary = primary.clone()), so one
  // name drives both writes.
  const setDisk = (name: string, value: unknown): void => {
    diskMatPrimary.uniforms[name].value = value;
    diskMatSecondary.uniforms[name].value = value;
  };

  // One long-lived ctx instance, MUTATED in place each frame (never re-allocated),
  // carrying the frame-local stateful multipliers applyLook can't derive from
  // `look` alone.
  const applyCtx: ApplyLookCtx = {
    focusEmission: 1,
    focusBloom: 1,
    focusDome: 1,
    streakGasDim: 1,
    simBlend: 0,
    giantScale: 0,
    nebLight: 1,
    nebulaFlashBloom: 0,
  };

  // applyLook OWNS the look → uniforms / sun-rig / visibility / bloom / grade
  // projection. It is the single home of the ~50 straight `look.X → uniform`
  // copies (and every disk twin-write goes through setDisk). It is defined ONCE
  // here, capturing the rigs, and its body allocates nothing (no `new`, no object
  // /array literals, no map/filter, no closures) so it is hot-path safe. frame()
  // keeps only the genuinely STATEFUL clock work and calls this.
  const applyLook = (look: StarState, ctx: ApplyLookCtx): void => {
    // --- transition 1: reverse supernova ---
    setDisk('uMorph', look.morph);
    ringMat.uniforms.uMorph.value = look.morph;
    // particle-side shock-breakout glow (rides the time envelope via look.flash).
    setDisk('uFlash', look.flash);
    // surface-collapse progress (0 full red-giant sphere → 1 collapsed to the point).
    setDisk('uCollapse', look.kCollapse);
    // black-hole geometric shrink (1 outside the black-hole state; shader-gated).
    setDisk('uBlackHoleScale', look.blackHoleScale);

    // --- transition 2: red giant (held at 1 once a later placeholder takes over) ---
    setDisk('uGiant', look.giantHeld);
    // Red-giant-ONLY scale; ctx.giantScale already folds in the giantSize override.
    setDisk('uGiantScale', ctx.giantScale);
    // The point cloud is always the RED GIANT body, never the yellow star → uYellow 0.
    setDisk('uYellow', 0);
    // uNebula spans the real nebula AND the collapse window (analytic placement held).
    setDisk('uNebula', look.nebulaShader ? 1 : 0);
    setDisk('uDot', look.dot ? 1 : 0);
    setDisk('uNebulaGrow', look.nebulaGrow);
    // resolved sim blend (after the gravity-sim sample) + nebula light model strength.
    setDisk('uSimBlend', ctx.simBlend);
    setDisk('uNebLight', ctx.nebLight);

    // --- yellow star → red giant: FLASH-SWAP transition ----------------------
    setDisk('uYrFlash', look.yrFlash);
    // grow + colour curves default to 1 (no-op) outside cloudSide.
    setDisk('uYrGrow', look.cloudSide ? look.yrGrow : 1);
    setDisk('uYrMix', look.cloudSide ? look.yrColor : 1);

    // disk base emission (folds the stateful focus/streak multipliers via ctx).
    setDisk('uBright', look.baseBright * look.cloudBright * ctx.focusEmission * ctx.streakGasDim);
    // disk in-shader saturation (after the sun/nebula overrides resolved in lifecycle).
    setDisk('uSat', look.diskSat);

    // --- sun-rig look (mesh yellow star + shared star backdrop dome) ----------
    // young forming star grows from a tiny core to full size as the gas accretes.
    sunRig.group.scale.setScalar(look.starFormed > 0 ? 0.05 + 0.95 * look.starFormed : 1.0);
    // HOT YOUNG STAR: blue-white while small/forming, cooling to gold near full size.
    sunRig.surfaceMat.uniforms.uBlue.value = look.starFormed > 0 ? 1 - look.starFormed * look.starFormed : 0;
    sunRig.surfaceMat.uniforms.uRed.value = 0;
    sunRig.coronaMat.uniforms.uRed.value = 0;
    // FLARES (coronal loops + corona haze) only AFTER the star is fully sized.
    const flarePresence = look.starFormed > 0 ? smoothstep01((look.starFormed - 0.97) / 0.03) : 1;
    sunRig.loopMat.uniforms.uFade.value = flarePresence;
    sunRig.coronaMat.uniforms.uFade.value = flarePresence;
    sunRig.starMat.uniforms.uOpacity.value = 1;
    // Mesh visible across its side (cross-dissolves under the bloom at the swap).
    sunRig.group.visible = look.sunRigVisible;
    // shared star backdrop dome behind BOTH star states (hidden for BH/nebula/dot/collapse).
    sunRig.starBack.visible = look.starBackVisible;
    // compensate the dome for the red giant's dimmer grade + the HUD focus lift.
    sunRig.starMat.uniforms.uBright.value = STAR_BACK_BASE_BRIGHT * look.starBackBright * ctx.focusDome;

    // --- body visibility (cloud vs mesh) + gravity teardown ------------------
    diskPrimary.visible = look.cloudShown;
    diskSecondary.visible = look.cloudShown;
    starPts.visible = look.starPtsVisible;
    // plain starfield brightness behind the scene.
    starMat.uniforms.uStarBright.value = look.starBright;
    // remove ALL gravity once the star forms (warp arcs, lensed ghost, photon ring).
    warpSeg.visible = !look.gravityGone;
    warpSeg2.visible = !look.gravityGone;
    diskSecondary.visible = !look.gravityGone; // no lensed disk ghost behind the star
    ringPts.visible = !look.gravityGone; // no photon ring around the star
    starSecPts.visible = false; // secondary lensed star image stays off

    // --- bloom + auto-exposure + grade + disk-saturation (all resolved finals) ---
    bloom.strength = look.bloomStrength * ctx.focusBloom + ctx.nebulaFlashBloom;
    bloom.radius = look.bloomRadius;
    gradePass.uniforms.uExposure.value = look.exposure;
    gradePass.uniforms.uOlive.value = look.olive;
    gradePass.uniforms.uWarmth.value = look.warmth;
    gradePass.uniforms.uSat.value = look.gradeSat;
    gradePass.uniforms.uToneComp.value = look.toneComp; // tone-map compression (low for red giant)
    gradePass.uniforms.uGrain.value = look.grain; // per-state film grain (0 in the nebula)
  };

  function frame(): void {
    if (stopped) return;
    if (document.hidden) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const t = (now - t0) / 1000;

    // --- lifecycle position, smoothed toward the scroll target ---
    const exploring = hooks.isExplorationMode?.() === true;
    const focusTarget = exploring ? hooks.getFocusTarget?.() ?? null : null;
    // Per-scene DWELL damps the morph follow-ease so the visitor lingers on a
    // dwelling beat (e.g. the contemplative red giant). dwell is the active scene's
    // strength 0..1 (0 when none): at 0 follow is exactly 0.28 — IDENTICAL to before
    // for undwelled scenes — and rises in stickiness with strength. The map
    // 0.28 * (1 - 0.6 * dwell) spans 0.28 (dwell 0) -> 0.112 (dwell 1); a Math.max
    // floor of 0.1 guarantees follow can never reach 0 (which would stall the morph)
    // and never exceeds 0.28 (dwell is clamped >= 0, so the term <= 0.28). Under
    // reduced motion the ease is already instant (follow = 1) and dwell is ignored —
    // the morph snaps, so there is nothing to linger on and accessibility is kept.
    const dwell = reduced ? 0 : Math.max(0, Math.min(1, hooks.getDwell?.() ?? 0));
    const follow = reduced ? 1 : Math.max(0.1, 0.28 * (1 - 0.6 * dwell));
    const progressTarget = Math.max(0, Math.min(1, hooks.getProgress?.() ?? progress));
    const stageTarget = hooks.getStage();
    // SETTLE SNAP — land on the restored scroll state, don't animate into it.
    // The scene mounts and reads its initial stage/progress while window.scrollY is
    // still 0 (the pale-blue-dot opening), because the browser applies scroll
    // RESTORATION (on reload / back-navigation to a scrolled position) a frame or
    // two AFTER mount. Without this, the late restored target would arrive and the
    // 0.28 easing would GLIDE the whole lifecycle up from the dot to the visitor's
    // real position — the "fast-forward the animation" bug. So for a short window
    // after scene start we snap stage/progress DIRECTLY to target (no lerp): the
    // first frame lands wherever scroll currently is, and any restoration that lands
    // a few frames later is absorbed instantly too. The window is ~a quarter second
    // (a handful of frames) — long enough to cover scroll restoration, short enough
    // that a visitor cannot have meaningfully wheel-scrolled within it, so normal
    // smooth easing resumes immediately afterward. (Reduced motion already uses
    // follow=1, so this is a no-op there.)
    const SETTLE_SNAP_S = 0.25;
    if (t < SETTLE_SNAP_S) {
      progress = progressTarget;
      stage = stageTarget;
      // Keep the stage-delta trackers in sync so a snap doesn't read as motion:
      // otherwise the jump from the stale 0 to the restored stage would register a
      // huge dStreakStage and flip the hyperspace-streak flow (and would be a phantom
      // nebula-flash crossing). Syncing them here makes the snapped frame look static.
      prevStreakStage = stage;
      prevNebulaStage = stage;
    } else {
      progress += (progressTarget - progress) * follow;
      stage += (stageTarget - stage) * follow;
    }
    // DEBUG: window.__bhMorph forces the stage to an exact value (no smoothing)
    // so the explosion can be inspected frame-by-frame from a capture script.
    const morphOverride = readDebugNumber(DEBUG_WINDOW_KEYS.morph);
    if (typeof morphOverride === 'number') {
      stage = morphOverride;
      progress = progressForLegacyStage(morphOverride);
    }
    // Scroll-anchored supernova: a deterministic Gaussian in `stage`. No clock —
    // `nova` depends ONLY on scroll position, so it is identical every visit and
    // replays symmetrically when scrubbed in either direction (fully reversible).
    // Centered on 0.62, where the disk's STRUCTURED shock-breakout (the shell +
    // radial fingers, gated in disk.glsl by morphFlare/shellLight ~0.46→0.70) is
    // fully formed — so the flash + the uFlash particle-core punch reinforce that
    // structure instead of washing the pre-structure dense bulk at ~0.50 (which read
    // as a flat loading-screen bloom). Sigma 0.13 keeps the punch off the bulk below
    // and out of the black hole above.
    const NOVA_CENTER = 0.62;
    const NOVA_SIGMA = 0.13;
    let nova = reduced ? 0 : Math.exp(-Math.pow((stage - NOVA_CENTER) / NOVA_SIGMA, 2));
    // DEBUG: window.__bhFlash pins the envelope to a held value so capture scripts
    // can screenshot any point of the blast independent of scroll. Pairs with
    // __bhMorph (which pins stage — which now also drives nova deterministically).
    const flashOverride = readDebugNumber(DEBUG_WINDOW_KEYS.flash);
    if (typeof flashOverride === 'number') nova = Math.max(0, Math.min(1, flashOverride));

    // NEBULA INTRO FLASH — REMOVED. The full-screen whiteout that used to fire on
    // the stage-3.5 crossing read as a cheap grey exposure glitch right as the
    // nebula appears (and the pre-flash darken below greyed the frame BEFORE it).
    // The nebula now arrives clean: no screen flash, only the gas itself. The
    // envelope state machinery is kept dormant (advanced but never composited) so
    // the __bhNebulaFlash capture hook and a future re-enable stay one-line trivial.
    const crossedNebula = (prevNebulaStage < NEBULA_FLASH_TRIGGER) !== (stage < NEBULA_FLASH_TRIGGER);
    void crossedNebula; // intentionally not firing the nebula whiteout
    prevNebulaStage = stage;
    // Debug hook can still pin a nebula-flash value for capture A/B, but it no
    // longer fires from scroll.
    const nebulaFlashOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebulaFlash);
    const nebulaFlash = typeof nebulaFlashOverride === 'number' ? Math.max(0, Math.min(1, nebulaFlashOverride)) : 0;

    // SUPERNOVA SCREEN FLASH — short, warm, corner-protected. Dialed down from the
    // old grey full-screen wash (0.72 @ peak 0.82) so the blast reads as a bright
    // bloom that keeps the dark corners, never an edge-to-edge loading whiteout.
    // The physical radial particle shock-breakout (disk uFlash) does the heavy
    // lifting; this pass is just the warm bloom punch over it. See NovaShader.
    const novaScreen = nova * 0.72;
    const nebulaScreen = nebulaFlash * 0.5; // debug-only path; 0 in normal play
    const screenNova = Math.max(novaScreen, nebulaScreen);
    const nebulaFlashOwnsScreen = nebulaScreen > novaScreen;
    novaPass.uniforms.uNova.value = screenNova;
    novaPass.uniforms.uPeak.value = 0.88; // filmic cap — peak stays under pure white
    // DEBUG: window.__bhFlashDir pins the blast direction (+1 explode / -1 implode)
    // so a capture script can inspect either variant without scrolling to trigger it.
    // With the clock gone the default is a constant +1 (forward lifecycle = the star
    // detonating outward = EXPLODE), still overridable by __bhFlashDir.
    const flashDirOverride = readDebugNumber(DEBUG_WINDOW_KEYS.flashDir);
    novaPass.uniforms.uNovaDir.value = nebulaFlashOwnsScreen ? 1 : typeof flashDirOverride === 'number' ? flashDirOverride : 1;

    // dezoom progress (0 close → 1 rest). Reduced motion lands at the rest frame.
    // This is the second piece of the stateful clock (time-based intro ramp); like
    // `nova` it is resolved HERE and fed into lifecycle() as an input.
    const intro = reduced ? 1 : easeOut(Math.min(t / INTRO_DUR, 1));

    // === lifecycle() — the pure choreography ================================
    // All the per-frame look DECISIONS (the ~48 scalars that used to live inline:
    // kCollapse, giant, giantHeld, yellow/nebula/dot, flash, the yellow⇄red swap,
    // gravity teardown, bloom/exposure/grade beats, the zoom story) are computed by
    // the pure lifecycle() module from the resolved clock inputs (eased `stage`,
    // `t`, `nova`, `intro`). frame() stays the thin impure shell: it just WRITES the
    // returned StarState into uniforms / bloom / exposure / grade / camera below.
    const look = lifecycle({
      stage,
      t,
      reduced,
      nova,
      intro,
      rotateSpeed: ROTATE_SPEED,
      nearFactor: NEAR_FACTOR,
      cfg: CFG,
    });
    // HUD focus ease (stateful — integrates focusTarget across frames). The three
    // multipliers it drives (disk emission, bloom, dome brightness) are fed into
    // applyCtx; applyLook reads them so the disk/bloom/dome writes stay one place.
    focusGlow += ((focusTarget ? 1 : 0) - focusGlow) * (reduced ? 1 : 0.08);
    applyCtx.focusEmission = 1 + focusGlow * 0.18;
    applyCtx.focusBloom = 1 + focusGlow * 0.12;
    applyCtx.focusDome = 1 + focusGlow * 0.08;

    // --- transition 2: red-giant SIZE override (giantSize debug hook) ----------
    // Red-giant SIZE is a RED-GIANT-ONLY scale (uGiantScale) so resizing the orb never
    // balloons the nebula/dot/sun states or the gravity-sim seed (all share the base
    // uGiantR). lifecycle.giantScale ramps it from a SMALL newborn star up to the full
    // bloated size as the camera comes in. DEV: the red-giant framing panel can override
    // the held size live (world radius → ×base scale). Resolved here (stateful debug read)
    // and fed to applyLook via applyCtx; only overrides while pinned at the held giant.
    const giantSizeOverride = readDebugNumber(DEBUG_WINDOW_KEYS.giantSize);
    applyCtx.giantScale =
      typeof giantSizeOverride === 'number'
        ? giantSizeOverride / (diskMatPrimary.uniforms.uGiantR.value as number)
        : look.giantScale;
    // Axial spin: roll the red-giant photosphere on its own tilted pole (≈23°) at a
    // slow, cinematic rate (~60 s / rotation). t accumulates seconds, so the angle
    // grows monotonically; the shader gates it to the displayed red giant only. This is
    // a per-frame TIME write (stateful clock), so it stays in frame().
    const giantSpin = reduced ? 0 : t * RED_GIANT_SPIN_RATE;
    diskMatPrimary.uniforms.uGiantSpin.value = giantSpin;
    diskMatSecondary.uniforms.uGiantSpin.value = giantSpin;

    // --- nebula → star collapse: BAKED gravity-sim flipbook ---------------------
    // The real chaotic collapse sim is run ONCE and snapshotted into a flipbook at
    // load (gravitySim.bake), then scrubbed by blending the two snapshots bracketing
    // the scroll position (look.collapse, 0 = dispersed nebula → 1 = fully collapsed).
    // Because the snapshots are fixed, the collapse is a PURE FUNCTION of scroll — it
    // scrubs identically both directions with no state, no replay, no snap-back (the
    // earlier "scrolling back and forth bugs the animation" failure). uSimBlend morphs
    // the disk from the analytic nebula placement onto the baked sim positions.
    let simBlend = 0;
    // Pre-warm the baked flipbook as soon as the nebula is on screen (look.nebulaShader
    // covers the nebula hold AND the collapse window) — the incremental bake then has the
    // whole nebula beat to finish, so the snapshots are ready by the time the visitor
    // actually scrolls into the collapse. bake() is resumable + self-completing.
    if (gravitySim.available && look.nebulaShader && !gravitySim.isBaked()) gravitySim.bake();
    if (gravitySim.available && (look.simBlend > 0.001 || look.collapse > 0.001)) {
      const sample = gravitySim.sampleAt(look.collapse);
      if (sample) {
        diskMatPrimary.uniforms.uSimPos.value = sample.texA;
        diskMatSecondary.uniforms.uSimPos.value = sample.texA;
        diskMatPrimary.uniforms.uSimPosB.value = sample.texB;
        diskMatSecondary.uniforms.uSimPosB.value = sample.texB;
        diskMatPrimary.uniforms.uSimMix.value = sample.mix;
        diskMatSecondary.uniforms.uSimMix.value = sample.mix;
        simBlend = look.simBlend;
      }
    }
    // Resolved sim blend (stateful — gated on the sample above) and nebula light
    // model strength (with its debug override) fed to applyLook via applyCtx; the
    // actual uSimBlend / uNebLight twin-writes happen in applyLook.
    applyCtx.simBlend = simBlend;
    // nebula light model strength (ambient+depth+self-occlusion). Always full; the
    // factor only touches nebula particles. DEBUG: window.__bhNebLight pins it (0 =
    // flat self-emission, 1 = full light model) so the look can be A/B'd live.
    const nebLightOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebLight);
    applyCtx.nebLight = typeof nebLightOverride === 'number' ? nebLightOverride : 1;

    // --- yellow star → red giant: FLASH-SWAP transition ----------------------
    // Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR
    // (mesh sun rig — small, gold, textured) becomes the RED GIANT (point cloud —
    // big, deep red, grainy) as `stage` falls 3 → 2. The two bodies have totally
    // different textures, so we DON'T crossfade them co-located (that showed two
    // entities + a colour flicker). Instead (see lifecycle.ts for the windows):
    //   1. The yellow MESH owns its whole slot (stage 3.0 → 3.5, up to the nebula
    //      snap) — nothing red ever shows before it.
    //   2. A SUBTLE light flash fires at SWAP_STAGE; under it the mesh hands off
    //      to a smooth GOLD gaussian particle sphere (one short crossfade, hidden
    //      by the bloom — never two distinct textures on screen at once).
    //   3. That gold sphere then GROWS (uYrGrow) from the yellow radius to the
    //      red-giant radius while its colour LERPS gold → red (uYrMix), a single
    //      monotonic curve — so no red→yellow→red wobble.
    // --- yellow star → red giant: FLASH-SWAP (uYrFlash/uYrGrow/uYrMix) and the
    // whole sun-rig / body-visibility / bloom / grade projection now live in
    // applyLook (see below). What STAYS here is the genuinely STATEFUL work that
    // can't be a pure function of `look`:
    //   • `growing` (a derived flag the clickable gates read this frame),
    //   • the glowMat colour LATCH (`glowSettled` persists across frames),
    //   • the click gates (`sunClickable` / `redGiantClickable`, read by handlers),
    //   • the distant-star presence ramp (a function of `stage`, not in StarState),
    //   • the hyperspace-streak direction latch + its gas-dim multiplier.
    const growing = look.starFormed > 0 && look.starFormed < 1;
    // the glow shell cools blue→gold with the star as it grows. setRGB mutates the
    // existing THREE.Color in place (no allocation); the settled branch only writes
    // when it actually changes (`glowSettled` latch) so the constant gold isn't
    // re-set every frame while the star holds. STATEFUL (latch across frames) → here.
    if (growing) {
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(
        0.35 + 0.65 * look.starFormed,
        0.55 * look.starFormed + 0.55 * (1 - look.starFormed),
        0.16 + 0.74 * (1 - look.starFormed),
      );
      glowSettled = false;
    } else if (!glowSettled) {
      // settled yellow star: a PALE-GOLD halo (still lifted off orange so the rim
      // reads yellow-white, not amber), but dimmed ~28% from the old blinding value
      // so the solid→particle handoff is a calm dissolve, not a glare bloom.
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(0.72, 0.56, 0.24);
      glowSettled = true;
    }

    // CLICK ERUPTIONS gate: the star is clickable only when its mesh is shown AND it
    // is fully formed (not growing) — i.e. the settled yellow star or the red-giant
    // hold while the mesh is up. Read by the pointerdown handler (which lives outside
    // frame()) so a click while the nebula/forming/black-hole is on screen does nothing.
    sunClickable = look.sunRigVisible && !growing;
    // RED-GIANT CLICK gate: the particle giant is clickable only when the settled,
    // FULL-SIZE, idle red giant is the visible body. `cloudSide` is the cloud-rendered
    // red-giant slot (stage 2.05→2.88); we additionally require it to be at full size
    // and full red colour (yrGrow/yrColor ≈ 1, i.e. NOT yet shrinking/cooling toward
    // the yellow swap at stage ~2.5+) and not collapsing (kCollapse≈0). That isolates
    // the calm red-giant beat (stage ≈ 2.05→2.5) and excludes the yellow→red swap
    // flash, the shrink, the collapse, the nebula, the dot and the yellow mesh. The
    // cloud must also actually be drawn this frame. Read by the pointerdown handler
    // AND by hitTestGiant (the beat gate for the interactive-hexagon cursor).
    redGiantClickable =
      look.cloudSide &&
      look.cloudShown &&
      look.yrGrow > 0.9 &&
      look.yrColor > 0.9 &&
      look.kCollapse < 0.02;
    // distant-star presence ramp: a function of `stage` (not in StarState), so it
    // stays here. Visibility also gates on look.gravityGone.
    distantStarPts.visible = !look.gravityGone && stage < 0.45;
    distantStarUniforms.uPresence.value = distantStarPts.visible ? 1 - smoothstep01((stage - 0.08) / 0.34) : 0;

    // --- hyperspace streaks: dot ⇄ nebula lightspeed approach ---------------
    // The nebula's own gas grains trail into long radial lanes while the camera
    // travels between the pale-blue dot and the cloud. look.streak is the intensity
    // envelope over that window (0 elsewhere), so the streak rig is only present
    // while it is hot. Direction is latched from eased-stage velocity on a deadzone,
    // so a fast scroll either way flows the lanes in the matching direction and a
    // parked frame holds the last flow instead of stuttering. STATEFUL (latch) → here.
    const dStreakStage = stage - prevStreakStage;
    if (Math.abs(dStreakStage) > 0.0006) streakDir = dStreakStage > 0 ? 1 : -1;
    prevStreakStage = stage;
    // DEBUG: window.__bhStreak pins the jump intensity (0..1) so a capture script
    // can inspect the lightspeed lanes at a held frame (the rig is forced on).
    const streakOverride = readDebugNumber(DEBUG_WINDOW_KEYS.streak);
    const streakValue = typeof streakOverride === 'number' ? streakOverride : look.streak;
    streakSeg.visible = streakValue > 0.001;
    streakUniforms.uStreak.value = streakValue;
    streakUniforms.uStreakDir.value = streakDir;
    // HYPERSPACE gas recede: as the jump engages, dim the nebula gas so the streak
    // LANES take over the frame (the gas dissolves into the lightspeed lines rather
    // than the lanes sitting on a full-bright blob). Held to ~0.4 floor so the cloud
    // still reads underneath the lanes, not pitch black. 1 (no-op) outside the jump.
    // Fed to applyLook (the disk uBright twin-write) via applyCtx.
    applyCtx.streakGasDim = 1 - 0.6 * streakValue;
    // debug-only additive bloom (0 in normal play); folded into applyLook's bloom.
    applyCtx.nebulaFlashBloom = nebulaFlash * 0.18;

    // === applyLook() — the look → uniforms / sun-rig / visibility / bloom / grade
    // projection. ONE home for the ~50 straight `look.X → uniform` copies (every
    // disk twin-write through setDisk), so a forgotten-secondary write is impossible.
    // The stateful multipliers it needs (focus eases, resolved giantScale/nebLight/
    // simBlend, streak gas-dim, nebula-flash bloom) were written into applyCtx above.
    applyLook(look, applyCtx);

    // --- master forward camera rig ------------------------------------------
    // Progress, not object identity, owns the camera: calm drift while the nebula
    // gathers, stable holds while text is readable, one accelerating collapse pull,
    // one supernova recoil, then a magnetic settle on the black hole.
    const cameraPose = cameraPoseForProgress(progress, t, nova, reduced);
    camera.position.set(cameraPose.position[0], cameraPose.position[1], cameraPose.position[2]);
    frameLookTarget.set(cameraPose.target[0], cameraPose.target[1], cameraPose.target[2]);
    if (!reduced && cameraPose.parallax > 0) {
      camera.position.x += mouseX * cameraPose.parallax;
      camera.position.y += -mouseY * cameraPose.parallax * 0.45;
      frameLookTarget.x += mouseX * cameraPose.parallax * 0.35;
      frameLookTarget.y += -mouseY * cameraPose.parallax * 0.18;
    }
    // DEV-ONLY framing nudge. The red-giant off-centre composition now lives entirely
    // in the camera keyframes (timeline's RED_COMPOSITION/COLLAPSE_PULL — one continuous
    // travel, no separate park add). These hooks let the dev panel nudge that framing
    // live while tuning; both default to undefined so PRODUCTION applies NO extra offset.
    // The nudge rides the same in/out weight as the red-giant beat so tuning never
    // reintroduces a snap. Read off the panel's pos X/Y, then bake into RED_COMPOSITION.
    const giantPosXOverride = readDebugNumber(DEBUG_WINDOW_KEYS.giantPosX);
    const giantPosYOverride = readDebugNumber(DEBUG_WINDOW_KEYS.giantPosY);
    if (giantPosXOverride !== undefined || giantPosYOverride !== undefined) {
      const nudgeX = giantPosXOverride ?? 0;
      const nudgeY = giantPosYOverride ?? 0;
      const beatIn = smoothstep01((progress - RED_GIANT_NUDGE_IN[0]) / (RED_GIANT_NUDGE_IN[1] - RED_GIANT_NUDGE_IN[0]));
      const beatOut = smoothstep01((progress - RED_GIANT_NUDGE_OUT[0]) / (RED_GIANT_NUDGE_OUT[1] - RED_GIANT_NUDGE_OUT[0]));
      const beatWeight = beatIn * (1 - beatOut);
      camera.position.x += nudgeX * beatWeight;
      camera.position.y += nudgeY * beatWeight;
      frameLookTarget.x += nudgeX * beatWeight;
      frameLookTarget.y += nudgeY * beatWeight;
    }
    camera.lookAt(frameLookTarget);

    // The supernova flash originates from the STAR, not the screen centre. The
    // star sits at world origin the whole time; projecting it through the current
    // (off-centre, collapse-framed) camera gives the on-screen point where the
    // collapsing core is — so the radial whiteout erupts from where the red giant
    // just was, not from a disconnected dead-centre. Runs AFTER lookAt so it uses
    // the final camera orientation.
    flashOrigin.set(0, 0, 0).project(camera);
    novaPass.uniforms.uCenter.value.set(
      Math.max(0, Math.min(1, flashOrigin.x * 0.5 + 0.5)),
      Math.max(0, Math.min(1, flashOrigin.y * 0.5 + 0.5)),
    );

    // Per-frame marker bridge: project the star's world-origin position to CSS-pixel
    // coords and call hooks.onMarkerFrame so StarMarker can anchor HTML over the object
    // without triggering React re-renders. flashOrigin already holds the projected NDC
    // (recomputed above for the nova pass on the same frame, same camera orientation).
    // Offset slightly up-and-right of centre so the marker floats off the exact core
    // on the big objects. EXCEPT the pale blue dot: it's a tiny speck, so the 28/36px
    // float visibly detaches the hexagon from it — centre the marker ON the dot there
    // (offset 0,0 for stage >= 4.40, the dot-hold window).
    if (hooks.onMarkerFrame) {
      const ndcX = flashOrigin.x;
      const ndcY = flashOrigin.y;
      const isDot = stage >= 4.5;
      const offX = isDot ? 0 : 28;
      const offY = isDot ? 0 : -36;
      const cssX = (ndcX * 0.5 + 0.5) * window.innerWidth + offX;
      const cssY = (1 - (ndcY * 0.5 + 0.5)) * window.innerHeight + offY;
      const onScreen = ndcX > -1.1 && ndcX < 1.1 && ndcY > -1.1 && ndcY < 1.1;
      // IDLE-hold-only gate: a marker appears ONLY while the object is holding
      // still on its recognisable beat, NOT during the transitions in or out of
      // that hold. The per-scene STAGE tolerances are the settledWindow values on
      // the idle SEGMENTS in sceneTable.ts; settledIdForStage scans them, so this
      // gate and HudNavigation's both read the ONE table (no more byte-identical
      // duplication to keep in sync by hand).
      const settled = settledIdForStage(stage) !== null;
      hooks.onMarkerFrame({ x: cssX, y: cssY, stage, visible: onScreen && settled });
    }

    // --- supernova shake/rumble + idle roll (applied AFTER lookAt) -------------
    // Tiny and time-based: it sells one shock event without turning the scroll into
    // a game-camera wobble.
    if (!reduced) {
      const idleRoll = Math.sin(t * 0.067 + 2.3) * 0.0016; // rad, ~0.09°
      const sh = cameraPose.shake;
      if (sh > 0.0001) {
        const f = t * 47.0; // fast carrier for the rumble
        const amp = camera.position.length() * 0.0045 * sh;
        // local-space positional shudder (X = screen horizontal, Y = vertical)
        const jitterX = (Math.sin(f * 1.00) + Math.sin(f * 2.30 + 1.3)) * 0.5 * amp;
        const jitterY = (Math.sin(f * 1.37 + 0.7) + Math.sin(f * 2.90 + 3.1)) * 0.5 * amp;
        const jitterZ = Math.sin(f * 0.83 + 2.0) * amp * 0.6; // dolly punch in/out
        camera.translateX(jitterX);
        camera.translateY(jitterY);
        camera.translateZ(jitterZ);
        // view-axis roll: a soft "blast" cue — the horizon eases off level.
        // ~1.6° at peak (0.028 rad) so the tilt is felt, not jarring.
        const shakeRoll = (Math.sin(f * 0.91 + 0.4) + Math.sin(f * 1.70 + 2.6)) * 0.5 * 0.028 * sh;
        camera.rotateZ(idleRoll + shakeRoll);
      } else {
        camera.rotateZ(idleRoll);
      }
    }

    if (camera.fov !== CFG.fovDeg) {
      camera.fov = CFG.fovDeg;
      camera.updateProjectionMatrix();
    }

    const ut = reduced ? 0 : t;
    // SCROLL-LOCK THE NEBULA: across the nebula + gravitational-collapse window the
    // disk clock is frozen to 0 so the cloud is purely a function of scroll position
    // (holding still = a frozen frame; no wall-clock drift/shimmer). This freezes
    // nDrift, the filament wobble AND the render-side nebulaPlace() warp at once, and
    // (because the sim's home target uses uFrozenTime=0) realigns the analytic
    // placement with the sim seed. Outside the window the disk runs on wall-clock ut
    // (the explosion/red-giant turbulence terms, all gated to uGiant/uMorph, need it).
    const diskTime = reduced ? 0 : look.nebulaShader ? 0 : t;
    diskMatPrimary.uniforms.uTime.value = diskTime;
    diskMatSecondary.uniforms.uTime.value = diskTime;
    // uDotTime is a DEDICATED always-live clock for the opening pale-blue-dot's
    // brightness breath. The disk's uTime is frozen to 0 across the nebula window
    // (which INCLUDES the opening dot — `nebula` is true there), so it can't drive
    // the pulse. This one runs on wall-clock `ut` (0 under reduced motion → the dot
    // holds steady, no pulse). Only the dot's fragment branch reads it, so it never
    // disturbs the scroll-locked nebula/collapse geometry.
    diskMatPrimary.uniforms.uDotTime.value = ut;
    diskMatSecondary.uniforms.uDotTime.value = ut;
    starMat.uniforms.uTime.value = ut;
    starMatSec.uniforms.uTime.value = ut;
    distantStarUniforms.uTime.value = ut;
    warpMat.uniforms.uTime.value = ut;
    warpMatSec.uniforms.uTime.value = ut;
    ringMat.uniforms.uTime.value = ut;
    gradePass.uniforms.uTime.value = ut;
    if (streakSeg.visible) streakMat.uniforms.uTime.value = ut; // flow the lanes only while jumping

    // sun rig: animate the photosphere flow, corona streamers and loop jets only
    // while it is visible; keep the corona plane facing the camera (billboard).
    if (sunRig.group.visible) {
      sunRig.surfaceMat.uniforms.uTime.value = ut;
      sunRig.coronaMat.uniforms.uTime.value = ut;
      sunRig.loopMat.uniforms.uTime.value = ut;
      sunRig.corona.quaternion.copy(camera.quaternion);

      // --- click eruptions: advance the pool + copy into the surface uniforms -----
      // Each active eruption ages by the frame's dt; once it outlives ERUPT_LIFE the
      // slot is freed (intensity 0). Reduced motion never wired the listeners and
      // never animates, so this only runs in the live, motion-on path.
      if (!reduced) {
        const dt = Math.min(Math.max(ut - prevEruptT, 0), 0.1); // clamp tab-switch jumps
        const uErupt = sunRig.surfaceMat.uniforms.uErupt.value as THREE.Vector4[];
        const uEruptAge = sunRig.surfaceMat.uniforms.uEruptAge.value as number[];
        // DEBUG: window.__bhErupt holds a fixed camera-facing eruption (0..1 intensity)
        // so the geyser + ripple can be inspected without clicking. It commandeers the
        // last slot and ages on a wrapped clock (so the ripple keeps replaying).
        const eruptOverride = readDebugNumber(DEBUG_WINDOW_KEYS.erupt);
        for (let i = 0; i < eruptPool.length; i++) {
          const e = eruptPool[i];
          if (e.intensity > 0) {
            e.age += dt;
            if (e.age >= ERUPT_LIFE) e.intensity = 0; // spent → free the slot
          }
          if (typeof eruptOverride === 'number' && i === eruptPool.length - 1) {
            // park a held eruption facing the camera: take the camera's WORLD position,
            // bring it into the surface mesh's local frame and normalize — that points
            // from the star centre toward the viewer, so the plume erupts at us.
            eruptLocalDir.copy(camera.position);
            sunRig.surface.worldToLocal(eruptLocalDir).normalize();
            uErupt[i].set(eruptLocalDir.x, eruptLocalDir.y, eruptLocalDir.z, Math.max(0, Math.min(1, eruptOverride)));
            uEruptAge[i] = ut % ERUPT_LIFE;
          } else {
            uErupt[i].set(e.dir.x, e.dir.y, e.dir.z, e.intensity);
            uEruptAge[i] = e.age;
          }
        }
      }
    }

    // --- PARTICLE RED-GIANT click eruptions: advance the pool + copy into BOTH disk
    // materials' uniforms. The giant is the point cloud (not the mesh), so this runs
    // independent of sunRig.group.visible — and ALWAYS (not just when the giant is on
    // screen) so an in-flight eruption keeps ageing/freeing even if you scroll away.
    // Both disk materials hold DEEP-CLONED uniform arrays (secondary = primary.clone()),
    // so we write the same pool into each separately — mirroring how uGiant et al. are
    // set on both diskMatPrimary + diskMatSecondary every frame. Reduced motion never
    // wired the listeners, so this only runs in the live, motion-on path.
    if (!reduced) {
      const dtGiant = Math.min(Math.max(ut - prevEruptT, 0), 0.1); // clamp tab-switch jumps
      const gErupt = diskMatPrimary.uniforms.uErupt.value as THREE.Vector4[];
      const gEruptAge = diskMatPrimary.uniforms.uEruptAge.value as number[];
      const gEruptSec = diskMatSecondary.uniforms.uErupt.value as THREE.Vector4[];
      const gEruptAgeSec = diskMatSecondary.uniforms.uEruptAge.value as number[];
      // DEBUG: window.__bhGiantErupt holds a fixed camera-facing eruption (0..1) on the
      // giant so the jet + ripple can be inspected without clicking (set __bhMorph to a
      // red-giant stage too — e.g. ≈2.3). Commandeers the last slot, ages on a wrapped
      // clock so the ripple keeps replaying. Reuses eruptLocalDir (no allocation).
      const giantEruptOverride = readDebugNumber(DEBUG_WINDOW_KEYS.giantErupt);
      for (let i = 0; i < giantEruptPool.length; i++) {
        const e = giantEruptPool[i];
        if (e.intensity > 0) {
          e.age += dtGiant;
          // GIANT life: free the slot at GIANT_ERUPT_LIFE (NOT the shared 2.4) so the slot
          // stays alive for the full, slower ballistic flight the shader animates over the
          // same span — freeing at 2.4 would kill the plume mid-loft.
          if (e.age >= GIANT_ERUPT_LIFE) e.intensity = 0; // spent → free the slot
        }
        let dx = e.dir.x;
        let dy = e.dir.y;
        let dz = e.dir.z;
        let dw = e.intensity;
        let dage = e.age;
        // DEBUG override: only commandeer the last slot when it is IDLE (no live click
        // eruption in it). Without this guard the override re-stamped the last slot EVERY
        // frame, clobbering a real click eruption that happened to land there and resetting
        // its age — so a debug-driven plume could "undo" a player's eruption (see #2). With
        // the e.intensity<=0 guard, a live click in the last slot wins and the override
        // simply yields until that eruption finishes. (In normal play the hook is unset, so
        // this whole branch is dead code and the pool plays untouched.)
        if (
          typeof giantEruptOverride === 'number' &&
          i === giantEruptPool.length - 1 &&
          e.intensity <= 0
        ) {
          // park a held eruption facing the camera: camera world position → unit dir from
          // the origin-centred giant toward the viewer, then UNSPIN it by -uGiantSpin about
          // the shader's tilted axis so it lands at the camera-facing spot on the spinning
          // surface (matches the click-path unspin). The plume then erupts at us.
          eruptLocalDir.copy(camera.position).normalize();
          eruptLocalDir.applyAxisAngle(giantSpinAxis, -(diskMatPrimary.uniforms.uGiantSpin.value as number));
          dx = eruptLocalDir.x;
          dy = eruptLocalDir.y;
          dz = eruptLocalDir.z;
          dw = Math.max(0, Math.min(1, giantEruptOverride));
          // wrap the debug clock on the GIANT life so the replayed plume runs the full
          // slow ballistic arc (loft → hang → fall) before looping, matching the shader.
          dage = ut % GIANT_ERUPT_LIFE;
        }
        gErupt[i].set(dx, dy, dz, dw);
        gEruptAge[i] = dage;
        gEruptSec[i].set(dx, dy, dz, dw);
        gEruptAgeSec[i] = dage;
      }
    }
    prevEruptT = ut;
    // The star backdrop dome twinkles behind both the yellow star and the red
    // giant, so advance its clock whenever IT is visible (the mesh group is hidden
    // for the red giant), independent of the rest of the rig.
    if (sunRig.starBack.visible) {
      sunRig.starMat.uniforms.uTime.value = ut;
    }

    updateLensUniforms();
    postRig.render();

    // First real frame is now drawn to the canvas (postRig.render() just ran). Tell
    // the page ONCE so the instant intro loader fades out over actual pixels, not a
    // guessed delay. Dispatched synchronously here — not via a deferred rAF — so the
    // signal can't be lost to background-tab rAF throttling; the loader's own 0.7s
    // opacity fade gives the compositor ample time to present this frame before it is
    // uncovered. Note we only reach this line AFTER the early document.hidden return
    // above, so the event always trails a genuine paint. Backdrop mode (reading
    // pages) has no loader, so the event is simply unobserved there.
    if (!firstFramePainted) {
      firstFramePainted = true;
      window.dispatchEvent(new CustomEvent(SCENE_READY_EVENT));
    }
  }

  onResize();
  frame();

  // --- teardown ---
  // The returned value is the dispose function (same call contract as before) with
  // hitTestGiant bolted on (Object.assign), so HeroIsland can publish the cursor
  // hit-test on window while existing `dispose()` callers stay untouched.
  const dispose: SceneHandle = Object.assign(
    () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // click-eruption listeners (only attached when motion is enabled) — these live on
      // `window`, not the canvas, because the scroll-track overlay swallows canvas-targeted
      // pointer events; detach them from the same target we added them to.
      window.removeEventListener('pointerdown', onPointerDownSun);
      window.removeEventListener('pointerup', onPointerUpSun);
      window.removeEventListener('pointercancel', cancelHold);
      window.removeEventListener('pointerleave', cancelHold);

      // Each rig disposes its own geos + materials (and, for post, the composer +
      // bloom + grade material) — construction and teardown are now co-located in
      // the build*() factories, so this just calls each rig's dispose().
      postRig.dispose();
      diskRig.dispose();
      starRig.dispose();
      distantStarRig.dispose();
      warpRig.dispose();
      streakRig.dispose();
      ringRig.dispose();
      sunRig.dispose();
      gravitySim.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
    { hitTestGiant },
  );
  return dispose;
}

// ---------------------------------------------------------------------------
//  The manifesto — one beat per lifecycle state (six states, six beats, each
//  roughly one viewport tall), pinned over the canvas and cross-faded as the
//  scroll morph passes its window.
//
//  The timeline + copy themselves (the ManifestoBeat shape, the BEATS array,
//  and the derived STAGE_COUNT / BUILT_STAGES) live in ./beats so the SSR
//  fallback and scroll track in index.astro share one source of truth with this
//  live overlay; see that module for the full narrative rationale.
// ---------------------------------------------------------------------------
