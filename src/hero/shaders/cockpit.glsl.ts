// Cockpit canopy shaders — drawn DIRECTLY in clip space (the vertex shaders
// ignore the camera matrices entirely: geometry is authored in the fixed
// 1920×1080 design space and mapped straight to NDC), so the frame is welded
// to the glass no matter how the scene camera flies.
//
// POST-GRADE OVERLAY: the cockpit renders in its OWN scene AFTER the composer
// (RenderPass → Bloom → Grade → Nova) has written the graded frame to the
// canvas — the same side of the pipeline the DOM instruments live on. Every
// colour here is authored in DISPLAY sRGB and written raw: what you author is
// what lands on screen. This is deliberate and load-bearing — the in-scene
// approach fought the grade for weeks (the per-chapter desaturation pulled
// bright amber to tan, the Reinhard crushed hue at high energy, and any span
// crossing the bloom threshold beaded through the mip chain). Post-grade there
// is no floor keyframing, no bead staircase, no sepia: the trim is lit like
// the reference at EVERY chapter, and the canvas's MSAA sharpens the lines.
//
// The scene still reaches in through uLight/uStarColor/uStarIntensity (the
// star's projected position and chapter colour): the members' brightness flows
// along their length (grazeDiff), the star's kiss lands where a face squares
// up (grazeSpec), and uNova washes the whole frame toward white during the
// supernova (the overlay no longer sits under the nova pass, so it carries
// its own wash).

/** Uniform mapping shared by both vertex shaders: design px → NDC. The frame
 *  never moves or scales — power on/off is the DECLOAK (below), a material
 *  change, not a camera one: the ship was always there, just invisible. */
const designToClip = /* glsl */ `
vec4 clipFromDesign(vec2 p) {
  return vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
}
`;

/** THE DECLOAK — the power transition. Predator grammar: the hull does not
 *  slide, zoom or fade in; it DE-CLOAKS. Coarse hash cells of the surface
 *  flicker into existence (re-hashed a few times a second, so patches pop and
 *  drop while the field fills), each fresh patch glinting an electric
 *  blue-silver before it settles into the amber powered trim. uDecloak is the
 *  envelope (0 = fully cloaked/invisible, 1 = fully material), driven by
 *  buildCockpit's power tween; uTime feeds the flicker's re-hash.
 *
 *  cloakMask() → per-pixel presence (multiplies alpha). cloakTint() → the
 *  electric glint on still-materialising pixels. Both are exact no-ops at
 *  uDecloak = 1, so the settled cockpit renders byte-identically. */
const cloak = /* glsl */ `
uniform float uDecloak; // 0 cloaked … 1 material (power envelope)
uniform float uTime;    // seconds; drives the flicker re-hash
float ckHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
}
float cloakMask(vec2 p) {
  if (uDecloak >= 0.999) return 1.0;
  if (uDecloak <= 0.001) return 0.0;
  // Coarse materialisation cells (~46 design px), re-hashed ~12×/s so the
  // field shimmers while it fills. cover > 1 at the top guarantees every cell
  // is in before the envelope ends.
  float tick = floor(uTime * 12.0);
  float cell = ckHash(floor(p / 46.0) + vec2(tick * 0.731, tick * 0.377));
  float cover = uDecloak * 1.12;
  float m = 1.0 - smoothstep(cover - 0.10, cover + 0.04, cell);
  // Fine sparkle: fresh patches strobe (high-freq hash) until the field settles.
  float fine = ckHash(floor(p / 9.0) + vec2(tick * 1.917, tick * 0.113));
  float settled = smoothstep(0.72, 1.0, uDecloak);
  return m * mix(0.45 + 0.55 * fine, 1.0, settled);
}
vec3 cloakTint(vec3 col, vec2 p) {
  float settle = smoothstep(0.4, 0.95, uDecloak);
  if (settle >= 1.0) return col;
  // Electric arcs on materialising spans: sparse cells flash blue-silver at
  // the member's own energy so the structure keeps its shape while glinting.
  float tick = floor(uTime * 16.0);
  float arc = ckHash(floor(p / 30.0) + vec2(tick * 1.313, 9.21));
  float lum = max(col.r, max(col.g, col.b));
  vec3 electric = vec3(0.42, 0.78, 1.05) * lum * (0.9 + 1.6 * step(0.78, arc));
  return mix(electric, col, settle);
}
`;

/** Star falloff + angular metal terms + the frame's own vignette, shared by
 *  the lit fragment shaders. */
const starLight = /* glsl */ `
uniform vec2 uLight;         // star position, design space
uniform vec3 uStarColor;     // the chapter's light colour (display sRGB)
uniform float uStarIntensity;
uniform float uNova;         // supernova whiteout envelope (post-grade wash)
float litAt(vec2 p, float facing) {
  float d = distance(p, uLight);
  float wide = exp(-d / 950.0);
  float hot = exp(-d * d / (2.0 * 240.0 * 240.0));
  return facing * (wide * 0.65 + hot * 1.6) * uStarIntensity;
}
// Angular terms off the member's cross-section normal — the reference's whole
// character: a beam is METAL TRIM catching the scene, so its brightness flows
// along its length. The floor sits HIGH (0.62): powered trim glows around the
// whole canopy, the star only modulates it. Callers pass a re-NORMALIZED
// normal (the varying shortens mid-fillet).
float grazeDiff(vec2 p, vec2 n) {
  vec2 L = uLight - p;
  float ndl = abs(dot(normalize(L), n));
  return 0.50 + 0.50 * ndl;
}
float grazeSpec(vec2 p, vec2 n) {
  vec2 L = uLight - p;
  float ndl = abs(dot(normalize(L), n));
  return pow(ndl, 5.0);
}
// The overlay renders AFTER the post grade, so the scene's corner vignette no
// longer touches it — the frame carries its own (same curve as post.glsl,
// gentler floor) so hull and scene darken into the corners together.
float vigMul(vec2 p) {
  vec2 q = vec2(p.x / 1920.0 - 0.5, 0.5 - p.y / 1080.0);
  float vig = smoothstep(1.10, 0.28, length(q) * 1.25);
  return mix(0.74, 1.0, vig);
}
// Supernova wash: the whiteout pass runs UNDER this overlay, so the frame
// mixes itself toward the same warm white while the blast peaks.
vec3 novaWash(vec3 col) {
  return mix(col, vec3(1.0, 0.97, 0.92), uNova * 0.9);
}
`;

/** BEAM pass — the reference's structural grammar: every member is a wide
 *  band of dark milled metal whose cross-section coordinate (vSide, -1..1)
 *  lets the fragment shader draw the whole member off one ribbon: bright
 *  amber hairlines on BOTH edges, a dimmer echo line inset from each edge,
 *  a specular crown down the middle where the member's face catches the
 *  star, and the graphite fill between. Extruded in DESIGN units (aDW is
 *  the member's authored width) so the metal band scales with the frame. */
export const cockpitBeamVertexShader = /* glsl */ `
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aW;    // facing weight
attribute float aDW;   // member width, design px
uniform float uDecloak;
uniform float uTime;
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vDW;
varying vec2 vN;
void main() {
  vec2 p = aPos + aNorm * (aSide * aDW * 0.5);
  // Decloak heat-haze: the member ripples along its normal while
  // materialising, exactly zero once settled.
  float haze = 1.0 - uDecloak;
  if (haze > 0.001) {
    vec2 nu = normalize(aNorm);
    float w = sin(aPos.x * 0.021 + uTime * 9.0) * sin(aPos.y * 0.017 - uTime * 7.0);
    p += nu * (haze * 7.0 * w);
  }
  vPos = p;
  vSide = aSide;
  vW = aW;
  vDW = aDW;
  vN = normalize(aNorm);
  gl_Position = clipFromDesign(p);
}
`;

export const cockpitBeamFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform vec3 uCoreTint;
uniform float uAlpha;
uniform float uHalfW;  // design units per CSS half-px (edge lines stay CSS-px)
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vDW;
varying vec2 vN;
void main() {
  float t = abs(vSide);
  vec2 n = normalize(vN);
  float diff = grazeDiff(vPos, n);
  float spec = grazeSpec(vPos, n);
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  // The kiss rides lit QUADRATICALLY: the canopy ENCLOSES the star, so every
  // member's normal squares up to it (spec ≈ 1 all around) — only the radial
  // falloff can pool the highlight near the body instead of igniting the ring.
  float kiss = min(lit * lit * spec, 0.85);
  float half_ = vDW * 0.5;                 // design px per t-unit
  float pxT = (2.0 * uHalfW) / half_;      // t-units per CSS px

  // ── The milled metal fill: warm graphite, a bevel that lifts toward the
  // edges, and a specular CROWN down the face where it squares to the star.
  // Values are DISPLAY sRGB — the reference band reads ~0.05-0.12, clearly
  // lighter than the hull masses and clearly darker than its edge lines.
  float bevel = smoothstep(0.30, 0.95, t);
  float crown = 1.0 - t * t;
  vec3 fill = vec3(0.064, 0.059, 0.054) * (0.75 + 1.15 * bevel) * diff
            + vec3(0.10, 0.095, 0.088) * crown * (0.10 + 1.3 * kiss)
            + uAmber * (0.026 + 0.052 * bevel) * diff;

  // ── Edge hairlines (both edges, ~1.3 CSS px) + inset echo (~0.8 px, sitting
  // ~5.5 px inside each edge — only on members wide enough to carry it).
  float ew = 1.3 * pxT;
  float edgeLine = smoothstep(1.0 - 2.2 * ew, 1.0 - ew, t) * (1.0 - smoothstep(1.0 - 0.4 * ew, 1.0, t) * 0.35);
  float echoPos = 1.0 - 5.5 * pxT;
  float echoLine = (1.0 - smoothstep(0.0, 1.2 * pxT, abs(t - echoPos))) * step(4.0, half_ / (2.0 * uHalfW));
  // Facing weight rides QUADRATICALLY: structural members (w 0.7-1) keep full
  // presence while the grooves (w 0.3-0.45) drop to seam level — the
  // reference's seams are dark plate splits, not radiating gold rays. The
  // resting level stays RESTRAINED (the reference is mostly dark metal; only
  // the star kiss pushes a span toward hot gold).
  float energy = (0.30 + 0.70 * vW * vW) * diff * (0.42 + 0.9 * kiss);
  vec3 edgeCol = mix(uAmber, uCoreTint, 0.18 + 0.62 * kiss) * energy;
  vec3 col = fill + edgeCol * edgeLine + uAmber * energy * 0.16 * echoLine;

  col *= vigMul(vPos);
  // 8-bit canvas dither: the fill's gentle gradients band without it.
  col += (ckHash(vPos * 0.37) - 0.5) * 0.006;
  col = novaWash(col);
  // Rim anti-aliasing: fade the outermost ~0.8 px so the metal band never
  // hard-edges against glass or hull.
  float rim = 1.0 - smoothstep(1.0 - 0.8 * pxT, 1.0, t);
  col = cloakTint(col, vPos);
  gl_FragColor = vec4(col, uAlpha * rim * cloakMask(vPos));
}
`;

/** GLOW pass — the halo the scene bloom used to (unreliably) provide. The same
 *  ribbon geometry extruded WIDER (uGlowPad design px past each edge); the
 *  fragment lays an additive gaussian centred on each edge hairline plus a
 *  faint fill light across the member. Peaks where the star kisses. */
export const cockpitGlowVertexShader = /* glsl */ `
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aW;
attribute float aDW;
uniform float uDecloak;
uniform float uTime;
uniform float uGlowPad; // design px of halo reach past each edge
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vDW;
varying vec2 vN;
void main() {
  vec2 p = aPos + aNorm * (aSide * (aDW * 0.5 + uGlowPad));
  float haze = 1.0 - uDecloak;
  if (haze > 0.001) {
    vec2 nu = normalize(aNorm);
    float w = sin(aPos.x * 0.021 + uTime * 9.0) * sin(aPos.y * 0.017 - uTime * 7.0);
    p += nu * (haze * 7.0 * w);
  }
  vPos = p;
  vSide = aSide;
  vW = aW;
  vDW = aDW;
  vN = normalize(aNorm);
  gl_Position = clipFromDesign(p);
}
`;

export const cockpitGlowFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform float uAlpha;
uniform float uGlowPad;
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vDW;
varying vec2 vN;
void main() {
  vec2 n = normalize(vN);
  float diff = grazeDiff(vPos, n);
  float spec = grazeSpec(vPos, n);
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float kiss = min(lit * lit * spec, 1.0); // quadratic in lit — see the beam pass
  // Signed design-px distance from this pixel to the nearest edge hairline
  // (negative inside the band, positive out on the pad).
  float halfPad = vDW * 0.5 + uGlowPad;
  float dPx = abs(vSide) * halfPad - vDW * 0.5;
  float halo = exp(-dPx * dPx / 40.0);            // σ ≈ 4.5 design px on the hairline
  float inner = exp(-vSide * vSide * 2.2) * 0.16; // soft light across the member
  // The halo follows the LIGHT, not the line: it blooms off the star-kissed
  // spans and stays a whisper elsewhere — a uniform halo melts the whole frame
  // into molten piping. Kept TIGHT: where members stack (the deck band) fat
  // halos fuse the lines into one molten wash.
  float energy = (0.30 + 0.70 * vW * vW) * diff * (0.14 + 1.1 * kiss);
  vec3 col = uAmber * (halo * 0.13 + inner * 0.04) * energy;
  col *= vigMul(vPos);
  col *= (1.0 - uNova * 0.85); // additive light stands down under the whiteout
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;

/** GLINT pass — hot white-gold sparks at member junctions (the reference
 *  flares every major corner). Each glint is a quad (aCorner spans -1..1)
 *  drawn additively: a tight gaussian core with a faint horizontal streak. */
export const cockpitGlintVertexShader = /* glsl */ `
attribute vec2 aPos;     // glint centre, design px
attribute vec2 aCorner;  // quad corner, -1..1
attribute float aR;      // radius, design px
attribute float aI;      // intensity
${designToClip}
varying vec2 vCorner;
varying float vI;
varying vec2 vPos;
void main() {
  vec2 p = aPos + aCorner * aR * vec2(2.6, 1.0); // wide quad for the streak
  vPos = p;
  vCorner = aCorner;
  vI = aI;
  gl_Position = clipFromDesign(p);
}
`;

export const cockpitGlintFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform float uAlpha;
varying vec2 vCorner;
varying float vI;
varying vec2 vPos;
void main() {
  // Core: tight gaussian. Streak: horizontal lens smear, much fainter.
  float dCore = length(vCorner * vec2(2.6, 1.0));
  float core = exp(-dCore * dCore * 7.0);
  float streak = exp(-vCorner.y * vCorner.y * 60.0) * exp(-vCorner.x * vCorner.x * 3.2) * 0.32;
  float lit = 0.55 + 0.45 * litAt(vPos, 1.0);
  vec3 gold = mix(uAmber * 1.25, vec3(1.0, 0.97, 0.90), 0.60);
  vec3 col = gold * (core + streak) * vI * lit * 1.1;
  col *= (1.0 - uNova * 0.85);
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;

/** HUD pass: white holographic instruments projected on the glass. Lines with
 *  aFollow = 1 are authored around the origin and re-centred on the star's
 *  projected position every frame (uLight) — the scanner reticle rides the
 *  body like a target lock. aFollow = 0 lines are fixed design furniture (the
 *  compass strip). Sub-pixel guard: never extrude under 0.85 CSS half-px, pay
 *  the lost width back as alpha, so hairlines stay continuous, never dashed. */
export const cockpitHudVertexShader = /* glsl */ `
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aHalf;    // CSS half-px width
attribute float aFollow;  // 1 = star-anchored, 0 = fixed
uniform vec2 uLight;
uniform float uHalfW;     // design units per CSS half-px
${designToClip}
varying float vAcross;
varying vec2 vPos;
varying float vCover;
void main() {
  float drawnHalf = max(aHalf, 0.85);
  vCover = aHalf / drawnHalf;
  vec2 p = aPos + uLight * aFollow + aNorm * (aSide * uHalfW * 2.0 * drawnHalf);
  vPos = p;
  vAcross = aSide;
  gl_Position = clipFromDesign(p);
}
`;

/** Crisp white holographic lines with a soft edge. A projection, not metal —
 *  no star lighting; presence follows the decloak so the HUD boots with the
 *  hull. Display sRGB, drawn raw. */
export const cockpitHudFragmentShader = /* glsl */ `
precision highp float;
${cloak}
uniform vec3 uHud;       // site white (slightly cool)
uniform float uAlpha;
varying float vAcross;
varying vec2 vPos;
varying float vCover;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
  gl_FragColor = vec4(uHud, uAlpha * edge * vCover * 0.78 * cloakMask(vPos));
}
`;

export const cockpitPanelVertexShader = /* glsl */ `
${designToClip}
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = clipFromDesign(position.xy);
}
`;

/** The hull masses: an OPAQUE near-black machined shell. Occlusion is the
 *  whole job — the scene shows ONLY through the glass (that is what turns
 *  floating trim into a ship you sit inside) — but the reference hull is not
 *  void: it carries a soft sheen that brightens toward the glass opening, an
 *  amber bounce off the trim, and the star's wash, all a whisper above black. */
export const cockpitPanelFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;   // the trim's own bounce on the masses
uniform float uAlpha;
uniform float uFill;   // resting panel opacity
varying vec2 vPos;
void main() {
  float lit = litAt(vPos, 1.0);
  // edgeGlow: the panel edges nearest the windshield opening catch more of
  // the interior bounce than the deep top/bottom — a coarse AO fake that
  // reads as a curved hull.
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  float toGlass = 1.0 - smoothstep(0.02, 0.40, abs(q.y));   // near the opening
  float toCentre = 1.0 - smoothstep(0.10, 0.62, abs(q.x));  // away from edges
  float edgeGlow = toGlass * (0.35 + 0.65 * toCentre);
  vec3 shell = vec3(0.027, 0.025, 0.023) * (0.8 + 0.6 * edgeGlow)
             + vec3(0.028, 0.024, 0.020) * edgeGlow;
  vec3 col = shell + uAmber * (0.008 + 0.026 * edgeGlow) + uStarColor * lit * 0.012;
  col *= vigMul(vPos);
  col += (ckHash(vPos * 0.41) - 0.5) * 0.006; // 8-bit dither against banding
  col = novaWash(col);
  // The interior masses de-cloak on the same cell field as the trim.
  gl_FragColor = vec4(col, uFill * uAlpha * cloakMask(vPos));
}
`;

/** SMOKED GLASS on the SIDE panes (corner + flank windows). The reference's
 *  side windows read distinctly darker than the central view — angled, thicker
 *  glass — so this pass dims the scene behind them (normal blending over the
 *  graded frame) and adds a whisper of amber sheen so the surface reads as a
 *  material, not a shadow. The central gem stays untouched: it is THE view. */
export const cockpitGlassFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform float uAlpha;
varying vec2 vPos;
void main() {
  float lit = litAt(vPos, 1.0);
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  // Denser smoke toward the screen edges (steeper viewing angle).
  float a = 0.5 + 0.16 * smoothstep(0.30, 0.50, abs(q.x));
  vec3 col = vec3(0.006, 0.005, 0.004) + uAmber * 0.007 + uStarColor * lit * 0.010;
  col = novaWash(col);
  gl_FragColor = vec4(col, a * uAlpha * cloakMask(vPos));
}
`;

/** The recessed console SCREEN — powered display glass inside the housing:
 *  near-black with a warm glow that gathers toward the top lip (the CTA
 *  readout's backlight), clearly a different material from the hull. */
export const cockpitScreenFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform float uAlpha;
varying vec2 vPos;
void main() {
  // Vertical backlight: strongest just under the top lip, falling to the sill.
  float g = smoothstep(1100.0, 955.0, vPos.y);
  // Soft side falloff so the glow pools centre-screen where the CTA sits.
  float cx = 1.0 - smoothstep(60.0, 300.0, abs(vPos.x - 960.0));
  vec3 col = vec3(0.014, 0.010, 0.007)
           + uAmber * (0.020 + 0.068 * g * g * (0.45 + 0.55 * cx));
  col += (ckHash(vPos * 0.53) - 0.5) * 0.006;
  col = novaWash(col);
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;
