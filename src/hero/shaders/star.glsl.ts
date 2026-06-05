// Lensed starfield + plain distant-star shaders.
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.

import { LENS_GLSL } from './lens.glsl';

export const starVertexShader = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uThetaE, uAspect, uImageSign, uStarBright, uHole;
  varying float vB;
  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    vec4 bhC  = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    bool drop = (clip.w <= 0.0);
    vec2 ndc   = clip.xy / max(clip.w, 1e-4);
    vec2 ndcBH = bhC.xy / max(bhC.w, 1e-4);
    vec2 off = ndc - ndcBH;
    vec2 a   = vec2(off.x*uAspect, off.y);
    float beta = max(length(a), 2e-4);
    vec2 dir = a / beta;

    float root = sqrt(beta*beta + 4.0*uThetaE*uThetaE);
    float thetaImg = (uImageSign > 0.0) ? 0.5*(beta + root) : 0.5*(beta - root);
    float u = beta / uThetaE;
    float magCore = (u*u + 2.0) / (u*sqrt(u*u + 4.0));
    float mag = (uImageSign > 0.0) ? abs(0.5*(magCore + 1.0)) : abs(0.5*(magCore - 1.0));

    vec2 aNew   = dir * thetaImg;
    vec2 offNew = vec2(aNew.x/uAspect, aNew.y);
    vec2 ndcNew = ndcBH + offNew;
    float rNew  = length(aNew);

    if(rNew < uHole) drop = true;
    if(uImageSign < 0.0 && rNew > uThetaE*1.25) drop = true;

    gl_Position = vec4(ndcNew, 0.0, 1.0);
    float tw = 0.55 + 0.45*sin(uTime*0.7 + aSeed*40.0);
    // The photon over-density at the rim comes from the COMPRESSION of positions
    // near the ring (points pile up), not from a brightness factor that saturates
    // to a hot point. So we keep brightness near-flat.
    float mg = clamp(mag, 0.5, 1.2);
    float caustic = smoothstep(uThetaE*0.04, uThetaE*0.75, beta); // damp very near alignment
    vB = (0.30 + 0.70*aSeed) * tw * mg * uStarBright * mix(0.5, 1.0, caustic);
    if(uImageSign < 0.0) vB *= 0.4;
    gl_PointSize = uPixelRatio * (0.7 + 1.5*aSeed) * (uImageSign > 0.0 ? 1.0 : 0.85);
    if(drop) gl_PointSize = 0.0;
  }
`;

export const starFragmentShader = /* glsl */ `
  precision highp float; varying float vB;
  void main(){
    vec2 c = gl_PointCoord-0.5; if(length(c)>0.5) discard;
    float a = smoothstep(0.5,0.0,length(c));
    gl_FragColor = vec4(vec3(0.95,0.96,0.98)*vB*a*1.05, 1.0);
  }
`;

// ---------------------------------------------------------------------------
//  A single distant star for the black-hole frame. It is intentionally tiny and
//  quiet: a few sub-points travel as one source so lensing can stretch it near
//  the rim, then it fades into the event horizon.
// ---------------------------------------------------------------------------

export const distantStarVertexShader = /* glsl */ `
  attribute float aShard;
  attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uThetaE, uAspect, uHole, uPresence;
  varying float vB;

  ${LENS_GLSL}

  void main(){
    float cycle = fract((uTime + 8.0) / 24.0);
    float drift = smoothstep(0.0, 0.68, cycle);
    float fall = smoothstep(0.62, 0.94, cycle);
    float p = drift * 0.22 + pow(fall, 2.7) * 0.78;

    vec3 startP = vec3(-130.0, 20.0, -240.0);
    vec3 midP = vec3(-42.0, 8.0, -110.0);
    vec3 endP = vec3(-0.20, 0.07, -3.2);
    vec3 pos = mix(startP, midP, smoothstep(0.0, 0.72, p));
    pos = mix(pos, endP, pow(smoothstep(0.50, 1.0, p), 2.2));

    vec3 travel = normalize(endP - startP);
    vec3 side = normalize(cross(travel, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(side, travel));
    float stretch = smoothstep(0.56, 0.90, cycle);
    pos += side * (aShard - 0.5) * (0.010 + 0.11 * stretch);
    pos += up * (aSeed - 0.5) * 0.018 * stretch;

    vec4 viewP = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipP = projectionMatrix * viewP;
    vec4 clipBH = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float mag, screenR;
    vec4 lClip = lensClip(clipP, clipBH, mag, screenR);

    float fadeIn = smoothstep(0.04, 0.12, cycle);
    float fadeOut = 1.0 - smoothstep(0.88, 0.97, cycle);
    float horizonFade = 1.0 - smoothstep(uHole * 0.72, uHole * 1.04, screenR);
    float visible = uPresence * fadeIn * fadeOut * horizonFade;

    gl_Position = lClip;
    float dist = max(-viewP.z, 1.0);
    gl_PointSize = clamp(uPixelRatio * (0.85 + 1.6 * stretch) * (150.0 / dist), 0.55, 2.2);
    vB = visible * (0.20 + 0.20 * aSeed) * (1.0 + 1.15 * stretch) * min(mag, 1.9);
    if(clipP.w <= 0.0 || vB < 0.002) gl_PointSize = 0.0;
  }
`;

export const distantStarFragmentShader = /* glsl */ `
  precision highp float;
  varying float vB;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = vec3(0.82, 0.90, 1.0);
    gl_FragColor = vec4(col * vB * a, a);
  }
`;
