// Standalone line-streak shaders for the optional hyperspace rig.

export const streakVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aEnd;
  uniform float uTime, uPixelRatio, uAspect, uStreak, uStreakDir;
  varying float vA;

  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 ndc = clip.xy / max(clip.w, 1e-4);
    float rad = length(vec2(ndc.x * uAspect, ndc.y));
    vec2 dir = rad > 1e-4 ? normalize(ndc) : vec2(1.0, 0.0);
    float lane = 0.38 + 0.72 * aSeed;
    float drift = fract(uTime * 0.18 + aSeed) * 0.08 * uStreakDir;
    float stretch = uStreak * lane * (0.42 + 0.72 * rad);
    ndc += dir * aEnd * (stretch + drift);
    gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
    gl_PointSize = uPixelRatio;
    vA = uStreak * mix(0.75, 0.28, aEnd);
  }
`;

export const streakFragmentShader = /* glsl */ `
  precision highp float;
  varying float vA;

  void main(){
    vec3 col = vec3(0.72, 0.84, 1.0);
    gl_FragColor = vec4(col * vA, vA);
  }
`;
