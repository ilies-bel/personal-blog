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
`;

export const cockpitLineVertexShader = /* glsl */ `
attribute vec2 aPos;     // ribbon centreline point (design px)
attribute vec2 aNorm;    // miter normal (design space, miter-scaled)
attribute float aSide;   // which ribbon edge: -1 | +1
attribute float aW;      // facing weight (0..1)
attribute float aWidth;  // member width, CSS px (the piping hierarchy)
uniform float uHalfW;       // design units per CSS half-px (tracks viewport)
uniform float uWidthScale;  // 1 for the core pass, ~6 for the glow pass
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
void main() {
  vec2 p = aPos + aNorm * (aSide * uHalfW * aWidth * uWidthScale);
  vPos = p;
  vSide = aSide;
  vW = aW;
  gl_Position = clipFromDesign(p);
}
`;

/** Core pass: the member itself. Amber body, white-hot centre, brightness and
 *  temperature modulated by the star's light. Normal blending. */
export const cockpitLineFragmentShader = /* glsl */ `
precision highp float;
${starLight}
uniform vec3 uAmber;     // piping body colour
uniform vec3 uCoreTint;  // white-hot centre
uniform float uAlpha;    // deploy opacity (power fade)
varying vec2 vPos;
varying float vSide;
varying float vW;
void main() {
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float litN = clamp(lit, 0.0, 1.0);
  float t = abs(vSide);
  float coreMask = 1.0 - smoothstep(0.0, 0.38, t);
  vec3 col = mix(uAmber, uCoreTint, coreMask * (0.35 + 0.45 * litN));
  col *= 0.95 + 1.15 * lit;        // the scene's light breathes on the trim
  col += uStarColor * lit * 0.22;  // chapter temperature
  float edge = 1.0 - smoothstep(0.62, 1.0, t);
  gl_FragColor = vec4(col, uAlpha * edge * (0.72 + 0.28 * litN));
}
`;

/** Glow pass: the halo. Additive, gaussian across the wide ribbon, swelling
 *  where the star's light lands. */
export const cockpitGlowFragmentShader = /* glsl */ `
precision highp float;
${starLight}
uniform vec3 uAmber;
uniform float uAlpha;
varying vec2 vPos;
varying float vSide;
varying float vW;
void main() {
  float lit = litAt(vPos, 0.35 + 0.65 * vW);
  float g = exp(-vSide * vSide * 4.0);
  vec3 col = uAmber * (0.5 + 0.9 * lit) + uStarColor * lit * 0.2;
  gl_FragColor = vec4(col, uAlpha * g * (0.2 + 0.27 * clamp(lit, 0.0, 1.0)));
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
uniform float uAlpha;
uniform float uFill;   // resting panel opacity (the interior's darkness)
varying vec2 vPos;
void main() {
  float lit = litAt(vPos, 1.0);
  // Near-black structure with a faint wash of the star's own light nearby —
  // the interior surfaces catching the scene (the sheen pass).
  vec3 col = vec3(0.008, 0.008, 0.012) + uStarColor * lit * 0.03;
  gl_FragColor = vec4(col, uFill * uAlpha);
}
`;
