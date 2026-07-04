// Sun / red-giant mesh-rig shaders (photosphere, glow, corona, star dome, loops).
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.

export const SUN_NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<6;i++){ v += a*snoise(p); p*=2.02; a*=0.5; }
  return v;
}
`;

// --- photosphere mesh (high-contrast mottled gold surface) ---

export const sunSurfaceVert = /* glsl */ `
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vObj = normalize(position);
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

// Number of CONCURRENT click eruptions the photosphere can host. The render loop
// keeps a JS-side pool of the same size and copies it into uErupt/uEruptAge each
// frame; rapid clicks stack into separate slots so several plumes + ripples can
// play at once (a single restart-on-click would clobber an in-flight blast).
export const SUN_ERUPT_SLOTS = 4;

export const sunSurfaceFrag = SUN_NOISE_GLSL + /* glsl */ `
  #define N_ERUPT 4
  // ERUPT_LIFE: total lifetime of one eruption in seconds. The plume + ripple both
  // fade out by here; the render loop frees the slot (intensity→0) at the same age.
  #define ERUPT_LIFE 2.4
  uniform float uTime;
  // uMeshFade ∈ [0,1]: the yellow-mesh CROSS-DISSOLVE opacity. 1 = fully present (the
  // normal opaque star); <1 ONLY during the tight yellow↔red swap band, where the mesh
  // fades IN over the dissolving gold cloud. Multiplies BOTH the emitted colour and the
  // output alpha so the opaque photosphere reads as a partially-transparent body that
  // dissolves cleanly over black (no hard on/off pop). Default 1 → no-op everywhere else.
  uniform float uMeshFade;
  // uRed ∈ [0,1]: 0 = yellow star (gold, bright), 1 = red giant (deep red, dim).
  // Drives the photosphere from a hot gold palette toward a cool, matte, deep-red
  // one and pulls overall brightness down — the COOLING half of the inflation.
  uniform float uRed;
  // uBlue ∈ [0,1]: 0 = settled yellow/gold star, 1 = HOT young blue-white star.
  // "Mass induces heat": while the star is still forming/small it is blue-white
  // hot; as it grows to full mass it cools to yellow. Driven by (1 - starFormed).
  uniform float uBlue;
  // uSeedGlow ≥ 1: NEWBORN-SEED emission lift. A freshly-forming star is rendered at
  // ≈1.2% scale (a pinpoint), which without help reads as a dim dot. The render loop
  // drives this >1 only while the seed is tiny (strongest at birth, easing to 1 as it
  // grows) so the surface glows like an intense hot core. 1.0 = no-op (every other star).
  uniform float uSeedGlow;
  // uDetail ∈ [0,1]: SURFACE-DETAIL ramp. 1 = the full granulated/mottled photosphere
  // (the settled yellow star and everywhere else — no-op). 0 = a CLEAN, evenly-lit glowing
  // sphere: all high-frequency cell/mottle/sunspot/network texture is suppressed and the
  // surface is just a smooth, limb-darkened radial falloff (bright core → soft limb). The
  // render loop drives it from starFormed (0 at the tiny SEED, full by ~half-grown) so the
  // NEWBORN star reads as a clean blue dot-sphere that GAINS its yellow-star texture as it
  // grows. The colour (clean vs textured) is cross-faded by uDetail at the very end of the
  // surface ramp; uBlue still tints the whole thing blue at the seed → a clean BLUE dot.
  uniform float uDetail;
  // --- CLICK ERUPTIONS (geyser plume + travelling surface ripple) ------------
  // uErupt[i].xyz = OBJECT-SPACE unit direction of eruption i's centre on the
  //   sphere (same space as vObj, so a chord distance to vObj is meaningful).
  // uErupt[i].w   = intensity 0..1 (click-hold scaled: tap≈0.25 → ~1.5s hold = 1).
  //   w == 0 means the slot is idle and contributes nothing.
  // uEruptAge[i]  = seconds since the eruption fired; the ripple radius grows with
  //   it and the whole event fades out by ERUPT_LIFE. The render loop advances the
  //   ages and zeroes intensities once spent, so the shader just reads them.
  uniform vec4 uErupt[N_ERUPT];
  uniform float uEruptAge[N_ERUPT];
  // uWaveFlow: master strength of the click ripple's DOMAIN WARP of the photosphere fBm —
  // i.e. how hard the granulation cells themselves stream with the travelling wavefront.
  // 0 = the surface texture is frozen (no-op); 1 = the tuned default. Lives entirely in
  // object space (vObj), the SAME space as the noise, so there is no atlas / face / seam.
  uniform float uWaveFlow;
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vec3 p = vObj * 2.4;
    float t = uTime * 0.05;

    // === CLICK RIPPLE — 3D OBJECT-SPACE DOMAIN WARP ==========================
    // A click deposits an expanding, decaying ring centred on uErupt[i].xyz. We build the
    // ring ENTIRELY in object space (the angle from this fragment to the click centre), then
    // push the fBm sample domain ALONG THE SURFACE so the actual granulation cells bunch up
    // on the leading edge of the wavefront and stretch out behind it. Because every quantity
    // here is a function of vObj (the same coordinate the noise uses), the ripple is a clean
    // circle on the sphere with NO 2D atlas, NO cube faces, and therefore NO seam/"square".
    // Slots accumulate, so two clicks interfere for free. waveDisp is added into BOTH the
    // base granulation sample and the displaced network/extra octaves below.
    vec3  waveDisp = vec3(0.0);   // domain push (object space) — moves the cells
    float waveCrest = 0.0;        // unsigned wavefront envelope → subtle additive light
    if (uWaveFlow > 0.0) {
      for (int i = 0; i < N_ERUPT; i++){
        float inten = uErupt[i].w;
        if (inten <= 0.0) continue;                       // idle slot
        vec3  ed  = normalize(uErupt[i].xyz);             // click centre (object space)
        float age = uEruptAge[i];
        float life = clamp(age / ERUPT_LIFE, 0.0, 1.0);
        // geodesic angle from this fragment to the click centre (0 at centre → π at antipode)
        float geo = acos(clamp(dot(normalize(vObj), ed), -1.0, 1.0));
        // the wavefront marches outward in ANGLE with age; reach + speed scale with intensity.
        // The lead crest sits at 'radius'; everything from the centre out to it is the part of
        // the surface the wave has already swept through (where the trailing ripples live).
        float reach  = 1.4 + 1.4 * inten;                 // max angular travel (radians)
        float radius = reach * life;                      // current lead-crest angle
        // CIRCULAR TRAVELLING WAVE: instead of one fat bump, this is a proper expanding ripple
        // train. 'phase' measures how far BEHIND the lead crest this fragment is (>0 inside the
        // ring, <0 ahead of it / untouched). A few damped sine oscillations packed into a
        // gaussian envelope give the classic "drop in water" look: a bright lead ring followed
        // by 1-2 fading concentric rings, all travelling outward together as 'radius' grows.
        float WAVES   = 2.6;                              // number of concentric rings in the train
        float WIDTH   = 0.42 + 0.20 * inten;              // radial extent of the whole ripple train
        float phase   = (radius - geo) / WIDTH;           // 0 at the lead crest, grows back toward centre
        // envelope: a smooth gaussian decay behind the lead crest, FEATHERED to zero just ahead
        // of it (no hard edge) so the front of the ripple is soft. Strongest at the front, dying
        // toward the centre as the energy radiates outward.
        float ahead   = smoothstep(-0.25, 0.05, phase);   // 0 ahead of the front → 1 just behind it
        float env     = exp(-phase * phase * 1.6) * ahead;
        // the oscillation itself — concentric rings. cos so the lead crest (phase≈0) is a peak.
        float osc     = cos(phase * WAVES * 3.14159);
        // SIGNED radial displacement: the surface is shoved along the travel direction in a
        // wave pattern → cells bunch on each ring crest and stretch in each trough.
        float disp    = osc * env;
        // global fade: dies over the eruption life AND as the ring nears its travel limit,
        // so it never pops off at the edge.
        float fade    = (1.0 - life) * (1.0 - smoothstep(reach*0.78, reach, geo));
        // tangent direction on the sphere pointing AWAY from the click centre (the direction
        // the wave travels) — project ed off the surface normal and normalise.
        vec3  nrm  = normalize(vObj);
        vec3  tang = ed - nrm * dot(ed, nrm);
        tang = length(tang) > 1e-4 ? -normalize(tang) : vec3(0.0);  // points outward from centre
        // push the fBm domain along the surface tangent by the signed wave (object space).
        waveDisp += tang * (disp * fade * inten);
        // unsigned envelope on the LEAD crest only → the subtle light ring tracks the front.
        float lead = exp(-phase * phase * 5.0) * ahead;
        waveCrest = max(waveCrest, lead * fade * inten);
      }
      waveDisp *= 0.5 * uWaveFlow;   // master gain — small: a little domain push moves cells a lot
    }

    vec3 q;
    q.x = fbm(p + vec3(0.0,0.0,t));
    q.y = fbm(p + vec3(5.2,1.3,2.7) + t);
    q.z = fbm(p + vec3(1.7,9.2,3.4) - t);
    float n = fbm(p + 3.2*q + waveDisp + t*0.5);
    float m = clamp(n*0.5+0.5, 0.0, 1.0);

    // gold (yellow-star) photosphere ramp — a blazing 5772K sun: hot amber troughs,
    // bright YELLOW-WHITE crests (the reference reads gold-yellow, not orange). The
    // green channel is lifted across the ramp to pull it off orange toward yellow, and
    // the stops sit well above the old dim-gold values so the surface is luminous
    // plasma, not a dusky ember.
    // PALETTE (yellow-star spec): pale gold → soft cream. Crest pushed toward a soft
    // CREAM (g4 blue 0.82 → 0.90) so the brightest plasma reads cream, not greenish.
    // ITEM 4: shift the whole gold ramp toward PALE GOLD (#E7B84D body / #FFE7A6 core),
    // away from the saturated ORANGE it read as once the white wash came down. The green
    // channel is lifted on the body/mid stops (g1/g2) so the surface reads gold-yellow,
    // not amber-orange; the crest (g4) is a pale gold with solar material inside, not the
    // old near-white cream that read as a glowing UI orb. Lower stops keep warmth for depth.
    vec3 g0 = vec3(0.58,0.32,0.08);   // warm gold shadow (greener than the old orange)
    vec3 g1 = vec3(0.92,0.66,0.22);   // gold trough (G/R ~0.72 — clearly gold, not orange)
    vec3 g2 = vec3(1.08,0.88,0.40);   // pale gold body (#E7B84D family, G/R ~0.81)
    vec3 g3 = vec3(1.24,1.08,0.60);   // bright pale gold
    vec3 g4 = vec3(1.34,1.22,0.82);   // pale-gold crest (#FFE7A6 family; was near-white cream)
    // red-giant ramp: BURNT-EMBER mass — a DARK, HEAVY, molten star, NOT a clean sodium-
    // orange sun. PALETTE (red-giant ember spec): ~70% burnt red-brown shadow mass, ~20%
    // sodium-orange body, ~10% rare hot accents. Anchors #220803→#451006→#7A240B→#B43A10→
    // #E76418→#FF9E2C. The body stops (r1,r2) are pulled DOWN into burnt red-brown so the
    // average surface is dark; the sodium/hot stops (r3,r4) carry the few bright cells only.
    // Mirrors disk.glsl.ts' cloud red-giant ramp so the mesh and the particle cloud agree.
    // MOLTEN-RED PASS (GREEN-DOMINANT): the SHADOW + MIDTONE stops are pushed toward
    // saturated ember red — red held ~steady, GREEN (and blue) pulled DOWN — so the body
    // mass reads as deep molten red, not burnt amber. A hue/saturation move, NOT a
    // brightening: R/G climbs sharply in every shadow+mid stop while LUMINANCE holds flat
    // or DROPS (body/ember stops read slightly DARKER, never brighter). The rim (r4) and
    // the pale-gold crest are UNTOUCHED.
    vec3 r0 = vec3(0.109,0.016,0.008); // #1D0402 ember floor — deep red (was #220803); shadows pulled −5% per grade
    vec3 r1 = vec3(0.268,0.042,0.017); // #480B05 deep ember shadow mass (was #451006); shadows pulled −5% per grade
    vec3 r2 = vec3(0.470,0.100,0.028); // #781A07 molten red body (DOMINANT; was #7A240B)
    vec3 r3 = vec3(0.690,0.166,0.046); // #B02A0C molten ember (body→rim; greener-down, was #B43A10)
    vec3 r4 = vec3(0.906,0.392,0.094); // #E76418 sodium orange crest (hottest cells) — UNCHANGED rim
    // cross-fade each stop from gold → red as uRed rises (linear recolour)
    vec3 c0 = mix(g0, r0, uRed);
    vec3 c1 = mix(g1, r1, uRed);
    vec3 c2 = mix(g2, r2, uRed);
    vec3 c3 = mix(g3, r3, uRed);
    vec3 c4 = mix(g4, r4, uRed);

    vec3 col = c0;
    col = mix(col, c1, smoothstep(0.14,0.40,m));
    col = mix(col, c2, smoothstep(0.34,0.58,m));
    col = mix(col, c3, smoothstep(0.55,0.78,m));
    col = mix(col, c4, smoothstep(0.80,0.96,m));

    // chromospheric network: the dark lava filaments between bright cells. Deepened
    // (mask 0.55 → 0.80, darker troughs) so the surface reads as the reference's
    // high-contrast molten texture, not a smooth gold wash. The wave domain-warp (waveDisp,
    // scaled to this octave's frequency) rides along so the dark lanes stream with the
    // wavefront too — the network moving is the most legible "the surface ripples" cue.
    float ch = fbm(p*1.4 + 2.0*q.yzx + waveDisp*1.4 + t*0.3);
    float chMask = smoothstep(0.16, -0.05, ch);
    // The YELLOW-star lane weight is pulled way down (0.88 -> 0.42): at full weight the
    // low-frequency lanes painted broad grey-brown continents across the disc that read
    // as a mud-camo pattern, not intergranular veins. At 0.42 they are warm shadow veins
    // under the granulation. The RED-giant lane (deep ember red) keeps its full 0.88
    // weight (gated by uRed) so the approved ember surface is untouched.
    col = mix(col, mix(vec3(0.13,0.07,0.012), vec3(0.044,0.007,0.003), uRed), chMask*mix(0.42, 0.88, uRed)); // red-giant lane −5% deeper per grade

    // sunspots. On the YELLOW star the weight drops 0.72 -> 0.38 and the mask tightens
    // (0.34 -> 0.10 onset) so pores are a few small discrete dark points, not the broad
    // near-black patches that fed the mud-camo read. The RED GIANT keeps the original
    // broad deep-ember pores (both mask and weight lerp back up with uRed).
    float spot = smoothstep(mix(0.10, 0.34, uRed), -0.20, ch) * smoothstep(0.48,0.2,m);
    col = mix(col, mix(vec3(0.04,0.006,0.0), vec3(0.044,0.004,0.0), uRed), spot*mix(0.38, 0.72, uRed)); // red-giant pore −5% deeper per grade

    // granulation: crisp distinct mottling (lava-cell texture of the reference). Floor
    // raised (0.72 → 0.95) so the troughs stay LUMINOUS — the reference disc is a bright
    // glowing surface, not a dark one with bright speckles. Keeps a strong swing for the
    // cell contrast, but the average is now well above 1.0 so the whole disc reads bright.
    // the granulation octaves ride the SAME wave domain-warp (scaled to each frequency) so
    // the bright cells bunch/stretch with the front in lock-step with the network above.
    float gran = fbm(p*7.0 + waveDisp*7.0 + t*1.0);
    float gran2 = fbm(p*15.0 + waveDisp*15.0 - t*0.6);
    // gran3: a FINER third octave (p*28, ~2x gran2) for the dense fine-scale stippling
    // the reference photosphere shows between the big cells — it busies up the surface
    // so it reads richly mottled rather than smoothly speckled. Small weight (0.07) and
    // the floor is dropped 0.95 → 0.90 to fund the extra ~+0.035 mean it adds, so the
    // average brightness is unchanged (the gold look / network / spots / rim are untouched).
    float gran3 = fbm(p*28.0 + waveDisp*28.0 + t*0.4);
    col *= 0.90 + 0.50*(gran*0.5+0.5) + 0.10*(gran2*0.5+0.5) + 0.07*(gran3*0.5+0.5);

    // bright active-region speckle fades out toward the (quiet) red giant. On the
    // yellow star these are the white-hot flare patches of the reference, so they
    // run hot and bright; they cool to a dim glow as the surface reddens (uRed→1).
    // Threshold tightened again (0.90 → 0.94): at 0.90 the pale patches merged into
    // beige smudges that read as part of the camo mottle — at 0.94 they are rare,
    // discrete hot points.
    float ar = smoothstep(0.94, 0.995, m) * (1.0 - 0.85*uRed);
    // red-giant active regions glow sodium orange (#E76418-ish) — the rare hot patches,
    // confined to the brightest cells by the tight 0.90 threshold above.
    col += ar * mix(vec3(1.15,0.92,0.46), vec3(0.70,0.30,0.07), uRed);

    vec3 vd = normalize(-vViewPos);
    float fres = 1.0 - max(dot(vd, vViewN), 0.0);
    // The reference has a THICK bright yellow-white photosphere rim wrapping the disc.
    // Two terms: a wide soft brightening band (pow 1.8) that lifts the outer third of
    // the disc toward bright gold, and a tight hot edge (pow 5.0) for the crisp white-
    // gold rim line right at the silhouette. Together they read as a luminous wrapping
    // rim, not a hard dark edge, while the disc centre keeps its lava detail.
    float limbWide = pow(fres, 1.8);
    float limbEdge = pow(fres, 5.0);
    // red-giant limb glows SODIUM ORANGE (#E76418) — a hot molten edge, not a creamy-gold
    // wash. The wide-band weight is cut on the red side (0.5→0.38) so the rim is an EDGE,
    // not a bright band lifting the outer third of the body toward gold; the tight edge
    // reaches the hot-edge stop (#FF9E2C) at the silhouette only.
    vec3 limbCol = mix(vec3(1.30,1.10,0.62), vec3(0.906,0.392,0.094), uRed);
    // Yellow-side wide-band weight cut 0.55 -> 0.30: the strong band lifted the whole
    // outer third to a uniform gold ring that (with the corona) read as a flat egg-yolk
    // halo. At 0.30 the limb keeps a gentle luminous wrap while the granulation stays
    // legible right to the edge; the crisp hot edge line below is untouched.
    col = mix(col, limbCol, limbWide*mix(0.30, 0.38, uRed));
    col += limbEdge * mix(vec3(1.05,0.78,0.34), vec3(0.45,0.18,0.03), uRed);

    // overall luminance: bright gold sun → dim matte red giant (light leads size).
    // ITEM 4: the yellow-star multiplier is pulled DOWN ~12% (1.85 -> 1.62) to REDUCE
    // the centre exposure — the pure-white blown core had no solar material inside, so
    // dropping it lands the brightness on the textured disc (granulation/mottling reads)
    // rather than a glowing UI orb, while the star stays a bright pale-gold sun. The red
    // giant end (×0.5) is UNCHANGED so the approved ember surface is untouched.
    // GRADE: yellow core exposure dialled DOWN a further −10% (1.62 → 1.458); red end held.
    col *= mix(1.458, 0.5, uRed);

    // === SEED KEEPS THE FULL PHOTOSPHERE TEXTURE (no clean-disc flattening) ===
    // The newborn seed must read as the REAL yellow-sun surface — granulation, mottle,
    // network — just TINTED BLUE (the blue ramp below is built from the same surface field
    // 'm'), NOT a flat solid disc. An earlier iteration cross-faded the textured colour to a
    // smooth limb-darkened sphere via uDetail at the seed; that made the dot read as a solid
    // blue blob. Removed: 'col' keeps its full texture at every size, and only uBlue
    // recolours it (textured-blue seed -> textured-gold sun). uDetail is now inert in the
    // shader (left declared so the JS wiring need not change). 'fres' (centre->limb) is still
    // used by the textured limb darkening above, so nothing else here depends on it.

    // HOT YOUNG STAR (uBlue): while still forming/small the star is hot BLUE (mass->heat).
    // Recolour the whole photosphere onto a blue ramp keyed by the same surface field m,
    // and lerp gold->blue by uBlue. Cools to the gold ramp above as it grows (uBlue->0).
    // No-op for the settled yellow sun.
    //
    // COLD-WHITE RETUNE: the seed is rendered at ≈0.4% scale and its emission is
    // lifted HARD by uSeedGlow (col *= uSeedGlow, up to ≈3.2× a few lines below). The old
    // saturated-blue ramp held R/G well below B at every stop, which read as a distinctly
    // blue orb. Fix: lift R and G much closer to B on the BRIGHT stops so the body reads as
    // a cold white with only a faint blue undertone. Keep the deep/umbral stops cooler so
    // surface texture (granulation/mottle, built from field 'm') still has depth and the dot
    // does not flatten to a solid disc. b4 stays just shy of (1,1,1) with B marginally
    // highest so after the seed-glow lift the core reads cold white, not neutral white.
    vec3 b0 = vec3(0.10, 0.16, 0.32);  // cool deep blue-grey (umbral) — keeps depth
    vec3 b1 = vec3(0.34, 0.46, 0.72);  // cool steel-blue mid
    vec3 b2 = vec3(0.62, 0.74, 0.94);  // pale cold blue body
    vec3 b3 = vec3(0.82, 0.90, 1.00);  // near-white, faint cool cast
    vec3 b4 = vec3(0.94, 0.97, 1.00);  // cold white core (B just nudges past R/G)
    vec3 bcol = b0;
    bcol = mix(bcol, b1, smoothstep(0.14,0.40,m));
    bcol = mix(bcol, b2, smoothstep(0.34,0.58,m));
    bcol = mix(bcol, b3, smoothstep(0.55,0.78,m));
    bcol = mix(bcol, b4, smoothstep(0.80,0.96,m));
    bcol += limbWide * vec3(0.40, 0.52, 0.74);   // cool-white limb glow (was 0.20,0.40,0.78)
    bcol *= 1.25;                             // young star is luminous
    // bcol is the FULL granulated photosphere on the blue palette (built from 'm'), so the
    // seed shows the real yellow-sun surface texture tinted blue — exactly what we want, not
    // a flat disc. uBlue lerps the whole textured surface gold→blue (blue seed → gold sun).
    col = mix(col, bcol, clamp(uBlue, 0.0, 1.0));

    // === CLICK ERUPTIONS ====================================================
    // The travelling RIPPLE is no longer an additive bright ring (that read as a glowing
    // decal). It is now the 3D object-space DOMAIN WARP at the top of main() — the actual
    // granulation cells stream with the wavefront, so the SURFACE TEXTURE reacts. Here we
    // only add (a) a VERY subtle hot crest riding that same wavefront (waveCrest, so the
    // moving front catches a little light), and (b) the off-limb geyser PLUME, which is a
    // separate prominence effect kept as-is.
    vec3 eruptHot = mix(vec3(1.30,1.02,0.55), vec3(1.00,0.46,0.10), uRed); // gold→sodium-orange ember (#E76418, hottest active-region accent)
    // subtle light on the moving wavefront (the warp is the star of the show; this is salt).
    col += eruptHot * waveCrest * 0.18;
    for (int i = 0; i < N_ERUPT; i++){
      float inten = uErupt[i].w;
      if (inten <= 0.0) continue;                 // idle slot
      vec3  ed  = normalize(uErupt[i].xyz);       // eruption centre direction (object space)
      float age = uEruptAge[i];
      float life = clamp(age / ERUPT_LIFE, 0.0, 1.0);
      // chord distance on the unit sphere from this fragment to the eruption centre.
      float cd  = length(vObj - ed);

      // --- geyser plume (bright spray erupting off the surface at the click point) ---
      // An additive glow tightly centred on the eruption direction (gaussian on the chord
      // distance) that grows TALLER/brighter with intensity. It rises then falls over the
      // life (sin envelope) like a fountain, and is biased toward the limb (limbWide) so
      // it reads as a prominence arcing off the silhouette rather than a flat hot patch.
      float spread = 0.16 + 0.12 * inten;         // angular footprint of the plume base
      float core   = exp(-pow(cd / spread, 2.0)); // concentration at the click point
      float rise   = sin(life * 3.14159);         // 0→1→0: erupt, peak, settle
      float height = (0.6 + 1.6 * inten) * rise;  // taller plume with longer holds
      // the plume is hottest at its root and biased to the limb; limbWide lifts the part
      // grazing the silhouette so the spray appears to leave the surface toward the edge.
      float plume  = core * height * (0.45 + 0.85 * limbWide);
      col += eruptHot * plume * 1.4;
    }
    // NEWBORN-SEED GLOW: lift the photosphere emission while the star is a tiny seed so
    // the pinpoint reads as an intense hot core (not a dim dot). Applied to colour only
    // (not alpha) so the body stays the same SIZE/shape — it just burns brighter. 1.0 = no-op.
    //
    // BLUE-PRESERVING TEMPER: uSeedGlow arrives as 1 + extra (extra up to ≈2.2 at the seed).
    // A full ≈3.2× multiply on the saturated-blue core would push red+green past 1.0 and
    // clip the core toward WHITE again, undoing the blue retune above. So scale only the
    // EXTRA lift (never the base 1.0) DOWN by uBlue: glow = 1 + (uSeedGlow-1)*(1 - 0.5*uBlue).
    // At full blue (uBlue=1) the extra lift is HALVED so the newborn glows as a luminous hot
    // BLUE point instead of blowing white; as it warms to gold (uBlue->0) the full lift
    // returns. The blue ramp's own ×1.25 keeps the seed bright on its own, so a softer glow
    // still reads as an intense core. No-op when uSeedGlow==1 (every settled star).
    float seedGlowEff = 1.0 + (uSeedGlow - 1.0) * (1.0 - 0.5 * clamp(uBlue, 0.0, 1.0));
    col *= seedGlowEff;
    // uMeshFade cross-dissolves the (normally opaque) photosphere in over the gold
    // cloud at the yellow↔red swap: premultiplied colour × alpha so it dissolves
    // cleanly over black. 1.0 everywhere outside the swap band → byte-identical output.
    gl_FragColor = vec4(col * uMeshFade, uMeshFade);
  }`;

// --- inner chromosphere glow (BackSide additive shell) ---

export const sunGlowVert = /* glsl */ `
  varying vec3 vN; varying vec3 vP;
  void main(){ vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
    gl_Position=projectionMatrix*mv; }`;

export const sunGlowFrag = /* glsl */ `
  uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
  // uFade ∈ [0,1]: yellow↔red swap cross-dissolve presence (1 = full glow; <1 ONLY across
  // the swap band, so the chromosphere rim fades in WITH the photosphere). Additive layer,
  // so a brightness scale IS the fade. Default 1 → no-op outside the swap. Mirrors the
  // loop/corona uFade lever so the whole atmosphere dissolves together.
  uniform float uFade;
  void main(){ vec3 vd=normalize(-vP);
    // Falloff steepened 2.0 -> 2.8 and lift pulled 1.25 -> 1.0: the wide soft shell was
    // one of three overlapping rings (shell + limb band + corona rim) that summed into
    // the flat egg-yolk halo. Tighter + dimmer, it reads as a thin chromosphere breath
    // hugging the silhouette and lets the corona own the outer glow.
    float i=pow(1.0-max(dot(vd,vN),0.0), 2.8);
    gl_FragColor=vec4(uColor*i*1.0*uFade, 1.0); }`;

// --- soft corona haze (camera-facing additive billboard) ---

export const sunCoronaVert = /* glsl */ `
  varying vec2 vUv; void main(){ vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export const sunCoronaFrag = SUN_NOISE_GLSL + /* glsl */ `
  uniform float uTime; uniform float uDiskFrac; varying vec2 vUv;
  // uRed ∈ [0,1]: redden + fade the corona as the yellow star inflates into the
  // (magnetically quiet, coronae-poor) red giant. uDiskFrac is updated per frame
  // so the halo tracks the growing disc.
  uniform float uRed;
  // uFade ∈ [0,1]: overall corona presence. Driven to 0 WHILE the star is growing
  // (the corona/atmosphere only blooms AFTER the star is fully sized) → 1 once full.
  uniform float uFade;
  void main(){
    vec2 pp = (vUv-0.5)*2.0;
    float r = length(pp);
    float a = atan(pp.y, pp.x);
    float df = uDiskFrac;
    // TWO-SCALE falloff instead of the old single exp(-x*11): a tight hot rim right at
    // the photosphere plus a long faint breath that asymptotes into the black. The old
    // single mid-rate falloff held near-constant brightness for a fixed width and then
    // dropped — a uniform egg-yolk RING around the disc (the "flat halo"). Two scales
    // give the glow a luminous core and a genuinely gradual tail, so there is no
    // readable ring edge anywhere.
    float x = max(r-df,0.0);
    float haloRim = exp(-x*20.0);
    float haloBreath = exp(-x*3.2);
    float st = fbm(vec3(cos(a)*0.8, sin(a)*0.8, uTime*0.02));
    st = st*0.5+0.5;
    float streamer = pow(st,3.5)*exp(-x*4.5);
    float corona = haloRim*0.38 + haloBreath*0.13 + streamer*0.18;
    corona *= smoothstep(df-0.02, df+0.04, r);
    corona *= smoothstep(1.0, df+0.05, r);
    vec3 c = mix(vec3(1.20,0.78,0.30), vec3(1.30,1.02,0.52), st*0.7);
    // PALETTE (yellow-star spec): "dark indigo surroundings". On the YELLOW STAR
    // (uRed≈0) the INNER corona stays warm gold near the photosphere, but its OUTER
    // fade is tinted toward a cool INDIGO so the surround reads dark indigo (paired
    // with the indigo backdrop stars), while the room itself stays black. outerFade is
    // 0 at the rim → 1 at the outer reach; the indigo mix is gated by (1-uRed) so the
    // red giant's haze is untouched.
    float outerFade = smoothstep(df+0.02, df+0.30, r);
    // Deep dim indigo. Tint strength 0.58 -> 0.38: at 0.58 the halo's outer tail went
    // frankly PURPLE and (with the wash below) stamped a lavender disc around the star.
    vec3 indigo = vec3(0.24, 0.24, 0.50);
    c = mix(c, indigo, outerFade * 0.38 * (1.0 - uRed));
    c = mix(c, vec3(0.92,0.40,0.07), uRed);          // gold/indigo corona → dim sodium-orange haze
    // base pulled DOWN (1.05 → 0.55) so the tight rim glow doesn't add up into a broad
    // bloom-feeding wash; the red giant still dims further to a faint haze (×0.35).
    vec3 outCol = c*corona*0.55*mix(1.0, 0.35, uRed)*uFade;

    // --- DARK INDIGO AMBIENT WASH (yellow star only) -------------------------
    // The tight gold rim above decays to ~0 within a few hundredths of r, so the
    // region around the star stays BLACK and the indigo never reads — the backdrop
    // dome is only sparse star points, so the SPACE between them is pure black. Add
    // a separate broad, faint indigo FILL that genuinely lights the surround: a soft
    // bell peaking just outside the rim and fading back to black well before the
    // billboard edge, so we get a visible dark-indigo halo around the pale-gold star
    // while the extreme outer room stays true black. DIM on purpose ("dark indigo",
    // present but not blown out). Gated by (1-uRed) so the red giant's surround is
    // untouched, and by uFade so it blooms in with the rest of the atmosphere.
    float washIn  = smoothstep(df - 0.01, df + 0.14, r);          // ramp up just past the rim
    // The wash used to die at df+0.62 — a bell with a READABLE outer edge, i.e. a flat
    // indigo disc stamped around the star. Stretch the fade across the whole remaining
    // billboard (to r≈0.95) so it dissolves imperceptibly into the room's black.
    float washOut = 1.0 - smoothstep(df + 0.26, 0.95, r);
    float wash = washIn * washOut;
    // gentle azimuthal variation so it isn't a flat disc; keeps it reading as haze.
    float washMod = 0.80 + 0.20 * st;
    // Quieted right down (0.28 -> 0.07): on screen even 0.17 still read as a flat
    // lavender DISC stamped behind the star — the "flat halo" audit finding. At 0.07
    // spread across the wide fade it is a whisper of indigo in the black that pairs
    // with the indigo backdrop stars without ever reading as a shape.
    vec3 indigoWash = vec3(0.10, 0.10, 0.30);                     // deeper, dimmer indigo fill
    outCol += indigoWash * wash * washMod * 0.07 * (1.0 - uRed) * uFade;

    gl_FragColor = vec4(outCol, 1.0);
  }`;

// --- dedicated yellow-stage star backdrop (plain, depth-tested) ---
// Unlike the lensed starfield (which warps around the dead black hole and draws
// with depthTest OFF so it bleeds through the opaque sun), this is a simple
// far-away dome of twinkling stars rendered with real depth testing, so the
// solid photosphere occludes the stars behind it. It only exists for the yellow
// stage and rides inside the sun rig group, so it shows/hides with the sun.
// Base brightness of the shared star backdrop, tuned to read at the bright yellow-
// star grade. The render loop scales it by s.starBackBright so the same field also
// survives the red giant's dimmer grade (the two states share one backdrop).

export const sunStarVert = /* glsl */ `
  attribute float aSeed;
  attribute float aMag;            // 0..1 magnitude → size + base brightness
  uniform float uTime, uPixelRatio, uOpacity, uBright;
  varying float vB;
  varying float vTint;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // slow, per-star twinkle (a few stars shimmer, most hold steady)
    float tw = 0.78 + 0.22 * sin(uTime * (0.4 + 0.9*aSeed) + aSeed * 39.0);
    // brighter, larger stars are rarer (aMag near 1). The overall scale (uBright)
    // is pushed up so the points survive the tone-map + olive grade + vignette.
    float lum = mix(0.55, 2.4, aMag*aMag);
    vB = lum * tw * uOpacity * uBright;
    vTint = fract(aSeed * 17.0);   // 0..1 → cool/neutral/warm star colour
    // size scales with magnitude; the dome sits ~640u out, so the world→pixel
    // factor keeps stars as crisp pinpoints with a few larger standouts.
    float dist = -mv.z;
    gl_PointSize = clamp(uPixelRatio * (1.3 + 4.5*aMag*aMag) * (640.0/dist), 1.0, 6.0);
  }
`;

export const sunStarFrag = /* glsl */ `
  precision highp float;
  varying float vB;
  varying float vTint;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // PALETTE (yellow-star spec): "dark indigo surroundings" via an INDIGO BACKDROP.
    // The field of stars behind the yellow star is pushed toward a deep INDIGO so the
    // room reads dark-indigo while the star body stays pale gold / cream and the clear
    // colour stays true black. The cool end is a deep indigo (~0.34,0.34,0.62) and the
    // warm end is muted so few stars read warm — the field is dominantly indigo.
    // DARKENED a touch so the backdrop reads as a DEEP, dim indigo field, matching the
    // darker corona/wash above — the cool end is pulled down toward a deeper indigo and
    // the warm end muted further, so the star points stay present but never read bright.
    vec3 cool = vec3(0.28, 0.28, 0.54);   // deeper indigo (was 0.34,0.34,0.62)
    vec3 warm = vec3(0.64, 0.60, 0.66);   // muted neutral-violet, dimmed (was 0.72,0.68,0.74)
    vec3 col = mix(cool, warm, smoothstep(0.35, 0.85, vTint));
    gl_FragColor = vec4(col * vB * a, a);
  }
`;

// --- coronal loops / prominences / footpoints (animated Points) ---

export const sunLoopVert = /* glsl */ `
  attribute vec3 aColor; attribute float aSize; attribute float aSeed;
  attribute float aU; attribute float aBright;
  attribute vec3 aSeedPos; attribute float aLifeOff; attribute float aLifePer;
  attribute float aOn; attribute float aSweep; attribute float aSeq;
  uniform float uPix; uniform float uTime; uniform float uPS;
  varying vec3 vCol; varying float vB; varying float vHot;
  void main(){
    vCol = aColor;
    float phase = fract(uTime/aLifePer + aLifeOff);
    float a     = phase / aOn;                       // 0..1 across active window
    float inWin = step(phase, aOn);

    // --- LIFE ENVELOPE: a smooth breath over the whole active window ----------
    // The arcade RISES into presence, HOLDS lit, then SETTLES back — instead of
    // snapping on with the jet and hard-cutting at the end. 'live' is the base
    // presence of the (already-grown) loop; the jet flash rides ON TOP of it. This
    // is what makes a persistent coronal loop that brightens when it fires, rather
    // than a filament that only exists while the jet head is on it.
    float rise  = smoothstep(0.0, 0.14, a);          // ease in at the start
    float settle= 1.0 - smoothstep(0.72, 1.0, a);    // ease out at the end
    float live  = rise * settle * inWin;

    // arches fire in sequence (lowest first): this arch begins at aSeq and its jet
    // whips from one foot to the other like a fountain stream A -> B, DRAWING the
    // loop out of the surface as it goes (grow) and leaving a lit filament behind.
    float JET   = 0.14;                              // per-arch crossing time
    float la    = (a - aSeq) / JET;                  // local jet progress for this arch
    float started = step(aSeq, a);
    float d     = la - aSweep;                       // >0 once the jet head passed this particle
    // emerge = has the jet drawn this particle out yet. Once drawn, it STAYS out for the
    // rest of the life (max-hold): the loop is a standing structure, not a moving dot.
    float drawn = smoothstep(0.0, 0.12, d) * started;
    float emerge= drawn;
    // white-hot jet head: a tight gaussian on the sweep front, tracking along the arc.
    float flash = exp(-pow(max(d,0.0)/0.06, 2.0)) * step(0.0,d) * started * inWin * settle;

    // grow the loop out of its on-surface seed as the jet head reaches it; a tiny
    // overshoot (1.06) then relax reads as the loop springing up.
    float grow  = emerge * (1.0 + 0.06*sin(clamp(d,0.0,1.0)*3.14159));
    vec3 wp     = mix(aSeedPos, position, clamp(grow, 0.0, 1.06));

    // per-particle shimmer: a slow traveling ripple ALONG the arc (aU) plus a seed
    // jitter, so the filament crawls with plasma instead of flickering uniformly.
    float shimmer = 0.86
      + 0.09*sin(uTime*2.2 + aSeed*6.2831)
      + 0.07*sin(uTime*1.3 - aU*9.0 + aSeed*3.1);

    // base emission: the standing loop glows at 'live' (once emerged), and the jet head
    // adds a hot streak on top. The loop never fully vanishes mid-life between the head
    // passing and the settle — it holds as a persistent filament.
    vB   = aBright * shimmer * emerge * live + 0.85*flash;
    vHot = flash;

    vec4 mv = modelViewMatrix*vec4(wp,1.0);
    // size: a settled base once emerged, swelling under the hot jet head.
    gl_PointSize = aSize*uPix*(uPS/-mv.z) * (0.55 + 0.45*emerge*live + 0.9*flash);
    gl_Position = projectionMatrix*mv;
  }`;

export const sunLoopFrag = /* glsl */ `
  varying vec3 vCol; varying float vB; varying float vHot;
  // uFade ∈ [0,1]: dims the loops/prominences toward the (quiet) red giant.
  uniform float uFade;
  void main(){
    float d = length(gl_PointCoord-0.5);
    float a = smoothstep(0.5,0.0,d);
    a = pow(a,1.5);               // softer core: overlapping points fuse into plasma, not beads
    vec3 col = mix(vCol, vec3(1.0,0.96,0.86), clamp(vHot,0.0,0.85));  // white-hot leading edge
    // 1.05 -> 0.72: the arc sampling density was doubled (buildSunRig), so per-point
    // emission comes down to hold the filament's total light roughly constant.
    gl_FragColor = vec4(col*a*vB*0.72*uFade, a*uFade);
  }`;
