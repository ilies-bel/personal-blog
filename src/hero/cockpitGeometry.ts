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
// Round-3 layout, matched to the glowing-piping reference: the windshield is
// WIDER (top edge spans 344..1592) and TALLER (pillar feet at y=800, the glass
// bottom dipping to ~855), the dash carries three sweeping parallels so the
// lower flanks read as machined structure instead of empty black, and every
// line either exits the frame or flows into a junction — no floating ends.

const R_HEX = 34; // windshield hexagon corners
const R_CONSOLE = 34; // console plateau shoulders
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

export const CANOPY_OUTER: CockpitLine = { pts: resolveCorners(canopyOuterRaw, true), w: 0.5, px: 2.2, closed: true };
export const CANOPY_INNER: CockpitLine = { pts: resolveCorners(canopyInnerRaw, true), w: 1, px: 2.6, closed: true };

export const COCKPIT_LINES: ReadonlyArray<CockpitLine> = [
  CANOPY_OUTER,
  CANOPY_INNER,

  // Ceiling seams — the top-corner cuts continued up to the roof line.
  { pts: [[344, 78], [286, 0]], w: 0.35, px: 1.3 },
  { pts: [[1592, 78], [1650, 0]], w: 0.35, px: 1.3 },

  // Left side window: top rake to the screen edge + lower sill pair.
  { pts: [[0, 170], [192, 252]], w: 0.55, px: 1.8 },
  { pts: [[390, 800], [0, 922]], w: 0.7, px: 1.8 },
  { pts: [[380, 826], [0, 952]], w: 0.45, px: 1.3 },

  // Right side window, mirrored.
  { pts: [[1920, 170], [1728, 252]], w: 0.55, px: 1.8 },
  { pts: [[1530, 800], [1920, 922]], w: 0.7, px: 1.8 },
  { pts: [[1540, 826], [1920, 952]], w: 0.45, px: 1.3 },

  // Dashboard sweeps — TWO echoes under the windshield's bottom edge, so the
  // lower flanks carry machined structure (the centre spans dip off-frame,
  // leaving the detail exactly where the dash was reading empty).
  { pts: [[352, 846], ...quad([352, 846], [960, 1064], [1568, 846], CURVE_N)], w: 0.75, px: 1.5 },
  { pts: [[322, 900], ...quad([322, 900], [960, 1160], [1598, 900], CURVE_N)], w: 0.55, px: 1.3 },

  // Centre console: plateau + shoulders, with a parallel inner echo.
  {
    pts: resolveCorners([
      [600, 1080],
      [618, 1010, R_CONSOLE],
      [742, 896, R_CONSOLE],
      [1178, 896, R_CONSOLE],
      [1302, 1010, R_CONSOLE],
      [1320, 1080],
    ]),
    w: 0.9,
    px: 2.2,
  },
  {
    pts: resolveCorners([
      [648, 1080],
      [660, 1026, 26],
      [766, 914, 26],
      [1154, 914, 26],
      [1260, 1026, 26],
      [1272, 1080],
    ]),
    w: 0.55,
    px: 1.4,
  },

  // Lower wing diagonals — run corner to corner (a floating line end is what
  // read as "cheap"; every member now exits the frame or joins a junction).
  { pts: [[0, 982], [400, 1080]], w: 0.4, px: 1.4 },
  { pts: [[0, 1032], [200, 1080]], w: 0.3, px: 1.2 },
  { pts: [[1920, 982], [1520, 1080]], w: 0.4, px: 1.4 },
  { pts: [[1920, 1032], [1720, 1080]], w: 0.3, px: 1.2 },

  // Right instrument arc: a large circle mostly off-screen bulging into the
  // frame (the left flank's half-circle gauge is the LIVE .hud-arc instrument;
  // this is its silent structural twin), with a tighter inner echo.
  { pts: arc(2150, 540, 344, (130 * Math.PI) / 180, (230 * Math.PI) / 180, 28), w: 0.5, px: 1.3 },
  { pts: arc(2150, 540, 316, (138 * Math.PI) / 180, (222 * Math.PI) / 180, 24), w: 0.3, px: 1.2 },
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
