// Cursor-photon rig: the cursor EMITS light, and the black hole absorbs it with
// real gravity. While the pointer moves over the black-hole chapter, a stream of
// silver-blue photons is THROWN along the cursor's own motion — the launch
// direction is the pointer's world-space velocity (with a small angular jitter),
// nudged so the trajectory's impact parameter lands near the photon sphere —
// and each one integrates a Paczyński–Wiita pseudo-Newtonian acceleration every
// frame: light BENDS around the shadow — near-misses whip around the rim in
// near-orbit arcs, closer passes spiral in and are swallowed at the horizon with
// a brighten-and-shrink gulp. Cursor SPEED drives both how many photons spawn
// and how bright they start: a slow drift sheds faint embers, a fast flick
// throws a bright directional stream.
//
// Everything is POOLED and allocation-free on the hot path (the eruption-pool
// precedent in createScene): preallocated Float32Arrays for state, one shared
// THREE.Points for the heads, one shared THREE.LineSegments for ALL trails
// (exactly one extra draw call), scratch Vector3s created once at build.
import * as THREE from 'three';
import { CFG } from '../lib/config';
import {
  photonsVertexShader,
  photonsFragmentShader,
  photonTrailVertexShader,
  photonTrailFragmentShader,
} from '../shaders/photons.glsl';
import type { Rig } from './types';

export interface PhotonsRig extends Rig {
  pts: THREE.Points;
  /** Advance the pool one frame. dt is the CALLER-clamped frame delta (seconds);
   *  stage is the eased lifecycle stage (emission gates on it); ndcX/ndcY the
   *  pointer in NDC (-1..1, y up). Call AFTER the camera's final pose is resolved
   *  — spawning unprojects through the camera and the heads/trails must agree
   *  with what this frame actually renders. */
  update: (dt: number, camera: THREE.PerspectiveCamera, stage: number, ndcX: number, ndcY: number) => void;
  /** Queue an n-photon radial fan for the NEXT update (a click "flash"). Spent
   *  through the same stage emission gate as the move stream; stale bursts are
   *  cleared each frame so a click during a later chapter never banks photons. */
  burst: (n: number) => void;
}

// --- pool / physics constants (final, tuned) --------------------------------
/** Pool size. 768 covers the worst case (fast continuous sweep + a click burst
 *  with 4s-lived photons) without ever reallocating; dead slots cost a degenerate
 *  zero-size vertex each. */
const POOL = 768;
/** Photon launch budget at FULL cursor speed. Actual spawn count scales with
 *  pointer NDC speed via a smoothstep (see SPEED_LO/SPEED_HI) and accumulates
 *  fractionally, so a slow drift still sheds the occasional single ember instead
 *  of flatly emitting 8/frame the moment the pointer twitches. */
const SPAWN_PER_FRAME = 8;
/** Pointer NDC speed (units/s) band mapped onto spawn rate AND spawn intensity.
 *  Full NDC width is 2, so 3.5 u/s ≈ sweeping the whole viewport in ~0.6s — a
 *  deliberate flick. Below SPEED_LO the cursor counts as parked (dark). */
const SPEED_LO = 0.08;
const SPEED_HI = 3.5;
/** Spawn intensity band: a slow drift launches dim embers (0.5), a fast flick
 *  launches over-unity photons (2.0) that punch through the bloom threshold.
 *  Replaces the old fixed 1.5–2.0 random roll — brightness now MEANS speed. */
const INTENSITY_LO = 0.5;
const INTENSITY_HI = 2.0;
/** Spawn-rate floor while the pointer is genuinely moving: the smoothstep
 *  crushes drift speeds to ~zero, but "the cursor emits" means a slow drift
 *  must still shed the odd faint ember — 0.05 × SPAWN_PER_FRAME ≈ one every
 *  couple of frames. Intensity is NOT floored, so those embers stay dim. */
const EMBER_FLOOR = 0.05;
/** Photon speed, world units/s. NOT physical c — tuned so a photon crosses the
 *  ~20-unit camera frame in a couple of seconds and its bending is watchable. */
const LIGHT_SPEED = 9.0;
/** Capture radius = the VISIBLE shadow-disc rim (the same coreSize×holeFactor
 *  product the lens/carve math keys off — see updateLensUniforms). A photon that
 *  crosses this is swallowed exactly where the screen shows blackness. ≈1.81. */
const RS = CFG.coreSize * CFG.holeFactor;
/** Paczyński–Wiita gravitational parameter: a = −GM/(r−RS)² r̂. This pseudo-
 *  Newtonian potential reproduces the key GR behaviours that make it read as a
 *  BLACK hole rather than a planet: diverging force at the horizon (RS), an
 *  unstable photon-orbit band, and capture for small impact parameters. 150 is
 *  tuned against LIGHT_SPEED so a cursor-distance launch bends visibly and a
 *  near-rim pass whips through ~90-180° before escaping or falling in. */
const GM = 150;
/** The (r − RS) denominator clamp: keeps the acceleration finite on the frame a
 *  photon straddles the horizon (it is captured that same frame anyway). */
const PW_DENOM_MIN = 0.05;
/** Angular jitter (radians, ±) around the throw direction: enough spread that a
 *  straight flick reads as a stream rather than a wire, small enough that the
 *  stream stays DIRECTIONAL — the cursor visibly throws light where it moves. */
const THROW_JITTER = 0.175; // ≈ ±10°
/** Photon-sphere aiming: after the throw direction is set, blend it AIM_BLEND
 *  toward the direction whose impact parameter is B_TARGET·RS — near the
 *  Paczyński–Wiita photon sphere at 1.5·RS. This is why a visible fraction of
 *  the stream whips AROUND the hole in near-orbit arcs instead of flying past:
 *  the launch is quietly aimed at the unstable-orbit band. 0.35 keeps the throw
 *  still reading as "along the flick"; 1.0 would funnel everything identically. */
const B_TARGET = 1.75; // ×RS, inside the 1.5–2·RS near-orbit band
const AIM_BLEND = 0.35;
/** Retire ages/distances: a photon lives at most 4s (fading over its last 0.5s
 *  so the stream never pops) and is culled once it escapes past 60 units. */
const MAX_AGE = 4.0;
const END_FADE = 0.5;
const MAX_R = 60;
/** Capture swallow duration: 0.28s of brighten (2×) + shrink-to-zero, position
 *  FROZEN at the capture point — a gulp at the rim, not a slide into black. */
const SWALLOW_S = 0.28;
/** Emission stage gate: full emission at the black-hole hold (stage ≤ 0), fading
 *  linearly to ZERO by stage 0.45 — the cursor only "emits" while the hole is
 *  the subject. In-flight photons keep integrating past the gate (they finish
 *  their arcs naturally instead of vanishing on the first scroll tick). */
const EMIT_STAGE_END = 0.45;
/** Head sprite base size (pre perspective attenuation, see photons.glsl.ts). */
const U_SIZE = 6.5;
/** Pointer motion (NDC distance) below which no photons spawn: emission gates on
 *  ACTUAL movement so a parked cursor is dark, matching "the cursor emits". */
const MOVE_EPS = 0.0015;
/** Gravitational blueshift: falling toward the hole, a photon gains energy —
 *  brightness ramps ×(1 + BLUE_K·RS/(r−RS)) (soft-clamped denominator, capped at
 *  BLUE_CAP) and its color slides from warm dim silver toward pure blue-white
 *  (the color mix lives in photons.glsl.ts, keyed off this same factor). The
 *  hole's rim glows blue with infalling light; the far field stays quiet. */
const BLUE_K = 0.6;
const BLUE_CAP = 2.5;
const BLUE_DENOM_MIN = 0.3;

// --- trails ------------------------------------------------------------------
/** History points kept per photon. Pushed every OTHER frame (~30Hz), so 20
 *  points ≈ 0.65s of path — long enough that a photon-sphere whip shows most of
 *  its arc at once. The trail CARRIES the visual (heads are deliberately dim,
 *  see photons.glsl.ts); the whole pool is still one LineSegments draw. */
const TRAIL_PTS = 20;
const TRAIL_SEGS = TRAIL_PTS - 1; // 19 segments per photon
/** Trail brightness at the head, as a fraction of the photon's own intensity.
 *  0.85 (was 0.55) — with the heads dimmed the streak is the light source now;
 *  the quadratic head→tail fade below keeps it a comet, not a wire. */
const TRAIL_HEAD_GAIN = 0.85;

export function buildPhotons(scene: THREE.Scene): PhotonsRig {
  // --- pooled state (allocated once; ZERO allocations in update) -------------
  const positions = new Float32Array(POOL * 3);
  const velocity = new Float32Array(POOL * 3);
  const intensity = new Float32Array(POOL); // base brightness (speed-scaled at spawn)
  const sizeScale = new Float32Array(POOL); // 1 in flight → 0 across the swallow
  const age = new Float32Array(POOL);
  const swallowT = new Float32Array(POOL);
  /** 0 = free slot, 1 = flying, 2 = swallow (captured, gulping at the rim). */
  const mode = new Uint8Array(POOL);

  // GPU-visible per-photon attributes (aI carries the FADED intensity so the
  // shader needs no age math; aS the swallow shrink; aB the blueshift factor).
  const aI = new Float32Array(POOL);
  const aS = new Float32Array(POOL);
  const aB = new Float32Array(POOL);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aI', new THREE.BufferAttribute(aI, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setAttribute('aB', new THREE.BufferAttribute(aB, 1));
  // Never cull: photons range anywhere within MAX_R of the origin and the buffer
  // is mostly dead slots — a huge static bounding sphere skips the recompute.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: U_SIZE },
    },
    vertexShader: photonsVertexShader,
    fragmentShader: photonsFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  // Layer 0 — the MAIN pass, deliberately NOT the half-res particle layer: the
  // photons are few and bright, so they render full-res and bloom picks them up.
  scene.add(pts);

  // --- shared trail rig: ONE LineSegments over every photon's history --------
  // Ring-buffered history per photon, pushed every OTHER frame. Rendered as 19
  // segments per photon with a quadratic head→tail intensity fade — one draw call
  // for all 768 possible trails.
  const trailHistory = new Float32Array(POOL * TRAIL_PTS * 3);
  const trailCount = new Uint8Array(POOL); // valid history points (0..20)
  const trailHead = new Uint8Array(POOL); // ring index of the newest point
  /** 1 while a photon's trail vertices hold live data. Lets a dead slot's 38
   *  vertices be zeroed ONCE (not re-zeroed every frame for 700+ dead slots). */
  const trailLive = new Uint8Array(POOL);
  const trailPositions = new Float32Array(POOL * TRAIL_SEGS * 2 * 3);
  const trailI = new Float32Array(POOL * TRAIL_SEGS * 2);
  const trailB = new Float32Array(POOL * TRAIL_SEGS * 2);

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('aI', new THREE.BufferAttribute(trailI, 1));
  trailGeo.setAttribute('aB', new THREE.BufferAttribute(trailB, 1));
  trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const trailMat = new THREE.ShaderMaterial({
    vertexShader: photonTrailVertexShader,
    fragmentShader: photonTrailFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const trails = new THREE.LineSegments(trailGeo, trailMat);
  trails.frustumCulled = false;
  scene.add(trails);

  // Hidden until something actually lives — an idle pool costs zero draws.
  pts.visible = false;
  trails.visible = false;

  // --- scratch (created once; update() allocates NOTHING) --------------------
  const scratchProj = new THREE.Vector3();
  const spawnPos = new THREE.Vector3();
  const prevSpawnPos = new THREE.Vector3();
  const throwDir = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const viewDir = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const pos = new THREE.Vector3();

  // Pointer-motion gate state. prev is seeded OUT of NDC range so the very first
  // update can never read a phantom "movement" from (0,0) → the real pointer.
  let prevNdcX = 99;
  let prevNdcY = 99;
  // Fractional spawn accumulator: SPAWN_PER_FRAME × speedGain is usually not an
  // integer at drift speeds — banking the fraction lets a slow drift emit one
  // ember every few frames instead of rounding to a hard zero-or-eight.
  let spawnAcc = 0;
  // Frame-parity flip for the every-other-frame trail push.
  let trailFlip = false;
  // Click burst queued for the next update (cleared each frame — never banked).
  let burstPending = 0;
  let liveCount = 0;

  /** Find a free slot (linear scan — POOL is small and mode is a hot Uint8Array).
   *  Returns -1 when the pool is saturated; the spawn is simply skipped (a full
   *  pool means the screen is already dense with light). */
  const takeSlot = (): number => {
    for (let i = 0; i < POOL; i++) if (mode[i] === 0) return i;
    return -1;
  };

  /** Nudge `vel` (a unit-ish direction from `spawnPos`) toward the launch
   *  direction whose impact parameter is B_TARGET·RS — the photon-sphere aim.
   *  In the plane spanned by (radial, current direction) the direction achieving
   *  impact parameter b from radius r is  −r̂·√(r²−b²)/r + t̂·(b/r)  where t̂ is
   *  the in-plane tangential unit matching the current orbit sense. Blend
   *  AIM_BLEND toward it and renormalize. Scratch-only, no allocations. */
  const aimAtPhotonSphere = (): void => {
    radial.copy(spawnPos);
    const r = radial.length();
    const b = B_TARGET * RS;
    if (r <= b + 1e-4) return; // already inside the target band — leave it
    radial.multiplyScalar(1 / r); // r̂
    // t̂: the component of the throw perpendicular to r̂ (keeps the orbit sense).
    tangent.copy(vel).addScaledVector(radial, -vel.dot(radial));
    if (tangent.lengthSq() < 1e-8) {
      // Dead-radial throw: pick a screen-plane perpendicular so the aim can bend
      // it into an arc at all (sign random — either orbit sense reads fine).
      tangent.crossVectors(radial, viewDir);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
      if (Math.random() < 0.5) tangent.multiplyScalar(-1);
    }
    tangent.normalize();
    const bOverR = b / r;
    aimDir
      .copy(radial)
      .multiplyScalar(-Math.sqrt(Math.max(0, 1 - bOverR * bOverR)))
      .addScaledVector(tangent, bOverR);
    vel.normalize().lerp(aimDir, AIM_BLEND).normalize();
  };

  /** Launch one photon from `spawnPos` (already resolved on the hole's depth
   *  plane). `vel` must already hold the desired throw DIRECTION (any length);
   *  it is photon-sphere-aimed then renormalized to EXACTLY c: light never
   *  launches slow. `launchIntensity` is the speed-scaled spawn brightness. */
  const launch = (launchIntensity: number): void => {
    const i = takeSlot();
    if (i < 0) return;
    aimAtPhotonSphere();
    vel.normalize().multiplyScalar(LIGHT_SPEED);

    positions[i * 3] = spawnPos.x;
    positions[i * 3 + 1] = spawnPos.y;
    positions[i * 3 + 2] = spawnPos.z;
    velocity[i * 3] = vel.x;
    velocity[i * 3 + 1] = vel.y;
    velocity[i * 3 + 2] = vel.z;
    intensity[i] = launchIntensity;
    sizeScale[i] = 1;
    age[i] = 0;
    swallowT[i] = 0;
    mode[i] = 1;
    // Trail starts fresh at the spawn point.
    trailCount[i] = 1;
    trailHead[i] = 0;
    trailHistory[i * TRAIL_PTS * 3] = spawnPos.x;
    trailHistory[i * TRAIL_PTS * 3 + 1] = spawnPos.y;
    trailHistory[i * TRAIL_PTS * 3 + 2] = spawnPos.z;
    liveCount++;
  };

  /** Zero a dead slot's GPU data. Head via aI=0 (the shader collapses the point);
   *  trail vertices zeroed ONCE via the trailLive flag. */
  const killSlot = (i: number): void => {
    mode[i] = 0;
    aI[i] = 0;
    aS[i] = 0;
    if (trailLive[i]) {
      trailI.fill(0, i * TRAIL_SEGS * 2, (i + 1) * TRAIL_SEGS * 2);
      trailLive[i] = 0;
    }
    liveCount--;
  };

  const update = (
    dt: number,
    camera: THREE.PerspectiveCamera,
    stage: number,
    ndcX: number,
    ndcY: number,
  ): void => {
    // --- emission gate: stage band × actual pointer motion -------------------
    // Full emission while the black hole holds (stage ≤ 0), fading linearly to
    // zero by EMIT_STAGE_END — past that the cursor goes dark but in-flight
    // photons below keep integrating (their arcs finish naturally).
    const emitGain = stage <= 0 ? 1 : Math.max(0, 1 - stage / EMIT_STAGE_END);
    const ndcDist = Math.hypot(ndcX - prevNdcX, ndcY - prevNdcY);
    const hadPrev = Math.abs(prevNdcX) <= 1.5; // first frame: prev is the seed
    const moved = ndcDist > MOVE_EPS && hadPrev;
    // Pointer NDC speed (units/s) → one smoothstep gain that drives BOTH the
    // spawn rate and the spawn intensity: how fast you throw is how much light
    // you throw and how hard it burns.
    const ndcSpeed = moved && dt > 0 ? ndcDist / dt : 0;
    const st = Math.min(1, Math.max(0, (ndcSpeed - SPEED_LO) / (SPEED_HI - SPEED_LO)));
    const speedGain = st * st * (3 - 2 * st); // smoothstep
    const spawnIntensity = INTENSITY_LO + (INTENSITY_HI - INTENSITY_LO) * speedGain;

    let wantMove = 0;
    if (moved && emitGain > 0) {
      spawnAcc += SPAWN_PER_FRAME * Math.max(speedGain, EMBER_FLOOR) * emitGain;
      wantMove = Math.floor(spawnAcc);
      spawnAcc -= wantMove;
    } else {
      spawnAcc = 0; // a parked cursor never banks emission
    }
    const wantBurst = emitGain > 0 ? Math.round(burstPending * emitGain) : 0;
    burstPending = 0; // stale bursts never bank across frames

    if (wantMove + wantBurst > 0 && dt > 0) {
      // Unproject the pointer onto the HOLE'S depth plane: project the world
      // origin to get its NDC depth, then unproject (ndcX, ndcY, that z) — the
      // photon spawns at the 3D point that sits exactly under the cursor at the
      // hole's distance, so the geometry and the screen agree.
      const originNdcZ = scratchProj.set(0, 0, 0).project(camera).z;
      spawnPos.set(ndcX, ndcY, originNdcZ).unproject(camera);
      camera.getWorldDirection(viewDir);

      if (wantMove > 0) {
        // VELOCITY-ALIGNED throw: the world-space pointer delta on the emission
        // plane IS the throw direction — photons fly where the cursor flicked.
        prevSpawnPos.set(prevNdcX, prevNdcY, originNdcZ).unproject(camera);
        throwDir.copy(spawnPos).sub(prevSpawnPos);
        const hasThrow = throwDir.lengthSq() > 1e-8;
        if (hasThrow) throwDir.normalize();
        for (let n = 0; n < wantMove; n++) {
          if (hasThrow) {
            // Small in-screen-plane jitter (±THROW_JITTER) around the throw so
            // the stream has body without losing its direction.
            tangent.crossVectors(throwDir, viewDir);
            if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
            tangent.normalize();
            const a = (Math.random() * 2 - 1) * THROW_JITTER;
            vel.copy(throwDir).multiplyScalar(Math.cos(a)).addScaledVector(tangent, Math.sin(a));
          } else {
            // Just-moved-but-basically-stationary: keep the old gentle spread —
            // a screen-plane tangential skim with a slight inward bias.
            radial.copy(spawnPos);
            if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
            radial.normalize();
            tangent.crossVectors(radial, viewDir);
            if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
            tangent.normalize();
            if (Math.random() < 0.5) tangent.multiplyScalar(-1);
            vel.copy(tangent).addScaledVector(radial, (Math.random() - 0.65) * 0.45);
          }
          launch(spawnIntensity);
        }
      }

      // CLICK BURST: a radial fan in the screen plane — a flash in every
      // direction, deliberately NOT velocity-aligned (a click is a point event).
      if (wantBurst > 0) {
        // Screen-plane basis from the view direction (world-up cross, then
        // completing the frame) — the fan lies flat on what the viewer sees.
        radial.set(0, 1, 0).cross(viewDir);
        if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
        radial.normalize();
        tangent.crossVectors(viewDir, radial).normalize();
        for (let n = 0; n < wantBurst; n++) {
          const th = ((n + Math.random() * 0.8) / wantBurst) * Math.PI * 2;
          vel.copy(radial).multiplyScalar(Math.cos(th)).addScaledVector(tangent, Math.sin(th));
          launch(INTENSITY_HI); // a click flashes at full brightness
        }
      }
    }

    // --- integrate every live photon -----------------------------------------
    trailFlip = !trailFlip;
    for (let i = 0; i < POOL; i++) {
      const m = mode[i];
      if (m === 0) continue;

      if (m === 2) {
        // SWALLOW: frozen at the capture point, 2× brighten + shrink to zero
        // over SWALLOW_S — the horizon gulps the photon, it doesn't fade out.
        // aB keeps its captured (maximal) blueshift, so the flash is blue-white.
        swallowT[i] += dt;
        const k = Math.min(1, swallowT[i] / SWALLOW_S);
        aI[i] = intensity[i] * 2 * (1 - k);
        aS[i] = sizeScale[i] * (1 - k);
        if (k >= 1) killSlot(i);
        continue;
      }

      // FLYING: age/escape retirement first (cheaper than the force math).
      age[i] += dt;
      pos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      const r = pos.length();
      if (age[i] > MAX_AGE || r > MAX_R) {
        killSlot(i);
        continue;
      }
      if (r < RS) {
        // CAPTURE: crossed the visible shadow rim → freeze and swallow.
        mode[i] = 2;
        swallowT[i] = 0;
        continue;
      }

      // Paczyński–Wiita acceleration a = −GM/(r−RS)² r̂ (denominator clamped so
      // the horizon-straddling frame stays finite), then RENORMALIZE the speed
      // back to c: gravity BENDS light, it never slows it. This is what makes a
      // near-miss whip around the rim instead of braking into a Newtonian orbit.
      const denom = Math.max(r - RS, PW_DENOM_MIN);
      const aMag = -GM / (denom * denom) / r; // ÷r folds the r̂ normalization in
      vel.set(velocity[i * 3], velocity[i * 3 + 1], velocity[i * 3 + 2]);
      vel.addScaledVector(pos, aMag * dt);
      vel.normalize().multiplyScalar(LIGHT_SPEED);
      pos.addScaledVector(vel, dt);
      velocity[i * 3] = vel.x;
      velocity[i * 3 + 1] = vel.y;
      velocity[i * 3 + 2] = vel.z;
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      // GRAVITATIONAL BLUESHIFT: infalling light gains energy. Brightness ramps
      // ×(1 + BLUE_K·RS/(r−RS)), soft-clamped and capped — the shaders read the
      // same aB factor to slide the color from warm silver to blue-white.
      const shift = Math.min(BLUE_CAP, 1 + (BLUE_K * RS) / Math.max(r - RS, BLUE_DENOM_MIN));
      aB[i] = shift;

      // End-of-life fade over the final END_FADE seconds so retirement never pops.
      const fade = Math.min(1, (MAX_AGE - age[i]) / END_FADE);
      aI[i] = intensity[i] * fade * shift;
      aS[i] = sizeScale[i];

      // Trail history: push every OTHER frame (~0.65s of path at 20 points).
      if (trailFlip) {
        const head = (trailHead[i] + 1) % TRAIL_PTS;
        trailHead[i] = head;
        if (trailCount[i] < TRAIL_PTS) trailCount[i]++;
        trailHistory[(i * TRAIL_PTS + head) * 3] = pos.x;
        trailHistory[(i * TRAIL_PTS + head) * 3 + 1] = pos.y;
        trailHistory[(i * TRAIL_PTS + head) * 3 + 2] = pos.z;
      }
    }
    prevNdcX = ndcX;
    prevNdcY = ndcY;

    // --- rebuild the shared trail buffers -------------------------------------
    // Live photons write their 19 segments (quadratic head→tail fade × the
    // photon's own faded intensity); dead slots were zeroed once in killSlot.
    for (let i = 0; i < POOL; i++) {
      if (mode[i] === 0) continue;
      const count = trailCount[i];
      const head = trailHead[i];
      const base = i * TRAIL_SEGS * 2;
      // With the heads dimmed the trail carries the visual — near-head segments
      // sit close under the photon's own brightness (quadratic fade to tail).
      const headI = aI[i] * TRAIL_HEAD_GAIN;
      const shift = aB[i];
      for (let s = 0; s < TRAIL_SEGS; s++) {
        const v0 = base + s * 2;
        if (s + 1 >= count) {
          // No history yet for this segment — degenerate + dark.
          trailI[v0] = 0;
          trailI[v0 + 1] = 0;
          continue;
        }
        const p0 = (i * TRAIL_PTS + ((head - s + TRAIL_PTS) % TRAIL_PTS)) * 3;
        const p1 = (i * TRAIL_PTS + ((head - s - 1 + TRAIL_PTS * 2) % TRAIL_PTS)) * 3;
        trailPositions[v0 * 3] = trailHistory[p0];
        trailPositions[v0 * 3 + 1] = trailHistory[p0 + 1];
        trailPositions[v0 * 3 + 2] = trailHistory[p0 + 2];
        trailPositions[v0 * 3 + 3] = trailHistory[p1];
        trailPositions[v0 * 3 + 4] = trailHistory[p1 + 1];
        trailPositions[v0 * 3 + 5] = trailHistory[p1 + 2];
        // Quadratic fade toward the tail — reads as a comet streak.
        const f0 = 1 - s / TRAIL_SEGS;
        const f1 = 1 - (s + 1) / TRAIL_SEGS;
        trailI[v0] = headI * f0 * f0;
        trailI[v0 + 1] = headI * f1 * f1;
        trailB[v0] = shift;
        trailB[v0 + 1] = shift;
      }
      trailLive[i] = 1;
    }

    // --- upload + visibility ---------------------------------------------------
    const active = liveCount > 0;
    pts.visible = active;
    trails.visible = active;
    if (active) {
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.aI as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.aS as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.aB as THREE.BufferAttribute).needsUpdate = true;
      (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (trailGeo.attributes.aI as THREE.BufferAttribute).needsUpdate = true;
      (trailGeo.attributes.aB as THREE.BufferAttribute).needsUpdate = true;
    }
  };

  const burst = (n: number): void => {
    burstPending = n;
  };

  const dispose = (): void => {
    scene.remove(pts);
    scene.remove(trails);
    geo.dispose();
    mat.dispose();
    trailGeo.dispose();
    trailMat.dispose();
  };

  return { pts, update, burst, dispose };
}
