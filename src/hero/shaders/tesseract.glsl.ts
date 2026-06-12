// Tesseract beam shader — the GLSL for the SOLID-BEAM lattice rig (buildTesseract.ts).
//
// This is NOT a raymarch. The geometry is a single InstancedMesh of unit boxes; each
// instance is one long shelf-back BEAM placed in a nested-frame "bookcase tunnel". The
// material shades those real faces:
//   • a cheap hemisphere/lambert term from a bright CORE light down the tunnel axis so
//     the beams have form (a lit face + a dark face) without a full PBR cost,
//   • a per-instance base colour (warm wood / tarnished steel / graphite) passed via
//     three's built-in `instanceColor` (vColor),
//   • an EDGE-LEAK emissive: the gaps between stacked beams glow, so a thin bright rim
//     runs along the long top/bottom edges of every beam (light leaking between shelves),
//   • an along-length STREAK gradient (the film beams are motion-blurred into streaks):
//     a fine high-frequency brightness ripple down the beam's local long axis, plus a
//     soft tip falloff, so each beam reads as a streaked extrusion not a clean box,
//   • DEPTH HAZE toward a luminous vanishing point: far beams wash toward a warm core
//     colour and brighten, so the tunnel resolves into a glowing core (claustrophobic
//     infinite depth), and an overall `uDim`/exposure so the whole thing can be tuned
//     to the dark, restrained level the reading page needs.
//
// Per-instance varyings ride in on custom InstancedBufferAttributes set up by the rig
// (aBeamAxis = the beam's local long axis, aHue = warm/cool offset, aStreak = streak
// amount, aDepth = normalised depth of the frame this beam belongs to).

export const tesseractBeamVert = /* glsl */ `
  precision highp float;

  attribute vec3 aBeamAxis;   // unit local long axis of THIS beam, in object space
  attribute float aHue;       // -1..1 warm(-)→cool(+) per-beam tint offset
  attribute float aStreak;    // 0..1 how streaked/elongated this beam reads
  attribute float aDepth;     // 0..1 normalised depth of the frame (0 near → 1 far)

  uniform float uTime;

  varying vec3 vWorldNormal;
  varying vec3 vViewPos;      // view-space position (core light + depth haze)
  varying vec3 vColor;        // per-instance base colour (instanceColor)
  varying float vLong;        // 0..1 along the beam's long axis
  varying float vAcross;      // 0..1 across the beam's short axes (edge-leak rim)
  varying float vHue;
  varying float vStreak;
  varying float vDepth;
  varying float vFaceLong;    // 1 on the long side faces, 0 on the end caps

  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(0.5);
    #endif
    vHue = aHue;
    vStreak = aStreak;
    vDepth = aDepth;

    // Local position on the unit box (BoxGeometry is centred, half-extent 0.5).
    float longProj = dot(position, aBeamAxis);            // -0.5..0.5 along length
    vLong = clamp(longProj + 0.5, 0.0, 1.0);
    vec3 acrossVec = position - aBeamAxis * longProj;      // residual in the short plane
    vAcross = clamp(length(acrossVec) * 2.0, 0.0, 1.0);    // 0 centre → ~1 at short edges

    // Long side faces (normal perpendicular to the long axis) carry the edge-leak rim.
    vFaceLong = 1.0 - step(0.5, abs(dot(normalize(normal), aBeamAxis)));

    mat4 mv = modelViewMatrix * instanceMatrix;
    vec4 mvPos = mv * vec4(position, 1.0);
    vViewPos = mvPos.xyz;

    mat3 nm = mat3(mv);
    vWorldNormal = normalize(nm * normal);

    gl_Position = projectionMatrix * mvPos;
  }
`;

export const tesseractBeamFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uDim;        // master exposure (keep dim so the reading text stays legible)
  uniform float uCore;       // core-light lambert strength down the tunnel
  uniform float uFogDensity; // exponential depth haze toward the core
  uniform vec3  uCoreColor;  // warm vanishing-point glow colour
  uniform vec3  uFogColor;   // colour the far beams wash toward (the luminous core)
  uniform float uEdgeLeak;   // edge-seam emissive strength (light between shelves)
  uniform float uStreakAmt;  // along-length streak ripple strength

  varying vec3 vWorldNormal;
  varying vec3 vViewPos;
  varying vec3 vColor;
  varying float vLong;
  varying float vAcross;
  varying float vHue;
  varying float vStreak;
  varying float vDepth;
  varying float vFaceLong;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(-vViewPos);            // toward the camera (view space, cam at 0)

    // core light: the bright vanishing point is the ONLY source. Faces turned toward it
    // (end caps, inner faces) catch a warm key; faces perpendicular to it (the long wall
    // faces) fall to a near-black fill. Wrap a touch so the shadow side isn't dead flat.
    vec3 coreDir = normalize(vec3(0.0, 0.0, -1.0));
    float nl = dot(N, coreDir);
    float lambert = max(nl, 0.0);
    float wrap = max(nl * 0.5 + 0.5, 0.0);    // soft wrap term for the shadow side
    float fill = 0.05 + 0.07 * wrap;          // LOW ambient → most faces sit in shadow
    float lit = fill + uCore * lambert;

    // tight view-facing sheen so steel beams catch a thin rim of light
    float sheen = pow(max(dot(N, V), 0.0), 5.0) * 0.07;

    // base colour with a small per-beam warm/cool push (wood ↔ steel/graphite)
    vec3 base = vColor;
    base = mix(base, base * vec3(1.12, 1.02, 0.86), max(0.0, -vHue)); // warmer (wood)
    base = mix(base, base * vec3(0.88, 0.95, 1.10), max(0.0,  vHue)); // cooler (steel)

    vec3 col = base * lit + sheen;

    // along-length MOTION SMEAR: the film beams are blurred into long bright/dark streaks
    // down their length. Use mostly LOW-frequency runs (long smears) with a little fine
    // grain on top, plus a velocity gradient that brightens one end (the leading smear),
    // so each beam reads as a streak, not a flickery box.
    float freq = mix(7.0, 16.0, vStreak);                 // LONG runs → smear, not flicker
    float r1 = sin(vLong * freq + vHue * 31.0) * 0.5 + 0.5;
    float r2 = sin(vLong * freq * 3.1 + vHue * 13.0) * 0.5 + 0.5; // fine grain on top
    float grad = vLong * 0.5 + 0.5;                       // leading-end velocity smear
    float ripple = r1 * 0.55 + r2 * 0.2 + grad * 0.25;
    ripple = mix(0.5, ripple, uStreakAmt * (0.5 + 0.5 * vStreak));
    float band = smoothstep(0.78, 0.84, hash11(vHue * 53.0 + 3.0)) *
                 (sin(vLong * 5.0 + vHue * 11.0) * 0.5 + 0.5);
    col *= (0.22 + 0.98 * ripple);           // deep troughs → strong streak contrast
    // a SUBSET of beams carry a hot warm light-streak (light leaking between shelves) —
    // sparse but bright, so the dark walls are punctuated by glints like the film.
    col += band * 1.1 * uCoreColor * (0.5 + 0.5 * ripple);
    col *= mix(1.0, 0.6, smoothstep(0.55, 1.0, vLong) * vStreak);

    // edge leak: bright thin rim along the long top/bottom seams (between shelves),
    // strongest on beams turned toward the camera so it reads as a caught highlight.
    float seam = smoothstep(0.62, 0.98, vAcross) * vFaceLong;
    float facing = max(dot(N, V), 0.0);
    col += uCoreColor * seam * uEdgeLeak * (0.4 + 0.8 * facing);

    // depth haze: far beams recede into NEAR-BLACK murk, and only the very deepest frames
    // pick up the hot core glow. The shaft stays brooding; the core is the only bright pool.
    float viewDepth = length(vViewPos);
    float fog = 1.0 - exp(-uFogDensity * viewDepth);
    fog = clamp(fog * 0.45 + vDepth * 0.35, 0.0, 1.0);
    vec3 hazed = mix(col, uFogColor, fog * 0.8);
    hazed += uCoreColor * pow(vDepth, 5.0) * 0.95; // hot centre only at the deep core (soft glow, falloff keeps near beams dark)

    // master exposure / dim, then a gentle knee so the core doesn't clip flat-white early.
    vec3 outc = hazed * uDim;
    outc = outc / (outc + vec3(1.6)) * 1.55;

    gl_FragColor = vec4(outc, 1.0);
  }
`;

// A fullscreen vanishing-point GLOW pass, composited additively AFTER the beam scene so
// the centre of the tunnel reads as a bright leaking core (light pouring up the shaft)
// independent of where the beams happen to land. Dimmed by the same uDim.
export const tesseractGlowVert = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const tesseractGlowFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uLook;        // -1..1 pointer offset (the glow tracks the camera pan)
  uniform float uAspect;
  uniform vec3 uCoreColor;
  uniform float uDim;
  uniform float uGlow;
  void main() {
    vec2 p = (vUv - 0.5);
    p.x *= uAspect;
    vec2 c = vec2(uLook.x * 0.12 * uAspect, uLook.y * 0.10); // vanishing point slides
    float d = length(p - c);
    // TIGHT core glow only — a small bright pool at the vanishing point, no broad veil
    // (a wide falloff washes the whole reading area warm and kills the contrast).
    float core = exp(-d * d * 22.0) * uGlow;
    core += exp(-d * d * 5.0) * uGlow * 0.25;
    vec3 col = uCoreColor * core * uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;
