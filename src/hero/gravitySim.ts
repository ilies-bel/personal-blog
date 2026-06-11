// ===========================================================================
// gravitySim.ts — GPGPU gravitational collapse: nebula → yellow star.
//
// The reverse-lifecycle hero plays nebula (stage 4) → yellow star (stage 3) as
// the visitor scrolls UP. We want the ~1.2M nebula gas particles to actually
// COLLAPSE inward under gravity, swirl into filaments, and feed the (mesh) star
// as they reach the core — instead of the old hard-swap that snapped the cloud
// from the nebula placement to the photosphere.
//
// This is a STATEFUL sim (the rest of the hero is stateless/analytic): per-
// particle position + velocity live in float textures, ping-ponged each frame by
// GPUComputationRenderer and integrated with semi-implicit Euler.
//
// Gravity model (chosen with the user): a real softened central well (Plummer)
// whose mass GROWS as particles accrete (runaway collapse), plus curl-noise
// turbulence so the infall reads as swirling gas, NOT a sterile radial implosion.
// No O(N²) pairwise self-gravity (infeasible at 1.2M).
//
// Reversibility (chosen with the user): a HOME-SPRING. A stateful integrator
// can't be scrubbed backwards bit-exactly, but the endpoints can be made exact:
// at collapse=0 (stage ≥ 3.5) a stiff spring pulls every particle back to its
// analytic nebula home (heavy damping → snaps to the exact dispersed nebula);
// at collapse=1 (stage ≤ 3.05) full gravity + accretion. So scrolling up un-
// collapses cleanly and the hero stays scrub-anywhere.
//
// The seed pass reproduces the disk shader's nebula placement VERBATIM (the
// shared NEBULA_PLACE_FN below is concatenated into both the disk vertex shader
// and this sim), so the sim STARTS looking exactly like the analytic nebula and
// there is no pop when uSimBlend ramps up from 0 at stage 3.5.
// ===========================================================================

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// The Variable returned by addVariable() (typed via three's bundled JSDoc).
type SimVariable = ReturnType<GPUComputationRenderer['addVariable']>;

// --- shared GLSL ----------------------------------------------------------

/**
 * Cheap value-noise helpers (h31 / vnoise / fbm). DECLARED here for the sim's
 * compute shaders. The disk vertex shader already declares identical copies
 * inline, so NEBULA_PLACE_FN (below) deliberately does NOT redeclare them — it
 * is concatenated AFTER these in the sim, and after the disk shader's own copies
 * in BlackHole.tsx. Keeping the source identical is what makes the seed bit-match.
 */
export const NOISE_GLSL = /* glsl */ `
  float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=h31(i+vec3(0,0,0)), n100=h31(i+vec3(1,0,0));
    float n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1));
    float n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float s=0.0, a=0.5;
    for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; }
    return s;
  }
`;

/**
 * The nebula PLACEMENT function — extracted VERBATIM from the disk vertex
 * shader's nebula block so the analytic path and the sim seed produce the exact
 * same `wp`. Returns the warped world position of a nebula particle.
 *
 * Inputs mirror the disk shader's per-particle attributes + uniforms:
 *   aSeed, aU, aPhase — per-particle identity
 *   uTime            — drives the slow nDrift roll (FROZEN during collapse so the
 *                      home-spring target is stable; the disk shader passes its
 *                      live uTime, which equals the frozen value at the window edge)
 *   uGiantR          — nebula extent scale (NR = uGiantR*1.30)
 *
 * Depends on h31() and fbm() being declared earlier in the shader (they are: the
 * disk shader declares them at the top; the sim prepends NOISE_GLSL).
 */
export const NEBULA_PLACE_FN = /* glsl */ `
  vec3 nebulaPlace(float aSeed, float aU, float aPhase, float uTime, float uGiantR){
    // ITEM 5: a LESS-circular volume that reads as RAW MATERIAL / unfinished gas, not a
    // decorative magic ball. The placement is the SINGLE source shared by the sim seed
    // AND the analytic render (disk.glsl imports this fn), so both stay in lockstep.
    // ELL is made ASYMMETRIC again (stretched on X/Z, squashed on Y) so the silhouette
    // is an oblique cloud, not a circle.
    vec3 ELL = vec3(1.22, 0.86, 1.10);
    float NR = uGiantR * 1.72;                          // overall nebula extent (bigger → fills the frame)
    vec3 nDrift = vec3(uTime*0.006, uTime*0.004, -uTime*0.005);

    vec3 hh = vec3(
      h31(vec3(aSeed*13.0, aU*17.0,  5.0)),
      h31(vec3(aSeed*7.0,  aPhase*9.0, 23.0)),
      h31(vec3(aU*29.0,    aPhase*3.0, 41.0))
    );
    // UNIFORM point in a BALL: pick a uniform direction on the unit sphere (z = 1-2u,
    // azimuth 2*pi*v) and a cube-root radius so density is even out to NR.
    float uz = hh.x * 2.0 - 1.0;                        // cos(theta), uniform in [-1,1]
    float az = hh.y * 6.2831853;                        // azimuth, uniform in [0,2pi)
    float rad = sqrt(max(0.0, 1.0 - uz*uz));
    vec3 dir = vec3(rad*cos(az), uz, rad*sin(az));
    float rr = pow(hh.z, 0.3333);                        // even volumetric fill
    vec3 p0 = dir * rr * NR;
    p0 *= ELL;
    // DIAGONAL SHEAR: shear X by Z (and a touch Y by X) so the cloud leans on a diagonal
    // axis instead of sitting axis-aligned — reads as wind-blown raw gas, not a symmetric ball.
    p0.x += p0.z * 0.34 + p0.y * 0.10;
    p0.y += p0.x * 0.08;

    vec3 warp = vec3(
      fbm(p0*0.42 +  3.0 + nDrift),
      fbm(p0*0.42 + 17.0 + nDrift),
      fbm(p0*0.42 + 41.0 + nDrift)
    ) - 0.5;
    vec3 wp = p0 + warp * (NR * 0.85);                   // a touch more warp → raggeder edges

    // EMPTY HOLES (ITEM 5): carve voids through the cloud so it reads as fragments /
    // unfinished paths, not a solid magic cloud. A low-frequency noise mask over the
    // placement decides where the gas is thin: in the void pockets (mask below a
    // threshold) particles are PUSHED radially outward (so the inner pocket empties and
    // the gas piles into raggeder filaments around it). Deterministic in the seed, so it
    // is identical every visit and the sim's home target carves the same holes.
    float holeMask = fbm(wp*0.30 + 53.0);               // 0..1 lumpy field over the cloud
    float voidAmt = smoothstep(0.52, 0.30, holeMask);   // 1 deep in a void pocket → 0 in the gas
    wp += normalize(wp + 1e-4) * voidAmt * (NR * 0.42); // push void gas outward → hollow pockets

    return wp;
  }
`;

// --- texture dimensioning -------------------------------------------------

export interface SimDimensions {
  width: number;
  height: number;
}

/**
 * Square-ish texture sized to hold N particles, width rounded up to a multiple
 * of 4 for alignment. width*height ≥ N; the tail texels (width*height − N) are
 * "dead" particles the render side never samples (geometry has exactly N verts).
 *
 * Pure — unit-testable without a GL context.
 */
export function simDimensions(n: number): SimDimensions {
  const root = Math.ceil(Math.sqrt(Math.max(1, n)));
  const width = Math.ceil(root / 4) * 4;
  const height = Math.ceil(n / width);
  return { width, height };
}

// --- compute shaders ------------------------------------------------------

// Velocity update: softened central well (mass grows with accreted fraction) +
// curl-noise turbulence + a home-spring back to the analytic nebula. The well
// vs. spring blend is gated by uCollapseDrive (0 dispersed → 1 fully collapsed).
const velocityShader = /* glsl */ `
  uniform sampler2D uSeedTex; // rgb = aSeed, aU, aPhase (same texel mapping as the sim)
  uniform float uDt;
  uniform float uG;          // gravitational constant (tuned, not physical)
  uniform float uM0;         // base central mass
  uniform float uEps;        // Plummer softening length
  uniform float uMaxSpeed;   // velocity clamp (anti fly-apart / singularity)
  uniform float uDamp;       // viscous damping in the collapse regime
  uniform float uHomeDamp;   // (stiff) damping in the relaxed/home regime
  uniform float uHomeK;      // home-spring stiffness
  uniform float uCurlAmp;    // curl turbulence strength
  uniform float uCollapseDrive; // 0 = relaxed/home, 1 = full collapse
  uniform float uAccretedFrac;  // 0..1 fraction parked on the core (grows mass)
  uniform float uCoreR;      // accretion core radius (turbulence fades inside)
  uniform float uTime;       // animation clock (curl drift)
  uniform float uFrozenTime; // FROZEN nebula time → stable home target
  uniform float uGiantR;     // nebula extent scale

  // finite-difference curl of an fbm potential → divergence-free swirl
  vec3 curlNoise(vec3 p){
    const float e = 0.35;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    float x1 = fbm(p + dy) - fbm(p - dy);
    float x2 = fbm(p + dz) - fbm(p - dz);
    float y1 = fbm(p + dz) - fbm(p - dz);
    float y2 = fbm(p + dx) - fbm(p - dx);
    float z1 = fbm(p + dx) - fbm(p - dx);
    float z2 = fbm(p + dy) - fbm(p - dy);
    return normalize(vec3(x1 - x2, y1 - y2, z1 - z2) + 1e-6);
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 P = texture2D(texturePosition, uv);
    vec4 V = texture2D(textureVelocity, uv);
    vec3 pos = P.xyz; float life = P.w;
    vec3 vel = V.xyz; float seed = V.w;

    // parked particles (life≈0) stop integrating — they're on the star now.
    if(life <= 0.001){ gl_FragColor = vec4(0.0, 0.0, 0.0, seed); return; }

    float dist = length(pos);

    // (1) softened central well; mass grows as the cloud feeds the star
    float M = uM0 * (1.0 + 3.0*uAccretedFrac);
    float soft = dist*dist + uEps*uEps;
    vec3 aGrav = -uG * M * pos / pow(soft, 1.5);

    // (2) curl turbulence, faded out near the core (clean accretion)
    float edge = smoothstep(uCoreR, uCoreR*4.0, dist);
    vec3 aCurl = uCurlAmp * edge * curlNoise(pos*0.35 + uTime*0.05);

    // (3) home-spring back to the analytic nebula placement (reversibility).
    // Read the TRUE per-particle (aSeed,aU,aPhase) from the seed texture at this
    // texel — same mapping as the render side — so the home target is this exact
    // particle's analytic nebula home (not an approximation from the seed alone).
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 home = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    vec3 aHome = uHomeK * (home - pos);

    // blend the two regimes by the scroll-derived collapse drive
    vec3 acc = mix(aHome, aGrav + aCurl, uCollapseDrive);

    // semi-implicit Euler (update v here, x in the position pass)
    vel += acc * uDt;
    float damp = mix(uHomeDamp, uDamp, uCollapseDrive);
    vel *= (1.0 - clamp(damp*uDt, 0.0, 1.0));
    float spd = length(vel);
    if(spd > uMaxSpeed) vel *= uMaxSpeed/spd;

    gl_FragColor = vec4(vel, seed);
  }
`;

// Position update: integrate, then accrete (park on the core surface).
const positionShader = /* glsl */ `
  uniform float uDt;
  uniform float uCoreR;
  uniform float uParkRate;

  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 P = texture2D(texturePosition, uv);
    vec4 V = texture2D(textureVelocity, uv);
    vec3 pos = P.xyz; float life = P.w;

    if(life <= 0.001){ gl_FragColor = P; return; } // parked: frozen on the surface

    pos += V.xyz * uDt;

    // accretion: inside the core radius, park ON the (growing) photosphere shell
    // and ramp life → 0 over a few frames so the render side can dim/hand off.
    float dist = length(pos);
    if(dist < uCoreR){
      pos = normalize(pos + 1e-4) * uCoreR;
      life = max(0.0, life - uParkRate);
    }
    gl_FragColor = vec4(pos, life);
  }
`;

// Seed pass: write the EXACT analytic nebula placement into the position texture,
// indexed by the per-texel seed baked into uSeedTex. Velocity seeds to a small
// tangential swirl (angular momentum → infalling disk/streamers, not a dead
// radial plummet). Run ONCE at init via doRenderTarget into both ping-pong RTs.
const seedPositionShader = /* glsl */ `
  uniform sampler2D uSeedTex;  // rgb = aSeed, aU, aPhase (baked at build time)
  uniform float uFrozenTime;
  uniform float uGiantR;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 wp = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    gl_FragColor = vec4(wp, 1.0);  // life = 1 (free gas)
  }
`;

const seedVelocityShader = /* glsl */ `
  uniform sampler2D uSeedTex;
  uniform float uFrozenTime;
  uniform float uGiantR;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 wp = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    // a SMALL tangential swirl about the y axis so the infall forms streamers,
    // plus a gentle inward bias so the gas leans toward the star from the start
    // (more particles actually reach + feed the core rather than orbiting forever).
    // RANDOM per-particle swirl axis (NOT a global y axis) so the infall does not form
    // a clean equatorial disk + polar columns (the cross-seam artifact). Each particle
    // orbits about its own jittered axis, so the collapse is chaotic from all sides.
    vec3 rnd = normalize(vec3(
      h31(vec3(sd.x*91.0, sd.y*13.0, 7.0)) - 0.5,
      h31(vec3(sd.y*51.0, sd.z*29.0, 3.0)) - 0.5,
      h31(vec3(sd.z*17.0, sd.x*37.0, 5.0)) - 0.5
    ) + 1e-4);
    vec3 tang = normalize(cross(rnd, wp) + 1e-4);
    vec3 inward = -normalize(wp + 1e-4);
    float swirl = 0.10 + 0.22*h31(vec3(sd.x*5.0, sd.y*7.0, 11.0));
    gl_FragColor = vec4(tang * swirl + inward * (0.20 + 0.25*sd.y), sd.x); // w = seed
  }
`;

// --- subsystem ------------------------------------------------------------

/** The two baked snapshot textures bracketing a scroll position, plus the blend. */
export interface SimSample {
  texA: THREE.Texture;
  texB: THREE.Texture;
  /** 0 → fully texA, 1 → fully texB. */
  mix: number;
}

export interface GravitySim {
  /** true when float targets are supported and the sim is live. */
  available: boolean;
  /** legacy no-op (kept so any stale callers don't break). */
  step: () => void;
  /**
   * Run the real collapse ONCE and snapshot it into a flipbook of GPU textures.
   * Idempotent — the first call bakes; later calls are no-ops. Cheap enough to call
   * lazily on the first frame the collapse is needed (≈ one short burst of compute).
   */
  bake: () => void;
  /** true once bake() has produced the snapshot flipbook. */
  isBaked: () => boolean;
  /**
   * Return the two baked snapshots bracketing scroll `progress` (0 = dispersed nebula,
   * 1 = fully collapsed) and the blend between them. A PURE FUNCTION of progress, so the
   * collapse scrubs identically in both directions — no state, no replay, no snap-back.
   * Returns null before bake() has run.
   */
  sampleAt: (progress: number) => SimSample | null;
  dispose: () => void;
}

const FIXED_DT = 1 / 60;

interface GravitySimParams {
  renderer: THREE.WebGLRenderer;
  count: number;
  aSeed: Float32Array;
  aU: Float32Array;
  aPhase: Float32Array;
  giantR: number;
  /** accretion core radius (matches the growing photosphere). */
  coreR: number;
  /** half-float on constrained devices to halve bandwidth. */
  halfFloat: boolean;
}

/**
 * Build the GPGPU collapse sim. Returns `{ available:false }` (a no-op) when
 * WebGL2 float targets are unavailable so the caller falls back to the analytic
 * hard-swap. Never logs in production.
 */
export function buildGravitySim(params: GravitySimParams): GravitySim {
  const { renderer, count, aSeed, aU, aPhase, giantR, coreR, halfFloat } = params;

  const noop: GravitySim = {
    available: false,
    step: () => {},
    bake: () => {},
    isBaked: () => false,
    sampleAt: () => null,
    dispose: () => {},
  };

  if (!renderer.capabilities.isWebGL2) return noop;

  const { width, height } = simDimensions(count);
  const gpu = new GPUComputationRenderer(width, height, renderer);
  if (halfFloat) gpu.setDataType(THREE.HalfFloatType);

  // bake per-particle (aSeed, aU, aPhase) into a seed texture sampled by the
  // seed passes; tail texels (index ≥ count) get zeros (harmless dead particles).
  const seedData = new Float32Array(width * height * 4);
  for (let i = 0; i < count; i++) {
    seedData[i * 4 + 0] = aSeed[i];
    seedData[i * 4 + 1] = aU[i];
    seedData[i * 4 + 2] = aPhase[i];
    seedData[i * 4 + 3] = 1;
  }
  const seedTex = new THREE.DataTexture(seedData, width, height, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  // shared GLSL prelude for every compute shader (noise + the placement fn).
  const prelude = NOISE_GLSL + NEBULA_PLACE_FN;

  const pos0 = gpu.createTexture();
  const vel0 = gpu.createTexture();

  const velVar: SimVariable = gpu.addVariable('textureVelocity', prelude + velocityShader, vel0);
  const posVar: SimVariable = gpu.addVariable('texturePosition', prelude + positionShader, pos0);
  gpu.setVariableDependencies(velVar, [velVar, posVar]);
  gpu.setVariableDependencies(posVar, [velVar, posVar]);

  velVar.material.uniforms.uSeedTex = { value: seedTex };
  velVar.material.uniforms.uDt = { value: FIXED_DT };
  velVar.material.uniforms.uG = { value: 22.0 }; // strong pull → MORE gas reaches the core
  velVar.material.uniforms.uM0 = { value: 1.0 };
  velVar.material.uniforms.uEps = { value: giantR * 0.15 };
  velVar.material.uniforms.uMaxSpeed = { value: giantR * 4.5 };
  // moderate damping bleeds orbital energy so swirling gas spirals IN and accretes
  // over the collapse, but not so hard that it plummets straight (we want chaos).
  velVar.material.uniforms.uDamp = { value: 1.2 };
  velVar.material.uniforms.uHomeDamp = { value: 8.0 };
  velVar.material.uniforms.uHomeK = { value: 30.0 };
  // STRONG curl turbulence so the infall churns — chaotic streamers/filaments feeding
  // the star, organic and asymmetric (the whole point of using the real sim).
  velVar.material.uniforms.uCurlAmp = { value: 3.2 };
  velVar.material.uniforms.uCollapseDrive = { value: 0 };
  velVar.material.uniforms.uAccretedFrac = { value: 0 };
  // a wider capture radius so MORE of the infalling gas parks onto the star.
  velVar.material.uniforms.uCoreR = { value: coreR * 1.35 };
  velVar.material.uniforms.uTime = { value: 0 };
  velVar.material.uniforms.uFrozenTime = { value: 0 };
  velVar.material.uniforms.uGiantR = { value: giantR };

  posVar.material.uniforms.uDt = { value: FIXED_DT };
  posVar.material.uniforms.uCoreR = { value: coreR * 1.35 };
  posVar.material.uniforms.uParkRate = { value: 0.08 };

  const error = gpu.init();
  if (error !== null) {
    seedTex.dispose();
    gpu.dispose();
    return noop;
  }

  // --- seed both ping-pong render targets to the analytic nebula placement ---
  const seedPosMat = gpu.createShaderMaterial(prelude + seedPositionShader, {
    uSeedTex: { value: seedTex },
    uFrozenTime: { value: 0 },
    uGiantR: { value: giantR },
  });
  const seedVelMat = gpu.createShaderMaterial(prelude + seedVelocityShader, {
    uSeedTex: { value: seedTex },
    uFrozenTime: { value: 0 },
    uGiantR: { value: giantR },
  });
  // Reset both ping-pong RTs (pos + vel) to the analytic nebula placement → the sim
  // returns to the dispersed cloud. Used at init AND to REWIND: "scroll = time" means
  // scrolling UP replays the deterministic sim from this seed forward to the (smaller)
  // target step, so the collapse always tracks the scrollbar both directions.
  const reseed = (): void => {
    for (const rt of posVar.renderTargets) gpu.doRenderTarget(seedPosMat, rt);
    for (const rt of velVar.renderTargets) gpu.doRenderTarget(seedVelMat, rt);
  };
  reseed();

  // --- BAKED FLIPBOOK: run the real collapse ONCE, snapshot K frames ----------
  // The collapse is a real stateful N-body-style sim, but a stateful integrator can't
  // be scrubbed backward cheaply (rewinding meant reseed+replay-from-zero, which on
  // back-and-forth scrolling made the cloud snap back to dispersed and re-collapse —
  // the "whole animation bugs" report). So we run the sim ONCE at load, snapshotting
  // SNAP_COUNT evenly-spaced frames of the collapse into persistent GPU textures, and
  // at scroll time just blend the two snapshots bracketing the scroll position. The
  // collapse is then a PURE FUNCTION of scroll: scrub-anywhere, both directions, no
  // state, no per-frame physics. uTime is frozen, so the bake is deterministic.
  const MAX_STEPS = 110; // full-collapse integration length (tuned for the scroll span)
  const SNAP_COUNT = 17; // baked frames (snapshot 0 = dispersed, last = fully collapsed)
  velVar.material.uniforms.uCollapseDrive.value = 1;

  // persistent snapshot render targets — one per baked frame. Built via the GPGPU's
  // own factory so they match its targets EXACTLY (RGBA, same float/half-float type,
  // NearestFilter, ClampToEdge, no depth) — we sample them by exact texel UV.
  const snaps: THREE.WebGLRenderTarget[] = [];

  // a trivial blit material that copies the GPGPU position texture into a snapshot RT.
  const copyMat = gpu.createShaderMaterial(
    /* glsl */ `
      uniform sampler2D uSrc;
      void main(){ gl_FragColor = texture2D(uSrc, gl_FragCoord.xy / resolution.xy); }
    `,
    { uSrc: { value: null as THREE.Texture | null } },
  );

  // INCREMENTAL bake: ~110 compute passes over a 1.2M-texel sim crammed into one frame
  // would be a visible hitch, so bake() is RESUMABLE — call it each frame and it advances
  // a bounded number of steps, capturing any snapshots it crosses, until all SNAP_COUNT
  // are done. The first frame seeds + captures snapshot 0, so sampleAt() has the dispersed
  // nebula immediately; later snapshots fill in over the next few frames (the visitor is
  // still easing into the collapse, so the deeper frames are ready before they're needed).
  const STEPS_PER_BAKE_FRAME = 14; // compute passes per frame while baking (≈8 frames total)
  let bakeStarted = false;
  let bakeDone = false;
  let curStep = 0;
  let nextSnap = 0; // index of the next snapshot to capture

  const stepTargetFor = (s: number): number => Math.round((s / (SNAP_COUNT - 1)) * MAX_STEPS);

  const captureSnapshot = (): void => {
    const rt = gpu.createRenderTarget(width, height);
    copyMat.uniforms.uSrc.value = gpu.getCurrentRenderTarget(posVar).texture;
    gpu.doRenderTarget(copyMat, rt);
    snaps.push(rt);
    nextSnap++;
  };

  const bake = (): void => {
    if (bakeDone) return;
    if (!bakeStarted) {
      bakeStarted = true;
      reseed(); // start from the dispersed nebula (both ping-pong RTs = analytic home)
      captureSnapshot(); // snapshot 0 = dispersed cloud, available from frame one
    }
    // advance up to STEPS_PER_BAKE_FRAME compute passes, capturing snapshots crossed.
    let budget = STEPS_PER_BAKE_FRAME;
    while (nextSnap < SNAP_COUNT && budget > 0) {
      const targetStep = stepTargetFor(nextSnap);
      if (curStep >= targetStep) {
        captureSnapshot();
        continue;
      }
      velVar.material.uniforms.uAccretedFrac.value = Math.min(1, curStep / MAX_STEPS);
      gpu.compute();
      curStep++;
      budget--;
    }
    if (nextSnap >= SNAP_COUNT) bakeDone = true;
  };

  // Return the two baked snapshots bracketing `progress` and the blend between them.
  // PURE: same progress → same pair + mix, so scrubbing is perfectly reversible. While
  // the bake is still in flight, clamp to the deepest snapshot captured so far (the
  // collapse just can't run ahead of the bake for a frame or two — never wrong, just
  // briefly capped).
  const sampleAt = (progress: number): SimSample | null => {
    if (snaps.length === 0) return null;
    const p = Math.min(1, Math.max(0, progress));
    const f = p * (SNAP_COUNT - 1); // fractional snapshot index
    const maxI = snaps.length - 1; // deepest captured snapshot
    if (maxI === 0) return { texA: snaps[0].texture, texB: snaps[0].texture, mix: 0 };
    const i = Math.min(maxI - 1, Math.floor(f));
    return { texA: snaps[i].texture, texB: snaps[i + 1].texture, mix: Math.min(1, f - i) };
  };

  // legacy no-op kept so any stale callers don't break.
  const step = (): void => {};
  const isBaked = (): boolean => bakeDone;

  const dispose = (): void => {
    seedTex.dispose();
    seedPosMat.dispose();
    seedVelMat.dispose();
    copyMat.dispose();
    for (const rt of snaps) rt.dispose();
    gpu.dispose();
  };

  return { available: true, step, bake, isBaked, sampleAt, dispose };
}
