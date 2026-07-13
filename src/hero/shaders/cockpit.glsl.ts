// Cockpit overlay shaders. The structural hull/trim is one precomposed RGBA
// texture rendered in a private scene AFTER the composer, so it can react to
// the lifecycle without ever entering bloom. The HUD remains separate because
// it deploys from physical emitters and tracks the star.

const designToClip = /* glsl */ `
vec4 clipFromDesign(vec2 p) {
  return vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
}
`;

/** Predator-style materialisation shared by the plate and HUD. */
const cloak = /* glsl */ `
uniform float uDecloak;
uniform float uTime;
float ckHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
}
float cloakField(vec2 p) {
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
  float wave = 1.0 - smoothstep(0.025, 0.13, abs(cloakField(p) - uDecloak * 1.42));
  float pulse = 0.72 + 0.28 * sin(uTime * 24.0 + p.x * 0.035 + p.y * 0.021);
  float lum = max(col.r, max(col.g, col.b));
  vec3 heat = mix(vec3(0.42, 0.68, 0.86), vec3(1.0, 0.62, 0.24), smoothstep(0.30, 0.82, uDecloak));
  return col + heat * lum * wave * pulse * 0.9;
}
`;

/** Scene light shared by the plate's solid response. No blur kernel or halo. */
const starLight = /* glsl */ `
uniform vec2 uLight;
uniform vec3 uStarColor;
uniform float uStarIntensity;
uniform float uNova;
float litAt(vec2 p) {
  float d = distance(p, uLight);
  float wide = exp(-d / 950.0);
  float hot = exp(-d * d / (2.0 * 240.0 * 240.0));
  return (wide * 0.65 + hot * 1.6) * uStarIntensity;
}
float vigMul(vec2 p) {
  vec2 q = vec2(p.x / 1920.0 - 0.5, 0.5 - p.y / 1080.0);
  float vig = smoothstep(1.10, 0.28, length(q) * 1.25);
  return mix(0.78, 1.0, vig);
}
vec3 novaWash(vec3 col) {
  return mix(col, vec3(1.0, 0.97, 0.92), uNova * 0.9);
}
`;

export const cockpitPlateVertexShader = /* glsl */ `
${designToClip}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vPos = position.xy;
  vUv = uv;
  gl_Position = clipFromDesign(position.xy);
}
`;

/**
 * The texture already owns all topology and base colour. Reactive lighting is
 * deliberately restricted to pixels that already exist in the plate: a soft
 * solid-energy lift, never a glow and never another silhouette.
 */
export const cockpitPlateFragmentShader = /* glsl */ `
precision highp float;
${starLight}
${cloak}
uniform sampler2D uPlate;
uniform float uAlpha;
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec4 plate = texture2D(uPlate, vUv);
  vec3 col = plate.rgb;

  // Amber pixels are the highlight mask; neutral graphite stays mostly fixed.
  float trim = smoothstep(0.10, 0.30, col.r - col.b);
  float light = min(litAt(vPos), 1.45);
  float material = plate.a * (0.018 + 0.050 * trim) * light;
  col += uStarColor * material;
  col *= vigMul(vPos);
  col = novaWash(col);
  col = cloakTint(col, vPos);

  gl_FragColor = vec4(col, plate.a * uAlpha * cloakMask(vPos));
}
`;

/** HUD projection geometry remains vector because it moves and tracks uLight. */
export const cockpitHudVertexShader = /* glsl */ `
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aHalf;
attribute float aFollow;
uniform vec2 uLight;
uniform float uHudDeploy;
uniform float uHalfW;
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

export const cockpitHudFragmentShader = /* glsl */ `
precision highp float;
${cloak}
uniform vec3 uHud;
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
