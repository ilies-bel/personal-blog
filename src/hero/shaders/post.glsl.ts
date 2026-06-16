// Post-processing passes: film grade + supernova whiteout.
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 },
    uGrain: { value: 0.05 },
    uWarmth: { value: 0.05 },
    uSat: { value: 0.1 },
    uOlive: { value: 0.6 },
    // Reinhard tone-map denominator. LOWER = less highlight compression = brighter.
    // 0.78 is the filmic default for the black hole (protects the white nova core);
    // the red giant lowers it so its deep-red photosphere reads as a solid glowing
    // surface instead of being crushed toward black by the compression.
    uToneComp: { value: 0.78 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGrain, uWarmth, uSat, uOlive, uToneComp;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
      // soft tone map (preserves the white core). uToneComp is the compression
      // denominator — lower for the red giant so its deep red isn't crushed to black.
      col = col / (col + vec3(uToneComp));
      col = pow(col, vec3(0.92));
      // desaturate -> grey
      float luma = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(luma), col, uSat);
      // slight warm tint in the highlights
      col *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth*0.85);
      // COLD-SILVER tint of the background + halo falloff (ITEM 2). The black-hole
      // spec is cold: bg #030405, dust #11151A, accent #9EA8B8 — a near-monochrome
      // silver/black room, gravitational and EMPTY, with NO warm bone. uOlive (kept as
      // the uniform name for back-compat) now drives a COOL grade: BLUE sits highest
      // and red is pulled DOWN, so the shadows go cold silver-graphite, the eye-reset
      // opposite of the warm red/yellow chapters. This is gated per-state by look.olive
      // (≈0 in every later state, full only at the black hole), so the cold cast NEVER
      // warm- or cold-bleeds into the other chapters.
      float shW = 1.0 - smoothstep(0.0, 0.5, luma);          // weight in the shadows
      col *= mix(vec3(1.0), vec3(0.92, 0.97, 1.04), uOlive*shW);  // cool silver-blue shadow cast
      col += vec3(0.011, 0.013, 0.016) * uOlive;             // cold-graphite floor (faint blue-silver, #11151A family)
      col += vec3(0.004, 0.0045, 0.005);                     // slight cool-neutral floor
      // fine grain
      float g = hash(vUv*uResolution + fract(uTime)*97.0);
      col += (g-0.5)*uGrain;
      // vignette
      vec2 q = vUv-0.5;
      float vig = smoothstep(1.10, 0.28, length(q)*1.25);
      col *= mix(0.66, 1.0, vig);
      col = clamp(col,0.0,1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `,
};

// ===========================================================================
//  NOVA SHADER — the supernova whiteout, composited AFTER the grade pass.
//
//  The reverse-supernova's defining beat is a blinding flash that bleaches the
//  WHOLE screen. The grade pass above can't produce that: its tone-map
//  (col/(col+0.78)), warm/olive tints, vignette and final clamp all conspire to
//  keep the frame filmic and the corners dark. So the whiteout is a dedicated
//  fullscreen pass that runs on the ALREADY-GRADED image and mixes it toward
//  white by `uNova` (a time-based 0..1 envelope, driven from the frame loop,
//  decoupled from scroll so a fast scroller still sees the full blast).
//
//  Structure (user-chosen): a radial hot-center that grows outward with the
//  envelope, a temperature tint that runs blue-white at the peak and cools to
//  amber as it fades (handing off into the warm debris grade beneath), and a
//  FILMIC cap (uPeak ≈ 0.94) so even peak white stays a touch under pure #FFF
//  to match the rest of the tone-mapped scene.
//
//  SHOCKWAVE (uShock): on top of the soft filled `front` bleach, a distinct
//  bright RING sweeps outward from the blast origin — the visible shock front of
//  the supernova (cf. the SN1987A equatorial ring), the cinematic headline beat.
//  Its radius tracks the SAME envelope as the front (so ring + bleach stay locked
//  together), it thins/brightens at its leading edge, and it carries the same
//  warm-white→amber tint so it fuses with the flash rather than reading as a
//  separate overlay. It is fully reversible: on IMPLODE the ring contracts back
//  toward the origin, the exact mirror of the outward sweep. uShock scales it (0
//  disables the ring entirely, restoring the original filled-bleach behaviour).
//
//  The ring is LATERAL (uShockFlat): the blast sweeps out along the EQUATORIAL
//  disk plane — a wide horizontal ellipse, far to the left/right and shallow
//  top-to-bottom — rather than a round ball, so it reads as the disk itself
//  blasting outward (matching the reference). uShockFlat is the vertical squash
//  (1 = round, >1 = flatter/more lateral); only the ring is flattened, the
//  round screen-flash whiteout above is unchanged.
//
//  DIRECTION (uNovaDir): the blast is mirrored per scroll direction.
//   • +1 EXPLODE (scroll UP, red giant → black hole, time running FORWARD): a
//     bright core erupts and its white front sweeps OUTWARD (center → edges),
//     blue-white at the peak then cooling to amber as it dissipates. This is the
//     original behaviour and is reproduced bit-for-bit.
//   • -1 IMPLODE (scroll DOWN, black hole → red giant, time running BACKWARD):
//     the "un-explosion". The envelope is the same 0→1→0 intensity (you can't
//     emit negative light), but the front COLLAPSES inward — it starts as a wide
//     ring at the edges and contracts to the center as the envelope rises — and
//     the temperature gathers cool then SNAPS blue-white at the peak (the exact
//     time-reverse of the explode cooldown). At the peak both directions reach
//     the same edge-to-edge bleach, so the handoff into/out of white is seamless.
// ===========================================================================

export const NovaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uNova: { value: 0 },                                  // 0..1 master envelope
    uNovaDir: { value: 1 },                               // +1 explode / -1 implode
    uAspect: { value: 1 },                                // round (not elliptical) falloff
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },      // blast origin in screen UV
    uPeak: { value: 0.94 },                               // filmic cap (NOT pure white)
    uShock: { value: 0.82 },                              // expanding shock-ring intensity (0 = off) — dimmed for a moodier read
    uShockDeg: { value: 26.0 },                           // disk inclination in DEGREES from edge-on (low = flatter/more edge-on)
    uShockWide: { value: 1.5 },                           // lateral stretch (>1 = wider/more sideways slab)
    uShockPersp: { value: 0.85 },                         // 3D perspective tilt strength (0 = flat ellipse, ~1 = strong near/far asymmetry)
    uShockRoll: { value: 18.0 },                          // in-plane ROLL in degrees — slants the disk's long axis diagonally across the frame
    uTime: { value: 0 },                                  // wall-clock, drives the turbulent gas animation
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uNova, uNovaDir, uAspect, uPeak, uShock, uShockDeg, uShockWide, uShockPersp, uShockRoll, uTime;
    uniform vec2 uCenter;
    varying vec2 vUv;
    #define PI 3.14159265
    // --- value-noise fbm for the turbulent shock gas (cheap, GPU-friendly) ---
    float hashN(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p, p+34.5); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      float a = hashN(i), b = hashN(i+vec2(1.0,0.0));
      float c = hashN(i+vec2(0.0,1.0)), dd = hashN(i+vec2(1.0,1.0));
      return mix(mix(a,b,u.x), mix(c,dd,u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
      return v;
    }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // distance from the blast origin, aspect-corrected so the front is a
      // circle, not an ellipse on a wide viewport.
      vec2 q = (vUv - uCenter); q.x *= uAspect;
      float d = length(q);
      bool implode = uNovaDir < 0.0;
      // RADIAL FRONT.
      //  explode: the white front expands OUTWARD as the envelope grows — bright
      //    inside the radius (uNova*1.4), soft 0.45 falloff so it reads as light.
      //  implode: the front COLLAPSES INWARD. As the envelope rises the lit region
      //    shrinks from the whole frame down to the center: it's white OUTSIDE a
      //    radius that contracts from far (edges) to 0 (center). Same 0.45 soft
      //    edge, mirrored. This is the un-explosion's gathering shell of light.
      float front = implode
        ? smoothstep((1.0 - uNova) * 1.4, (1.0 - uNova) * 1.4 + 0.45, d)
        : smoothstep(uNova * 1.4, uNova * 1.4 - 0.45, d);
      // Keep the flash radial and cinematic: bright around the origin/front, with
      // the corners protected so the beat never reads as a flat loading whiteout.
      // Tighter edge guard (1.00→0.18) keeps the OUTER frame darker so the blast
      // reads as a glowing ball, not an edge-to-edge wash. A small hot core bloom
      // adds punch at the centre without flooding the screen.
      float edgeGuard = smoothstep(1.00, 0.18, d);
      float coreBloom = smoothstep(0.88, 1.0, uNova) * smoothstep(0.58, 0.0, d) * 0.20;
      // The big FILLED whiteout used to be the whole supernova; now the turbulent gas disk
      // (below) is the headline, so the filled flash is pulled WAY down (×0.28) — it would
      // otherwise wash the disk's interior flat grey. What survives is a restrained warm
      // bloom at the very centre so the detonation still flashes, but the disk reads against
      // dark space, cinematic. coreBloom keeps the tight central punch.
      float bleach = max(uNova * front * edgeGuard * 0.28, coreBloom) * uPeak;
      // ============================ INCLINED SHOCK GAS DISK ============================
      // The blast is a turbulent ring of incandescent gas lying in a flat plane TILTED in 3D
      // toward the camera, so it reads as a real disk receding INTO the frame (Saturn-rings
      // perspective) — NOT a flat squashed oval painted on the glass. We do a true camera
      // RAY → DISK-PLANE intersection: build a view ray for each pixel, intersect it with the
      // tilted plane, and sample the turbulent gas at the 3D hit point. That gives genuine
      // perspective — the NEAR (bottom) half large & spread, the FAR (top) half compressed &
      // converging toward a vanishing line — instead of a top-bottom-symmetric ellipse.
      float ringE = clamp(implode ? (1.0 - uNova) : uNova, 0.0, 1.0);
      float ringR = pow(ringE, 0.6) * 1.05;            // expanding shock radius in DISK-PLANE units
      // blast envelope (0 at rest → 1 mid-blast → 0): gates both the gas and the hot core so
      // the whole disk fades in and out with the supernova instead of sitting there.
      float shockEnv = smoothstep(0.0, 0.16, uNova) * smoothstep(1.0, 0.22, uNova);
      // --- project the screen point onto the tilted disk plane (2D perspective model) ---
      // We want a disk that (a) lies in a flat plane TILTED toward the camera and (b) reads
      // in PERSPECTIVE — the NEAR (bottom) half larger & more open, the FAR (top) half
      // compressed & converging toward a vanishing line up the frame. A symmetric squashed
      // ellipse fails (b); a full ray-plane trace collapses to an invisible sliver at steep
      // tilts. This closed-form perspective map gives both, robustly, and always fills frame.
      //   - horizontal: full-width lateral axis (undo the flash aspect, widen by uShockWide)
      //   - vertical: foreshorten by sin(incl), THEN apply a perspective DIVIDE keyed to the
      //     vertical position so the far (upper) half compresses and the near (lower) half
      //     opens — the asymmetry that makes it read as a 3D plane, not a flat oval.
      float incl   = radians(uShockDeg);               // 0 = edge-on, 90 = face-on
      float vFore  = max(0.10, sin(incl));             // base vertical foreshortening
      // ROLL: rotate the whole disk frame in-plane so its long (lateral) axis sits on a
      // DIAGONAL slant across the frame — like a clock hand — instead of dead horizontal.
      // We rotate the screen point INTO the disk's frame by -roll, build the flat/perspective
      // disk there, and the result is the disk slanted by +roll on screen. uAspect is undone
      // first so the rotation is by a true geometric angle, not skewed by the wide viewport.
      float roll = radians(uShockRoll);
      vec2  qa   = vec2(q.x / uAspect, q.y);           // aspect-true screen offset from centre
      float cr = cos(roll), sr = sin(roll);
      vec2  qr = vec2(qa.x * cr + qa.y * sr, -qa.x * sr + qa.y * cr); // rotate into the disk frame
      float yC     = qr.y;                             // signed depth across the (rolled) disk
      // perspective divide along the disk's depth axis: points on the FAR side push to larger
      // in-plane V (compressed on screen → converging); the NEAR side opens out. uShockPersp
      // sets the convergence strength (0 = flat symmetric ellipse, ~1 = strong 3D tilt).
      float persp  = 1.0 / (1.0 - uShockPersp * clamp(yC * 2.0, -0.9, 0.9));
      float diskX  = qr.x / uShockWide;                // lateral axis (along the rolled long axis)
      float diskY  = (yC / vFore) * persp;             // foreshortened + perspective-warped depth axis
      vec2  dp = vec2(diskX, diskY);                   // position in the disk plane
      float onDisk = 1.0;                              // (2D model: the whole frame maps onto the plane)
      float rDisk = length(dp);                        // radius in the disk plane
      // TURBULENT GAS DENSITY — fbm sampled in disk-plane CARTESIAN coords (NOT polar), so
      // the clumps are isotropic with NO central pinwheel/spoke artifact and no atan branch
      // seam. We advect the clouds OUTWARD by pulling the sample point inward along its own
      // radial direction over time (dp - dir*flow), so the gas appears to stream out of the
      // core along the shock. Two octave sets: coarse billows + fine filaments.
      float flow = uTime * 0.16;
      vec2  rdir = dp / max(rDisk, 1e-3);
      float billow = fbm(dp * 3.0 - rdir * flow);
      float fine   = fbm(dp * 8.5 + vec2(11.0, 4.0) - rdir * flow * 1.6);
      float gas = mix(billow, fine, 0.45);             // 0..1 turbulent density field
      // CONTRAST the density for a CINEMATIC read: gamma it up so the clumps separate into
      // bright filaments and deep dark lanes (a soft uniform field reads as cheap haze). The
      // remap pushes the low end toward black and keeps the peaks, so the gas has structure.
      gas = pow(clamp(gas, 0.0, 1.0), 1.7);
      // RADIAL SHELL: the gas lives in a band around the expanding shock radius — a wide
      // INNER fill (already-shocked gas glowing behind the front) plus a tight bright CREST
      // at the front. The turbulence erodes the band edges so the rim is ragged, not a wire.
      // Bands narrowed + inner fill cut so the disk is a defined RING with dark space around
      // it, not a frame-filling glow.
      float band  = smoothstep(0.42, 0.0, abs(rDisk - ringR));     // broad shell (tighter)
      float crest = smoothstep(0.12, 0.0, abs(rDisk - ringR));     // bright leading rim
      float inner = smoothstep(ringR + 0.0, ringR - 0.32, rDisk);  // fill trailing the crest, toward core
      float shell = max(crest * 0.85, max(band * (0.20 + 0.80 * gas), inner * 0.35 * gas));
      // clouds: modulate the whole shell by the gas so it breaks into clumps + dark lanes.
      // Lower floor (0.18) = the gaps go properly dark, the structure reads as volume.
      shell *= (0.18 + 0.95 * gas);
      // VOLUME / limb-brightening: thicken the RIM gas near the disk's top & bottom edges
      // (where, seen at this shallow tilt, we look through more gas) so it reads as a fat
      // torus. Gated to the rim band (rDisk near ringR) so it ONLY shapes the gas ring and
      // never touches the core — otherwise abs(diskY)/rDisk blowing up near the centre
      // carved a bow-tie into the hot heart. The rims are where |diskY| ≈ rDisk.
      float rimBand = smoothstep(0.45, 0.12, abs(rDisk - ringR)); // 1 on the ring, 0 at centre
      float limb = smoothstep(0.82, 1.0, abs(diskY) / max(rDisk, 1e-3)) * rimBand;
      shell *= (1.0 + 0.35 * limb);                    // gentler so it never carves a dark mid-lane
      // SHADOW GAP: a SOFT, shallow moat just inside the ring so the hot heart reads as
      // separated from the gas — depth, not a flat blob. Kept soft + shallow (×0.30, wide
      // smoothstep) because on this strongly-inclined disk the gap projects to a thin
      // horizontal lane, and a hard version read as an ugly dark SEAM across the middle.
      float gapZone = smoothstep(0.40, 0.16, rDisk) * smoothstep(0.02, 0.16, rDisk);
      shell *= (1.0 - 0.30 * gapZone);
      // HOT CORE: a tight, round, hot heart at the disk centre (the detonating star), so the
      // middle reads as searing light the gas streams out of — not flat textured cloud. Added
      // AFTER the limb shaping so the rim's vertical-axis weighting can't carve it into an
      // hourglass. DIMMED + tightened (0.30 radius, ×0.7) so it's a controlled bright point,
      // not a blown-out wash.
      float core = smoothstep(0.30, 0.0, rDisk) * shockEnv;
      shell = max(shell, core * 0.7);
      // reach guard (in disk-plane radius). Pulled IN so the outer gas falls to black sooner —
      // darker, moodier frame, no haze to the edges. onDisk masks the half-frame where the
      // view ray escapes ABOVE the tilted plane's horizon (no disk there → true perspective,
      // the far side fades into space). Soften the horizon so it isn't a hard cut.
      float reach     = smoothstep(1.5, 0.10, rDisk);
      float gasAmt    = clamp(shell, 0.0, 1.3) * shockEnv * reach * uShock * onDisk;
      // FIERY PALETTE (mirrors the reference): deep maroon/rust at the cool outer rim →
      // burnt orange → hot amber → blazing magenta-white at the inner/hottest edge. Mapped
      // by where we are across the shell (hot toward the shock radius / core, cool outward).
      float heat = clamp(1.0 - (rDisk - (ringR - 0.30)) / 0.9, 0.0, 1.0); // 1 hot (inner) → 0 cool (outer)
      heat = clamp(heat + 0.25 * (gas - 0.5), 0.0, 1.0);                  // turbulence mottles the temperature
      // Cool end pushed toward a DARK ember-red (not grey) so low-density gas reads as
      // embers fading to black, never a muddy grey haze. Warm mids kept saturated.
      vec3 cMaroon = vec3(0.20, 0.025, 0.03);  // #340708 near-black ember red (dark outer/low-density)
      vec3 cRust   = vec3(0.80, 0.20, 0.09);   // #CC3317 burnt orange
      vec3 cAmber  = vec3(1.0,  0.56, 0.22);   // #FF8F38 hot amber
      vec3 cMagma  = vec3(1.0,  0.50, 0.62);   // #FF809E hot rose core — saturated, not washed pink-grey
      vec3 gasCol = mix(cMaroon, cRust, smoothstep(0.0, 0.30, heat));
      gasCol = mix(gasCol, cAmber, smoothstep(0.30, 0.66, heat));
      gasCol = mix(gasCol, cMagma, smoothstep(0.66, 1.0, heat));
      // keep the interior saturated: pull any grey back toward the warm hue, so the fill
      // reads as glowing gas, not desaturated smoke.
      float lum = dot(gasCol, vec3(0.299, 0.587, 0.114));
      gasCol = mix(vec3(lum), gasCol, 1.25);   // >1 = boost saturation
      gasCol = max(gasCol, vec3(0.0));
      // composite the COLORED gas additively over the graded frame (gas EMITS light), capped
      // by uPeak so the hottest clumps stay just under pure white like the rest of the scene.
      // Gain dimmed (1.4 → 0.90) so the disk glows like deep incandescent matter, not a
      // blown-out light — the brief asks for less glow / more cinematic mood.
      col += gasCol * gasAmt * uPeak * 0.90;
      // TEMPERATURE.
      //  explode: blue-white when hot (high uNova) → warm amber as it cools.
      //  implode: time-reversed — gathers cool/amber, SNAPS blue-white at the peak
      //    (light arriving), the exact mirror of the explode cooldown. Achieved by
      //    reading the ramp on the rising envelope the same way; the perceptual
      //    reversal comes from the inward-collapsing front above carrying it.
      // Warmer overall so the supernova reads as incandescent stellar matter, not
      // a cold grey/white screen wipe. The peak is a warm white-gold; it never goes
      // fully blue-white. The cast is stronger (0.42 white mix vs 0.6) so the warm
      // temperature survives the bleach instead of washing to neutral grey.
      // PALETTE (supernova): white-hot center → amber edge → burnt-orange shadows.
      // The hot peak stays a warm white; the cooling trailing edge is pushed toward a
      // clear BURNT ORANGE (green 0.82 → 0.74, blue 0.55 → 0.40) so the flash cools
      // into the same burnt-orange shadow family the debris ramp carries.
      // ITEM 3 collapse palette: warm-white front #F3EFE2 -> hot amber edge #FF9A2E.
      vec3 cold = vec3(0.953, 0.937, 0.886); // #F3EFE2 warm-white shock front
      vec3 warm = vec3(1.0, 0.604, 0.180);   // #FF9A2E hot amber cooling edge
      vec3 tint = mix(warm, cold, smoothstep(0.35, 0.90, uNova));
      vec3 white = mix(vec3(1.0), tint, 0.42); // warm-tinted, never neutral white
      col = mix(col, white, clamp(bleach, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
