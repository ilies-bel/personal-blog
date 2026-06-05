// Shared GLSL: gravitational lensing (point lens).
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.

export const LENS_GLSL = /* glsl */ `
  uniform float uThetaE;
  uniform float uShadowR;
  uniform float uAspect;
  uniform float uImageSign;

  vec4 lensClip(vec4 clipP, vec4 clipBH, out float mag, out float screenR){
    vec2 ndcP  = clipP.xy  / clipP.w;
    vec2 ndcBH = clipBH.xy / clipBH.w;
    vec2 off   = ndcP - ndcBH;
    vec2 aoff  = vec2(off.x * uAspect, off.y);
    float beta = max(length(aoff), 1e-4);
    vec2  dir  = aoff / beta;

    float u = beta / uThetaE;
    float root = sqrt(u*u + 4.0);
    float img = (uImageSign > 0.0) ? 0.5*(u + root) : 0.5*(u - root);
    float theta = img * uThetaE;

    float core = (u*u + 2.0) / (2.0 * u * root);
    mag = (uImageSign > 0.0) ? abs(core + 0.5) : abs(core - 0.5);

    vec2 newA = dir * theta;
    vec2 newOff = vec2(newA.x / uAspect, newA.y);
    vec2 newNdc = ndcBH + newOff;

    screenR = abs(theta);
    return vec4(newNdc * clipP.w, clipP.z, clipP.w);
  }
`;
