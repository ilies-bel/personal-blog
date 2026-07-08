// Cockpit canopy rig — the TRUE-WebGL successor to the SVG overlay (which
// remains only as the reduced-motion fallback; see CockpitFrame.tsx). The line
// work and interior panels live INSIDE the scene render pass, drawn directly in
// clip space (the shaders ignore the camera — see cockpit.glsl.ts), so:
//   • bloom genuinely lights the hot spans nearest the star,
//   • the lighting is computed per-pixel from the star's projected position in
//     the star's own per-chapter colour (keyframed over the eased stage below),
//   • the power transition is a pure shader DECLOAK — no scale, no travel.
//
// Geometry comes from cockpitGeometry.ts (the single design-space source shared
// with the SVG fallback): polylines are extruded here into indexed triangle
// ribbons with mitred joints (aNorm carries the miter), rounded corners already
// resolved upstream. The ribbon set draws TWICE — an additive glow pass (wide,
// gaussian halo) under a normal-blended core pass (the member itself, white-hot
// centre) — the glowing-piping look of the reference. Panels + the canopy strut
// band triangulate via THREE.ShapeGeometry (earcut handles the concave outlines).
//
// POWER CONTRACT: frame() receives hudActive (read through the SceneHooks seam,
// so the scene never touches the DOM's class names itself) and tweens the
// DECLOAK envelope — the Predator reveal: the ship never moves or zooms, it
// simply STOPS BEING INVISIBLE. Cells of the hull flicker into existence over
// ~1.8s on power-up (glinting electric before settling into the amber trim, a
// heat-haze ripple on the members while the field fills) and dissolve back the
// same way over ~0.8s on power-down. The envelope + flicker live entirely in
// cockpit.glsl.ts (uDecloak / uTime); this file only drives the tween. All
// three meshes stand down (`visible = false`) at decloak 0, so a powered-off
// cockpit costs zero draws (the draw-audit convention).
import * as THREE from 'three';
import {
  COCKPIT_LINES,
  CANOPY_OUTER,
  CANOPY_INNER,
  PANEL_CEILING,
  PANEL_DASH,
  COCKPIT_W,
  COCKPIT_H,
  type CockpitLine,
  type Pt,
} from '../cockpitGeometry';
import {
  cockpitLineVertexShader,
  cockpitLineFragmentShader,
  cockpitGlowFragmentShader,
  cockpitPanelVertexShader,
  cockpitPanelFragmentShader,
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

/** How much wider the glow pass's ribbon runs than its member. Kept TIGHT: the
 *  reference's halo hugs its edge lines — a wide halo bridges a beam's two
 *  edges and washes out the dark band that gives the member its width. */
const GLOW_WIDTH_SCALE = 2.4;

/** The authored piping body colour (linear); uAmber is derived from it per
 *  frame via the band's gold-shift key (STAR_KEYS.d). GOLD_BASE is the shift
 *  TARGET: graying the amber toward luma lifts its blue channel and the
 *  super-saturating nebula grade amplifies that into salmon-pink — the
 *  compensation must move along the amber→gold hue line (blue stays low),
 *  never toward neutral gray. */
const AMBER_BASE = new THREE.Color(1.0, 0.47, 0.13).convertSRGBToLinear();
const GOLD_BASE = new THREE.Color(1.0, 0.82, 0.4).convertSRGBToLinear();

// ── Star-light keyframes over the eased stage ───────────────────────────────
// The chapter's light colour + intensity, matched to what the canvas actually
// shows: bone glare off the accretion disk, the supernova flash, ember red
// giant, gold star, blue-white nebula core, then the pale dot. Linear-lerped
// per frame; colours are sRGB-ish values tuned against screenshots, not
// physical constants.
//
// `f` is the piping's HDR FLOOR GAIN — the self-luminous energy the trim emits
// before any scene light lands on it. The cockpit renders INSIDE the graded
// pipeline (exposure × Reinhard tone-map × per-chapter desaturation), so a
// plain 0..1 colour arrives on screen as tan wireframe: to read as saturated
// glowing amber the members must be authored HOT, roughly inverse to each
// chapter's grade exposure (the pale dot grades at 0.46 exposure + 0.72 sat —
// hence the biggest floor).
// `d` is the band's GOLD SHIFT (1 = the authored red-leaning amber, <1 =
// slid toward GOLD_BASE before the grade). The authored hue banks on the
// grade desaturating (cfg.saturation 0.38 … dot 0.72); the nebula grade
// instead SUPER-saturates (uSat 1.55), which drives the same amber to blood
// red — so the nebula→dot run pre-shifts toward gold and lands on the same
// calm gold the dot chapter shows.
const STAR_KEYS: ReadonlyArray<{ s: number; c: [number, number, number]; i: number; f: number; d?: number }> = [
  // Black hole: the chapter's grade is the near-monochrome COLD-SILVER room
  // (uSat ≈ 0.38 + the cool shadow cast) — at that saturation a BRIGHT line
  // can only land tan, whatever its authored hue (desat pulls toward a high
  // luma). The reference's spans are mostly DIM rich umber with sparse hot
  // flares, and dim survives the desat with its relative saturation intact.
  // The floor must also hold the member BODY under the bloom pass's 0.55
  // threshold: this chapter runs the photon ring's wide strong bloom, and any
  // span sitting over the threshold along its whole length staircases through
  // the deep mips into blocky beads. Only the star kiss may cross — its
  // envelope is spatially smooth, so it blooms smoothly.
  { s: 0.0, c: [0.88, 0.86, 0.8], i: 0.85, f: 1.35 }, // black hole: cold bone disk glare
  { s: 0.5, c: [1.0, 1.0, 1.0], i: 1.35, f: 4 }, // supernova flash
  { s: 1.6, c: [1.0, 0.6, 0.36], i: 1.05, f: 5.8 }, // red giant: ember (dim grade)
  { s: 2.9, c: [1.0, 0.84, 0.52], i: 1.2, f: 6 }, // yellow star: gold (hot grade)
  { s: 4.0, c: [0.78, 0.85, 1.0], i: 0.85, f: 13 }, // nebula core: blue-white
  // The gas grade EASES into the dot endpoint across stage 4.3→4.5 (the
  // pre-dot handoff in lifecycle.ts — bloom 0.38/0.75 → 0.05/0.16, sat 1.55 →
  // 0.72, exposure 0.58 → 0.46). The floor rides it: held LOW while the wide
  // gas bloom is live (bloom runs BEFORE the grade, so halo energy scales
  // with the raw HDR floor — a big floor here fogs the whole sill band into
  // red tubes), then climbing to the dot's dim-grade compensation only as the
  // bloom lands near its 0.05 endpoint. `d` bridges the residual mid-band
  // super-saturation so the recovery band (JUMP TO WORK) reads the same calm
  // gold as the settled dot chapter.
  { s: 4.35, c: [0.76, 0.83, 1.0], i: 0.7, f: 18, d: 0.7 },
  { s: 4.45, c: [0.74, 0.82, 1.0], i: 0.72, f: 62, d: 0.95 },
  { s: 4.5, c: [0.74, 0.82, 1.0], i: 0.72, f: 62 }, // the pale dot (0.46 exposure + the output decode)
];

function starLightAt(stage: number, outColor: THREE.Color): { i: number; f: number; d: number } {
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
  outColor.convertSRGBToLinear(); // keys are authored in sRGB (see palette note)
  const da = a.d ?? 1;
  const db = b.d ?? 1;
  return { i: a.i + (b.i - a.i) * k, f: a.f + (b.f - a.f) * k, d: da + (db - da) * k };
}

// ── Ribbon extrusion ─────────────────────────────────────────────────────────

/** Extrude every cockpit polyline into one indexed ribbon geometry. Two
 *  vertices per point (±aSide); aNorm is the vertex's miter normal (average of
 *  adjoining segment normals, scaled 1/cos(half-angle), clamped — corners are
 *  pre-rounded upstream so miters stay shallow). aWidth carries the member's
 *  authored CSS-px width. Closed rings wrap and repeat their first point so
 *  the loop seals without a seam. */
function buildRibbons(lines: ReadonlyArray<CockpitLine>): THREE.BufferGeometry {
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const weight: number[] = [];
  const width: number[] = [];
  const idx: number[] = [];

  for (const line of lines) {
    const pts = line.closed ? [...line.pts, line.pts[0]] : [...line.pts];
    const n = pts.length;
    if (n < 2) continue;
    const first = pos.length / 2;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      // Wrap neighbours for closed rings (pts already repeats the seam point,
      // so wrap indices skip the duplicate); clamp at open ends.
      const prev: Pt = i > 0 ? pts[i - 1] : line.closed ? pts[n - 2] : pts[0];
      const next: Pt = i < n - 1 ? pts[i + 1] : line.closed ? pts[1] : pts[n - 1];
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
      // Perpendicular of the averaged tangent, miter-scaled against segment 1.
      const nx = -ty;
      const ny = tx;
      const miter = 1 / Math.max(0.35, nx * -d1y + ny * d1x);
      // NO perspective taper: each member keeps its authored width for its
      // whole run (the pilot's call — a line that thins as it climbs reads as
      // an inconsistent stroke, not depth; luminance carries the perspective).
      for (const s of [-1, 1]) {
        pos.push(p[0], p[1]);
        norm.push(nx * miter, ny * miter);
        side.push(s);
        weight.push(line.w);
        width.push(line.px);
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
  geo.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(weight), 1));
  geo.setAttribute('aWidth', new THREE.BufferAttribute(new Float32Array(width), 1));
  // three requires a `position` attribute for draw-range bookkeeping even when
  // the vertex shader never reads it — alias the 2D data (itemSize 2 is fine).
  geo.setAttribute('position', geo.getAttribute('aPos'));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
  return geo;
}

function shapeFromPts(pts: ReadonlyArray<Pt>): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

export function buildCockpit(scene: THREE.Scene): CockpitRig {
  // Panels: ceiling + dashboard masses, plus the strut band between the
  // windshield's edge pair (outer ring with the inner ring as a hole).
  const band = shapeFromPts(CANOPY_OUTER.pts);
  const bandHole = new THREE.Path();
  bandHole.moveTo(CANOPY_INNER.pts[0][0], CANOPY_INNER.pts[0][1]);
  for (let i = 1; i < CANOPY_INNER.pts.length; i++) bandHole.lineTo(CANOPY_INNER.pts[i][0], CANOPY_INNER.pts[i][1]);
  bandHole.closePath();
  band.holes.push(bandHole);
  const panelGeo = new THREE.ShapeGeometry([shapeFromPts(PANEL_CEILING), shapeFromPts(PANEL_DASH), band]);

  const shared = {
    uDecloak: { value: 0 },
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector2(COCKPIT_W / 2, COCKPIT_H * 0.43) },
    uStarColor: { value: new THREE.Color(0.88, 0.86, 0.8) },
    uStarIntensity: { value: 0.65 },
    uFloor: { value: 9 }, // HDR self-luminous gain, keyframed (STAR_KEYS.f)
    uAlpha: { value: 0 },
    uHalfW: { value: 0.55 }, // design units per CSS half-px; written per frame
    // The piping palette: amber body, white-hot core (the reference trim).
    // Authored in sRGB, converted to linear, then driven HOT by uFloor — the
    // hue is deliberately redder than the on-screen target because the grade's
    // Reinhard + desaturation pull HDR orange toward yellow-tan; this lands on
    // the reference's saturated amber after the pipeline has its way. The
    // frame loop rewrites this from AMBER_BASE each tick (STAR_KEYS.d).
    uAmber: { value: AMBER_BASE.clone() },
    uCoreTint: { value: new THREE.Color(1.0, 0.93, 0.76).convertSRGBToLinear() },
  };

  const panelUniforms: Uniforms = {
    ...shared,
    uFill: { value: 0.9 },
  };
  const panelMat = new THREE.ShaderMaterial({
    uniforms: panelUniforms,
    vertexShader: cockpitPanelVertexShader,
    fragmentShader: cockpitPanelFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const panels = new THREE.Mesh(panelGeo, panelMat);
  panels.frustumCulled = false;
  panels.renderOrder = 40; // after every scene rig (particle composite sits at -1)
  panels.visible = false;
  scene.add(panels);

  const lineGeo = buildRibbons(COCKPIT_LINES);

  // Glow pass first: the additive halo the members sit in.
  const glowUniforms: Uniforms = {
    ...shared,
    uWidthScale: { value: GLOW_WIDTH_SCALE },
  };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: cockpitLineVertexShader,
    fragmentShader: cockpitGlowFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(lineGeo, glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = 41; // halo under the members, over the panels
  glow.visible = false;
  scene.add(glow);

  // Core pass: the members themselves.
  const lineUniforms: Uniforms = {
    ...shared,
    uWidthScale: { value: 1 },
  };
  const lineMat = new THREE.ShaderMaterial({
    uniforms: lineUniforms,
    vertexShader: cockpitLineVertexShader,
    fragmentShader: cockpitLineFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const lines = new THREE.Mesh(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 42; // members etch over their own halo
  lines.visible = false;
  scene.add(lines);

  // HUD pass: the white holographic instruments on the glass (scanner reticle
  // tracking the star via uLight + the fixed compass strip). A projection, not
  // metal — no star lighting, just a floor gain through the grade.
  const hudGeo = buildHudGeometry();
  const hudUniforms: Uniforms = {
    ...shared,
    uHud: { value: new THREE.Color(0.82, 0.88, 0.97).convertSRGBToLinear() },
    uHudFloor: { value: 2.4 },
  };
  const hudMat = new THREE.ShaderMaterial({
    uniforms: hudUniforms,
    vertexShader: cockpitHudVertexShader,
    fragmentShader: cockpitHudFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const hud = new THREE.Mesh(hudGeo, hudMat);
  hud.frustumCulled = false;
  hud.renderOrder = 43; // holography over the members
  hud.visible = false;
  scene.add(hud);

  // ── Decloak tween state (the power envelope) ────────────────────────────────
  let decloak = 0;
  let animFrom = 0;
  let animStart = -1;
  let target: boolean | null = null; // null until the first frame samples power
  const scratchColor = new THREE.Color();

  const frame = (ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean): void => {
    if (target === null || hudActive !== target) {
      target = hudActive;
      animFrom = decloak;
      animStart = t;
    }
    // Power-up: a near-LINEAR fill (the cell field reads as steadily
    // materialising patches — an eased envelope just makes the flicker stall).
    // Power-down: quad-in, the cloak snapping back over the hull.
    const dur = target ? 1.8 : 0.8;
    const raw = Math.min(1, Math.max(0, (t - animStart) / dur));
    const e = target ? raw * (0.85 + 0.15 * raw) : raw * raw;
    decloak = animFrom + ((target ? 1 : 0) - animFrom) * e;

    const on = decloak > 0.001;
    panels.visible = on;
    glow.visible = on;
    lines.visible = on;
    hud.visible = on;
    if (!on) return;

    // The decloak owns visibility per pixel (cloakMask in the shaders); the
    // master alpha stays at 1 so the reveal is materialisation, never a fade.
    shared.uDecloak.value = decloak;
    shared.uTime.value = t;
    shared.uAlpha.value = 1;

    // The star's light: position from the same NDC projection the nova pass
    // uses, clamped just past the frame so an off-screen body still rakes the
    // near edge; colour/intensity keyframed over the eased stage.
    const lx = Math.max(-200, Math.min(COCKPIT_W + 200, (ndcX * 0.5 + 0.5) * COCKPIT_W));
    const ly = Math.max(-200, Math.min(COCKPIT_H + 200, (1 - (ndcY * 0.5 + 0.5)) * COCKPIT_H));
    (shared.uLight.value as THREE.Vector2).set(lx, ly);
    const light = starLightAt(stage, scratchColor);
    shared.uStarIntensity.value = light.i;
    shared.uFloor.value = light.f;
    (shared.uStarColor.value as THREE.Color).copy(scratchColor);
    // Amber gold-shift (STAR_KEYS.d): slide the authored red-leaning amber
    // along the amber→gold hue line where the live grade super-saturates
    // instead of muting (d = 1 authored, d = 0 full gold).
    (shared.uAmber.value as THREE.Color).setRGB(
      GOLD_BASE.r + (AMBER_BASE.r - GOLD_BASE.r) * light.d,
      GOLD_BASE.g + (AMBER_BASE.g - GOLD_BASE.g) * light.d,
      GOLD_BASE.b + (AMBER_BASE.b - GOLD_BASE.b) * light.d,
    );

    // Design units per CSS half-px, tracking the live viewport height (the
    // non-scaling-stroke contract; per-member widths ride aWidth).
    shared.uHalfW.value = 0.5 * (COCKPIT_H / window.innerHeight);
  };

  const dispose = (): void => {
    scene.remove(hud);
    scene.remove(lines);
    scene.remove(glow);
    scene.remove(panels);
    hudGeo.dispose();
    lineGeo.dispose();
    panelGeo.dispose();
    hudMat.dispose();
    lineMat.dispose();
    glowMat.dispose();
    panelMat.dispose();
  };

  return { frame, dispose };
}
