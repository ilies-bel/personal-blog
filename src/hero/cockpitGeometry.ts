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

/** One cockpit member, fillets resolved: its polyline, its facing weight
 *  (how squarely the member's face points at the star — the multiplier on the
 *  lit passes; see buildCockpit's fragment shader / CockpitFrame's passes),
 *  and its width in CSS px. The piping stays THIN across the board (≈2px trim,
 *  hairline echoes): a beam's structural width is the DARK BAND between its
 *  edge pair, never the stroke — fat strokes + halo swallow the band and the
 *  member reads as a neon tube instead of coachwork. */
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
// Round-5 layout, reduced to the reference's essentials: the MAIN FRAME (the
// windshield beam with its Y-junction rakes, the sill beams off the pillar
// feet) and the CONSOLE (dash rails rising into the plateau, the companion
// splitting down the console sides, the inner echo lip). Every member is a
// BEAM (two lines bounding a dark band) and every line either exits the frame
// or flows out of a junction — no floating ends, no decorative clutter.

const R_HEX = 34; // windshield hexagon corners

/** Windshield frame, outer edge (closed ring). The bottom edge is the cowl
 *  top — the reference's profile: a quick filleted drop at each pillar foot
 *  into a FLAT run across the centre (never a centre-sagging arc).
 *
 *  At each top corner the contour plays the reference's Y JUNCTION: instead of
 *  a mitred corner, the top edge rounds UP into the side-window rake's upper
 *  line (the V notch), the rake beam exits past the screen edge (its end cap
 *  lives off-screen, never visible), and the beam's underside returns to round
 *  into the pillar's outer face. The rake beam is thereby CONTINUOUS with the
 *  frame — same contour, same stroke, and the band fill (this ring with the
 *  inner ring as its hole) fuses the hub + rake band into one dark mass. */
const canopyOuterRaw: RawPt[] = [
  [344, 78, 18],
  [1592, 78, 18],
  // Right junction: V notch → out the screen edge → back to the pillar face.
  [1734, 251, 16],
  [1944, 157],
  [1946, 183],
  [1714, 292, 30],
  // Right pillar FOOT — the reference's construction: the whole bottom is ONE
  // slim beam hugging the window's bottom edge. The pillar's outer face
  // rounds at the foot into the sill's top edge. Re-measured off the console
  // crop (dense luminance trace): the sill is NEARLY FLAT with a subtle
  // CROWN at the centre — the underside sits at ~841 mid-screen and ~850 near
  // the feet (the round-5 layout bowed the opposite way, sagging 43px to the
  // centre, which read as a drooping cowl against the reference).
  [1500, 822, 40],
  [1740, 816, 170],
  [1944, 856],
  [1944, 868],
  [1730, 845, 170],
  [1470, 850, 220],
  [960, 841, 480],
  // Left pillar foot, mirrored.
  [450, 850, 220],
  [190, 845, 170],
  [-24, 868],
  [-24, 856],
  [180, 816, 170],
  [420, 822, 40],
  // Left rake junction (up the pillar → out the screen edge → V notch).
  [206, 292, 30],
  [-26, 183],
  [-24, 157],
  [186, 251, 16],
];
/** Windshield frame, inner lip (closed ring) — wider pillar offsets than the
 *  top edge, the perspective cue that gives the members thickness. */
const canopyInnerRaw: RawPt[] = [
  [360, 96, 18],
  [1576, 96, 18],
  [1690, 262, 24],
  // The lip (the sill beam's TOP edge) mirrors the outer underside's profile:
  // nearly flat, crowning ~6px at the centre, turning up the pillars at the
  // feet (measured {829,841} at centre / {834,850} near the feet).
  [1465, 834, 44],
  [960, 828, 460],
  [455, 834, 44],
  [230, 262, 24],
];

export const CANOPY_OUTER: CockpitLine = { pts: resolveCorners(canopyOuterRaw, true), w: 0.72, px: 2.0, closed: true };
export const CANOPY_INNER: CockpitLine = { pts: resolveCorners(canopyInnerRaw, true), w: 1, px: 2.2, closed: true };

export const COCKPIT_LINES: ReadonlyArray<CockpitLine> = [
  CANOPY_OUTER,
  CANOPY_INNER,

  // (The sill beams live in CANOPY_OUTER's contour — the pillar-foot Y
  // junctions above — so they carry the frame's exact finish and their band
  // is filled by the strut band automatically.)

  // Console — re-measured off the reference crop (dense luminance trace with
  // the sill pair + pillar feet as the crop↔design anchors). The rail pair is
  // NOT a separate centre member landing on flank lines: in the reference
  // each flank line CONTINUES through the hub elbow into the rail — one
  // stroke per line, screen edge to screen edge — so both rails are authored
  // as single continuous members (no caps, no scissor crossings at the hub):
  //   • UPPER RAIL: from the edge along the dash-top profile (y≈949→916),
  //     elbow up at x≈610/1310, flat 864 across the centre, mirror out,
  //   • LOWER RAIL: rises out of the SKIRT (the console's flared base,
  //     kneeing through (450,1030)→(553,969)), same elbow, flat 877, mirror,
  //   • the PEDESTAL: flat top y≈911 spanning 760→1125, shoulders r85, sides
  //     diving at ~52° off the bottom of the frame, a SINGLE machined edge
  //     (the round-5 inner bezel is not in the reference).
  // (The hairline echoes that used to double the rails — near-edge dash-top
  // echoes and the lower skirt echoes — and the flank plate seam rectangles
  // are GONE by the pilot's call: on screen they read as accidental doubled
  // lines and floating clutter, not structure.)
  { pts: resolveCorners([[-6, 949], [350, 928, 260], [608, 916, 90], [746, 864, 170], [1174, 864, 170], [1312, 916, 90], [1570, 928, 260], [1926, 949]]), w: 0.7, px: 2.0 },
  { pts: resolveCorners([[170, 1088], [430, 1035, 120], [520, 1000, 150], [610, 938, 90], [746, 877, 150], [1174, 877, 150], [1310, 938, 90], [1400, 1000, 150], [1490, 1035, 120], [1750, 1088]]), w: 0.6, px: 1.9 },
  // Pedestal:
  { pts: resolveCorners([[620, 1090], [760, 911, 85], [1125, 911, 85], [1265, 1090]]), w: 0.85, px: 2.2 },

  // (The right instrument circle — main arc, inner echo and radial tick ring —
  // is GONE by the pilot's call: on screen its edge-clipped ticks read as
  // brown dashes floating off the frame, not structure. The LIVE navigation
  // gauge is the left flank's .hud-arc, now mounted in its own console screen.)
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
    [-30, 868],
    [190, 845, 170],
    [450, 850, 220],
    [960, 841, 480],
    [1470, 850, 220],
    [1730, 845, 170],
    [1944, 868],
    [1944, 1090],
    [-30, 1090],
  ],
  true,
);
