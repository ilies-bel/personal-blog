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
// THE SHAPE (reference-v3 truth): the glass is ONE faceted GEM — a THIN flat
// top band (centreline y≈80, hairlines 73/87) spanning x≈368–1552, STRAIGHT
// chamfers at slope −1.0 dx/dy diving to the waist vertices (≈169,278)/
// (≈1751,278) under a BIG fillet, then wide pillars leaning inward-right at
// +0.52 dx/dy down to the sill corners (≈461,838)/(≈1459,838), and a nearly
// flat sill that bows UP to ≈830 at centre. The sides are SOLID HULL (the
// star test: the gem shows blue space + stars, the flanks show warm black) —
// no corner panes, no flank panes, no outer trim.
// THE Y-MERGE (the one structural flourish): per side, ONE wide arm (~64px)
// runs from the screen edge (0,≈140) at slope 0.88 dy/dx straight into the
// ring's waist fillet — its lower edge flows into the pillar's outer edge,
// the chamfer's inner edge flows into the pillar's window edge, and the arm's
// upper edge meets the chamfer's outer edge at the crotch (≈176,255). The
// ring band itself carries the merge: thin (14) across the top, ~17 down the
// chamfers, swelling to ~44 through the waist fillet, tapering to ~35 at the
// pillar foot, and back to 14 around the sill corners.
// THE INTEGRATION below the waist is unchanged: the deck wraps sweep down
// from the sill corners toward the screen edges, the mid laminations merge
// into the screen housing, and every groove ends inside another member's
// band. No floating parallels.

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
  const FILLET_SAMPLES = 14;
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

// ─── The canopy ring ─────────────────────────────────────────────────────────
// The glass opening's centreline, authored CLOSED (the hull mass derives from
// it). Measured vertices (ridge scan of reference-v3):
//   top band hairlines y73/87 (centreline 80), corners x≈368/1552
//   chamfers STRAIGHT at slope −1.0 dx/dy: (347,100)→(247,200)
//   waist vertices (169,278)/(1751,278) under a BIG fillet (apex x≈205)
//   pillars lean inward-right at +0.52 dx/dy: centres (259,450)→(420,760)
//   sill corners (461,838)/(1459,838), centre bows UP to ≈830.

const RING_RAW: RawPt[] = [
  [368, 80, 40],
  [1552, 80, 40],
  [1751, 278, 120],
  [1459, 841, 55],
  [960, 830, 420],
  [461, 841, 55],
  [169, 278, 120],
];

/** Per-point canopy width — the measured band profile: thin top (14), ~17 on
 *  the chamfers, swelling to 44 through the waist fillet (the Y-merge mass),
 *  tapering to 35 down the pillar, back to 14 around the sill corners. */
function canopyDW(_x: number, y: number): number {
  const stops: ReadonlyArray<Pt> = [[96, 14], [230, 17], [360, 46], [740, 35], [800, 14]];
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i][0]) {
      const [y0, w0] = stops[i - 1];
      const [y1, w1] = stops[i];
      return w0 + (w1 - w0) * ((y - y0) / (y1 - y0));
    }
  }
  return stops[stops.length - 1][1];
}

export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(RING_RAW, true),
  dw: 26,
  w: 1,
  closed: true,
  dwAt: canopyDW,
};

// ─── The side arms (the Y-merge) ─────────────────────────────────────────────
// Per side, ONE wide arm from the screen edge into the ring's waist fillet —
// the members the reference merges "into one shape". Measured centreline
// (left): (0,140)→(140,263.5), slope 0.88 dy/dx, band ~64px perpendicular.
// The tip runs INSIDE the swollen waist band (drawn later, so the ring's
// hairlines stay unbroken) and chisel-tapers over its last ~130px; the arm's
// lower edge then reads as flowing into the pillar's outer edge.

// JOIN GRAMMAR: an open member never shows its ribbon cap. Each terminating
// end runs INTO the receiving band's interior and TAPERS to a sliver over its
// last stretch (a chisel merge, like the reference's flowing junctions) — the
// intermediate point pins the taper local so the run keeps constant width.
const taperTo = (ex: number, ey: number, wEnd: number, wFull: number, reach: number) => {
  return (x: number, y: number): number =>
    wEnd + (wFull - wEnd) * Math.min(1, Math.hypot(x - ex, y - ey) / reach);
};

export const ARM_L: CockpitBeam = {
  // Full width until 55px from the tip: the upper hairline must reach the
  // crotch at (176,255) — the ref's V where it meets the chamfer's outer
  // edge — BEFORE the chisel pulls it down. The tip hides in the waist band.
  pts: [[-40, 105], [155, 277], [208, 323]] as Pt[],
  dw: 64,
  w: 0.7,
  dwAt: taperTo(208, 323, 26, 64, 70),
};
export const ARM_R: CockpitBeam = {
  pts: [[1960, 105], [1765, 277], [1712, 323]] as Pt[],
  dw: 64,
  w: 0.7,
  dwAt: taperTo(1712, 323, 26, 64, 70),
};

const ARM_BEAMS: ReadonlyArray<CockpitBeam> = [ARM_L, ARM_R];

// ─── The deck wrap ───────────────────────────────────────────────────────────
// THE integration move: the sill does not stop at its corners — the deck's
// top edge continues past them and sweeps DOWN the flanks toward the screen
// edges (measured: (480,822)→(220,878)→(30,922)), and a second lamination
// converges beneath it into the screen housing. This perspective wrap is what
// reads as one hull instead of stacked stripes.

/** Flank wraps of the sill line. Each end runs INTO the ring's sill-corner
 *  fillet (the r90 curve pulls the centreline ~27px inside the vertex, so the
 *  old vertex-end left the cap exposed on the hull) and chisel-tapers there. */
const WRAP_L_RAW: RawPt[] = [
  [-10, 928],
  [100, 906, 60],
  [220, 878, 120],
  [340, 844, 160],
  [468, 828],
];
const WRAP_R_RAW: RawPt[] = [
  [1452, 828],
  [1580, 844, 160],
  [1700, 878, 120],
  [1820, 906, 60],
  [1930, 928],
];
/** Mid lamination: screen edge down-left/right, chisel-merging into the
 *  housing band's interior. */
const MID_L_RAW: RawPt[] = [
  [-10, 1012],
  [100, 986, 80],
  [180, 960, 100],
  [300, 934, 120],
  [610, 931],
  [668, 930],
];
const MID_R_RAW: RawPt[] = [
  [1252, 930],
  [1310, 931],
  [1620, 934, 120],
  [1740, 960, 100],
  [1820, 986, 80],
  [1930, 1012],
];
export const WRAP_BEAMS: ReadonlyArray<CockpitBeam> = [
  { pts: resolveCorners(WRAP_L_RAW), dw: 14, w: 0.75, dwAt: taperTo(468, 828, 6, 14, 70) },
  { pts: resolveCorners(WRAP_R_RAW), dw: 14, w: 0.75, dwAt: taperTo(1452, 828, 6, 14, 70) },
  { pts: resolveCorners(MID_L_RAW), dw: 10, w: 0.6, dwAt: taperTo(668, 930, 6, 10, 50) },
  { pts: resolveCorners(MID_R_RAW), dw: 10, w: 0.6, dwAt: taperTo(1252, 930, 6, 10, 50) },
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

// PAINT ORDER = JOIN ORDER: every chisel tip tucks under a band drawn LATER
// (arms/wraps under the ring, the mid laminations under the housing), so no
// dark fill ever crosses a receiving member's hairline.
export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  ...ARM_BEAMS,
  ...WRAP_BEAMS,
  ...GROOVES,
  HOUSING_BEAM,
  CANOPY_BEAM,
];

// ─── The hull mass ───────────────────────────────────────────────────────────
// ONE opaque shell with the glass as a HOLE (even-odd) — occlusion is what
// turns floating trim into a ship. Reference-v3 has exactly ONE pane: the
// central gem (the flanks and upper corners are solid hull — the nameplate,
// nav, and dials all sit on metal). The hole edge is the ring's centreline,
// so the band overlaps the rim — no naked seams.

// Oversized so the hole stays strictly inside it (THREE.Shape holes must not
// touch or cross the outer contour).
export const HULL_OUTER: ReadonlyArray<Pt> = [
  [-60, -60],
  [1980, -60],
  [1980, 1140],
  [-60, 1140],
];
/** The central glass hole — the canopy ring's resolved centreline. */
export const HULL_HOLE: ReadonlyArray<Pt> = CANOPY_BEAM.pts;
/** Every glass pane, in one list — what both renderers punch out of the hull. */
export const HULL_HOLES: ReadonlyArray<ReadonlyArray<Pt>> = [HULL_HOLE];

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
