// The scene controller: builds renderer/camera + all rigs, runs the per-frame loop, tears down.
import * as THREE from 'three';
import { CFG, tuneParticlesForDevice, tuneRenderPixelRatio } from '../lib/config';
import { DEBUG_WINDOW_KEYS, readDebugNumber, readDebugVec3 } from '../lib/constants';
import { lifecycle, easeOut, smoothstep01 } from '../lifecycle';
import { cameraPoseForProgress, progressForLegacyStage } from '../timeline';
import { buildGravitySim, type GravitySim } from '../gravitySim';
import { STAR_BACK_BASE_BRIGHT, buildSunRig } from './buildSunRig';
import { buildDisk } from './buildDisk';
import { buildStarfield, buildDistantStar } from './buildStarfield';
import { buildWarp } from './buildWarp';
import { buildStreak } from './buildStreak';
import { buildRing } from './buildRing';
import { buildPostChain } from './buildPostChain';
import type { SceneHooks } from './types';

export function createScene(container: HTMLElement, reduced: boolean, hooks: SceneHooks): () => void {
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
  // A stateful gravity sim that collapses the nebula particles inward to feed the
  // mesh star (see gravitySim.ts). Seeded from the SAME analytic nebula placement
  // the disk shader uses, so it starts pop-free. Skipped under reduced motion;
  // returns a no-op {available:false} if float targets are unsupported → the
  // hero degrades to the analytic hard-swap. The accretion core matches the star
  // photosphere (SUN_RIG_RADIUS); uGgiantR (4.2) is the nebula extent scale.
  const gravitySim: GravitySim = reduced
    ? { available: false, step: () => {}, getPosTexture: () => null, dispose: () => {} }
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
  // Red-giant axial spin: ~one rotation per 60 s on its tilted pole (2π/60). Slow
  // and cinematic — the surface rolls, the camera no longer orbits it (see the
  // red-giant orbit freeze below). The base radius the size slider divides by so
  // __bhGiantR keeps its world-units feel against the red-giant-only uGiantScale.
  const RED_GIANT_SPIN_RATE = (Math.PI * 2) / 60; // rad/s
  const RED_GIANT_BASE_R = 4.2; // = buildDisk's base uGiantR (the scale's denominator)
  // Debug retarget for the red-giant camera composition. The forward camera rig
  // owns the real pose; this offset is only a development shim for the old tuning
  // panel so it can still nudge the red hold without moving the star geometry.
  const RED_GIANT_PARK = new THREE.Vector3(0, 0, 0);

  let mouseX = 0;
  let mouseY = 0;
  const onPointerMove = (e: PointerEvent): void => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };
  if (!reduced) window.addEventListener('pointermove', onPointerMove);

  const t0 = performance.now();
  let raf = 0;
  let stopped = false;

  // easeOut (cubic) + smoothstep01 are the single-source-of-truth easings, now
  // owned by lifecycle.ts (imported above). The stateful clock below still needs
  // them: easeOut for the intro dezoom ramp, smoothstep01 for the nova rise.

  // The lifecycle position is eased toward its scroll target each frame so a
  // flick of the wheel glides through the transitions instead of snapping.
  // stage 0→1 = reverse supernova; 1→2 = red giant.
  let stage = hooks.getStage();
  let progress = hooks.getProgress?.() ?? progressForLegacyStage(stage);
  let focusGlow = 0;
  // latch so the settled yellow-star glow colour (constant gold) is written once,
  // not re-set every frame while the star holds.
  let glowSettled = false;
  // previous-frame stage for the gravity sim (more substeps on a fast scroll).
  let prevSimStage = stage;
  // previous-frame stage for the hyperspace-streak flow direction (latched on a
  // deadzone so sub-pixel jitter at rest never flips the lightspeed streak flow).
  let prevStreakStage = stage;
  let streakDir = 1;

  // --- supernova whiteout: a TIME-based flash envelope, decoupled from scroll ---
  // The old flash was a Gaussian in `morph` (scroll position) ~0.1 wide, so a fast
  // scroll skipped it entirely. Instead we TRIGGER on the breakout crossing and run
  // our own clock to completion, so the blast is always seen at full length no
  // matter how fast the visitor scrolls. `nova` (0..1) is the master envelope that
  // drives the whiteout pass + the particle/bloom/exposure beats.
  let novaStart = -1;     // performance.now() ms at fire; -1 = idle
  let novaArmed = true;   // hysteresis latch: re-arm only after leaving the band
  let prevMorph = Math.min(1, stage);      // previous-frame morph, for crossing detection
  // direction the blast plays, latched at fire and held for the whole envelope:
  //   +1 EXPLODE  — scroll UP, red giant → black hole (morph FALLING through 0.5),
  //                 time forward: a star collapses, detonates, blasts outward.
  //   -1 IMPLODE  — scroll DOWN, black hole → red giant (morph RISING through 0.5),
  //                 time backward: the "un-explosion", light gathers inward.
  let novaDir = 1;
  const NOVA_TRIGGER = 0.5;  // breakout (where the legacy flash fired)
  const NOVA_ARM = 0.12;     // must move |morph-0.5| beyond this to re-arm
  // PUNCHY, not a wash: rise fast, hold a beat, decay quickly so the screen flash
  // is felt as an impact and the remnant is revealed almost immediately. The old
  // 0.68s decay let the bleach dwell ~0.84s and read as a grey loading screen;
  // total dwell is now ~0.48s. The particle shock-breakout (disk uFlash) keeps
  // going on its own morph schedule, so the BLAST is still substantial — only the
  // screen-white envelope is tightened.
  const NOVA_RISE = 0.08;    // s: dark → peak accent
  const NOVA_HOLD = 0.05;    // s: brief peak, not a white loading screen
  const NOVA_DECAY = 0.35;   // s: quick cool-out, reveal the remnant fast
  const NOVA_DUR = NOVA_RISE + NOVA_HOLD + NOVA_DECAY;
  const NOVA_COOLDOWN = 1200; // ms minimum between fires (anti-strobe backstop)
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
    // `morph` (= min(1, stage)) is needed HERE for the stateful nova clock's
    // breakout-crossing detection below; lifecycle() recomputes it from the same
    // formula for the look scalars. (Kept local + cheap — it's the clock's input.)
    const morph = Math.min(1, stage);              // transition 1 progress (0..1)

    // --- transition 1: reverse supernova ---
    diskMatPrimary.uniforms.uMorph.value = morph;
    diskMatSecondary.uniforms.uMorph.value = morph;
    ringMat.uniforms.uMorph.value = morph;
    // --- supernova flash: time-based envelope, fired on the breakout crossing ---
    // Detect a crossing of the breakout (morph through 0.5) in EITHER scroll
    // direction. Fire once, then latch: re-arm only after morph has clearly left
    // the band (so parking on 0.5 or jittering at the edge can't machine-gun it),
    // with a hard cooldown as an anti-strobe backstop. Reduced-motion never fires.
    const crossed = (prevMorph < NOVA_TRIGGER) !== (morph < NOVA_TRIGGER);
    if (
      crossed && novaArmed && !reduced && !exploring &&
      (novaStart < 0 || now - novaStart > NOVA_COOLDOWN)
    ) {
      novaStart = now;
      novaArmed = false;
      // latch the blast direction from how morph crossed the breakout: RISING
      // (scroll down, BH→giant) plays the IMPLODE; FALLING (scroll up, giant→BH)
      // plays the EXPLODE. Held until the next fire so the whole envelope is one
      // coherent direction even if the scroll reverses mid-blast.
      novaDir = morph > prevMorph ? -1 : 1;
    }
    if (!novaArmed && Math.abs(morph - NOVA_TRIGGER) > NOVA_ARM) novaArmed = true;
    prevMorph = morph;
    // evaluate the envelope on its OWN clock (rise → hold → ease-out decay), so it
    // always plays to completion regardless of where scroll has gone meanwhile.
    let nova = 0;
    if (novaStart >= 0) {
      const te = (now - novaStart) / 1000; // seconds since fire
      if (te >= NOVA_DUR) novaStart = -1; // expired → idle
      else if (te < NOVA_RISE) nova = smoothstep01(te / NOVA_RISE);
      else if (te < NOVA_RISE + NOVA_HOLD) nova = 1.0;
      else {
        const p = (te - NOVA_RISE - NOVA_HOLD) / NOVA_DECAY; // 0..1 across the tail
        nova = 1.0 - p * p * (3.0 - 2.0 * p); // smoothstep ease-out (light dissipating)
      }
    }
    // DEBUG: window.__bhFlash pins the envelope to a held value so capture scripts
    // can screenshot the rise/peak/decay (the time-based flash would otherwise
    // expire during their settle wait). Pairs with __bhMorph (which pins stage).
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
    const novaScreen = nova * 0.5;
    const nebulaScreen = nebulaFlash * 0.5; // debug-only path; 0 in normal play
    const screenNova = Math.max(novaScreen, nebulaScreen);
    const nebulaFlashOwnsScreen = nebulaScreen > novaScreen;
    novaPass.uniforms.uNova.value = screenNova;
    novaPass.uniforms.uPeak.value = 0.78; // filmic cap — peak stays under pure white
    // DEBUG: window.__bhFlashDir pins the blast direction (+1 explode / -1 implode)
    // so a capture script can inspect either variant without scrolling to trigger it.
    const flashDirOverride = readDebugNumber(DEBUG_WINDOW_KEYS.flashDir);
    novaPass.uniforms.uNovaDir.value = nebulaFlashOwnsScreen ? 1 : typeof flashDirOverride === 'number' ? flashDirOverride : novaDir;

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
    // DEBUG: window.__bhGiantR overrides it live; unset → the lifecycle-driven value.
    const giantScaleOverride = readDebugNumber(DEBUG_WINDOW_KEYS.giantRadius);
    const giantScaleValue =
      typeof giantScaleOverride === 'number' ? giantScaleOverride / RED_GIANT_BASE_R : look.giantScale;
    diskMatPrimary.uniforms.uGiantScale.value = giantScaleValue;
    diskMatSecondary.uniforms.uGiantScale.value = giantScaleValue;
    // The orb stays centred (uGiantCenter = origin); its off-centre FRAMING is the
    // camera park below. DEBUG: window.__bhGiantCenter = [x, y, z] retargets the PARK
    // VANTAGE live so the framing can be re-dialled with the slider panel; unset → the
    // baked RED_GIANT_PARK. (It no longer moves the geometry — the star is at origin.)
    const giantCenterOverride = readDebugVec3(DEBUG_WINDOW_KEYS.giantCenter);
    if (giantCenterOverride) RED_GIANT_PARK.set(giantCenterOverride[0], giantCenterOverride[1], giantCenterOverride[2]);
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

    // --- GPGPU gravitational collapse: step the sim + feed its texture to the cloud ---
    // The sim collapses the nebula particles inward to form the yellow star. It's
    // stepped only inside the window (look.collapse / look.simBlend > 0); otherwise the
    // home-spring would idle. uSimBlend morphs the disk from analytic → sim positions.
    let simBlend = 0;
    if (gravitySim.available && (look.simBlend > 0.001 || look.collapse > 0.001)) {
      // SCROLL-LOCK: only ADVANCE the integrator when the stage actually moved, so a
      // truly idle frame holds the last sim texture (holding still = a frozen frame,
      // not a cloud that keeps collapsing on a wall-clock timer). The texture + blend
      // are (re)applied every in-window frame regardless, so stopping mid-collapse
      // freezes the current cloud instead of snapping back to the analytic placement.
      const dStage = Math.abs(stage - prevSimStage);
      if (dStage > 1e-4) {
        // more substeps on a fast scroll so a flick still visibly collapses, but
        // capped at 3 total (was 4) to bound the per-frame GPU sim cost on a hard
        // wheel-flick through the formation window — trades a hair of collapse
        // smoothness for steadier frame time. uTime is FROZEN to 0 so the curl-noise
        // swirl is deterministic per collapse-drive (scroll), not wall-clock-evolved.
        const substeps = 1 + Math.min(2, Math.floor(dStage / 0.05));
        gravitySim.step(look.collapse, 0, substeps);
      }
      const tex = gravitySim.getPosTexture();
      diskMatPrimary.uniforms.uSimPos.value = tex;
      diskMatSecondary.uniforms.uSimPos.value = tex;
      simBlend = look.simBlend;
    }
    prevSimStage = stage;
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
    }
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
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);

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
  };
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
