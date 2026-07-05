// The cockpit canopy's geometry — ONE source of truth consumed by BOTH renderers:
// buildCockpit.ts (the live WebGL rig: ribbons + panel meshes, lit by the scene)
// and CockpitFrame.tsx (the reduced-motion SVG fallback). Everything is authored
// in a fixed 1920×1080, y-down design space that each renderer stretches to the
// viewport, so the drawing behaves like a cockpit moulded to the glass.
//
// Corners are ROUNDED (the reference frame flows through its bends — the sharp
// mitred joints of the first pass read as wireframe, not coachwork): every
// authored corner carries a rounding length and is replaced by a sampled
// quadratic bézier fillet at build time. Curves (the windshield's bottom sweep,
// the flank arcs) are pre-sampled into the same polyline representation, so
// downstream consumers only ever see point lists.

/** An authored vertex: x, y, and an optional corner-rounding length (design
 *  units). r > 0 replaces the corner with a quadratic fillet; endpoints and
 *  curve samples use r = 0 (default). */
export type RawPt = readonly [number, number, number?];
/** A resolved polyline point. */
export type Pt = readonly [number, number];

export const COCKPIT_W = 1920;
export const COCKPIT_H = 1080;
/** The unzoom's fixed point — pull back toward the pilot seat, not dead-centre
 *  (58% down, matching the SVG fallback's transform-origin). */
export const COCKPIT_CENTER: Pt = [960, 626];
/** How far past rest the frame starts when the power-on unzoom begins. */
export const COCKPIT_ZOOM_START = 2.05;

/** One cockpit member, fillets resolved: its polyline, its facing weight
 *  (how squarely the member's face points at the star — the multiplier on the
 *  lit passes; see buildCockpit's fragment shader / CockpitFrame's passes),
 *  and its width in CSS px (the reference frame is glowing PIPING with a clear
 *  hierarchy: fat canopy trim, medium sills, hairline echoes). */
export interface CockpitLine {
  pts: ReadonlyArray<Pt>;
  w: number;
  px: number;
  closed?: boolean;
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

/** Sample a circular arc (design space, y-down) centred (cx,cy), radius r,
 *  from angle a0 to a1 (radians, standard math convention on the y-down grid). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
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

// ─── The line set ────────────────────────────────────────────────────────────
// Round-4 layout, matched to the glowing-piping reference's FINISH: every major
// member is a BEAM (two bright tubes bounding a dark band, not a lone stroke),
// the cowl carries a tight louver striation stack, the console flows INTO the
// full-width dash rails as one continuous swept member, the lower flanks fan
// into the pillar-foot junctions with elongated seam blades between the sweeps,
// and the right instrument circle wears its radial tick ring. Every line still
// either exits the frame or flows into a junction — no floating ends.

const R_HEX = 34; // windshield hexagon corners
const CURVE_N = 26; // samples across the windshield's bottom sweep

/** Windshield frame, outer edge (closed ring). The bottom edge is the swept
 *  cowl top: a quadratic from pillar foot to pillar foot. */
const canopyOuterRaw: RawPt[] = [
  [344, 78, R_HEX],
  [1592, 78, R_HEX],
  [1728, 252, R_HEX],
  [1530, 800, R_HEX],
  ...quad([1530, 800], [960, 910], [390, 800], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
  [390, 800, R_HEX],
  [192, 252, R_HEX],
];
/** Windshield frame, inner lip (closed ring) — wider pillar offsets than the
 *  top edge, the perspective cue that gives the members thickness. */
const canopyInnerRaw: RawPt[] = [
  [360, 96, R_HEX],
  [1576, 96, R_HEX],
  [1690, 262, R_HEX],
  [1500, 780, R_HEX],
  ...quad([1500, 780], [960, 882], [420, 780], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
  [420, 780, R_HEX],
  [230, 262, R_HEX],
];

export const CANOPY_OUTER: CockpitLine = { pts: resolveCorners(canopyOuterRaw, true), w: 0.72, px: 2.4, closed: true };
export const CANOPY_INNER: CockpitLine = { pts: resolveCorners(canopyInnerRaw, true), w: 1, px: 4.2, closed: true };

/** Louver striations — the fine machined stack hugging the cowl's underside
 *  (the reference's tight parallel hairlines right below the fat rail). Each
 *  follows the cowl's own quadratic, shifted down and slightly fanned. */
function louver(dy: number, inset: number): CockpitLine {
  const p0: Pt = [1530 - inset, 800 + dy];
  const p1: Pt = [390 + inset, 800 + dy];
  return { pts: [p0, ...quad(p0, [960, 910 + dy * 1.2], p1, CURVE_N)], w: 0.28, px: 1.4 };
}

/** The right instrument circle's tick furniture: a fine radial dash ring just
 *  outside the main arc, plus three double-tick bracket markers riding it. */
function instrumentTicks(cx: number, cy: number): CockpitLine[] {
  const out: CockpitLine[] = [];
  for (let i = 0; i < 29; i++) {
    const a = ((136 + i * 3.15) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push({ pts: [[cx + 358 * c, cy + 358 * s], [cx + 370 * c, cy + 370 * s]], w: 0.6, px: 1.5 });
  }
  for (const deg of [151, 179, 207]) {
    for (const off of [-1.9, 1.9]) {
      const a = ((deg + off) * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push({ pts: [[cx + 340 * c, cy + 340 * s], [cx + 374 * c, cy + 374 * s]], w: 0.7, px: 1.8 });
    }
  }
  return out;
}

export const COCKPIT_LINES: ReadonlyArray<CockpitLine> = [
  CANOPY_OUTER,
  CANOPY_INNER,

  // Ceiling seams — the top-corner cuts continued up to the roof line.
  { pts: [[344, 78], [286, 0]], w: 0.52, px: 1.9 },
  { pts: [[1592, 78], [1650, 0]], w: 0.52, px: 1.9 },

  // Left side window: top rake, the near-edge pane hairline dropping from the
  // rake to the sill junction, and the lower sill BEAM (edge-tube pair).
  { pts: [[0, 170], [192, 252]], w: 0.55, px: 2.0 },
  { pts: [[42, 196], [16, 914]], w: 0.5, px: 1.7 },
  { pts: [[390, 800], [0, 922]], w: 0.75, px: 2.6 },
  { pts: [[378, 830], [0, 958]], w: 0.62, px: 2.2 },

  // Right side window, mirrored.
  { pts: [[1920, 170], [1728, 252]], w: 0.55, px: 2.0 },
  { pts: [[1878, 196], [1904, 914]], w: 0.5, px: 1.7 },
  { pts: [[1530, 800], [1920, 922]], w: 0.75, px: 2.6 },
  { pts: [[1542, 830], [1920, 958]], w: 0.62, px: 2.2 },

  // The cowl's louver stack — four striations, tight under the windshield's
  // bottom sweep, fanning open a touch toward the centre dip.
  louver(14, 10),
  louver(26, 16),
  louver(38, 22),
  louver(50, 28),

  // Console coachwork — ONE continuous swept member from screen edge to screen
  // edge: down the dash, up into the console shoulder, across the plateau, and
  // back out (the reference's flowing rail), plus the two flank curves that
  // wrap the console's sides toward the floor, and a soft inner echo.
  {
    pts: resolveCorners([
      [-6, 904],
      [560, 996, 220],
      [746, 898, 84],
      [1174, 898, 84],
      [1360, 996, 220],
      [1926, 904],
    ]),
    w: 0.8,
    px: 2.6,
  },
  { pts: resolveCorners([[-6, 1002], [520, 1054, 180], [618, 1096]]), w: 0.6, px: 2.0 },
  { pts: resolveCorners([[1926, 1002], [1400, 1054, 180], [1302, 1096]]), w: 0.6, px: 2.0 },
  {
    pts: resolveCorners([
      [664, 1084],
      [676, 1024, 30],
      [780, 918, 30],
      [1140, 918, 30],
      [1244, 1024, 30],
      [1256, 1084],
    ]),
    w: 0.5,
    px: 1.5,
  },

  // Lower corner fans — bowed sweeps converging on the pillar-foot junctions
  // (straight diagonals read as wireframe; the reference's members bow).
  { pts: [[-6, 968], ...quad([-6, 968], [230, 1006], [468, 1086], 12)], w: 0.6, px: 2.0 },
  { pts: [[-6, 1022], ...quad([-6, 1022], [150, 1046], [286, 1090], 10)], w: 0.5, px: 1.7 },
  { pts: [[1926, 968], ...quad([1926, 968], [1690, 1006], [1452, 1086], 12)], w: 0.6, px: 2.0 },
  { pts: [[1926, 1022], ...quad([1926, 1022], [1770, 1046], [1634, 1090], 10)], w: 0.5, px: 1.7 },

  // Seam blades — elongated closed slivers between the fan sweeps (the
  // reference's specular panel seams; what turns "lines" into "machining").
  { pts: resolveCorners([[170, 948, 6], [320, 986, 6], [308, 998, 6], [156, 958, 6]], true), w: 0.55, px: 1.6, closed: true },
  { pts: resolveCorners([[96, 1014, 6], [212, 1040, 6], [202, 1050, 6], [84, 1022, 6]], true), w: 0.55, px: 1.6, closed: true },
  { pts: resolveCorners([[1750, 948, 6], [1600, 986, 6], [1612, 998, 6], [1764, 958, 6]], true), w: 0.55, px: 1.6, closed: true },
  { pts: resolveCorners([[1824, 1014, 6], [1708, 1040, 6], [1718, 1050, 6], [1836, 1022, 6]], true), w: 0.55, px: 1.6, closed: true },

  // Right instrument circle: main arc + inner echo + the radial tick ring
  // (the left flank's half-circle gauge is the LIVE .hud-arc instrument;
  // this is its silent structural twin).
  { pts: arc(2150, 540, 344, (130 * Math.PI) / 180, (230 * Math.PI) / 180, 28), w: 0.6, px: 2.4 },
  { pts: arc(2150, 540, 318, (138 * Math.PI) / 180, (222 * Math.PI) / 180, 24), w: 0.5, px: 1.7 },
  ...instrumentTicks(2150, 540),
];

// ─── The interior masses ─────────────────────────────────────────────────────
// Ceiling band and dashboard: the opaque structure that turns floating lines
// into a ship (the scene stays visible only through glass). Corners rounded
// with the same radii as the lines that trace them.

export const PANEL_CEILING: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 0],
    [1920, 0],
    [1920, 170],
    [1728, 252, R_HEX],
    [1592, 78, R_HEX],
    [344, 78, R_HEX],
    [192, 252, R_HEX],
    [0, 170],
  ],
  true,
);

export const PANEL_DASH: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 922],
    [390, 800, R_HEX],
    ...quad([390, 800], [960, 910], [1530, 800], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
    [1530, 800, R_HEX],
    [1920, 922],
    [1920, 1080],
    [0, 1080],
  ],
  true,
);
