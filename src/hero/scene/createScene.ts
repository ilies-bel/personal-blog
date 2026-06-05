// The scene controller: builds renderer/camera + all rigs, runs the per-frame loop, tears down.
import * as THREE from 'three';
import { HUD_NAV_BY_ID, type HudTargetId } from '../HudNavigation';
import { CFG, lookOffsetX, lookOffsetY, tuneParticlesForDevice } from '../lib/config';
import { DEBUG_WINDOW_KEYS, readDebugNumber } from '../lib/constants';
import { lifecycle, easeOut, smoothstep01 } from '../lifecycle';
import { buildGravitySim, type GravitySim } from '../gravitySim';
import { STAR_BACK_BASE_BRIGHT, buildSunRig } from './buildSunRig';
import { buildDisk } from './buildDisk';
import { buildStarfield, buildDistantStar } from './buildStarfield';
import { buildWarp } from './buildWarp';
import { buildRing } from './buildRing';
import { buildPostChain } from './buildPostChain';
import type { SceneHooks } from './types';

export function createScene(container: HTMLElement, reduced: boolean, hooks: SceneHooks): () => void {
  const diskParticles = tuneParticlesForDevice();
  const bCritShadow = 2.598; // (3√3/2) rs — shadow radius (informational)
  void bCritShadow;

  // --- renderer / scene / camera ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fovDeg, window.innerWidth / window.innerHeight, 0.1, 4000);
  const lookTarget = new THREE.Vector3(lookOffsetX, lookOffsetY, 0);

  // ---- renderers ----
  // Each piece (disk / starfield / warp arcs / photon ring / post chain) is now
  // built by its own build*() factory above (mirroring buildSunRig). The rigs own
  // their geometry, materials and disposal; createScene just wires them into the
  // resize/frame loops below. The shared uniform blocks + sub-objects are pulled
  // out into the same local names the loop already used, so the per-frame writes
  // and updateLensUniforms() stay byte-for-byte identical.
  const pr0 = renderer.getPixelRatio();

  const diskRig = buildDisk(scene, diskParticles, pr0);
  const diskMatPrimary = diskRig.primary;
  const diskMatSecondary = diskRig.secondary;
  const diskPrimary = diskRig.primaryPts;
  const diskSecondary = diskRig.secondaryPts;

  const starRig = buildStarfield(scene, diskParticles, pr0);
  const starUniforms = starRig.uniforms; // updateLensUniforms() writes through this
  const starMat = starRig.mat;
  const starMatSec = starRig.matSec;
  const starPts = starRig.pts;
  const starSecPts = starRig.secPts;

  const distantStarRig = buildDistantStar(scene, pr0);
  const distantStarUniforms = distantStarRig.uniforms;
  const distantStarPts = distantStarRig.pts;

  const warpRig = buildWarp(scene, diskParticles);
  const warpUniforms = warpRig.uniforms; // updateLensUniforms() writes through this
  const warpMat = warpRig.mat;
  const warpMatSec = warpRig.matSec;
  const warpSeg = warpRig.seg;
  const warpSeg2 = warpRig.seg2;

  const ringRig = buildRing(scene, pr0);
  const ringUniforms = ringRig.uniforms; // updateLensUniforms() writes through this
  const ringMat = ringRig.mat;
  const ringPts = ringRig.pts;

  const postRig = buildPostChain(renderer, scene, camera);
  const bloom = postRig.bloom;
  const gradePass = postRig.gradePass;
  const novaPass = postRig.novaPass;

  // --- yellow-star sun rig (revealed only during the yellow stage) ---
  // The yellow star is a small anchor that GROWS into the red giant. The red
  // giant is the point cloud at uGiantR (4.2) × its sunRadFac (2.35) = 9.87 world
  // units, so the dying star lands at 9.87 × 0.18 ≈ 1.78 — a small isolated orb
  // that inflates to the bloated giant. NOTE: the cloud's grow-start factor in the
  // vertex shader (`mix(0.18, 1.0, uYrGrow)`) MUST equal this 0.18 so the gold
  // particle sphere is size-matched to the mesh at the swap.
  const RED_GIANT_RADIUS = 4.2 * 2.35; // point-cloud red giant world radius
  const SUN_RIG_RADIUS = RED_GIANT_RADIUS * 0.18; // dying star: small grow anchor
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
    const D = camera.position.length();
    const shadowAng = CFG.coreSize / D;
    const ndcShadow = shadowAng / Math.tan(fovY / 2);
    const thetaE = ndcShadow * CFG.lens;
    // dev: holeScale resizes the interior blackout sphere (the dark shadow disc).
    // The disk carve, the star/warp inner cutoff and the ring radius all key off
    // uHole, so this scales the whole void consistently.
    const holeR = ndcShadow * CFG.holeFactor;
    const starThetaE = holeR * 1.55;
    const pr = renderer.getPixelRatio();

    for (const m of [diskMatPrimary, diskMatSecondary]) {
      m.uniforms.uAspect.value = aspect;
      m.uniforms.uShadowR.value = ndcShadow;
      m.uniforms.uThetaE.value = thetaE;
      m.uniforms.uHole.value = holeR;
      m.uniforms.uPixelRatio.value = pr;
    }
    ringUniforms.uShadowR.value = ndcShadow;
    ringUniforms.uAspect.value = aspect;
    ringUniforms.uHole.value = holeR;
    ringUniforms.uPixelRatio.value = pr;
    for (const u of [starUniforms, starMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
      u.uPixelRatio.value = pr;
    }
    distantStarUniforms.uShadowR.value = ndcShadow;
    distantStarUniforms.uThetaE.value = starThetaE;
    distantStarUniforms.uHole.value = holeR;
    distantStarUniforms.uAspect.value = aspect;
    distantStarUniforms.uPixelRatio.value = pr;
    for (const u of [warpUniforms, warpMatSec.uniforms]) {
      u.uShadowR.value = ndcShadow;
      u.uThetaE.value = starThetaE;
      u.uHole.value = holeR;
      u.uAspect.value = aspect;
    }
  }

  function onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
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

  let mouseX = 0;
  let mouseY = 0;
  const onPointerMove = (e: PointerEvent): void => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('pointermove', onPointerMove);

  const t0 = performance.now();
  let raf = 0;
  let stopped = false;

  // easeOut (cubic) + smoothstep01 are the single-source-of-truth easings, now
  // owned by lifecycle.ts (imported above). The stateful clock below still needs
  // them: easeOut for the intro dezoom ramp, smoothstep01 for the nova rise.

  // The lifecycle position is eased toward its scroll target each frame so a
  // flick of the wheel glides through the transitions instead of snapping.
  // stage 0→1 = reverse supernova; 1→2 = red giant.
  let stage = 0;
  let focusGlow = 0;
  // previous-frame stage for the gravity sim (more substeps on a fast scroll).
  let prevSimStage = 0;

  // --- supernova whiteout: a TIME-based flash envelope, decoupled from scroll ---
  // The old flash was a Gaussian in `morph` (scroll position) ~0.1 wide, so a fast
  // scroll skipped it entirely. Instead we TRIGGER on the breakout crossing and run
  // our own clock to completion, so the blast is always seen at full length no
  // matter how fast the visitor scrolls. `nova` (0..1) is the master envelope that
  // drives the whiteout pass + the particle/bloom/exposure beats.
  let novaStart = -1;     // performance.now() ms at fire; -1 = idle
  let novaArmed = true;   // hysteresis latch: re-arm only after leaving the band
  let prevMorph = 0;      // previous-frame morph, for crossing detection
  // direction the blast plays, latched at fire and held for the whole envelope:
  //   +1 EXPLODE  — scroll UP, red giant → black hole (morph FALLING through 0.5),
  //                 time forward: a star collapses, detonates, blasts outward.
  //   -1 IMPLODE  — scroll DOWN, black hole → red giant (morph RISING through 0.5),
  //                 time backward: the "un-explosion", light gathers inward.
  let novaDir = 1;
  const NOVA_TRIGGER = 0.5;  // breakout (where the legacy flash fired)
  const NOVA_ARM = 0.12;     // must move |morph-0.5| beyond this to re-arm
  const NOVA_RISE = 0.12;    // s: dark → blinding peak
  const NOVA_HOLD = 0.22;    // s: hold at peak white
  const NOVA_DECAY = 1.2;    // s: cool-out, reveal the remnant
  const NOVA_DUR = NOVA_RISE + NOVA_HOLD + NOVA_DECAY; // 1.54 s total
  const NOVA_COOLDOWN = 900; // ms minimum between fires (anti-strobe backstop)
  let nebulaFlashStart = -1;
  let nebulaFlashArmed = true;
  let prevNebulaStage = 0;
  const NEBULA_FLASH_TRIGGER = 3.5;
  const NEBULA_FLASH_ARM = 0.18;
  const NEBULA_FLASH_RISE = 0.08;
  const NEBULA_FLASH_HOLD = 0.18;
  const NEBULA_FLASH_DECAY = 1.55;
  const NEBULA_FLASH_DUR = NEBULA_FLASH_RISE + NEBULA_FLASH_HOLD + NEBULA_FLASH_DECAY;
  const NEBULA_FLASH_COOLDOWN = 1200;
  const frameLookTarget = new THREE.Vector3();
  const flashOrigin = new THREE.Vector3();

  function frame(): void {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const t = (now - t0) / 1000;

    // --- lifecycle position, smoothed toward the scroll target ---
    const exploring = hooks.isExplorationMode?.() === true;
    const focusTarget = exploring ? hooks.getFocusTarget?.() ?? null : null;
    const stageTarget = hooks.getStage();
    stage += (stageTarget - stage) * (reduced ? 1 : 0.12);
    // DEBUG: window.__bhMorph forces the stage to an exact value (no smoothing)
    // so the explosion can be inspected frame-by-frame from a capture script.
    const morphOverride = readDebugNumber(DEBUG_WINDOW_KEYS.morph);
    if (typeof morphOverride === 'number') stage = morphOverride;
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

    const crossedNebula = (prevNebulaStage < NEBULA_FLASH_TRIGGER) !== (stage < NEBULA_FLASH_TRIGGER);
    if (
      crossedNebula && nebulaFlashArmed && !reduced && !exploring &&
      (nebulaFlashStart < 0 || now - nebulaFlashStart > NEBULA_FLASH_COOLDOWN)
    ) {
      nebulaFlashStart = now;
      nebulaFlashArmed = false;
    }
    if (!nebulaFlashArmed && Math.abs(stage - NEBULA_FLASH_TRIGGER) > NEBULA_FLASH_ARM) nebulaFlashArmed = true;
    prevNebulaStage = stage;
    let nebulaFlash = 0;
    if (nebulaFlashStart >= 0) {
      const te = (now - nebulaFlashStart) / 1000;
      if (te >= NEBULA_FLASH_DUR) nebulaFlashStart = -1;
      else if (te < NEBULA_FLASH_RISE) nebulaFlash = smoothstep01(te / NEBULA_FLASH_RISE);
      else if (te < NEBULA_FLASH_RISE + NEBULA_FLASH_HOLD) nebulaFlash = 1.0;
      else {
        const p = (te - NEBULA_FLASH_RISE - NEBULA_FLASH_HOLD) / NEBULA_FLASH_DECAY;
        nebulaFlash = 1.0 - p * p * (3.0 - 2.0 * p);
      }
    }
    const nebulaFlashOverride = readDebugNumber(DEBUG_WINDOW_KEYS.nebulaFlash);
    if (typeof nebulaFlashOverride === 'number') nebulaFlash = Math.max(0, Math.min(1, nebulaFlashOverride));

    const screenNova = Math.max(nova * 0.82, nebulaFlash);
    const nebulaFlashOwnsScreen = nebulaFlash >= nova * 0.82;
    novaPass.uniforms.uNova.value = screenNova;
    novaPass.uniforms.uPeak.value = nebulaFlashOwnsScreen ? 0.985 : 0.88;
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
    const s = lifecycle({
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
    diskMatPrimary.uniforms.uFlash.value = s.flash;
    diskMatSecondary.uniforms.uFlash.value = s.flash;
    // surface-collapse progress (0 full red-giant sphere → 1 collapsed to the point)
    diskMatPrimary.uniforms.uCollapse.value = s.kCollapse;
    diskMatSecondary.uniforms.uCollapse.value = s.kCollapse;

    // --- transitions 3-5: yellow star → nebula → pale blue dot ---
    // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
    // slot snaps to that state's stand-in at the stage midpoint (see lifecycle.ts
    // for s.yellow/s.nebula/s.dot). Replace this block (and the matching shader
    // placeholders, marked "REVIEW PLACEHOLDER") with the real morphs later; the
    // timeline placement stays the same.

    // --- transition 2: red giant (held at 1 once a later placeholder takes over) ---
    diskMatPrimary.uniforms.uGiant.value = s.giantHeld;
    diskMatSecondary.uniforms.uGiant.value = s.giantHeld;
    // The POINT CLOUD is always the RED GIANT (its grainy body), never the yellow
    // star — the yellow star is the mesh sun rig. So the cloud's uYellow stays 0;
    // the s.yellow flag still gates the timeline (laterActive / grade) inside lifecycle.
    diskMatPrimary.uniforms.uYellow.value = 0;
    diskMatSecondary.uniforms.uYellow.value = 0;
    // uNebula is 1 across the real nebula AND the gravitational-collapse window so
    // the cloud holds the analytic nebula placement (the sim's seed/home) while the
    // sim collapses it inward via uSimBlend below.
    diskMatPrimary.uniforms.uNebula.value = s.nebulaShader ? 1 : 0;
    diskMatSecondary.uniforms.uNebula.value = s.nebulaShader ? 1 : 0;
    diskMatPrimary.uniforms.uDot.value = s.dot ? 1 : 0;
    diskMatSecondary.uniforms.uDot.value = s.dot ? 1 : 0;

    // --- GPGPU gravitational collapse: step the sim + feed its texture to the cloud ---
    // The sim collapses the nebula particles inward to form the yellow star. It's
    // stepped only inside the window (s.collapse / s.simBlend > 0); otherwise the
    // home-spring would idle. uSimBlend morphs the disk from analytic → sim positions.
    let simBlend = 0;
    if (gravitySim.available && (s.simBlend > 0.001 || s.collapse > 0.001)) {
      // more substeps on a fast scroll so a flick still visibly collapses.
      const dStage = Math.abs(stage - prevSimStage);
      const substeps = 1 + Math.min(3, Math.floor(dStage / 0.05));
      gravitySim.step(s.collapse, t, substeps);
      const tex = gravitySim.getPosTexture();
      diskMatPrimary.uniforms.uSimPos.value = tex;
      diskMatSecondary.uniforms.uSimPos.value = tex;
      simBlend = s.simBlend;
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
    diskMatPrimary.uniforms.uYrFlash.value = s.yrFlash;
    diskMatSecondary.uniforms.uYrFlash.value = s.yrFlash;

    // grow + colour curves default to 1 (no-op) outside cloudSide.
    diskMatPrimary.uniforms.uYrGrow.value  = s.cloudSide ? s.yrGrow  : 1;
    diskMatSecondary.uniforms.uYrGrow.value = s.cloudSide ? s.yrGrow  : 1;
    diskMatPrimary.uniforms.uYrMix.value   = s.cloudSide ? s.yrColor : 1;
    diskMatSecondary.uniforms.uYrMix.value = s.cloudSide ? s.yrColor : 1;

    // The MESH holds small + fully gold across its whole side (no early redden,
    // no early shrink) — all the growing/cooling is the cloud's job now. This
    // removes the dual-schedule overlap that caused the two-entity + flicker bugs.
    // GRAVITATIONAL-COLLAPSE handoff: while the nebula collapses to feed the star
    // (s.starFormed 0→1) the mesh GROWS from a tiny core to full size as the gas
    // accretes onto it (the star is fed into existence), hidden under the bloom +
    // the bright converging cloud. Outside the window it sits at full size.
    const growing = s.starFormed > 0 && s.starFormed < 1;
    sunRig.group.scale.setScalar(s.starFormed > 0 ? 0.05 + 0.95 * s.starFormed : 1.0);
    // HOT YOUNG STAR: blue-white while still small/forming (mass→heat), cooling to
    // gold as it reaches full size. Stays blue through most of the growth and only
    // cools to gold near full size (1 - starFormed² holds the blue longer) so the
    // young-star colour actually reads before it settles.
    sunRig.surfaceMat.uniforms.uBlue.value = s.starFormed > 0 ? 1 - s.starFormed * s.starFormed : 0;
    sunRig.surfaceMat.uniforms.uRed.value = 0;
    sunRig.coronaMat.uniforms.uRed.value = 0;
    // FLARES (coronal loops + corona haze) only AFTER the star is fully sized:
    // suppressed entirely while growing, ramping in over the last 3% of growth so
    // the young forming star is a clean orb, not a flaring one. 1 outside the window.
    const flarePresence = s.starFormed > 0 ? smoothstep01((s.starFormed - 0.97) / 0.03) : 1;
    const dyingStarQuiet = s.meshSide && !growing ? 0.22 : 1;
    sunRig.loopMat.uniforms.uFade.value = flarePresence * dyingStarQuiet;
    sunRig.coronaMat.uniforms.uFade.value = flarePresence * dyingStarQuiet;
    // the glow shell cools blue→gold with the star as it grows.
    if (growing) {
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(
        0.35 + 0.65 * s.starFormed,
        0.55 * s.starFormed + 0.55 * (1 - s.starFormed),
        0.16 + 0.74 * (1 - s.starFormed),
      );
    } else {
      (sunRig.glowMat.uniforms.uColor.value as THREE.Color).setRGB(1.0, 0.55, 0.16);
    }
    sunRig.starMat.uniforms.uOpacity.value = 1;

    // Mesh visible across its side, plus a short overhang into the bright flash so
    // the handoff cross-dissolves under the bloom rather than hard-cutting. The
    // gold particle sphere appears at/just-below the peak (cloudSide) under the
    // same flash → the two textures are never both clearly visible.
    sunRig.group.visible = s.sunRigVisible;
    // The twinkling star backdrop dome is a SEPARATE scene object, so it can sit
    // behind BOTH the yellow star (mesh rig) and the RED GIANT (point cloud) — the
    // two states share one star field — while staying hidden for the black hole
    // (which keeps the warping lensed starfield), the nebula, the dot and the
    // collapse window. See s.starBackVisible in lifecycle().
    sunRig.starBack.visible = s.starBackVisible;
    // Compensate the dome's brightness for the red giant's dimmer post grade so the
    // shared star field reads the SAME behind both star states (see starBackBright).
    sunRig.starMat.uniforms.uBright.value = STAR_BACK_BASE_BRIGHT * s.starBackBright * (1 + focusGlow * 0.08);
    // Outside the yellow⇄red slot the cloud renders the red giant, the nebula AND
    // the pale-blue-dot. Inside the slot, the cloud body only shows on the cloud
    // side (the opaque mesh owns the yellow side).
    diskPrimary.visible = s.cloudShown;
    diskSecondary.visible = s.cloudShown;
    // Hide the lensed background starfield while the opaque mesh body is present
    // (it would bleed through); restore it once the cloud body takes over. ALSO
    // hide it across the NEBULA (the gas cloud sits alone against pure black).
    starPts.visible = s.starPtsVisible;

    // the star/warp lensing only makes sense while the hole exists — fade it (the
    // s.lensLive ramp + s.starBright are computed in lifecycle()). Once the SUN
    // forms we drop the gravitational-warp background entirely and restore the plain
    // starfield to full brightness (s.starBright) behind the star.
    starMat.uniforms.uStarBright.value = s.starBright;
    distantStarPts.visible = !s.gravityGone && stage < 0.45;
    distantStarUniforms.uPresence.value = distantStarPts.visible ? 1 - smoothstep01((stage - 0.08) / 0.34) : 0;
    // Completely remove ALL gravity once the star forms (s.gravityGone): the warp
    // arcs, the secondary (lensed) disk image, and the photon ring are switched off
    // — a star has no event horizon bending light around it. The plain (un-lensed)
    // starfield behind it is restored via uStarBright above. Below ~giant 0.02 these
    // are gone entirely.
    warpSeg.visible = !s.gravityGone;
    warpSeg2.visible = !s.gravityGone;
    diskSecondary.visible = !s.gravityGone;   // no lensed disk ghost behind the star
    ringPts.visible = !s.gravityGone;          // no photon ring around the star
    starSecPts.visible = false;              // secondary lensed star image stays off
    // The point-cloud red giant body renders at full base brightness; in the
    // yellow→red slot it simply appears under the swap flash (no ramp-in — its
    // gold→red look is driven by uYrMix/uYrFlash in the shader, not by emission).
    // Collapse cloud brightness (s.cloudBright): inside the collapse window it
    // brightens the converging infall (light pouring into the star) then fades the
    // cloud out as the mesh star forms — clean handoff. Exactly 1 outside the window.
    diskMatPrimary.uniforms.uBright.value = s.baseBright * s.cloudBright * focusEmission;
    diskMatSecondary.uniforms.uBright.value = s.baseBright * s.cloudBright * focusEmission;
    // Bloom + auto-exposure + grade + disk-saturation are all resolved by
    // lifecycle() (including the sun / red-giant / nebula branch overrides), so the
    // shell just assigns the finals. See lifecycle.ts for the per-beat reasoning
    // (the nebula branch carries the SHO-palette grade tuning).
    const nebulaDark = exploring
      ? 0
      : smoothstep01((stage - 3.30) / 0.17) * (1 - smoothstep01((stage - 3.50) / 0.17));
    const preFlashDarken = 1 - 0.88 * nebulaDark * (1 - nebulaFlash);
    bloom.strength = s.bloomStrength * focusBloom * preFlashDarken + nebulaFlash * 0.18;
    bloom.radius = s.bloomRadius;
    gradePass.uniforms.uExposure.value = s.exposure * preFlashDarken;
    gradePass.uniforms.uOlive.value = s.olive;
    gradePass.uniforms.uWarmth.value = s.warmth;
    gradePass.uniforms.uSat.value = s.gradeSat;
    gradePass.uniforms.uGrain.value = s.grain; // per-state film grain (0 in the nebula)
    diskMatPrimary.uniforms.uSat.value = s.diskSat;
    diskMatSecondary.uniforms.uSat.value = s.diskSat;

    // --- lifecycle zoom choreography (the scale story) ---
    // A black hole is tiny-but-massive; a star is huge-but-diffuse. The scale
    // story is told by the CAMERA (computed in lifecycle()): sit CLOSE on the hero
    // black hole so it fills the frame, rocket WAY BACK as the matter collapses to
    // its speck, then ease back to resting for the red giant. distFactor folds in
    // the intro dezoom; zoom is the lifecycle scale story; the novaKick is a subtle
    // outward shove timed to the blast (rides the TIME envelope, so a fast scroller
    // still feels the world recoil from the detonation).
    const dist = CFG.camDist * s.distFactor * s.zoom * s.novaKick;

    const incl = THREE.MathUtils.degToRad(CFG.inclDeg);
    const horiz = dist * Math.cos(incl);
    const camY0 = dist * Math.sin(incl);

    // --- idle liveliness: layered "breathing" so the resting camera never reads
    // as locked-off. Three incommensurate octaves on the vertical bob (their
    // periods don't share a common multiple, so the motion never visibly loops),
    // plus the pointer parallax. Folded together as yWobble below.
    const idleBob = reduced
      ? 0
      : Math.sin(t * 0.055) * 0.16 + Math.sin(t * 0.13 + 1.7) * 0.035 + Math.sin(t * 0.31 + 4.1) * 0.014;

    // azimuth: a small extra sweep during the intro, then steady rotation (both
    // shaped in lifecycle()). A slow lateral handheld sway + the pointer parallax
    // ride on top here, in the impure shell, since they are DOM/time input rather
    // than lifecycle state.
    const baseAz = THREE.MathUtils.degToRad(CFG.rotation);
    const idleSway = reduced ? 0 : Math.sin(t * 0.041 + 0.6) * 0.0025; // sub-degree drift
    const a = baseAz + s.introSweep + s.rotation + idleSway + mouseX * 0.04;
    const yWobble = idleBob + -mouseY * 0.25;

    camera.position.set(Math.sin(a) * horiz, camY0 + yWobble, Math.cos(a) * horiz);
    const redFrame =
      smoothstep01((stage - 1.58) / 0.42) *
      (1 - smoothstep01((stage - 2.86) / 0.34));
    const dyingFrame =
      smoothstep01((stage - 2.72) / 0.20) *
      (1 - smoothstep01((stage - 3.44) / 0.20));
    frameLookTarget.copy(lookTarget);
    frameLookTarget.x += redFrame * -2.25 + dyingFrame * 0.72;
    frameLookTarget.y += redFrame * 0.42 + dyingFrame * -0.18;
    camera.lookAt(frameLookTarget);

    flashOrigin.set(0, 0, 0).project(camera);
    novaPass.uniforms.uCenter.value.set(
      Math.max(0, Math.min(1, flashOrigin.x * 0.5 + 0.5)),
      Math.max(0, Math.min(1, flashOrigin.y * 0.5 + 0.5)),
    );

    // --- supernova shake/rumble + idle roll (applied AFTER lookAt) -------------
    // lookAt rewrites the camera's orientation every frame, so the roll + local
    // translations below are self-clearing — they never accumulate. Two layers:
    //
    //   • idle roll: a barely-there, slow view-axis tilt so the horizon breathes
    //     even at rest (handheld feel). Sub-0.1°.
    //   • blast shake: when s.shakeAmp is hot, a SUBTLE rumble — multi-axis local-
    //     space jitter (screen-relative shudder) + a small view-axis roll. Driven
    //     by layered high-frequency sines at incommensurate rates so it reads as
    //     organic rumble, not a clean wobble. Amplitude is shakeAmp, a hump that
    //     peaks as the whiteout CLEARS (see lifecycle.ts), so the rattle lands on
    //     the reveal, not behind the white.
    //
    // The positional shudder is scaled by `dist` so it's a constant ANGULAR shake
    // (same on-screen amplitude whether we're close on the BH or way back at the
    // remnant — a fixed world offset would vanish at the far blast distance).
    if (!reduced) {
      const idleRoll = Math.sin(t * 0.067 + 2.3) * 0.0016; // rad, ~0.09°
      const sh = s.shakeAmp;
      if (sh > 0.0001) {
        const f = t * 47.0; // fast carrier for the rumble
        const amp = dist * 0.009 * sh; // angular shudder scale (≈0.9% of frame at peak)
        // local-space positional shudder (X = screen horizontal, Y = vertical)
        const jx = (Math.sin(f * 1.00) + Math.sin(f * 2.30 + 1.3)) * 0.5 * amp;
        const jy = (Math.sin(f * 1.37 + 0.7) + Math.sin(f * 2.90 + 3.1)) * 0.5 * amp;
        const jz = Math.sin(f * 0.83 + 2.0) * amp * 0.6; // dolly punch in/out
        camera.translateX(jx);
        camera.translateY(jy);
        camera.translateZ(jz);
        // view-axis roll: a soft "blast" cue — the horizon eases off level.
        // ~1.6° at peak (0.028 rad) so the tilt is felt, not jarring.
        const shakeRoll = (Math.sin(f * 0.91 + 0.4) + Math.sin(f * 1.70 + 2.6)) * 0.5 * 0.028 * sh;
        camera.rotateZ(idleRoll + shakeRoll);
      } else {
        camera.rotateZ(idleRoll);
      }
    }

    // --- FOV breath on the detonation -----------------------------------------
    // The lens widens a touch on the blast then settles. fovKick is 0 at rest,
    // so the projection matrix is only rebuilt while the kick is live.
    const fov = CFG.fovDeg + s.fovKick;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const ut = reduced ? 0 : t;
    diskMatPrimary.uniforms.uTime.value = ut;
    diskMatSecondary.uniforms.uTime.value = ut;
    starMat.uniforms.uTime.value = ut;
    starMatSec.uniforms.uTime.value = ut;
    distantStarUniforms.uTime.value = ut;
    warpMat.uniforms.uTime.value = ut;
    warpMatSec.uniforms.uTime.value = ut;
    ringMat.uniforms.uTime.value = ut;
    gradePass.uniforms.uTime.value = ut;

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

    // Each rig disposes its own geos + materials (and, for post, the composer +
    // bloom + grade material) — construction and teardown are now co-located in
    // the build*() factories, so this just calls each rig's dispose().
    postRig.dispose();
    diskRig.dispose();
    starRig.dispose();
    distantStarRig.dispose();
    warpRig.dispose();
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
