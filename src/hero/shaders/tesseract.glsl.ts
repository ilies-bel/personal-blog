// Tesseract corridor shaders — a self-contained fullscreen raymarched scene that
// renders the Interstellar "tesseract / infinite bookcase" look: an endless tunnel
// of nested rectangular frames diving to a bright central vanishing point, with long
// radial streaks along the depth axis, warm-neutral palette, volumetric haze and a
// luminous core. It is NOT wired into the heavy hero scene — buildTesseract.ts mounts
// it on its own renderer + fullscreen quad (see that file).
//
// Technique: domain-repetition along +Z. The ray (origin + dir, sheared by the
// pointer `uLook`) marches a small SDF that repeats every uFrameGap units in Z. Each
// repeated cell holds a thin square "picture frame" (a box-frame / rounded rectangle
// outline). We accumulate emissive contribution per step weighted by how close the
// ray passes to a frame edge (so frame edges glow) and by depth fog (far gas fades to
// the core). The bright core is an inverse-distance glow at the vanishing point. This
// reads as the recursive bookcase corridor rather than a clean wireframe because the
// per-cell frames are jittered (size, brightness, slight rotation) by a hash of the
// cell index, the edges bleed into long streaks via an angular streak term, and the
// palette is warm-graphite with sparse cool specks.

export const tesseractVertexShader = /* glsl */ `
  // Fullscreen quad: pass clip-space straight through, hand the frag a -1..1 uv.
  varying vec2 vUv;
  void main() {
    vUv = position.xy;            // PlaneGeometry(2,2) → position.xy already in [-1,1]
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const tesseractFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uAspect;     // width / height
  uniform vec2  uLook;       // pointer look-around (-1..1), lerped on the JS side
  uniform float uAdvance;    // ambient push-in along Z (units travelled)
  uniform float uDim;        // master brightness (keep it dim/atmospheric)
  uniform float uFrameGap;   // Z spacing between repeated frames
  uniform float uStreak;     // radial streak intensity (bookshelf edges → long streaks)
  uniform float uCore;       // luminous-core brightness

  // ---- hashes ---------------------------------------------------------------
  float hash11(float p){
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  vec3 hash31(float p){
    vec3 q = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xxy + q.yzz) * q.zyx);
  }

  // Signed distance to the OUTLINE of an axis-aligned rounded rectangle (a picture
  // frame): negative inside the bar of the frame, ~0 on the edge line. We return the
  // distance to the rectangle's perimeter so a thin bright band tracks the frame.
  float frameEdge(vec2 p, vec2 halfSize, float radius){
    vec2 d = abs(p) - (halfSize - radius);
    float outside = length(max(d, 0.0)) - radius;
    float inside  = min(max(d.x, d.y), 0.0);
    return outside + inside;          // signed distance to the rounded-rect perimeter
  }

  // Warm-neutral palette ramp: deep graphite → tarnished brown → tarnished gold →
  // bone highlight, with a faint cool lift at the very top end (the cold specks).
  vec3 palette(float t){
    t = clamp(t, 0.0, 1.0);
    vec3 graphite = vec3(0.05, 0.045, 0.05);
    vec3 brown    = vec3(0.20, 0.12, 0.07);
    vec3 gold     = vec3(0.62, 0.44, 0.20);
    vec3 bone     = vec3(0.92, 0.86, 0.74);
    vec3 c = mix(graphite, brown, smoothstep(0.0, 0.35, t));
    c = mix(c, gold, smoothstep(0.30, 0.72, t));
    c = mix(c, bone, smoothstep(0.72, 1.0, t));
    // faint cool lift in the brightest cores (sparse blue-white highlights)
    c += vec3(-0.02, 0.0, 0.06) * smoothstep(0.86, 1.0, t);
    return c;
  }

  void main(){
    // Aspect-correct screen coord, centred at 0.
    vec2 uv = vUv;
    uv.x *= uAspect;

    // ---- camera / ray -------------------------------------------------------
    // We look straight down +Z into the corridor. The pointer (uLook) shears the ray
    // direction so the vanishing point slides and we "peer down a different axis" of
    // the tunnel — like looking around inside the tesseract. Keep the shear modest so
    // the centre never tips off-frame.
    vec2 look = uLook * 0.42;
    vec3 ro = vec3(look * 0.55, uAdvance);                 // origin drifts with the push-in
    vec3 rd = normalize(vec3(uv + look, 1.35));            // forward, sheared toward the cursor

    float gap = uFrameGap;
    vec3  col = vec3(0.0);           // accumulated colour
    float fog = 0.0;                 // accumulated haze

    // March a fixed number of cells forward. Each iteration jumps to the next frame
    // plane along Z (cheaper + steadier than a generic sphere-trace for this purely
    // axial structure), samples that frame's edge band, and fogs it by depth. The
    // planes are spaced by gap but we draw SEVERAL nested frames per plane so the
    // "frames within frames" cascade is dense even with a modest step count.
    const int STEPS = 30;
    // The first frame plane just ahead of the origin.
    float z0 = floor(ro.z / gap) * gap + gap;

    for (int i = 0; i < STEPS; i++){
      float fi = float(i);
      float planeZ = z0 + fi * gap;
      float dz = planeZ - ro.z;
      if (dz <= 0.0) continue;

      // Where the ray crosses this frame plane (true perspective intersection:
      // advance along the ray until z == planeZ, i.e. t = dz / rd.z).
      float t = dz / max(rd.z, 1e-3);
      vec2 hit = ro.xy + rd.xy * t;

      // Per-cell randomness so the corridor reads as a chaotic stack of real shelves,
      // not a clean periodic grid: size, brightness, tint, lateral offset and a small
      // rotation (so successive frames are skewed, never perfectly nested).
      float cellId = floor(planeZ / gap + 0.5);
      vec3  h = hash31(cellId * 1.7 + 11.0);
      float h2 = hash11(cellId * 3.1 + 5.0);
      vec2 offset = (h.xy - 0.5) * 0.14;        // lateral jitter per shelf
      // Per-cell rotation: a few degrees of tilt, alternating sign with depth, so the
      // stack of frames spirals slightly instead of reading as one clean tunnel.
      float rot = (h.z - 0.5) * 0.5;
      float cr = cos(rot), sr = sin(rot);
      mat2 rm = mat2(cr, -sr, sr, cr);
      vec2 hp = rm * (hit - offset);            // rotated/offset hit for this shelf

      // Perspective scale of THIS plane: near ≈ large, far → tiny. The frames are a
      // fixed world size; the visible field shrinks with depth, so a fixed half-size
      // reads as nested rectangles diving to the centre.
      float persp = gap / dz;                   // ~1 near, →0 far
      float depthFade = exp(-dz * 0.085);       // long luminous tail toward the core

      // Draw a SMALL STACK of concentric frames on this plane (frames within frames).
      // Each ring k has its own jittered half-size + aspect so the rectangles never
      // line up perfectly — the chaotic recursive bookcase, not a clean grid.
      float planeLight = 0.0;
      vec3  planeTint = vec3(0.0);
      for (int k = 0; k < 4; k++){
        float fk = float(k);
        float rk = hash11(cellId * 7.3 + fk * 13.1 + 2.0);
        float ak = hash11(cellId * 5.1 + fk * 9.7 + 1.0);
        // Half-size grows per ring (nesting outward) with strong per-ring jitter so
        // the aperture wobbles shelf to shelf.
        vec2 halfSize = vec2(0.26 + fk * 0.28 + rk * 0.22,
                             0.18 + fk * 0.20 + ak * 0.18);
        float radius = 0.04 + rk * 0.08;
        float d = frameEdge(hp, halfSize, radius);

        // Thin bright band on the frame edge. Kept NARROW so each frame reads as a
        // fine glowing line against the dark void (not a fat fill that washes the
        // frame). A touch wider on the near planes, but capped low.
        float bandW = mix(0.006, 0.022, clamp(persp, 0.0, 1.0));
        float edge = smoothstep(bandW, 0.0, abs(d));
        // Squaring sharpens the line core and crushes the soft skirt → crisp streaks
        // on a dark background instead of a milky glow.
        edge = edge * edge;
        float bk = 0.4 + 0.7 * rk;              // per-ring brightness (wide spread)
        planeLight += edge * bk;
        // Tone with DEPTH-COLOUR separation, like the film: the near frames read cooler
        // graphite/tarnished, deep frames warm to gold toward the luminous core. dz
        // drives the warm push so the corridor gradients in colour as it recedes.
        float warm = 1.0 - depthFade;           // 0 near → 1 deep
        float tone = clamp(0.20 + bk * 0.30 + warm * 0.55, 0.0, 1.0);
        vec3 ringCol = palette(tone);
        // a faint cool cast on the nearest frames so they sit back as graphite
        ringCol = mix(ringCol * vec3(0.86, 0.9, 1.02), ringCol, smoothstep(0.0, 0.5, warm));
        planeTint += ringCol * edge * bk;
      }

      float bright = 0.45 + 0.55 * h2;          // per-shelf brightness variation
      col += planeTint * depthFade * bright * 3.2;
      fog += depthFade * 0.02 * planeLight;
    }

    // ---- radial streaks (computed ONCE, not per plane) ----------------------
    // The bookshelf edges read as long radial streaks toward the vanishing point.
    // This is an ANGULAR comb in screen space — sharp bright spokes whose density and
    // jitter come from a hash of the angle — multiplied by a radial profile that is 0
    // at the bright core and fades out toward the frame edges. It rides ON TOP of the
    // dark void, so it draws lines, not a fill.
    {
      vec2 sp = uv - look * 0.55;               // streaks emanate from the vanishing pt
      float sang = atan(sp.y, sp.x);
      float srad = length(sp);
      // A jittered angular comb: many fine spokes, each with a random brightness, so
      // the streaks are uneven and cinematic rather than a perfect starburst.
      float spokes = sang * 18.0;
      float sj = hash11(floor(spokes) + 3.0);
      // Sharp spoke profile: distance to the nearest spoke centre, raised to a high
      // power so each spoke is a thin bright line.
      float cellA = fract(spokes);
      float spoke = smoothstep(0.5, 0.0, abs(cellA - 0.5));
      spoke = pow(spoke, 6.0) * (0.35 + 0.65 * sj);
      // Radial profile: fade in just outside the core, fall off toward the edges, with
      // a slow time shimmer so the streaks breathe. A per-spoke length jitter makes
      // some streaks reach far and others stop short → uneven, cinematic, not a clean
      // starburst.
      float reach = 1.2 + 1.4 * sj;             // per-spoke falloff rate
      float radProf = smoothstep(0.04, 0.20, srad) * exp(-srad * reach);
      float shimmer = 0.6 + 0.4 * sin(sang * 7.0 + uTime * 0.5 + sj * 6.28);
      float streaks = uStreak * spoke * radProf * shimmer;
      col += mix(palette(0.5), vec3(1.0, 0.9, 0.74), 0.35) * streaks * 0.85;
    }

    // ---- luminous core ------------------------------------------------------
    // The vanishing point: a hot bloom at the centre that the corridor dives into.
    // Centre slides with the look so it stays "down the tunnel" the cursor points at.
    // Kept TIGHT so it's a luminous point, not a washed cream fill.
    vec2 coreP = uv - look * 0.55;
    float cd = length(coreP);
    float coreGlow = uCore * 0.8 / (1.0 + cd * cd * 26.0);    // soft warm halo
    float coreHot  = uCore * 1.7 / (1.0 + cd * cd * 150.0);   // bright (not clipped) centre
    vec3 coreCol = mix(vec3(0.98, 0.82, 0.5), vec3(1.0, 0.96, 0.88), smoothstep(0.0, 0.7, coreHot));
    col += coreCol * (coreGlow + coreHot);

    // Volumetric haze fill: a warm-graphite wash CONCENTRATED at the vanishing point
    // (a glow halo around the core), NOT a full-frame fill — the gaps between frames
    // must stay dark so the bright edges read against a deep void.
    float haze = fog * 0.6 * exp(-cd * 3.2);
    col += palette(0.34 + 0.3 * exp(-cd * 2.4)) * haze;

    // A whisper of base ambient right at the core only (deep-room glow), so the centre
    // doesn't fall to pure black behind the hot point but the frame stays a dark void.
    col += palette(0.30) * 0.04 * exp(-cd * 3.0);

    // Radial darkening toward the frame edges so the corridor sits in a deep pool and
    // the void between frames stays genuinely dark (no milky floor). The CSS vignette
    // adds the rest.
    float edgeVig = smoothstep(1.9, 0.25, length(uv));
    col *= mix(0.12, 1.0, edgeVig);

    // Master dim + a filmic roll-off. The roll-off tames the hot core to a warm white
    // (never a flat clipped disc) while leaving the dim browns/graphite of the frames
    // rich. No exposure-restore multiply (that was washing the whole frame to cream).
    col *= uDim;
    col = col / (col + vec3(0.9));              // Reinhard-ish highlight roll-off
    col = pow(col, vec3(0.9));                  // slight gamma lift for richer midtones

    gl_FragColor = vec4(col, 1.0);
  }
`;
