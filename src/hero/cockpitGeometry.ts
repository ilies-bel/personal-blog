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
// THE INTEGRATION below the waist is the sill-corner FAN (measured with the
// dense blueprint-scan --rows/--cols ridge scans): the wrap crease rises
// (10,990)→(453,835) and hands off through the fillet's outer edge to the
// ring's own sill hairline (which runs DIM between the corners), the
// undersill crease passes beneath the corner into the console housing, and
// the pillar flare peels off the band at the fillet start and sweeps
// down-left. Nothing terminates in the open; every groove ends inside
// another member's band.

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
  /** Optional PER-SIDE widths for asymmetric members (the Y-merge arms): the
   *  extruder offsets each side by half of its own function — dwPlusAt for
   *  the +normal side, dwMinusAt for −normal, where normal = (−dy, dx) of
   *  the local direction. Both default to dwAt/dw (symmetric). */
  dwPlusAt?: (x: number, y: number) => number;
  dwMinusAt?: (x: number, y: number) => number;
  /** Optional PER-SIDE facing weight (same sides as dwPlusAt/dwMinusAt).
   *  The beam shader maps w linearly to edge energy (0.45 + 0.55w), so a
   *  NEGATIVE weight fades a hairline out entirely — how an arm edge dies
   *  into a junction without a bloom bridge. Defaults to w. */
  wPlusAt?: (x: number, y: number) => number;
  wMinusAt?: (x: number, y: number) => number;
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

/** The sill's hull-side hairline is the DIM one in the reference (≈0.3× the
 *  window side) between the corners — the strong line at each corner belongs
 *  to the wrap crease handing off through the fillet. The ramps keep the
 *  fillet curves themselves at full strength; the ring winds clockwise, so
 *  the −normal side is the hull side everywhere. */
function canopyOuterW(x: number, y: number): number {
  const c01 = (v: number) => Math.min(1, Math.max(0, v));
  // At the Y-crotch the arm and ring are one casting. The arm's lower edge is
  // the exposed hull contour; the ring's outer edge is internal to that union
  // and must disappear until it emerges again as the pillar edge. Leaving it
  // lit draws the tell-tale third diagonal through the junction.
  const side = c01((350 - Math.min(x, COCKPIT_W - x)) / 90);
  const yMerge = c01((y - 252) / 28) * (1 - c01((y - 342) / 34));
  if (side * yMerge > 0) return 1 - 1.9 * side * yMerge;
  if (y < 795) return 1;
  const t = c01((x - 500) / 45) * c01((1420 - x) / 45) * c01((y - 795) / 20);
  return 1 - 1.28 * t;
}

export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(RING_RAW, true),
  dw: 26,
  w: 1,
  closed: true,
  dwAt: canopyDW,
  wMinusAt: canopyOuterW,
};

// ─── The side arms (the Y-merge) ─────────────────────────────────────────────
// Per side, ONE wide arm from the screen edge into the ring's waist fillet —
// the members the reference merges "into one shape". Built from the two
// MEASURED edge lines, not a centreline+width: upper edge through
// (30,124)/(140,225)/the crotch (176,255); lower edge through
// (30,209)/(140,302). They converge toward a far apex (≈1385px away) — the
// reference's imperceptible full-length wedge (~1° per edge), so NO width
// change ever kinks a hairline in the open. The LOWER edge runs dead
// straight until the ring band's outer hairline covers it; the UPPER edge
// runs dead straight through the crotch, then an asymmetric chisel — hidden
// entirely inside the ring band's footprint, which paints over it — drops it
// to the buried tip. The joins are invisible because nothing visible ever
// bends: every deviation happens under the band drawn later.

// JOIN GRAMMAR: an open member never shows its ribbon cap and never crosses
// another lit hairline. A terminating hairline either merges tangentially
// under overlapping glow or FADES OUT before contact (per-side weights), and
// the fill tip ends buried inside a band painted LATER, which erases it.
// Width changes happen only where both hairlines are already dark.

function buildArm(mirrored: boolean): CockpitBeam {
  // Bisector centreline of the two measured edge lines, arc-parameterised
  // from the screen-edge start.
  const DIR: Pt = [0.75, 0.6612];
  const S: Pt = [-40, 105];
  const FADE_S = 228; // upper hairline starts dying here …
  const CHISEL_S = 273.2; // … and its chisel starts here (past the crotch)
  const END_S = 330; // buried tip — its whole cap sits inside the ring band
  const sAt = (x: number, y: number): number => {
    const px = mirrored ? 1920 - x : x;
    return (px - S[0]) * DIR[0] + (y - S[1]) * DIR[1];
  };
  // Half-width of the wedge: 28.42 at the crotch's arc, shrinking 0.0205/px.
  const wedge = (s: number): number => 28.42 - 0.0205 * (s - 261.2);
  const upper = (x: number, y: number): number => {
    const s = sAt(x, y);
    const chisel = s > CHISEL_S ? 28.2 - 0.426 * (s - CHISEL_S) : Infinity;
    return 2 * Math.max(3.5, Math.min(wedge(s), chisel));
  };
  const lower = (x: number, y: number): number => 2 * wedge(sAt(x, y));
  // The upper hairline FADES over its last ~45px: it converges with the ring
  // band's outer hairline at a shallow angle, and two full-brightness lines
  // that close slowly bridge under bloom into a fat dash. The ref's crotch is
  // soft for the same reason. (Negative w = full fade; the fill stays.)
  const upperW = (x: number, y: number): number => {
    const s = sAt(x, y);
    return 0.7 - 1.35 * Math.min(1, Math.max(0, (s - FADE_S) / (CHISEL_S - FADE_S)));
  };
  const P = (s: number): Pt => {
    const x = S[0] + DIR[0] * s;
    return [mirrored ? 1920 - x : x, S[1] + DIR[1] * s];
  };
  return {
    // Vertices at every profile break — aDW/aW interpolate linearly between
    // authored points, and all side profiles are piecewise-linear in arc.
    pts: [P(0), P(FADE_S), P(CHISEL_S), P(END_S)],
    dw: 57,
    w: 0.7,
    // +normal = (−dy,dx) points to the lower edge on the left arm and to the
    // upper edge on the mirrored right arm.
    dwPlusAt: mirrored ? upper : lower,
    dwMinusAt: mirrored ? lower : upper,
    wPlusAt: mirrored ? upperW : undefined,
    wMinusAt: mirrored ? undefined : upperW,
  };
}

export const ARM_L: CockpitBeam = buildArm(false);
export const ARM_R: CockpitBeam = buildArm(true);

const ARM_BEAMS: ReadonlyArray<CockpitBeam> = [ARM_L, ARM_R];

// ─── The deck wrap (the sill-corner fan) ─────────────────────────────────────
// Re-measured off reference-v3 with the dense ridge scans. Each lower corner
// is a FAN of three creases, and NOTHING terminates in the open:
//   1. THE WRAP: a 15px band whose STRONG upper hairline IS the hull crease
//      rising (10,990)→(453,835); it flows tangentially into the sill
//      fillet's outer edge and hands off to the ring's own outer hairline
//      (which carries the line on along the sill). Its dim lower hairline is
//      the measured partner line that vanishes near x≈300.
//   2. THE UNDERSILL CREASE: a single lit line fading in past the dash
//      plates, passing UNDER the corner ((250,954)→(440,929)→(620,916)) and
//      dying into the console housing — what makes the corner read as
//      overlapping hull plates.
//   3. THE PILLAR FLARE: the pillar's hull-side hairline peels off the band
//      at the fillet start (≈(436,792)) and sweeps down-left as a 11px band,
//      dim hairline over strong ((380,795)→(170,834)→(20,868)).

/** Centreline for a band hung on a measured ridge: offset every vertex half a
 *  width along the averaged segment normal so ONE hairline edge sits exactly
 *  on the reference crease. sign +1 hangs the band on the +normal side
 *  (below-right for a left-to-right rising run), −1 on the −normal side. */
function bandOnRidge(ridge: ReadonlyArray<Pt>, dw: number, sign: 1 | -1): Pt[] {
  return ridge.map(([x, y], i) => {
    const [x0, y0] = ridge[Math.max(0, i - 1)];
    const [x1, y1] = ridge[Math.min(ridge.length - 1, i + 1)];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    return [x + (-(y1 - y0) / l) * sign * (dw / 2), y + ((x1 - x0) / l) * sign * (dw / 2)];
  });
}

const mirrorPts = (pts: ReadonlyArray<Pt>): Pt[] => pts.map(([x, y]) => [1920 - x, y]);

/** Linear weight ramp keyed on the UNMIRRORED design x — every fade below is
 *  authored once and mirrors for free. */
const rampW = (x0: number, x1: number, w0: number, w1: number, mirrored: boolean) => {
  return (x: number, _y: number): number => {
    const px = mirrored ? 1920 - x : x;
    return w0 + (w1 - w0) * Math.min(1, Math.max(0, (px - x0) / (x1 - x0)));
  };
};

function buildWrap(mirrored: boolean): CockpitBeam {
  // The measured crease ridge. The tail past the kiss (x≈453) rides flat at
  // y≈835 while the ring band's outer edge dives to ≈846, so the whole tip
  // sits INSIDE the band footprint and the ring (painted last) erases it.
  const RIDGE: Pt[] = [
    [-10, 999], [79, 960], [156, 930], [242, 900], [320, 875],
    [380, 855], [415, 845], [437, 840], [453, 835], [470, 835], [505, 835],
  ];
  const DW = 15;
  const pts = bandOnRidge(RIDGE, DW, 1); // band hangs below the crease
  // The crease stays full-strength to the fillet kiss, then dies while its
  // glow overlaps the ring's outer hairline — the handoff reads continuous.
  const upperW = rampW(440, 472, 0.7, -0.8, mirrored);
  // The dim partner line vanishes near x≈300, exactly as measured.
  const lowerW = rampW(262, 304, -0.3, -1.0, mirrored);
  // The fill collapses onto the ridge well BEFORE the fillet kiss — through
  // the corner there is no room for any band skirt below the crease (the
  // reference's crease and fillet edge coincide), and the lower hairline is
  // already dark past x≈304, so the width change is invisible.
  const lowerDW = (x: number, _y: number): number => {
    const px = mirrored ? 1920 - x : x;
    return px < 400 ? DW : DW - 14 * Math.min(1, (px - 400) / 50);
  };
  return {
    pts: mirrored ? mirrorPts(pts) : pts,
    dw: DW,
    w: 0.7,
    // The left build runs left→right, so +normal points BELOW the ridge; the
    // mirrored build runs right→left, which swaps the sides.
    dwPlusAt: mirrored ? undefined : lowerDW,
    dwMinusAt: mirrored ? lowerDW : undefined,
    wPlusAt: mirrored ? upperW : lowerW,
    wMinusAt: mirrored ? lowerW : upperW,
  };
}

function buildCrease(mirrored: boolean): CockpitBeam {
  // Single lit line passing UNDER the sill corner; it enters from off-screen
  // and the inner tip fades before it buries inside the housing band.
  const RIDGE: Pt[] = [
    [-10, 1024], [80, 997], [170, 975], [250, 954], [340, 939], [440, 929],
    [520, 921], [620, 916], [660, 914], [690, 914],
  ];
  const pts = bandOnRidge(RIDGE, 6, 1);
  const litW = (x: number, _y: number): number => {
    const px = mirrored ? 1920 - x : x;
    const on = Math.min(1, Math.max(0, (px + 12) / 85));
    const off = Math.min(1, Math.max(0, (px - 648) / 38));
    return -1 + 1.9 * on * (1 - off);
  };
  const dark = (_x: number, _y: number): number => -1;
  return {
    pts: mirrored ? mirrorPts(pts) : pts,
    dw: 6,
    w: 0.55,
    wPlusAt: mirrored ? litW : dark,
    wMinusAt: mirrored ? dark : litW,
  };
}

function buildFlare(mirrored: boolean): CockpitBeam {
  // The pillar's hull-side hairline leaves the band at the fillet start and
  // sweeps down-left: STRONG lower hairline on the measured ridge, dim upper
  // partner 11px above. The tip fades before the ring's outer hairline and
  // buries inside the band at the fillet start.
  const RIDGE: Pt[] = [
    [-10, 875], [20, 868], [90, 852], [170, 834], [250, 818],
    [340, 802], [380, 795], [400, 792], [434, 792],
  ];
  const pts = bandOnRidge(RIDGE, 11, -1); // band sits ABOVE the strong ridge
  const strongW = rampW(400, 430, 0.62, -0.8, mirrored);
  const dimW = rampW(400, 430, -0.2, -0.9, mirrored);
  return {
    pts: mirrored ? mirrorPts(pts) : pts,
    dw: 11,
    w: 0.3,
    wPlusAt: mirrored ? dimW : strongW,
    wMinusAt: mirrored ? strongW : dimW,
  };
}

export const WRAP_BEAMS: ReadonlyArray<CockpitBeam> = [
  buildWrap(false),
  buildWrap(true),
  buildCrease(false),
  buildCrease(true),
  buildFlare(false),
  buildFlare(true),
];

// A short upper fork completes the reference's lower-corner fan. It leaves
// the shallow inset facet, converges with the rising wrap around x≈300, then
// disappears inside that later-painted band. Both tips fade before their caps
// so the branch reads as an etched handoff, never a floating stroke.
function buildDeckFork(mirrored: boolean): CockpitBeam {
  const pts: Pt[] = [[105, 908], [155, 900], [220, 891], [280, 883], [325, 873]];
  const litW = (x: number, _y: number): number => {
    const px = mirrored ? COCKPIT_W - x : x;
    const on = Math.min(1, Math.max(0, (px - 105) / 45));
    const off = Math.min(1, Math.max(0, (px - 285) / 36));
    return -1 + 1.72 * on * (1 - off);
  };
  return {
    pts: mirrored ? mirrorPts(pts) : pts,
    dw: 5,
    w: 0.35,
    wPlusAt: litW,
    wMinusAt: litW,
  };
}

const DECK_FORK_BEAMS: ReadonlyArray<CockpitBeam> = [buildDeckFork(false), buildDeckFork(true)];

// ─── The console ─────────────────────────────────────────────────────────────
// Measured: deck band face y 826→878, screen housing shoulders around
// (730,872)/(1190,872) with faceted slopes below the frame, and an OPEN
// recess whose y≈911 top lip carries the CTA row (its sides continue below
// the viewport rather than closing into a card).

const HOUSING_RAW: RawPt[] = [
  [500, 1090],
  [730, 872, 74],
  [1190, 872, 74],
  [1420, 1090],
];
/** The housing's inner (+normal) hairline approaches the screen-recess groove
 *  within a pixel at both shoulder fillets. Let the recess carry that short
 *  handoff so the two lit edges cannot bloom together into a bright dash. */
function housingInnerW(x: number, y: number): number {
  const c01 = (value: number): number => Math.min(1, Math.max(0, value));
  const top = 1 - c01((y - 930) / 70);
  const shoulderDistance = Math.min(Math.abs(x - 730), Math.abs(x - 1190));
  const shoulder = 1 - c01((shoulderDistance - 20) / 90);
  return 0.85 - 1.2 * top * shoulder;
}

export const HOUSING_BEAM: CockpitBeam = {
  pts: resolveCorners(HOUSING_RAW),
  dw: 12,
  w: 0.85,
  wPlusAt: housingInnerW,
};

// ─── Grooves: seams, inset panels, the screen recess ─────────────────────────
// Narrow beams (~6-8 design px) the shader renders as dark channels between
// faint amber edges. Every groove either exits the frame or lands inside
// another member's band — no floating ends.

const GROOVES: ReadonlyArray<CockpitBeam> = [
  // Shallow inset facets on the deck. They sit ABOVE the telemetry/directory
  // readouts rather than boxing the text into card-like bezels.
  { pts: resolveCorners([[320, 923, 12], [512, 891, 16], [560, 913, 15], [372, 949, 15]], true), dw: 5, w: -0.2, closed: true },
  { pts: resolveCorners([[1600, 923, 12], [1408, 891, 16], [1360, 913, 15], [1548, 949, 15]], true), dw: 5, w: -0.2, closed: true },
  { pts: resolveCorners([[342, 922, 10], [507, 899, 13], [535, 912, 12], [374, 940, 12]], true), dw: 3, w: -0.24, closed: true },
  { pts: resolveCorners([[1578, 922, 10], [1413, 899, 13], [1385, 912, 12], [1546, 940, 12]], true), dw: 3, w: -0.24, closed: true },
  // The screen recess is OPEN at the bottom of the viewport: the reference's
  // side grooves continue below the glass instead of closing into a card.
  { pts: resolveCorners([[670, 1100], [770, 911, 38], [1150, 911, 38], [1250, 1100]]), dw: 6, w: 0.45 },
];

// PAINT ORDER = JOIN ORDER: every chisel tip tucks under a band drawn LATER
// (arms/wraps under the ring, the mid laminations under the housing), so no
// dark fill ever crosses a receiving member's hairline.
export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  ...ARM_BEAMS,
  ...DECK_FORK_BEAMS,
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
    [670, 1100],
    [776, 917, 32],
    [1144, 917, 32],
    [1250, 1100],
  ],
  true,
);
