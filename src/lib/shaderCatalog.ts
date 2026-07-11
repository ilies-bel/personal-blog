// The documented-shader catalog — THE single source of truth for "how many
// shaders" anywhere on the site. behind-the-build.astro renders this array as
// its live gallery, and contentStats.ts derives the sitewide `shaders` count
// from SHADERS.length, so the prose ("one engine, N shaders") can never drift
// from the gallery it describes. Extracted from behind-the-build.astro in P6.
//
// DELIBERATELY NOT a glob over src/hero/shaders/*.glsl.ts: that directory holds
// TEN files, but cockpit.glsl.ts is HUD chrome (the de-cloak canopy), not one of
// the documented lifecycle shaders — a raw file count would silently lie the
// moment another support shader lands. This catalog counts what the page
// actually documents; adding a shader to the gallery updates every count.
//
// Each shader gets a representative excerpt rendered inline. Long shaders
// (disk, sun, tesseract) are pre-trimmed to a representative head so the page
// stays light; the caption notes line counts and links to the full source on
// GitHub. Imported strings give us byte-identical GLSL — the same text the GPU
// compiles.
import { LENS_GLSL } from '../hero/shaders/lens.glsl';
import { ringVertexShader, ringFragmentShader } from '../hero/shaders/ring.glsl';
import { warpVertexShader, warpFragmentShader } from '../hero/shaders/warp.glsl';
import { streakVertexShader, streakFragmentShader } from '../hero/shaders/streak.glsl';
import { diskVertexShader } from '../hero/shaders/disk.glsl';
import { starVertexShader } from '../hero/shaders/star.glsl';
import { sunSurfaceFrag } from '../hero/shaders/sun.glsl';
import { GradeShader, NovaShader } from '../hero/shaders/post.glsl';
import { tesseractBeamFrag } from '../hero/shaders/tesseract.glsl';

// One row per shader: name, the file the GLSL lives in, the stage we pin a
// SceneFigure to (which lifecycle beat best showcases it), the source excerpt
// to inline, and a short prose blurb. The order tracks the lifecycle —
// black-hole physics first, then the structural/tonal passes, then the
// yellow-star/disc/corridor entries.
export interface ShaderRow {
  name: string;
  file: string;
  stage: number;
  caption: string;
  description: string;
  excerpt: string;
  excerptIsHead?: boolean;
  excerptLines?: number;
  totalLines?: number;
}

// Pull a head excerpt of a long shader: the first N non-empty lines, so the toggle
// shows a representative slice without dumping ~138KB into the document.
const head = (s: string, n: number): string => s.split('\n').slice(0, n).join('\n');
const ringSrc = `// --- vertex ---\n${ringVertexShader}\n// --- fragment ---\n${ringFragmentShader}`;
const warpSrc = `// --- vertex ---\n${warpVertexShader}\n// --- fragment ---\n${warpFragmentShader}`;
const streakSrc = `// --- vertex ---\n${streakVertexShader}\n// --- fragment ---\n${streakFragmentShader}`;
const postSrc = `// --- grade (vertex) ---\n${GradeShader.vertexShader}\n// --- grade (fragment) ---\n${GradeShader.fragmentShader}\n// --- nova (fragment) ---\n${NovaShader.fragmentShader}`;

export const SHADERS: readonly ShaderRow[] = [
  {
    name: 'lens',
    file: 'src/hero/shaders/lens.glsl.ts',
    stage: 0,
    caption: 'Lens — gravitational deflection',
    description:
      'A shared point-lens function reused by the disk, the warp arcs, and the starfield. Bends every clip-space vertex around the black-hole image plane and returns both the deflected position and a magnification scalar.',
    excerpt: LENS_GLSL,
  },
  {
    name: 'ring',
    file: 'src/hero/shaders/ring.glsl.ts',
    stage: 0,
    caption: 'Photon ring — size-coupled rim of light',
    description:
      'The thin cold-silver rim around the shadow. Brightness and band-width are coupled to the morph uniform so the ring tightens and dims as the hole shrinks toward the seed.',
    excerpt: ringSrc,
  },
  {
    name: 'warp',
    file: 'src/hero/shaders/warp.glsl.ts',
    stage: 0,
    caption: 'Warp arcs — tangentially magnified starlight',
    description:
      'Light bent into short arcs in a narrow band around the Einstein radius. Uses the same lens math as the starfield but draws arcs instead of points, so the bent-light caustics stay legible.',
    excerpt: warpSrc,
  },
  {
    name: 'star',
    file: 'src/hero/shaders/star.glsl.ts',
    stage: 0.6,
    caption: 'Starfield — lensed dome of distant stars',
    description:
      'A 3D dome of points pushed through the same lens function. Each star carries a primary image plus an opposite-side secondary, so the lensing produces the characteristic Einstein ring as the hole crosses the field.',
    excerpt: head(starVertexShader, 80),
    excerptIsHead: true,
    excerptLines: 80,
    totalLines: 163,
  },
  {
    name: 'streak',
    file: 'src/hero/shaders/streak.glsl.ts',
    stage: 0.4,
    caption: 'Streaks — two-tier hyperspace lanes',
    description:
      'A radial line-streak rig with two opacity tiers: a few strong structural rays carrying signal and a soft field of faint lanes that recede. Active only in the dive / hyperspace beat.',
    excerpt: streakSrc,
  },
  {
    name: 'disk',
    file: 'src/hero/shaders/disk.glsl.ts',
    stage: 0,
    caption: 'Accretion disk — the ~1.2M-point cloud',
    description:
      'The cloud that morphs from Keplerian-orbit disk to nebula. Per-point vertex morph drives the position; relativistic beaming, gravitational redshift, and a T ∝ r^-3/4 colour ramp drive the fragment. The dominant draw cost on the page.',
    excerpt: head(diskVertexShader, 110),
    excerptIsHead: true,
    excerptLines: 110,
    totalLines: 2049,
  },
  {
    name: 'sun',
    file: 'src/hero/shaders/sun.glsl.ts',
    stage: 2.9,
    caption: 'Sun — photosphere, corona, glow',
    description:
      'The dedicated yellow-star mesh rig: a tilted photosphere with noise-driven granulation, a corona, an outer glow, and four addressable eruption slots driven from the same getStage value.',
    excerpt: head(sunSurfaceFrag, 90),
    excerptIsHead: true,
    excerptLines: 90,
    totalLines: 565,
  },
  {
    name: 'post',
    file: 'src/hero/shaders/post.glsl.ts',
    stage: 0.9,
    caption: 'Post — grade and nova whiteout',
    description:
      'Two full-screen passes composited after the bloom: a filmic grade with state-tunable tone-map and shadow tint, and the supernova whiteout that fires on the morph breakout.',
    excerpt: postSrc,
  },
  {
    name: 'tesseract',
    file: 'src/hero/shaders/tesseract.glsl.ts',
    stage: 0.2,
    caption: 'Tesseract — solid-beam corridor lattice',
    description:
      'Not a raymarch — a single InstancedMesh of unit boxes shaded as long shelf beams in a nested-frame bookcase tunnel. Used as the alternate article backdrop.',
    excerpt: head(tesseractBeamFrag, 90),
    excerptIsHead: true,
    excerptLines: 90,
    totalLines: 199,
  },
];
