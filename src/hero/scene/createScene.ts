// The scene controller: builds renderer/camera + all rigs, runs the per-frame loop, tears down.
import * as THREE from 'three';
import { CFG, tuneParticlesForDevice, tuneRenderPixelRatio, type DeviceTier } from '../lib/config';
import { DEBUG_WINDOW_KEYS, SCENE_READY_EVENT, readDebugNumber } from '../lib/constants';
import { lifecycle, easeOut, smoothstep01, type StarState } from '../lifecycle';
import { GIANT_RADIUS_SCALE, YELLOW_RED_RADIUS_RATIO } from '../transitions';
import { buildGravitySim, type GravitySim } from '../gravitySim';
import { cameraPoseForProgress, progressForLegacyStage } from '../timeline';
import { beatIdForLifecycleP, easeInQuart } from '../sceneTable';
import { lifecycleProgress } from '../scroll';
import { STAR_BACK_BASE_BRIGHT, buildSunRig } from './buildSunRig';
import { buildDisk } from './buildDisk';
import { buildStarfield, buildDistantStar } from './buildStarfield';
import { buildWarp } from './buildWarp';
import { buildStreak } from './buildStreak';
import { buildRing } from './buildRing';
import { buildPostChain } from './buildPostChain';
import { WebGLUnavailableError, type SceneHandle, type SceneHooks, type DiveOptions, type Rig } from './types';

/**
 * Lightweight WebGL-availability probe, run BEFORE constructing THREE.WebGLRenderer.
 * The renderer needs at least a WebGL1 context (the GPGPU collapse sim wants WebGL2
 * but already degrades to a no-op when float targets are missing — see gravitySim),
 * so we only require that SOME webgl context is obtainable. We make a throwaway
 * <canvas> and ask for 'webgl2', then 'webgl', then the legacy 'experimental-webgl';
 * if none answer, WebGL is unavailable/blocked and the caller goes straight to the
 * fallback without ever allocating the real renderer. SSR-safe: it touches `document`
 * only when called (createScene runs in a browser effect), never at module load. Any
 * throw from getContext (some locked-down browsers throw rather than return null) is
 * swallowed → treated as "unavailable". The probe canvas is not attached to the DOM,
 * so it is collected with no teardown.
 */
function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(
      probe.getContext('webgl2') ||
        probe.getContext('webgl') ||
        probe.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

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

export function createScene(container: HTMLElement, reduced: boolean, hooks: SceneHooks, tier: DeviceTier = 'high'): SceneHandle {
  const diskParticles = tuneParticlesForDevice(tier);
  const bCritShadow = 2.598; // (3√3/2) rs — shadow radius (informational)
  void bCritShadow;

  // --- renderer / scene / camera ---
  // GRACEFUL WebGL FAILURE. The renderer is the FIRST resource built, so nothing
  // needs disposing if it fails — but we still fail cleanly: probe for a context up
  // front (so a no-WebGL device never even constructs THREE.WebGLRenderer), and wrap
  // the construction itself in try/catch (some environments pass the probe but still
  // throw on the real renderer — context-creation race, lost GPU). Either way we
  // throw a TYPED WebGLUnavailableError (never a raw GL string) so HeroIsland's
  // dynamic-import `.catch()` can recognise it and show the on-brand fallback instead
  // of letting an unhandled rejection crash the mount. The normal (WebGL-works) path
  // is byte-for-byte identical: the probe returns true and the try block runs the
  // exact same constructor as before.
  if (!isWebGLAvailable()) {
    throw new WebGLUnavailableError();
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error: unknown) {
    // Nothing else is built yet, so there is nothing to dispose; surface the typed
    // error (preserving the original cause for diagnostics) for the caller to handle.
    throw new WebGLUnavailableError(
      error instanceof Error ? `WebGL renderer creation failed: ${error.message}` : undefined,
    );
  }
  renderer.setPixelRatio(tuneRenderPixelRatio(reduced, tier));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Boot clear is plain black; from the first applyLook on, every frame clears to
  // the scene's own near-black ROOM TINT (look.roomTint — see lifecycle.ts).
  renderer.setClearColor(0x000000, 1);
  const roomTintColor = new THREE.Color();
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

  const diskRig = buildDisk(scene, diskParticles, pixelRatio, tier === 'low');
  const diskMatPrimary = diskRig.primary;
  const diskMatSecondary = diskRig.secondary;
  const diskPrimary = diskRig.primaryPts;
  const diskSecondary = diskRig.secondaryPts;

  const starRig = buildStarfield(scene, diskParticles, pixelRatio, tier === 'low');
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

  // High builds the full RenderPass→Bloom→Grade→Nova. The low tier gets a CHEAP
  // bloom — the SAME pass, but its mip pyramid renders at quarter resolution
  // (bloomScale 0.5), which is far cheaper AND softer: the low-res blur spreads, so
  // it smooths the sparse low-tier grains into a glow (the chunky/speckly red giant
  // was caused by REMOVING bloom, the very effect that smooths grains). postRig.bloom
  // is now NON-null on low too, so the guarded `if (bloom)` writes in applyLook run.
  const postRig = buildPostChain(renderer, scene, camera, tier === 'low' ? 'cheap' : 'full');
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
  // reduced motion; {available:false} (no-op) if float targets are unsupported. The low
  // tier also skips the bake (the GPGPU flipbook is a heavy load-time cost) and falls
  // back to the same no-op — the collapse just plays its analytic path with no sim sample.
  const noopGravitySim: GravitySim = { available: false, step: () => {}, bake: () => {}, isBaked: () => false, sampleAt: () => null, dispose: () => {} };
  const gravitySim: GravitySim = reduced || tier === 'low'
    ? noopGravitySim
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
    renderer.setPixelRatio(tuneRenderPixelRatio(reduced, tier));
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
  const RED_GIANT_NUDGE_IN: readonly [number, number] = [0.23, 0.33];
  const RED_GIANT_NUDGE_OUT: readonly [number, number] = [0.36, 0.43];

  // --- AUTONOMOUS-ACCELERATED DOLLY-BACK (black-hole load) --------------------
  // A TIME-BASED backward dolly that runs on load while the black-hole chapter is on
  // screen (raw scroll 0-14%): the camera pulls AWAY from the event horizon on its own
  // over ~DOLLY_DUR seconds, asymptotes to a bounded MAX_BACK, then HOLDS (settles —
  // it does not drift forever or loop). Scrolling DEEPER into the chapter ACCELERATES
  // the retreat (a scroll-POSITION term that can push it faster/further within the
  // same bound); the autonomous wall-clock drift is the FLOOR. NO scroll-velocity is
  // read anywhere. Composed as a TRUE dolly (move along the view->target axis), faded
  // out as the chapter is left so there is no pop, and fully disabled under reduced
  // motion (snap to the held pose). See the application block in frame().
  const DOLLY_MAX_BACK = 7.0;   // world units of backward travel at full retreat
  const DOLLY_DUR = 4.0;        // seconds for the autonomous ease to reach MAX_BACK
  const DOLLY_CHAPTER_END = 0.15; // raw progress: black-hole chapter upper edge (ITEM 9: 0-15%)
  const DOLLY_FADE_END = 0.21;  // raw progress: offset fully faded out by here (no pop)
  // Scratch vectors reused each frame so the dolly never allocates on the hot path.
  const dollyDir = new THREE.Vector3();
  const dollyTarget = new THREE.Vector3();
  // Reused each frame for the red-giant→yellow uGiantCenter shrink drift (set in place,
  // never re-allocated) so the hot-path stays allocation-free. Defaults to origin → no-op.
  const giantCenter = new THREE.Vector3(0, 0, 0);

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

  // Sun-mesh hit-test: mirrors the intersectObject call in onPointerDownSun for the
  // yellow-star photosphere mesh. Reuses the shared scratch ndc/raycaster (same as
  // giantSphereHit) — no per-call allocation. Called by hitTestGiant only when
  // sunClickable is true (the settled yellow star or red-giant hold while the mesh is
  // visible), so the hexagon cursor never appears during dive/transition beats.
  const sunMeshHit = (clientX: number, clientY: number): boolean => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    eruptPointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    eruptRaycaster.setFromCamera(eruptPointerNdc, camera);
    return eruptRaycaster.intersectObject(sunRig.surface, false).length > 0;
  };

  // Cursor hit-test exposed to HeroIsland (→ window.__bhHitGiant → the custom
  // cursor's hexagon). Returns true for EITHER clickable body:
  //   • the settled, full-size, idle red giant (redGiantClickable + giantSphereHit)
  //   • the settled yellow-star photosphere mesh (sunClickable + sunMeshHit)
  // Both use the same beat gates as their respective click paths, so the hexagon
  // only appears during a resting/clickable beat AND over the body's projected surface.
  const hitTestGiant = (clientX: number, clientY: number): boolean =>
    (redGiantClickable && giantSphereHit(clientX, clientY)) ||
    (sunClickable && sunMeshHit(clientX, clientY));

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

  // --- render-on-change gating (idle CPU win) -------------------------------
  // A visitor reading a manifesto line is NOT scrolling, yet every idle rAF tick
  // still runs the full ease→look→applyLook→render (bloom) pipeline. When NOTHING
  // visible is moving we skip the heavy work + the render entirely. The previous
  // eased stage/progress are tracked here so a settled scroll (delta below EPS) can
  // be detected; a fresh scroll moves them past EPS and the next frame runs full.
  // EPS is small because the follow-ease ASYMPTOTES toward target — it never lands
  // exactly, which is precisely why an unconditioned loop never rests.
  let prevFrameStage = stage;
  let prevFrameProgress = progress;
  const STATIC_EPS = 1e-4;
  // While static we still render on a slow HEARTBEAT so a late async texture/restore
  // (or a focus-glow ease still settling) eventually composites; `lastRenderTime`
  // is the wall-clock of the last frame that actually rendered.
  let lastRenderTime = 0;
  const STATIC_HEARTBEAT_MS = 500;
  // LOW-tier frame cap: target ~30fps rather than chasing 60 and stuttering. The
  // margin trims the threshold so a frame landing a hair early still renders (we'd
  // rather hit 30 than drop to 20 by over-waiting). High tier is never capped.
  const LOW_FRAME_MS = 1000 / 30 - 2;

  // --- cinematic dive: plunge the LIVE camera INTO the clicked marker, soft bloom --
  // A one-shot state machine driven entirely from frame(): once beginDive() arms
  // it, the dive OVERRIDES the resolved scroll camera each frame — easing the live
  // pose toward (and THROUGH) the world origin while turning the look target to FACE
  // the clicked marker's on-screen point (so an off-centre marker centres + grows),
  // and an overlay strength ramps to a soft cap. onApex fires once at DIVE_APEX_FRAC
  // so the caller (HeroIsland) can SPA-navigate under the veil. A non-active dive is a
  // perfect no-op: the override block only runs while diveActive is true, so the
  // scroll camera is untouched.
  let diveActive = false;
  let diveStart = 0;
  let diveApexFired = false;
  let diveOnApex: (() => void) | null = null;
  let diveOnProgress: ((s: number) => void) | null = null;
  // Scratch vectors created ONCE (the dive must not allocate on the hot path). The
  // FROM pose is snapshotted from the live camera at beginDive() so the plunge
  // starts seamlessly from wherever the scroll pose currently is.
  const diveFromPos = new THREE.Vector3();
  const diveFromTarget = new THREE.Vector3();
  // The world point the dive AIMS at — derived ONCE in beginDive() by unprojecting
  // the caller's targetNdc onto the star's depth plane (so it sits directly under the
  // clicked marker, at the same distance from camera as the world origin). The dive
  // turns the look target toward it as it falls in, so an off-centre marker centres +
  // grows. Defaults to the world origin (a centred plunge) when no targetNdc is given.
  const diveTargetWorld = new THREE.Vector3();
  // Scratch only for the unproject math in beginDive(); never read on the hot path.
  const diveAimScratch = new THREE.Vector3();
  // The 0..1 overlay strength published via diveOnProgress; 0 whenever no dive runs.
  let diveStrength = 0;
  // Plunge timing. The apex (bloom peak / navigate point) lands at 82% of the run,
  // leaving a short tail of camera travel hidden under the full-white overlay while
  // the destination page loads. Reduced motion skips the geometric plunge entirely
  // and just runs a brief white fade (DIVE_REDUCED_S).
  //
  // ORDER OF SENSATION (the "no dive, just a white flash" fix): the CAMERA must lead
  // and the WHITE must trail — otherwise the screen blooms before anything visibly
  // moves and the plunge is invisible. So the position lerp uses a FRONT-LOADED ease
  // (easeOut — most of the travel is spent in the first ~30% of the run, so the camera
  // LEAPS toward the star immediately) while the white overlay holds near zero until
  // DIVE_WHITE_START of the run and only THEN ramps hard (easeInQuart of the remaining
  // window to the apex). The visitor sees a clear ~0.6-0.7s plunge with little white,
  // then the bloom takes over and dominates at the apex.
  //
  // The run is lengthened to 1.5s (from 1.2) so the leading plunge reads as a real
  // fall rather than a snap, and the white still has room to dominate before the apex.
  const DIVE_DURATION_S = 1.5;
  const DIVE_APEX_FRAC = 0.82;
  const DIVE_REDUCED_S = 0.28;
  // The white overlay stays ~dark until the plunge is this far along, then ramps to
  // its capped peak over the rest of the run-to-apex. This is what keeps the camera
  // move visible FIRST and the bloom LAST (the inverse of the original front-loaded
  // white). Pushed LATER (0.55) so the camera plunge dominates and the wash is brief —
  // the visitor sees a clear fall down the throat, and the veil only appears as a soft
  // glow near the apex, matching the wanted "faint, brief wash rather than a full
  // whiteout". The bloom still begins just as the camera reaches the core, covering the
  // moment the bright accretion disk would recede behind the camera.
  const DIVE_WHITE_START = 0.55;
  // The bloom is a SOFT VEIL, not a whiteout. The published overlay strength is scaled
  // by this peak cap so that even at the apex the overlay never reaches full opaque
  // white — you can still faintly see the scene/plunge glowing through it. This is the
  // single source of the cap (scaled here before onDiveProgress, not in HeroIsland), so
  // both the geometric dive and the reduced-motion fade get the same gentle ceiling.
  // The apex (navigate) trigger stays on the UNCAPPED `raw` below, so this only changes
  // the visible whiteness, never the navigation timing. 0.62 reads as a soft luminous
  // veil over a dark, moody site — present enough to feel like a deliberate bloom you
  // can still see the plunge through, never the blinding #fff whiteout it replaced.
  const DIVE_WHITE_PEAK = 0.62;
  // The plunge falls toward (and just PAST) the world origin where the star sits, so the
  // camera reads as falling THROUGH the event horizon, not braking on its face. From the
  // new TOP-of-page black-hole pose the live camera sits ~z=22 (plus the autonomous
  // black-hole dolly-back, so up to ~z=29) looking at the origin; driving it to z=-2 just
  // past the core is a ~24-31 unit dolly straight down the view axis — an unmistakable
  // plunge that still keeps the bright disk filling the frame deep into the fall (a
  // larger overshoot flies out the far side into empty starfield before the bloom lands).
  // The look target settles on the exact origin so the fall stays aimed down the throat.
  const DIVE_THROUGH_POS = new THREE.Vector3(0, 0, -2);
  // The FOV narrows from CFG.fovDeg (30) toward this during the plunge for a tunnel /
  // "drawn-in" feel — a longer lens compresses depth as the core rushes up. Tasteful
  // (~9° narrowing), not a fisheye. Reduced motion never touches FOV (no geometric dive).
  const DIVE_FOV_MIN = 21;
  // The plunge is the original straight fall-through, but the approach ARCS sideways so
  // it reads as a small orbital swing rather than a dead-straight punch-in. The camera's
  // start pose is rotated a few degrees AROUND the world origin (about the up axis) at
  // the start of the run, decaying to zero as it reaches the core (the arc weight is
  // 1 - k) — so early on the camera is offset to one side and swings back onto the throat
  // as it falls. The camera starts on the RIGHT side of the throat (world -X, which is
  // screen-right for the +Z dive camera): the STAR ENTERS FROM THE RIGHT and the camera
  // swings it back to centre — the approach curves in from the right. Negative angle
  // (three.js rotates about +Y right-hand / CCW-from-above, so a negative angle puts the
  // camera at world -X). Flip the SIGN to curve in from the left instead.
  const DIVE_ORBIT_DEG = -14;
  // The world up-axis the dive's orbital arc rotates the camera around. Constant vector,
  // never mutated (applyAxisAngle reads it), so it is safe to share across frames.
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

  // --- WebGL context loss / restore ----------------------------------------
  // A mid/low GPU under memory pressure can drop the WebGL context at any time
  // (`webglcontextlost`). Two things are mandatory: (1) call preventDefault() —
  // WITHOUT it the browser never fires `webglcontextrestored`, so the context is
  // permanently dead; (2) STOP the render loop, because rendering against a lost
  // context is a stream of GL errors. We park the loop the SAME way the hidden-tab
  // pause and dispose do: set `stopped` and cancel the pending rAF (the frame() body
  // also early-returns on `stopped`). We then notify the caller so it can swap the
  // frozen canvas for the on-brand fallback DOM (mirroring the no-WebGL-at-mount path).
  //
  // IMPLEMENTED here: preventDefault + pause + onContextLost. On `webglcontextrestored`
  // we best-effort RESUME the loop (clear `stopped`, re-kick frame()) and notify the
  // caller — three.js re-initialises its own GL state for the standard rigs on the next
  // render. FOLLOW-UP (not done here, deliberately): a full resource RE-UPLOAD of the
  // baked GPGPU collapse flipbook (gravitySim) + the post-chain FBOs. Because that
  // re-bake is non-trivial and a half-restore could show a corrupt scene, the caller
  // (HeroIsland) keeps the fallback note up after a restore rather than trusting a
  // partial recovery — a clean "paused + message" beats a broken restore.
  const onContextLost = (event: Event): void => {
    // REQUIRED: keep the context restorable. Without preventDefault the GPU discards
    // it for good and `webglcontextrestored` never fires.
    event.preventDefault();
    // Park the loop exactly like the hidden-tab pause: stop scheduling + drop the
    // pending frame so no render runs against the dead context.
    stopped = true;
    cancelAnimationFrame(raf);
    raf = 0;
    hooks.onContextLost?.();
  };
  const onContextRestored = (): void => {
    // Best-effort resume of the STANDARD rigs: unpark and re-kick the loop. The GPGPU
    // flipbook / FBOs are not re-baked here (the documented follow-up), so the caller
    // decides whether to trust the resumed scene or keep the fallback up.
    if (!stopped) return; // already running (defensive; shouldn't happen)
    stopped = false;
    if (raf === 0 && !document.hidden) frame();
    hooks.onContextRestored?.();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

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
    // uNebula spans the real nebula AND the whole collapse handoff: the window plus its
    // FLOOR crossfade (lifecycle holds the collapse geometry simBlend>0 across the crossfade
    // via inWindowGeo, so nebulaShader stays true there). This keeps the cloud reading as
    // converging nebula gas through the floor — instead of the disk shader falling back to
    // its red-giant default and flashing a full red giant behind the forming yellow star.
    setDisk('uNebula', look.nebulaShader ? 1 : 0);
    setDisk('uDot', look.dot ? 1 : 0);
    setDisk('uNebulaGrow', look.nebulaGrow);
    // resolved sim blend (after the gravity-sim sample) + nebula light model strength.
    setDisk('uSimBlend', ctx.simBlend);
    setDisk('uNebLight', ctx.nebLight);
    // global collapse DENSITY fade — the post-floor multiply that actually empties the
    // gas as it agglomerates onto the forming star (uBright can't: the frag's per-grain
    // intensity floors hold a residue that a million additive grains re-stack into a
    // full cloud). 1 (no-op) outside the collapse window.
    setDisk('uNebFade', look.nebFade);

    // --- yellow star → red giant: FLASH-SWAP transition ----------------------
    setDisk('uYrFlash', look.yrFlash);
    // grow + colour curves default to 1 (no-op) outside cloudSide.
    setDisk('uYrGrow', look.cloudSide ? look.yrGrow : 1);
    setDisk('uYrMix', look.cloudSide ? look.yrColor : 1);

    // disk base emission (folds the stateful focus/streak multipliers via ctx).
    // CROSS-DISSOLVE: cloudW (1 outside the swap band, 1→0 across it) fades the cloud's
    // emission OUT as the mesh fades in, so the gold cloud ball dissolves into the gold
    // mesh with no hard flip. It is 1 everywhere except the tight swap band, so this is a
    // no-op outside it (and the body is hidden entirely once cloudW→0 via cloudShown).
    setDisk('uBright', look.baseBright * look.cloudBright * look.cloudW * ctx.focusEmission * ctx.streakGasDim);
    // disk in-shader saturation (after the sun/nebula overrides resolved in lifecycle).
    setDisk('uSat', look.diskSat);

    // --- sun-rig look (mesh yellow star + shared star backdrop dome) ----------
    // young forming star grows from a tiny SEED to full size as the gas accretes.
    // Seed scale 0.004 (≈0.4% of full) so the star is born as a TRUE PINPOINT — an intense
    // hot newborn core, not a small ball — and visibly GROWS over the (now-longer) collapse
    // as the infalling gas feeds it. (Was 0.012 / 1.2%, still too big a starting dot; 3rd
    // iteration drops it to ≈0.4% for a real seed that swells.) The 0.996 span carries it
    // from that pinpoint to full size. It MUST still read because of the uSeedGlow emission
    // lift below (raised in step with this so the smaller seed stays a bright point, not a
    // vanishing dot). starFormed lags the gas inflow (gas leads via collapse=prog^0.85), so
    // the cloud is seen pouring INTO this growing core. No-op (1.0) outside the window.
    sunRig.group.scale.setScalar(look.starFormed > 0 ? 0.004 + 0.996 * look.starFormed : 1.0);
    // HOT YOUNG STAR (uBlue): born a saturated hot-BLUE pinpoint (echoing the page's
    // pale-blue dot), HOLDING blue while the star is SMALL and only cooling to gold over the
    // LATER part of the growth as it reaches full mass ("mass induces heat" runs in reverse
    // here — small+young = bluest). Curve: 1 - smoothstep01((starFormed - 0.25) / 0.55).
    //
    // RE-KEYED TO THE WHOLE VISIBLE GROWTH (was 0.78→1.0): the mesh now reveals at LOW
    // starFormed (meshFormIn in transitions.ts, full opacity by ≈0.12), so the small star is
    // on screen for its ENTIRE growth — the blue phase must therefore cover the EARLY and
    // MOST of growth, not the thin 0.78→1.0 slice (which was both invisible-then-already-gold
    // under the old late reveal). uBlue is pinned FULL (1.0) through starFormed ≈0.25 — the
    // small visible dot is unambiguously BLUE — then warms to gold by ≈0.80, so by the time
    // the star is near full size it has cooled to the yellow sun. Net on screen as stage falls
    // 3.5→3.0: a tiny BLUE dot emerges (stage ≈3.4), stays blue while it grows (≈3.4→3.26),
    // warms blue→gold across mid/late growth (≈3.26→3.08), gold by full size (≈3.06). Pairs
    // with the uDetail ramp below (clean while small, textured as it warms). 0 (no-op) outside
    // the forming window.
    sunRig.surfaceMat.uniforms.uBlue.value =
      look.starFormed > 0 ? 1 - smoothstep01((look.starFormed - 0.25) / 0.55) : 0;
    // SURFACE-DETAIL ramp (uDetail) — NOW INERT (pinned to 1 = full texture always). The
    // newborn seed used to cross-fade to a clean limb-darkened sphere to avoid granulation
    // speckle on a tiny body, but that made it read as a flat SOLID blue disc. The user wants
    // the real yellow-sun SURFACE TEXTURE tinted blue at the seed (granulation + mottle on a
    // blue palette via uBlue), warming to gold as it grows — so the texture is kept at every
    // size and only the colour ramps blue→gold. uDetail stays wired (the shader still declares
    // it) but is held at 1 so it never flattens the surface. Left as a uniform rather than
    // ripped out so the shader/JS contract is unchanged and re-enabling is one line.
    sunRig.surfaceMat.uniforms.uDetail.value = 1;
    // SEED EMISSION LIFT: a 0.4%-scale photosphere is a tiny speck on screen, so without a
    // boost it reads as a dim dot rather than an intense newborn-star pinpoint. This lift is
    // now even MORE load-bearing: the mesh reveals at LOW starFormed (meshFormIn), so the tiny
    // seed is VISIBLE through the gas from the start and must punch through it as a bright blue
    // point. Lift the surface emission HARD when the star is smallest and ease it back to the
    // normal 1.0 as it grows (by starFormed≈0.45 it is full-size enough to glow on its own).
    // The curve is (1 - starFormed)² so the lift is strongest at the seed and fades smoothly —
    // the seed glows like a hot core, the grown star is unchanged. RAISED 1.5 -> 2.2 (3rd
    // iteration) in step with the smaller 0.4% seed (R1): the ~9× smaller area would otherwise
    // read too faint, so the peak lift goes from ≈+150% to ≈+220% to keep the newborn core an
    // intense hot POINT. 0 (no-op) outside the window where starFormed==0. uMeshFade (the
    // cross-dissolve) still gates final opacity.
    {
      const seedGlow = look.starFormed > 0 ? 1 + 2.2 * (1 - look.starFormed) * (1 - look.starFormed) : 1;
      sunRig.surfaceMat.uniforms.uSeedGlow.value = seedGlow;
    }
    sunRig.surfaceMat.uniforms.uRed.value = 0;
    sunRig.coronaMat.uniforms.uRed.value = 0;
    // CROSS-DISSOLVE: meshW (0 outside the swap band, 0→1 across it) fades the WHOLE mesh
    // IN as the cloud fades out — the photosphere via its premultiplied uMeshFade, and the
    // additive atmosphere (loops/corona, and the glow below) by multiplying their presence.
    // meshW is 1 everywhere the mesh is the settled body, so this is a no-op there.
    sunRig.surfaceMat.uniforms.uMeshFade.value = look.meshW;
    // FLARES (coronal loops + corona haze) only AFTER the star is fully sized — AND scaled
    // by meshW so they dissolve in together with the photosphere at the swap.
    const flarePresence = (look.starFormed > 0 ? smoothstep01((look.starFormed - 0.97) / 0.03) : 1) * look.meshW;
    sunRig.loopMat.uniforms.uFade.value = flarePresence;
    sunRig.coronaMat.uniforms.uFade.value = flarePresence;
    // inner chromosphere glow rides meshW (it has no starFormed flare gate — it is the rim
    // glow present at all star sizes), so it dissolves in/out with the body. It rides meshW
    // directly: the seed is now the real textured photosphere (blue-tinted), not a clean disc,
    // so it carries its normal chromosphere halo at every size — no detail-based suppression.
    sunRig.glowMat.uniforms.uFade.value = look.meshW;
    sunRig.starMat.uniforms.uOpacity.value = 1;
    // Mesh visible across its side (cross-dissolves with the cloud at the swap).
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
    // Null on the low tier (the bloom pass was never built); skip the writes there.
    if (bloom) {
      bloom.strength = look.bloomStrength * ctx.focusBloom + ctx.nebulaFlashBloom;
      bloom.radius = look.bloomRadius;
    }
    gradePass.uniforms.uExposure.value = look.exposure;
    gradePass.uniforms.uOlive.value = look.olive;
    gradePass.uniforms.uWarmth.value = look.warmth;
    gradePass.uniforms.uSat.value = look.gradeSat;
    gradePass.uniforms.uToneComp.value = look.toneComp; // tone-map compression (low for red giant)
    gradePass.uniforms.uGrain.value = look.grain; // per-state film grain (0 in the nebula)
    // Per-scene room tint: the frame clears to the scene's own near-black hue
    // (lifecycle's roomTint ramp) instead of one shared pure black, so each
    // chapter's void carries a quiet colour identity. Rides through the grade +
    // vignette + grain like any rendered pixel.
    renderer.setClearColor(
      roomTintColor.setRGB(look.roomTint[0], look.roomTint[1], look.roomTint[2]),
      1,
    );
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
    // ITEM 3: NARROW the nova envelope (sigma 0.13 -> 0.09, ~30% shorter) so the
    // collapse FLASH has a tighter hold/decay — a brief transition flash, not a held
    // sunburst chapter. Paired with the shortened collapse SCROLL band (Item 9), the
    // blast is in-and-out fast.
    const NOVA_SIGMA = 0.09;
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

    // === IDLE GATING + LOW-TIER FRAME CAP ====================================
    // Everything ABOVE this line is cheap (the scroll ease + the pure lifecycle()
    // choreography + the focus ease). Everything BELOW — applyLook's ~50 uniform
    // writes, the camera rig, the gravity-sim sample and `postRig.render()` (the
    // bloom chain, ~99% of idle CPU) — is the heavy work we skip when the frame is
    // STATIC or throttled by the low-tier cap. rAF was already re-armed at the top
    // of frame(), so an early return here keeps the loop alive; the very next tick
    // re-evaluates from scratch, so the instant scroll resumes (dStage > EPS) the
    // FULL pipeline runs again with ZERO hitch (no "wake" latch needed — a moving
    // frame is simply never static).
    const dStage = Math.abs(stage - prevFrameStage);
    const dProgress = Math.abs(progress - prevFrameProgress);
    prevFrameStage = stage;
    prevFrameProgress = progress;
    // A debug hook that pins/forces a specific frame must ALWAYS render in full so the
    // capture scripts see exact frames — never a parked one. morph/flash pin the
    // stage + whiteout; the others retune look (nebLight/nebulaFlash) or hold an
    // eruption — none should ever be swallowed by the idle gate. Each read is a cheap
    // typeof window[key] check (morphOverride/flashOverride were already read above).
    const debugForcesFull =
      morphOverride !== undefined ||
      flashOverride !== undefined ||
      readDebugNumber(DEBUG_WINDOW_KEYS.nebLight) !== undefined ||
      readDebugNumber(DEBUG_WINDOW_KEYS.nebulaFlash) !== undefined ||
      readDebugNumber(DEBUG_WINDOW_KEYS.erupt) !== undefined ||
      readDebugNumber(DEBUG_WINDOW_KEYS.giantErupt) !== undefined ||
      readDebugNumber(DEBUG_WINDOW_KEYS.streak) !== undefined;
    // STATIC: a frame where nothing time-driven is visibly moving, so re-rendering
    // it would paint identical pixels. The ONE state that qualifies is the settled
    // PALE BLUE DOT — the closing speck at the bottom of the page, a long idle dwell
    // where the visitor reads the final manifesto + the content below. There the disk
    // clock is frozen (the dot is inside the nebula window → uTime 0), gravity is gone
    // (no warp / ring / lensed-star twinkle), the sun rig + dome are hidden, and the
    // only animation — the dot's uDotTime brightness "breath" — is a sub-pixel pulse
    // on a single speck that does not cross the perceptual floor (measured 0.003% of
    // canvas pixels over a FULL 8s breath cycle at 2× DPR, == the back-to-back capture
    // noise floor), so parking it is byte-identical in observable terms.
    //   Every OTHER state is deliberately EXCLUDED because it visibly animates on
    // wall-clock time: the black hole (starfield/warp/ring twinkle + the orbiting
    // lensed star, ~0.7%/s), the red giant (photosphere spin, ~22%/s), the yellow
    // star (corona/loops) and even the NEBULA hold (a slow gas drift, ~0.23%/s that
    // accumulates over seconds). Freezing any of those would visibly halt the hero —
    // far worse than a smaller idle win. Reduced motion never runs frame() at all
    // (HeroIsland shows posters under it), so there is no reduced-motion path to gate.
    const focusSettled = Math.abs((focusTarget ? 1 : 0) - focusGlow) < STATIC_EPS;
    // The nebula beat PRE-WARMS the baked GPGPU collapse flipbook (gravitySim.bake,
    // resumable + incremental) so the snapshots are ready when the visitor scrolls UP
    // into the collapse. The visitor passes through the whole nebula beat BEFORE
    // reaching the dot, so the bake is normally done by then; we still gate on it so a
    // slow bake can never be starved by parking at the dot. (Unavailable on the low
    // tier + the unsupported-float fallback, which never bake — then it's trivially
    // "done".) Once baked the pre-warm call is a no-op, so dropping it here is free.
    const bakeDone = !gravitySim.available || gravitySim.isBaked();
    const dotIdle = look.dot && bakeDone;
    const isStatic =
      firstFramePainted && // never gate before the first real paints land
      t >= SETTLE_SNAP_S && // always full-render during the restore-snap window
      dStage < STATIC_EPS &&
      dProgress < STATIC_EPS &&
      nova < 0.001 && // no supernova whiteout on screen (scroll-anchored Gaussian)
      !diveActive && // no cinematic dive in flight
      // The HUD focus glow ease must have SETTLED. This is the real "exploration
      // focus isn't moving" guard: a live focus target keeps focusGlow easing (and
      // its disk-emission / bloom / dome multipliers changing), so focusSettled stays
      // false and the frame renders. We do NOT gate on isExplorationMode itself — it
      // is a permanently-on flag here (the whole site is "explorable"), not a
      // per-frame motion signal, so testing it would defeat the gate everywhere.
      focusSettled &&
      !debugForcesFull &&
      dotIdle;
    // LOW-tier 30fps cap: on the low tier, render at most ~30fps. We keep arming rAF
    // every native tick but skip the heavy work + render until LOW_FRAME_MS has
    // elapsed since the last actual render. High tier is never capped (native rAF).
    const capThrottled = tier === 'low' && now - lastRenderTime < LOW_FRAME_MS;
    // While static we still render on a slow HEARTBEAT so a late async texture load
    // or a restore that lands after we've parked eventually composites — and so the
    // dot's slow uDotTime breath keeps progressing (its ~7.85s period is sampled fine
    // at the ~2 Hz heartbeat) instead of freezing outright. The cap and the static
    // gate COMPOSE: a capped tick skips even the heartbeat (the next un-capped tick
    // renders it). firstFramePainted guards the heartbeat so the first frame is never
    // deferred.
    const heartbeatDue = now - lastRenderTime >= STATIC_HEARTBEAT_MS;
    if ((isStatic && !heartbeatDue) || (capThrottled && firstFramePainted)) {
      return; // skip applyLook + camera + gravity + postRig.render() this tick
    }
    lastRenderTime = now;

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

    // --- red giant → yellow: a SUBTLE world-space drift during the shrink ---------
    // ITEM 1: the shrinking red giant should read as ONE gesture — size + colour + POSITION
    // changing together — gliding into where the yellow mesh ignites. The camera ALREADY
    // recentres from the off-centre red-giant framing to the centred yellow framing across
    // exactly the shrink window (band 5's tail reaches YELLOW_HOLD by stage ~2.86), so the
    // body's on-screen position glides to centre as it shrinks with no retiming needed. On
    // top of that we add a TINY uGiantCenter world-space arc so the body visibly TRAVELS as
    // its own move (a gentle parallax swing), not merely shrink-in-place under a moving cam.
    //
    // The drift is gated to the cloud-side shrink and shaped as a PARABOLIC BUMP off
    // look.yrGrow (the shrink curve: 1 at the full red giant / stage 2.5, 0 at the
    // yellow-size gold ball / stage 2.85). 4·g·(1−g) is exactly 0 at BOTH ends and peaks
    // mid-shrink, so the offset is 0 at the red-giant hold (yrGrow=1, stage≤2.5, that beat
    // is untouched) AND EXACTLY 0 by RED_SHRINK_END (yrGrow=0, stage≥2.85) — i.e. the body
    // is back at the world origin, co-located with the origin-centred mesh, BEFORE the
    // cross-dissolve band (2.86→2.88) begins, so there is no pop at the swap. The shader
    // gates uGiantCenter on the red-giant state, so it can never touch the nebula/dot/sun.
    // Kept deliberately small (peak ≈0.45 world units on a ~1.9-unit-radius body in a
    // ~20-unit frame): enough to read as a swing, far too small to overshoot the centre.
    const RED_DRIFT_X = 0.45; // peak lateral world offset (+x: trails the camera's pan, a soft swing)
    const RED_DRIFT_Y = -0.18; // a touch of downward arc so the swing reads as a settle, not a slide
    const driftBump = look.cloudSide ? 4 * look.yrGrow * (1 - look.yrGrow) : 0; // 0 at both shrink edges
    giantCenter.set(RED_DRIFT_X * driftBump, RED_DRIFT_Y * driftBump, 0);
    diskMatPrimary.uniforms.uGiantCenter.value = giantCenter;
    diskMatSecondary.uniforms.uGiantCenter.value = giantCenter;

    // --- nebula → star collapse: BAKED gravity-sim flipbook ---------------------
    // The real chaotic collapse sim is run ONCE and snapshotted into a flipbook at
    // load (gravitySim.bake), then scrubbed by blending the two snapshots bracketing
    // the scroll position (look.collapse, 0 = dispersed nebula → 1 = fully collapsed).
    // Because the snapshots are fixed, the collapse is a PURE FUNCTION of scroll — it
    // scrubs identically both directions with no state, no replay, no snap-back (the
    // earlier "scrolling back and forth bugs the animation" failure). uSimBlend morphs
    // the disk from the analytic nebula placement onto the baked sim positions.
    let simBlend = 0;
    // PRE-WARM the baked flipbook EARLY — from the yellow star onward (stage ≥ 2.3, well
    // before the collapse window at 3.0–3.5). The bake takes ~0.6s; triggering it only once
    // the nebula was already on screen (look.nebulaShader) left a fast scroller inside the
    // collapse before it finished — the bake-race behind the "plays backward once" bug. By
    // starting the (incremental, idempotent, resumable) bake a whole chapter earlier, it is
    // almost always complete by the time the visitor reaches the collapse, so the gate below
    // engages the sim immediately with no visible "held dispersed" gap. The OR keeps the
    // original nebula-on trigger so a visitor who lands directly in the nebula (deep link /
    // restored scroll) still kicks the bake. Reading the eased `stage` here is fine — this is
    // a one-shot warm-up trigger, not a per-frame look value.
    const collapseApproaching = stage >= 2.3;
    if (gravitySim.available && (collapseApproaching || look.nebulaShader) && !gravitySim.isBaked()) {
      gravitySim.bake();
    }
    // GATE THE COLLAPSE ON A COMPLETE FLIPBOOK. The baked sim is the ONE beat that is not
    // a pure function of scroll: its snapshots take ~0.6s to bake the first time the
    // nebula is reached. If we sampled it before the bake finished, sampleAt() clamps to
    // the deepest snapshot captured SO FAR — so as the remaining snapshots fill in over
    // the next frames, the rendered gas positions advance ON THEIR OWN (decoupled from
    // scroll), which reads as the collapse "playing in the wrong direction once" on first
    // sight (and never again, because the flipbook is then cached). Until isBaked(), we
    // keep simBlend = 0 so the disk shows the ANALYTIC dispersed nebula (== snapshot 0,
    // what the sim seeds from anyway) instead of a half-baked, self-playing collapse. Once
    // the flipbook is whole the collapse engages and is pure-functional like every other
    // beat — scrub-anywhere, both directions, no rogue motion.
    if (gravitySim.available && gravitySim.isBaked() && (look.simBlend > 0.001 || look.collapse > 0.001)) {
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
    // DEBUG: while __bhInspect is set, publish the resolved collapse-handoff scalars on
    // window.__bhLook so a capture script can assert what a pinned frame actually
    // computed (this is how the "gas pops in whole at the yellow star" density-envelope
    // bug was isolated — the numbers said fade≈0 while the pixels said full cloud).
    // Allocation is gated on the hook, so normal play never pays for it.
    if (readDebugNumber(DEBUG_WINDOW_KEYS.inspect)) {
      (window as unknown as Record<string, unknown>).__bhLook = {
        stage,
        simAvailable: gravitySim.available,
        simBaked: gravitySim.isBaked(),
        lookSimBlend: look.simBlend,
        lookCollapse: look.collapse,
        ctxSimBlend: simBlend,
        cloudBright: look.cloudBright,
        nebFade: look.nebFade,
        cloudW: look.cloudW,
        meshW: look.meshW,
        starFormed: look.starFormed,
        nebulaShader: look.nebulaShader,
        camLen: camera.position.length(),
      };
    }
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
    // --- AUTONOMOUS-ACCELERATED DOLLY-BACK (black-hole load) ------------------
    // A bounded, time-based backward dolly that runs while the black-hole chapter is
    // on screen (raw progress < DOLLY_CHAPTER_END). It is a PURE function of the
    // wall-clock load time + scroll POSITION — never scroll velocity. Disabled under
    // reduced motion (the held pose stands as-is).
    if (!reduced) {
      // Autonomous FLOOR: eases out to 1 over DOLLY_DUR seconds since mount, then HOLDS
      // (settles — easeOut asymptotes, min() clamps, so no further drift, no loop).
      const autonomousT = easeOut(Math.min(t / DOLLY_DUR, 1));
      // Scroll ACCELERATION: how deep the visitor has scrolled INTO the 0-14% chapter
      // (a scroll-POSITION term). Scrolling deeper advances the retreat faster/further.
      const scrollT = smoothstep01(progress / DOLLY_CHAPTER_END);
      // The autonomous drift is the floor; scroll can push it further within the bound.
      const effectiveT = Math.max(autonomousT, scrollT);
      // Fade the whole offset out smoothly as the chapter is left (no pop at the edge).
      const chapterFade = 1 - smoothstep01((progress - DOLLY_CHAPTER_END) / (DOLLY_FADE_END - DOLLY_CHAPTER_END));
      const dollyBack = DOLLY_MAX_BACK * effectiveT * chapterFade;
      if (dollyBack > 0.0001) {
        // TRUE dolly: move the camera AWAY from the look target along the view axis
        // (so it reads as pulling off the hole), not just along world-z.
        dollyTarget.set(frameLookTarget.x, frameLookTarget.y, frameLookTarget.z);
        dollyDir.copy(camera.position).sub(dollyTarget); // target -> camera
        if (dollyDir.lengthSq() > 1e-6) {
          dollyDir.normalize();
          camera.position.addScaledVector(dollyDir, dollyBack);
        }
      }
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

    // === DIVE OVERRIDE: plunge the live camera into the clicked marker ============
    // Runs after the scroll camera is fully resolved, so a 0-strength dive is a no-op
    // and the plunge starts seamlessly from the live pose. The dolly drives toward the
    // through-point past the origin while the look target turns toward diveTargetWorld
    // (the world point under the clicked marker), so the marker centres + grows. The
    // bloom overlay strength is published via diveOnProgress — capped to a SOFT VEIL
    // (DIVE_WHITE_PEAK), never a whiteout; onApex fires once (on uncapped raw) for the
    // caller to navigate.
    if (diveActive) {
      const raw = Math.min(1, (performance.now() - diveStart) / 1000 / (reduced ? DIVE_REDUCED_S : DIVE_DURATION_S));
      if (!reduced) {
        // CAMERA LEADS — front-loaded ease (easeOut, the cubic pull-back curve owned by
        // lifecycle.ts). easeOut(0.3) ≈ 0.66, so ~two-thirds of the dolly is spent in
        // the first third of the run: the camera LEAPS toward the core immediately and
        // eases into it, reading as a fall THROUGH the event horizon (DIVE_THROUGH_POS,
        // just past the origin) while the white is still near zero.
        //
        // AIM AT THE MARKER, not dead-centre: the look target lerps from the live
        // target toward diveTargetWorld — the world point UNDER the clicked marker
        // (unprojected in beginDive). The camera TURNS to face the marker as it falls,
        // so the clicked speck swings to screen-centre and grows — a dive INTO it. For
        // a centred/anchored marker diveTargetWorld ≈ the origin, so this reproduces the
        // original straight-down-the-throat plunge. The dolly destination stays
        // DIVE_THROUGH_POS (just past the origin) so the fall depth/feel is unchanged.
        const k = easeOut(raw);
        camera.position.lerpVectors(diveFromPos, DIVE_THROUGH_POS, k);
        // ORBITAL ARC: swing the approach in from the side instead of a dead-straight
        // punch. The camera position is rotated around the world-origin up-axis by an
        // angle that is FULL at the start of the run and decays to zero as it reaches the
        // core (1 - k), so the camera starts offset to one side and orbits back onto the
        // throat as it falls. With DIVE_ORBIT_DEG negative the camera starts on the RIGHT:
        // the star enters from the right and swings back to centre as the dive completes.
        camera.position.applyAxisAngle(WORLD_UP, (DIVE_ORBIT_DEG * Math.PI) / 180 * (1 - k));
        frameLookTarget.lerpVectors(diveFromTarget, diveTargetWorld, k);
        camera.lookAt(frameLookTarget);
        // FOV narrows on the SAME front-loaded curve → the walls rush past early, a
        // longer-lens "tunnel" compression that sells the plunge before the bloom lands.
        camera.fov = CFG.fovDeg + (DIVE_FOV_MIN - CFG.fovDeg) * k;
        camera.updateProjectionMatrix();
      }
      // WHITE TRAILS — held near zero until the plunge is DIVE_WHITE_START through the
      // run, then ramped (easeInQuart, the accelerating curve, over the remaining window
      // up to the apex) toward the DIVE_WHITE_PEAK ceiling — NOT full white. This is the
      // inverse of the original front-loaded white: the camera move is fully visible
      // first; the bloom only takes over near the apex, and even then only as a soft
      // capped veil you can see the plunge through. The cap lives here (single source)
      // so HeroIsland just mirrors `s` straight to overlay.style.opacity.
      const whiteRaw = Math.min(1, (raw - DIVE_WHITE_START) / (DIVE_APEX_FRAC - DIVE_WHITE_START));
      diveStrength = whiteRaw <= 0 ? 0 : easeInQuart(whiteRaw) * DIVE_WHITE_PEAK;
      diveOnProgress?.(diveStrength);
      // Apex/navigate fires on the UNCAPPED `raw` so the cap never shifts nav timing.
      if (!diveApexFired && raw >= DIVE_APEX_FRAC) { diveApexFired = true; diveOnApex?.(); }
    } else {
      diveStrength = 0;
    }

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
      // BEAT-band gate: a marker shows exactly while its scene's manifesto copy
      // is on screen. beatIdForLifecycleP reads the SAME text bands the overlay
      // renders with, and it is fed progressTarget — the RAW clamped scroll, the
      // same signal the overlay's React snapshot mirrors — NOT the eased internal
      // `progress`, which lags raw scroll by the dwell-damped follow-ease and
      // would land the marker a beat behind its own text. (This replaced the old
      // settledWindow gate: two clocks, visibly out of sync.)
      const beatId = beatIdForLifecycleP(lifecycleProgress(progressTarget));
      // STRICT: never publish a marker as visible while the supernova flash/morph
      // envelope is active. `nova` (the clockless Gaussian flash envelope computed
      // above) > ~0.01 means a blast is on screen — suppress the marker so it can
      // never flash for a frame as a window edge is crossed during a fast scroll.
      // gateOk drops the on-screen test: a fixed-spot marker sits at its own
      // viewport fraction (always on-screen) so the star ORIGIN going off-screen
      // (camera-parked red giant on a narrow viewport) must not hide it. Anchored
      // markers ride the origin, so they keep the full `visible` (incl. onScreen).
      const gateOk = beatId !== null && nova < 0.01;
      hooks.onMarkerFrame({ x: cssX, y: cssY, stage, visible: onScreen && gateOk, gateOk, beatId });
    }

    // --- supernova shake/rumble + idle roll (applied AFTER lookAt) -------------
    // Tiny and time-based: it sells one shock event without turning the scroll into
    // a game-camera wobble.
    if (!reduced) {
      // PER-CHAPTER STILLNESS: the idle roll is REDUCED across the chapters that should
      // read as calm/symmetric — the yellow star (raw ~39-49%, stabilise) and the pale
      // dot / content band (raw >= 74%, near-static). `idleRollScale` rides scroll
      // POSITION (never velocity): full elsewhere, ~0.25 across yellow, ~0.08 on the dot.
      // The yellow window is in RAW-scroll space (progress here is the raw scroll value):
      // the yellow chapter is lifecycle 0.51-0.61 = raw 0.39-0.49, so it shifts +0.08 with
      // the holds (was raw 0.43-0.58 for the old lifecycle 0.43-0.57 yellow band).
      const inYellow = progress >= 0.39 && progress <= 0.49;
      const inDot = progress >= 0.74;
      const idleRollScale = inDot ? 0.08 : inYellow ? 0.25 : 1.0;
      const idleRoll = Math.sin(t * 0.067 + 2.3) * 0.0016 * idleRollScale; // rad, ~0.09° at full
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

    // Restore the resting FOV unless a geometric dive currently OWNS it (the dive
    // narrows the lens for its tunnel feel; under reduced motion the dive never touches
    // FOV, so this still resets there). Once the dive ends this fires once and restores.
    if (!(diveActive && !reduced) && camera.fov !== CFG.fovDeg) {
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
    // wall-clock for the supernova shock disk's turbulent gas (0 under reduced motion).
    novaPass.uniforms.uTime.value = ut;
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
        // DEV live-tuning: window.__wave.flow scales the click-ripple domain warp (how hard
        // the granulation cells stream with the wavefront) in real time. Absent → unchanged
        // default of 1. Removed once the look is dialled in.
        const waveFlow = readDebugNumber(DEBUG_WINDOW_KEYS.waveFlow);
        if (typeof waveFlow === 'number') sunRig.surfaceMat.uniforms.uWaveFlow.value = waveFlow;
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

  // ASYNC SHADER COMPILE — start the rAF only after the GPU has parsed/linked the
  // scene materials, so the FIRST interactive frame is never blocked by a synchronous
  // shader compile (cold-GPU stalls of 100–400ms had been landing in INP and the
  // "first interaction" budget). The intro veil + dive overlay already absorbs the
  // one-or-two-frame delay before the first painted frame, so the perceived cost is
  // zero. compileAsync resolves once KHR_parallel_shader_compile reports the program
  // is ready (or immediately on drivers without the extension), and covers both the
  // scene materials AND every full-screen shader pass in the post chain (RenderPass /
  // Bloom / Grade / Nova) because their materials are pulled into a throwaway warm-up
  // scene below. The reduced-motion and low-tier paths share the SAME kickoff — they
  // build the same renderer and a (cheaper) post chain, so both still benefit.
  //
  // ROBUSTNESS — we never let warm-up failure dead-end the scene:
  //  • renderer.compileAsync is r152+; older builds (and some headless test stubs)
  //    don't expose it, so we feature-detect and fall back to synchronous kickoff
  //    (the previous behaviour, byte-identical timing).
  //  • A rejected/throwing compileAsync is swallowed by try/catch — the first
  //    composer.render() will fall back to the old behaviour (compile on first use).
  //  • If dispose() runs while we're awaiting compile, the `stopped` flag stops
  //    frame() from ever firing, so we never schedule work onto a torn-down scene.
  //  • The WebGL-unavailable probe path (above) throws BEFORE this block is reached,
  //    so compileAsync only runs against a successfully-constructed renderer.
  const startRenderLoop = async (): Promise<void> => {
    try {
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(scene, camera);
        // Warm the post-chain pass materials too. EffectComposer passes are blitted
        // through full-screen quads; collecting any pass.material into a throwaway
        // scene and async-compiling it pulls those programs through KHR parallel
        // compile as well. The throwaway scene/geometry are disposed; pass materials
        // remain owned by their pass (do NOT dispose them — the composer still uses
        // them every frame).
        const passMaterials: THREE.ShaderMaterial[] = [];
        for (const pass of postRig.composer.passes) {
          const mat = (pass as { material?: THREE.ShaderMaterial }).material;
          if (mat) passMaterials.push(mat);
        }
        if (passMaterials.length > 0) {
          const warmScene = new THREE.Scene();
          const warmGeo = new THREE.PlaneGeometry(2, 2);
          for (const mat of passMaterials) warmScene.add(new THREE.Mesh(warmGeo, mat));
          await renderer.compileAsync(warmScene, camera);
          warmGeo.dispose();
        }
      }
    } catch {
      // Defensive: any failure in async compile means we fall back to compile-on-first-
      // render (previous behaviour). Never block the scene from starting.
    }
    // dispose() may have fired while we were awaiting compile; honour `stopped` so we
    // never kick off frame() against a torn-down scene. Same defence as the
    // visibilitychange / context-restored re-kicks below.
    if (!stopped) frame();
  };
  void startRenderLoop();

  // Arm the cinematic dive. Snapshots the live camera pose so the plunge starts
  // seamlessly from wherever the scroll camera currently sits, then lets frame()'s
  // dive-override block drive the rest. No-op if a dive is already running (a second
  // click can't restart or stack the plunge).
  //
  // targetNdc is now USED (it was formerly ignored, always aiming at the origin): the
  // dive AIMS at the marker's own on-screen point so an off-centre nebula speck is
  // dived INTO rather than lurched-to-centre. We derive diveTargetWorld ONCE here by
  // unprojecting that NDC onto the STAR'S depth plane — i.e. the world point directly
  // under the marker at the same camera distance as the origin. Method: project the
  // origin to read its NDC z (its depth), then unproject (ndcX, ndcY, originNdcZ) back
  // to world. That keeps the aim point at a sane, stable depth (the disk/scene plane)
  // regardless of where on screen the marker sits. No targetNdc → fall back to the
  // origin (a centred plunge, the original behaviour). One-shot math; the hot-path
  // dive block only reads diveTargetWorld (no per-frame unproject).
  const beginDive = (opts: DiveOptions): void => {
    if (diveActive) return;
    diveActive = true;
    diveApexFired = false;
    diveOnApex = opts.onApex;
    diveOnProgress = opts.onDiveProgress ?? null;
    diveStart = performance.now();
    diveFromPos.copy(camera.position);
    diveFromTarget.copy(frameLookTarget);
    if (opts.targetNdc) {
      // Origin's depth in NDC (perspective-correct), so the unprojected aim point
      // lands on the same plane as the star instead of at the near clip.
      const originNdcZ = diveAimScratch.set(0, 0, 0).project(camera).z;
      diveTargetWorld
        .set(opts.targetNdc.x, opts.targetNdc.y, originNdcZ)
        .unproject(camera);
    } else {
      diveTargetWorld.set(0, 0, 0);
    }
  };

  // Stop the render loop WITHOUT disposing GL. Idempotent (the `stopped` flag also
  // short-circuits the visibilitychange re-kick and the next frame() body). HeroIsland
  // calls this on `astro:before-swap` so the heavy ~1.2M-point loop yields the main
  // thread to ClientRouter the instant it begins the view-transition swap, instead of
  // rendering against it — the root cause of the occasional SPA stall on this page.
  // GL teardown still happens on React unmount (dispose, below); this only halts work.
  const pauseRendering = (): void => {
    stopped = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  // Reverse of pauseRendering — unpark the loop and re-kick frame() the same way
  // onVisibilityChange / onContextRestored do. Idempotent: returns immediately if
  // the loop is already running, and defers to the existing visibilitychange handler
  // when the tab is hidden (no point starting work the very next tick if the hidden
  // gate would just stop it again). ArticleScene drives this from an IntersectionObserver
  // so the article backdrop pauses while scrolled out of view and resumes when any of
  // the article returns — pause-on-tab-hide is not enough on its own (a foreground tab
  // scrolled past the canvas was still burning GPU on a backdrop nobody could see).
  const resumeRendering = (): void => {
    if (!stopped) return;
    stopped = false;
    if (raf === 0 && !document.hidden) frame();
  };

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
      // WebGL context-loss listeners live on the canvas (renderer.domElement) — detach
      // from the same target so they never leak across a mount/unmount remount.
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost, false);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored, false);

      // Each rig disposes its own geos + materials (and, for post, the composer +
      // bloom + grade material) — construction and teardown are co-located in the
      // build*() factories. They all satisfy the `Rig` seam (a `dispose()` method),
      // so teardown is ONE loop over the rig set instead of eight hand-listed calls
      // that drift as rigs are added/removed. Order preserved (post first). gravitySim
      // and renderer are NOT rigs (their own teardown contracts) so stay explicit.
      const rigs: Rig[] = [postRig, diskRig, starRig, distantStarRig, warpRig, streakRig, ringRig, sunRig];
      for (const rig of rigs) rig.dispose();
      gravitySim.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
    { hitTestGiant, beginDive, pauseRendering, resumeRendering },
  );
  return dispose;
}

// ---------------------------------------------------------------------------
//  The manifesto — one beat per lifecycle state (six states, six beats, each
//  roughly one viewport tall), pinned over the canvas and cross-faded as the
//  scroll morph passes its window.
//
//  The copy itself (the ManifestoBeat shape + the BEATS array) lives colocated
//  per scene in ./sceneTable, and the scroll-track geometry (SCROLL_SECTION_COUNT
//  / STAGE_COUNT / BUILT_STAGES) in ./timeline, so the SSR fallback and scroll
//  track in index.astro share one source of truth with this live overlay.
// ---------------------------------------------------------------------------
