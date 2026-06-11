// Standalone line-streak shaders for the optional hyperspace rig.

export const streakVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aEnd;
  attribute float aStrong;   // 1 = strong structural ray, 0 = faint lane (ITEM 6 two-tier)
  uniform float uTime, uPixelRatio, uAspect, uStreak, uStreakDir;
  varying float vA;
  varying float vStrong;

  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 ndc = clip.xy / max(clip.w, 1e-4);
    float rad = length(vec2(ndc.x * uAspect, ndc.y));
    vec2 dir = rad > 1e-4 ? normalize(ndc) : vec2(1.0, 0.0);
    float lane = 0.38 + 0.72 * aSeed;
    float drift = fract(uTime * 0.18 + aSeed) * 0.08 * uStreakDir;
    float stretch = uStreak * lane * (0.72 + 1.18 * rad);
    ndc += dir * aEnd * (stretch + drift);
    gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
    gl_PointSize = uPixelRatio;
    // ITEM 6: TWO opacity tiers so the far/faint lanes recede and only the few strong
    // structural rays carry signal — precision/clarity, not a wireframe explosion. The
    // faint tier peaks at ~0.18 alpha, the strong tier at ~0.38 (matching the spec's
    // rgba(160,185,255,.18) / rgba(210,225,255,.38)). The radial fade (mix on aEnd) keeps
    // the FAR end of every lane more transparent.
    float tierA = mix(0.18, 0.38, aStrong);
    vA = uStreak * tierA * mix(1.0, 0.42, aEnd);
    vStrong = aStrong;
  }
`;

export const streakFragmentShader = /* glsl */ `
  precision highp float;
  varying float vA;
  varying float vStrong;

  void main(){
    // ITEM 6: faint lanes read rgba(160,185,255) (cool blue), strong rays the brighter
    // rgba(210,225,255) blue-white — so the few structural rays stand out from the field.
    vec3 faint  = vec3(0.63, 0.73, 1.0);
    vec3 strong = vec3(0.82, 0.88, 1.0);
    vec3 col = mix(faint, strong, vStrong);
    gl_FragColor = vec4(col * vA, vA);
  }
`;
