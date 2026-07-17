// Cursor-photon shaders: the "cursor emits light, the black hole absorbs it"
// interaction rig (see scene/buildPhotons.ts for the physics/pooling story).
//
// Two draws share this file: the photon HEADS (additive gaussian point sprites,
// one pooled THREE.Points) and their TRAILS (one shared THREE.LineSegments over
// per-photon ring-buffered history). The heads are deliberately DIM and small —
// the bent trail carries the visual. Both tint by the per-vertex gravitational
// blueshift factor aB: far photons sit warm dim silver, infalling photons slide
// to pure blue-white (aB also scales brightness, applied CPU-side into aI).

/** Shared blueshift color ramp: aB spans 1 (far, warm silver) → 2.5 (rim,
 *  blue-white). Normalized to 0..1 here so both draws grade identically. */
const blueshiftColorGLSL = /* glsl */ `
  vec3 blueshiftColor(float shift, vec3 warm, vec3 blue) {
    float t = clamp((shift - 1.0) / 1.5, 0.0, 1.0);
    return mix(warm, blue, t);
  }
`;

export const photonsVertexShader = /* glsl */ `
  // aI: per-photon brightness (already blueshift-scaled on CPU). 0 marks a DEAD
  //     pool slot — the point is sized to zero so the GPU rasterizes nothing for
  //     it (the pool never re-uploads a smaller draw range; dead slots just cost
  //     a degenerate vertex).
  // aS: size scale — 1 in flight, shrinking to 0 during the capture SWALLOW so a
  //     photon crossing the horizon visually collapses into the shadow disc.
  // aB: gravitational blueshift factor (1 far → 2.5 at the rim) — drives the
  //     fragment color grade.
  attribute float aI;
  attribute float aS;
  attribute float aB;
  uniform float uPixelRatio, uSize;
  varying float vI;
  varying float vB;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vI = aI;
    vB = aB;
    // Perspective-attenuated sprite size (18/-z matches the scene's other point
    // rigs' falloff scale), clamped at 28px — heads stay small dots; the TRAIL
    // is the light source now. Dead slots (aI == 0) collapse to 0px.
    float size = uSize * uPixelRatio * aS * (18.0 / max(1.0, -mv.z));
    gl_PointSize = aI <= 0.0 ? 0.0 : min(size, 28.0);
  }
`;

export const photonsFragmentShader = /* glsl */ `
  precision highp float;
  varying float vI;
  varying float vB;
  ${blueshiftColorGLSL}
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // Gaussian core: tight and hot in the middle, soft skirt to the sprite edge.
    float g = exp(-d * d * 10.0);
    // No over-drive (was ×1.6): the head is a marker, not the show — a fast
    // flick's intensity (up to 2.0, blueshift up to 2.5) still crosses the bloom
    // threshold near the rim, but a drifting ember stays a faint dot.
    vec3 col = blueshiftColor(vB, vec3(0.82, 0.83, 0.86), vec3(0.80, 0.92, 1.00));
    gl_FragColor = vec4(col * vI * g, 1.0);
  }
`;

export const photonTrailVertexShader = /* glsl */ `
  // Per-VERTEX intensity: buildPhotons writes a quadratic head→tail fade into aI
  // so each trail brightens toward the photon and dies away along its history —
  // the bent path reads as a comet streak, not a uniform wire. aB carries the
  // photon's gravitational blueshift for the color grade below.
  attribute float aI;
  attribute float aB;
  varying float vI;
  varying float vB;
  void main(){
    vI = aI;
    vB = aB;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const photonTrailFragmentShader = /* glsl */ `
  precision highp float;
  varying float vI;
  varying float vB;
  ${blueshiftColorGLSL}
  void main(){
    // Additive; graded by the same blueshift ramp as the head so a photon and
    // its streak read as ONE object — warm dim silver far out, blue-white where
    // the arc whips the rim. The streak carries the visual (heads are dim).
    vec3 col = blueshiftColor(vB, vec3(0.78, 0.80, 0.84), vec3(0.75, 0.90, 1.00));
    gl_FragColor = vec4(col * vI, 1.0);
  }
`;
