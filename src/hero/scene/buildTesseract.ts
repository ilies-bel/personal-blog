// Tesseract bookcase lattice — a self-contained mini-scene (NOT wired into the heavy
// hero createScene). It owns ONE WebGLRenderer + PerspectiveCamera + rAF loop drawing a
// dense lattice of SOLID EXTRUDED BEAMS (thin boxes) arranged as nested rectangular
// "rooms"/frames receding down the view axis — the backs of bookshelves stacked in deep
// parallel planes, the Interstellar tesseract. Real three.js geometry (one InstancedMesh
// of unit boxes, per-instance transform + colour), not a raymarch.
//
// The camera sits INSIDE the lattice looking down -Z toward a luminous vanishing point;
// depth haze + a fullscreen core-glow pass resolve the far beams into a glowing core.
// MATERIALS: warm wood-brown + tarnished steel + graphite, lit by a bright core light so
// edges/gaps glow (light leaking between shelves). Beams are elongated + carry an along-
// length streak so they read motion-blurred like the film.
//
// The handle below owns the rAF loop, the pointer look-lerp, an ambient push-in, resize,
// visibility-pause and disposal — same rig idiom as the other build*.ts factories
// (exported handle interface + dispose). The mounting component drives setLook() from the
// pointer and renderOnce() under reduced motion.
import * as THREE from 'three';
import {
  tesseractBeamVert,
  tesseractBeamFrag,
  tesseractGlowVert,
  tesseractGlowFrag,
} from '../shaders/tesseract.glsl';

/** Public handle returned by buildTesseract — the surface the mounting script uses. */
export interface TesseractRig {
  /** The renderer's canvas. The caller appends it (or passes its own — see options). */
  canvas: HTMLCanvasElement;
  /** Start the rAF loop (lerps look, advances time + push-in, renders each frame). */
  start: () => void;
  /** Stop the rAF loop. Idempotent. The GL context stays alive (call dispose to free). */
  stop: () => void;
  /** Render exactly one frame without starting the loop (reduced-motion / static use). */
  renderOnce: () => void;
  /** Set the pointer look-around TARGET in -1..1 (centre = 0,0). The loop eases toward it. */
  setLook: (x: number, y: number) => void;
  /** Resize the renderer + camera to a CSS pixel box (DPR is capped internally). */
  resize: (width: number, height: number) => void;
  /** Tear down: stop the loop, drop listeners, dispose geometry/materials/renderer. */
  dispose: () => void;
}

export interface TesseractOptions {
  /** Render into this canvas instead of the renderer creating its own. */
  canvas?: HTMLCanvasElement;
  /** Max device-pixel-ratio (perf cap). Defaults to 2. */
  maxPixelRatio?: number;
  /** Master brightness / exposure (keep it dim/atmospheric so reading text stays legible). */
  dim?: number;
}

// --- lattice tuning ---------------------------------------------------------
// A nested-frame "square shaft" of beams. FRAMES rings recede along -Z; perspective
// nests them toward the vanishing point. Each ring edge is a STACK of shelf-back beams
// (BEAMS_PER_EDGE), and short side-wall connectors between rings close the box so it
// reads as a 3D tube, not floating targets.
// The shaft runs along -Z toward the vanishing point. Its DOMINANT feature is the four
// walls, each a dense field of long beams running ALONG Z (toward the core) — the
// motion-blurred shelf edges that streak to the vanishing point. Perpendicular CROSS
// beams at each frame depth band the streaks and define the nested rectangular openings.
const SHAFT_LEN = 120; // total depth of the shaft (world units, -Z)
const SHAFT_HALF = 5.4; // half-width of the square inner opening
// --- streak walls (beams running ALONG Z) ---
const WALL_STREAKS = 30; // streaks across each wall's WIDTH (position along the wall)
const WALL_LAYERS = 4; // shelves stacked INWARD (stepped radius) per wall → wall depth
const WALL_LAYER_STEP = 0.5; // radial step between stacked shelf layers (dark gap between)
const STREAK_SEGS = 5; // segments each streak is broken into down the depth (longer, continuous)
// --- cross rings (perpendicular beams defining the nested frame openings) ---
const RINGS = 20; // perpendicular cross-frames down the shaft
const RING_GAP = SHAFT_LEN / RINGS; // Z spacing between cross-frames
const RING_BEAMS = 6; // stacked cross-beams per ring edge (a banded frame, not one line)

interface BeamSpec {
  // world transform
  px: number;
  py: number;
  pz: number;
  // half-extents BEFORE rotation: long axis is local X
  lenX: number;
  thickY: number;
  thickZ: number;
  rotZ: number; // rotate in the XY plane (0 = horizontal beam, π/2 = vertical)
  // shading attributes
  axis: THREE.Vector3; // local long axis after rotation, in object space (unit)
  hue: number; // -1..1 warm→cool
  streak: number; // 0..1
  depth: number; // 0..1 normalised frame depth
  color: THREE.Color;
}

// Palette: warm wood-brown, tarnished steel, graphite. Picked per beam with a bias so
// wood dominates (the shelves) and steel/graphite punctuate (the rails between).
const WOOD = [
  new THREE.Color(0.22, 0.14, 0.075),
  new THREE.Color(0.28, 0.18, 0.095),
  new THREE.Color(0.18, 0.115, 0.065),
  new THREE.Color(0.33, 0.22, 0.12),
];
const STEEL = [
  new THREE.Color(0.24, 0.235, 0.235), // tarnished, near-neutral (not green)
  new THREE.Color(0.31, 0.30, 0.30),
];
const GRAPHITE = [
  new THREE.Color(0.085, 0.085, 0.09),
  new THREE.Color(0.12, 0.115, 0.115),
];
const ACCENT = [
  new THREE.Color(0.40, 0.10, 0.08), // deep red book-spine glint
  new THREE.Color(0.38, 0.28, 0.085), // dull gold
  new THREE.Color(0.10, 0.26, 0.24), // tarnished teal spine
];

function pickColor(rng: () => number): { color: THREE.Color; hue: number; streak: number } {
  const r = rng();
  let color: THREE.Color;
  let hue: number;
  if (r < 0.46) {
    color = WOOD[Math.floor(rng() * WOOD.length)].clone();
    hue = -(0.4 + rng() * 0.6); // warm
  } else if (r < 0.74) {
    color = STEEL[Math.floor(rng() * STEEL.length)].clone();
    hue = 0.4 + rng() * 0.6; // cool
  } else if (r < 0.93) {
    color = GRAPHITE[Math.floor(rng() * GRAPHITE.length)].clone();
    hue = rng() * 0.4 - 0.2;
  } else {
    color = ACCENT[Math.floor(rng() * ACCENT.length)].clone();
    hue = -0.3;
  }
  const streak = 0.4 + rng() * 0.6;
  return { color, hue, streak };
}

// Deterministic small PRNG so the lattice is identical every mount (and matches captures).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// alongZ-tagged spec (a beam whose LONG axis runs down the depth toward the core; the
// matrix builder lays the local-X-long box onto world-Z for these).
type ZSpec = BeamSpec & { alongZ?: boolean };

const depthOf = (z: number): number => Math.min(1, Math.max(0, -z / SHAFT_LEN));

// The four walls of the square shaft. `axisA` slides a beam ALONG the wall (its in-plane
// width); `radius` is the fixed perpendicular distance of the wall from the centre, with
// `sign` choosing the wall. `vertical` = left/right walls (beams run vertically when they
// are cross-beams; the streak beams always run along Z regardless).
interface Wall {
  vertical: boolean;
  sign: number;
}
const WALLS: Wall[] = [
  { vertical: false, sign: 1 }, // top    (y = +half)
  { vertical: false, sign: -1 }, // bottom (y = -half)
  { vertical: true, sign: -1 }, // left   (x = -half)
  { vertical: true, sign: 1 }, // right  (x = +half)
];

// Build the lattice: dense STREAK walls (beams running along Z) + perpendicular CROSS
// rings that band the streaks into nested rectangular openings.
function buildBeams(): BeamSpec[] {
  const rng = mulberry32(0x7e55e7);
  const beams: BeamSpec[] = [];

  // ---------------------------------------------------------------------------
  // (A) STREAK WALLS — long thin beams running ALONG Z toward the vanishing point.
  // For each wall: a field of WALL_STREAKS across its width × WALL_LAYERS stepped
  // inward (shelf depth), each streak broken into STREAK_SEGS staggered segments so the
  // wall reads as a dense barcode of motion-streaks with dark gaps, not a smooth plane.
  // ---------------------------------------------------------------------------
  for (const wall of WALLS) {
    for (let layer = 0; layer < WALL_LAYERS; layer++) {
      // shelf layers step INWARD from the inner opening; a dark gap shows between layers.
      const radius = SHAFT_HALF - layer * WALL_LAYER_STEP;
      for (let s = 0; s < WALL_STREAKS; s++) {
        // position across the wall width, spanning a touch past the corners, with a
        // per-streak jitter + occasional CLUMPING (streaks bunch then leave a wide gap)
        // so the wall is an irregular thicket, not an even comb.
        const evenAlong = ((s + 0.5) / WALL_STREAKS - 0.5) * (SHAFT_HALF * 2.3);
        const clump = (rng() - 0.5) * (SHAFT_HALF * 0.16);
        const along = evenAlong + clump;
        // break the streak into staggered segments down the depth. Segments OVERLAP
        // (segLen > slice) so each streak reads as a long continuous motion-streak whose
        // bright/dark flicker comes from the shader ripple, not from geometry gaps.
        for (let seg = 0; seg < STREAK_SEGS; seg++) {
          if (rng() < 0.08) continue; // a few missing segments → irregular, gappy walls
          const segLen = (SHAFT_LEN / STREAK_SEGS) * (1.15 + rng() * 0.5); // overlap → continuous
          const zCenter = -((seg + 0.5) / STREAK_SEGS) * SHAFT_LEN + (rng() - 0.5) * 3.5;
          const { color, hue, streak } = pickColor(rng);
          const thick = 0.045 + rng() * 0.085; // thin so dark gaps survive between streaks
          const thickPerp = 0.06 + rng() * 0.1;
          const rJit = (rng() - 0.5) * 0.2;
          const aJit = (rng() - 0.5) * 0.14;

          const spec: ZSpec = wall.vertical
            ? {
                px: wall.sign * (radius + rJit),
                py: along + aJit,
                pz: zCenter,
                lenX: segLen,
                thickY: thickPerp, // perpendicular into the wall
                thickZ: thick, // thin across the wall width
                rotZ: 0,
                axis: new THREE.Vector3(1, 0, 0),
                hue,
                streak: 0.7 + streak * 0.3, // streak walls read most streaked
                depth: depthOf(zCenter),
                color,
              }
            : {
                px: along + aJit,
                py: wall.sign * (radius + rJit),
                pz: zCenter,
                lenX: segLen,
                thickY: thick,
                thickZ: thickPerp,
                rotZ: 0,
                axis: new THREE.Vector3(1, 0, 0),
                hue,
                streak: 0.7 + streak * 0.3,
                depth: depthOf(zCenter),
                color,
              };
          spec.alongZ = true;
          beams.push(spec);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // (B) CROSS RINGS — perpendicular beams at each frame depth that band the streaks and
  // draw the nested rectangular openings. Each ring edge is a small STACK of cross-beams
  // (RING_BEAMS) at stepped radii so the frame reads as a banded rail, not a thin line.
  // ---------------------------------------------------------------------------
  for (let ringIdx = 0; ringIdx < RINGS; ringIdx++) {
    // per-ring depth jitter so the cross-frames are NOT an even comb (the film's frames
    // bunch and spread irregularly down the shaft).
    const zRing = -(ringIdx + 0.5) * RING_GAP + (rng() - 0.5) * RING_GAP * 0.55;
    const depth = depthOf(zRing);
    const baseHalf = SHAFT_HALF * (1.0 + (rng() - 0.5) * 0.05);

    for (const wall of WALLS) {
      for (let b = 0; b < RING_BEAMS; b++) {
        // stack the ring's cross-beams inward (stepped radius) so the frame is a banded
        // rail; the outermost sits at the opening, inner ones step toward the centre.
        const radius = baseHalf - b * (WALL_LAYER_STEP * 0.9) - (rng() - 0.5) * 0.06;
        const { color, hue, streak } = pickColor(rng);
        const lenX = baseHalf * (2.0 + (rng() - 0.5) * 0.35); // spans the wall, overshoots corners
        const thick = 0.06 + rng() * 0.1; // thin cross-rail
        const thickZ = 0.14 + rng() * 0.16; // a little depth so it catches the core light
        const slide = (rng() - 0.5) * baseHalf * 0.35;
        const zJit = (rng() - 0.5) * 0.7;

        const spec: BeamSpec = wall.vertical
          ? {
              px: wall.sign * radius,
              py: slide,
              pz: zRing + zJit,
              lenX,
              thickY: thickZ, // depth along Z
              thickZ: thick, // thin across width
              rotZ: Math.PI / 2, // vertical cross-beam (long axis vertical)
              // local long axis is always X (box scaled long on X); instance rotation
              // orients it to vertical in world. aBeamAxis stays local → X.
              axis: new THREE.Vector3(1, 0, 0),
              hue,
              streak: streak * 0.5, // cross-rails are LESS streaked (they go across)
              depth,
              color,
            }
          : {
              px: slide,
              py: wall.sign * radius,
              pz: zRing + zJit,
              lenX,
              thickY: thick,
              thickZ,
              rotZ: 0,
              axis: new THREE.Vector3(1, 0, 0),
              hue,
              streak: streak * 0.5,
              depth,
              color,
            };
        beams.push(spec);
      }
    }
  }

  return beams;
}

export function buildTesseract(options: TesseractOptions = {}): TesseractRig {
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  const dim = options.dim ?? 0.62;

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: true, // real edges this time — AA keeps the beams crisp, not jaggy
    alpha: false, // opaque: the lattice is the bottom layer, nothing behind it
    powerPreference: 'low-power', // ambient backdrop, not the showpiece
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.setClearColor(0x05_04_06, 1);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();

  // Camera INSIDE the shaft, looking down -Z toward the vanishing point.
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, -40);

  // --- beam geometry: ONE InstancedMesh of unit boxes ---
  const beams = buildBeams();
  const count = beams.length;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  const uniforms: Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uDim: { value: dim },
    uCore: { value: 0.85 }, // key light from the core (the only real light source)
    uFogDensity: { value: 0.009 }, // far beams stay dark; only the deep CORE glows
    uCoreColor: { value: new THREE.Color(1.0, 0.82, 0.52) },
    uFogColor: { value: new THREE.Color(0.075, 0.055, 0.04) }, // far wash is near-black warm murk
    uEdgeLeak: { value: 0.22 }, // thin bright seam, kept low so additive stacking stays dark
    uStreakAmt: { value: 1.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: tesseractBeamVert,
    fragmentShader: tesseractBeamFrag,
  });

  const mesh = new THREE.InstancedMesh(boxGeo, material, count);
  mesh.frustumCulled = false;

  // per-instance custom attributes
  const aBeamAxis = new Float32Array(count * 3);
  const aHue = new Float32Array(count);
  const aStreak = new Float32Array(count);
  const aDepth = new Float32Array(count);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const colorArr = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const beam = beams[i];
    const alongZ = (beam as BeamSpec & { alongZ?: boolean }).alongZ === true;

    pos.set(beam.px, beam.py, beam.pz);
    if (alongZ) {
      // lay the X-long box along Z: rotate about Y by 90°.
      e.set(0, Math.PI / 2, 0);
      scl.set(beam.lenX, beam.thickY, beam.thickZ);
    } else {
      e.set(0, 0, beam.rotZ);
      scl.set(beam.lenX, beam.thickY, beam.thickZ);
    }
    q.setFromEuler(e);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);

    colorArr.copy(beam.color);
    mesh.setColorAt(i, colorArr);

    aBeamAxis[i * 3 + 0] = beam.axis.x;
    aBeamAxis[i * 3 + 1] = beam.axis.y;
    aBeamAxis[i * 3 + 2] = beam.axis.z;
    aHue[i] = beam.hue;
    aStreak[i] = beam.streak;
    aDepth[i] = beam.depth;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  boxGeo.setAttribute('aBeamAxis', new THREE.InstancedBufferAttribute(aBeamAxis, 3));
  boxGeo.setAttribute('aHue', new THREE.InstancedBufferAttribute(aHue, 1));
  boxGeo.setAttribute('aStreak', new THREE.InstancedBufferAttribute(aStreak, 1));
  boxGeo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(aDepth, 1));

  scene.add(mesh);

  // --- fullscreen core-glow pass (additive, drawn after the beams) ---
  const glowUniforms: Record<string, { value: unknown }> = {
    uLook: { value: new THREE.Vector2(0, 0) },
    uAspect: { value: 1 },
    uCoreColor: { value: new THREE.Color(1.0, 0.82, 0.54) },
    uDim: { value: dim },
    uGlow: { value: 0.6 }, // a warm luminous vanishing point that pulls the eye in
  };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: tesseractGlowVert,
    fragmentShader: tesseractGlowFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const glowQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowMat);
  glowQuad.frustumCulled = false;
  glowQuad.renderOrder = 2;
  const glowScene = new THREE.Scene();
  glowScene.add(glowQuad);
  const glowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Pointer look — TARGET (set by the caller) and the eased CURRENT (lerped each frame).
  const lookTarget = new THREE.Vector2(0, 0);
  const lookCurrent = new THREE.Vector2(0, 0);

  let rafId = 0;
  let running = false;
  let lastT = 0;
  let advance = 0; // ambient push-in along Z, wraps over one FRAME_GAP

  const resize = (width: number, height: number): void => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    glowUniforms.uAspect.value = w / h;
  };

  // Apply the eased look + push-in to the camera, then render the beams + glow.
  const renderFrame = (): void => {
    // The camera sits OFF the central axis (toward a corner) and aims at an off-centre
    // vanishing point — the diagonal "looking down the shaft" tesseract comp, so one set
    // of walls comes CLOSE (big, streaked near-beams) while the opposite recedes. The
    // pointer look-around pans that base offset so you peer around inside the lattice.
    const baseX = 0.8; // SLIGHTLY off-centre (the dark opening still dominates the frame)
    const baseY = 0.6;
    const panX = baseX + lookCurrent.x * 1.8;
    const panY = baseY - lookCurrent.y * 1.4;
    // gentle bounded breathe IN/OUT along Z (stays well inside the finite shaft). The
    // camera sits a touch back from the mouth so the dark vanishing-point opening reads.
    const z = 6.0 - 4.0 * (0.5 - 0.5 * Math.cos(advance * 0.12));
    camera.position.set(panX, panY, z);
    // aim down the shaft toward the vanishing point, sheared by the look.
    camera.lookAt(-baseX * 0.3 + lookCurrent.x * 3.2, -baseY * 0.3 - lookCurrent.y * 2.6, z - 44);

    (glowUniforms.uLook.value as THREE.Vector2).copy(lookCurrent);

    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(glowScene, glowCam);
    renderer.autoClear = true;
  };

  const renderOnce = (): void => {
    renderFrame();
  };

  const frame = (now: number): void => {
    if (!running) return;
    const dt = lastT === 0 ? 0.016 : Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    // ease the look toward the pointer target (smooth peer-around, never snaps)
    lookCurrent.x += (lookTarget.x - lookCurrent.x) * 0.05;
    lookCurrent.y += (lookTarget.y - lookCurrent.y) * 0.05;

    uniforms.uTime.value = (uniforms.uTime.value as number) + dt;

    // ambient drift: a slow, bounded push IN and OUT along Z so the lattice breathes
    // toward the core and back. The shaft is finite (0 → -SHAFT_LEN), so we oscillate
    // (never wrap) and stay well inside it — endless gentle motion, no jump.
    advance += dt;

    renderFrame();
    rafId = window.requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    lastT = 0;
    rafId = window.requestAnimationFrame(frame);
  };

  const stop = (): void => {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const setLook = (x: number, y: number): void => {
    lookTarget.set(x, y);
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      stop();
    } else if (!running) {
      start();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const dispose = (): void => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    boxGeo.dispose();
    material.dispose();
    glowQuad.geometry.dispose();
    glowMat.dispose();
    mesh.dispose();
    scene.remove(mesh);
    glowScene.remove(glowQuad);
    renderer.dispose();
  };

  return { canvas, start, stop, renderOnce, setLook, resize, dispose };
}
