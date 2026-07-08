// Cockpit canopy rig — the TRUE-WebGL solid-metal canopy (the SVG overlay in
// CockpitFrame.tsx is the reduced-motion fallback). The hull, glass, struts,
// console and HUD are drawn INSIDE the scene render pass, directly in clip space
// (the shaders ignore the camera — see cockpit.glsl.ts), so:
//   • bloom lights the HUD + the hot metal spans nearest the star,
//   • the metal is lit per-pixel from the star's projected position in the
//     star's own per-chapter colour (the light fleshes out a neutral hull),
//   • the power transition is a pure shader DECLOAK — no scale, no travel.
//
// DESIGN — a SOLID FACETED cockpit (Star-Citizen grammar), not a glowing
// wireframe. Geometry comes from cockpitGeometry.ts:
//   • HULL: the full screen minus the glass panes (ShapeGeometry with holes) —
//     the opaque metal surround. The mullions between panes ARE this fill.
//   • GLASS: a faint tint mesh over each pane so the opening reads as glass.
//   • STRUTS: beveled metal beams (extruded ribbons carrying a cross-strut
//     coordinate) over the mullions — the dimensional relief.
//   • CONSOLE: a solid raised dashboard mass + a recessed screen.
//   • HUD: a white holographic instrument layer (reticle + ticks + compass).
//
// POWER CONTRACT: frame() receives hudActive and tweens the DECLOAK envelope —
// the Predator reveal (the ship stops being invisible). All meshes stand down
// (`visible = false`) at decloak 0, so a powered-off cockpit costs zero draws.
import * as THREE from 'three';
import {
  GLASS_PANES,
  HULL_OUTER,
  CONSOLE_FILL,
  CONSOLE_SCREEN,
  STRUTS,
  COCKPIT_W,
  COCKPIT_H,
  type Pt,
  type Strut,
} from '../cockpitGeometry';
import {
  cockpitHullVertexShader,
  cockpitHullFragmentShader,
  cockpitGlassFragmentShader,
  cockpitStrutVertexShader,
  cockpitStrutFragmentShader,
  cockpitConsoleFragmentShader,
  cockpitScreenFragmentShader,
  cockpitHudVertexShader,
  cockpitHudFragmentShader,
} from '../shaders/cockpit.glsl';
import { buildHudGeometry } from './cockpitHud';
import type { Rig, Uniforms } from './types';

export interface CockpitRig extends Rig {
  /** Per-frame update: star NDC (the same projection the nova pass uses), the
   *  eased stage, the render clock, and the HUD power bit. */
  frame(ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean): void;
}

// ── Star-light keyframes over the eased stage ───────────────────────────────
// The chapter's light COLOUR + INTENSITY, matched to what the canvas shows: bone
// glare off the accretion disk, the supernova flash, ember red giant, gold star,
// blue-white nebula core, then the pale dot. This is the ONLY colour source for
// the neutral metal — the light fleshes it out. Linear-lerped per frame; colours
// are sRGB-ish values tuned against screenshots.
const STAR_KEYS: ReadonlyArray<{ s: number; c: [number, number, number]; i: number }> = [
  { s: 0.0, c: [0.82, 0.86, 0.96], i: 0.9 }, // black hole: cold bone/blue disk glare
  { s: 0.5, c: [1.0, 1.0, 1.0], i: 1.5 }, // supernova flash
  { s: 1.6, c: [1.0, 0.62, 0.4], i: 1.15 }, // red giant: warm ember
  { s: 2.9, c: [1.0, 0.86, 0.6], i: 1.25 }, // yellow star: gold
  { s: 4.0, c: [0.7, 0.82, 1.0], i: 1.0 }, // nebula core: blue-white
  { s: 4.5, c: [0.78, 0.85, 1.0], i: 0.95 }, // the pale dot
];

function starLightAt(stage: number, outColor: THREE.Color): number {
  let a = STAR_KEYS[0];
  let b = STAR_KEYS[STAR_KEYS.length - 1];
  for (let i = 0; i < STAR_KEYS.length - 1; i++) {
    if (stage >= STAR_KEYS[i].s && stage <= STAR_KEYS[i + 1].s) {
      a = STAR_KEYS[i];
      b = STAR_KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(1e-5, b.s - a.s);
  const k = Math.min(1, Math.max(0, (stage - a.s) / span));
  outColor.setRGB(a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k, a.c[2] + (b.c[2] - a.c[2]) * k);
  outColor.convertSRGBToLinear();
  return a.i + (b.i - a.i) * k;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function shapeFromPts(pts: ReadonlyArray<Pt>): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function pathFromPts(pts: ReadonlyArray<Pt>): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

/** The hull: the full screen with every glass pane subtracted as a hole. */
function buildHullGeometry(): THREE.BufferGeometry {
  const shape = shapeFromPts(HULL_OUTER);
  for (const pane of GLASS_PANES) shape.holes.push(pathFromPts(pane));
  const geo = new THREE.ShapeGeometry(shape);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(COCKPIT_W / 2, COCKPIT_H / 2, 0), 4000);
  return geo;
}

/** Faint glass fill over each pane (so the opening reads as glass). */
function buildGlassGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(GLASS_PANES.map((p) => shapeFromPts(p)));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(COCKPIT_W / 2, COCKPIT_H / 2, 0), 4000);
  return geo;
}

/** Extrude the struts into wide filled ribbons carrying aSide (∈[-1,1] across
 *  the beam, for the bevel) and aHalf (the beam's half-width). Mitred joints via
 *  the averaged tangent normal. */
function buildStrutGeometry(struts: ReadonlyArray<Strut>): THREE.BufferGeometry {
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const half: number[] = [];
  const idx: number[] = [];

  for (const strut of struts) {
    const pts = strut.closed ? [...strut.pts, strut.pts[0]] : [...strut.pts];
    const n = pts.length;
    if (n < 2) continue;
    const first = pos.length / 2;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev: Pt = i > 0 ? pts[i - 1] : strut.closed ? pts[n - 2] : pts[0];
      const next: Pt = i < n - 1 ? pts[i + 1] : strut.closed ? pts[1] : pts[n - 1];
      let d1x = p[0] - prev[0];
      let d1y = p[1] - prev[1];
      let d2x = next[0] - p[0];
      let d2y = next[1] - p[1];
      const l1 = Math.hypot(d1x, d1y) || 1;
      const l2 = Math.hypot(d2x, d2y) || 1;
      d1x /= l1;
      d1y /= l1;
      d2x /= l2;
      d2y /= l2;
      let tx = d1x + d2x;
      let ty = d1y + d2y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      const miter = 1 / Math.max(0.4, nx * -d1y + ny * d1x);
      for (const s of [-1, 1]) {
        pos.push(p[0], p[1]);
        norm.push(nx * miter, ny * miter);
        side.push(s);
        half.push(strut.hw);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = first + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(new Float32Array(pos), 2));
  geo.setAttribute('aNorm', new THREE.BufferAttribute(new Float32Array(norm), 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
  geo.setAttribute('aHalf', new THREE.BufferAttribute(new Float32Array(half), 1));
  geo.setAttribute('position', geo.getAttribute('aPos'));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(COCKPIT_W / 2, COCKPIT_H / 2, 0), 4000);
  return geo;
}

export function buildCockpit(scene: THREE.Scene): CockpitRig {
  // ── Shared uniforms ─────────────────────────────────────────────────────────
  // The metal is a SIMPLE neutral tone; the light fleshes it out. Authored in
  // sRGB → linear. Two beam tones (hull slightly darker than the struts) give
  // the mullions a hair of relief over the fill even before the bevel.
  const HULL_METAL = new THREE.Color(0.055, 0.06, 0.075).convertSRGBToLinear();
  const STRUT_METAL = new THREE.Color(0.1, 0.11, 0.13).convertSRGBToLinear();
  const HUD_WHITE = new THREE.Color(0.92, 0.95, 1.0).convertSRGBToLinear();

  const shared = {
    uDecloak: { value: 0 },
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector2(COCKPIT_W / 2, COCKPIT_H * 0.42) },
    uStarColor: { value: new THREE.Color(0.82, 0.86, 0.96) },
    uStarIntensity: { value: 0.9 },
    uAlpha: { value: 0 },
  };

  const meshes: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const addMesh = (
    geo: THREE.BufferGeometry,
    vertexShader: string,
    fragmentShader: string,
    uniforms: Uniforms,
    renderOrder: number,
    additive = false,
  ): THREE.Mesh => {
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      // NormalBlending is the ShaderMaterial default; only the glass + HUD go
      // additive (they lay light over the scene rather than occluding it).
      ...(additive ? { blending: THREE.AdditiveBlending } : {}),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.visible = false;
    scene.add(mesh);
    meshes.push(mesh);
    materials.push(mat);
    geometries.push(geo);
    return mesh;
  };

  // ── Meshes, back to front ───────────────────────────────────────────────────
  // Render order after every scene rig (particle composite sits at -1).
  // GLASS first (behind everything — a tint over the visible scene), then HULL
  // (the opaque surround), CONSOLE, SCREEN, STRUTS (relief over the hull), HUD.
  const glassGeo = buildGlassGeometry();
  addMesh(glassGeo, cockpitHullVertexShader, cockpitGlassFragmentShader, { ...shared }, 39, true);

  const hullGeo = buildHullGeometry();
  addMesh(hullGeo, cockpitHullVertexShader, cockpitHullFragmentShader, { ...shared, uMetal: { value: HULL_METAL } }, 40);

  const consoleGeo = new THREE.ShapeGeometry(shapeFromPts(CONSOLE_FILL));
  consoleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(COCKPIT_W / 2, COCKPIT_H / 2, 0), 4000);
  addMesh(consoleGeo, cockpitHullVertexShader, cockpitConsoleFragmentShader, { ...shared, uMetal: { value: STRUT_METAL } }, 41);

  const screenGeo = new THREE.ShapeGeometry(shapeFromPts(CONSOLE_SCREEN));
  screenGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(COCKPIT_W / 2, COCKPIT_H / 2, 0), 4000);
  addMesh(screenGeo, cockpitHullVertexShader, cockpitScreenFragmentShader, { ...shared, uHud: { value: HUD_WHITE } }, 42);

  const strutGeo = buildStrutGeometry(STRUTS);
  addMesh(strutGeo, cockpitStrutVertexShader, cockpitStrutFragmentShader, { ...shared, uMetal: { value: STRUT_METAL } }, 43);

  const hudGeo = buildHudGeometry();
  addMesh(
    hudGeo,
    cockpitHudVertexShader,
    cockpitHudFragmentShader,
    { ...shared, uHud: { value: HUD_WHITE }, uHudFloor: { value: 2.4 } },
    44,
    true,
  );

  // ── Decloak tween state (the power envelope) ────────────────────────────────
  let decloak = 0;
  let animFrom = 0;
  let animStart = -1;
  let target: boolean | null = null;
  const scratchColor = new THREE.Color();

  const frame = (ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean): void => {
    if (target === null || hudActive !== target) {
      target = hudActive;
      animFrom = decloak;
      animStart = t;
    }
    const dur = target ? 1.8 : 0.8;
    const raw = Math.min(1, Math.max(0, (t - animStart) / dur));
    const e = target ? raw * (0.85 + 0.15 * raw) : raw * raw;
    decloak = animFrom + ((target ? 1 : 0) - animFrom) * e;

    const on = decloak > 0.001;
    for (const m of meshes) m.visible = on;
    if (!on) return;

    shared.uDecloak.value = decloak;
    shared.uTime.value = t;
    shared.uAlpha.value = 1;

    // The star's light: position from the same NDC projection the nova pass
    // uses, clamped just past the frame so an off-screen body still rakes the
    // near edge; colour/intensity keyframed over the eased stage.
    const lx = Math.max(-200, Math.min(COCKPIT_W + 200, (ndcX * 0.5 + 0.5) * COCKPIT_W));
    const ly = Math.max(-200, Math.min(COCKPIT_H + 200, (1 - (ndcY * 0.5 + 0.5)) * COCKPIT_H));
    (shared.uLight.value as THREE.Vector2).set(lx, ly);
    const intensity = starLightAt(stage, scratchColor);
    shared.uStarIntensity.value = intensity;
    (shared.uStarColor.value as THREE.Color).copy(scratchColor);
  };

  const dispose = (): void => {
    for (const m of meshes) scene.remove(m);
    for (const g of geometries) g.dispose();
    for (const mat of materials) mat.dispose();
  };

  return { frame, dispose };
}
