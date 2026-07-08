// Cockpit canopy shaders — a SOLID FACETED METAL canopy drawn DIRECTLY in clip
// space (the vertex shaders ignore the camera matrices entirely: geometry is
// authored in the fixed 1920×1080 design space and mapped straight to NDC), so
// the frame is welded to the glass no matter how the scene camera flies.
//
// THE LOOK — a dark neutral-metal hull with faceted glass panes (Star-Citizen
// grammar). The metal is a SIMPLE colour; the star's light fleshes it out — it
// rakes across the surround, crowns the beveled struts, and throws a thin cool
// rim along every pane edge. Nothing is self-luminous except a whisper of HUD.
// Four meshes stack:
//   1. HULL   — the solid surround (full screen minus the pane holes),
//   2. GLASS  — a faint tint on the panes so they read as glass, not voids,
//   3. STRUTS — beveled beams (bright crown, shaded flanks) over the mullions,
//   4. CONSOLE + HUD — the dashboard mass + white holographic instrument layer.
//
// LIGHTING — the fragment shaders compute per-pixel attenuation from the star's
// projected position (uLight, design space, written per frame from the same NDC
// projection the nova pass uses) in the star's own colour for the current
// lifecycle chapter (uStarColor / uStarIntensity). The metal reads as a real
// surface catching the scene rather than a glowing outline.
//
// POWER — the whole canopy DE-CLOAKS on power-up (uDecloak envelope, driven by
// buildCockpit's tween); the cloak cells materialise the surface in.

/** Uniform mapping shared by every vertex shader: design px → NDC. The frame
 *  never moves or scales — power on/off is the DECLOAK, a material change. */
const designToClip = /* glsl */ `
vec4 clipFromDesign(vec2 p) {
  return vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
}
`;

/** THE DECLOAK — Predator grammar: the hull does not slide, zoom or fade in; it
 *  DE-CLOAKS. Coarse hash cells flicker into existence, each fresh patch
 *  glinting electric before it settles into the metal. cloakMask() → per-pixel
 *  presence (multiplies alpha). cloakTint() → the electric glint on still-
 *  materialising pixels. Both are exact no-ops at uDecloak = 1. */
const cloak = /* glsl */ `
uniform float uDecloak; // 0 cloaked … 1 material (power envelope)
uniform float uTime;    // seconds; drives the flicker re-hash
float ckHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
}
float cloakMask(vec2 p) {
  if (uDecloak >= 0.999) return 1.0;
  if (uDecloak <= 0.001) return 0.0;
  float tick = floor(uTime * 12.0);
  float cell = ckHash(floor(p / 46.0) + vec2(tick * 0.731, tick * 0.377));
  float cover = uDecloak * 1.12;
  float m = 1.0 - smoothstep(cover - 0.10, cover + 0.04, cell);
  float fine = ckHash(floor(p / 9.0) + vec2(tick * 1.917, tick * 0.113));
  float settled = smoothstep(0.72, 1.0, uDecloak);
  return m * mix(0.45 + 0.55 * fine, 1.0, settled);
}
vec3 cloakTint(vec3 col, vec2 p) {
  float settle = smoothstep(0.4, 0.95, uDecloak);
  if (settle >= 1.0) return col;
  float tick = floor(uTime * 16.0);
  float arc = ckHash(floor(p / 30.0) + vec2(tick * 1.313, 9.21));
  float lum = max(col.r, max(col.g, col.b));
  vec3 electric = vec3(0.42, 0.78, 1.05) * (lum + 0.15) * (0.9 + 1.6 * step(0.78, arc));
  return mix(electric, col, settle);
}
`;

/** The star falloff shared by every fragment shader — a wide ambient reach + a
 *  tight specular kiss, in the star's chapter colour. */
const starLight = /* glsl */ `
uniform vec2 uLight;         // star position, design space
uniform vec3 uStarColor;     // the chapter's light colour
uniform float uStarIntensity;
// Wide, soft reach across the whole canopy (the ambient wash the scene casts).
float litWide(vec2 p) {
  float d = distance(p, uLight);
  return exp(-d / 1150.0) * uStarIntensity;
}
// Tight hot kiss near the star's on-screen position (the specular flare).
float litHot(vec2 p) {
  float d = distance(p, uLight);
  return exp(-d * d / (2.0 * 360.0 * 360.0)) * uStarIntensity;
}
// The post grade darkens the frame's corners (vignette). The powered canopy
// should still read to the very edge, so pre-boost by a clamp of the inverse.
float vigComp(vec2 p) {
  vec2 q = vec2(p.x / 1920.0 - 0.5, 0.5 - p.y / 1080.0);
  float vig = smoothstep(1.10, 0.28, length(q) * 1.25);
  return 1.0 + 0.5 * (1.0 - vig);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 1. HULL — the solid metal surround (full screen minus pane holes).
// ═══════════════════════════════════════════════════════════════════════════

export const cockpitHullVertexShader = /* glsl */ `
${designToClip}
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = clipFromDesign(position.xy);
}
`;

/** Dark neutral brushed metal, lit by the scene. A gentle vertical gradient
 *  (roof recedes into shadow, cowl catches the horizon) + a broad star wash
 *  give the mass form. The star's colour tints the wash so the metal warms
 *  under the red giant and cools under the nebula — the light does the colour. */
export const cockpitHullFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uMetal;   // base hull colour (neutral, dark)
uniform float uAlpha;
varying vec2 vPos;
void main() {
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  // Form gradient: brighter mid-height (the eye line), the roof and deep cowl
  // receding. Screen centre a touch brighter than the far pillars.
  float band = 1.0 - smoothstep(0.06, 0.55, abs(q.y));
  float centre = 1.0 - smoothstep(0.15, 0.66, abs(q.x));
  float form = 0.35 + 0.65 * band * (0.5 + 0.5 * centre);
  float wide = litWide(vPos);
  float hot = litHot(vPos);
  // Brushed-metal micro streaks (very subtle horizontal grain).
  float grain = 0.5 + 0.5 * sin(vPos.y * 0.9 + sin(vPos.x * 0.03) * 2.0);
  // A faint constant AMBIENT keeps the form gradient readable even when the
  // star's reach is dim (the pale-dot chapter): a powered hull is never pitch
  // black. Kept low so bright chapters still dominate.
  float ambient = 0.6 + 0.5 * form;
  vec3 metal = uMetal * ambient * (0.94 + 0.06 * grain);
  // The scene wash: the star colour rakes across the hull. Kept restrained so
  // the metal stays neutral-dark, warmed only where the light actually lands.
  vec3 wash = uStarColor * (wide * 0.6 + hot * 0.4) * vigComp(vPos);
  vec3 col = metal + wash;
  col = cloakTint(col, vPos);
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 2. GLASS — a faint tint on the panes so they read as glass, not empty holes.
// ═══════════════════════════════════════════════════════════════════════════

/** Barely-there: a cool dimming + a faint reflected sheen of the star sliding
 *  across the pane, so the transparent opening reads as canopy glass. Additive-
 *  ish, very low alpha — the scene must stay clearly visible through it. */
export const cockpitGlassFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform float uAlpha;
varying vec2 vPos;
void main() {
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  // A soft diagonal reflection streak sliding with the star (canopy sheen).
  float refl = litWide(vPos) * (0.5 + 0.5 * sin((vPos.x + vPos.y) * 0.004 + 1.2));
  vec3 sheen = uStarColor * refl * 0.10;
  // A faint cool edge-darkening toward the pane rim (the glass thickness).
  float rim = smoothstep(0.35, 0.5, max(abs(q.x), abs(q.y)));
  vec3 col = sheen + vec3(0.01, 0.012, 0.018) * rim;
  gl_FragColor = vec4(col, uAlpha * (0.10 + 0.5 * refl) * cloakMask(vPos));
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 3. STRUTS — beveled metal beams over the mullions (bright crown, shaded
//    flanks, thin cool rim). The dimensional relief of the frame.
// ═══════════════════════════════════════════════════════════════════════════

export const cockpitStrutVertexShader = /* glsl */ `
attribute vec2 aPos;     // ribbon centreline point (design px)
attribute vec2 aNorm;    // unit cross-section normal (design space)
attribute float aSide;   // signed edge position: -1 | +1
attribute float aHalf;   // this strut's half-width (design px)
uniform float uDecloak;
uniform float uTime;
${designToClip}
varying vec2 vPos;
varying float vAcross;   // -1..1 across the beam (for the bevel)
varying vec2 vN;
void main() {
  vec2 p = aPos + aNorm * (aSide * aHalf);
  // Decloak heat-haze wobble along the normal, zero at settle.
  float haze = 1.0 - uDecloak;
  if (haze > 0.001) {
    float w = sin(aPos.x * 0.021 + uTime * 9.0) * sin(aPos.y * 0.017 - uTime * 7.0);
    p += aNorm * (haze * 6.0 * w);
  }
  vPos = p;
  vAcross = aSide;
  vN = aNorm;
  gl_Position = clipFromDesign(p);
}
`;

/** Beveled metal: a cylindrical cross-section shade (crown bright, flanks fall
 *  off), lit by the star, with a thin bright rim at both edges (the machined
 *  chamfer catching light). Neutral metal; the star tints the crown. */
export const cockpitStrutFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uMetal;    // base beam colour (a touch lighter than the hull)
uniform float uAlpha;
varying vec2 vPos;
varying float vAcross;
varying vec2 vN;
void main() {
  float a = clamp(vAcross, -1.0, 1.0);
  // Cross-section bevel: a rounded crown (bright at centre) with shaded flanks.
  // The flanks fall DARK (0.28 floor) so the beam reads as machined metal with
  // depth, not a flat bar — the reference's near-black mullions.
  float crown = sqrt(max(0.0, 1.0 - a * a));      // 1 at centre → 0 at edges
  float bevel = 0.28 + 0.72 * crown;
  // A CRISP bright chamfer rim right at each edge (|a| near 1) — the sharp
  // machined highlight that defines the strut against the glass. Two bands: a
  // tight hot line at the very edge + a softer inboard falloff.
  float rimE = smoothstep(0.86, 1.0, abs(a));
  float rimSoft = smoothstep(0.6, 0.9, abs(a)) * 0.35;
  // Which way the crown normal tips toward the light (crude directional term):
  // the flank facing the star is brighter than the shadowed one.
  vec2 L = normalize(uLight - vPos);
  float facing = 0.5 + 0.5 * dot(L, vN * sign(a + 1e-4));
  float wide = litWide(vPos);
  float hot = litHot(vPos);
  vec3 metal = uMetal * bevel * (0.62 + 0.7 * facing);
  // Star wash + a hot specular line along the crown where the star grazes it.
  vec3 wash = uStarColor * (wide * 0.7 + hot * crown * 1.1) * vigComp(vPos);
  // Cool rim light on the chamfer — a thin cold accent (the reference's edge
  // glow), tinted slightly toward the star so it warms in warm chapters. A
  // BASELINE keeps the bevel reading even when the star's reach is dim (the
  // pale-dot chapter): powered trim always catches a hair of its own fill light.
  vec3 rimCol = mix(vec3(0.62, 0.74, 0.98), uStarColor, 0.35);
  float rimGain = 0.5 + 1.2 * wide;
  vec3 col = metal + wash + rimCol * (rimE + rimSoft) * rimGain * vigComp(vPos);
  col = cloakTint(col, vPos);
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 4a. CONSOLE — the solid dashboard mass (same metal shading as the hull, with
//     a stronger form gradient so the raised pod reads as 3D).
// ═══════════════════════════════════════════════════════════════════════════

export const cockpitConsoleFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uMetal;
uniform float uAlpha;
varying vec2 vPos;
void main() {
  // The pod catches light on its top face (near y≈880) and falls into shadow
  // toward its base (y→1080) — a steep gradient reads as a raised surface.
  float top = 1.0 - smoothstep(880.0, 1080.0, vPos.y);
  vec3 metal = uMetal * (0.5 + 0.9 * top);
  float wide = litWide(vPos);
  vec3 wash = uStarColor * wide * 0.35 * vigComp(vPos);
  vec3 col = metal + wash;
  col = cloakTint(col, vPos);
  gl_FragColor = vec4(col, uAlpha * cloakMask(vPos));
}
`;

/** The recessed screen inset on the console — a dark cool glass panel with a
 *  faint scanline glow, so the dashboard reads as an active instrument. */
export const cockpitScreenFragmentShader = /* glsl */ `
precision highp float;
${cloak}
uniform float uAlpha;
uniform vec3 uHud;     // the HUD white
varying vec2 vPos;
void main() {
  // Dark cool base + faint horizontal scanlines + a soft centre glow.
  float scan = 0.5 + 0.5 * sin(vPos.y * 1.4);
  vec2 c = (vPos - vec2(960.0, 973.0)) / vec2(150.0, 60.0);
  float glow = exp(-dot(c, c) * 0.9);
  vec3 col = vec3(0.02, 0.05, 0.08) + uHud * (0.05 * scan + 0.22 * glow);
  gl_FragColor = vec4(col, uAlpha * (0.9) * cloakMask(vPos));
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 4b. HUD — the white holographic instrument layer on the glass. Drawn as line
//     ribbons (reticle ring, ticks, compass) in the site white. Additive.
// ═══════════════════════════════════════════════════════════════════════════

export const cockpitHudVertexShader = /* glsl */ `
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aHalf;   // hud line half-width (design px)
uniform float uDecloak;
${designToClip}
varying float vAcross;
varying vec2 vPos;
void main() {
  vec2 p = aPos + aNorm * (aSide * aHalf);
  vPos = p;
  vAcross = aSide;
  gl_Position = clipFromDesign(p);
}
`;

/** Crisp white holographic lines with a soft edge and a faint additive bloom.
 *  Presence follows the decloak so the HUD boots in with the frame. */
export const cockpitHudFragmentShader = /* glsl */ `
precision highp float;
${cloak}
uniform vec3 uHud;     // site white (slightly cool)
uniform float uAlpha;
uniform float uHudFloor; // brightness gain through the grade
varying float vAcross;
varying vec2 vPos;
void main() {
  float edge = 1.0 - smoothstep(0.4, 1.0, abs(vAcross));
  vec3 col = uHud * uHudFloor;
  gl_FragColor = vec4(col, uAlpha * edge * 0.9 * cloakMask(vPos));
}
`;
