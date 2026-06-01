// ===========================================================================
// Crystal.tsx — the signature object of "The Blue-Hour Terminal".
//
// ONE faceted hexagonal CRYSTAL GEM rendered with React Three Fiber, on a full-
// bleed canvas that spans the viewport. The twist: the gem is a single object,
// but a screen-space boundary splits its COLOUR in two. Inside the boundary it
// wears the site's cobalt; the part that crosses outside wears cobalt's
// photographic negative — a warm copper. The split is done per-fragment in a
// shader patch, so it's genuinely one continuous gem whose hue flips exactly at
// the line, not two meshes faked side by side.
//
// Real physics: the gem is shattered (Voronoi) into chunky SOLID crystal
// fragments, each a Rapier rigid body. On load the fragments fall in under
// gravity and are pulled together (an attractor force) — "merging back like it
// was gravity" — then SNAP to their exact home transforms for a pixel-perfect
// gem. A click bursts it apart again (outward impulse + tumble) and it stays
// broken. The cobalt/copper split rides along because it's computed in screen
// space (gl_FragCoord), independent of where physics puts each fragment.
//
// Two boundary modes (pick with `variant`):
//   • 'corner'  — the boundary is the HERO panel's rectangle. The gem sits at
//                 the hero's top-left corner and overflows up/left; cobalt
//                 inside the hero, copper in the overflow.
//   • 'divider' — the boundary is a single horizontal line below the hero. The
//                 gem straddles it; cobalt above, copper below.
//
// Good citizen of the system:
//   • Colours READ from the live CSS tokens (--accent cobalt; copper is its
//     channel inverse) so it tracks the palette.
//   • prefers-reduced-motion OR small screens → one static, un-fractured gem,
//     frameloop="demand", no physics, zero RAF.
//   • Lazy, pointer-events:none, never gates the personalized line's hydration.
//   • Degrades: WebGL failure renders nothing; the flat CSS glow shows through.
//   • Rapier WASM loads async behind <Suspense>; until then the CSS glow shows.
// ===========================================================================
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Physics,
  RigidBody,
  interactionGroups,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import { DestructibleMesh, FractureOptions } from '@dgreenheck/three-pinata';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// --- OKLCH → sRGB -----------------------------------------------------------
// The site's tokens are authored in OKLCH (global.css). THREE.Color can't parse
// `oklch(...)`, and modern Chromium preserves OKLCH verbatim through both
// getComputedStyle AND canvas fillStyle — so there's no free browser conversion
// to lean on. We do the (standard, deterministic) conversion ourselves.

/** Parse "oklch(L C H)" / "oklch(L% C H / a)" → [L, C, H] or null. */
function parseOklch(raw: string): [number, number, number] | null {
  const m = raw.match(/oklch\(\s*([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split('/')[0].trim().split(/\s+/);
  if (parts.length < 3) return null;
  const num = (s: string) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));
  const L = num(parts[0]);
  const C = parseFloat(parts[1]);
  const H = parseFloat(parts[2]);
  if (![L, C, H].every(Number.isFinite)) return null;
  return [L, C, H];
}

/** OKLCH → linear-sRGB → gamma sRGB, returned as a "#rrggbb" hex string. */
function oklchToHex(L: number, C: number, H: number): string {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toGamma = (c: number) => {
    const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, x));
  };
  const r = Math.round(toGamma(lr) * 255);
  const g = Math.round(toGamma(lg) * 255);
  const bl = Math.round(toGamma(lb) * 255);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

/** Resolve a CSS custom property to a "#rrggbb" string three can parse. */
function readCssColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const ok = parseOklch(raw);
  if (ok) return oklchToHex(ok[0], ok[1], ok[2]);
  return raw; // already hex / rgb()
}

interface Palette {
  cobalt: string;
  copper: string; // retained for the shader's two-side uniform; now equals cobalt
  amber: string;
  room: string;
}

/** Smoothed cursor position in -1..1, shared from the host into the scene. */
type PointerRef = React.RefObject<{ x: number; y: number }>;

/** A rectangle in CSS pixels (page-relative top-left origin). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Live screen-space split geometry, recomputed each frame from the hero el. */
interface SplitRef {
  rect: Rect; // hero panel rect, CSS px
  lineY: number; // divider Y, CSS px
  lineX: number; // vertical centerline X (center variant), CSS px
  vw: number; // first-viewport width, CSS px
  vh: number; // first-viewport height, CSS px
}

function usePalette(): Palette {
  return useMemo<Palette>(() => {
    const cobalt = readCssColor('--accent', '#4495ea');
    return {
      cobalt,
      // Single-colour gem: the whole crystal is cobalt blue. The old screen-space
      // colour split (cobalt inside / copper outside) is retired by making the
      // "outside" colour identical to cobalt, so both sides of the shader boundary
      // render the same blue — no two-tone split.
      copper: cobalt,
      amber: readCssColor('--highlight', '#f3b861'),
      room: readCssColor('--bg', '#0a1017'),
    };
  }, []);
}

// --- The shader patch -------------------------------------------------------
// We keep the full MeshStandardMaterial lighting (facets, lights, tone map) and
// only swap the BASE colour per-fragment based on which side of the boundary the
// pixel falls on. The boundary is expressed in device pixels via gl_FragCoord.
// uSplitMode: 0 = rect (inside hero rect → inside colour), 1 = horizontal line
// (above → in), 2 = vertical centerline (left of line → in / cobalt).
const SPLIT_UNIFORMS = `
  uniform vec3 uInside;
  uniform vec3 uOutside;
  uniform float uEmissiveScale;
  uniform float uSplitMode;
  uniform vec4 uSplitRect;   // x, y, w, h in device px, y from TOP
  uniform float uSplitLineY; // horizontal divider, device px from TOP
  uniform float uSplitLineX; // vertical centerline, device px from LEFT
  uniform vec2 uResolution;  // drawing-buffer size in device px
`;

/**
 * Build the gem material once, then patch its shader to tint by side. Returns
 * the material plus a setter for the live uniforms (called each frame).
 */
function makeSplitMaterial(palette: Palette): {
  material: THREE.MeshStandardMaterial;
  uniforms: Record<string, THREE.IUniform>;
} {
  const cobalt = new THREE.Color(palette.cobalt);
  const copper = new THREE.Color(palette.copper);

  const material = new THREE.MeshStandardMaterial({
    color: cobalt,
    metalness: 0.0,
    roughness: 0.4,
    flatShading: true,
    emissive: cobalt,
    // Higher emissive floor so the side colour (cobalt / copper) stays saturated
    // and doesn't desaturate toward yellow-white under the neutral lights.
    emissiveIntensity: 0.7,
  });

  const uniforms: Record<string, THREE.IUniform> = {
    uInside: { value: cobalt.clone() },
    uOutside: { value: copper.clone() },
    uEmissiveScale: { value: material.emissiveIntensity },
    uSplitMode: { value: 0 },
    uSplitRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSplitLineY: { value: 0 },
    uSplitLineX: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // A small shared helper computes "which side am I on?" from gl_FragCoord.
    // gl_FragCoord origin is BOTTOM-left; our rects/lines are TOP-left → flip Y.
    const sideHelper = `
      bool crystalInside() {
        vec2 fc = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
        if (uSplitMode < 0.5) {
          return fc.x >= uSplitRect.x && fc.x <= uSplitRect.x + uSplitRect.z
              && fc.y >= uSplitRect.y && fc.y <= uSplitRect.y + uSplitRect.w;
        }
        if (uSplitMode > 1.5) {
          // Vertical centerline: cobalt to the LEFT, copper to the right.
          return fc.x <= uSplitLineX;
        }
        return fc.y <= uSplitLineY;
      }
    `;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${SPLIT_UNIFORMS}\n${sideHelper}\nvoid main() {`)
      // REPLACE the base colour with the side colour (don't scale — dividing by
      // the low cobalt channels would blow out). Facet shading is preserved
      // because it comes from the lights downstream, applied to this base.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = crystalInside() ? uInside : uOutside;`,
      )
      // Emissive floor follows the same side, scaled to the original intensity.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance = (crystalInside() ? uInside : uOutside) * uEmissiveScale;`,
      );
  };

  return { material, uniforms };
}

/**
 * The freshly-exposed interior of a fractured crystal: a darker, rougher, non-
 * emissive face so the inside reads as raw cut crystal rather than the glowing
 * skin. NOT split — interior faces shouldn't flip colour at the boundary (that
 * reads as noise); a single calm dark cobalt sells the "solid chunk" look.
 */
function makeInnerMaterial(palette: Palette): THREE.MeshStandardMaterial {
  const dark = new THREE.Color(palette.cobalt).multiplyScalar(0.32);
  return new THREE.MeshStandardMaterial({
    color: dark,
    metalness: 0.1,
    roughness: 0.85,
    flatShading: true,
    emissive: dark,
    emissiveIntensity: 0.15,
  });
}

type Variant = 'corner' | 'divider' | 'center';

/** Shader split mode for a variant: 0 = hero rect, 1 = horizontal divider,
 *  2 = vertical centerline. */
function splitModeFor(variant: Variant): number {
  if (variant === 'corner') return 0;
  if (variant === 'center') return 2;
  return 1; // divider
}

/** Radius/footprint of the planet. Sized to be the FULL-SCREEN focal object of
 *  the centered layout (like the reference): the assembled sphere spans roughly
 *  half the viewport height, with the text wrapped around its edges. */
const GEM_RADIUS = 1.15;

// --- Geometry: the faceted crystal planet -----------------------------------
// A low-poly icosphere: a round silhouette built entirely from triangular
// facets. IcosahedronGeometry is GUARANTEED watertight/manifold (a closed
// convex hull), which is what three-pinata's Voronoi fracture requires, and at
// detail 1 its faces are large enough that the Voronoi cut dominates the look —
// the planet reads as many small crystal shards, not a smooth ball. flatShading
// (on the material) gives every shard its hard cut facets.
function buildPlanet(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(GEM_RADIUS, 1);
  geo.center();
  return geo;
}

// --- Shatter: real Voronoi fragments, each a Rapier rigid body --------------
// The gem is fractured ONCE (client-side, fixed seed → deterministic) into N
// chunky solids. three-pinata centers each fragment's geometry at the origin
// and sets fragment.position to the fragment's centroid in the source gem — so
// that position IS the fragment's HOME position relative to the gem center, and
// its home rotation is identity. We capture those as the assemble target.

/** Tiny deterministic PRNG (mulberry32) so scatter poses never use Math.random. */
function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Static per-fragment data: geometry, home pose, and the orbital spawn the
 *  shard spirals in from while the planet grows. */
interface Fragment {
  geometry: THREE.BufferGeometry;
  /** Home position relative to the planet center (forms the full-size sphere). */
  home: THREE.Vector3;
  /** Unit direction from center to home — the shard's place on the surface. */
  homeDir: THREE.Vector3;
  /** Distance from center to home (≈ the planet radius at this shard). */
  homeRadius: number;
  /** Starting orbital radius (large) the shard spirals in from. */
  orbitRadius: number;
  /** Starting longitude (radians) on the orbital ring; the shard winds inward
   *  to homeDir's longitude as it seats. */
  orbitAngle: number;
  /** Unit normal of this shard's orbital plane — so the cloud arrives from every
   *  inclination, reading as a 3D swarm, not a flat ring. */
  orbitAxis: THREE.Vector3;
  /** Tumble axis (unit) for the slow spin during the journey, eased out on seat. */
  drift: THREE.Vector3;
  /** Per-fragment start offset (0 … ~0.5) so the swarm arrives staggered. */
  delay: number;
  /** Direction the shard bursts along on a localized click-shatter (= homeDir). */
  burstDir: THREE.Vector3;
  /** Seed shards sit at their home from frame one — a small core already in place
   *  that the rest of the swarm accretes ONTO, rather than forming from a void. */
  seed: boolean;
}

/** Fracture the planet into solid Voronoi shards + capture home + orbital spawn. */
function buildFragments(
  outerMaterial: THREE.Material,
  innerMaterial: THREE.Material,
  fragmentCount: number,
): Fragment[] {
  const gem = new DestructibleMesh(buildPlanet(), outerMaterial, innerMaterial);
  gem.updateMatrixWorld(true); // identity, but make the centroid math explicit
  const options = new FractureOptions({
    fractureMethod: 'voronoi',
    fragmentCount,
    voronoiOptions: { mode: '3D' },
    seed: 1337, // fixed → identical fracture every load (SSR/screenshot-stable)
  });

  const pieces = gem.fracture(options);

  // ONE shared spin axis for the whole system — the planet's pole. Every shard
  // orbits in and tumbles about this same axis, and the assembled planet spins
  // about it too, so the swarm reads as one coherent rotating body, not chaos.
  const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
  const fragments: Fragment[] = pieces.map((piece, i) => {
    // three-pinata re-centers each shard's geometry at the origin and sets
    // piece.position to its centroid in the planet — that's the HOME pose.
    const home = piece.position.clone();
    const rand = seededRand(i * 9176 + 12345);

    const homeRadius = Math.max(1e-3, home.length());
    const homeDir = home.clone().multiplyScalar(1 / homeRadius);

    // Orbital spawn: a ring FAR out. The shard winds inward around the SHARED spin
    // axis (with only a SMALL per-shard tilt for organic depth, not a random plane)
    // so the whole swarm spirals the SAME way — like a disc of debris all turning
    // in one direction. The wide radius spread makes the swarm arrive in depth, the
    // near ones first and the far ones trailing in.
    const orbitRadius = 12 + rand() * 12; // 12 … 24 units out — far away
    const orbitAngle = rand() * Math.PI * 2; // starting longitude on the ring
    // Common axis + a gentle random tilt (≈ ±18°) so it's coherent, not a flat disc.
    const orbitAxis = SPIN_AXIS.clone();
    orbitAxis.x += (rand() - 0.5) * 0.6;
    orbitAxis.z += (rand() - 0.5) * 0.6;
    orbitAxis.normalize();

    const delay = rand() * 0.5;
    // Tumble about the SAME shared axis (no random per-shard axis), so every shard
    // rotates in the same direction on the way in — harmony, not a jumble.
    const drift = SPIN_AXIS.clone();

    return {
      geometry: piece.geometry,
      home,
      homeDir,
      homeRadius,
      orbitRadius,
      orbitAngle,
      orbitAxis,
      drift,
      delay,
      burstDir: homeDir.clone(),
      seed: false,
    };
  });

  // SEED CORE: the few most-central shards (smallest home radius) are placed at
  // their home from the very first frame, so a small crystal core is already there
  // when the page loads and the rest of the swarm visibly accretes ONTO it. Picked
  // by radius (deterministic) so the seed is the same every load.
  const seedCount = Math.max(1, Math.round(fragments.length * 0.06)); // ~6%
  [...fragments]
    .sort((a, b) => a.homeRadius - b.homeRadius)
    .slice(0, seedCount)
    .forEach((f) => {
      f.seed = true;
    });

  // The source planet's own geometry is unused (shards carry their own); drop it.
  // Materials are SHARED across shards — never dispose them here.
  gem.geometry.dispose();
  return fragments;
}

// --- Screen ↔ world ---------------------------------------------------------

/** Map a CSS-pixel screen point to a world position on the z=0 plane, so the
 *  gem can be anchored to the hero's corner / divider regardless of viewport. */
function screenToWorld(
  cssX: number,
  cssY: number,
  size: { width: number; height: number },
  camera: THREE.Camera,
): { x: number; y: number } {
  const ndcX = (cssX / size.width) * 2 - 1;
  const ndcY = -((cssY / size.height) * 2 - 1);
  const cam = camera as THREE.PerspectiveCamera;
  const dist = cam.position.z; // plane at z=0
  const vH = 2 * Math.tan((cam.fov * Math.PI) / 360) * dist;
  const vW = vH * (size.width / size.height);
  return { x: (ndcX * vW) / 2, y: (ndcY * vH) / 2 };
}

/** The current world anchor of the whole gem, recomputed each frame from the
 *  measured hero rect (so it tracks scroll/resize). No pointer parallax — the gem
 *  sits at its anchor and only spins. Shared between the physics controller and
 *  the static fallback. */
function computeGemFrame(
  variant: Variant,
  split: SplitRef,
  size: { width: number; height: number },
  camera: THREE.Camera,
): { x: number; y: number } {
  const s = split;
  // Width-aware horizontal offset for the corner variant (ported verbatim from
  // the original): push the gem further LEFT as the left margin shrinks, so its
  // cobalt quadrant never grazes the headline at mid/narrow widths.
  const leftMargin = s.rect.x;
  const margin = Math.max(0, Math.min(1, (320 - leftMargin) / (320 - 120)));
  const cornerPushX = 28 + margin * 68; // 28 … 96 px leftward
  // 'center': anchor to the FIRST VIEWPORT, not the hero rect — pinned to the
  // EXACT center of the viewport so the planet reads as a fixed focal object the
  // text is arranged around. The colour splits on the vertical centerline
  // (uSplitMode = 2).
  const anchor =
    variant === 'center'
      ? { x: s.vw * 0.5, y: s.vh * 0.5 }
      : variant === 'corner'
        ? { x: s.rect.x - cornerPushX, y: s.rect.y - 24 }
        : { x: s.rect.x + s.rect.w * 0.42, y: s.lineY };
  const w = screenToWorld(anchor.x, anchor.y, size, camera);
  // No pointer parallax: the gem sits exactly at its anchor and only spins.
  return { x: w.x, y: w.y };
}

/** Uniform scale applied to the assembled planet so the big full-screen gem fits
 *  the viewport on every shape. On a WIDE viewport it runs at full size (1); as
 *  the viewport narrows (portrait / mobile) it scales DOWN so the sphere stays
 *  within the column and doesn't swallow the text wrapped around it. Driven by
 *  aspect, so it's continuous across a resize — no breakpoints, no rebuild. Only
 *  the 'center' variant uses the big gem; the others stay at 1. */
function viewportFitScale(variant: Variant, vw: number, vh: number): number {
  if (variant !== 'center') return 1;
  const aspect = vw / Math.max(1, vh);
  // Landscape (aspect ≥ ~1.3): full size. Square-ish/portrait: shrink toward 0.55
  // so a phone's narrow column keeps generous margins around the planet.
  const t = Math.max(0, Math.min(1, (aspect - 0.55) / (1.3 - 0.55)));
  return 0.55 + t * 0.45; // 0.55 (narrow) … 1.0 (wide)
}

/** Push the live split boundary into the shader uniforms (CSS px → device px). */
function pushSplitUniforms(
  uniforms: Record<string, THREE.IUniform>,
  split: SplitRef,
  gl: THREE.WebGLRenderer,
  size: { width: number; height: number },
): void {
  const dpr = gl.getPixelRatio();
  uniforms.uResolution.value.set(size.width * dpr, size.height * dpr);
  uniforms.uSplitRect.value.set(
    split.rect.x * dpr,
    split.rect.y * dpr,
    split.rect.w * dpr,
    split.rect.h * dpr,
  );
  uniforms.uSplitLineY.value = split.lineY * dpr;
  uniforms.uSplitLineX.value = split.lineX * dpr;
}

// --- Physics planet ---------------------------------------------------------
// Lifecycle phases:
//   'accreting' KINEMATIC. Shards spiral in along orbital rings and lock onto the
//               surface while the planet's radius GROWS from a small core to full
//               size. Smootherstep ease, no spring → no bounce.
//   'assembled' KINEMATIC, the whole planet slowly spins about the viewer's
//               vertical and follows the screen anchor. STAYS here — it accepts
//               repeated localized shatters without ever fully exploding.
//
// Localized shatter: a click detaches the hit shard plus a small surrounding
// CLUSTER. Those bodies flip to Dynamic and burst outward; the rest of the planet
// keeps spinning intact. Detached shards are remembered (a Set) so the kinematic
// controller stops driving them. Repeatable on other spots.
//
// CRITICAL: all reads/mutations of Rapier bodies happen in useBeforePhysicsStep,
// NOT useFrame. wasm-bindgen forbids touching a body while the world is stepping
// (it throws "recursive use of an object … unsafe aliasing in rust"); the step
// hooks run at a guaranteed-safe point in the simulation lifecycle. The only work
// left in useFrame is the shader-uniform push, which never touches Rapier.
type Phase = 'accreting' | 'assembled';

/** A deferred localized-shatter request, consumed inside the physics step. The
 *  click handler fills `shards` with the cluster to detach and the impact center;
 *  the step applies the burst and marks those shards detached. A simple single-slot
 *  mailbox: clicks are rare relative to the 60Hz step, so one pending request is
 *  enough (a second click that lands the same frame is harmlessly dropped). */
interface ShatterRequest {
  pending: boolean;
  shards: number[];
  center: { x: number; y: number; z: number };
}

interface GemControllerProps {
  fragments: Fragment[];
  bodies: React.RefObject<(RapierRigidBody | null)[]>;
  uniforms: Record<string, THREE.IUniform>;
  variant: Variant;
  split: React.RefObject<SplitRef>;
  phase: React.RefObject<Phase>;
  shatterReq: React.RefObject<ShatterRequest>;
  detached: React.RefObject<Set<number>>;
}

/** Drives the shard bodies each step according to the current phase. */
function GemController({
  fragments,
  bodies,
  uniforms,
  variant,
  split,
  phase,
  shatterReq,
  detached,
}: GemControllerProps) {
  const { gl, size, camera } = useThree();
  // Idle spin of the assembled gem, advanced each step (radians).
  const spin = useRef(0);
  // Global accretion progress 0→1: drives every fragment's glide from off-screen
  // to its home slot (with per-fragment stagger). Slow → cinematic.
  const accretT = useRef(0);

  // Scratch objects (no per-step allocation).
  const target = useRef(new THREE.Vector3());
  const seated = useRef(new THREE.Vector3());
  const orbitPos = useRef(new THREE.Vector3());
  const q = useRef(new THREE.Quaternion());
  const e = useRef(new THREE.Euler());
  const spinQ = useRef(new THREE.Quaternion());
  const tumbleQ = useRef(new THREE.Quaternion());

  // Rapier runs a fixed timestep (default 1/60); use it for time-based easing so
  // the motion is frame-rate independent and matches the integration the bodies see.
  const DT = 1 / 60;
  // Total accretion duration in seconds. The centered planet is the focal point of
  // the first viewport, so it forms briskly (the split + shatter are the payoff a
  // visitor should reach fast); the off-to-the-side corner/divider variants can
  // take the long, cinematic accretion without making anyone wait for the headline.
  const ACCRETION_SECONDS = variant === 'center' ? 14 : 28;
  // The largest per-shard start delay (matches buildFragments' `delay` cap) so the
  // last-starting shard still completes exactly at accretT = 1.
  const MAX_DELAY = 0.5;
  // The planet's radius scale at the start of accretion: it grows from this small
  // core out to full size (1.0) as the shards spiral in and lock on.
  const CORE_SCALE = 0.22;
  // Total winding angle (radians) a shard sweeps around its orbital plane on the
  // way in — more than 2π so it visibly spirals, not just falls straight down.
  const ORBIT_WIND = Math.PI * 2.4;

  useBeforePhysicsStep(() => {
    const bs = bodies.current;
    if (!bs) return;

    spin.current += DT * 0.04; // slow planetary rotation
    const frame = computeGemFrame(variant, split.current, size, camera);
    // The planet is PINNED to viewport center for the whole page: it does NOT
    // recede, lift, or shrink on scroll — content scrolls past a fixed focal
    // object. There's no scroll contraction; the only scale is the viewport-fit
    // factor, which keeps the big gem inside narrow/portrait viewports.
    const recede = viewportFitScale(variant, split.current.vw, split.current.vh);
    // Gentle idle rotation around the viewer's vertical only — the gem-like tilt
    // is already BAKED into the geometry, so we keep the spin small (and avoid an
    // X tumble) so the assembled crystal never rolls back into a side-on column.
    const rotQ = q.current.setFromEuler(e.current.set(0, spin.current, 0));

    // Consume a queued LOCALIZED shatter: detach just the clicked cluster. Those
    // shards flip to Dynamic and burst outward from the impact point; the rest of
    // the planet keeps spinning intact. The planet stays 'assembled', so more
    // clusters can be knocked off later.
    const req = shatterReq.current;
    if (req?.pending) {
      req.pending = false;
      // The burst is radial: each shard flies straight OUT from the PLANET CENTER
      // (its current world position = frame.x, frame.y, 0), so a clicked cluster
      // blows off the surface like a chunk knocked off a sphere — not sideways from
      // the click point.
      for (const i of req.shards) {
        const rb = bs[i];
        if (!rb || detached.current.has(i)) continue;
        detached.current.add(i);
        rb.setBodyType(0, true); // 0 = Dynamic
        rb.wakeUp();
        const t = rb.translation();
        let dx = t.x - frame.x;
        let dy = t.y - frame.y;
        let dz = t.z; // planet center sits at z = 0
        let len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) {
          // Degenerate (shard at the exact center): fall back to its baked outward
          // direction so it still has a definite way to fly.
          dx = fragments[i].burstDir.x;
          dy = fragments[i].burstDir.y;
          dz = fragments[i].burstDir.z;
          len = Math.hypot(dx, dy, dz) || 1;
        }
        // Velocity set DIRECTLY (mass-independent, immediate) so the burst always
        // shows regardless of the collider's auto-computed mass. Purely radial out
        // from the planet center, scaled so a cluster scatters convincingly.
        const speed = 6.5;
        rb.setLinvel(
          { x: (dx / len) * speed, y: (dy / len) * speed, z: (dz / len) * speed },
          true,
        );
        const rand = seededRand(i * 5077 + 91);
        rb.setAngvel(
          { x: (rand() - 0.5) * 6, y: (rand() - 0.5) * 6, z: (rand() - 0.5) * 6 },
          true,
        );
      }
      // No early return: the rest of the planet still needs its kinematic update
      // this same step (it stays assembled and spinning).
    }

    const ph = phase.current;
    if (ph === 'accreting' || ph === 'assembled') {
      if (ph === 'accreting') {
        accretT.current = Math.min(1, accretT.current + DT / ACCRETION_SECONDS);
        if (accretT.current >= 1) phase.current = 'assembled';
      }
      const gt = accretT.current; // global accretion progress
      const span = 1 - MAX_DELAY; // each shard's own travel window
      // The planet GROWS: its radius scales from a small core to full size as the
      // swarm locks on. Seated shards ride outward with it, so the sphere visibly
      // expands rather than just filling in at full size. (recede stays 1 — the
      // pinned planet never shrinks.)
      const grow = (CORE_SCALE + (1 - CORE_SCALE) * gt) * recede;

      for (let i = 0; i < fragments.length; i++) {
        const rb = bs[i];
        if (!rb) continue;
        if (detached.current.has(i)) continue; // a shattered shard — leave it free
        const frag = fragments[i];

        // Per-shard progress: starts after its stagger `delay`, runs over `span`.
        // Eased with a QUINTIC EASE-OUT (fast-in, slow-out): the shard launches
        // inward from far away with strong initial speed and decelerates as it
        // nears the surface — reads as a particle that was thrown in with velocity,
        // not one gently interpolating. It still ends EXACTLY at p=1 (no spring,
        // no overshoot, no bounce).
        const raw = Math.max(0, Math.min(1, (gt - frag.delay) / span));
        const inv = 1 - raw;
        // Seed shards are seated (p=1) from the start — the core that's already in
        // place. Everyone else eases in with a quintic ease-out (fast-in, slow-out).
        const p = frag.seed ? 1 : 1 - inv * inv * inv * inv * inv;

        // SEATED point: the shard's home direction (rotated into the spinning
        // planet frame), at the CURRENT grown radius, plus the screen anchor.
        seated.current
          .copy(frag.homeDir)
          .applyQuaternion(rotQ)
          .multiplyScalar(frag.homeRadius * grow);
        seated.current.x += frame.x;
        seated.current.y += frame.y;

        if (p >= 1) {
          // Fully seated: ride the grown surface, spin with the planet.
          target.current.copy(seated.current);
          rb.setNextKinematicTranslation(target.current);
          rb.setNextKinematicRotation(rotQ);
          continue;
        }

        // ORBITAL spiral-in: start at the home direction swept BACK around the
        // shard's orbital plane by ORBIT_WIND·(1-p) and pulled OUT to orbitRadius,
        // then wind in to the seated direction/radius as p→1. Rotating the seated
        // direction by a decreasing angle around orbitAxis traces a spiral that
        // ends exactly on the seat, so there's no snap.
        const windAngle = ORBIT_WIND * (1 - p);
        const r = frag.orbitRadius + (frag.homeRadius * grow - frag.orbitRadius) * p;
        orbitPos.current
          .copy(frag.homeDir)
          .applyAxisAngle(frag.orbitAxis, windAngle) // sweep around the orbital plane
          .applyQuaternion(rotQ) // into the spinning planet frame
          .multiplyScalar(r * recede); // recede is 1 — no scroll contraction
        orbitPos.current.x += frame.x;
        orbitPos.current.y += frame.y;
        target.current.copy(orbitPos.current);
        rb.setNextKinematicTranslation(target.current);

        // Tumble while travelling, eased out into the planet orientation on seat.
        const ang = (1 - p) * 2.6; // up to ~2.6 rad of lazy tumble en route
        spinQ.current.setFromAxisAngle(frag.drift, ang).multiply(rotQ);
        tumbleQ.current.copy(spinQ.current).slerp(rotQ, p);
        rb.setNextKinematicRotation(tumbleQ.current);
      }
    }
    // Detached shards are free DYNAMIC; the controller never touches them again.
  });

  // Uniform push is the only per-frame work that does NOT touch Rapier, so it
  // stays in useFrame (runs every render frame, keeps the split boundary live).
  useFrame(() => {
    pushSplitUniforms(uniforms, split.current, gl, size);
  });

  return null;
}

// Map a uniforms object (one per palette) → its shared [outer, inner] material
// array, so every fragment mesh shares ONE outer material (the split uniform
// push stays a single update) and ONE inner material.
const SHARED_MATERIALS = new WeakMap<
  Record<string, THREE.IUniform>,
  { array: [THREE.Material, THREE.Material] }
>();

interface PhysicsGemProps {
  variant: Variant;
  split: React.RefObject<SplitRef>;
  phase: React.RefObject<Phase>;
  bodies: React.RefObject<(RapierRigidBody | null)[]>;
  meshes: React.RefObject<(THREE.Mesh | null)[]>;
  uniforms: Record<string, THREE.IUniform>;
  fragments: Fragment[];
  shatterReq: React.RefObject<ShatterRequest>;
  detached: React.RefObject<Set<number>>;
}

/** The physics rig: one RigidBody per shard + the per-frame controller. */
function PhysicsGem({
  variant,
  split,
  phase,
  bodies,
  meshes,
  uniforms,
  fragments,
  shatterReq,
  detached,
}: PhysicsGemProps) {
  const materialArray = SHARED_MATERIALS.get(uniforms)?.array;
  if (!materialArray) return null;
  return (
    // ZERO world gravity → a space-like void. There's no "down": the planet forms
    // purely from the spiralling swarm locking onto the growing surface, so the
    // motion has no fall-bias and reads as accretion in zero-g, slow and cinematic.
    <Physics gravity={[0, 0, 0]}>
      <GemController
        fragments={fragments}
        bodies={bodies}
        uniforms={uniforms}
        variant={variant}
        split={split}
        phase={phase}
        shatterReq={shatterReq}
        detached={detached}
      />
      {fragments.map((frag, i) => (
        <RigidBody
          key={i}
          ref={(r) => {
            bodies.current[i] = r;
          }}
          // KINEMATIC during accretion + assembly: the controller drives each body
          // along an EASED orbital spiral → seat, so there are no spring forces and
          // thus no bouncing/overshoot. A shard flips to Dynamic only when its
          // cluster is clicked. Position is set absolutely each step, so the mount
          // position is just a pre-first-step placeholder: seed shards mount AT the
          // core (so they're already in place on the first paint); everyone else
          // mounts out on their orbital ring.
          type="kinematicPosition"
          colliders="ball"
          // Shards are members of group 1 but collide with NOTHING (empty filter):
          // they pass through each other while orbiting in (no jostling) and it
          // avoids a Rapier solver panic from deep ball interpenetration. Detached
          // shards likewise just fly free without colliding with the planet.
          collisionGroups={interactionGroups([1], [])}
          position={
            frag.seed
              ? [frag.home.x, frag.home.y, frag.home.z]
              : [
                  frag.homeDir.x * frag.orbitRadius,
                  frag.homeDir.y * frag.orbitRadius,
                  frag.homeDir.z * frag.orbitRadius,
                ]
          }
          linearDamping={0.4}
          angularDamping={0.5}
        >
          <mesh
            ref={(m) => {
              meshes.current[i] = m;
            }}
            geometry={frag.geometry}
            material={materialArray}
          />
        </RigidBody>
      ))}
    </Physics>
  );
}

interface ClickToShatterProps {
  meshes: React.RefObject<(THREE.Mesh | null)[]>;
  phase: React.RefObject<Phase>;
  shatterReq: React.RefObject<ShatterRequest>;
  detached: React.RefObject<Set<number>>;
}

/** How many shards a single click knocks loose: the hit shard plus its nearest
 *  CLUSTER_SIZE-1 neighbours, so a click reads as a localized impact crater. */
const CLUSTER_SIZE = 7;

/**
 * Listens for clicks anywhere on the page and raycasts against the live shard
 * meshes. A click only does anything if the ray HITS a shard — clicks on the
 * headline/links beneath the (pointer-transparent) canvas pass straight through.
 * On a hit it selects the hit shard plus its nearest neighbours (a cluster) and
 * QUEUES a localized shatter; the physics step detaches just that cluster, leaving
 * the rest of the planet intact and spinning. Repeatable on other spots.
 *
 * The raycast and the neighbour search read only three.js meshes (never Rapier
 * bodies), so they're safe outside the physics step; only the burst itself, queued
 * here and applied in the step, touches the bodies.
 */
function ClickToShatter({ meshes, phase, shatterReq, detached }: ClickToShatterProps) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitPos = new THREE.Vector3();
    const otherPos = new THREE.Vector3();
    const onClick = (ev: MouseEvent) => {
      if (shatterReq.current.pending) return; // a burst is already queued this frame
      // Only shatter a planet that has shards to lose.
      if (phase.current !== 'assembled' && phase.current !== 'accreting') return;
      const all = meshes.current;
      const ms = all.filter((m): m is THREE.Mesh => !!m);
      if (ms.length === 0) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      // A click can fire between frames — refresh world matrices so the raycast
      // tests the live (Rapier-driven) transforms.
      ms.forEach((m) => m.updateMatrixWorld(true));
      const hit = raycaster.intersectObjects(ms, false);
      if (hit.length === 0) return;

      const hitMesh = hit[0].object as THREE.Mesh;
      const hitIndex = all.indexOf(hitMesh);
      if (hitIndex < 0 || detached.current.has(hitIndex)) return;
      hitMesh.getWorldPosition(hitPos);

      // Cluster = the hit shard + its nearest still-attached neighbours by world
      // distance to the impact point. Cheap O(n) gather + partial sort over ~120.
      const candidates: { i: number; d: number }[] = [];
      for (let i = 0; i < all.length; i++) {
        const m = all[i];
        if (!m || detached.current.has(i) || i === hitIndex) continue;
        m.getWorldPosition(otherPos);
        candidates.push({ i, d: otherPos.distanceToSquared(hitPos) });
      }
      candidates.sort((a, b) => a.d - b.d);
      const cluster = [hitIndex, ...candidates.slice(0, CLUSTER_SIZE - 1).map((c) => c.i)];

      shatterReq.current.shards = cluster;
      shatterReq.current.center = { x: hitPos.x, y: hitPos.y, z: hitPos.z };
      shatterReq.current.pending = true;
    };
    // Capture phase so we see the click even though content sits above the layer.
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [camera, gl, meshes, phase, shatterReq, detached]);
  return null;
}

// --- Static gem (reduced motion / mobile) -----------------------------------

interface StaticGemProps {
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.Material;
  variant: Variant;
  split: React.RefObject<SplitRef>;
  pointer: PointerRef;
}

/** One un-fractured, motionless planet. No physics, one frame on demand. */
function StaticGem({ uniforms, material, variant, split, pointer }: StaticGemProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => buildPlanet(), []);
  const { gl, size, camera, invalidate } = useThree();

  useEffect(() => {
    uniforms.uSplitMode.value = splitModeFor(variant);
  }, [variant, uniforms]);

  // One static frame: place at the anchor, scale to fit the viewport, push the
  // split, render once.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const frame = computeGemFrame(variant, split.current, size, camera);
    m.position.set(frame.x, frame.y, 0);
    m.rotation.set(0.2, 0.6, 0);
    const fit = viewportFitScale(variant, split.current.vw, split.current.vh);
    m.scale.setScalar(fit);
    pushSplitUniforms(uniforms, split.current, gl, size);
    invalidate();
  }, [uniforms, variant, split, pointer, gl, size, camera, invalidate]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh ref={mesh} geometry={geometry} material={material} />;
}

interface CrystalProps {
  /** When false (reduced motion), render a single static frame, no loop. */
  animate?: boolean;
  /** Which boundary splits the colour. Default 'center'. */
  variant?: Variant;
}

/** Number of solid shards the planet is fractured into (desktop, full motion).
 *  ~120 reads as a finely-tiled planet while staying smooth at 60fps; the shards
 *  pass through each other (empty collision filter) so the solver stays cheap. */
const FRAGMENT_COUNT = 120;

/**
 * Full-bleed crystal. Measures the hero panel's screen rect each frame (for the
 * split boundary) and positions the gem at the chosen edge. Pointer-transparent;
 * renders nothing if WebGL is unavailable. Physics on desktop full-motion; a
 * static gem for reduced-motion and small screens.
 */
export default function Crystal({ animate = true, variant = 'center' }: CrystalProps) {
  const palette = usePalette();
  const pointer = useRef({ x: 0, y: 0 });
  const split = useRef<SplitRef>({
    rect: { x: 0, y: 0, w: 1, h: 1 },
    lineY: 0,
    lineX: 0,
    vw: 1,
    vh: 1,
  });
  const [failed, setFailed] = useState(false);
  // Small screens get the calm static gem (the layer is already dimmed there,
  // and ~26 colliding rigid bodies can drop frames on weak mobile GPUs).
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 48rem)');
    const apply = () => setIsSmall(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const physics = animate && !isSmall;

  // Build the shared split material + uniforms once per palette. The SAME outer
  // material instance is shared across every fragment (one uniform push/frame);
  // the inner material dresses freshly-cut faces.
  const { material: outerMaterial, uniforms } = useMemo(
    () => makeSplitMaterial(palette),
    [palette],
  );
  const innerMaterial = useMemo(() => makeInnerMaterial(palette), [palette]);

  useEffect(() => {
    // Register the shared [outer, inner] array for this uniforms key so fragment
    // meshes can grab it (keeps the material instance identity stable).
    SHARED_MATERIALS.set(uniforms, { array: [outerMaterial, innerMaterial] });
    return () => {
      SHARED_MATERIALS.delete(uniforms);
      outerMaterial.dispose();
      innerMaterial.dispose();
    };
  }, [uniforms, outerMaterial, innerMaterial]);

  useEffect(() => {
    uniforms.uSplitMode.value = splitModeFor(variant);
  }, [variant, uniforms]);

  // Fracture once, client-side only, when physics is active. Deterministic seed.
  const fragments = useMemo<Fragment[]>(() => {
    if (typeof window === 'undefined' || !physics) return [];
    try {
      return buildFragments(outerMaterial, innerMaterial, FRAGMENT_COUNT);
    } catch {
      return [];
    }
  }, [physics, outerMaterial, innerMaterial]);

  // Dispose fragment geometries when the set is rebuilt / unmounts.
  useEffect(() => () => fragments.forEach((f) => f.geometry.dispose()), [fragments]);

  // Physics refs.
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const phase = useRef<Phase>('accreting');
  // Which shard indices have been knocked loose by a click (never re-driven).
  const detached = useRef<Set<number>>(new Set());
  const shatterReq = useRef<ShatterRequest>({
    pending: false,
    shards: [],
    center: { x: 0, y: 0, z: 0 },
  });
  useEffect(() => {
    bodies.current = new Array(fragments.length).fill(null);
    meshes.current = new Array(fragments.length).fill(null);
    phase.current = 'accreting';
    detached.current = new Set();
    shatterReq.current = { pending: false, shards: [], center: { x: 0, y: 0, z: 0 } };
  }, [fragments]);

  // Measure the hero panel (and derive the divider line just below it) every
  // animation frame, so the colour boundary tracks scroll + resize exactly.
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      // First-viewport size + vertical centerline drive the 'center' variant;
      // the hero rect still drives 'corner'/'divider'. Both read each frame so
      // the split tracks scroll + resize exactly.
      split.current.vw = window.innerWidth;
      split.current.vh = window.innerHeight;
      split.current.lineX = window.innerWidth * 0.5;
      const hero = document.querySelector<HTMLElement>('.hero');
      if (hero) {
        const r = hero.getBoundingClientRect();
        split.current.rect = { x: r.left, y: r.top, w: r.width, h: r.height };
        split.current.lineY = r.bottom + 28;
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, []);

  // No pointer parallax: the gem does not track the cursor, so there's no
  // pointermove listener. `pointer` stays a fixed {0,0} ref purely to satisfy the
  // child component signatures; the anchor math now ignores it.

  // The planet is PINNED to viewport center and stays fully present for the whole
  // page — it no longer recedes or dissolves on scroll, so there's no scroll
  // listener and no --crystal-scroll-fade. The canvas defaults that var to 1.

  if (failed) return null;

  return (
    <Canvas
      className="crystal-canvas"
      aria-hidden="true"
      frameloop={physics ? 'always' : 'demand'}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 5.5], fov: 42 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.8;
      }}
      onError={() => setFailed(true)}
    >
      <ambientLight intensity={0.35} color={'#ffffff'} />
      <directionalLight position={[-3, 2.5, 3]} intensity={1.1} color={'#eaf0ff'} />
      <pointLight position={[2.6, -1.8, 2.2]} intensity={2.6} color={'#fff4e6'} distance={10} decay={1.2} />
      <pointLight position={[2.2, 2.4, 1.5]} intensity={1.4} color={'#ffffff'} distance={10} decay={1.4} />
      {physics ? (
        <>
          <Suspense fallback={null}>
            <PhysicsGem
              variant={variant}
              split={split}
              phase={phase}
              bodies={bodies}
              meshes={meshes}
              uniforms={uniforms}
              fragments={fragments}
              shatterReq={shatterReq}
              detached={detached}
            />
          </Suspense>
          <ClickToShatter
            meshes={meshes}
            phase={phase}
            shatterReq={shatterReq}
            detached={detached}
          />
        </>
      ) : (
        <StaticGem
          uniforms={uniforms}
          material={outerMaterial}
          variant={variant}
          split={split}
          pointer={pointer}
        />
      )}
    </Canvas>
  );
}
