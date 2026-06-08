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
  // uRed ∈ [0,1]: 0 = yellow star (gold, bright), 1 = red giant (deep red, dim).
  // Drives the photosphere from a hot gold palette toward a cool, matte, deep-red
  // one and pulls overall brightness down — the COOLING half of the inflation.
  uniform float uRed;
  // uBlue ∈ [0,1]: 0 = settled yellow/gold star, 1 = HOT young blue-white star.
  // "Mass induces heat": while the star is still forming/small it is blue-white
  // hot; as it grows to full mass it cools to yellow. Driven by (1 - starFormed).
  uniform float uBlue;
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
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vec3 p = vObj * 2.4;
    float t = uTime * 0.05;
    vec3 q;
    q.x = fbm(p + vec3(0.0,0.0,t));
    q.y = fbm(p + vec3(5.2,1.3,2.7) + t);
    q.z = fbm(p + vec3(1.7,9.2,3.4) - t);
    float n = fbm(p + 3.2*q + t*0.5);
    float m = clamp(n*0.5+0.5, 0.0, 1.0);

    // gold (yellow-star) photosphere ramp — a blazing 5772K sun: hot amber troughs,
    // bright YELLOW-WHITE crests (the reference reads gold-yellow, not orange). The
    // green channel is lifted across the ramp to pull it off orange toward yellow, and
    // the stops sit well above the old dim-gold values so the surface is luminous
    // plasma, not a dusky ember.
    vec3 g0 = vec3(0.58,0.22,0.02);
    vec3 g1 = vec3(0.98,0.52,0.08);
    vec3 g2 = vec3(1.14,0.82,0.22);
    vec3 g3 = vec3(1.30,1.06,0.46);
    vec3 g4 = vec3(1.45,1.30,0.82);
    // red-giant ramp: deep maroon → blood red → red-orange (never gold/white)
    vec3 r0 = vec3(0.10,0.008,0.003);
    vec3 r1 = vec3(0.42,0.04,0.01);
    vec3 r2 = vec3(0.72,0.11,0.02);
    vec3 r3 = vec3(0.90,0.22,0.04);
    vec3 r4 = vec3(1.00,0.34,0.08);
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
    // high-contrast molten texture, not a smooth gold wash.
    float ch = fbm(p*1.4 + 2.0*q.yzx + t*0.3);
    float chMask = smoothstep(0.16, -0.05, ch);
    col = mix(col, mix(vec3(0.14,0.018,0.0), vec3(0.06,0.004,0.0), uRed), chMask*0.80);

    // sunspots: darker + slightly broader so they punch as the reference's dark pores.
    float spot = smoothstep(0.34, -0.20, ch) * smoothstep(0.48,0.2,m);
    col = mix(col, vec3(0.04,0.006,0.0), spot*0.72);

    // granulation: crisp distinct mottling (lava-cell texture of the reference). Floor
    // raised (0.72 → 0.95) so the troughs stay LUMINOUS — the reference disc is a bright
    // glowing surface, not a dark one with bright speckles. Keeps a strong swing for the
    // cell contrast, but the average is now well above 1.0 so the whole disc reads bright.
    float gran = fbm(p*7.0 + t*1.0);
    float gran2 = fbm(p*15.0 - t*0.6);
    // gran3: a FINER third octave (p*28, ~2x gran2) for the dense fine-scale stippling
    // the reference photosphere shows between the big cells — it busies up the surface
    // so it reads richly mottled rather than smoothly speckled. Small weight (0.07) and
    // the floor is dropped 0.95 → 0.90 to fund the extra ~+0.035 mean it adds, so the
    // average brightness is unchanged (the gold look / network / spots / rim are untouched).
    float gran3 = fbm(p*28.0 + t*0.4);
    col *= 0.90 + 0.50*(gran*0.5+0.5) + 0.10*(gran2*0.5+0.5) + 0.07*(gran3*0.5+0.5);

    // bright active-region speckle fades out toward the (quiet) red giant. On the
    // yellow star these are the white-hot flare patches of the reference, so they
    // run hot and bright; they cool to a dim glow as the surface reddens (uRed→1).
    // Tightened threshold (0.86 → 0.90) so the white-hot patches stay as discrete
    // flare points instead of flooding the whole crest white.
    float ar = smoothstep(0.90, 0.99, m) * (1.0 - 0.85*uRed);
    col += ar * mix(vec3(1.15,0.92,0.46), vec3(0.5,0.28,0.07), uRed);

    vec3 vd = normalize(-vViewPos);
    float fres = 1.0 - max(dot(vd, vViewN), 0.0);
    // The reference has a THICK bright yellow-white photosphere rim wrapping the disc.
    // Two terms: a wide soft brightening band (pow 1.8) that lifts the outer third of
    // the disc toward bright gold, and a tight hot edge (pow 5.0) for the crisp white-
    // gold rim line right at the silhouette. Together they read as a luminous wrapping
    // rim, not a hard dark edge, while the disc centre keeps its lava detail.
    float limbWide = pow(fres, 1.8);
    float limbEdge = pow(fres, 5.0);
    vec3 limbCol = mix(vec3(1.30,1.10,0.62), vec3(0.78,0.18,0.04), uRed);
    col = mix(col, limbCol, limbWide*mix(0.55, 0.5, uRed));
    col += limbEdge * mix(vec3(1.05,0.78,0.34), vec3(0.26,0.05,0.01), uRed);

    // overall luminance: bright gold sun → dim matte red giant (light leads size).
    // The yellow-star multiplier is pulled DOWN from the old blazing 1.42 to 1.18 so
    // the photosphere sits just below the tone-map clip point: the granulation/
    // mottling/sunspots all read with detail like the reference, instead of the crests
    // blowing out to a featureless white ball under exposure + bloom — while staying a
    // bright, saturated gold sun (1.06 read too dusky/brown).
    col *= mix(1.85, 0.5, uRed);

    // HOT YOUNG STAR (uBlue): while still forming/small the star is blue-white hot
    // (mass->heat). Recolour the whole photosphere onto a blue-white ramp keyed by
    // the same surface field m, and lerp gold->blue-white by uBlue. Cools to the
    // gold ramp above as it grows (uBlue->0). No-op for the settled yellow sun.
    vec3 b0 = vec3(0.06, 0.12, 0.30);  // cool deep blue (umbral)
    vec3 b1 = vec3(0.18, 0.34, 0.72);  // mid blue
    vec3 b2 = vec3(0.42, 0.62, 0.95);  // bright azure
    vec3 b3 = vec3(0.72, 0.86, 1.00);  // pale blue-white
    vec3 b4 = vec3(0.92, 0.97, 1.00);  // hot white core
    vec3 bcol = b0;
    bcol = mix(bcol, b1, smoothstep(0.14,0.40,m));
    bcol = mix(bcol, b2, smoothstep(0.34,0.58,m));
    bcol = mix(bcol, b3, smoothstep(0.55,0.78,m));
    bcol = mix(bcol, b4, smoothstep(0.80,0.96,m));
    bcol += limbWide * vec3(0.30, 0.45, 0.70);   // cool limb glow
    bcol *= 1.25;                             // young star is luminous
    col = mix(col, bcol, clamp(uBlue, 0.0, 1.0));

    // === CLICK ERUPTIONS ====================================================
    // A geyser/prominence at the click point: a travelling surface RIPPLE plus an
    // additive off-limb PLUME. Both read on the gold star AND the red giant, so they
    // are added AFTER the gold/red/blue recolour above. Hot eruption colour tilts
    // toward the surface palette so a tap looks like the surface flaring, not a decal.
    vec3 eruptHot = mix(vec3(1.30,1.02,0.55), vec3(1.10,0.34,0.08), uRed); // gold→red ember
    // Recompute the (geyser-side) limb factor: a true off-limb plume should glow most
    // where the surface grazes the silhouette toward the viewer, so we bias the plume
    // additive by the wide fresnel limb already computed for the rim.
    for (int i = 0; i < N_ERUPT; i++){
      float inten = uErupt[i].w;
      if (inten <= 0.0) continue;                 // idle slot
      vec3  ed  = normalize(uErupt[i].xyz);       // eruption centre direction (object space)
      float age = uEruptAge[i];
      float life = clamp(age / ERUPT_LIFE, 0.0, 1.0);
      // chord distance on the unit sphere from this fragment to the eruption centre
      // (cheaper than acos(dot) and monotonic in the geodesic distance) — 0 at the
      // centre, up to 2 at the antipode. The ring is a circle in this distance, so it
      // expands as a true circle ACROSS the curved surface from the click point.
      float cd  = length(vObj - ed);

      // --- travelling ripple (expanding bright shockwave across the photosphere) ---
      // Radius grows with age; reach + width + strength scale with intensity so a long
      // press throws a wider, stronger ring that travels further over the surface.
      float reach  = 0.45 + 1.15 * inten;         // how far the ring travels (chord units)
      float radius = reach * age / ERUPT_LIFE;    // ring radius marches outward with age
      float width  = 0.10 + 0.22 * inten;         // crest thickness widens with intensity
      // signed offset of this fragment from the ring crest; a Gaussian crest gives the
      // bright leading edge, and a softer trailing lobe (only behind the crest) reads as
      // the disturbed surface settling back down after the wave has passed.
      float off    = cd - radius;
      float crest  = exp(-pow(off / width, 2.0));                 // bright travelling crest
      float trail  = exp(-pow(max(off, 0.0) / (width*2.2), 2.0)) * 0.35; // settle behind it
      // fade the whole wave out over its life, and damp it as it reaches max radius so
      // it doesn't pop off at the travel limit.
      float ripFade = (1.0 - life) * (1.0 - smoothstep(reach*0.7, reach, cd));
      float ripple  = (crest + trail) * ripFade * inten;
      // brighten the surface where the wave is, and PERTURB the granulation as it passes
      // (a quick fine ripple in the cells riding the crest) so the texture reacts, not
      // just the luminance.
      float gripple = fbm(p*9.0 + ed*4.0 + radius*6.0) * 0.5 + 0.5;
      col += eruptHot * ripple * (0.85 + 0.6 * gripple);
      col *= 1.0 + 0.30 * ripple;                 // multiplicative lift → cells brighten with it

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
    gl_FragColor = vec4(col, 1.0);
  }`;

// --- inner chromosphere glow (BackSide additive shell) ---

export const sunGlowVert = /* glsl */ `
  varying vec3 vN; varying vec3 vP;
  void main(){ vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
    gl_Position=projectionMatrix*mv; }`;

export const sunGlowFrag = /* glsl */ `
  uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
  void main(){ vec3 vd=normalize(-vP);
    // Falloff 2.3 (between the old broad 1.7 and the too-tight 3.0): a THICK bright rim
    // ring wrapping the photosphere like the reference's luminous edge, but still
    // anchored to the disc — not a screen-wide halo. Lift 1.5 so the rim genuinely
    // glows yellow-white without bleaching the silhouette to a featureless ball.
    float i=pow(1.0-max(dot(vd,vN),0.0), 2.3);
    gl_FragColor=vec4(uColor*i*1.5, 1.0); }`;

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
    // STEEPER halo falloff (7.0 → 16.0) and SHORTER streamer reach (2.0 → 6.0) so the
    // corona is a tight warm glow clinging to the rim, not a screen-wide soft wash.
    float halo = exp(-max(r-df,0.0)*16.0);
    float st = fbm(vec3(cos(a)*0.8, sin(a)*0.8, uTime*0.02));
    st = st*0.5+0.5;
    float streamer = pow(st,3.5)*exp(-max(r-df,0.0)*6.0);
    float corona = halo*0.50 + streamer*0.18;
    corona *= smoothstep(df-0.02, df+0.04, r);
    corona *= smoothstep(1.0, df+0.05, r);
    vec3 c = mix(vec3(1.20,0.78,0.30), vec3(1.30,1.02,0.52), st*0.7);
    c = mix(c, vec3(0.85,0.20,0.05), uRed);          // gold corona → dim red haze
    // base pulled DOWN (1.05 → 0.55) so the tight rim glow doesn't add up into a broad
    // bloom-feeding wash; the red giant still dims further to a faint haze (×0.35).
    gl_FragColor = vec4(c*corona*0.55*mix(1.0, 0.35, uRed)*uFade, 1.0);
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
    // subtle stellar colour: cool blue-white → neutral → warm gold
    vec3 cool = vec3(0.80, 0.88, 1.00);
    vec3 warm = vec3(1.00, 0.92, 0.78);
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

    // arches fire in sequence (lowest first): this arch begins at aSeq and its
    // jet whips fast from one foot to the other like a fountain stream A -> B.
    float JET   = 0.12;                              // per-arch crossing time (fast)
    float la    = (a - aSeq) / JET;                  // local jet progress for this arch
    float started = step(aSeq, a);
    float d     = la - aSweep;                       // >0 once the jet head passed this particle
    float emerge= smoothstep(0.0, 0.10, d) * started;
    float fade  = 1.0 - smoothstep(0.80, 1.0, a);    // whole flare cools at the very end
    float flash = exp(-pow(max(d,0.0)/0.05, 2.0)) * step(0.0,d) * started * inWin * fade;

    float grow  = emerge * (1.0 + 0.08*smoothstep(0.5,1.0,a));   // seed -> final
    vec3 wp     = mix(aSeedPos, position, clamp(grow, 0.0, 1.06));

    float flick = 0.85 + 0.15*sin(uTime*3.0 + aSeed*6.2831);
    vB   = aBright*flick*emerge*fade*inWin + 1.7*flash;
    vHot = flash;

    vec4 mv = modelViewMatrix*vec4(wp,1.0);
    gl_PointSize = aSize*uPix*(uPS/-mv.z) * (0.5 + 0.5*emerge + 0.9*flash);
    gl_Position = projectionMatrix*mv;
  }`;

export const sunLoopFrag = /* glsl */ `
  varying vec3 vCol; varying float vB; varying float vHot;
  // uFade ∈ [0,1]: dims the loops/prominences toward the (quiet) red giant.
  uniform float uFade;
  void main(){
    float d = length(gl_PointCoord-0.5);
    float a = smoothstep(0.5,0.0,d);
    a = pow(a,1.25);              // soft core -> overlapping points form a line
    vec3 col = mix(vCol, vec3(1.0,0.96,0.86), clamp(vHot,0.0,0.85));  // white-hot leading edge
    gl_FragColor = vec4(col*a*vB*1.3*uFade, a*uFade);
  }`;
