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

/** Uniform mapping shared by both vertex shaders: design px → NDC, with the
 *  power-on unzoom scaling the drawing around the pilot-seat fixed point. */
const designToClip = /* glsl */ `
uniform float uZoom;    // unzoom scale: COCKPIT_ZOOM_START → 1 as the HUD powers on
uniform vec2 uCenter;   // the unzoom's fixed point (design space)
vec4 clipFromDesign(vec2 p) {
  p = (p - uCenter) * uZoom + uCenter;
  return vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
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
uniform float uWidthScale;  // 1 for the core pass, ~7 for the glow pass
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
void main() {
  vec2 p = aPos + aNorm * (aSide * uHalfW * aWidth * uWidthScale);
  vPos = p;
  vSide = aSide;
  vW = aW;
  vWidth = aWidth;
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
uniform vec3 uAmber;     // piping body colour
uniform vec3 uCoreTint;  // white-hot centre
uniform float uFloor;    // HDR self-luminous gain (per-chapter keyframe)
uniform float uAlpha;    // deploy opacity (power fade)
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
void main() {
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float litN = clamp(lit, 0.0, 1.0);
  float t = abs(vSide);
  float widthGate = smoothstep(2.2, 3.6, vWidth);
  float coreMask = (1.0 - smoothstep(0.0, 0.5, t)) * widthGate;
  vec3 base = mix(uAmber, uCoreTint, coreMask * (0.28 + 0.35 * litN));
  float energy = uFloor * (0.25 + 0.75 * vW * vW) * (1.0 + 0.5 * min(lit, 0.6)) * vigComp(vPos);
  vec3 col = base * energy + uStarColor * min(lit, 1.2) * 0.9;
  float edge = 1.0 - smoothstep(0.55, 1.0, t);
  gl_FragColor = vec4(col, uAlpha * edge * 0.96);
}
`;

/** Glow pass: the halo. Additive, gaussian across the wide ribbon — carries
 *  the edge-lit look on its own (the bloom pass's per-chapter strength cannot
 *  be relied on at the quiet chapters). Halo energy follows the same member
 *  hierarchy: the fat trim wears the big halo, hairlines barely any. */
export const cockpitGlowFragmentShader = /* glsl */ `
precision highp float;
${starLight}
uniform vec3 uAmber;
uniform float uFloor;
uniform float uAlpha;
varying vec2 vPos;
varying float vSide;
varying float vW;
varying float vWidth;
void main() {
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float g = exp(-vSide * vSide * 5.0);
  float hier = (0.4 + 0.6 * vW * vW) * (0.35 + 0.65 * smoothstep(1.4, 4.0, vWidth));
  float energy = uFloor * 0.3 * hier * (1.0 + 0.7 * clamp(lit, 0.0, 0.5)) * vigComp(vPos);
  gl_FragColor = vec4(uAmber * energy, uAlpha * g * 0.2);
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
uniform vec3 uAmber;   // a whisper of the trim's own bounce on the masses
uniform float uAlpha;
uniform float uFill;   // resting panel opacity (the interior's darkness)
varying vec2 vPos;
void main() {
  float lit = litAt(vPos, 1.0);
  // Near-black structure with a whisper of the piping's bounce, plus a faint
  // wash of the star's light nearby — surfaces catching the scene, not a hole.
  vec3 col = vec3(0.006, 0.005, 0.007) + uAmber * 0.003 + uStarColor * lit * 0.02;
  gl_FragColor = vec4(col, uFill * uAlpha);
}
`;
