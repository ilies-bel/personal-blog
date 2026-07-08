// The cockpit canopy's geometry — ONE source of truth consumed by BOTH renderers:
// buildCockpit.ts (the live WebGL rig) and CockpitFrame.tsx (the reduced-motion
// SVG fallback). Everything is authored in a fixed 1920×1080, y-down design space
// that each renderer stretches to the viewport, so the cockpit is moulded to the
// glass.
//
// DESIGN LANGUAGE — a SOLID FACETED METAL CANOPY (Star-Citizen grammar), not a
// glowing wireframe. The windshield is a set of GLASS PANES (the transparent
// openings you see the scene through); everything around and between them is an
// opaque dark-metal HULL. The "struts / mullions" are simply the metal BETWEEN
// the panes — so the frame reads as a machined structure with real width, lit by
// the scene rather than self-luminous. A thin cool rim-light rides each pane edge
// (the bevel catching light); the metal itself is a simple neutral tone and the
// star's light fleshes it out.
//
// Corners are ROUNDED: every authored corner carries a rounding length and is
// replaced by a sampled quadratic bézier fillet at build time. Curves are
// pre-sampled into the same polyline representation, so downstream consumers only
// ever see point lists.

/** An authored vertex: x, y, and an optional corner-rounding length (design
 *  units). r > 0 replaces the corner with a quadratic fillet; endpoints and
 *  curve samples use r = 0 (default). */
export type RawPt = readonly [number, number, number?];
/** A resolved polyline point. */
export type Pt = readonly [number, number];

export const COCKPIT_W = 1920;
export const COCKPIT_H = 1080;

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

// ─── The glass panes ─────────────────────────────────────────────────────────
// The windshield is FACETED — several flat glass panes divided by thick metal
// mullions (reference image 3). Each pane is a closed ring in design space. The
// hull (below) is the whole screen with these panes cut out as holes, so the
// mullions between panes are solid metal automatically.
//
// Layout, measured off the reference: a large CENTRE pane (rounded hexagon
// filling the middle), a canted SIDE pane on each flank, and a shallow TOP
// vent pane above the centre. The panes sit INSET from the screen edges (dark
// hull margin all around) and rise from a console sill near the bottom.

const R_PANE = 26; // pane-corner rounding

/** Central windshield pane — a wide rounded hexagon. Top edge canted down at the
 *  corners into the side mullions; bottom edge the cowl line above the console. */
export const PANE_CENTER: ReadonlyArray<Pt> = resolveCorners(
  [
    [636, 150, R_PANE],
    [1284, 150, R_PANE],
    [1420, 300, R_PANE], // top-right cant into the right mullion
    [1420, 700, R_PANE],
    [1290, 786, R_PANE], // bottom-right into the cowl
    [630, 786, R_PANE],
    [500, 700, R_PANE],
    [500, 300, R_PANE], // top-left cant
  ],
  true,
);

/** Right side pane — a canted trapezoid between the centre mullion and the
 *  right pillar. Its inboard edge parallels the centre pane's right edge across
 *  the mullion gap; its outboard edge is the pillar. */
export const PANE_RIGHT: ReadonlyArray<Pt> = resolveCorners(
  [
    [1486, 316, R_PANE],
    [1576, 250, R_PANE], // up toward the roof corner
    [1690, 470, R_PANE], // out to the pillar top
    [1690, 690, R_PANE],
    [1576, 748, R_PANE], // down to the cowl corner
    [1486, 686, R_PANE],
  ],
  true,
);

/** Left side pane — mirror of the right. */
export const PANE_LEFT: ReadonlyArray<Pt> = resolveCorners(
  [
    [434, 316, R_PANE],
    [344, 250, R_PANE],
    [230, 470, R_PANE],
    [230, 690, R_PANE],
    [344, 748, R_PANE],
    [434, 686, R_PANE],
  ],
  true,
);

/** Shallow top vent pane above the centre — a thin canted strip (the roof glass
 *  slot in the references). Keeps the roof from reading as one dead metal slab. */
export const PANE_TOP: ReadonlyArray<Pt> = resolveCorners(
  [
    [726, 96, 14],
    [1194, 96, 14],
    [1150, 132, 14],
    [770, 132, 14],
  ],
  true,
);

/** Every glass pane, inboard→out. The hull cuts these as holes; the HUD layer
 *  and the strut bevels reference their edges. */
export const GLASS_PANES: ReadonlyArray<ReadonlyArray<Pt>> = [PANE_CENTER, PANE_RIGHT, PANE_LEFT, PANE_TOP];

// ─── The hull surround ───────────────────────────────────────────────────────
// The solid dark-metal canopy: the FULL screen (bled a touch past every edge so
// no seam shows) with the glass panes subtracted as holes. Everything you don't
// see the scene through is this mass — roof, pillars, cowl, and the mullions
// between the panes. Shaded as beveled metal, lit by the star.

export const HULL_OUTER: ReadonlyArray<Pt> = [
  [-40, -40],
  [COCKPIT_W + 40, -40],
  [COCKPIT_W + 40, COCKPIT_H + 40],
  [-40, COCKPIT_H + 40],
];

// ─── The console pod ─────────────────────────────────────────────────────────
// A solid raised dashboard block at the bottom centre (the physical console in
// the references): a flat-topped plateau with canted wings sweeping out toward
// the pillar feet, mounted below the windshield cowl. Drawn as its own solid
// metal mass over the hull, with a small screen recess (below) and a bevel.

export const CONSOLE_BODY: ReadonlyArray<Pt> = resolveCorners(
  [
    [150, 1090],
    [300, 980, 60],
    [560, 900, 90], // left wing up to the plateau shoulder
    [760, 872, 70],
    [1160, 872, 70],
    [1360, 900, 90],
    [1620, 980, 60],
    [1770, 1090],
  ],
  false, // open bottom (runs off the screen edge); closed by the screen rect
);

/** The console as a closed fill shape (wings + a baseline across the bottom). */
export const CONSOLE_FILL: ReadonlyArray<Pt> = [...CONSOLE_BODY, [1770, 1120], [150, 1120]];

/** The recessed screen inset on the console plateau — a dark glass panel the HUD
 *  globe/readout sits in (reference: the lit screen on the dashboard). */
export const CONSOLE_SCREEN: ReadonlyArray<Pt> = resolveCorners(
  [
    [812, 916, 22],
    [1108, 916, 22],
    [1108, 1030, 22],
    [812, 1030, 22],
  ],
  true,
);

// ─── Strut mullions (the beveled metal beams) ────────────────────────────────
// The dimensional edges: each mullion is authored as a CENTRELINE polyline with
// a half-width, extruded in buildCockpit into a wide filled ribbon carrying a
// cross-strut coordinate so the shader can bevel it (bright crown, shaded
// flanks). These sit OVER the hull fill and give the frame its machined relief.
// They trace the pane boundaries: the two centre mullions (between centre and
// side panes), the pillar outer edges, the roof beam, and the cowl.

export interface Strut {
  /** Centreline polyline (design px). */
  pts: ReadonlyArray<Pt>;
  /** Half-width in design px (the beam's thickness / 2). */
  hw: number;
  closed?: boolean;
}

const CENTER_MULLION_R: RawPt[] = [
  [1453, 300, 40],
  [1453, 700, 40],
];
const CENTER_MULLION_L: RawPt[] = [
  [467, 300, 40],
  [467, 700, 40],
];

export const STRUTS: ReadonlyArray<Strut> = [
  // Roof beam — spans the top of the windshield above the centre + top vent.
  { pts: resolveCorners([[260, 236, 60], [560, 184, 80], [960, 150, 220], [1360, 184, 80], [1660, 236, 60]]), hw: 16 },
  // Right centre mullion (between centre pane and right side pane).
  { pts: resolveCorners(CENTER_MULLION_R), hw: 18 },
  // Left centre mullion.
  { pts: resolveCorners(CENTER_MULLION_L), hw: 18 },
  // Right pillar — roof corner down the flank to the cowl.
  { pts: resolveCorners([[1636, 254, 40], [1726, 470, 70], [1726, 700, 60], [1610, 792, 40]]), hw: 20 },
  // Left pillar.
  { pts: resolveCorners([[284, 254, 40], [194, 470, 70], [194, 700, 60], [310, 792, 40]]), hw: 20 },
  // Cowl beam — the bottom sill of the windshield, above the console.
  { pts: resolveCorners([[310, 792, 40], [630, 786, 120], [960, 792, 320], [1290, 786, 120], [1610, 792, 40]]), hw: 15 },
];

// ─── Reduced-motion SVG fallback line set ────────────────────────────────────
// The SVG fallback can't fill-with-holes as cheaply, so it strokes the pane
// outlines + struts + console as simple lines (a clean schematic of the same
// canopy). One flat list of {pts, closed} the fallback maps to <path>s.

export interface FallbackLine {
  pts: ReadonlyArray<Pt>;
  closed?: boolean;
  /** Stroke width in CSS px (mullions fat, pane outlines thin). */
  px: number;
}

export const FALLBACK_LINES: ReadonlyArray<FallbackLine> = [
  { pts: PANE_CENTER, closed: true, px: 2 },
  { pts: PANE_RIGHT, closed: true, px: 2 },
  { pts: PANE_LEFT, closed: true, px: 2 },
  { pts: PANE_TOP, closed: true, px: 1.6 },
  { pts: CONSOLE_BODY, closed: false, px: 2.4 },
  { pts: CONSOLE_SCREEN, closed: true, px: 1.6 },
  ...STRUTS.map((s) => ({ pts: s.pts, closed: s.closed, px: Math.max(2, s.hw * 0.18) })),
];
