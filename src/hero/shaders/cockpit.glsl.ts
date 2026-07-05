// Cockpit canopy shaders — the line ribbons + interior panels drawn DIRECTLY in
// clip space (the vertex shaders ignore the camera matrices entirely: geometry
// is authored in the fixed 1920×1080 design space and mapped straight to NDC),
// so the frame is welded to the glass no matter how the scene camera flies.
// Rendered inside the main scene pass, so bloom genuinely lights the hot spans.
//
// LIGHTING — the reason this is WebGL and not a static overlay: the fragment
// shader computes per-pixel attenuation from the star's projected position
// (uLight, design space, written per frame from the same NDC projection the
// nova pass and the DOM markers use) in the STAR'S OWN COLOUR for the current
// lifecycle chapter (uStarColor/uStarIntensity, keyframed over the eased stage
// in buildCockpit). Two falloff terms: a wide ambient reach and a tight
// specular kiss; each ribbon's facing weight (aW) scales how squarely its
// member catches them.

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

export const cockpitLineVertexShader = /* glsl */ `
attribute vec2 aPos;    // ribbon centreline point (design px)
attribute vec2 aNorm;   // miter normal (design space, miter-scaled)
attribute float aSide;  // which ribbon edge: -1 | +1
attribute float aW;     // facing weight (0..1)
uniform float uHalfW;   // ribbon half-width in design units (tracks viewport)
${designToClip}
varying vec2 vPos;
varying float vSide;
varying float vW;
void main() {
  vec2 p = aPos + aNorm * (aSide * uHalfW);
  vPos = p;
  vSide = aSide;
  vW = aW;
  gl_Position = clipFromDesign(p);
}
`;

export const cockpitLineFragmentShader = /* glsl */ `
precision highp float;
uniform vec2 uLight;         // star position, design space
uniform vec3 uStarColor;     // the chapter's light colour
uniform float uStarIntensity;
uniform vec3 uDim;           // unlit strut colour (warm bone-gold)
uniform float uAlpha;        // deploy opacity (power fade)
varying vec2 vPos;
varying float vSide;
varying float vW;
void main() {
  float d = distance(vPos, uLight);
  // Wide ambient reach + tight specular kiss — the two-term falloff.
  float wide = exp(-d / 950.0);
  float hot = exp(-d * d / (2.0 * 300.0 * 300.0));
  float facing = 0.35 + 0.65 * vW;
  float lit = facing * (wide * 0.85 + hot * 1.6) * uStarIntensity;
  vec3 col = uDim * (0.55 + 0.45 * vW) + uStarColor * lit;
  // Feathered ribbon edges: the anti-aliasing of the hairline.
  float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
  float a = uAlpha * edge * clamp(0.42 + lit * 0.9, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
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
uniform vec2 uLight;
uniform vec3 uStarColor;
uniform float uStarIntensity;
uniform float uAlpha;
uniform float uFill;   // resting panel opacity (the interior's darkness)
varying vec2 vPos;
void main() {
  float d = distance(vPos, uLight);
  float hot = exp(-d * d / (2.0 * 300.0 * 300.0));
  // Near-black structure with a faint wash of the star's own light nearby —
  // the interior surfaces catching the scene (the sheen pass).
  vec3 col = vec3(0.008, 0.008, 0.012) + uStarColor * hot * uStarIntensity * 0.05;
  gl_FragColor = vec4(col, uFill * uAlpha);
}
`;
