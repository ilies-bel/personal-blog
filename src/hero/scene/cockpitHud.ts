// The cockpit HUD geometry — white holographic instruments projected on the
// glass (the tasteful subset recovered from the solid-canopy experiment):
//   • a SCANNER RETICLE — outer ring, inner tick ring, hex reticle, corner
//     bracket arcs and crosshair stubs — that TRACKS THE STAR: its lines are
//     authored around the origin and the vertex shader re-centres them on
//     uLight every frame, so the reticle rides the body on screen like a
//     target lock instead of floating at a fixed point;
//   • a fixed COMPASS strip of ticks under the canopy's top beam.
//
// Built as line ribbons (the struts' extrusion, hairline), consumed by
// buildCockpit's HUD mesh with cockpitHudVertexShader/FragmentShader. Each
// vertex carries aFollow: 1 = star-anchored (authored origin-relative),
// 0 = fixed (authored in absolute design px).
import * as THREE from 'three';
import { COCKPIT_W } from '../cockpitGeometry';

type Pt = [number, number];
interface HudLine {
  pts: Pt[];
  /** CSS half-px width (the HUD is hairline holography). */
  hw: number;
  /** 1 = re-centred on the star per frame, 0 = fixed design position. */
  follow: number;
  closed?: boolean;
}

const CX = COCKPIT_W / 2; // 960

function circle(cx: number, cy: number, r: number, segs = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

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

  // ── The scanner reticle (star-anchored, authored around the origin) ──────
  // Sized to sit between the finale's pale dot and the black hole's glare
  // band: big enough to ring the disk's core, small enough not to dominate
  // the dot chapter's empty glass.
  const R = 112;
  // Outer ring + a concentric inner ring (nested scanner discs).
  lines.push({ pts: circle(0, 0, R), hw: 0.6, follow: 1, closed: true });
  lines.push({ pts: circle(0, 0, R - 28), hw: 0.45, follow: 1, closed: true });
  // Radial tick ring just inside the inner disc; every 4th tick runs long.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r0 = R - 28;
    const r1 = r0 - (long ? 10 : 5);
    lines.push({
      pts: [
        [Math.cos(a) * r0, Math.sin(a) * r0],
        [Math.cos(a) * r1, Math.sin(a) * r1],
      ],
      hw: long ? 0.6 : 0.4,
      follow: 1,
    });
  }
  // Inner hex reticle — the lock mark on the body itself.
  lines.push({ pts: hex(0, 0, 22), hw: 0.6, follow: 1, closed: true });
  // Corner bracket arcs at the diagonals, just inside the outer ring.
  const br = R - 5;
  const d = Math.PI / 9;
  for (const base of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    lines.push({ pts: arc(0, 0, br, base - d, base + d, 12), hw: 0.8, follow: 1 });
  }
  // Crosshair stubs at N/E/S/W, pointing inward across the ring.
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    lines.push({
      pts: [
        [ox * (R + 10), oy * (R + 10)],
        [ox * (R - 2), oy * (R - 2)],
      ],
      hw: 0.6,
      follow: 1,
    });
  }

  // ── The compass strip (fixed, hugging the canopy's top beam) ─────────────
  const compY = 118;
  const compHalf = 300;
  for (let i = -6; i <= 6; i++) {
    const x = CX + (i / 6) * compHalf;
    const long = i % 3 === 0;
    lines.push({
      pts: [
        [x, compY],
        [x, compY + (long ? 16 : 9)],
      ],
      hw: long ? 0.7 : 0.5,
      follow: 0,
    });
  }
  lines.push({
    pts: [
      [CX - compHalf, compY],
      [CX + compHalf, compY],
    ],
    hw: 0.5,
    follow: 0,
  });

  return lines;
}

/** Extrude the HUD lines into a ribbon geometry (aPos/aNorm/aSide/aHalf/
 *  aFollow) for buildCockpit's HUD mesh. Same miter scheme as the struts. */
export function buildHudGeometry(): THREE.BufferGeometry {
  const lines = hudLines();
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const half: number[] = [];
  const follow: number[] = [];
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
        follow.push(line.follow);
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
  geo.setAttribute('aFollow', new THREE.BufferAttribute(new Float32Array(follow), 1));
  geo.setAttribute('position', geo.getAttribute('aPos'));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(960, 540, 0), 4000);
  return geo;
}
