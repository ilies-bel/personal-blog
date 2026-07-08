// Cockpit canopy shaders — the line ribbons + interior panels drawn DIRECTLY in
// clip space (the vertex shaders ignore the camera matrices entirely: geometry
// is authored in the fixed 1920×1080 design space and mapped straight to NDC),
// so the frame is welded to the glass no matter how the scene camera flies.
// Rendered inside the main scene pass, so bloom genuinely lights the hot spans.
//
// THE LOOK — glowing amber piping (the reference's edge-lit trim): each member
// renders TWICE off one ribbon geometry. A wide ADDITIVE glow pass lays the
// halo; a normal-blended core pass draws the member itself, its centre running
// white-hot. Width hierarchy is per-line (aWidth, CSS px authored in
// cockpitGeometry.ts) so the canopy trim reads fat and the echoes hairline.
//
// LIGHTING — the reason this is WebGL and not a static overlay: the fragment
// shaders compute per-pixel attenuation from the star's projected position
// (uLight, design space, written per frame from the same NDC projection the
// nova pass and the DOM markers use) in the STAR'S OWN COLOUR for the current
// lifecycle chapter (uStarColor/uStarIntensity, keyframed over the eased stage
// in buildCockpit). Two falloff terms: a wide ambient reach and a tight
// specular kiss; each ribbon's facing weight (aW) scales how squarely its
// member catches them. The piping is self-luminous (powered trim), and the
// scene's light modulates its brightness, temperature and halo on top.

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
 *  electric glint on still-materialising pixels (kept modest so the transient
 *  never floods the bloom pass into beads). Both are exact no-ops at
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

/** The two-term star falloff shared by every fragment shader. */
const starLight = /* glsl */ `
uniform vec2 uLight;         // star position, design space
uniform vec3 uStarColor;     // the chapter's light colour
uniform float uStarIntensity;
float litAt(vec2 p, float facing) {
  float d = distance(p, uLight);
  float wide = exp(-d / 950.0);
  float hot = exp(-d * d / (2.0 * 300.0 * 300.0));
  return facing * (wide * 0.8 + hot * 1.6) * uStarIntensity;
}
// Angular terms off the member's cross-section normal — the reference's whole
// character: a beam is METAL TRIM catching the scene, so its brightness flows
// along its length. Spans whose face squares up to the star flare white-gold
// (grazeSpec), spans running radial to it fall into umber (grazeDiff), and a
// fillet sweeps the normal through the whole range — the traveling highlight.
// abs(): the trim is double-sided, either face catches. Callers must pass a
// re-NORMALIZED normal — the varying interpolates between unit normals along a
// fillet, which shortens it mid-segment (the raw value scalloped every curve).
// The dark floor sits LOW (0.34): dim spans must land clearly under the bloom
// pass's 0.55 threshold — spans hovering AT it alias through the mip chain
// into periodic beads along the line.
float grazeDiff(vec2 p, vec2 n) {
  vec2 L = uLight - p;
  float ndl = abs(dot(normalize(L), n));
  // The angular swing is COMPRESSED (floor 0.62, not 0.34): the reference trim
  // is powered piping that glows EVENLY around the whole canopy — only a gentle
  // brightness flow along each member, never half the frame dropping into
  // near-black umber. The old 0.34 floor made spans running radial to the star
  // vanish, which read as a broken/disconnected frame rather than one lit hull.
  return 0.62 + 0.38 * ndl;
}
float grazeSpec(vec2 p, vec2 n) {
  vec2 L = uLight - p;
  float ndl = abs(dot(normalize(L), n));
  return pow(ndl, 5.0);
}
// The post grade darkens the frame's corners (vignette, floor 0.66). The
// reference's powered trim glows evenly to the very corner, so pre-boost the
// members by (a clamp of) the vignette's inverse — same curve as post.glsl.
float vigComp(vec2 p) {
  vec2 q = vec2(p.x / 1920.0 - 0.5, 0.5 - p.y / 1080.0);
  float vig = smoothstep(1.10, 0.28, length(q) * 1.25);
  return 1.0 + 0.55 * (1.0 - vig);
}
`;

export const cockpitLineVertexShader = /* glsl */ `
attribute vec2 aPos;     // ribbon centreline point (design px)
attribute vec2 aNorm;    // miter normal (design space, miter-scaled)
attribute float aSide;   // which ribbon edge: -1 | +1
attribute float aW;      // facing weight (0..1)
attribute float aWidth;  // member width, CSS px (the piping hierarchy)
uniform float uHalfW;       // design units per CSS half-px (tracks viewport)
uniform float uWidthScale;  // 1 for the core pass, ~3 for the glow pass
uniform float uDecloak;     // power envelope (see the cloak block)
uniform float uTime;
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
varying vec2 vN;
varying float vCover;
void main() {
  // Sub-pixel guard: a hairline tapered below ~1px stops covering pixel
  // centres in the (MSAA-less) scene target and draws as DASHES, and its
  // too-thin bright core aliases through the bloom downsample into periodic
  // blobs. Never extrude thinner than 0.85 CSS half-px; pay the lost width
  // back as alpha (vCover) so the hairline hierarchy still reads — a fine
  // line is a FAINT continuous line, never a dashed one.
  float halfPx = 0.5 * aWidth * uWidthScale;
  float drawnPx = max(halfPx, 0.85);
  vCover = halfPx / drawnPx;
  vec2 p = aPos + aNorm * (aSide * uHalfW * 2.0 * drawnPx);
  // Decloak heat-haze: while materialising, the whole member ripples along its
  // cross-section normal (the cloak's refraction wobble). Keyed to aPos only —
  // both ribbon edges shift together, so the line WAVES, it never thickens.
  // Exactly zero at uDecloak = 1 (the settled frame is pixel-stable).
  float haze = 1.0 - uDecloak;
  if (haze > 0.001) {
    vec2 nu = normalize(aNorm);
    float w = sin(aPos.x * 0.021 + uTime * 9.0) * sin(aPos.y * 0.017 - uTime * 7.0);
    p += nu * (haze * 7.0 * w);
  }
  vPos = p;
  vSide = aSide;
  vW = aW;
  vWidth = aWidth;
  vN = normalize(aNorm); // unit cross-section normal (aNorm itself is miter-scaled)
  gl_Position = clipFromDesign(p);
}
`;

/** Core pass: the member itself. SELF-LUMINOUS powered trim, authored in HDR
 *  (uFloor, keyframed per chapter roughly inverse to the grade's exposure) so
 *  the piping survives the Reinhard tone-map + desaturation as saturated amber
 *  instead of tan wireframe. The white-hot centre is gated by MEMBER WIDTH —
 *  only the fat coachwork runs hot; hairlines stay pure orange (the reference
 *  hierarchy). The star's light breathes on top of the floor. Normal blend. */
export const cockpitLineFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;     // piping body colour
uniform vec3 uCoreTint;  // white-hot centre
uniform float uFloor;    // HDR self-luminous gain (per-chapter keyframe)
uniform float uAlpha;    // master opacity (1 while powered)
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
varying vec2 vN;
varying float vCover;
void main() {
  // Per-pixel angular lighting off the member's cross-section normal: the
  // floor DIMS on spans running radial to the star (grazeDiff → umber) and the
  // hot kiss lands ONLY where the face squares up (grazeSpec) — brightness
  // flows along each line and sweeps through every fillet, the reference's
  // lit-metal-trim read. The old flat per-line weight made every member one
  // uniform brightness: neon tube, not coachwork.
  vec2 n = normalize(vN);
  float diff = grazeDiff(vPos, n);
  float spec = grazeSpec(vPos, n);
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float kiss = min(lit * spec, 0.9);
  float t = abs(vSide);
  float widthGate = smoothstep(1.9, 2.7, vWidth);
  float coreMask = (1.0 - smoothstep(0.0, 0.5, t)) * widthGate;
  vec3 base = mix(uAmber, uCoreTint, coreMask * (0.22 + 0.5 * kiss));
  // Facing weight now rides GENTLY (0.55 floor + 0.45·vW, linear not squared):
  // every member is unmistakably lit amber trim, the low-facing console rails
  // included. The squared term used to sink them ~2× below the canopy beam and
  // read as an unlit, disconnected console.
  float energy = uFloor * (0.55 + 0.45 * vW) * diff * (1.0 + 0.6 * kiss) * vigComp(vPos);
  // The kiss stays AMBER-LEANING (mix toward the star colour, never pure): the
  // old raw uStarColor term bleached every member bone-tan under the black
  // hole's disk glare — saturation is the difference between trim and tube.
  vec3 col = base * energy + mix(uAmber * 1.4, uStarColor, 0.45) * kiss * 0.9;
  float edge = 1.0 - smoothstep(0.55, 1.0, t);
  // Decloak: materialisation cells gate presence; fresh pixels glint electric.
  col = cloakTint(col, vPos);
  gl_FragColor = vec4(col, uAlpha * edge * vCover * cloakMask(vPos) * 0.96);
}
`;

/** Glow pass: the halo. Additive, gaussian across the wide ribbon — carries
 *  the edge-lit look on its own (the bloom pass's per-chapter strength cannot
 *  be relied on at the quiet chapters). Halo energy follows the same member
 *  hierarchy: the fat trim wears the big halo, hairlines barely any. */
export const cockpitGlowFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;
uniform float uFloor;
uniform float uAlpha;
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
varying vec2 vN;
varying float vCover;
void main() {
  vec2 n = normalize(vN);
  float diff = grazeDiff(vPos, n);
  float spec = grazeSpec(vPos, n);
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float kiss = min(lit * spec, 0.6);
  // The halo follows the LIGHT, not the line: in the reference it blooms only
  // off the hot lit spans and vanishes on the umber ones — a uniform halo is
  // what fogged the dash into washed brown haze (it fed the scene bloom along
  // every member at once).
  float g = exp(-vSide * vSide * 7.0);
  // Facing weight rides gently here too (match the core pass), so the halo hugs
  // the console rails as much as the canopy beam — one evenly-lit trim set.
  float hier = (0.55 + 0.45 * vW) * (0.35 + 0.65 * smoothstep(1.4, 2.7, vWidth));
  // The 0.6 floor keeps a faint CONTINUOUS ribbon of light under every member:
  // it pre-blurs the bloom pass's input so a span crossing the threshold blooms
  // smoothly instead of beading (thin 2px cores alias in the mip chain).
  float energy = uFloor * 0.3 * hier * diff * (0.6 + 1.0 * kiss) * vigComp(vPos);
  // The halo materialises with its member (same cells), no electric tint here —
  // an additive glow flashing blue would flood the bloom pass.
  gl_FragColor = vec4(uAmber * energy, uAlpha * g * vCover * cloakMask(vPos) * 0.16);
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

export const cockpitPanelFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform vec3 uAmber;   // the trim's own bounce on the masses
uniform float uAlpha;
uniform float uFill;   // resting panel opacity (the interior's darkness)
varying vec2 vPos;
void main() {
  float lit = litAt(vPos, 1.0);
  // The hull is a near-black OCCLUDER first (it blocks the starfield so the
  // scene shows only through the glass — that occlusion is what actually turns
  // floating trim into "a ship you sit inside"). The reference interior is
  // almost pure black; the mass reads only from the trim edge-lighting it, so
  // the surface terms here stay a WHISPER — just enough that the panel is a
  // machined surface catching a hair of light near the opening, never a lit
  // wall that competes with the glass.
  //
  // edgeGlow: the panel edges nearest the windshield opening (the ceiling's
  // lower lip, the dash's upper lip) catch a touch more of the interior bounce
  // than the deep top/bottom — a coarse AO fake that reads as a curved hull.
  vec2 q = vec2(vPos.x / 1920.0 - 0.5, vPos.y / 1080.0 - 0.5);
  float toGlass = 1.0 - smoothstep(0.02, 0.40, abs(q.y));   // near the opening
  float toCentre = 1.0 - smoothstep(0.10, 0.62, abs(q.x));  // away from edges
  float edgeGlow = toGlass * (0.35 + 0.65 * toCentre);
  vec3 metal = vec3(0.009, 0.0085, 0.011);                  // machined hull base
  vec3 shell = metal + vec3(0.011, 0.0095, 0.009) * edgeGlow;
  // The star wash stays a WHISPER (0.008) so the black hole's screen-wide disk
  // glare can't tint the whole dash brown; the amber bounce hugs the trim edge.
  vec3 col = shell + uAmber * (0.004 + 0.010 * edgeGlow) + uStarColor * lit * 0.008;
  // The interior masses de-cloak on the same cell field as the trim.
  gl_FragColor = vec4(col, uFill * uAlpha * cloakMask(vPos));
}
`;
