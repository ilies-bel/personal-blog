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
float cloakField(vec2 p) {
  // Power propagates from the centre console through the deck and up the
  // canopy. Small static cells break the edge without punching large square
  // holes through already-materialised surfaces.
  vec2 q = (p - vec2(960.0, 1015.0)) / vec2(1180.0, 1110.0);
  float travel = length(q);
  float grain = ckHash(floor(p / 17.0)) - 0.5;
  float tick = floor(uTime * 18.0);
  float shimmer = ckHash(floor(p / 8.0) + vec2(tick * 0.73, tick * 0.31)) - 0.5;
  return travel + grain * 0.10 + shimmer * 0.025 * (1.0 - uDecloak);
}
float cloakMask(vec2 p) {
  if (uDecloak >= 0.999) return 1.0;
  if (uDecloak <= 0.001) return 0.0;
  float field = cloakField(p);
  float front = uDecloak * 1.42;
  float present = 1.0 - smoothstep(front - 0.045, front + 0.055, field);
  float wave = 1.0 - smoothstep(0.035, 0.14, abs(field - front));
  float fine = ckHash(floor(p / 6.0) + floor(uTime * 20.0));
  return present * mix(1.0, 0.72 + 0.28 * fine, wave * (1.0 - uDecloak));
}
vec3 cloakTint(vec3 col, vec2 p) {
  if (uDecloak >= 0.999) return col;
  // Only the moving materialisation front carries heat. Settled surfaces keep
  // their authored material colour instead of flickering wholesale.
  float wave = 1.0 - smoothstep(0.025, 0.13, abs(cloakField(p) - uDecloak * 1.42));
  float pulse = 0.72 + 0.28 * sin(uTime * 24.0 + p.x * 0.035 + p.y * 0.021);
  float lum = max(col.r, max(col.g, col.b));
  vec3 heat = mix(vec3(0.42, 0.68, 0.86), vec3(1.0, 0.62, 0.24), smoothstep(0.30, 0.82, uDecloak));
  return col + heat * lum * wave * pulse * 0.9;
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

/** BEAM pass — MINIMAL graphic grammar: every member is a flat near-black
 *  band with ONE crisp amber hairline per edge, drawn off the cross-section
 *  coordinate (vSide, -1..1). No milled-metal modelling — no bevel, crown,
 *  specular kiss, echo or halo (the realism experiments read as noise at
 *  this scale); the star only breathes brightness into the edges radially.
 *  Extruded in DESIGN units (aDW is the member's authored width, per-vertex
 *  tapered at junction merges) so the band scales with the frame. */
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
uniform float uAlpha;
uniform float uHalfW;  // design units per CSS half-px (edge lines stay CSS-px)
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vDW;
varying vec2 vN;
void main() {
  float t = abs(vSide);
  float lit = litAt(vPos, 1.0);
  float diffuse = grazeDiff(vPos, normalize(vN)) * min(lit, 1.6);
  float specular = grazeSpec(vPos, normalize(vN)) * min(lit, 1.8);
  float half_ = vDW * 0.5;                 // design px per t-unit
  float pxT = (2.0 * uHalfW) / half_;      // t-units per CSS px

  // A restrained machined cross-section: graphite centre, a shallow bevel and
  // a narrow scene-coloured kiss. This is material response, not another glow
  // line; the values stay below the post-chain bloom threshold.
  float crown = pow(max(0.0, 1.0 - t), 2.2);
  float bevel = smoothstep(0.42, 0.76, t) * (1.0 - smoothstep(0.80, 0.96, t));
  vec3 fill = vec3(0.030, 0.029, 0.028)
            + vec3(0.026, 0.025, 0.023) * crown
            + uAmber * (0.005 + 0.006 * bevel)
            + uStarColor * (0.030 * diffuse * (0.35 + 0.65 * crown)
                          + 0.045 * specular * bevel);

  // One crisp hairline per edge (~1.2 CSS px). Structural members carry it
  // brighter than grooves (vW), and the star's radial reach breathes it up —
  // no specular pooling, no gradient along the run.
  float ew = 1.2 * pxT;
  float edgeLine = smoothstep(1.0 - 2.0 * ew, 1.0 - 0.7 * ew, t);
  // max(): w below -0.818 means "faded out entirely" — emission must floor
  // at zero, never go subtractive (a negative energy draws a DARK stroke).
  float energy = max(0.45 + 0.55 * vW, 0.0) * (0.5 + 0.5 * min(lit, 1.0));
  vec3 col = fill + uAmber * edgeLine * energy;

  col = novaWash(col);
  col = cloakTint(col, vPos);
  // Rim anti-aliasing: fade the outermost ~0.8 px so the band never
  // hard-edges against glass or hull.
  float rim = 1.0 - smoothstep(1.0 - 0.8 * pxT, 1.0, t);
  gl_FragColor = vec4(col, uAlpha * rim * cloakMask(vPos));
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
uniform float uHudDeploy;
uniform float uHalfW;     // design units per CSS half-px
${designToClip}
varying float vAcross;
varying vec2 vPos;
varying float vCover;
varying float vDeploy;
void main() {
  float drawnHalf = max(aHalf, 0.85);
  vCover = aHalf / drawnHalf;
  float deploy = smoothstep(0.0, 1.0, uHudDeploy);
  vec2 target = aPos + uLight * aFollow;
  vec2 mount = mix(vec2(960.0, 182.0), uLight, aFollow);
  vec2 p = mix(mount, target, deploy)
         + aNorm * (aSide * uHalfW * 2.0 * drawnHalf);
  vPos = p;
  vAcross = aSide;
  vDeploy = deploy;
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
varying float vDeploy;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
  float powered = smoothstep(0.08, 0.46, vDeploy);
  gl_FragColor = vec4(uHud, uAlpha * edge * vCover * 0.78 * powered * cloakMask(vPos));
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
  // Large, low-frequency facets give the shell a physical normal change without
  // drawing decorative seams. The external body supplies the only moving key.
  vec2 L = normalize(uLight - vPos);
  float sideFace = smoothstep(0.18, 0.62, abs(q.x));
  float deckFace = smoothstep(0.20, 0.48, abs(q.y));
  float faceKey = mix(abs(L.y), abs(L.x), sideFace);
  float broad = min(lit, 1.7) * (0.35 + 0.65 * faceKey);
  float brushed = 0.5 + 0.5 * sin(vPos.y * 0.34 + ckHash(floor(vPos / 22.0)) * 6.2831);
  vec3 shell = vec3(0.029, 0.030, 0.033) * (0.92 + 0.52 * edgeGlow)
             + vec3(0.022, 0.016, 0.012) * edgeGlow
             + vec3(0.006) * brushed * (0.25 + 0.75 * deckFace);
  vec3 col = shell
           + uAmber * (0.004 + 0.014 * edgeGlow)
           + uStarColor * (0.120 * broad + 0.060 * broad * broad);
  col *= vigMul(vPos);
  col += (ckHash(vPos * 0.41) - 0.5) * 0.004; // 8-bit dither against banding
  col = novaWash(col);
  // The interior masses de-cloak on the same cell field as the trim.
  gl_FragColor = vec4(col, uFill * uAlpha * cloakMask(vPos));
}
`;

/** The windshield is a real surface over the graded scene: a very light
 *  smoke-blue absorption, edge density and a broad reflection of the current
 *  stellar light. It is intentionally quiet so the lifecycle remains primary. */
export const cockpitGlassFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform float uAlpha;
varying vec2 vPos;
void main() {
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  float edge = smoothstep(0.24, 0.66, length(q * vec2(1.0, 1.35)));
  float lit = min(litAt(vPos, 1.0), 1.5);
  float horizon = exp(-abs(vPos.y - uLight.y) / 150.0) * exp(-abs(vPos.x - uLight.x) / 850.0);
  float dust = step(0.995, ckHash(floor(vPos / 5.0))) * (0.15 + 0.35 * edge);
  vec3 col = vec3(0.025, 0.045, 0.070)
           + uStarColor * (0.08 * lit + 0.10 * horizon)
           + vec3(dust);
  float alpha = (0.022 + 0.038 * edge + 0.016 * lit) * cloakMask(vPos);
  gl_FragColor = vec4(novaWash(col), uAlpha * alpha);
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
