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
// THE SHAPE (Space-Sim UI Design.png truth): a long, straight faceted roof
// shoulder narrows to x≈525…1391 at y≈60, turns through a compact Y joint,
// then drops as a near-vertical three-line pillar stack to the shallow sill at
// y≈833. The lower deck is a pair of crossing plate fans feeding a raised
// central console; it is deliberately angular, never a panoramic rounded
// opening. The sides are SOLID HULL — the central pane is the only glass.
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
   *  into a junction without a stacked-line hotspot. Defaults to w. */
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
// it). Measured vertices (ridge scan of Space-Sim UI Design.png):
//   top band hairlines y73/87 (centreline 80), corners x≈368/1552
//   chamfers STRAIGHT at slope −1.0 dx/dy: (347,100)→(247,200)
//   waist vertices (169,278)/(1751,278) under a BIG fillet (apex x≈205)
//   pillars lean inward-right at +0.52 dx/dy: centres (259,450)→(420,760)
//   sill corners (461,838)/(1459,838), centre bows UP to ≈830.

const RING_RAW: RawPt[] = [
  // The tiny top radii are intentional: the reference keeps the roof
  // shoulders straight almost to y=60, then facets hard into the diagonal.
  [519, 60, 6],
  [1397, 60, 6],
  // One compact turning vertex per Y-joint. The former two-point dogleg
  // kicked outward at y≈250 and snapped back by y≈280, producing an S-bulb.
  // This measured 30-unit fillet matches the reference ridge at every scan
  // row from y190 through y320 while preserving the straight roof/pillar runs.
  [1712, 242, 30],
  [1531, 760, 22],
  [1434, 835, 28],
  [960, 833, 72],
  [483, 835, 28],
  [384, 760, 22],
  [203, 242, 30],
];

/** Per-point canopy width — the measured band profile: thin top (14), ~17 on
 *  the chamfers, swelling to 44 through the waist fillet (the Y-merge mass),
 *  tapering to 35 down the pillar, back to 14 around the sill corners. */
function canopyDW(_x: number, y: number): number {
  const stops: ReadonlyArray<Pt> = [[60, 34], [220, 38], [700, 38], [760, 54], [810, 62], [835, 30]];
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

/** At the Y the hull-side companion is physically swallowed by the incoming
 * arm, so only the arm ridge and ring core remain visible. Restore that outer
 * lamination immediately below the merge, where the reference resolves the
 * normal three-line pillar stack again from y≈260 onward. */
function canopyOuterW(x: number, y: number): number {
  const side = Math.min(x, COCKPIT_W - x);
  if (side > 320 || y >= 260) return 0.85;
  const restore = Math.min(1, Math.max(0, (y - 250) / 10));
  return -0.7 + 1.55 * restore;
}

/** The sill's hull-side hairline is the DIM one in the reference (≈0.3× the
 *  window side) between the corners — the strong line at each corner belongs
 *  to the wrap crease handing off through the fillet. The ramps keep the
 *  fillet curves themselves at full strength; the ring winds clockwise, so
 *  the −normal side is the hull side everywhere. */
export const CANOPY_BEAM: CockpitBeam = {
  pts: resolveCorners(RING_RAW, true),
  dw: 38,
  w: 0.2,
  closed: true,
  dwAt: canopyDW,
  // The inner companion is deliberately quieter than the hull-side line,
  // matching the measured 73/131/19 ridge energy around y=500.
  wPlusAt: () => -0.1,
  wMinusAt: canopyOuterW,
};

/** Bright centre lamination. At 4 design px its two shader edges resolve as a
 * single crisp stripe; the broad CANOPY_BEAM supplies the two dim companions. */
export const CANOPY_CORE: CockpitBeam = {
  pts: CANOPY_BEAM.pts,
  dw: 4,
  w: 1,
  closed: true,
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
// under the receiving band or FADES OUT before contact (per-side weights), and
// the fill tip ends buried inside a band painted LATER, which erases it.
// Width changes happen only where both hairlines are already dark.

const mirrorPts = (pts: ReadonlyArray<Pt>): Pt[] => pts.map(([x, y]) => [COCKPIT_W - x, y]);
const mirrorBeam = (beam: CockpitBeam): CockpitBeam => ({ ...beam, pts: mirrorPts(beam.pts) });

// The incoming arm is independent from the ring: it keeps the measured
// x≈187/y≈250 ridge, then continues straight just far enough to bury its cap
// inside the ring band. Its bright core fades through that buried tail.
const ARM_PATH: ReadonlyArray<Pt> = [[-30, 158], [70, 200], [187, 250], [216, 262]];
export const ARM_L: CockpitBeam = { pts: ARM_PATH, dw: 32, w: 0.12 };
export const ARM_R: CockpitBeam = mirrorBeam(ARM_L);
const armCoreW = (x: number): number => {
  const px = Math.min(x, COCKPIT_W - x);
  const t = Math.min(1, Math.max(0, (px - 184) / 28));
  return 1 - 2 * t;
};
const ARM_CORE_L: CockpitBeam = {
  pts: ARM_PATH,
  dw: 4,
  w: 1,
  wPlusAt: armCoreW,
  wMinusAt: armCoreW,
};
const ARM_CORE_R: CockpitBeam = mirrorBeam(ARM_CORE_L);

const ARM_BEAMS: ReadonlyArray<CockpitBeam> = [ARM_L, ARM_R, ARM_CORE_L, ARM_CORE_R];

// ─── The deck wrap (the sill-corner fan) ─────────────────────────────────────
// New-reference lower-corner fan. Each ridge is sampled from the 1920×1080
// scan; mirrored copies preserve the reference's bilateral cockpit mould.
const FLARE_UP_L: CockpitBeam = {
  pts: [[-20, 906], [104, 880], [248, 850], [341, 790], [384, 760]],
  dw: 18,
  w: -0.08,
};
const FLARE_DOWN_L: CockpitBeam = {
  pts: [[-20, 983], [128, 940], [231, 910], [324, 880], [445, 850], [483, 835]],
  dw: 18,
  w: -0.02,
};
const DECK_TOP_L: CockpitBeam = {
  pts: [[-20, 902], [248, 850], [445, 850], [658, 850], [705, 880]],
  dw: 16,
  w: 0.04,
};
const DECK_LOWER_L: CockpitBeam = {
  pts: [[-20, 982], [128, 940], [231, 910], [570, 940], [611, 1020]],
  dw: 12,
  w: -0.08,
};
const deckCore = (beam: CockpitBeam, w: number, fade?: [number, number]): CockpitBeam => ({
  pts: beam.pts,
  dw: 4,
  w,
  closed: beam.closed,
  ...(fade ? {
    wPlusAt: (x: number): number => {
      const px = Math.min(x, COCKPIT_W - x);
      const t = Math.min(1, Math.max(0, (px - fade[0]) / (fade[1] - fade[0])));
      return w + (-1 - w) * t;
    },
    wMinusAt: (x: number): number => {
      const px = Math.min(x, COCKPIT_W - x);
      const t = Math.min(1, Math.max(0, (px - fade[0]) / (fade[1] - fade[0])));
      return w + (-1 - w) * t;
    },
  } : {}),
});
const FLARE_UP_CORE_L = deckCore(FLARE_UP_L, 0.88, [355, 380]);
const FLARE_DOWN_CORE_L = deckCore(FLARE_DOWN_L, 0.92, [410, 445]);
const DECK_TOP_CORE_L: CockpitBeam = {
  ...deckCore(DECK_TOP_L, 1),
  // Continue through the rounded top-left screen corner; the screen glass
  // paints after this batch and erases the cap inside its fill.
  pts: [...DECK_TOP_L.pts, [730, 900]],
};
const DECK_LOWER_CORE_L: CockpitBeam = {
  ...deckCore(DECK_LOWER_L, 0.82),
  // Same buried-cap contract at the lower screen corner.
  pts: [...DECK_LOWER_L.pts, [650, 990]],
};
export const WRAP_BEAMS: ReadonlyArray<CockpitBeam> = [
  FLARE_UP_L, mirrorBeam(FLARE_UP_L),
  FLARE_DOWN_L, mirrorBeam(FLARE_DOWN_L),
  DECK_TOP_L, mirrorBeam(DECK_TOP_L),
  DECK_LOWER_L, mirrorBeam(DECK_LOWER_L),
  FLARE_UP_CORE_L, mirrorBeam(FLARE_UP_CORE_L),
  FLARE_DOWN_CORE_L, mirrorBeam(FLARE_DOWN_CORE_L),
  DECK_TOP_CORE_L, mirrorBeam(DECK_TOP_CORE_L),
  DECK_LOWER_CORE_L, mirrorBeam(DECK_LOWER_CORE_L),
];

const DECK_FORK_BEAMS: ReadonlyArray<CockpitBeam> = [];

// ─── The console ─────────────────────────────────────────────────────────────
// Measured: deck band face y 826→878, screen housing shoulders around
// (730,872)/(1190,872) with faceted slopes below the frame, and an OPEN
// recess whose y≈911 top lip carries the CTA row (its sides continue below
// the viewport rather than closing into a card).

const HOUSING_RAW: RawPt[] = [
  [520, 1090],
  [613, 880, 18],
  [672, 830, 22],
  [1243, 830, 22],
  [1303, 880, 18],
  [1400, 1090],
];
/** The housing's inner (+normal) hairline approaches the screen-recess groove
 *  within a pixel at both shoulder fillets. Let the recess carry that short
 *  handoff so the two lit edges cannot stack into a bright dash. */
function housingInnerW(x: number, y: number): number {
  const c01 = (value: number): number => Math.min(1, Math.max(0, value));
  const top = 1 - c01((y - 900) / 60);
  const shoulderDistance = Math.min(Math.abs(x - 672), Math.abs(x - 1243));
  const shoulder = 1 - c01((shoulderDistance - 10) / 80);
  return 0.55 - 1.35 * top * shoulder;
}

export const HOUSING_BEAM: CockpitBeam = {
  pts: resolveCorners(HOUSING_RAW),
  dw: 26,
  w: 0.55,
  wPlusAt: housingInnerW,
};

/** Thin physical inset around the whole viewport, visible in the source
 * cockpit as the outermost shell seam. */
export const PERIMETER_BEAM: CockpitBeam = {
  pts: resolveCorners([[12, 12, 2], [1908, 12, 2], [1908, 1068, 2], [12, 1068, 2]], true),
  dw: 3,
  w: -0.62,
  closed: true,
};

// ─── Grooves: seams, inset panels, the screen recess ─────────────────────────
// Narrow beams (~6-8 design px) the shader renders as dark channels between
// faint amber edges. Every groove either exits the frame or lands inside
// another member's band — no floating ends.

const SCREEN_FRAME: CockpitBeam = {
  pts: resolveCorners([[611, 1020, 8], [705, 880, 18], [1211, 880, 18], [1304, 1020, 8]], true),
  dw: 5,
  w: 0.95,
  closed: true,
  // The inner edge hands off under the outer housing at the two upper
  // shoulders. Fade that buried edge through the overlap so the three crisp
  // laminations cannot stack into a false bright knot.
  wMinusAt: (x: number, y: number): number => {
    const d = Math.min(Math.hypot(x - 705, y - 880), Math.hypot(x - 1211, y - 880));
    const t = Math.min(1, Math.max(0, d / 45));
    return -0.4 + 1.35 * t;
  },
};

const GROOVES: ReadonlyArray<CockpitBeam> = [SCREEN_FRAME];

// PAINT ORDER = JOIN ORDER: every chisel tip tucks under a band drawn LATER
// (arms/wraps under the ring, the mid laminations under the housing), so no
// dark fill ever crosses a receiving member's hairline.
/** The physical screen is a real occlusion seam: deck plates paint first,
 * then the screen glass, then its bezel and the upper structure. Splitting
 * the two static ribbon batches keeps lower ridges from ghosting through the
 * console while preserving one shared shader material. */
export const COCKPIT_BEAMS_BELOW_SCREEN: ReadonlyArray<CockpitBeam> = [
  ...DECK_FORK_BEAMS,
  ...WRAP_BEAMS,
];

export const COCKPIT_BEAMS_ABOVE_SCREEN: ReadonlyArray<CockpitBeam> = [
  PERIMETER_BEAM,
  ...ARM_BEAMS,
  ...GROOVES,
  HOUSING_BEAM,
  CANOPY_BEAM,
  CANOPY_CORE,
];

export const COCKPIT_BEAMS: ReadonlyArray<CockpitBeam> = [
  ...COCKPIT_BEAMS_BELOW_SCREEN,
  ...COCKPIT_BEAMS_ABOVE_SCREEN,
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
    [611, 1020, 8],
    [705, 880, 18],
    [1211, 880, 18],
    [1304, 1020, 8],
  ],
  true,
);
