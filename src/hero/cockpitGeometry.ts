// The cockpit canopy's geometry — ONE source of truth consumed by BOTH renderers:
// buildCockpit.ts (the live WebGL rig) and CockpitFrame.tsx (the reduced-motion
// SVG fallback). Everything is authored in a fixed 1920×1080, y-down design
// space that each renderer stretches to the viewport, so the drawing behaves
// like a cockpit moulded to the glass.
//
// REFERENCE GRAMMAR (reference.png, the ChatGPT-generated north star): the
// structure is THICK MILLED METAL, not piping. Every member is a BEAM — a wide
// dark-metal band whose two edges carry bright amber hairlines with a dimmer
// echo line inset from each edge (the beam shader draws all of it off one
// cross-section coordinate). Hairline SEAMS split the hull masses into facets,
// junctions flare with hot glints, and the console is a real dashboard: a
// central recessed screen flanked by inset panels.
//
// Corners are ROUNDED: every authored corner carries a rounding length and is
// replaced by a sampled quadratic bézier fillet at build time, so downstream
// consumers only ever see point lists.

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
  /** Full member width, design px. */
  dw: number;
  /** Facing weight 0..1. */
  w: number;
  closed?: boolean;
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

/** Serialize a polyline to an SVG path `d` (the reduced-motion fallback). */
export function toPathD(pts: ReadonlyArray<Pt>, closed = false): string {
  const body = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return closed ? `${body} Z` : body;
}

// ─── The canopy ──────────────────────────────────────────────────────────────
// The windshield is an inset hexagon — flat top beam, chamfer diagonals, near
// vertical pillars, a near-flat sill — authored as ONE closed BEAM centreline.
// The beam shader extrudes the metal band around it, so the glass opening is
// the centreline inset by half the width, and the hull masses (below) abut the
// other half.

const CANOPY_RAW: RawPt[] = [
  // Top beam (flat), rounding into each corner chamfer.
  [478, 84, 40],
  [1442, 84, 40],
  // Right chamfer → pillar top → pillar (angles gently outward going down).
  [1676, 266, 66],
  [1776, 470, 58],
  // Right pillar foot rounds into the sill: the console is TALLER than the old
  // pass (reference: the dash claims the bottom ~26% of frame) so the sill
  // rides higher and the feet pull inboard.
  [1788, 760, 86],
  [1700, 818, 190],
  [1450, 824, 210],
  [960, 816, 460],
  // Left sill + pillar foot, mirrored.
  [470, 824, 210],
  [220, 818, 190],
  [132, 760, 86],
  // Left pillar → pillar top → chamfer back into the top beam.
  [144, 470, 58],
  [244, 266, 66],
];

export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(CANOPY_RAW, true),
  dw: 34,
  w: 1,
  closed: true,
};

// ─── The console beams ───────────────────────────────────────────────────────
// A real dashboard (the reference's bottom band): the deck rail crowns the
// dash, the apron rails flare down its flanks and TERMINATE on the screen
// housing, and the housing itself is the widest member on screen — the
// recessed console screen the CTA readout lives in.

/** Deck rail — out of each pillar foot, dipping to the console shoulders,
 *  flat across the centre. The dash's horizon line. Ends overshoot the canopy
 *  centreline so the butt caps hide INSIDE the canopy beam's dark band. */
const DECK_RAW: RawPt[] = [
  [208, 813],
  [330, 868, 80],
  [700, 878, 140],
  [960, 876, 200],
  [1220, 878, 140],
  [1590, 868, 80],
  [1712, 813],
];
export const DECK_BEAM: CockpitBeam = { pts: resolveCorners(DECK_RAW), dw: 22, w: 0.8 };

/** Screen housing — the central recessed console screen (a wide-shouldered
 *  trapezoid whose feet exit below the frame). The CTA text parks inside. */
const HOUSING_RAW: RawPt[] = [
  [640, 1090],
  [700, 926, 60],
  [1220, 926, 60],
  [1280, 1090],
];
export const HOUSING_BEAM: CockpitBeam = { pts: resolveCorners(HOUSING_RAW), dw: 24, w: 0.85 };

/** Apron rails — the console's flared base, one per flank, each flowing out
 *  of the deck rail's knee and terminating INSIDE the screen housing's band
 *  (the housing slope crosses y996 at x≈674/1246; the extra reach hides the
 *  butt cap in the housing's dark fill). */
const APRON_L_RAW: RawPt[] = [
  [330, 868],
  [430, 972, 80],
  [560, 992, 120],
  [688, 997],
];
const APRON_R_RAW: RawPt[] = [
  [1232, 997],
  [1360, 992, 120],
  [1490, 972, 80],
  [1590, 868],
];
export const APRON_BEAMS: ReadonlyArray<CockpitBeam> = [
  { pts: resolveCorners(APRON_L_RAW), dw: 16, w: 0.7 },
  { pts: resolveCorners(APRON_R_RAW), dw: 16, w: 0.7 },
];

// ─── Grooves: facet seams, inset panels, the screen recess lip ──────────────
// The hull masses read as FACETED metal because seams split them into plates
// (the reference's roof triangles and dash facets), and the flat dash faces
// carry recessed blank panels the way real consoles do. Every seam is a narrow
// GROOVE — the same beam material at ~7 design px, which the shader renders as
// a dark channel between two faint amber edge lines. Every groove either exits
// the frame edge or lands inside a beam's band — no floating ends.

const GROOVES: ReadonlyArray<CockpitBeam> = [
  // Roof facet seams: short corner cuts off the canopy's top corners. They
  // STOP well before the DOM plates (nameplate top-left, site nav top-right)
  // — a full run to the screen edge sliced straight through both.
  { pts: [[460, 66], [388, 22]] as Pt[], dw: 7, w: 0.4 },
  { pts: [[1460, 66], [1532, 22]] as Pt[], dw: 7, w: 0.4 },
  // Flank seams: pillar mid-height out to the screen flanks.
  { pts: [[150, 560], [-8, 548]] as Pt[], dw: 6, w: 0.3 },
  { pts: [[1770, 560], [1928, 548]] as Pt[], dw: 6, w: 0.3 },
  // Dash facet seams: deck-rail knees down to the bottom screen corners.
  { pts: [[330, 872], [180, 1088]] as Pt[], dw: 7, w: 0.35 },
  { pts: [[1590, 872], [1740, 1088]] as Pt[], dw: 7, w: 0.35 },
  // Console inset panels — recessed blanks on the flanking dash faces (closed
  // groove outlines, parallelogram lean following the deck/apron slopes).
  { pts: resolveCorners([[368, 912], [600, 922, 16], [582, 972, 16], [378, 950, 16]], true), dw: 6, w: 0.35, closed: true },
  { pts: resolveCorners([[1320, 922], [1552, 912, 16], [1542, 950, 16], [1338, 972, 16]], true), dw: 6, w: 0.35, closed: true },
  // Screen recess lip — the inner rounded outline INSIDE the housing beam,
  // the visible edge of the screen the CTA sits on.
  { pts: resolveCorners([[672, 1090], [724, 950, 44], [1196, 950, 44], [1248, 1090]]), dw: 7, w: 0.45 },
];

export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  CANOPY_BEAM,
  DECK_BEAM,
  HOUSING_BEAM,
  ...APRON_BEAMS,
  ...GROOVES,
];

// ─── Junction glints ─────────────────────────────────────────────────────────
// Hot white-gold sparks where members meet — the reference flares every major
// corner. Positions sit ON the beam centrelines at their junctions.

export const COCKPIT_GLINTS: ReadonlyArray<CockpitGlint> = [
  // Canopy top corners (chamfer ↔ top beam).
  { x: 478, y: 84, r: 26, i: 1.0 },
  { x: 1442, y: 84, r: 26, i: 1.0 },
  // Chamfer ↔ pillar tops.
  { x: 1776, y: 470, r: 24, i: 0.85 },
  { x: 144, y: 470, r: 24, i: 0.85 },
  // Pillar feet ↔ sill.
  { x: 132, y: 760, r: 22, i: 0.8 },
  { x: 1788, y: 760, r: 22, i: 0.8 },
  // Deck rail ↔ pillar feet.
  { x: 220, y: 818, r: 20, i: 0.75 },
  { x: 1700, y: 818, r: 20, i: 0.75 },
  // Deck knees (apron take-off).
  { x: 330, y: 868, r: 18, i: 0.7 },
  { x: 1590, y: 868, r: 18, i: 0.7 },
  // Screen housing shoulders.
  { x: 700, y: 926, r: 18, i: 0.75 },
  { x: 1220, y: 926, r: 18, i: 0.75 },
];

// ─── The interior masses ─────────────────────────────────────────────────────
// Ceiling band and dashboard: the opaque structure that turns floating lines
// into a ship (the scene stays visible only through glass). Their glass-side
// contours trace the canopy beam's centreline — the beam's inner half overlaps
// them, so the metal band and the mass meet without a gap.

export const PANEL_CEILING: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 0],
    [1920, 0],
    [1920, 470],
    [1776, 470, 58],
    [1676, 266, 66],
    [1442, 84, 40],
    [478, 84, 40],
    [244, 266, 66],
    [144, 470, 58],
    [0, 470],
  ],
  true,
);

export const PANEL_DASH: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 470],
    [132, 760, 160],
    [220, 818, 190],
    [470, 824, 210],
    [960, 816, 460],
    [1450, 824, 210],
    [1700, 818, 190],
    [1788, 760, 160],
    [1920, 470],
    [1920, 1090],
    [0, 1090],
  ],
  true,
);
