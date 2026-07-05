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

/** One cockpit member, fillets resolved: its polyline and its facing weight
 *  (how squarely the member's face points at the star — the multiplier on the
 *  lit passes; see buildCockpit's fragment shader / CockpitFrame's passes). */
export interface CockpitLine {
  pts: ReadonlyArray<Pt>;
  w: number;
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
// Same layout as the approved first pass: hexagonal front windshield with cut
// top corners, inward-slanting A-pillars, side-window rakes, dashboard cowl,
// centre console, right instrument arc. Corner radii are generous (24-34) so
// the frame reads as moulded coachwork, matching the reference.

const R_HEX = 32; // windshield hexagon corners
const R_CONSOLE = 24; // console plateau shoulders
const CURVE_N = 26; // samples across the windshield's bottom sweep

/** Windshield frame, outer edge (closed ring). The bottom edge is the swept
 *  cowl top: a quadratic from pillar foot to pillar foot. */
const canopyOuterRaw: RawPt[] = [
  [398, 86, R_HEX],
  [1522, 86, R_HEX],
  [1714, 248, R_HEX],
  [1516, 742, R_HEX],
  ...quad([1516, 742], [960, 950], [404, 742], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
  [404, 742, R_HEX],
  [206, 248, R_HEX],
];
/** Windshield frame, inner lip (closed ring) — wider pillar offsets than the
 *  top edge, the perspective cue that gives the members thickness. */
const canopyInnerRaw: RawPt[] = [
  [420, 104, R_HEX],
  [1500, 104, R_HEX],
  [1668, 266, R_HEX],
  [1482, 714, R_HEX],
  ...quad([1482, 714], [960, 908], [438, 714], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
  [438, 714, R_HEX],
  [252, 266, R_HEX],
];

export const CANOPY_OUTER: CockpitLine = { pts: resolveCorners(canopyOuterRaw, true), w: 0.5, closed: true };
export const CANOPY_INNER: CockpitLine = { pts: resolveCorners(canopyInnerRaw, true), w: 1, closed: true };

export const COCKPIT_LINES: ReadonlyArray<CockpitLine> = [
  CANOPY_OUTER,
  CANOPY_INNER,

  // Ceiling seams — the top-corner cuts continued up to the roof line.
  { pts: [[398, 86], [340, 0]], w: 0.35 },
  { pts: [[1522, 86], [1580, 0]], w: 0.35 },

  // Left side window: top rake to the screen edge + lower sill pair.
  { pts: [[0, 168], [206, 248]], w: 0.55 },
  { pts: [[404, 742], [0, 872]], w: 0.7 },
  { pts: [[396, 764], [0, 898]], w: 0.45 },

  // Right side window, mirrored.
  { pts: [[1920, 168], [1714, 248]], w: 0.55 },
  { pts: [[1516, 742], [1920, 872]], w: 0.7 },
  { pts: [[1524, 764], [1920, 898]], w: 0.45 },

  // Dashboard cowl echo — the second sweep under the windshield's bottom edge.
  { pts: [[368, 782], ...quad([368, 782], [960, 1005], [1552, 782], CURVE_N)], w: 0.75 },

  // Centre console: plateau + shoulders, with a parallel inner echo.
  {
    pts: resolveCorners([
      [556, 1080],
      [572, 1016, R_CONSOLE],
      [712, 886, R_CONSOLE],
      [1208, 886, R_CONSOLE],
      [1348, 1016, R_CONSOLE],
      [1364, 1080],
    ]),
    w: 0.9,
  },
  {
    pts: resolveCorners([
      [598, 1080],
      [610, 1030, 18],
      [730, 904, 18],
      [1190, 904, 18],
      [1310, 1030, 18],
      [1322, 1080],
    ]),
    w: 0.55,
  },

  // Lower wing diagonals — the dash edges running out to the corners.
  { pts: [[0, 940], [360, 1035]], w: 0.4 },
  { pts: [[1920, 940], [1560, 1035]], w: 0.4 },

  // Right instrument arc: a large circle mostly off-screen bulging into the
  // frame (the left flank's half-circle gauge is the LIVE .hud-arc instrument;
  // this is its silent structural twin), with a tighter inner echo.
  { pts: arc(2150, 540, 344, (130 * Math.PI) / 180, (230 * Math.PI) / 180, 28), w: 0.5 },
  { pts: arc(2150, 540, 316, (138 * Math.PI) / 180, (222 * Math.PI) / 180, 24), w: 0.3 },
];

// ─── The interior masses ─────────────────────────────────────────────────────
// Ceiling band and dashboard: the opaque structure that turns floating lines
// into a ship (the scene stays visible only through glass). Corners rounded
// with the same radii as the lines that trace them.

export const PANEL_CEILING: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 0],
    [1920, 0],
    [1920, 168],
    [1714, 248, R_HEX],
    [1522, 86, R_HEX],
    [398, 86, R_HEX],
    [206, 248, R_HEX],
    [0, 168],
  ],
  true,
);

export const PANEL_DASH: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 872],
    [404, 742, R_HEX],
    ...quad([404, 742], [960, 950], [1516, 742], CURVE_N).slice(0, -1).map(([x, y]): RawPt => [x, y]),
    [1516, 742, R_HEX],
    [1920, 872],
    [1920, 1080],
    [0, 1080],
  ],
  true,
);
