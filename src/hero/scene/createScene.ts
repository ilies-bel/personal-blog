// The scene controller: builds renderer/camera + all rigs, runs the per-frame loop, tears down.
import * as THREE from 'three';
import { CFG, tuneParticlesForDevice, tuneRenderPixelRatio } from '../lib/config';
import { DEBUG_WINDOW_KEYS, readDebugNumber } from '../lib/constants';
import { lifecycle, easeOut, smoothstep01 } from '../lifecycle';
import { buildGravitySim, type GravitySim } from '../gravitySim';
import { cameraPoseForProgress, progressForLegacyStage } from '../timeline';
import { STAR_BACK_BASE_BRIGHT, buildSunRig } from './buildSunRig';
import { buildDisk } from './buildDisk';
import { buildStarfield, buildDistantStar } from './buildStarfield';
import { buildWarp } from './buildWarp';
import { buildStreak } from './buildStreak';
import { buildRing } from './buildRing';
import { buildPostChain } from './buildPostChain';
import type { SceneHandle, SceneHooks } from './types';

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
  // TRUE world radius is uGiantR (4.2) × uGiantScale (8.5/4.2) = 8.5 units (the held
  // medium-dense giant, trimmed ~6% from 9.0). So the dying star lands at 8.5 × 0.18 ≈
  // 1.53 — the exact size the cloud shrinks to. NOTE: the cloud's grow factor in the
  // vertex shader (`mix(0.18, 1.0, uYrGrow)`) MUST equal this 0.18 so the gold particle
  // sphere is size-matched to the mesh at the swap (no pop). Keep this uGiantScale in
  // sync with buildDisk + lifecycle's GIANT_FULL.
  const RED_GIANT_RADIUS = 4.2 * (8.5 / 4.2); // = 8.5; uGiantR × uGiantScale (held giant)
  const SUN_RIG_RADIUS = RED_GIANT_RADIUS * 0.18; // dying star: small grow anchor ≈ 1.53
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
  // Red-giant camera-composition offset. The forward camera rig owns the real pose;
  // this baked world vector slides the camera (and its look target) by the same
  // amount during the red-giant beat to frame the grown orb off-centre without
  // moving the star geometry (the orb stays centred at origin).
  const RED_GIANT_PARK = new THREE.Vector3(0, 0, 0);

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
  // Instead we intersect an invisible sphere at the world origin (the giant is centred
  // there — RED_GIANT_PARK is (0,0,0) and the point cloud has no parent transform, so
  // world space == the giant's spun frame). A SEPARATE pool/uniforms keeps the two
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
  // uGiantR × uGiantScale, the held ≈8.5-unit giant). Returns whether it hit and,
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
      // The giant is centred at the origin (RED_GIANT_PARK = (0,0,0)) and the point
      // cloud has no parent transform, so world == the giant's spun frame. Effective
      // world radius = uGiantR × uGiantScale (the held medium-dense giant, ≈8.5). The
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
    const follow = reduced ? 1 : 0.28;
    const progressTarget = Math.max(0, Math.min(1, hooks.getProgress?.() ?? progress));
    progress += (progressTarget - progress) * follow;
    const stageTarget = hooks.getStage();
    stage += (stageTarget - stage) * follow;
    // DEBUG: window.__bhMorph forces the stage to an exact value (no smoothing)
    // so the explosion can be inspected frame-by-frame from a capture script.
    const morphOverride = readDebugNumber(DEBUG_WINDOW_KEYS.morph);
    if (typeof morphOverride === 'number') {
      stage = morphOverride;
      progress = progressForLegacyStage(morphOverride);
    }
    // `morph` (= min(1, stage)) drives the transition-1 uniforms below;
    // lifecycle() recomputes it from the same formula for the look scalars.
    const morph = Math.min(1, stage);              // transition 1 progress (0..1)

    // --- transition 1: reverse supernova ---
    diskMatPrimary.uniforms.uMorph.value = morph;
    diskMatSecondary.uniforms.uMorph.value = morph;
    ringMat.uniforms.uMorph.value = morph;
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
    focusGlow += ((focusTarget ? 1 : 0) - focusGlow) * (reduced ? 1 : 0.08);
    const focusEmission = 1 + focusGlow * 0.18;
    const focusBloom = 1 + focusGlow * 0.12;

    // the particle-side shock-breakout glow follows the SAME time envelope, so
    // the additive blast core peaks together with the screen whiteout. The shader's
    // morph gates (smoothstep(0.40,0.50,uMorph), flashGate) still apply, so the seed
    // stays dark before the breakout regardless of `nova`.
    diskMatPrimary.uniforms.uFlash.value = look.flash;
    diskMatSecondary.uniforms.uFlash.value = look.flash;
    // surface-collapse progress (0 full red-giant sphere → 1 collapsed to the point)
    diskMatPrimary.uniforms.uCollapse.value = look.kCollapse;
    diskMatSecondary.uniforms.uCollapse.value = look.kCollapse;
    // black-hole geometric shrink: the disk physically CONTRACTS toward the origin as
    // the hole implodes, so it reads as visibly smaller (not just farther). 1 at the
    // hero / past the breakout; the shader gates it to the black-hole state.
    diskMatPrimary.uniforms.uBlackHoleScale.value = look.blackHoleScale;
    diskMatSecondary.uniforms.uBlackHoleScale.value = look.blackHoleScale;

    // --- transitions 3-5: yellow star → nebula → pale blue dot ---
    // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
    // slot snaps to that state's stand-in at the stage midpoint (see lifecycle.ts
    // for look.yellow/look.nebula/look.dot). Replace this block (and the matching shader
    // placeholders, marked "REVIEW PLACEHOLDER") with the real morphs later; the
    // timeline placement stays the same.

    // --- transition 2: red giant (held at 1 once a later placeholder takes over) ---
    diskMatPrimary.uniforms.uGiant.value = look.giantHeld;
    diskMatSecondary.uniforms.uGiant.value = look.giantHeld;
    // Red-giant SIZE is a RED-GIANT-ONLY scale (uGiantScale) so resizing the orb never
    // balloons the nebula/dot/sun states or the gravity-sim seed (all share the base
    // uGiantR). lifecycle.giantScale ramps it from a SMALL newborn star (tiny vs the black
    // hole) up to the full bloated size as the camera comes in (the scale-contrast reveal).
    diskMatPrimary.uniforms.uGiantScale.value = look.giantScale;
    diskMatSecondary.uniforms.uGiantScale.value = look.giantScale;
    // The orb stays centred (uGiantCenter = origin); its off-centre FRAMING is the
    // baked camera park below (RED_GIANT_PARK), not a geometry move — the star is at origin.
    // Axial spin: roll the red-giant photosphere on its own tilted pole (≈23°) at a
    // slow, cinematic rate (~60 s / rotation). t accumulates seconds, so the angle
    // grows monotonically; the shader gates it to the displayed red giant only.
    const giantSpin = reduced ? 0 : t * RED_GIANT_SPIN_RATE;
    diskMatPrimary.uniforms.uGiantSpin.value = giantSpin;
    diskMatSecondary.uniforms.uGiantSpin.value = giantSpin;
    // The POINT CLOUD is always the RED GIANT (its grainy body), never the yellow
    // star — the yellow star is the mesh sun rig. So the cloud's uYellow stays 0;
    // the look.yellow flag still gates the timeline (laterActive / grade) inside lifecycle.
    diskMatPrimary.uniforms.uYellow.value = 0;
    diskMatSecondary.uniforms.uYellow.value = 0;
    // uNebula is 1 across the real nebula AND the gravitational-collapse window so
    // the cloud holds the analytic nebula placement (the sim's seed/home) while the
    // sim collapses it inward via uSimBlend below.
    diskMatPrimary.uniforms.uNebula.value = look.nebulaShader ? 1 : 0;
    diskMatSecondary.uniforms.uNebula.value = look.nebulaShader ? 1 : 0;
    diskMatPrimary.uniforms.uDot.value = look.dot ? 1 : 0;
    diskMatSecondary.uniforms.uDot.value = look.dot ? 1 : 0;

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
    diskMatPrimary.uniforms.uSimBlend.value = simBlend;
    diskMatSecondary.uniforms.uSimBlend.value = simBlend;
    // nebula light model strength (ambient+depth+self-occlusion). Always full; the
    // factor only touches nebula particles. DEBUG: window.__bhNebLight pins it (0 =
    // flat self-emission, 1 = full light model) so the look can be A/B'd live.
    const nebLightOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebLight);
    const nebLightValue = typeof nebLightOverride === 'number' ? nebLightOverride : 1;
    diskMatPrimary.uniforms.uNebLight.value = nebLightValue;
    diskMatSecondary.uniforms.uNebLight.value = nebLightValue;

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
    diskMatPrimary.uniforms.uYrFlash.value = look.yrFlash;
    diskMatSecondary.uniforms.uYrFlash.value = look.yrFlash;

    // grow + colour curves default to 1 (no-op) outside cloudSide.
    diskMatPrimary.uniforms.uYrGrow.value  = look.cloudSide ? look.yrGrow  : 1;
    diskMatSecondary.uniforms.uYrGrow.value = look.cloudSide ? look.yrGrow  : 1;
    diskMatPrimary.uniforms.uYrMix.value   = look.cloudSide ? look.yrColor : 1;
    diskMatSecondary.uniforms.uYrMix.value = look.cloudSide ? look.yrColor : 1;

    // The MESH holds small + fully gold across its whole side (no early redden,
    // no early shrink) — all the growing/cooling is the cloud's job now. This
    // removes the dual-schedule overlap that caused the two-entity + flicker bugs.
    // GRAVITATIONAL-COLLAPSE handoff: while the nebula collapses to feed the star
    // (look.starFormed 0→1) the mesh GROWS from a tiny core to full size as the gas
    // accretes onto it (the star is fed into existence), hidden under the bloom +
    // the bright converging cloud. Outside the window it sits at full size.
    const growing = look.starFormed > 0 && look.starFormed < 1;
    sunRig.group.scale.setScalar(look.starFormed > 0 ? 0.05 + 0.95 * look.starFormed : 1.0);
    // HOT YOUNG STAR: blue-white while still small/forming (mass→heat), cooling to
    // gold as it reaches full size. Stays blue through most of the growth and only
    // cools to gold near full size (1 - starFormed² holds the blue longer) so the
    // young-star colour actually reads before it settles.
    sunRig.surfaceMat.uniforms.uBlue.value = look.starFormed > 0 ? 1 - look.starFormed * look.starFormed : 0;
    sunRig.surfaceMat.uniforms.uRed.value = 0;
    sunRig.coronaMat.uniforms.uRed.value = 0;
    // FLARES (coronal loops + corona haze) only AFTER the star is fully sized:
    // suppressed entirely while growing, ramping in over the last 3% of growth so
    // the young forming star is a clean orb, not a flaring one. 1 outside the window.
    const flarePresence = look.starFormed > 0 ? smoothstep01((look.starFormed - 0.97) / 0.03) : 1;
    // The yellow star is now an ENERGETIC main-sequence beat (cf. the reference's
    // erupting prominences + coronal loops), so the settled star runs its flares at
    // FULL strength — no more dying-star quieting. flarePresence still suppresses
    // them while the young star is forming so it reveals as a clean orb first.
    sunRig.loopMat.uniforms.uFade.value = flarePresence;
    sunRig.coronaMat.uniforms.uFade.value = flarePresence;
    // the glow shell cools blue→gold with the star as it grows. setRGB mutates the
    // existing THREE.Color in place (no allocation); the settled branch only writes
    // when it actually changes (`glowSettled` latch) so the constant gold isn't
    // re-set every frame while the star holds.
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
    sunRig.starMat.uniforms.uOpacity.value = 1;

    // Mesh visible across its side, plus a short overhang into the bright flash so
    // the handoff cross-dissolves under the bloom rather than hard-cutting. The
    // gold particle sphere appears at/just-below the peak (cloudSide) under the
    // same flash → the two textures are never both clearly visible.
    sunRig.group.visible = look.sunRigVisible;
    // CLICK ERUPTIONS gate: the star is clickable only when its mesh is shown AND it
    // is fully formed (not growing) — i.e. the settled yellow star or the red-giant
    // hold while the mesh is up. Read by the pointerdown handler (which lives outside
    // frame()) so a click while the nebula/forming/black-hole is on screen does nothing.
    sunClickable = sunRig.group.visible && !growing;
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
    // The twinkling star backdrop dome is a SEPARATE scene object, so it can sit
    // behind BOTH the yellow star (mesh rig) and the RED GIANT (point cloud) — the
    // two states share one star field — while staying hidden for the black hole
    // (which keeps the warping lensed starfield), the nebula, the dot and the
    // collapse window. See look.starBackVisible in lifecycle().
    sunRig.starBack.visible = look.starBackVisible;
    // Compensate the dome's brightness for the red giant's dimmer post grade so the
    // shared star field reads the SAME behind both star states (see starBackBright).
    sunRig.starMat.uniforms.uBright.value = STAR_BACK_BASE_BRIGHT * look.starBackBright * (1 + focusGlow * 0.08);
    // Outside the yellow⇄red slot the cloud renders the red giant, the nebula AND
    // the pale-blue-dot. Inside the slot, the cloud body only shows on the cloud
    // side (the opaque mesh owns the yellow side).
    diskPrimary.visible = look.cloudShown;
    diskSecondary.visible = look.cloudShown;
    // Hide the lensed background starfield while the opaque mesh body is present
    // (it would bleed through); restore it once the cloud body takes over. ALSO
    // hide it across the NEBULA (the gas cloud sits alone against pure black).
    starPts.visible = look.starPtsVisible;

    // the star/warp lensing only makes sense while the hole exists — fade it (the
    // look.lensLive ramp + look.starBright are computed in lifecycle()). Once the SUN
    // forms we drop the gravitational-warp background entirely and restore the plain
    // starfield to full brightness (look.starBright) behind the star.
    starMat.uniforms.uStarBright.value = look.starBright;
    distantStarPts.visible = !look.gravityGone && stage < 0.45;
    distantStarUniforms.uPresence.value = distantStarPts.visible ? 1 - smoothstep01((stage - 0.08) / 0.34) : 0;
    // Completely remove ALL gravity once the star forms (look.gravityGone): the warp
    // arcs, the secondary (lensed) disk image, and the photon ring are switched off
    // — a star has no event horizon bending light around it. The plain (un-lensed)
    // starfield behind it is restored via uStarBright above. Below ~giant 0.02 these
    // are gone entirely.
    warpSeg.visible = !look.gravityGone;
    warpSeg2.visible = !look.gravityGone;
    diskSecondary.visible = !look.gravityGone;   // no lensed disk ghost behind the star
    ringPts.visible = !look.gravityGone;          // no photon ring around the star
    starSecPts.visible = false;              // secondary lensed star image stays off

    // --- hyperspace streaks: the nebula → beginning-dot jump to lightspeed ----
    // The nebula's own gas grains trail into long radial Star Wars lanes during the
    // dezoom out to the beginning dot. look.streak is the intensity hump over the
    // window (0 elsewhere), so the streak rig is only present while it's hot. The
    // trail DIRECTION (rushing OUT toward the dot vs pulling IN toward the nebula) is
    // latched from the eased-stage velocity on a deadzone, so a fast scroll either
    // way flows the lanes the matching way and a parked frame holds the last flow
    // instead of stuttering (mirrors the supernova blast-direction latch).
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
    const streakGasDim = 1 - 0.6 * streakValue;
    // The point-cloud red giant body renders at full base brightness; in the
    // yellow→red slot it simply appears under the swap flash (no ramp-in — its
    // gold→red look is driven by uYrMix/uYrFlash in the shader, not by emission).
    // Collapse cloud brightness (look.cloudBright): inside the collapse window it
    // brightens the converging infall (light pouring into the star) then fades the
    // cloud out as the mesh star forms — clean handoff. Exactly 1 outside the window.
    diskMatPrimary.uniforms.uBright.value = look.baseBright * look.cloudBright * focusEmission * streakGasDim;
    diskMatSecondary.uniforms.uBright.value = look.baseBright * look.cloudBright * focusEmission * streakGasDim;
    // Bloom + auto-exposure + grade + disk-saturation are all resolved by
    // lifecycle() (including the sun / red-giant / nebula branch overrides), so the
    // shell just assigns the finals. See lifecycle.ts for the per-beat reasoning
    // (the nebula branch carries the SHO-palette grade tuning).
    //
    // The old `preFlashDarken`/`nebulaDark` block that greyed bloom + exposure
    // across stage ~3.13–3.47 has been REMOVED: it existed only to set up the
    // nebula whiteout, and with that flash gone it just dimmed the frame to grey
    // exactly as the nebula appeared. The nebula now reads at its own graded
    // brightness with no pre-darken dip. `nebulaFlash` is the debug-only hook.
    bloom.strength = look.bloomStrength * focusBloom + nebulaFlash * 0.18;
    bloom.radius = look.bloomRadius;
    gradePass.uniforms.uExposure.value = look.exposure;
    gradePass.uniforms.uOlive.value = look.olive;
    gradePass.uniforms.uWarmth.value = look.warmth;
    gradePass.uniforms.uSat.value = look.gradeSat;
    gradePass.uniforms.uToneComp.value = look.toneComp; // tone-map compression (low for red giant)
    gradePass.uniforms.uGrain.value = look.grain; // per-state film grain (0 in the nebula)
    diskMatPrimary.uniforms.uSat.value = look.diskSat;
    diskMatSecondary.uniforms.uSat.value = look.diskSat;

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
    if (RED_GIANT_PARK.lengthSq() > 0 && progress >= 0.46 && progress <= 0.62) {
      camera.position.add(RED_GIANT_PARK);
      frameLookTarget.add(RED_GIANT_PARK);
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
