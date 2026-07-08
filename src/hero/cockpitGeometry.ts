// The cockpit canopy's geometry — ONE source of truth consumed by BOTH renderers:
// buildCockpit.ts (the live WebGL rig) and CockpitFrame.tsx (the reduced-motion
// SVG fallback). Everything is authored in a fixed 1920×1080, y-down design
// space that each renderer stretches to the viewport, so the drawing behaves
// like a cockpit moulded to the glass.
//
// MEASURED, NOT EYEBALLED: every centreline below comes from a ridge scan of
// the generated reference (scripts/blueprint-scan.mjs prints where the amber
// trim crosses a lattice of scan rows/columns; scripts/blueprint-grid.mjs
// burns a labeled grid over it). Verify changes against the reference with the
// dev blueprint overlay (/dev-blueprint) BEFORE wiring them into the scene.
//
// THE SHAPE (reference truth): the glass is a faceted GEM, not a rounded
// hexagon — a THIN flat top beam (y≈60), long chamfers diving to the WAIST at
// (≈221, 262) (the widest point sits HIGH), lower sides leaning INWARD going
// down, and a low, nearly-flat sill (y≈820) that bows UP a hair at centre.
// THE GREENHOUSE: the central gem is not the only glass. Each side has TWO
// MORE PANES cut out of the hull — an upper CORNER pane (the nameplate/nav
// float on it) and a tall FLANK pane (the NAV dial floats on it) — separated
// by a straight CONNECTOR mullion that runs from the screen edge (≈0,151)
// through the measured T-vertex (≈132,215) into the waist junction, and
// bounded inward by a DIAGONAL mullion from the screen top (≈510,0) parallel
// to the chamfer (ridge scan: (445,40)→(346,100)→(187,200)).
// THE INTEGRATION: members flow into each other — the sill continues past its
// corners and WRAPS DOWN the flanks toward the screen edges (the perspective
// that makes it one hull), the diagonal lands on the connector mid-run, the
// connector buries into the waist junction, the aprons/mid-wrap merge into
// the screen housing, and every groove ends inside another member's band.
// No floating parallels.

/** An authored vertex: x, y, and an optional corner-rounding length (design
 *  units). r > 0 replaces the corner with a quadratic fillet; endpoints and
 *  curve samples use r = 0 (default). */
export type RawPt = readonly [number, number, number?];
/** A resolved polyline point. */
export type Pt = readonly [number, number];

export const COCKPIT_W = 1920;
export const COCKPIT_H = 1080;

/** One structural BEAM: its centreline polyline, its width in DESIGN units
 *  (the metal band the shader fills and edge-lights), and its facing weight
 *  (how squarely the member faces the star — multiplies the lit passes). */
export interface CockpitBeam {
  pts: ReadonlyArray<Pt>;
  /** Full member width, design px (nominal; see dwAt). */
  dw: number;
  /** Facing weight 0..1. */
  w: number;
  closed?: boolean;
  /** Optional per-point width override (design px) — the reference canopy is
   *  THIN at the top beam and fattens through the chamfers to the sides. */
  dwAt?: (x: number, y: number) => number;
}

/** One junction glint: a hot white-gold spark where members meet. */
export interface CockpitGlint {
  x: number;
  y: number;
  /** Radius, design px. */
  r: number;
  /** Intensity multiplier. */
  i: number;
}

// ─── Builders ────────────────────────────────────────────────────────────────

/** Sample the quadratic bézier p0→(control c)→p1, EXCLUDING p0 (so consecutive
 *  spans chain without duplicate joints). */
function quad(p0: Pt, c: Pt, p1: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const v = 1 - u;
    out.push([v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]);
  }
  return out;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const toward = (from: Pt, to: Pt, t: number): Pt => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

/** Resolve authored vertices into a polyline: each vertex with r > 0 becomes a
 *  sampled quadratic fillet between tangent points cut r along each adjoining
 *  edge (clamped to 42% of the shorter edge so tight geometry never folds).
 *  Open lines never round their endpoints; closed rings round every flagged
 *  vertex including across the seam. */
export function resolveCorners(raw: ReadonlyArray<RawPt>, closed = false): Pt[] {
  const n = raw.length;
  const out: Pt[] = [];
  const FILLET_SAMPLES = 8;
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = raw[i];
    const b: Pt = [x, y];
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (r <= 0 || isEnd) {
      out.push(b);
      continue;
    }
    const a: Pt = [raw[(i - 1 + n) % n][0], raw[(i - 1 + n) % n][1]];
    const c: Pt = [raw[(i + 1) % n][0], raw[(i + 1) % n][1]];
    const cut = Math.min(r, dist(a, b) * 0.42, dist(b, c) * 0.42);
    const p1 = toward(b, a, cut / dist(a, b));
    // quad() excludes its start point, so push it explicitly.
    out.push(p1);
    out.push(...quad(p1, b, toward(b, c, cut / dist(b, c)), FILLET_SAMPLES));
  }
  return out;
}

/** Serialize a polyline to an SVG path `d` (the reduced-motion fallback + the
 *  dev blueprint overlay). */
export function toPathD(pts: ReadonlyArray<Pt>, closed = false): string {
  const body = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return closed ? `${body} Z` : body;
}

/** Signed area (shoelace) — used only to normalise offset direction. */
function signedArea(pts: ReadonlyArray<Pt>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Offset a CLOSED resolved polyline by `delta` design px along its miter
 *  normals — positive delta always GROWS the ring (offsets away from the
 *  interior, whatever the authored winding). This is how the hull's parallel
 *  trim/seam rings are derived from the canopy centreline, so re-measuring the
 *  canopy re-measures every lamination line with it. */
export function offsetClosed(pts: ReadonlyArray<Pt>, delta: number): Pt[] {
  const n = pts.length;
  const grow = signedArea(pts) > 0 ? -1 : 1;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
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
    const miter = 1 / Math.max(0.35, Math.abs(nx * -d1y + ny * d1x));
    out.push([p[0] + nx * miter * delta * grow, p[1] + ny * miter * delta * grow]);
  }
  return out;
}

/** Rotate a ring so the points BELOW yMax form one contiguous run, and return
 *  that run as an OPEN polyline — the outer hull seams wrap the roof and
 *  waist but stop before the deck band (the wrap lines own the bottom). */
function clipRingAboveY(pts: ReadonlyArray<Pt>, yMax: number): Pt[] {
  const n = pts.length;
  let start = -1;
  for (let i = 0; i < n; i++) {
    const prevBelow = pts[(i - 1 + n) % n][1] > yMax;
    if (prevBelow && pts[i][1] <= yMax) {
      start = i;
      break;
    }
  }
  if (start < 0) return [...pts];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(start + i) % n];
    if (p[1] > yMax) break;
    out.push(p);
  }
  return out;
}

// ─── The canopy ring ─────────────────────────────────────────────────────────
// The glass opening's centreline, authored CLOSED (the hull mass and every
// offset lamination derive from it). Measured vertices (ridge scan):
//   top beam edges y52/67 (centreline 60), corners x525/1395
//   chamfers CURVE through (≈433,100)/(≈384,130) → mid vertex (330,165) r100
//   waist (widest point) at (221,262)/(1699,262)
//   lower sides lean INWARD going down: (221,262)→(374,700) → slope 0.35 x/y
//   sill corners (413,826)/(1507,826), centre (960,812) — the sill bows UP.

const RING_RAW: RawPt[] = [
  [525, 60, 40],
  [1395, 60, 40],
  [1590, 165, 100],
  [1699, 262, 60],
  [1507, 826, 90],
  [960, 812, 420],
  [413, 826, 90],
  [221, 262, 60],
  [330, 165, 100],
];

/** Per-point canopy width: THIN across the top beam (the reference top is a
 *  ~15px band), fattening through the chamfers to the full ~34px sides. */
function canopyDW(_x: number, y: number): number {
  const k = Math.min(1, Math.max(0, (y - 60) / 202)); // 60 → 262 (waist)
  return 15 + 19 * k;
}

export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(RING_RAW, true),
  dw: 26,
  w: 1,
  closed: true,
  dwAt: canopyDW,
};

// ─── Hull lamination rings ───────────────────────────────────────────────────
// Parallel to the canopy run two more hairlines — a thin lip rimming the
// glass, and ONE outer lamination that exists only across the roof and
// chamfers (scan: y≈28 above the top beam, +26 outside the chamfers, and
// NOTHING parallel below the waist — the reference pillars carry a single
// band + inner lip, so the trim stops at the waist junctions).

/** Glass-side lip (roof + chamfers + pillars; the sill has none). */
export const CANOPY_INNER_LIP: CockpitBeam = {
  pts: clipRingAboveY(offsetClosed(CANOPY_BEAM.pts, -34), 730),
  dw: 5,
  w: 0.68,
};
/** The hull lamination just outside the main band — roof + chamfers only. */
export const CANOPY_OUTER_TRIM: CockpitBeam = {
  pts: clipRingAboveY(offsetClosed(CANOPY_BEAM.pts, 28), 250),
  dw: 9,
  w: 0.58,
};

// ─── Side-window mullions ────────────────────────────────────────────────────
// The greenhouse dividers. Per side: a DIAGONAL from the screen top, parallel
// to the chamfer ~87px outside it (scan (445,40)/(346,100)/(187,200)), landing
// mid-run on a straight CONNECTOR that goes screen edge → waist junction
// (through the measured T-vertex (132,215), exiting the edge at y≈151). The
// hull between diagonal and chamfer is the wide mullion FACE the reference
// shows between the corner pane and the glass.

export const CONN_L: CockpitBeam = { pts: [[-30, 150], [205, 245]] as Pt[], dw: 16, w: 0.7 };
export const CONN_R: CockpitBeam = { pts: [[1950, 150], [1715, 245]] as Pt[], dw: 16, w: 0.7 };
export const DIAG_L: CockpitBeam = { pts: [[558, -30], [132, 215]] as Pt[], dw: 12, w: 0.55 };
export const DIAG_R: CockpitBeam = { pts: [[1362, -30], [1788, 215]] as Pt[], dw: 12, w: 0.55 };

const MULLION_BEAMS: ReadonlyArray<CockpitBeam> = [CONN_L, CONN_R, DIAG_L, DIAG_R];

// ─── The deck wrap ───────────────────────────────────────────────────────────
// THE integration move: the sill does not stop at its corners — the deck's
// top edge continues past them and sweeps DOWN the flanks toward the screen
// edges (measured: (480,822)→(220,878)→(30,922)), and a second lamination
// converges beneath it into the screen housing. This perspective wrap is what
// reads as one hull instead of stacked stripes.

/** Flank wraps of the sill line, each ending INSIDE the canopy's sill-corner
 *  band (the deck top edge between the corners IS the ring's sill segment). */
const WRAP_L_RAW: RawPt[] = [
  [-10, 928],
  [100, 906, 60],
  [220, 878, 120],
  [340, 844, 160],
  [413, 826],
];
const WRAP_R_RAW: RawPt[] = [
  [1507, 826],
  [1580, 844, 160],
  [1700, 878, 120],
  [1820, 906, 60],
  [1930, 928],
];
/** Mid lamination: screen edge down-left/right, merging into the housing. */
const MID_L_RAW: RawPt[] = [
  [-10, 1012],
  [100, 986, 80],
  [180, 960, 100],
  [300, 934, 120],
  [680, 930],
];
const MID_R_RAW: RawPt[] = [
  [1240, 930],
  [1620, 934, 120],
  [1740, 960, 100],
  [1820, 986, 80],
  [1930, 1012],
];
export const WRAP_BEAMS: ReadonlyArray<CockpitBeam> = [
  { pts: resolveCorners(WRAP_L_RAW), dw: 14, w: 0.75 },
  { pts: resolveCorners(WRAP_R_RAW), dw: 14, w: 0.75 },
  { pts: resolveCorners(MID_L_RAW), dw: 10, w: 0.6 },
  { pts: resolveCorners(MID_R_RAW), dw: 10, w: 0.6 },
];

// ─── The console ─────────────────────────────────────────────────────────────
// Measured: deck band face y 826→887, screen housing shoulders at (700,887)/
// (1220,887) with ~45° slopes to the frame bottom, the recess a closed
// trapezoid with its bottom lip at y≈1030, CTA row at y≈940.

const HOUSING_RAW: RawPt[] = [
  [553, 1090],
  [700, 887, 60],
  [1220, 887, 60],
  [1367, 1090],
];
export const HOUSING_BEAM: CockpitBeam = { pts: resolveCorners(HOUSING_RAW), dw: 22, w: 0.85 };

// ─── Grooves: seams, inset panels, the screen recess ─────────────────────────
// Narrow beams (~6-8 design px) the shader renders as dark channels between
// faint amber edges. Every groove either exits the frame or lands inside
// another member's band — no floating ends.

const GROOVES: ReadonlyArray<CockpitBeam> = [
  // Dash plates — the reference's bottom-left plate CARRIES the telemetry
  // readout (the DOM prints bare text inside this etch), the right one seats
  // the finale ledger. Tilted with the wrap perspective.
  { pts: resolveCorners([[115, 975], [445, 955, 22], [460, 1025, 22], [130, 1048, 22]], true), dw: 6, w: 0.35, closed: true },
  { pts: resolveCorners([[1475, 955], [1805, 975, 22], [1790, 1048, 22], [1460, 1025, 22]], true), dw: 6, w: 0.35, closed: true },
  // Screen recess — the closed trapezoid the CTA readout floats in.
  { pts: resolveCorners([[640, 1030, 24], [706, 898, 36], [1214, 898, 36], [1280, 1030, 24]], true), dw: 7, w: 0.45, closed: true },
];

export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  CANOPY_BEAM,
  CANOPY_INNER_LIP,
  CANOPY_OUTER_TRIM,
  ...MULLION_BEAMS,
  ...WRAP_BEAMS,
  HOUSING_BEAM,
  ...GROOVES,
];

// ─── Junction glints ─────────────────────────────────────────────────────────
// Hot white-gold sparks where members meet. Positions sit ON the centrelines
// at their junctions.

export const COCKPIT_GLINTS: ReadonlyArray<CockpitGlint> = [
  // Canopy top corners.
  { x: 525, y: 60, r: 22, i: 0.9 },
  { x: 1395, y: 60, r: 22, i: 0.9 },
  // Waists (the widest vertices).
  { x: 221, y: 262, r: 24, i: 0.85 },
  { x: 1699, y: 262, r: 24, i: 0.85 },
  // Sill corners (side ↔ sill ↔ wrap).
  { x: 413, y: 826, r: 20, i: 0.8 },
  { x: 1507, y: 826, r: 20, i: 0.8 },
  // Screen housing shoulders (deck ↔ housing ↔ mid wrap).
  { x: 700, y: 887, r: 18, i: 0.75 },
  { x: 1220, y: 887, r: 18, i: 0.75 },
  // Mullion T-vertices (diagonal ↔ connector).
  { x: 132, y: 215, r: 14, i: 0.6 },
  { x: 1788, y: 215, r: 14, i: 0.6 },
];

// ─── The hull mass ───────────────────────────────────────────────────────────
// ONE opaque shell with the glass as HOLES (even-odd) — occlusion is what
// turns floating trim into a ship. Five panes: the central gem plus, per
// side, the upper CORNER pane and the tall FLANK pane. Every hole edge sits
// ON a member's centreline so the metal band overlaps it — no naked seams.
// The corner and flank holes stay a few px clear of the shared connector
// centreline so even-odd never XORs an overlap back to solid.

// Oversized so every hole stays strictly inside it (THREE.Shape holes must
// not touch or cross the outer contour).
export const HULL_OUTER: ReadonlyArray<Pt> = [
  [-60, -60],
  [1980, -60],
  [1980, 1140],
  [-60, 1140],
];
/** The central glass hole — the canopy ring's resolved centreline. */
export const HULL_HOLE: ReadonlyArray<Pt> = CANOPY_BEAM.pts;
/** Upper corner panes: screen edges + the diagonal + the connector. */
const HOLE_CORNER_L: ReadonlyArray<Pt> = resolveCorners(
  [
    [-30, 146],
    [-30, -40],
    [575, -40],
    [132, 212, 36],
  ],
  true,
);
const HOLE_CORNER_R: ReadonlyArray<Pt> = resolveCorners(
  [
    [1950, 146],
    [1950, -40],
    [1345, -40],
    [1788, 212, 36],
  ],
  true,
);
/** Tall flank panes: connector top, pillar (ring centreline) inboard, the
 *  deck wrap below, the screen edge outboard. */
const HOLE_FLANK_L: ReadonlyArray<Pt> = resolveCorners(
  [
    [-30, 154],
    [221, 262, 54],
    [413, 826, 80],
    [340, 844, 120],
    [220, 878, 120],
    [100, 906, 60],
    [-30, 928],
  ],
  true,
);
const HOLE_FLANK_R: ReadonlyArray<Pt> = resolveCorners(
  [
    [1950, 154],
    [1699, 262, 54],
    [1507, 826, 80],
    [1580, 844, 120],
    [1700, 878, 120],
    [1820, 906, 60],
    [1950, 928],
  ],
  true,
);
/** Every glass pane, in one list — what both renderers punch out of the hull. */
export const HULL_HOLES: ReadonlyArray<ReadonlyArray<Pt>> = [
  HULL_HOLE,
  HOLE_CORNER_L,
  HOLE_CORNER_R,
  HOLE_FLANK_L,
  HOLE_FLANK_R,
];
/** The SIDE panes only — they get a smoked-glass tint (the reference's side
 *  windows sit visibly darker than the central view; angled, thicker glass). */
export const SIDE_PANES: ReadonlyArray<ReadonlyArray<Pt>> = [
  HOLE_CORNER_L,
  HOLE_CORNER_R,
  HOLE_FLANK_L,
  HOLE_FLANK_R,
];

/** The recessed console SCREEN — the dark display glass the CTA readout sits
 *  on (its own surface under the recess groove, slightly warmer than the hull
 *  so it reads as a powered display). */
export const PANEL_SCREEN: ReadonlyArray<Pt> = resolveCorners(
  [
    [646, 1024, 20],
    [710, 904, 32],
    [1210, 904, 32],
    [1274, 1024, 20],
  ],
  true,
);
