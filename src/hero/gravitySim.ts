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
    // a ROUND volume (near-spherical, kept slightly irregular so it still feels
    // organic rather than a perfect CGI ball). MUST stay byte-identical to the
    // ELL in disk.glsl.ts — the sim seed and analytic placement share it.
    // ELL is pulled close to a unit sphere (was 1.12/0.95/1.06) so the cloud reads
    // as a CIRCLE, not a boxy ellipsoid.
    vec3 ELL = vec3(1.04, 1.0, 1.02);
    float NR = uGiantR * 1.72;                          // overall nebula extent (bigger → fills the frame)
    vec3 nDrift = vec3(uTime*0.006, uTime*0.004, -uTime*0.005);

    vec3 hh = vec3(
      h31(vec3(aSeed*13.0, aU*17.0,  5.0)),
      h31(vec3(aSeed*7.0,  aPhase*9.0, 23.0)),
      h31(vec3(aU*29.0,    aPhase*3.0, 41.0))
    );
    // UNIFORM point in a BALL. The old normalize(cube) biased directions toward the 8
    // cube corners → the cloud clumped along the diagonals and read as a rounded BOX.
    // Instead pick a UNIFORM direction on the unit sphere (z = 1-2u, azimuth 2*pi*v)
    // and a cube-root radius so density is even out to NR — a true round ball, no
    // corner bias, no rectangular silhouette.
    float uz = hh.x * 2.0 - 1.0;                        // cos(theta), uniform in [-1,1]
    float az = hh.y * 6.2831853;                        // azimuth, uniform in [0,2pi)
    float rad = sqrt(max(0.0, 1.0 - uz*uz));
    vec3 dir = vec3(rad*cos(az), uz, rad*sin(az));
    float rr = pow(hh.z, 0.3333);                        // even volumetric fill
    vec3 p0 = dir * rr * NR;
    p0 *= ELL;

    vec3 warp = vec3(
      fbm(p0*0.42 +  3.0 + nDrift),
      fbm(p0*0.42 + 17.0 + nDrift),
      fbm(p0*0.42 + 41.0 + nDrift)
    ) - 0.5;
    vec3 wp = p0 + warp * (NR * 0.75);
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
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 tang = normalize(cross(up, wp) + 1e-4);
    vec3 inward = -normalize(wp + 1e-4);
    float swirl = 0.14 * (0.5 + 0.5*sd.x);
    gl_FragColor = vec4(tang * swirl + inward * 0.35, sd.x); // w = per-particle seed
  }
`;

// --- subsystem ------------------------------------------------------------

export interface GravitySim {
  /** true when float targets are supported and the sim is live. */
  available: boolean;
  /** advance the sim by `substeps` fixed-dt steps at the given collapse drive. */
  step: (collapse: number, time: number, substeps: number) => void;
  /** current position texture (xyz = world pos, w = life) for the render shader. */
  getPosTexture: () => THREE.Texture | null;
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
    getPosTexture: () => null,
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
  // higher damping bleeds orbital energy so swirling gas spirals IN and accretes
  // instead of hanging in a diffuse halo (more particles actually feed the star).
  velVar.material.uniforms.uDamp = { value: 1.9 };
  velVar.material.uniforms.uHomeDamp = { value: 8.0 };
  velVar.material.uniforms.uHomeK = { value: 30.0 };
  // less curl so the inflow is more RADIAL (gas falls into the core, doesn't orbit).
  velVar.material.uniforms.uCurlAmp = { value: 1.1 };
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
  // posVar/velVar each hold two RTs (ping-pong); seed BOTH so the first compute
  // reads a valid previous state regardless of currentTextureIndex.
  for (const rt of posVar.renderTargets) gpu.doRenderTarget(seedPosMat, rt);
  for (const rt of velVar.renderTargets) gpu.doRenderTarget(seedVelMat, rt);
  seedPosMat.dispose();
  seedVelMat.dispose();

  const step = (collapse: number, time: number, substeps: number): void => {
    velVar.material.uniforms.uCollapseDrive.value = collapse;
    velVar.material.uniforms.uTime.value = time;
    // accreted fraction tracks the collapse drive (cheap proxy, no GPU readback):
    // mass only really grows once particles are well into the infall.
    velVar.material.uniforms.uAccretedFrac.value = Math.max(0, collapse - 0.4) / 0.6;
    const k = Math.max(1, Math.min(4, Math.floor(substeps)));
    for (let i = 0; i < k; i++) gpu.compute();
  };

  const getPosTexture = (): THREE.Texture => gpu.getCurrentRenderTarget(posVar).texture;

  const dispose = (): void => {
    seedTex.dispose();
    gpu.dispose();
  };

  return { available: true, step, getPosTexture, dispose };
}
