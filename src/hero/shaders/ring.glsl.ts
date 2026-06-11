// Photon-ring shaders.
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.

export const ringVertexShader = /* glsl */ `
  attribute float aAng; attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uAspect, uHole, uVertAsym, uHorizAsym, uRingBright, uMorph;
  uniform float uRingScale;
  varying float vB;
  void main(){
    vec4 bhC = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    vec2 ndcBH = bhC.xy / bhC.w;
    // SIZE-COUPLED RING. The photon ring is BRIGHTEST at the hero (uMorph≈0),
    // where the black hole is largest, and dims as the hole shrinks toward the
    // seed during the morph — the rim of light reads as a property of the hole's
    // size. It is fully gone before the shadow collapses to the seed/flash so the
    // remnant isn't haloed. bloom is the master 1->0 envelope.
    float bloom = 1.0 - smoothstep(0.10, 0.42, uMorph); // full at the hero, gone before the seed
    // As the ring dims it also tightens onto the rim and slims its band, so the
    // fade reads as the rim collapsing to a finer hairline, not just dropping out.
    float tighten = mix(1.0, 0.94, bloom);         // a touch tighter as it dims (bloom→0)
    float spread  = mix(0.012, 0.03, bloom);       // thinner radial band as it dims
    // uRingScale (dev): radius of the ring relative to the dark-core rim.
    float r = uHole * uRingScale * tighten * (1.0 + (aSeed-0.5)*spread);  // thin ring at the dark-core rim
    vec2 dir = vec2(cos(aAng), sin(aAng));
    vec2 ndc = ndcBH + vec2(dir.x * r / uAspect, dir.y * r);
    gl_Position = vec4(ndc, 0.0, 1.0);
    float tw = 0.78 + 0.22*sin(uTime*1.4 + aSeed*53.0);
    // complete, crisp circle in front of the stars: high floor, approaching side a touch brighter
    float dop = 0.85 + 0.40*smoothstep(0.55, -0.7, dir.x + 0.22*dir.y);
    // Baseline ~50% dimmer than before (a subtle rim, never a blazing halo).
    vB = tw * dop * (0.6 + 0.4*aSeed) * 1.45 * uRingBright * 0.5;
    // adjustable top/bottom and left/right asymmetries
    vB *= clamp(1.0 + uVertAsym * dir.y, 0.0, 3.0);
    vB *= clamp(1.0 - uHorizAsym * dir.x, 0.0, 3.0);
    // Gate by the size-coupled envelope: full at the hero, fading as the hole
    // shrinks, then gone before the shadow collapses.
    vB *= bloom;
    gl_PointSize = uPixelRatio * (0.7 + 0.8*aSeed);
  }
`;

export const ringFragmentShader = /* glsl */ `
  precision highp float; varying float vB;
  void main(){
    vec2 c = gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // ITEM 2: the photon ring is a COLD silver / blue-white hairline (was warm 0.97,0.97,0.96),
    // so the rim of light reads cold-silver, never a warm halo.
    gl_FragColor = vec4(vec3(0.90,0.94,1.00) * vB * a * 1.0, 1.0);
  }
`;
