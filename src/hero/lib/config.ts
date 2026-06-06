// Scene configuration — the tuned constants for the black-hole hero, plus the
// device/runtime helpers that read the environment.
//
// Physics adapted from github.com/vlwkaos/threejs-blackhole: Keplerian orbits,
// relativistic beaming ∝ δ³, gravitational redshift, T ∝ r^-3/4 (rs = 1; the hole
// sits at the world origin). Brightness-related values are lifted above the moody
// reference still so the hero reads as clearly luminous (see exposure / bloomStr /
// disk brightness).

export interface Config {
  rIn: number;
  rOut: number;
  diskThickness: number;
  diskParticles: number;
  diskDistrib: number;
  coreSize: number;
  holeFactor: number;
  ringBright: number;
  omega0: number;
  spinDir: number;
  betaScale: number;
  beamExp: number;
  doppler: number;
  lens: number;
  secScale: number;
  vertAsym: number;
  horizAsym: number;
  inclDeg: number;
  camDist: number;
  fovDeg: number;
  rotation: number;
  exposure: number;
  bloomStr: number;
  bloomRad: number;
  grain: number;
  warmth: number;
  saturation: number;
  olive: number;
  warp: number;
  starBright: number;
  starDensity: number;
}

export const CFG: Config = {
  // --- disk ---
  rIn: 2.55,
  rOut: 18.0,
  diskThickness: 0.215,
  diskParticles: 1_200_000,
  diskDistrib: 0.78,
  coreSize: 2.06,
  holeFactor: 0.88,
  ringBright: 0.62, // brighter rim (ref: 0.44)

  // --- physics ---
  omega0: 0.5,
  spinDir: -1.0,
  betaScale: 0.53,
  beamExp: 2.7,
  doppler: 0.55,
  lens: 1.72,
  secScale: 0.85,
  vertAsym: 1.0,
  horizAsym: 0.56,

  // --- camera (resting pose; the intro travels in to this) ---
  inclDeg: 5.0,
  camDist: 20.0,
  fovDeg: 30.0,
  rotation: 35.0,

  // --- render (brightened) ---
  exposure: 0.85, // ref: 0.50 → noticeably brighter
  bloomStr: 0.78, // ref: 0.56
  bloomRad: 0.45,
  grain: 0, // film grain removed from all states
  warmth: 0.01,
  saturation: 0.38,
  olive: 1.3, // warm-graphite grade strength at the black hole (was olive-green 1.6)
  warp: 0.76,
  starBright: 3.6, // ref: 3.0
  starDensity: 5.2,
};

// Fixed screen-space look offset.
export const lookOffsetX = -0.82;
export const lookOffsetY = 0.16;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function tuneRenderPixelRatio(reduced = false): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || width < 760;
  if (reduced) return Math.min(dpr, 1.25);
  if (isMobile) return Math.min(dpr, 1.4);
  if (width < 1280) return Math.min(dpr, 1.6);
  return Math.min(dpr, 1.85);
}

// Particle count tuned down for smaller / mobile devices.
export function tuneParticlesForDevice(): number {
  if (typeof window === 'undefined') return CFG.diskParticles;
  const width = window.innerWidth;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || width < 760;
  if (width < 480) return 95_000;
  if (isMobile) return 150_000;
  if (width < 1280) return 240_000;
  return CFG.diskParticles;
}
