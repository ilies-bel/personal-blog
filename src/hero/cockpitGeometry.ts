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
// The windshield is a clean INSET HEXAGON — the reference's canopy: a flat top
// beam, a chamfer diagonal down each top corner, near-vertical pillars, and a
// near-flat sill, all sitting INSET from the screen edges (black margin beyond
// the frame on both flanks, exactly as the reference shows). The prior pass ran
// a "V notch → out the screen edge → back" excursion at each top corner, which
// poked a little triangular wedge off the frame and read as a tangle rather than
// a clean coachwork bend. Here each corner is ONE chamfered beam: top edge
// rounds into the rake, the rake runs straight down-out to the pillar top, the
// pillar rounds into the sill. One continuous stroke, no floating ends, no
// screen-edge wedge.
const canopyOuterRaw: RawPt[] = [
  // Top beam (flat), rounding into each corner chamfer.
  [470, 74, 40],
  [1450, 74, 40],
  // Right chamfer → pillar top → pillar (angles gently outward going down).
  [1690, 262, 70],
  [1792, 470, 60],
  // Right pillar foot: rounds into the sill's top edge. The sill is ONE slim
  // near-flat beam with a subtle centre crown (underside ~838 mid, ~846 feet).
  [1806, 792, 90],
  [1720, 846, 200],
  [1470, 850, 220],
  [960, 842, 480],
  // Left sill + pillar foot, mirrored.
  [450, 850, 220],
  [200, 846, 200],
  [114, 792, 90],
  // Left pillar → pillar top → chamfer back into the top beam.
  [128, 470, 60],
  [230, 262, 70],
];
/** Windshield frame, inner lip (closed ring) — a slightly smaller concentric
 *  hexagon. The offset between the two rings is the member THICKNESS (the strut
 *  band fills the gap), and it's a touch wider down the pillars than along the
 *  top, the perspective cue that gives the coachwork depth. */
const canopyInnerRaw: RawPt[] = [
  [486, 92, 38],
  [1434, 92, 38],
  [1662, 268, 64],
  [1758, 470, 56],
  [1770, 786, 84],
  // Track the outer ring's sill profile (an intermediate foot point at the
  // pillar, then the near-flat run) so the two rings stay PARALLEL down the
  // pillar foot — without this the inner ring cut one long diagonal while the
  // outer stepped through its foot, splaying the trim's thickness open there.
  [1690, 840, 200],
  [1462, 838, 210],
  [960, 830, 460],
  [458, 838, 210],
  [230, 840, 200],
  [150, 786, 84],
  [162, 470, 56],
  [258, 268, 64],
];

export const CANOPY_OUTER: CockpitLine = { pts: resolveCorners(canopyOuterRaw, true), w: 0.72, px: 2.0, closed: true };
export const CANOPY_INNER: CockpitLine = { pts: resolveCorners(canopyInnerRaw, true), w: 1, px: 2.2, closed: true };

export const COCKPIT_LINES: ReadonlyArray<CockpitLine> = [
  CANOPY_OUTER,
  CANOPY_INNER,

  // (The sill beams live in CANOPY_OUTER's contour — the pillar-foot Y
  // junctions above — so they carry the frame's exact finish and their band
  // is filled by the strut band automatically.)

  // Console — a CONTAINED central dashboard, not full-width rails. The prior
  // pass ran both rails screen-edge to screen-edge (x −6 → 1926), which stacked
  // three near-parallel horizontal bands (sill + two rails) across the whole
  // bottom and read as loose wires draped under the glass rather than an
  // instrument console. The reference instead shows a compact trapezoidal
  // dashboard: the rails ANCHOR at the pillar feet (where the sill meets the
  // pillar, ≈{200,846}/{1720,846}), sweep DOWN-and-IN to a raised central
  // plateau, and bound a contained console body that frames the pedestal — the
  // structure the finale copy + ledger sit inside. Both rails still START on the
  // frame (they flow out of the pillar foot, no floating end) and mirror about
  // centre; they simply no longer run off the screen edges.
  //   • DECK RAIL (upper): out of the pillar foot, a shallow dip to the plateau
  //     shoulders (x≈700/1220), flat across the centre at y≈900, mirror. This is
  //     the dashboard's top lip — the horizon line of the console.
  //   • APRON RAIL (lower): the console's flared base — drops from the deck-rail
  //     ends down the console flanks (the knee at ≈{560,1002}), across a wider
  //     flat at y≈1004, and mirrors. Deck + apron together read as one solid
  //     console mass (their band is dark, the pedestal mounted on top).
  //   • PEDESTAL: the raised centre block the copy sits above — flat top y≈938
  //     spanning 770→1150, shoulders r70, sides diving to the frame bottom.
  { pts: resolveCorners([[200, 846], [310, 892, 90], [700, 902, 150], [820, 900, 120], [1100, 900, 120], [1220, 902, 150], [1610, 892, 90], [1720, 846]]), w: 0.72, px: 2.0 },
  { pts: resolveCorners([[310, 892], [440, 986, 90], [560, 1002, 150], [820, 1004, 150], [1100, 1004, 150], [1360, 1002, 150], [1480, 986, 90], [1610, 892]]), w: 0.6, px: 1.9 },
  // Pedestal — the raised centre block, mounted on the deck rail:
  { pts: resolveCorners([[700, 1090], [770, 938, 70], [1150, 938, 70], [1220, 1090]]), w: 0.85, px: 2.2 },

  // (The right instrument circle — main arc, inner echo and radial tick ring —
  // is GONE by the pilot's call: on screen its edge-clipped ticks read as
  // brown dashes floating off the frame, not structure. The LIVE navigation
  // gauge is the left flank's .hud-arc, now mounted in its own console screen.)
];

// ─── The interior masses ─────────────────────────────────────────────────────
// Ceiling band and dashboard: the opaque structure that turns floating lines
// into a ship (the scene stays visible only through glass). Corners rounded
// with the same radii as the lines that trace them.

// The ceiling mass fills the whole top band down to the hexagon's top edge —
// its lower contour traces the new inset hexagon (top beam 470→1450 @ y74, the
// chamfer down to the pillar tops), so the opaque hull meets the trim exactly
// and the starfield shows only through the glass below. The mass runs full
// screen width up top (the ship's roof spans past the frame's inset flanks).
export const PANEL_CEILING: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 0],
    [1920, 0],
    [1920, 470],
    [1792, 470, R_HEX],
    [1690, 262, R_HEX],
    [1450, 74, R_HEX],
    [470, 74, R_HEX],
    [230, 262, R_HEX],
    [128, 470, R_HEX],
    [0, 470],
  ],
  true,
);

// The dash mass fills the bottom band up to the sill — its upper contour traces
// the new sill profile (pillar feet 200/1720 @ y846, the near-flat sill), full
// screen width so the console hull spans past the frame's inset flanks.
export const PANEL_DASH: ReadonlyArray<Pt> = resolveCorners(
  [
    [0, 470],
    [114, 792, 170],
    [200, 846, 200],
    [450, 850, 220],
    [960, 842, 480],
    [1470, 850, 220],
    [1720, 846, 200],
    [1806, 792, 170],
    [1920, 470],
    [1920, 1090],
    [0, 1090],
  ],
  true,
);
