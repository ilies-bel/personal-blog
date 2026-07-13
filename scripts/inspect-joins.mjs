// JOIN INSPECTOR — the "see every detail" battery. Eyeballing downscaled
// screenshots misses joint artifacts (the arm-crotch dash, the wrap-sill
// bloom rod were both invisible at 1x). This tool makes the check mechanical:
//
//  1. Imports cockpitGeometry.ts DIRECTLY (node >=23.6 strips types), so the
//     hairline edges it walks are the authored ones — same per-side width /
//     weight math as buildBeamRibbons. The check can never drift from the code.
//  2. Samples the screenshot's amber energy along BOTH hairline edges of every
//     beam and flags, against a rolling local median:
//       HOT  — bloom dash / converging-hairline rod (val > 2.2x local median)
//       GAP  — a hairline dies where it should be lit (val < 0.4x local median)
//       TIP  — an open beam endpoint that is neither offscreen nor buried
//              under a later-painted band's fill (a naked cap)
//       NEAR — two different beams' full-bright hairlines run < 4.5px apart
//              for a sustained stretch (bloom-bridge risk; judge the crop —
//              a tangent Y-merge is designed, a shallow crossing is not)
//  3. Emits an 8x nearest-neighbor, brightened, crosshaired crop for EVERY
//     joint (open-beam endpoints) and every flag into <outdir>/.
//
// Coverage rule mirrors the renderer: paint order = join order, so a sample
// is "covered" when it sits inside the fill footprint of a beam painted
// LATER in COCKPIT_BEAMS (its opaque fill erases whatever was there).
// Expected-dark stretches (negative per-side weight fades) are skipped.
//
// Usage: node scripts/inspect-joins.mjs <shot.png> [outdir=inspect]
//   shot.png  a shoot-cockpit.mjs screenshot (any DSF; scale is inferred)
// Exit code 1 when any flag fires — wire it into the pre-commit battery.
import { mkdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import * as G from '../src/hero/cockpitGeometry.ts';

const shot = process.argv[2];
const outdir = process.argv[3] ?? 'inspect';
if (!shot) {
  console.error('usage: node scripts/inspect-joins.mjs <shot.png> [outdir]');
  process.exit(2);
}

// ---- tunables -------------------------------------------------------------
const STEP = 2; // design px between edge samples
const MEDIAN_WIN = 21; // rolling-median window (samples) — local, so the
// angular-lighting drift along a member never trips it
const HOT_RATIO = 2.2;
const GAP_RATIO = 0.4;
const MIN_RUN = 3; // consecutive anomalous samples before it counts
const NEAR_DIST = 4.5; // design px between two bright edges
const NEAR_LEN = 16; // sustained arc length (design px) before NEAR fires
const DIM_W = 0.35; // expected weight below this = designed-dark, skip
const CROP_W = 150; // design px, crop box around each flagged point
const CROP_H = 86;
const ZOOM = 8;
const BRIGHT = 2.0;

// ---- named beams in paint order --------------------------------------------
const names = new Map();
for (const [k, v] of Object.entries(G)) {
  if (v && typeof v === 'object' && Array.isArray(v.pts) && !names.has(v)) names.set(v, k);
  if (Array.isArray(v) && k !== 'COCKPIT_BEAMS') v.forEach((b, i) => b?.pts && !names.has(b) && names.set(b, `${k}[${i}]`));
}
const beams = G.COCKPIT_BEAMS.map((b, i) => ({ beam: b, name: names.get(b) ?? `beam[${i}]`, order: i }));

// ---- image ------------------------------------------------------------------
const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const SCALE = info.width / 1920;
// Amber energy: hairlines are orange (r high, g mid, b low). Weight by actual
// red-vs-blue chroma so neutral-white DOM copy crossing a beam cannot fake a
// HOT (the old linear -b term still scored white text at ~65% intensity).
function amber(dx, dy) {
  const x = Math.min(info.width - 1.001, Math.max(0, dx * SCALE));
  const y = Math.min(info.height - 1.001, Math.max(0, dy * SCALE));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let v = 0;
  for (const [ox, oy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const i = ((y0 + oy) * info.width + (x0 + ox)) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const chroma = Math.max(0, r - b) / 255;
    v += w * Math.max(0, 0.7 * r + 0.3 * g - b) * chroma;
  }
  return v;
}

// ---- geometry helpers -------------------------------------------------------
const segsOf = (b) => (b.closed ? b.pts.length : b.pts.length - 1);
function dwAt(beam, side, x, y) {
  const fn = (side > 0 ? beam.dwPlusAt : beam.dwMinusAt) ?? beam.dwAt;
  return fn ? fn(x, y) : beam.dw;
}
function wAt(beam, side, x, y) {
  const fn = side > 0 ? beam.wPlusAt : beam.wMinusAt;
  return fn ? fn(x, y) : beam.w;
}
// Distance from a point to a beam's centreline, plus the band half-width at
// the nearest spot — the fill-footprint test.
function bandDist(beam, x, y) {
  let best = Infinity, bx = 0, by = 0;
  const n = beam.pts.length;
  for (let i = 0; i < segsOf(beam); i++) {
    const [ax, ay] = beam.pts[i], [cx, cy] = beam.pts[(i + 1) % n];
    const vx = cx - ax, vy = cy - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    const px = ax + t * vx, py = ay + t * vy;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; bx = px; by = py; }
  }
  const half = (beam.dwAt ? beam.dwAt(bx, by) : beam.dw) / 2;
  return { dist: best, half };
}
const offscreen = (x, y) => x < -2 || x > 1922 || y < -2 || y > 1082;
const belowScreen = new Set(G.COCKPIT_BEAMS_BELOW_SCREEN ?? []);
function inOrOnPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    if (Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) <= 3) return true;
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
// Covered = erased by a LATER-painted beam's opaque fill.
function covered(order, x, y) {
  if (offscreen(x, y)) return true;
  // The live/reduced renderers intentionally split the deck batch around the
  // physical screen glass: lower plate ridges are painted, then PANEL_SCREEN
  // occludes them, then the screen bezel and upper frame are painted.
  if (belowScreen.has(beams[order].beam) && inOrOnPolygon(G.PANEL_SCREEN, x, y)) return true;
  for (let j = order + 1; j < beams.length; j++) {
    const { dist, half } = bandDist(beams[j].beam, x, y);
    if (dist <= half - 1.0) return true;
  }
  return false;
}

// ---- walk every hairline edge ------------------------------------------------
// sample: { x, y, dirx, diry, val, exp, cov, beamIdx, side, s (arc pos) }
const edges = []; // one entry per beam side: { key, beamIdx, side, samples }
beams.forEach(({ beam, order }, beamIdx) => {
  for (const side of [1, -1]) {
    const samples = [];
    let s = 0;
    const n = beam.pts.length;
    for (let i = 0; i < segsOf(beam); i++) {
      const [ax, ay] = beam.pts[i], [cx, cy] = beam.pts[(i + 1) % n];
      const len = Math.hypot(cx - ax, cy - ay);
      if (len < 1e-6) continue;
      const dx = (cx - ax) / len, dy = (cy - ay) / len;
      const nx = -dy, ny = dx; // +normal, same convention as buildBeamRibbons
      for (let t = 0; t < len; t += STEP) {
        const px = ax + dx * t, py = ay + dy * t;
        const ex = px + nx * side * (dwAt(beam, side, px, py) / 2);
        const ey = py + ny * side * (dwAt(beam, side, px, py) / 2);
        samples.push({
          x: ex, y: ey, dirx: dx, diry: dy, s: s + t,
          val: amber(ex, ey),
          exp: Math.max(0, 0.45 + 0.55 * wAt(beam, side, px, py)),
          cov: covered(order, ex, ey),
          beamIdx, side,
        });
      }
      s += len;
    }
    edges.push({ key: `${beams[beamIdx].name}${side > 0 ? '+' : '-'}`, beamIdx, side, samples });
  }
});

// ---- flags --------------------------------------------------------------------
const flags = []; // { type, key, x, y, s0, s1, note }
for (const edge of edges) {
  const live = edge.samples.filter((p) => !p.cov && p.exp > DIM_W);
  if (live.length < MEDIAN_WIN) continue;
  // Normalize by the authored per-side energy so a designed fade never reads
  // as an anomaly against its full-bright neighbours.
  const vals = live.map((p) => p.val / p.exp);
  const medAt = (i) => {
    const a = Math.max(0, i - (MEDIAN_WIN >> 1));
    const w = vals.slice(a, a + MEDIAN_WIN).slice().sort((x, y) => x - y);
    return w[w.length >> 1];
  };
  let run = null;
  const flush = () => {
    if (run && run.n >= MIN_RUN) {
      const m = run.pts[run.pts.length >> 1];
      flags.push({ type: run.type, key: edge.key, x: m.x, y: m.y, s0: run.pts[0].s, s1: run.pts[run.pts.length - 1].s, note: `peak ${run.peak.toFixed(0)} vs local ${run.med.toFixed(0)}` });
    }
    run = null;
  };
  live.forEach((p, i) => {
    const med = medAt(i), v = vals[i];
    const type = med > 25 && v < Math.min(GAP_RATIO * med, med - 40) ? 'GAP'
      : v > Math.max(HOT_RATIO * med, med + 45) ? 'HOT' : null;
    if (type && run?.type === type) { run.n++; run.pts.push(p); run.peak = type === 'HOT' ? Math.max(run.peak, v) : Math.min(run.peak, v); }
    else { flush(); if (type) run = { type, n: 1, pts: [p], peak: v, med }; }
  });
  flush();
}

// NEAR: sustained closeness between different beams' bright, uncovered edges.
const CELL = 8;
const grid = new Map();
for (const e of edges) for (const p of e.samples) {
  if (p.cov || p.exp < DIM_W) continue;
  const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
  (grid.get(k) ?? grid.set(k, []).get(k)).push(p);
}
for (const edge of edges) {
  let run = null;
  const flush = () => {
    if (run && run.len >= NEAR_LEN) {
      const m = run.pts[run.pts.length >> 1];
      flags.push({ type: 'NEAR', key: edge.key, x: m.x, y: m.y, s0: run.pts[0].s, s1: run.pts[run.pts.length - 1].s, note: `~${run.minD.toFixed(1)}px from ${run.other}, angle ${run.ang.toFixed(0)}deg` });
    }
    run = null;
  };
  for (const p of edge.samples) {
    if (p.cov || p.exp < DIM_W) { flush(); continue; }
    let hit = null, hd = NEAR_DIST;
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const q of grid.get(`${gx},${gy}`) ?? []) {
        if (q.beamIdx === p.beamIdx) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < hd) { hd = d; hit = q; }
      }
    }
    if (hit) {
      const ang = (Math.acos(Math.min(1, Math.abs(p.dirx * hit.dirx + p.diry * hit.diry))) * 180) / Math.PI;
      const other = beams[hit.beamIdx].name;
      if (run && run.other === other) { run.pts.push(p); run.len = p.s - run.pts[0].s; run.minD = Math.min(run.minD, hd); run.ang = ang; }
      else { flush(); run = { pts: [p], len: 0, minD: hd, ang, other }; }
    } else flush();
  }
  flush();
}

// TIP: open-beam endpoints that end naked in the frame.
const joints = []; // every open endpoint gets a crop regardless
beams.forEach(({ beam, name, order }) => {
  if (beam.closed) return;
  for (const which of ['a', 'b']) {
    const [x, y] = which === 'a' ? beam.pts[0] : beam.pts[beam.pts.length - 1];
    if (offscreen(x, y)) continue;
    joints.push({ name: `joint-${name}-${which}`, x, y });
    // A tip whose hairlines are faded dark on BOTH sides is a designed
    // fade-out end (no visible cap) — only lit tips must be buried.
    const lit = Math.max(0.45 + 0.55 * wAt(beam, 1, x, y), 0.45 + 0.55 * wAt(beam, -1, x, y));
    if (lit > 0.15 && !covered(order, x, y)) flags.push({ type: 'TIP', key: name, x, y, s0: 0, s1: 0, note: 'lit endpoint not buried under any later band' });
  }
});

// ---- crops ----------------------------------------------------------------------
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
async function crop(cx, cy, file) {
  const left = Math.round(Math.max(0, Math.min(1920 - CROP_W, cx - CROP_W / 2)) * SCALE);
  const top = Math.round(Math.max(0, Math.min(1080 - CROP_H, cy - CROP_H / 2)) * SCALE);
  const w = Math.round(CROP_W * SCALE), h = Math.round(CROP_H * SCALE);
  const ow = Math.round((w * ZOOM) / SCALE) * (SCALE < 1 ? 1 : 1), oh = Math.round((h * ZOOM) / SCALE);
  const mx = (cx * SCALE - left) * (ZOOM / SCALE), my = (cy * SCALE - top) * (ZOOM / SCALE);
  const ring = Buffer.from(`<svg width="${ow}" height="${oh}"><circle cx="${mx}" cy="${my}" r="26" fill="none" stroke="#00e5ff" stroke-width="2" opacity="0.85"/></svg>`);
  await sharp(shot)
    .extract({ left, top, width: w, height: h })
    .resize(ow, oh, { kernel: 'nearest' })
    .linear(BRIGHT, 0)
    .composite([{ input: ring, left: 0, top: 0 }])
    .toFile(`${outdir}/${file}`);
}
let n = 0;
for (const f of flags) await crop(f.x, f.y, `${f.type}-${String(++n).padStart(2, '0')}-${f.key.replace(/[^\w+-]/g, '_')}.png`);
for (const j of joints) await crop(j.x, j.y, `${j.name.replace(/[^\w+-]/g, '_')}.png`);

// ---- report -----------------------------------------------------------------------
console.log(`scanned ${edges.length} hairline edges of ${beams.length} beams @ scale ${SCALE}`);
for (const f of flags) console.log(`${f.type.padEnd(4)} ${f.key.padEnd(18)} at (${f.x.toFixed(0)},${f.y.toFixed(0)}) s=${f.s0.toFixed(0)}..${f.s1.toFixed(0)}  ${f.note}`);
// NEAR is advisory (tangent merges are the designed junction grammar; judge
// the crop) — only HOT / GAP / TIP gate the exit code.
const hard = flags.filter((f) => f.type !== 'NEAR').length;
console.log(`${flags.length} flag(s) (${hard} hard); ${joints.length} joint crop(s) -> ${outdir}/`);
process.exit(hard ? 1 : 0);
