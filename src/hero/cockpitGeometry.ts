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
  // Normal (-ty, tx) points toward the interior for one winding and away for
  // the other; normalise via the signed area so +delta always grows.
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

// ─── The canopy ──────────────────────────────────────────────────────────────
// The windshield is an inset hexagon — flat top beam, chamfer diagonals, near
// vertical pillars, a near-flat sill — authored as ONE closed BEAM centreline.
// The beam shader extrudes the metal band around it, so the glass opening is
// the centreline inset by half the width, and the hull masses (below) abut the
// other half.

// RE-MEASURED off reference-v2.png (the generated north star): the glass is
// NARROWER and the console TALLER than the first pass — wide dark hull flanks
// carry the NAV dial and the plates, the A-pillars LEAN (top inboard, foot
// outboard), and the sill rides high so the dash claims the bottom ~30%.
// Fillets machined tight; the old huge radii read as moulded plastic.
const CANOPY_RAW: RawPt[] = [
  // Top beam (flat), rounding into each corner chamfer.
  [530, 90, 46],
  [1390, 90, 46],
  // Right chamfer down to the pillar top, pillar leaning outboard to the foot.
  [1622, 390, 70],
  [1705, 690, 56],
  // Foot chamfers inboard into the high sill (gentle centre dip).
  [1560, 748, 80],
  [960, 766, 220],
  // Left sill corner + foot + pillar + chamfer, mirrored.
  [360, 748, 80],
  [215, 690, 56],
  [298, 390, 70],
];

export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(CANOPY_RAW, true),
  dw: 34,
  w: 1,
  closed: true,
};

// ─── Hull lamination rings ───────────────────────────────────────────────────
// The reference hull is LAYERED: parallel to the main canopy band run more
// hairlines — a strong inner trim rimming the glass, then seam lines stepping
// outward across the hull plates. All derived by offsetting the canopy
// centreline, so they stay parallel through every fillet.

/** Glass-side lip: a thin bright line just inside the glass opening (roof +
 *  pillars only — the deck rail owns the sill band). */
export const CANOPY_INNER_LIP: CockpitBeam = {
  pts: clipRingAboveY(offsetClosed(CANOPY_BEAM.pts, -27), 690),
  dw: 5,
  w: 0.68,
};
/** Rotate a ring so the points BELOW yMax form one contiguous run, and return
 *  that run as an OPEN polyline — the outer hull seams wrap the roof and
 *  pillars but stop at the dash (the deck rail owns the bottom band). */
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

/** First hull lamination just outside the main band (roof + pillars). */
export const CANOPY_OUTER_TRIM: CockpitBeam = {
  pts: clipRingAboveY(offsetClosed(CANOPY_BEAM.pts, 33), 735),
  dw: 9,
  w: 0.58,
};
/** Second, fainter hull seam further out. */
export const CANOPY_OUTER_SEAM: CockpitBeam = {
  pts: clipRingAboveY(offsetClosed(CANOPY_BEAM.pts, 62), 760),
  dw: 6,
  w: 0.38,
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
  [232, 705],
  [400, 802, 90],
  [700, 812, 140],
  [960, 810, 200],
  [1220, 812, 140],
  [1520, 802, 90],
  [1688, 705],
];
export const DECK_BEAM: CockpitBeam = { pts: resolveCorners(DECK_RAW), dw: 22, w: 0.8 };

/** Screen housing — the central recessed console screen (a wide-shouldered
 *  trapezoid whose feet exit below the frame). The CTA text parks inside. */
const HOUSING_RAW: RawPt[] = [
  [640, 1090],
  [700, 856, 60],
  [1220, 856, 60],
  [1280, 1090],
];
export const HOUSING_BEAM: CockpitBeam = { pts: resolveCorners(HOUSING_RAW), dw: 24, w: 0.85 };

/** Apron rails — the console's flared base, one per flank, each flowing out
 *  of the deck rail's knee and terminating INSIDE the screen housing's band
 *  (the extra reach hides the butt cap in the housing's dark fill). */
const APRON_L_RAW: RawPt[] = [
  [400, 802],
  [470, 905, 70],
  [580, 925, 100],
  [688, 930],
];
const APRON_R_RAW: RawPt[] = [
  [1232, 930],
  [1340, 925, 100],
  [1450, 905, 70],
  [1520, 802],
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
  { pts: [[524, 82], [452, 38]] as Pt[], dw: 7, w: 0.4 },
  { pts: [[1396, 82], [1468, 38]] as Pt[], dw: 7, w: 0.4 },
  // Flank seams: pillar mid-height out to the screen flanks.
  { pts: [[240, 560], [-8, 548]] as Pt[], dw: 6, w: 0.3 },
  { pts: [[1680, 560], [1928, 548]] as Pt[], dw: 6, w: 0.3 },
  // Dash facet seams: deck-rail knees down to the bottom screen corners.
  { pts: [[400, 806], [210, 1088]] as Pt[], dw: 7, w: 0.35 },
  { pts: [[1520, 806], [1710, 1088]] as Pt[], dw: 7, w: 0.35 },
  // Console inset panels — recessed blanks on the flanking dash faces (closed
  // groove outlines, parallelogram lean following the deck/apron slopes).
  { pts: resolveCorners([[430, 845], [640, 852, 16], [628, 900, 16], [440, 884, 16]], true), dw: 6, w: 0.35, closed: true },
  { pts: resolveCorners([[1280, 852], [1490, 845, 16], [1480, 884, 16], [1292, 900, 16]], true), dw: 6, w: 0.35, closed: true },
  // Lower flank panels — the big outlined plates under the apron rails (the
  // reference dash is tiled with them). Bottom edges exit the frame.
  { pts: resolveCorners([[446, 952], [640, 968, 20], [630, 1088], [400, 1088]], true), dw: 6, w: 0.4, closed: true },
  { pts: resolveCorners([[1280, 968], [1474, 952, 20], [1520, 1088], [1290, 1088]], true), dw: 6, w: 0.4, closed: true },
  // Deck lamination — a thin line shadowing the deck rail from below, ends
  // tucked into the canopy beam's band at the pillar feet.
  { pts: resolveCorners([[240, 712], [400, 826, 80], [700, 836, 140], [960, 834, 200], [1220, 836, 140], [1520, 826, 80], [1680, 712]]), dw: 6, w: 0.42 },
  // Screen recess lip — the inner rounded outline INSIDE the housing beam,
  // the visible edge of the screen the CTA sits on.
  { pts: resolveCorners([[672, 1090], [724, 880, 44], [1196, 880, 44], [1248, 1090]]), dw: 7, w: 0.45 },
];

export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  CANOPY_BEAM,
  CANOPY_INNER_LIP,
  CANOPY_OUTER_TRIM,
  CANOPY_OUTER_SEAM,
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
  { x: 530, y: 90, r: 24, i: 0.9 },
  { x: 1390, y: 90, r: 24, i: 0.9 },
  // Chamfer ↔ pillar tops.
  { x: 1622, y: 390, r: 24, i: 0.85 },
  { x: 298, y: 390, r: 24, i: 0.85 },
  // Pillar feet.
  { x: 215, y: 690, r: 22, i: 0.8 },
  { x: 1705, y: 690, r: 22, i: 0.8 },
  // Sill corners (foot chamfer ↔ sill).
  { x: 360, y: 748, r: 20, i: 0.75 },
  { x: 1560, y: 748, r: 20, i: 0.75 },
  // Deck knees (apron take-off).
  { x: 400, y: 802, r: 18, i: 0.7 },
  { x: 1520, y: 802, r: 18, i: 0.7 },
  // Screen housing shoulders.
  { x: 700, y: 856, r: 18, i: 0.75 },
  { x: 1220, y: 856, r: 18, i: 0.75 },
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
    [1920, 390],
    [1622, 390, 70],
    [1390, 90, 46],
    [530, 90, 46],
    [298, 390, 70],
    [0, 390],
  ],
  true,
);

export const PANEL_DASH: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 390],
    [298, 390, 70],
    [215, 690, 56],
    [360, 748, 80],
    [960, 766, 220],
    [1560, 748, 80],
    [1705, 690, 56],
    [1622, 390, 70],
    [1920, 390],
    [1920, 1090],
    [0, 1090],
  ],
  true,
);

/** The recessed console SCREEN — the dark display glass the CTA readout sits
 *  on, filling the housing's recess (drawn as its own surface under the lip
 *  groove, slightly warmer than the hull so it reads as a powered display). */
export const PANEL_SCREEN: ReadonlyArray<Pt> = resolveCorners(
  [
    [676, 1090],
    [727, 883, 42],
    [1193, 883, 42],
    [1244, 1090],
  ],
  true,
);
