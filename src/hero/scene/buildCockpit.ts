// Cockpit canopy rig — the TRUE-WebGL successor to the SVG overlay (which
// remains only as the reduced-motion fallback; see CockpitFrame.tsx).
//
// THE OVERLAY CONTRACT: the cockpit lives in its OWN scene, rendered by
// rig.render() AFTER the composer (RenderPass → Bloom → Grade → Nova) has
// written the graded frame — the same side of the pipeline as the DOM
// instruments. Its shaders author DISPLAY sRGB and write it raw (WYSIWYG), so
// the trim reads as saturated lit amber at every chapter instead of fighting
// the grade's desaturation/tone-map (see cockpit.glsl.ts for the full story).
// The scene still lights it: the star's projected position (uLight), chapter
// colour (uStarColor/uStarIntensity keyframed below) and the supernova wash
// (uNova) flow in per frame.
//
// Geometry comes from cockpitGeometry.ts (the single design-space source
// shared with the SVG fallback): polylines are extruded here into indexed
// triangle ribbons with mitred joints, rounded corners resolved upstream.
// Draw order inside the overlay scene: hull panels → console screen glass →
// flat graphic beams → white HUD holography. (The glow halo, junction glint
// and smoked-glass passes are gone — the minimal grammar is band + hairline.)
//
// POWER CONTRACT: frame() receives hudActive (read through the SceneHooks
// seam) and tweens the DECLOAK envelope — the Predator reveal: the ship never
// moves or zooms, it simply STOPS BEING INVISIBLE. All meshes stand down
// (`visible = false`) at decloak 0 and rig.render() skips the pass entirely,
// so a powered-off cockpit costs zero draws (the draw-audit convention).
import * as THREE from 'three';
import {
  COCKPIT_BEAMS,
  HULL_OUTER,
  HULL_HOLES,
  PANEL_SCREEN,
  COCKPIT_W,
  COCKPIT_H,
  type CockpitBeam,
  type Pt,
} from '../cockpitGeometry';
import {
  cockpitBeamVertexShader,
  cockpitBeamFragmentShader,
  cockpitPanelVertexShader,
  cockpitPanelFragmentShader,
  cockpitScreenFragmentShader,
  cockpitHudVertexShader,
  cockpitHudFragmentShader,
} from '../shaders/cockpit.glsl';
import { buildHudGeometry } from './cockpitHud';
import type { Rig, Uniforms } from './types';

export interface CockpitRig extends Rig {
  /** Per-frame update: star NDC (the same projection the nova pass uses), the
   *  eased stage, the render clock, the HUD power bit, and the supernova
   *  screen-wash envelope. */
  frame(ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean, nova: number): void;
  /** Composite the cockpit over the already-graded canvas (autoClear off).
   *  No-op while fully cloaked — zero draws when powered down. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
}

// The trim palette, DISPLAY sRGB, written raw by the post-grade shaders —
// matched to the DOM instruments' highlight family so metal and holography
// read as one machine.
const AMBER = new THREE.Color(1.0, 0.6, 0.19);
const CORE_TINT = new THREE.Color(1.0, 0.88, 0.64);
const HUD_WHITE = new THREE.Color(0.88, 0.92, 0.99);

// ── Star-light keyframes over the eased stage ───────────────────────────────
// The chapter's light colour + intensity, matched to what the canvas actually
// shows: bone glare off the accretion disk, the supernova flash, ember red
// giant, gold star, blue-white nebula core, then the pale dot. Only the KISS
// rides these (where a member's face squares to the star it flares toward the
// star's own colour); the trim's resting glow is chapter-independent now that
// the overlay renders post-grade.
const STAR_KEYS: ReadonlyArray<{ s: number; c: [number, number, number]; i: number }> = [
  { s: 0.0, c: [0.88, 0.86, 0.8], i: 0.85 }, // black hole: cold bone disk glare
  { s: 0.5, c: [1.0, 1.0, 1.0], i: 1.35 }, // supernova flash
  { s: 1.6, c: [1.0, 0.6, 0.36], i: 1.05 }, // red giant: ember
  { s: 2.9, c: [1.0, 0.84, 0.52], i: 1.2 }, // yellow star: gold
  { s: 4.0, c: [0.78, 0.85, 1.0], i: 0.85 }, // nebula core: blue-white
  { s: 4.5, c: [0.74, 0.82, 1.0], i: 0.72 }, // the pale dot
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
  return a.i + (b.i - a.i) * k;
}

// ── Ribbon extrusion ─────────────────────────────────────────────────────────

/** Extrude the structural BEAMS: mitred joints; the width attribute (aDW) is
 *  the member's full width in DESIGN units (per-vertex via dwAt — junction
 *  chisel tapers ride this) — the vertex shader extrudes half per side, and
 *  the fragment shader draws flat fill + edge hairlines off the cross
 *  coordinate. */
function buildBeamRibbons(beams: ReadonlyArray<CockpitBeam>): THREE.BufferGeometry {
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const weight: number[] = [];
  const dw: number[] = [];
  const idx: number[] = [];

  for (const beam of beams) {
    const pts = beam.closed ? [...beam.pts, beam.pts[0]] : [...beam.pts];
    const n = pts.length;
    if (n < 2) continue;
    const first = pos.length / 2;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev: Pt = i > 0 ? pts[i - 1] : beam.closed ? pts[n - 2] : pts[0];
      const next: Pt = i < n - 1 ? pts[i + 1] : beam.closed ? pts[1] : pts[n - 1];
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
      const miter = 1 / Math.max(0.35, nx * -d1y + ny * d1x);
      for (const s of [-1, 1]) {
        pos.push(p[0], p[1]);
        norm.push(nx * miter, ny * miter);
        side.push(s);
        weight.push(beam.w);
        dw.push(beam.dwAt ? beam.dwAt(p[0], p[1]) : beam.dw);
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
  geo.setAttribute('aDW', new THREE.BufferAttribute(new Float32Array(dw), 1));
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

const overlayMatOpts = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  side: THREE.DoubleSide,
} as const;

export function buildCockpit(): CockpitRig {
  // The overlay's private scene — composited over the graded canvas by
  // rig.render(); the main scene never sees these meshes.
  const overlay = new THREE.Scene();

  const shared = {
    uDecloak: { value: 0 },
    uTime: { value: 0 },
    uLight: { value: new THREE.Vector2(COCKPIT_W / 2, COCKPIT_H * 0.43) },
    uStarColor: { value: new THREE.Color(0.88, 0.86, 0.8) },
    uStarIntensity: { value: 0.65 },
    uNova: { value: 0 },
    uAlpha: { value: 0 },
    uHalfW: { value: 0.55 }, // design units per CSS half-px; written per frame
    uAmber: { value: AMBER.clone() },
    uCoreTint: { value: CORE_TINT.clone() },
  };

  // The hull mass: ONE shell covering the whole frame with every glass pane
  // as a HOLE — the central gem plus the corner and flank side windows.
  // Opaque occlusion is what turns floating trim into a ship; each hole's
  // edge sits on a member's centreline (the beam band overlaps it).
  const hullShape = shapeFromPts(HULL_OUTER);
  for (const hole of HULL_HOLES) {
    hullShape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  const panelGeo = new THREE.ShapeGeometry(hullShape);
  const panelUniforms: Uniforms = { ...shared, uFill: { value: 1.0 } };
  const panelMat = new THREE.ShaderMaterial({
    uniforms: panelUniforms,
    vertexShader: cockpitPanelVertexShader,
    fragmentShader: cockpitPanelFragmentShader,
    ...overlayMatOpts,
  });
  const panels = new THREE.Mesh(panelGeo, panelMat);
  panels.frustumCulled = false;
  panels.renderOrder = 40;
  panels.visible = false;
  overlay.add(panels);

  // The recessed console screen — powered display glass under the CTA readout.
  const screenGeo = new THREE.ShapeGeometry(shapeFromPts(PANEL_SCREEN));
  const screenUniforms: Uniforms = { ...shared };
  const screenMat = new THREE.ShaderMaterial({
    uniforms: screenUniforms,
    vertexShader: cockpitPanelVertexShader,
    fragmentShader: cockpitScreenFragmentShader,
    ...overlayMatOpts,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.frustumCulled = false;
  screen.renderOrder = 41;
  screen.visible = false;
  overlay.add(screen);

  // Structural beams: the thick milled-metal members with edge hairlines +
  // echo drawn in-shader off the cross-section coordinate.
  const beamGeo = buildBeamRibbons(COCKPIT_BEAMS);
  const beamUniforms: Uniforms = { ...shared };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamUniforms,
    vertexShader: cockpitBeamVertexShader,
    fragmentShader: cockpitBeamFragmentShader,
    ...overlayMatOpts,
  });
  const beams = new THREE.Mesh(beamGeo, beamMat);
  beams.frustumCulled = false;
  beams.renderOrder = 42;
  beams.visible = false;
  overlay.add(beams);

  // HUD pass: the white holographic instruments on the glass (scanner reticle
  // tracking the star via uLight + the fixed compass strip).
  const hudGeo = buildHudGeometry();
  const hudUniforms: Uniforms = {
    ...shared,
    uHud: { value: HUD_WHITE.clone() },
  };
  const hudMat = new THREE.ShaderMaterial({
    uniforms: hudUniforms,
    vertexShader: cockpitHudVertexShader,
    fragmentShader: cockpitHudFragmentShader,
    ...overlayMatOpts,
  });
  const hud = new THREE.Mesh(hudGeo, hudMat);
  hud.frustumCulled = false;
  hud.renderOrder = 45;
  hud.visible = false;
  overlay.add(hud);

  const meshes = [panels, screen, beams, hud];

  // ── Decloak tween state (the power envelope) ────────────────────────────────
  let decloak = 0;
  let animFrom = 0;
  let animStart = -1;
  let target: boolean | null = null; // null until the first frame samples power
  const scratchColor = new THREE.Color();

  const frame = (ndcX: number, ndcY: number, stage: number, t: number, hudActive: boolean, nova: number): void => {
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
    for (const m of meshes) m.visible = on;
    if (!on) return;

    // The decloak owns visibility per pixel (cloakMask in the shaders); the
    // master alpha stays at 1 so the reveal is materialisation, never a fade.
    shared.uDecloak.value = decloak;
    shared.uTime.value = t;
    shared.uAlpha.value = 1;
    shared.uNova.value = nova;

    // The star's light: position from the same NDC projection the nova pass
    // uses, clamped just past the frame so an off-screen body still rakes the
    // near edge; colour/intensity keyframed over the eased stage.
    const lx = Math.max(-200, Math.min(COCKPIT_W + 200, (ndcX * 0.5 + 0.5) * COCKPIT_W));
    const ly = Math.max(-200, Math.min(COCKPIT_H + 200, (1 - (ndcY * 0.5 + 0.5)) * COCKPIT_H));
    (shared.uLight.value as THREE.Vector2).set(lx, ly);
    shared.uStarIntensity.value = starLightAt(stage, scratchColor);
    (shared.uStarColor.value as THREE.Color).copy(scratchColor);

    // Design units per CSS half-px, tracking the live viewport height (the
    // non-scaling-stroke contract; per-member widths ride aDW).
    shared.uHalfW.value = 0.5 * (COCKPIT_H / window.innerHeight);
  };

  const render = (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void => {
    if (decloak <= 0.001) return; // powered off — zero draws
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(overlay, camera);
    renderer.autoClear = prevAutoClear;
  };

  const dispose = (): void => {
    for (const m of meshes) overlay.remove(m);
    hudGeo.dispose();
    beamGeo.dispose();
    screenGeo.dispose();
    panelGeo.dispose();
    hudMat.dispose();
    beamMat.dispose();
    screenMat.dispose();
    panelMat.dispose();
  };

  return { frame, render, dispose };
}
