// The cockpit HUD geometry — a tasteful subset of white holographic instruments
// on the glass (reference: the centred scanner ring + corner ticks, kept sparse
// so the minimalist finale copy stays legible). Built as line ribbons (same
// extrusion the struts use, but hairline), consumed by buildCockpit's HUD mesh.
//
// The set, all in the fixed 1920×1080 design space:
//   • a centred SCANNER RING (thin circle) with four bracket ticks + a small
//     inner hex reticle — the "you are here / target" mark from the refs,
//   • a short COMPASS strip of ticks near the top centre,
//   • two corner CARET frames (top-left / top-right) — the readout housings the
//     DOM speed/heading numbers would sit in (drawn empty; the text is the
//     site's own white type, not baked here).
import * as THREE from 'three';
import { COCKPIT_W } from '../cockpitGeometry';

type Pt = [number, number];
interface HudLine {
  pts: Pt[];
  hw: number;
  closed?: boolean;
}

const CX = COCKPIT_W / 2; // 960
const CY = 452; // reticle centre — a touch above mid-glass

function circle(cx: number, cy: number, r: number, segs = 64): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** An arc from a0→a1 radians. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, segs = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function hex(cx: number, cy: number, r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function hudLines(): HudLine[] {
  const lines: HudLine[] = [];
  const R = 150; // scanner radius — fills a good part of the centre pane

  // Outer scanner ring + a thin concentric inner ring (the reference's nested
  // scanner discs).
  lines.push({ pts: circle(CX, CY, R), hw: 1.4, closed: true });
  lines.push({ pts: circle(CX, CY, R - 30), hw: 1.0, closed: true });
  // A dashed-look tick ring: short radial ticks around the inner ring.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r0 = R - 30;
    const r1 = r0 - (long ? 12 : 6);
    lines.push({
      pts: [
        [CX + Math.cos(a) * r0, CY + Math.sin(a) * r0],
        [CX + Math.cos(a) * r1, CY + Math.sin(a) * r1],
      ],
      hw: long ? 1.3 : 0.9,
    });
  }
  // Inner hex reticle.
  lines.push({ pts: hex(CX, CY, 26), hw: 1.3, closed: true });
  // Four corner brackets just inside the ring (open arcs at the diagonals).
  const br = R - 6;
  const d = Math.PI / 9;
  for (const base of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    lines.push({ pts: arc(CX, CY, br, base - d, base + d, 12), hw: 1.8 });
  }
  // Crosshair stubs (short ticks at N/E/S/W of the ring, pointing inward).
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    lines.push({
      pts: [
        [CX + ox * (R + 12), CY + oy * (R + 12)],
        [CX + ox * (R - 2), CY + oy * (R - 2)],
      ],
      hw: 1.3,
    });
  }

  // Compass strip: short vertical ticks along a horizontal line near the top.
  const compY = 210;
  const compHalf = 300;
  for (let i = -6; i <= 6; i++) {
    const x = CX + (i / 6) * compHalf;
    const long = i % 3 === 0;
    lines.push({
      pts: [
        [x, compY],
        [x, compY + (long ? 16 : 9)],
      ],
      hw: long ? 1.5 : 1.1,
    });
  }
  // Compass baseline.
  lines.push({ pts: [[CX - compHalf, compY], [CX + compHalf, compY]], hw: 1.1 });

  // Corner caret frames — small L-brackets, one per top corner, marking the
  // readout housings (the DOM numbers sit here in the real layout).
  const caret = (x: number, y: number, sx: number): void => {
    const w = 110;
    const h = 34;
    lines.push({
      pts: [
        [x, y + h],
        [x, y],
        [x + sx * w, y],
      ],
      hw: 1.6,
    });
  };
  caret(300, 300, 1); // top-left
  caret(1620, 300, -1); // top-right

  return lines;
}

/** Extrude the HUD lines into a ribbon geometry (aPos/aNorm/aSide/aHalf), the
 *  same attribute layout the strut vertex shader reads (buildCockpit binds the
 *  HUD material to cockpitHudVertexShader). */
export function buildHudGeometry(): THREE.BufferGeometry {
  const lines = hudLines();
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const half: number[] = [];
  const idx: number[] = [];

  for (const line of lines) {
    const pts = line.closed ? [...line.pts, line.pts[0]] : [...line.pts];
    const n = pts.length;
    if (n < 2) continue;
    const first = pos.length / 2;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = i > 0 ? pts[i - 1] : line.closed ? pts[n - 2] : pts[0];
      const next = i < n - 1 ? pts[i + 1] : line.closed ? pts[1] : pts[n - 1];
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
      const miter = 1 / Math.max(0.4, nx * -d1y + ny * d1x);
      for (const s of [-1, 1]) {
        pos.push(p[0], p[1]);
        norm.push(nx * miter, ny * miter);
        side.push(s);
        half.push(line.hw);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = first + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(new Float32Array(pos), 2));
  geo.setAttribute('aNorm', new THREE.BufferAttribute(new Float32Array(norm), 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
  geo.setAttribute('aHalf', new THREE.BufferAttribute(new Float32Array(half), 1));
  geo.setAttribute('position', geo.getAttribute('aPos'));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(960, 540, 0), 4000);
  return geo;
}
