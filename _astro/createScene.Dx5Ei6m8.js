import{H as jt,D as ai,R as Ga,f as oi,G as si,t as os,p as Me,h as ct,I as Co,A as rt,B as ii,d as Vt,l as ss,b as $e,a as k,q as He,s as M,m as Tt,U as Ba,L as fa,o as Lt,V as sa,T as ri,g as Yt,e as ni,W as is,O as rs,u as _a,r as Go,v as li,k as hi,S as ci,P as di,n as ui,M as pi}from"./three-core.CWSyYlww.js";import{C as I,s as ns,F as ls,I as fi,G as mi,U as Bo,N as gi,J as vi,O as bi,E as wi,Q as yi,w as Si,W as _o,B as xi,D as oe,K as Ei,u as Ti,l as Ai,T as ki,j as zo,g as Ri,M as Pi,z as ce,S as Di,k as Ni,A as Zt,r as Mi,V as Uo}from"./config.T_hHS4nv.js";import{R as Ho,g as Wo,f as Vo,h as oa,N as hs,c as Ht,i as Oa,D as Ia,Y as Li,b as Jt,x as Yo,o as Oi,m as Ii,v as Fi,r as Ci}from"./glGovernor.WfuLR-q6.js";import{G as Gi,E as Bi,R as _i,U as zi,S as Ui}from"./three-post.DNKlHwzC.js";import{b as Wt,C as Ut,a as Hi}from"./cockpitPlate.CT2Oip-5.js";class jo extends Error{constructor(t="WebGL is unavailable: the hero visual cannot be created."){super(t),this.name="WebGLUnavailableError"}}const cs=.18,ds=10.5/4.2;function Wi(o,t){const u=o>=2.05&&o<3.5&&!t,n=u&&o>oa,p=u&&o<=oa,c=0,e=1-we((o-Vo)/(Wo-Vo)),f=1-we((o-Ho)/(Wo-Ho));return{inYRWindow:u,meshSide:n,cloudSide:p,yrFlash:c,yrGrow:e,yrColor:f}}function Vi(o,t){const n=we(t/.12);let p,c;if(o>=hs)p=1,c=0;else if(o>Ht)p=1,c=n;else if(o>Ht-.05)p=1-we((Ht-o)/.05),c=1;else if(o>oa)p=0,c=1;else if(o>oa-Oa){const e=we((o-(oa-Oa))/Oa);p=1-e,c=e}else p=1,c=0;return{cloudW:p,meshW:c}}const qo=o=>1-Math.pow(1-o,3),we=o=>{const t=o<0?0:o>1?1:o;return t*t*(3-2*t)},Yi=[[0,.0012,.0014,.0032],[1.4,.0014,.0011,.0022],[2.05,.003,.0011,7e-4],[2.915,.0028,.0018,8e-4],[3.42,9e-4,.0014,.0026],[4.7,6e-4,9e-4,.002]];function ji(o){const t=Yi;if(o<=t[0][0])return[t[0][1],t[0][2],t[0][3]];for(let n=1;n<t.length;n+=1)if(o<=t[n][0]){const[p,c,e,f]=t[n-1],[d,a,m,h]=t[n],i=(o-p)/(d-p);return[c+(a-c)*i,e+(m-e)*i,f+(h-f)*i]}const u=t[t.length-1];return[u[1],u[2],u[3]]}function qi(o){const{stage:t,reduced:u,nova:n,cfg:p}=o,c=Math.min(1,t),e=1.6,d=Math.min(1,Math.max(0,(e-t)/(e-.5))),a=we((t-.46)/.04),m=(1.45+.4*n)*n,h=t>=Li,i=t>=hs,l=t>=Ia,E=Math.min(Math.max((Ia-t)/(Ia-3.42),0),1),b=h||i||l?1:a,x=t>Ht&&t<Jt?1:0,N=t>Ht-.05&&t<Jt?1:0,T=N*we((Jt-t)/(Jt-Ht)),L=Math.pow(T,.85),F=Math.pow(T,1.5),C=N*we((Jt-t)/.16),X=5.2*T*(1-T),P=1+N*.8*X,$=1-T,se=1+N*($-1),z=i||C>.001,{inYRWindow:de,meshSide:U,cloudSide:ne,yrFlash:Z,yrGrow:fe,yrColor:Ze}=Wi(t,i),{cloudW:We,meshW:ee}=Vi(t,F),Ve=x===1,pt=We>.001,G=ee>.001,Be=ne||b>.5&&!h&&!i&&!l,Le=(de?ne:!0)&&!i&&!Ve&&!Be,me=U,Q=1-Math.min(1,Math.max(0,(c-.1)/.4)),te=p.starBright*(.4+.6*Q)*(1-.45*b)+p.starBright*.45*b,Oe=b>.02,Ie=!Oe&&c<.42,O=!Oe&&c<=.25&&b<=0,B=l,Fe=Math.min(1,Math.max(0,(c-.46)/.54)),le=Math.exp(-Math.pow((c-.42)/.035,2));let ie=p.bloomStr*(1-.7*Fe)+n*.55*(1-.9*le);ie=ie*(1-.6*b)+.12*b,ie*=1-.9*le;const ge=Math.exp(-Math.pow((c-.5)/.15,2)),dt=ne?.3+.7*fe:1,ye=1.25*(1-.92*ge)*dt,ft=n;let r=p.exposure*(1-.58*ge)*(1-.18*b)*(1-.35*le)*(1+.9*ft*(1-.7*le));const v=Math.exp(-Math.pow((c-.66)/.2,2))*(1-b);let D=p.olive*(1-.85*b)*(1-.92*v),Y=p.warmth+.06*b+.12*v,y=p.saturation+.5*b+.7*v;const he=p.saturation+.55*v+.5*b;let H=he,S=p.grain,ae=.78,J=p.bloomRad,Je=1;const Qe=Be,ue=Z,Se=p.exposure*.86,j=.4,Pe=1.05,et=.34,Ce=.46,Ye=.05,_e=.16,xe=(Qe||U)&&!i&&!l&&!Ve;if(me){const K=Ve?1-we((t-3)/.15):1;ie=(et+.05*ue)*K+.32*(1-K),J=.42,r=(Pe*K+.58*(1-K))*(1+.03*ue),D=0,Y=.04,y=1,ae=.42*K+.78*(1-K)}else if(Qe){const K=ne?Ze:1,De=.5,Ft=.22,Pt=De*(1+.03*ue),ra=Se;ie=(Ft+.03*ue)*(1-K)+j*K,J=.42*(1-K)+.54*K,r=Pt*(1-K)+ra*K,D=0,Y=.1*K,y=1,H=1,ae=.42*(1-K)+.34*K,Je=1+(Pt/ra-1)*K}else if(i&&!l){const K=we((t-3.5)/.35);ie=ie*(1-K)+.38*K,J=p.bloomRad*(1-K)+.75*K,r=r*(1-K)+.58*K,D*=1-K,Y*=1-K,y=y*(1-K)+1.55*K,H=H*(1-K)+1.4*K,S=S*(1-K);const De=we((t-4.25)/.2);ie=ie*(1-De)+Ye*De,J=J*(1-De)+_e*De,r=r*(1-De)+Ce*De,Y=Y*(1-De)+-.03*De,y=y*(1-De)+.72*De,H=H*(1-De)+.7*De}else l?(ie=Ye,J=_e,r=Ce,D=0,Y=-.03,y=.72,H=.7):J=p.bloomRad;const Ge=n*n;ie+=.45*Ge,J+=.16*Ge,r*=1+.28*Ge;const ut=.1,tt=.46,It=.18,mt=we((t-ut)/(tt-ut)),it=u?1:1-(1-It)*mt,gt=ds,je=3.32,At=4.72,kt=.36,Rt=.4,vt=we((t-je)/kt),qt=we((t-(At-Rt))/Rt),ia=u?0:vt*(1-qt);return{morph:c,kCollapse:d,giant:a,giantHeld:b,giantScale:gt,yellow:h,nebula:i,nebulaShader:z,dot:l,nebulaGrow:E,collapse:L,simBlend:C,starFormed:F,cloudBright:P,nebFade:se,flash:m,inYRWindow:de,meshSide:U,cloudSide:ne,yrFlash:Z,yrGrow:fe,yrColor:Ze,sunRigVisible:G,cloudShown:pt,meshW:ee,cloudW:We,starPtsVisible:Le,starBackVisible:xe,starBackBright:Je,lensLive:Q,starBright:te,gravityGone:Oe,ringVisible:Ie,diskGhostVisible:O,particleFullRes:B,flareAmt:Fe,seedZone:le,hotZone:ge,baseBright:ye,exGrade:v,exSat:he,bloomStrength:ie,bloomRadius:J,exposure:r,olive:D,warmth:Y,gradeSat:y,toneComp:ae,grain:S,diskSat:H,streak:ia,blackHoleScale:it,roomTint:ji(t)}}const Ki=`
  float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=h31(i+vec3(0,0,0)), n100=h31(i+vec3(1,0,0));
    float n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1));
    float n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float s=0.0, a=0.5;
    for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; }
    return s;
  }
`,us=`
  vec3 nebulaPlace(float aSeed, float aU, float aPhase, float uTime, float uGiantR){
    // ITEM 5: a LESS-circular volume that reads as RAW MATERIAL / unfinished gas, not a
    // decorative magic ball. The placement is the SINGLE source shared by the sim seed
    // AND the analytic render (disk.glsl imports this fn), so both stay in lockstep.
    // ELL is made ASYMMETRIC again (stretched on X/Z, squashed on Y) so the silhouette
    // is an oblique cloud, not a circle.
    vec3 ELL = vec3(1.22, 0.86, 1.10);
    float NR = uGiantR * 1.72;                          // overall nebula extent (bigger → fills the frame)
    vec3 nDrift = vec3(uTime*0.006, uTime*0.004, -uTime*0.005);

    vec3 hh = vec3(
      h31(vec3(aSeed*13.0, aU*17.0,  5.0)),
      h31(vec3(aSeed*7.0,  aPhase*9.0, 23.0)),
      h31(vec3(aU*29.0,    aPhase*3.0, 41.0))
    );
    // UNIFORM point in a BALL: pick a uniform direction on the unit sphere (z = 1-2u,
    // azimuth 2*pi*v) and a cube-root radius so density is even out to NR.
    float uz = hh.x * 2.0 - 1.0;                        // cos(theta), uniform in [-1,1]
    float az = hh.y * 6.2831853;                        // azimuth, uniform in [0,2pi)
    float rad = sqrt(max(0.0, 1.0 - uz*uz));
    vec3 dir = vec3(rad*cos(az), uz, rad*sin(az));
    float rr = pow(hh.z, 0.3333);                        // even volumetric fill
    vec3 p0 = dir * rr * NR;
    p0 *= ELL;
    // DIAGONAL SHEAR: shear X by Z (and a touch Y by X) so the cloud leans on a diagonal
    // axis instead of sitting axis-aligned — reads as wind-blown raw gas, not a symmetric ball.
    p0.x += p0.z * 0.34 + p0.y * 0.10;
    p0.y += p0.x * 0.08;

    vec3 warp = vec3(
      fbm(p0*0.42 +  3.0 + nDrift),
      fbm(p0*0.42 + 17.0 + nDrift),
      fbm(p0*0.42 + 41.0 + nDrift)
    ) - 0.5;
    vec3 wp = p0 + warp * (NR * 0.85);                   // a touch more warp → raggeder edges

    // EMPTY HOLES (ITEM 5): carve voids through the cloud so it reads as fragments /
    // unfinished paths, not a solid magic cloud. A low-frequency noise mask over the
    // placement decides where the gas is thin: in the void pockets (mask below a
    // threshold) particles are PUSHED radially outward (so the inner pocket empties and
    // the gas piles into raggeder filaments around it). Deterministic in the seed, so it
    // is identical every visit and the sim's home target carves the same holes.
    float holeMask = fbm(wp*0.30 + 53.0);               // 0..1 lumpy field over the cloud
    float voidAmt = smoothstep(0.52, 0.30, holeMask);   // 1 deep in a void pocket → 0 in the gas
    wp += normalize(wp + 1e-4) * voidAmt * (NR * 0.42); // push void gas outward → hollow pockets

    return wp;
  }
`;function ps(o){const t=Math.ceil(Math.sqrt(Math.max(1,o))),u=Math.ceil(t/4)*4,n=Math.ceil(o/u);return{width:u,height:n}}const Xi=`
  uniform sampler2D uSeedTex; // rgb = aSeed, aU, aPhase (same texel mapping as the sim)
  uniform float uDt;
  uniform float uG;          // gravitational constant (tuned, not physical)
  uniform float uM0;         // base central mass
  uniform float uEps;        // Plummer softening length
  uniform float uMaxSpeed;   // velocity clamp (anti fly-apart / singularity)
  uniform float uDamp;       // viscous damping in the collapse regime
  uniform float uHomeDamp;   // (stiff) damping in the relaxed/home regime
  uniform float uHomeK;      // home-spring stiffness
  uniform float uCurlAmp;    // curl turbulence strength
  uniform float uCollapseDrive; // 0 = relaxed/home, 1 = full collapse
  uniform float uAccretedFrac;  // 0..1 fraction parked on the core (grows mass)
  uniform float uFinish;        // 0 most of the bake → 1 over the last steps: a gentle terminal
                                // inward NUDGE (constant magnitude, NOT distance-proportional) that
                                // keeps stragglers drifting in without synchronizing arrivals.
  uniform float uCoreR;      // accretion core radius (turbulence fades inside)
  uniform float uTime;       // animation clock (curl drift)
  uniform float uFrozenTime; // FROZEN nebula time → stable home target
  uniform float uGiantR;     // nebula extent scale

  // finite-difference curl of an fbm potential → divergence-free swirl
  vec3 curlNoise(vec3 p){
    const float e = 0.35;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    float x1 = fbm(p + dy) - fbm(p - dy);
    float x2 = fbm(p + dz) - fbm(p - dz);
    float y1 = fbm(p + dz) - fbm(p - dz);
    float y2 = fbm(p + dx) - fbm(p - dx);
    float z1 = fbm(p + dx) - fbm(p - dx);
    float z2 = fbm(p + dy) - fbm(p - dy);
    return normalize(vec3(x1 - x2, y1 - y2, z1 - z2) + 1e-6);
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 P = texture2D(texturePosition, uv);
    vec4 V = texture2D(textureVelocity, uv);
    vec3 pos = P.xyz; float life = P.w;
    vec3 vel = V.xyz; float seed = V.w;

    // parked particles (life≈0) stop integrating — they're on the star now.
    if(life <= 0.001){ gl_FragColor = vec4(0.0, 0.0, 0.0, seed); return; }

    float dist = length(pos);

    // (1) softened central well; mass grows MODERATELY as the cloud feeds the star.
    // The growth factor was 3.0 (well quadruples by the end) — too hard: a central pull that
    // ramps that much in the back half yanks ALL remaining grains in together, so the collapse
    // "syncs up" late (every grain converging at once). But 0.8 was too SOFT — the well never
    // got strong enough to pull the outermost orbiting grains all the way in, so a shell of gas
    // survived to the floor (the cloud "never finished"). 1.4 is the middle: enough late pull to
    // guarantee the whole cloud is consumed, while the 1/r^2 falloff still dominates the TIMING
    // (inner grains accelerate far harder than outer ones) so arrivals stay STAGGERED, not synced.
    float M = uM0 * (1.0 + 1.4*uAccretedFrac);
    float soft = dist*dist + uEps*uEps;
    vec3 aGrav = -uG * M * pos / pow(soft, 1.5);

    // (2) curl turbulence, faded out near the core (clean accretion)
    float edge = smoothstep(uCoreR, uCoreR*4.0, dist);
    vec3 aCurl = uCurlAmp * edge * curlNoise(pos*0.35 + uTime*0.05);

    // (3) home-spring back to the analytic nebula placement (reversibility).
    // Read the TRUE per-particle (aSeed,aU,aPhase) from the seed texture at this
    // texel — same mapping as the render side — so the home target is this exact
    // particle's analytic nebula home (not an approximation from the seed alone).
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 home = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    vec3 aHome = uHomeK * (home - pos);

    // blend the two regimes by the scroll-derived collapse drive
    vec3 acc = mix(aHome, aGrav + aCurl, uCollapseDrive);

    // (4) TERMINAL NUDGE: the softened well (aGrav) weakens near the core, so a few grains never
    // quite reach uCoreR within the bake and read as a cloud that never finishes. We add a gentle
    // assist that ramps in over the back half (uFinish eased, no hard regime switch).
    //
    // CRITICAL: the nudge is CONSTANT-MAGNITUDE (a fixed inward accel), NOT proportional to the
    // grain's remaining distance. A distance-proportional spring (the old aPullIn = k*(-pos)) is a
    // pure SYNCHRONIZER: every grain then decays toward the core on the SAME exponential rate
    // regardless of where it is, so they all arrive AT THE SAME TIME — exactly the "every particle
    // converges at once in the second half" artifact. A constant inward nudge instead just biases
    // every grain inward by a small fixed amount, leaving the 1/r^2 gravity (which accelerates inner
    // grains far harder) as the dominant timing cue → arrivals stay STAGGERED and the infall reads
    // as one continuous trickle to the end. Curl eases out with the same ramp for a clean settle.
    // The nudge must be strong enough to break ORBIT for the outermost grains: with curl
    // turbulence (uCurlAmp) sustaining tangential motion and the monotonic radius clamp
    // forbidding outward steps, a far grain can settle into a near-constant-radius orbit that
    // never falls in (its net radial velocity ≈ 0, so it just rides its shell). A constant
    // inward bias of uG*0.12 reliably overcomes that balance so EVERY grain spirals down to the
    // core and parks before the last snapshot — the cloud finishes fully vacuumed. Still constant
    // magnitude (not distance-proportional), so arrivals stay staggered, not synchronized.
    vec3 inwardDir = -normalize(pos + 1e-4);             // unit vector toward the core (distance-independent)
    vec3 aPullIn = uFinish * uG * 0.12 * inwardDir;      // CONSTANT inward bias, strong enough to break orbit —
                                                         // does NOT scale with distance, so far grains aren't rushed
    acc = acc + (aPullIn - aCurl*uFinish) * uCollapseDrive;

    // semi-implicit Euler (update v here, x in the position pass)
    vel += acc * uDt;
    float damp = mix(uHomeDamp, uDamp, uCollapseDrive);
    vel *= (1.0 - clamp(damp*uDt, 0.0, 1.0));
    float spd = length(vel);
    if(spd > uMaxSpeed) vel *= uMaxSpeed/spd;

    gl_FragColor = vec4(vel, seed);
  }
`,$i=`
  uniform float uDt;
  uniform float uCoreR;
  uniform float uParkRate;
  uniform float uCollapseDrive; // 0 = relaxed/home (radius may grow back to the cloud), 1 = collapse

  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 P = texture2D(texturePosition, uv);
    vec4 V = texture2D(textureVelocity, uv);
    vec3 pos = P.xyz; float life = P.w;

    if(life <= 0.001){ gl_FragColor = P; return; } // parked: frozen on the surface

    float rPrev = length(pos);                 // radius BEFORE this step
    pos += V.xyz * uDt;

    // MONOTONIC-INWARD CLAMP: during the collapse a grain must never move FARTHER from the core
    // than it already was. A few outer grains otherwise net OUTWARD on the first instants (the seed
    // swirl is tangential to the START position, so after a step it has a small outward radial
    // component and gravity is weak that far out) — the wrong-way chunk on the far edge. Cancelling
    // outward VELOCITY leaks (semi-implicit Euler re-introduces it next step); clamping the RADIUS
    // here is a hard guarantee. We scale the new position back onto the previous radius shell if it
    // grew, preserving the TANGENTIAL move (the organic spiral) while forbidding any outward step.
    // Gated by uCollapseDrive so the relaxed/home regime (where grains relax back OUT to the
    // dispersed cloud on scroll-up) is untouched.
    float rNew = length(pos);
    if(uCollapseDrive > 0.5 && rNew > rPrev){
      pos *= rPrev / max(rNew, 1e-6);
    }

    // accretion: inside the core radius, park ON the (growing) photosphere shell
    // and ramp life → 0 over a few frames so the render side can dim/hand off.
    float dist = length(pos);
    if(dist < uCoreR){
      pos = normalize(pos + 1e-4) * uCoreR;
      life = max(0.0, life - uParkRate);
    }
    gl_FragColor = vec4(pos, life);
  }
`,Zi=`
  uniform sampler2D uSeedTex;  // rgb = aSeed, aU, aPhase (baked at build time)
  uniform float uFrozenTime;
  uniform float uGiantR;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 wp = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    gl_FragColor = vec4(wp, 1.0);  // life = 1 (free gas)
  }
`,Ji=`
  uniform sampler2D uSeedTex;
  uniform float uFrozenTime;
  uniform float uGiantR;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 sd = texture2D(uSeedTex, uv).xyz;
    vec3 wp = nebulaPlace(sd.x, sd.y, sd.z, uFrozenTime, uGiantR);
    // a SMALL tangential swirl plus a DOMINANT inward bias so the gas leans toward the
    // star from the start and merges as a clean inward spiral — NOT a chaotic implosion.
    // We keep a jittered per-particle swirl AXIS (not a global y axis) so the convergence
    // still avoids the clean equatorial-disk + polar-column cross-seam artifact and reads
    // organic — but the swirl MAGNITUDE is cut hard so the dominant motion is inward, not
    // orbital. The old big swirl (0.10 + 0.22*h31) made the collapse "chaotic from all
    // sides" (a leftover chaotic-interaction experiment); it's now a gentle texture on top
    // of a clean inward fall.
    vec3 rnd = normalize(vec3(
      h31(vec3(sd.x*91.0, sd.y*13.0, 7.0)) - 0.5,
      h31(vec3(sd.y*51.0, sd.z*29.0, 3.0)) - 0.5,
      h31(vec3(sd.z*17.0, sd.x*37.0, 5.0)) - 0.5
    ) + 1e-4);
    vec3 tang = normalize(cross(rnd, wp) + 1e-4);
    vec3 inward = -normalize(wp + 1e-4);
    // GENTLER swirl (0.10+0.22 → 0.05+0.10): a small jittered orbit so the spiral isn't a
    // sterile radial implosion, but well below the inward pull so particles lean toward the
    // core rather than orbiting chaotically.
    float swirl = 0.05 + 0.10*h31(vec3(sd.x*5.0, sd.y*7.0, 11.0));
    // STRONGER inward bias (0.20+0.25 → 0.32+0.25): every particle leans harder toward the
    // core from frame one, so the dominant motion is a clean inward spiral that merges into
    // the star, not a long chaotic orbit.
    gl_FragColor = vec4(tang * swirl + inward * (0.32 + 0.25*sd.y), sd.x); // w = seed
  }
`,Ko=1/60;function Qi(o){const{renderer:t,count:u,aSeed:n,aU:p,aPhase:c,giantR:e,coreR:f}=o,d={available:!1,step:()=>{},bake:()=>{},isBaked:()=>!1,sampleAt:()=>null,dispose:()=>{}};if(!t.capabilities.isWebGL2)return d;const{width:a,height:m}=ps(u),h=new Gi(a,m,t);h.setDataType(jt);const i=new Float32Array(a*m*4);for(let G=0;G<u;G++)i[G*4+0]=n[G],i[G*4+1]=p[G],i[G*4+2]=c[G],i[G*4+3]=1;const l=new ai(i,a,m,Ga,oi);l.needsUpdate=!0;const E=Ki+us,w=h.createTexture(),b=h.createTexture(),x=h.addVariable("textureVelocity",E+Xi,b),A=h.addVariable("texturePosition",E+$i,w);if(h.setVariableDependencies(x,[x,A]),h.setVariableDependencies(A,[x,A]),x.material.uniforms.uSeedTex={value:l},x.material.uniforms.uDt={value:Ko},x.material.uniforms.uG={value:32},x.material.uniforms.uM0={value:1},x.material.uniforms.uEps={value:e*.15},x.material.uniforms.uMaxSpeed={value:e*6.5},x.material.uniforms.uDamp={value:1.9},x.material.uniforms.uHomeDamp={value:8},x.material.uniforms.uHomeK={value:30},x.material.uniforms.uCurlAmp={value:.8},x.material.uniforms.uCollapseDrive={value:0},x.material.uniforms.uAccretedFrac={value:0},x.material.uniforms.uFinish={value:0},x.material.uniforms.uCoreR={value:f*1.25},x.material.uniforms.uTime={value:0},x.material.uniforms.uFrozenTime={value:0},x.material.uniforms.uGiantR={value:e},A.material.uniforms.uDt={value:Ko},A.material.uniforms.uCoreR={value:f*1.25},A.material.uniforms.uParkRate={value:.14},A.material.uniforms.uCollapseDrive={value:0},h.init()!==null)return l.dispose(),h.dispose(),d;const T=h.createShaderMaterial(E+Zi,{uSeedTex:{value:l},uFrozenTime:{value:0},uGiantR:{value:e}}),L=h.createShaderMaterial(E+Ji,{uSeedTex:{value:l},uFrozenTime:{value:0},uGiantR:{value:e}}),F=()=>{for(const G of A.renderTargets)h.doRenderTarget(T,G);for(const G of x.renderTargets)h.doRenderTarget(L,G)};F();const C=200,X=21;x.material.uniforms.uCollapseDrive.value=1,A.material.uniforms.uCollapseDrive.value=1;const P=[],$=h.createShaderMaterial(`
      uniform sampler2D uSrc;
      void main(){ gl_FragColor = texture2D(uSrc, gl_FragCoord.xy / resolution.xy); }
    `,{uSrc:{value:null}}),se=18;let z=!1,de=!1,U=0,ne=0;const Z=G=>Math.round(G/(X-1)*C),fe=()=>{const G=h.createRenderTarget(a,m);$.uniforms.uSrc.value=h.getCurrentRenderTarget(A).texture,h.doRenderTarget($,G),P.push(G),ne++};return{available:!0,step:()=>{},bake:()=>{if(de)return;z||(z=!0,F(),fe());let G=se;for(;ne<X&&G>0;){const Be=Z(ne);if(U>=Be){fe();continue}const Le=U/C;x.material.uniforms.uAccretedFrac.value=Math.min(1,Le);const me=Math.min(1,Math.max(0,(Le-.3)/.7));x.material.uniforms.uFinish.value=me*me*(3-2*me),h.compute(),U++,G--}ne>=X&&(de=!0)},isBaked:()=>de,sampleAt:G=>{if(P.length===0)return null;const Le=Math.min(1,Math.max(0,G))*(X-1),me=P.length-1;if(me===0)return{texA:P[0].texture,texB:P[0].texture,mix:0};const Q=Math.min(me-1,Math.floor(Le));return{texA:P[Q].texture,texB:P[Q+1].texture,mix:Math.min(1,Le-Q)}},dispose:()=>{l.dispose(),T.dispose(),L.dispose(),$.dispose();for(const G of P)G.dispose();h.dispose()}}}const za=`
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
`,fs=`
  // returns vec3(m, ch, granMul) — mottle field, network field, granulation gain
  vec3 sunSurfaceField(vec3 sdir, float t, vec3 waveDisp){
    vec3 p = sdir * 2.4;
    vec3 q;
    q.x = fbm(p + vec3(0.0,0.0,t));
    q.y = fbm(p + vec3(5.2,1.3,2.7) + t);
    q.z = fbm(p + vec3(1.7,9.2,3.4) - t);
    float n = fbm(p + 3.2*q + waveDisp + t*0.5);
    float m = clamp(n*0.5+0.5, 0.0, 1.0);
    float ch = fbm(p*1.4 + 2.0*q.yzx + waveDisp*1.4 + t*0.3);
    float gran = fbm(p*7.0 + waveDisp*7.0 + t*1.0);
    float gran2 = fbm(p*15.0 + waveDisp*15.0 - t*0.6);
    float gran3 = fbm(p*28.0 + waveDisp*28.0 + t*0.4);
    float granMul = 0.90 + 0.50*(gran*0.5+0.5) + 0.10*(gran2*0.5+0.5) + 0.07*(gran3*0.5+0.5);
    return vec3(m, ch, granMul);
  }
`,er=`
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
    vObj = normalize(position);
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`,tr=4,ar=za+fs+`
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
  // --- baked photosphere surface fields (LOW tier only — scene/buildSunBake.ts) --
  // uSunBakeReady stays 0 (the analytic per-pixel path — today's exact shader)
  // unless the LOW tier's boot-time cubemap bake succeeded (never on high/mid,
  // under ?sunbake=0, without WebGL2, or after a failed bake). When 1, the whole
  // 48-snoise-per-pixel stack collapses to ONE cubemap fetch; the slow time
  // scroll is carried by rotating the lookup direction (see sunSurfaceField).
  uniform samplerCube uSunTex;
  uniform float uSunBakeReady;
  varying vec3 vObj; varying vec3 vViewN; varying vec3 vViewPos;
  void main(){
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

    // === SURFACE FIELDS: baked cubemap fetch (low tier) vs analytic stack ===
    // sf = (m, ch, granMul) — see SUN_SURFACE_FIELD_GLSL. The analytic branch is
    // the exact original math (one shared function, verbatim); the baked branch
    // replaces the whole 8-fbm stack with a single fetch, rotating the lookup
    // direction slowly to stand in for the original domain scroll (t). The
    // click-ripple domain warp (waveDisp) cannot warp a baked texture — on the
    // low tier the wave keeps its crest light (added below) but not the
    // cell-streaming, an accepted low-only trade against 51.8ms/frame of noise.
    vec3 sf;
    if(uSunBakeReady > 0.5){
      // slow rigid rotation ≈ the analytic domain scroll's drift rate (the scroll
      // translates the p = dir*2.4 domain at ~1.7·(dt) per second of t, which at
      // unit-sphere scale is ~0.7·t radians). Axis is arbitrary but fixed.
      vec3 axis = normalize(vec3(0.30, 1.0, 0.22));
      float ca = cos(t*0.7), sa = sin(t*0.7);
      vec3 d0 = normalize(vObj);
      vec3 bd = d0*ca + cross(axis, d0)*sa + axis*dot(axis, d0)*(1.0-ca);
      sf = textureCube(uSunTex, bd).rgb;
    } else {
      sf = sunSurfaceField(vObj, t, waveDisp);
    }
    float m = sf.x;

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
    float ch = sf.y; // chromospheric network field (shared sunSurfaceField / bake)
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
    // gran/gran2/gran3 (incl. the fine p*28 stippling octave) now live in
    // sunSurfaceField — sf.z is the combined brightness multiplier
    // 0.90 + 0.50·(g·0.5+0.5) + 0.10·(g2·0.5+0.5) + 0.07·(g3·0.5+0.5), verbatim.
    col *= sf.z;

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
  }`,or=`
  varying vec3 vN; varying vec3 vP;
  void main(){ vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
    gl_Position=projectionMatrix*mv; }`,sr=`
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
    gl_FragColor=vec4(uColor*i*1.0*uFade, 1.0); }`,ir=`
  varying vec2 vUv; void main(){ vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,rr=za+`
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
  }`,nr=`
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
`,lr=`
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
`,hr=`
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
  }`,cr=`
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
  }`,ms=2.2;function dr(o,t,u){const n=new si;n.visible=!1;const p=[],c=[];for(let r=0;r<tr;r++)p.push(new os(0,1,0,0)),c.push(0);const e=new Me({uniforms:{uTime:{value:0},uMeshFade:{value:1},uRed:{value:0},uBlue:{value:0},uSeedGlow:{value:1},uDetail:{value:1},uErupt:{value:p},uEruptAge:{value:c},uWaveFlow:{value:1},uSunTex:{value:null},uSunBakeReady:{value:0}},vertexShader:er,fragmentShader:ar,transparent:!0,depthWrite:!0,premultipliedAlpha:!0}),f=new ct(new Co(t,24),e);n.add(f);const d=new Me({uniforms:{uColor:{value:new Vt(1,.55,.16)},uFade:{value:1}},vertexShader:or,fragmentShader:sr,side:ii,transparent:!0,depthWrite:!1,blending:rt}),a=new ct(new Co(t*1.08,16),d);n.add(a);const m=t*2.4,h=new Me({uniforms:{uTime:{value:0},uDiskFrac:{value:t/m},uRed:{value:0},uFade:{value:1}},vertexShader:ir,fragmentShader:rr,transparent:!0,depthWrite:!1,depthTest:!1,blending:rt}),i=new ct(new ss(m*2,m*2),h);n.add(i);const l=(r,v)=>[r[0]+v[0],r[1]+v[1],r[2]+v[2]],E=(r,v)=>[r[0]-v[0],r[1]-v[1],r[2]-v[2]],w=(r,v)=>[r[0]*v,r[1]*v,r[2]*v],b=(r,v)=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2],x=r=>Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]),A=r=>{const v=x(r)||1;return[r[0]/v,r[1]/v,r[2]/v]},N=(r,v)=>[r[1]*v[2]-r[2]*v[1],r[2]*v[0]-r[0]*v[2],r[0]*v[1]-r[1]*v[0]],T=(r,v,D)=>{const Y=Math.cos(D),y=Math.sin(D),he=b(v,r),H=N(v,r);return[r[0]*Y+H[0]*y+v[0]*he*(1-Y),r[1]*Y+H[1]*y+v[1]*he*(1-Y),r[2]*Y+H[2]*y+v[2]*he*(1-Y)]},L=r=>{const v=Math.abs(r[1])<.95?[0,1,0]:[1,0,0],D=A(N(v,r)),Y=N(r,D);return[D,Y]},F=()=>{let r=0,v=0;for(;r===0;)r=Math.random();for(;v===0;)v=Math.random();return Math.sqrt(-2*Math.log(r))*Math.cos(2*Math.PI*v)},C=r=>r<0?0:r>1?1:r,X=[],P=[],$=[],se=[],z=[],de=[],U=[],ne=[],Z=[],fe=[],Ze=[],We=[],ee={off:0,per:10,on:.45,dir:0,seq:0},Ve=(r,v,D,Y,y)=>{X.push(r[0],r[1],r[2]);const he=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2])||1;U.push(r[0]/he*t*1.006,r[1]/he*t*1.006,r[2]/he*t*1.006),P.push(v[0],v[1],v[2]),$.push(D),se.push(Math.random()*6.2831),z.push(Y),de.push(y),Ze.push(ee.dir?1-Y:Y),We.push(ee.seq),ne.push(ee.off),Z.push(ee.per),fe.push(ee.on)},pt=r=>{const v=[1,0,0];let D=A(E(v,w(r,b(v,r))));x(D)<.2&&(D=A(E([0,0,1],w(r,b([0,0,1],r)))));const Y=A(N(r,D));return[D,Y]},G=r=>{const v=r.hero===!0,D=r.c,Y=pt(D),y=T(Y[0],D,0),he=A(N(D,y)),H=T(D,he,-r.sep),S=T(D,he,r.sep),ae=r.kBase*.42,J=r.kBase*1.62,Je=.4;for(let ue=0;ue<r.nArch;ue++){const Se=r.nArch>1?ue/(r.nArch-1):.5;ee.seq=Se*Je;const j=ae+Se*(J-ae)+(Math.random()-.5)*.035,Pe=(j-ae)/(J-ae+1e-6),et=(.1+.9*Pe)*r.archLean+F()*r.fan,Ce=v?520+Math.floor(j*1200):240+Math.floor(j*680),Ye=t*(.0014+Math.random()*.0026);for(let _e=0;_e<Ce;_e++){let xe=(_e+(Math.random()-.5)*.16)/(Ce-1);xe=C(xe);const Ge=Math.sin(Math.PI*xe),ut=(xe-.5)*2*r.sep;let tt=T(D,he,ut);tt=T(tt,D,et*Ge);const It=t*(1+j*Ge);let mt=w(tt,It);const it=Ye*(.25+.75*Ge);mt=l(mt,w(he,F()*it)),mt=l(mt,w(tt,F()*it*.4));const at=Math.pow(1-Ge,1.7),gt=v?[1,Math.min(1,.78+at*.22),Math.min(1,.42+at*.5)]:[1,Math.min(1,.64+at*.3),Math.min(1,.18+at*.52)],je=(.5+.55*at)*(1-.4*Pe)+.1*Math.random(),At=Math.max(.16,v?je*1.6:je),kt=Math.max(.1,.15+Math.random()*.15+at*.16);Ve(mt,gt,kt,xe,At)}}ee.seq=0;let Qe=0;for(const ue of[H,S]){const Se=Qe===0?.015:.985;Qe++;const j=L(ue);for(let Pe=0;Pe<70;Pe++){const et=.026+Math.random()*.018,Ce=A(l(ue,l(w(j[0],F()*et),w(j[1],F()*et)))),Ye=t*(1+Math.random()*.045),_e=w(Ce,Ye),xe=Math.random()<.12,Ge=xe?[1,.94,.78]:[1,.85,.55],ut=xe?.7+Math.random()*.8:.26+Math.random()*.38,tt=xe?1.5+Math.random()*.6:.9+Math.random()*.55;Ve(_e,Ge,ut,Se+(Math.random()-.5)*.02,tt)}for(let Pe=0;Pe<5;Pe++){const et=A(l(w(j[0],F()),w(j[1],F()))),Ce=t*(.06+Math.random()*.14),Ye=28;for(let _e=0;_e<Ye;_e++){const xe=_e/(Ye-1),Ge=A(l(ue,w(et,xe*.1))),ut=w(Ge,t*(1+Ce/t*Math.sin(xe*1.4))),tt=Math.pow(1-xe,1.4);Ve(ut,[1,.78,.42],.16+tt*.16,Se+(Math.random()-.5)*.02,(.7+.5*tt)*(.7+.5*Math.random()))}}}},Be=()=>{ee.off=Math.random(),ee.per=7+Math.random()*9,ee.on=.4+Math.random()*.16,ee.dir=Math.random()<.5?0:1},Le=(r,v)=>{const D=Math.cos(v);return A([D*Math.sin(r),Math.sin(v),D*Math.cos(r)])},me=7,Q=2.399963;for(let r=0;r<me;r++){const v=r*3%me/(me-1),D=Math.pow(v,.55),Y=v<.16,y=r*Q+(Math.random()-.5)*.3,he=(r%2===0?1:-1)*(.14+Math.random()*.32);Be(),ee.per=14+(1-D)*9+Math.random()*4,ee.on=.34+(1-D)*.14,ee.off=(r*.618+Math.random()*.12)%1,G({c:Le(y,he),sep:.56-D*.44,nArch:Math.round(24-D*19),kBase:.7-D*.52,archLean:(Math.random()<.5?1:-1)*(.3-D*.06),fan:.02+D*.05,hero:Y})}const te=new $e;te.setAttribute("position",new k(Float32Array.from(X),3)),te.setAttribute("aColor",new k(Float32Array.from(P),3)),te.setAttribute("aSize",new k(Float32Array.from($),1)),te.setAttribute("aSeed",new k(Float32Array.from(se),1)),te.setAttribute("aU",new k(Float32Array.from(z),1)),te.setAttribute("aBright",new k(Float32Array.from(de),1)),te.setAttribute("aSeedPos",new k(Float32Array.from(U),3)),te.setAttribute("aLifeOff",new k(Float32Array.from(ne),1)),te.setAttribute("aLifePer",new k(Float32Array.from(Z),1)),te.setAttribute("aOn",new k(Float32Array.from(fe),1)),te.setAttribute("aSweep",new k(Float32Array.from(Ze),1)),te.setAttribute("aSeq",new k(Float32Array.from(We),1)),te.boundingSphere=new He(new M(0,0,0),t*8);const Oe=new Me({uniforms:{uTime:{value:0},uPix:{value:u},uPS:{value:150},uFade:{value:1}},vertexShader:hr,fragmentShader:cr,transparent:!0,depthWrite:!1,depthTest:!0,blending:rt}),Ie=new Tt(te,Oe);Ie.frustumCulled=!1,n.add(Ie);const O=4200,B=t*165,Fe=new Float32Array(O*3),le=new Float32Array(O),ie=new Float32Array(O);for(let r=0;r<O;r++){const v=B*(.85+Math.random()*.3),D=Math.random()*2-1,Y=Math.random()*Math.PI*2,y=Math.sqrt(1-D*D);Fe[r*3+0]=v*y*Math.cos(Y),Fe[r*3+1]=v*D,Fe[r*3+2]=v*y*Math.sin(Y),le[r]=Math.random(),ie[r]=Math.pow(Math.random(),2)}const ge=new $e;ge.setAttribute("position",new k(Fe,3)),ge.setAttribute("aSeed",new k(le,1)),ge.setAttribute("aMag",new k(ie,1)),ge.boundingSphere=new He(new M(0,0,0),B*1.3);const dt=new Me({uniforms:{uTime:{value:0},uPixelRatio:{value:u},uOpacity:{value:1},uBright:{value:ms}},vertexShader:nr,fragmentShader:lr,transparent:!0,depthWrite:!1,depthTest:!0,blending:rt}),ye=new Tt(ge,dt);return ye.frustumCulled=!1,ye.visible=!1,o.add(ye),o.add(n),{group:n,surfaceMat:e,surface:f,glowMat:d,coronaMat:h,loopMat:Oe,starMat:dt,starBack:ye,corona:i,loops:Ie,dispose:()=>{o.remove(n),o.remove(ye),f.geometry.dispose(),a.geometry.dispose(),i.geometry.dispose(),te.dispose(),ge.dispose(),e.dispose(),d.dispose(),h.dispose(),Oe.dispose(),dt.dispose()}}}const gs=`
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
`,ur=String(cs),Xo=4,Ua=`
  // cheap value-noise hash for the turbulent flare displacement
  float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  // smooth 3D value noise (for the red-giant granulation / convection)
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=h31(i+vec3(0,0,0)), n100=h31(i+vec3(1,0,0));
    float n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1));
    float n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float s=0.0, a=0.5;
    for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; }
    return s;
  }
  vec3 hash33(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453);
  }
  // 3D cellular noise → returns F1 (nearest feature distance) and F2 in .xy.
  // Used for solar granulation: bright granule centres, dark intergranular lanes.
  vec2 cellular(vec3 p){
    vec3 ip = floor(p), fp = fract(p);
    float f1 = 1e9, f2 = 1e9;
    for(int k=-1;k<=1;k++)
    for(int j=-1;j<=1;j++)
    for(int i=-1;i<=1;i++){
      vec3 g = vec3(float(i),float(j),float(k));
      vec3 o = hash33(ip+g);
      vec3 r = g + o - fp;
      float d = dot(r,r);
      if(d < f1){ f2 = f1; f1 = d; }
      else if(d < f2){ f2 = d; }
    }
    return vec2(sqrt(f1), sqrt(f2));
  }
  // domain-warped fbm — the swirly inter-granular turbulence (IQ warp)
  float warpFbm(vec3 p){
    vec3 q = vec3(fbm(p), fbm(p+vec3(5.2,1.3,2.8)), fbm(p+vec3(1.7,9.2,3.4)));
    return fbm(p + 3.0*q);
  }
`,vs=`
  // --- Ashima 3D simplex noise + fbm (the photosphere recipe ported verbatim
  //     from the standalone Sun render) -----------------------------------
  vec3 sMod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 sMod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 sPermute(vec4 x){return sMod289(((x*34.0)+1.0)*x);}
  vec4 sTaylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
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
    i = sMod289(i);
    vec4 p = sPermute( sPermute( sPermute(
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
    vec3 sp0 = vec3(a0.xy, h.x);
    vec3 sp1 = vec3(a0.zw, h.y);
    vec3 sp2 = vec3(a1.xy, h.z);
    vec3 sp3 = vec3(a1.zw, h.w);
    vec4 norm = sTaylorInvSqrt(vec4(dot(sp0,sp0), dot(sp1,sp1), dot(sp2,sp2), dot(sp3,sp3)));
    sp0 *= norm.x; sp1 *= norm.y; sp2 *= norm.z; sp3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0 * dot(m*m, vec4(dot(sp0,x0), dot(sp1,x1), dot(sp2,x2), dot(sp3,x3)));
  }
  float sfbm(vec3 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<6;i++){ v += a*snoise(p); p*=2.02; a*=0.5; }
    return v;
  }
`,bs=`
  // -- multi-scale granulation (Voronoi cells + warped fbm + supergranules) --
  float granField(vec3 sphere, vec3 churn, float granScale){
    vec2 cell = cellular(sphere*granScale + churn);
    float granCells = 1.0 - smoothstep(0.0, 0.5, cell.x);    // bright granule centres
    float edge      = cell.y - cell.x;                       // ~0 on cell boundary
    float laneDark  = 1.0 - smoothstep(0.0, 0.06, edge);     // dark intergranular lane
    float turb = warpFbm(sphere*granScale*0.5 + churn*1.3);  // swirly mottle
    float supergran = fbm(sphere*2.4 + churn*0.5);           // broad bright/dark regions
    // higher-contrast mix: bright cells, deep dark lanes between them
    float gran = clamp(0.55*granCells + 0.4*turb + 0.12, 0.0, 1.0);
    gran = mix(gran, gran*gran*1.4, 0.5);                    // crush toward contrast
    gran *= mix(0.72, 1.28, supergran);                      // supergranule modulation
    gran *= (1.0 - laneDark*0.7);                            // carve the dark lanes
    gran = clamp(gran, 0.0, 1.3);
    return gran;
  }
  // -- collapse eating-front threshold, pure-direction part (no time, no seed) --
  // fil (fine fringe) + the coarse ragged lobes, composed in the ORIGINAL addition
  // order; the per-grain jitter term stays in the vertex shader (it is per-particle,
  // not a function of direction, so it cannot be baked).
  float granRaggedBase(vec3 dir){
    float fil = fbm(dir*7.5 + 4.0);                          // fine fringe detail
    return fbm(dir*2.3 + 11.0)                               // coarse ragged lobes
         + (fil - 0.5)*0.30;                                 // fine fringe detail
  }
  // -- red-giant photosphere mottle (the ported standalone-Sun recipe) ---------
  // The domain-warped sfbm field (big gold cells / veins / sunspots) moved
  // VERBATIM from the vertex shader's sunOn branch. Returns vec2(m, dark) —
  // vSunM and vSunDark. On the RED GIANT tt is zeroed (the rotation-lock, same
  // as churn above), so this too is a pure rigid function of the spun sphere —
  // baked into the cubemap's .g/.b with tt = 0. The yellow-sun path (dormant on
  // the point cloud) keeps its live tt boil through the analytic call.
  vec2 granPhotoField(vec3 sphere, float tt){
    // === (A) photosphere field ==========================================
    // Big swirling convection cells (the reference's flowing mottle), NOT
    // high-frequency sand. A LOW base frequency with heavy IQ domain-warp
    // makes large gold cells; deep dark filamentary veins are carved between
    // them so the surface reads bold and structured, not pale and grainy.
    vec3 sp = sphere * 1.25;                           // big cells
    vec3 q2 = vec3(
      sfbm(sp + vec3(0.0,0.0,tt)),
      sfbm(sp + vec3(5.2,1.3,2.7) + tt),
      sfbm(sp + vec3(1.7,9.2,3.4) - tt)
    );
    // two-level warp = swirly, flowing currents
    vec3 q3 = vec3(
      sfbm(sp + 3.0*q2 + vec3(1.7,9.2,3.4)),
      sfbm(sp + 3.0*q2 + vec3(8.3,2.8,4.1)),
      sfbm(sp + 3.0*q2 + vec3(2.6,6.3,7.9))
    );
    float nn = sfbm(sp + 4.5*q3 + tt*0.5);
    float m = clamp(nn*0.5 + 0.5, 0.0, 1.0);
    m = pow(m, 0.62);                                  // brighten cell cores hard
    // medium mottle riding on the big cells (keeps it from looking flat)
    float gran2 = sfbm(sp*2.6 + tt*0.8)*0.5 + 0.5;
    m *= 0.74 + 0.40*gran2;
    // deep dark filamentary VEINS between the cells (the carved orange look)
    float vein = warpFbm(sphere*2.0 + q3 + tt*0.3);    // reuse cheap warp fbm
    float veins = smoothstep(0.58, 0.40, vein);        // network of lanes
    // sunspots: broad low-freq cool patches
    float spotF = sfbm(sphere*1.1 + 11.0);
    float spot  = smoothstep(0.44, 0.30, spotF);
    float dark  = clamp(veins*0.9 + spot*0.95, 0.0, 1.0);
    m *= 1.0 - 0.82*dark;                              // carve veins/spots DEEP
    m = clamp(m, 0.0, 1.0);
    return vec2(m, dark);
  }
`,ws=`
  // -- supernova blast shaping fields: four pure-direction fbm channels --------
  vec4 blastField(vec3 d){
    return vec4(
      fbm(d*2.2 + 11.0),   // lane  (finger-jet selector, raw)
      fbm(d*6.0 +  4.0),   // fil   (fine filament octave)
      fbm(d*1.6 + 23.0),   // crushBias (lopsided-implosion lobe, raw)
      fbm(d*1.3 + 31.0)    // spdLobe (smooth spatial speed field, raw)
    );
  }
`,pr=.001,fr=`
  // --- CLICK ERUPTIONS on the particle red giant (geyser jet + surface ripple) ---
  // N_ERUPT must equal DISK_ERUPT_SLOTS (and matches the mesh's N_ERUPT). ERUPT_LIFE
  // is the total lifetime of one eruption in seconds — the jet rises+falls and the
  // ripple expands+fades over this span; the render loop frees the slot at the same
  // age. Both values are byte-identical to the yellow-star mesh (sun.glsl.ts) so the
  // two bodies erupt with the same timing/feel.
  #define N_ERUPT 4
  #define ERUPT_LIFE 2.4
  // GIANT_ERUPT_LIFE: the PARTICLE red giant's geyser runs on its OWN, much longer
  // clock than the shared 2.4 (which still governs the yellow-star MESH). The user
  // wants the giant plume to "feel the gravity" — a slow ballistic loft, a long hang
  // near the apex, then an accelerating fall — so the whole event is stretched to
  // ~2.3× the old life (5.5s vs 2.4s). MUST stay numerically identical to the JS
  // GIANT_ERUPT_LIFE in createScene.ts: the render loop frees the giant slot (and
  // wraps the debug clock) at this same age, so if the two drift the slot would die
  // (intensity→0) BEFORE the shader finished animating and the plume would vanish
  // mid-flight. The yellow-star MESH keeps ERUPT_LIFE=2.4 — untouched by this.
  #define GIANT_ERUPT_LIFE 5.5
  attribute float aU;
  attribute float aPhase;
  attribute float aThickN;
  attribute float aSeed;
  // per-particle texel UV into the GPGPU sim position texture (nebula↔star window)
  attribute vec2 aSimUV;

  uniform float uTime, uOmega0, uSpinDir, uBetaScale, uBeamExp, uDoppler;
  uniform float uRin, uRout, uThick, uPixelRatio, uSec, uHole, uVertAsym, uHorizAsym, uDistrib;
  uniform float uBright;
  // Low-tier grain-SIZE multiplier (1.0 = high/desktop-full → byte-identical; >1.0
  // ONLY when the JS built the rig with the reduced low-tier grain budget). Fattens
  // every grain so the thinned, un-bloomed low-tier cloud overlaps back into
  // continuous gas instead of scattered dots. Folded into baseSize below so it reaches
  // every point-size branch, and into the per-branch clamp ceilings so it isn't capped.
  uniform float uPointGain;
  // Runtime density-by-banishment: the retained seed fraction. 1.0 retains the
  // whole construction-time buffer; lower values clip a deterministic subset
  // before rasterisation, with no buffer resize, draw-call change or recompilation.
  uniform float uVisibleRatio;
  uniform float uVisibleBrightGain;
  // Black-hole-only geometric shrink (1 = full disk, →small as the hole implodes).
  // Gated to uGiant==0 in the body so the red giant and later states are untouched.
  uniform float uBlackHoleScale;
  // Half-res particle pass (buildParticlePass): the ratio of the offscreen target's
  // resolution to the composer's (1.0 = the original full-res single pass, exact
  // no-op). gl_PointSize is in RENDER-TARGET pixels, so on a scaled-down target the
  // same size would cover 1/uSizeScale× the intended SCREEN footprint (≈4× the
  // energy at 0.5 after the bilinear upsample). The block at the end of main()
  // rescales the final point size — and, for sprites that hit the 1px raster floor,
  // conserves their total added light via vSizeComp (the fragment folds it into the
  // final intensity), so the composited half-res field carries the SAME energy the
  // full-res raster would have produced, just resolved on a coarser grid.
  uniform float uSizeScale;
  varying float vSizeComp;
  // secondary-image (lower band) screen-space nudge — used to close the seam
  uniform float uSecOffsetX, uSecOffsetY;
  // --- Transition 1: reverse supernova (driven by scroll). 0 = black hole.
  //   uMorph ∈ [0,1]: implosion (0→0.45), flash (~0.5), flare-out (0.55→1).
  //   uFlash is a precomputed 0..1 burst envelope peaking at the flash.
  //   uCollapse ∈ [0,1]: the red-giant SURFACE collapse. 0 = full red-giant
  //     sphere; 1 = the surface has shrunk to the point (the flash/seed). The
  //     non-homogeneous shrink of the sphere IS the explosion — laggard regions
  //     of the surface stick out as the finger-spikes (see the giant block). ---
  uniform float uMorph, uFlash, uCollapse;

  ${gs}

  ${Ua}
  ${vs}
  ${bs}
  ${ws}

  // nebula placement — SHARED VERBATIM with the GPGPU collapse sim's seed pass
  // (gravitySim.ts) so the sim starts looking exactly like the analytic nebula.
  // Depends on h31()/fbm() declared above.
  ${us}

  uniform float uGiant;     // 0 = remnant, 1 = sun (transition 2)
  uniform float uGiantR;    // sun radius in world units
  uniform vec3  uGiantCenter; // dev: world-space offset of the red-giant orb (debug slider)
  uniform float uGiantSpin;   // red-giant axial spin angle (radians; t * rate, tilted-axis)
  uniform float uGiantScale;  // red-giant-ONLY radius multiplier (nebula/dot/sun unaffected)
  uniform float uGranScale;     // granulation cell frequency across the surface
  // --- baked red-giant granulation (see scene/buildGranBake.ts) --------------
  // On the red giant the granulation is a PURE RIGID function of the spun sphere
  // (churn is zeroed by the rotation-lock), so it is baked ONCE into this cubemap
  // at boot (under the loader) and sampled with the spun direction — replacing the
  // per-vertex-per-frame cellular(27-cell hash loop) + warpFbm(16 noise evals) +
  // fbm + the ~54-simplex photosphere mottle with ONE texture fetch. Channels:
  //   .r = granField(dir)            .g/.b = granPhotoField(dir) → vSunM/vSunDark
  //   .a = granRaggedBase(dir) (the collapse eating-front's pure-direction part)
  //   uGranBakeReady stays 0 until the bake completes (or forever, if it fails or
  //   is kill-switched via ?rgbake=0 / low tier) → the analytic path below runs,
  //   which is today's exact rendering. Other consumers of the analytic block
  //   (nebula boil / explosion turbulence, which use non-zero churn and need full
  //   time-evolution) NEVER take the baked path: the gate requires rgActive.
  uniform samplerCube uGranTex;
  uniform float uGranBakeReady;
  // --- baked supernova blast fields (see scene/buildBlastBake.ts) ------------
  // The collapse-flash blast branch's four pure-direction fbm fields (lane / fil
  // / crushBias / spdLobe — see BLAST_FIELD_GLSL above), baked once into a
  // cubemap off the critical path (idle-time after first composited frame, in
  // scheduleGpuWarm) and fetched with ONE texture read per vertex. uBlastBakeReady
  // stays 0 until the bake succeeds (or forever under ?blastbake=0 / no WebGL2 /
  // a failed bake) → the analytic blastField() below runs: today's exact shader.
  uniform samplerCube uBlastTex;
  uniform float uBlastBakeReady;

  // --- CLICK ERUPTIONS (geyser jet + travelling surface ripple) --------------
  // Up to N_ERUPT concurrent click eruptions on the PARTICLE red giant, mirroring
  // the mesh's uErupt/uEruptAge (sun.glsl.ts) — but here the effect is a VERTEX
  // displacement (the giant is a point cloud, so points physically jet OUTWARD and
  // ripple) plus a fragment glow, not the mesh's fragment-only recolour.
  //   uErupt[i].xyz = the eruption-centre unit direction on the sphere, captured at
  //     click in the giant's UNSPUN local frame (see the JS unspin in createScene).
  //     We compare it against the particle's UNSPUN 'sphere' dir, so the spin is
  //     cancelled consistently and the bump rides the rotating photosphere.
  //   uErupt[i].w   = intensity 0..1 (click-hold scaled: tap≈0.25 → ~1.5s hold = 1);
  //     w == 0 means the slot is idle and contributes nothing.
  //   uEruptAge[i]  = seconds since the eruption fired; the jet envelope + ripple
  //     radius advance with it and the whole event ends by GIANT_ERUPT_LIFE (the giant's
  //     own longer life — the mesh's ERUPT_LIFE=2.4 governs the yellow star only).
  uniform vec4 uErupt[N_ERUPT];
  uniform float uEruptAge[N_ERUPT];

  // Rodrigues axis-angle rotation: spin a vector v about a (unit) axis by 'ang'.
  // Used to roll the whole red-giant photosphere around its own tilted pole.
  vec3 rotateAxis(vec3 v, vec3 axis, float ang){
    float c = cos(ang), s = sin(ang);
    return v*c + cross(axis, v)*s + axis*dot(axis, v)*(1.0 - c);
  }
  // --- Later lifecycle transitions, each scroll-driven 0..1 (declared so the
  //     timeline can drive them; the shader body morphs the star onward).
  //       uYellow: red giant  -> yellow (sun-like) star
  //       uNebula: yellow star -> nebula
  //       uDot:    nebula      -> pale blue dot
  uniform float uYellow, uNebula, uDot;
  uniform float uNebulaGrow; // 0 = pale-blue point, 1 = full nebula volume
  // nebula light model strength (0 = flat self-emission, 1 = full ambient+depth+occlusion)
  uniform float uNebLight;
  // --- yellow star → red giant flash-swap channels (point-cloud only) ---
  //   uYrMix : 0 = smooth gold sphere (just after the swap), 1 = granular red giant
  //   uYrGrow: 0 = yellow radius (×0.35), 1 = red-giant radius (×1.0)
  uniform float uYrMix, uYrGrow;
  // --- GPGPU gravitational collapse (nebula → yellow star) ---
  // The collapse is BAKED to a flipbook at load (see gravitySim.bake): the real
  // sim runs once, snapshotting K frames into GPU textures. At scroll time we sample
  // the TWO snapshots bracketing the scroll position and blend them — so the collapse
  // is a PURE FUNCTION of scroll (perfectly scrubbable both ways, no per-frame physics,
  // no reseed/replay snap-back).
  //   uSimPos  : snapshot A (xyz = world pos, w = life). Sampled at aSimUV.
  //   uSimPosB : snapshot B — the next baked frame after A.
  //   uSimMix  : 0 → fully A, 1 → fully B (the inter-snapshot blend factor).
  //   uSimBlend: 0 = analytic placement, 1 = fully sim-driven. Ramps in over 3.5→3.4.
  uniform sampler2D uSimPos;
  uniform sampler2D uSimPosB;
  uniform float uSimMix;
  uniform float uSimBlend;

  varying float vBright;
  varying float vSeed;
  varying float vGiant;  // 0 = ember ramp, 1 = sun warm ramp
  varying float vHeat;   // temperature proxy → fragment colour ramp
  varying float vExplode;// explosion heat proxy → blue-white→amber→red ramp
  varying float vPlaceholder; // REVIEW: 0 none, 2 nebula, 3 dot
  varying float vNeb;    // nebula emission field → colour palette (0 teal OIII → 1 rust SII)
  varying float vNebLane;// nebula lane: 0 = diffuse haze, 1 = filament strand
  varying float vNebLight;// nebula depth/occlusion brightness factor (ambient+depth light model)
  varying float vNebGrow;// dot→nebula linear growth factor
  // --- yellow (sun) state channels, ported from the standalone Sun render ---
  varying float vSunM;    // warm photosphere noise field (0..1) → colour ramp
  varying float vSunLimb; // limb factor (0 centre → 1 rim) → bright limb glow
  varying float vSunDark; // sunspot/chromosphere darkening (0..1)
  varying float vSunFlare;// 0 photosphere, 1 coronal loop / prominence, 2 footpoint knot
  varying float vSunHot;  // 0..1 white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette
  varying float vYrMix;   // 0 = smooth gold cloud sphere, 1 = granular red giant
  varying float vSimLife; // GPGPU collapse: 1 = free gas, →0 as it accretes onto the star
  varying float vEaten;   // core-swallow progress (0 = on surface, 1 = fallen to the core)
  varying float vEruptGlow; // click-eruption heat (jet root + ripple crest) → fragment brighten

  void main(){
    vPlaceholder = 0.0; // REVIEW placeholder tag (set in the giant/placeholder block)
    vEruptGlow = 0.0;   // no eruption by default (set in the red-giant sun branch)
    vSimLife = 1.0;     // default: free gas (no-op outside the collapse window)
    vSunM = 0.0; vSunLimb = 0.0; vSunDark = 0.0; // sun-photosphere channels (set below)
    vSunFlare = 0.0; vSunHot = 0.0;             // sun atmosphere channels
    vSunRed = 0.0;                              // 0 gold (yellow), 1 red giant
    vYrMix = 1.0;                               // default: granular red giant (no-op)
    vNeb = 0.0;                                 // nebula emission/colour field
    vNebLane = 0.0;                             // nebula lane (0 diffuse, 1 filament)
    vNebLight = 1.0;                            // nebula light factor (1 = full bright; no-op off-nebula)
    vNebGrow = 1.0;                             // dot→nebula growth (1 outside transition)
    vEaten = 0.0;                               // core-swallow progress (set in the collapse block)
    vSizeComp = 1.0;                            // half-res energy compensation (1 = full-res no-op;
                                                // initialised before the early returns so it is
                                                // never an undefined varying)

    // Density dial: banish the deterministic tail of the seed distribution before
    // any of the lifecycle/noise work. A clipped point has zero fragments; ratio 1
    // is an exact retain-all condition because fract() is always strictly below 1.
    if(fract(aSeed * 99.0) >= uVisibleRatio){
      gl_Position  = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vBright = 0.0;
      return;
    }

    // === EARLY CULL #1: the whole SECONDARY image, off the black hole ==========
    // PERF, pixel-identical. The disk is drawn TWICE (buildDisk.ts): a PRIMARY pass
    // (uImageSign=+1, the only normally-visible image) and a SECONDARY (lensed) pass
    // (uImageSign=-1). Far below (line ~1104) the secondary branch already does
    //     if(uMorph > 0.25 || uGiant > 0.0) drop = true;
    // i.e. the ENTIRE secondary image is dropped (bright=0, gl_PointSize=0 → zero
    // pixels) for every state past the resting black hole — nebula, yellow star,
    // red giant, supernova and pale-blue-dot all satisfy uGiant>0 (and the dot/nebula
    // also push uMorph). That 'drop' decision there depends ONLY on the uniforms
    // uImageSign / uMorph / uGiant, which are CHEAP and already known here at the top
    // of main(). So we hoist EXACTLY that same condition and bail BEFORE paying for
    // the reverse-supernova noise block + the giant/sun/nebula morph + the trailing
    // lighting block — work whose result the existing code throws away anyway.
    //
    // Pixel-identical because: for these particles the unmodified shader emits
    // gl_PointSize=0 (no rasterised fragments) — they contribute ZERO pixels today.
    // We reproduce that exact visible result: gl_PointSize=0 and an off-clip
    // gl_Position (w>0, |x|,|y|,|z| > w → outside the clip volume → fully clipped),
    // so the rasteriser draws nothing, identical to size-0. The condition is the SAME
    // boolean as line ~1104, so we never cull a secondary particle the original keeps.
    // At the resting black hole (uMorph<=0.25 AND uGiant==0) this is FALSE → the
    // secondary lensed image still renders through the full path, byte-for-byte.
    if(uImageSign < 0.0 && (uMorph > 0.25 || uGiant > 0.0)){
      gl_Position  = vec4(2.0, 2.0, 2.0, 1.0); // outside clip volume → fully clipped
      gl_PointSize = 0.0;
      vBright = 0.0;                            // match the dropped-particle output
      return;
    }

    // radius from the parameter — adjustable radial distribution (uDistrib)
    float r0 = uRin + (uRout-uRin) * pow(aU, uDistrib);
    float r = r0;
    float thick = aThickN * uThick * (0.5 + r/uRout);

    // === Reverse-supernova morph (cinematic shock-breakout) =================
    // Run a real shock-breakout backwards-then-forwards in three beats:
    //   1. IMPLODE (uMorph 0→0.42): the disk accelerates inward — faster and
    //      faster (cubic ease-in) — collapsing into a tight, spun-up hot ball.
    //   2. FLASH (~0.46–0.54): peak compression detonates (uFlash burst).
    //   3. BLAST (0.46→1): every particle is flung straight OUTWARD along its
    //      own radial ray — absorption inverted. A low-frequency angular field
    //      makes whole sectors punch further → finger-like plasma jets, and a
    //      thin shock shell (computed in the lighting block) races out ahead.
    float implode = smoothstep(0.0, 0.42, uMorph);  // 0→1 fall-in
    float flare   = smoothstep(0.46, 1.0, uMorph);  // 0→1 blast-out (gap = flash)

    // -- deterministic 3D radial blast direction ----------------------------
    // A STABLE outward unit vector per particle, built from the SAME area-even
    // spherical mapping the red-giant gather uses (aSeed→cosθ, aPhase+aU→azimuth)
    // so the ejecta fills a full 3D sphere (a normalize(pos) blast would stay in
    // the flat disk plane) AND lands exactly where the star will later gather it.
    // Reusing aPhase as azimuth keeps angular identity → coherent rays, not fog.
    float bu   = aSeed*2.0 - 1.0;                   // cos(theta)
    float bth  = aPhase + aU*6.2831;                // azimuth
    float bsp  = sqrt(max(0.0, 1.0 - bu*bu));
    vec3 blastDir = vec3(bsp*cos(bth), bu, bsp*sin(bth));

    // -- finger-like plasma jets --------------------------------------------
    // A LOW-frequency field over the blast direction picks lanes that shoot
    // further than the bulk (Rayleigh–Taylor fingers); a finer octave adds
    // sub-filaments. Everything that shapes the blast is sampled from CONTINUOUS
    // fields over the (spatial) blastDir — no per-particle aSeed term — so
    // neighbouring particles (nearby blastDir) get nearly-identical reach/velocity
    // and travel together as coherent sheets & filaments rather than as independent
    // grains.
    // ITEM 3: REDUCE the symmetric radial-RAY look so the reverse-collapse doesn't
    // read as a generic outward sunburst. The lane spikes are SOFTENED (smoothstep
    // window widened 0.28-0.90 -> 0.40-0.95, exponent 2.2 -> 1.5 = less peaky) and the
    // jet reach contrast pulled down (2.6 -> 1.4, void floor lifted 0.40 -> 0.55) so the
    // ejecta reads as a brief compressed flash that gathers inward, not a spray of rays.
    // BAKED-vs-ANALYTIC gate (the buildGranBake precedent): the four shaping
    // fields below are pure functions of blastDir, baked once into uBlastTex
    // (scene/buildBlastBake.ts). One fetch replaces four fbm evaluations (16
    // value-noise calls) per vertex per frame during the blast. The analytic
    // blastField() call is the byte-identical fallback until the bake lands.
    vec4 blastF;
    if(uBlastBakeReady > 0.5){
      // texture(), not textureCube(): three's GLSL-300-es VERTEX prefix only
      // aliases texture2D (same note as the uGranTex fetch below). Vertex-stage
      // sampling has no derivatives → implicit lod 0, exactly the baked level.
      blastF = texture(uBlastTex, blastDir);
    } else {
      blastF = blastField(blastDir);
    }
    float lane = blastF.r;
    lane = pow(smoothstep(0.40, 0.95, lane), 1.5);  // softer, less-spiky fingers
    float fil  = blastF.g;
    float jet  = 0.55 + 1.4*lane + 0.30*fil;        // ~0.55 (void) .. ~2.25 (mild spike)
    // filament brightness from the STABLE lane field (no uTime / post-pos), so
    // bright wisps hold still as the remnant expands. High contrast: the rays
    // glow, the voids between them stay dark → the radial structure reads.
    float clump = clamp(0.05 + 1.5*lane + 0.35*fil, 0.0, 2.0);

    // -- implosion: collapse the whole black hole into a TINY dense seed -------
    // The black hole physically SHRINKS to a small, dense point (the "seed black
    // hole") before it reverse-explodes. coreR starts as a loose ball and is then
    // crushed down hard as the morph nears the flash — so the matter visibly
    // contracts to a tiny core. A modest per-particle spread is kept (and the
    // camera pushes IN, see the frame loop) so the seed reads without whiteout.
    float implodeE = implode*implode*implode;       // cubic ease-IN (speeds up)
    // seedShrink: 1 early in the implosion → ~0.03 right before the flash, so the
    // ball collapses from ~rIn-scale down to a TRUE speck. The camera also pulls
    // WAY back at the seed (see the zoom story in frame()), so the combination
    // reads as a tiny point in a vast dark field next to the huge hero black hole.
    // ORGANIC crush: one side collapses into the seed slightly AHEAD of the other
    // (low-freq lobe over the stable blast direction → no flicker), so the implosion
    // is lopsided, not a perfect uniform shrink. Endpoints stay pinned (1 early, 0.03
    // by the blast) so the hero and the blast structure are unchanged.
    float crushBias = clamp(blastF.b*2.0 - 1.0, -1.0, 1.0);
    float crushLo = clamp(0.14 - 0.10*crushBias, 0.0, 0.30);
    float crushHi = clamp(0.46 - 0.10*crushBias, 0.34, 0.60);
    float seedShrink = mix(1.0, 0.03, smoothstep(crushLo, crushHi, uMorph));
    float coreR    = uRin * (0.7 + 1.1*aU) * seedShrink;  // shrinks to a tiny seed
    float rImplode = mix(r0, coreR, implodeE);

    // -- blast: radius flung outward from the small seed, fast leading edge ----
    // The ejecta is BIG: a sprawling remnant of rays and sheets, not a contained
    // fireball. The camera pulls WAY back across the blast (see the zoom story in
    // frame()), so the cloud can fill far more world-space and still sit inside the
    // frame. The reach magnitude is a CONTINUOUS field over blastDir (a smooth
    // low-frequency speed lobe × the jet lanes) — NOT a per-particle aSeed term —
    // so neighbouring particles share a velocity and the cloud expands as coherent
    // membranes & filaments. Bulk lands ~0.4–0.7 rOut; the fastest jets spike past
    // rOut into long spikes.
    float spdLobe = 0.78 + 0.55*blastF.a;  // smooth spatial speed field (baked channel)
    float speed   = uRout * 0.42 * spdLobe * jet;          // neighbour-coherent reach
    float reach   = pow(flare, 0.55);                      // fast launch, easing
    // LIVING blast: the ejecta isn't frozen at a held scroll position — it slowly
    // BREATHES in and out over time so the remnant reads as turbulent plasma, not a
    // static frame. The pulse phase comes from blastDir (a smooth spatial field), so
    // whole lobes swell and ebb TOGETHER (neighbour-coherent) — sheets billowing,
    // not per-grain shimmer. Two octaves: a slow global heave + a faster regional
    // ripple. Gated by flare so it only animates once the blast has launched (the
    // hero black hole and the seed stay perfectly still).
    float pulsePhase = fbm(blastDir*1.7 + 5.0) * 6.2831;       // spatial phase per lobe
    float breathe = 0.16 * sin(uTime*0.55 + pulsePhase)        // slow heave (±16%)
                  + 0.07 * sin(uTime*1.30 + pulsePhase*2.3);   // faster regional ripple
    reach *= 1.0 + breathe * flare;                           // grow/shrink over time
    float ejectaR = coreR + speed * reach;

    // Hand the imploding radius off to the ejecta radius over a SHORT smooth band
    // around the breakout (0.44–0.50) instead of a hard step at 0.46, so the debris
    // doesn't snap from "collapsed seed" to "radial blast" in a single frame — it
    // transitions continuously, reading as one physical event (matter compresses,
    // detonates, then the remnant settles) rather than a scene cut.
    r = mix(rImplode, ejectaR, smoothstep(0.44, 0.50, uMorph));
    r = max(r, uRin*0.03);                          // off the singularity (true speck ok)

    // orbits spin up HARD as they fall in (angular-momentum feel, accelerating
    // into the flash) so the debris visibly WHIPS around the tiny seed — the
    // accretion read — then the flung-out cloud keeps only a slow residual tumble.
    float spinUp = mix(1.0, 5.5, implodeE) * mix(1.0, 0.30, flare);

    // Keplerian orbit (spun up during the implosion)
    float omega = uOmega0 * pow(r0, -1.5) * spinUp;
    float phi   = aPhase + uSpinDir * omega * uTime;
    float cs = cos(phi), sn = sin(phi);
    vec3 orbitPos = vec3(r*cs, thick, r*sn);        // spinning disk/implosion

    // Hand the flat spinning disk off to a 3D RADIAL form EARLY — during the
    // implosion — so by the flash the matter is already a 3D ball collapsing
    // along each particle's own blast ray (not a flat plate of overlapping dots,
    // the other half of the whiteout fix). It then continues straight out as the
    // ejecta rays emanating from the core.
    vec3 blastPos = blastDir * r;
    // Hand off to the radial blast LATER so a residual orbital swirl persists at
    // the seed — debris reads as ACCRETING around the tiny core (not a static
    // collapse) — then goes fully radial as the blast launches.
    float toRay = smoothstep(0.20, 0.52, uMorph);
    vec3 pos = mix(orbitPos, blastPos, toRay);

    // --- subtle accretion pull toward the dark seed -------------------------
    // In the seed window the dark core exerts a gentle inward tug on nearby
    // debris: radius eased inward along a slightly-spiral path (a touch of extra
    // tangential lead), strongest just outside the core and only while the seed
    // exists. This is a small GEOMETRIC nudge — not a glow — so matter reads as
    // being aspirated into the point. Vanishes by the blast (toRay→1 → pull→0),
    // and is a no-op at the hero (pullWin≈0 at uMorph=0).
    // ITEM 3: STRONGER inward PULL so the reverse-collapse reads as matter being
    // aspirated INTO the centre (we're rewinding a collapse), not an outward blast.
    // The seed window is widened (0.07 -> 0.10) and the pull strength raised (0.22 ->
    // 0.40) + the radius compression deepened (0.5 -> 0.7), so nearby debris visibly
    // gathers toward the dark core through the flash. Vanishes by the blast (toRay->1).
    float pullWin   = exp(-pow((uMorph-0.49)/0.10, 2.0));            // seed window (widened)
    float nearCore  = 1.0 - smoothstep(coreR, coreR + uRin*2.0, r);  // 1 near seed (wider reach)
    float pullAmt   = pullWin * nearCore * (1.0 - toRay) * 0.40;     // stronger inward tug
    float rPull     = r * (1.0 - 0.7*pullAmt);
    float phiPull   = phi + uSpinDir * pullAmt * 1.4;               // tangential lead
    vec3 spiralPos  = vec3(rPull*cos(phiPull), thick*(1.0-0.4*pullAmt), rPull*sin(phiPull));
    pos = mix(pos, spiralPos, pullWin);
    // strained-stream light: passed to the lighting block, where it adds light
    // ONLY on the infalling stream (∝ inward strain), never on the dark core.
    float infallGlow = pullAmt * 4.0;

    // organic billowing so the rays aren't glassy-straight. A SMOOTH transverse
    // displacement field over blastDir (three decorrelated fbm channels → a
    // curl-like vector), built ONLY from the spatial direction (no aSeed), so
    // neighbouring particles are pushed the SAME way → the ejecta folds into
    // coherent rolling sheets and lobes instead of per-grain fuzz. Scaled by the
    // distance flung out so the deformation grows organically with the expansion.
    // The sample point DRIFTS with uTime, so the sheets slowly roll and re-fold
    // over time (living turbulence) rather than holding one frozen shape — the
    // drift is a shared offset, so coherence between neighbours is preserved.
    vec3 swDrift = vec3(0.0, uTime*0.06, 0.0);
    vec3 swirl = vec3(
      fbm(blastDir*3.4 +  7.0 + swDrift),
      fbm(blastDir*3.4 + 19.0 + swDrift),
      fbm(blastDir*3.4 + 41.0 + swDrift)
    ) - 0.5;
    // project onto the plane perpendicular to the ray so it reads as sideways
    // billowing, not extra radial reach.
    swirl -= blastDir * dot(swirl, blastDir);
    pos += swirl * (r * 0.45 + uRin * 0.5) * flare;

    // Black-hole geometric shrink: contract the whole accretion-disk/seed/blast body
    // toward the origin so the HOLE reads as visibly SMALLER (not merely farther). The
    // shrink ramps in over the same window the gravitational lensing + shadow carve fade
    // out (uMorph ~0.1→0.5 below), so the FIXED screen-space shadow radii (uShadowR,
    // uHole) never fight the shrinking disk. It's a no-op past the implosion (the driver
    // returns ~1) and is irrelevant once uGiant>0 (the red-giant branch rebuilds pos).
    pos *= uBlackHoleScale;

    // === Transition 2: remnant cloud → a detailed Sun =======================
    // As uGiant goes 0→1 the scattered remnant GATHERS into a textured star.
    // The particles form the granular PHOTOSPHERE on the sphere surface.
    float heat = 0.0;       // surface temperature proxy → fragment colour ramp
    if(uGiant > 0.0){
      // stable spherical coordinate per particle (even-ish area distribution)
      float u = aSeed*2.0 - 1.0;                 // cos(theta) in [-1,1]
      float th = aPhase + aU*6.2831;             // azimuth
      float sp = sqrt(max(0.0, 1.0 - u*u));
      vec3 sphere = vec3(sp*cos(th), u, sp*sin(th));
      // UNSPUN copy of this particle's surface direction, captured BEFORE the axial
      // spin below. The click eruptions store their centre dir UNSPUN (the JS side
      // un-rotates the world hit by -uGiantSpin), so we test chord distance in this
      // unspun frame — that cancels the spin consistently with no per-eruption respin,
      // while the jet still displaces along the SPUN 'dir' so the bump rides the
      // rotating photosphere. (See the eruption block after 'pos = surf'.)
      vec3 sphereUnspun = sphere;

      // Is the DISPLAYED state the red giant? (Not yellow / nebula / dot — those keep
      // uGiant=1 but must NOT take the red-giant spin or size.) Computed here so the
      // spin + the red-giant-local radius scale share one gate.
      float rgActive = (uYellow < 0.5 && uNebula < 0.5 && uDot < 0.5) ? 1.0 : 0.0;
      // red-giant-ONLY radius multiplier (1.0 everywhere else → nebula/dot/sun keep
      // their uGiantR scale and the gravity-sim seed is untouched).
      float rgScale = mix(1.0, uGiantScale, rgActive);

      // AXIAL SPIN: roll the whole textured photosphere about its own TILTED pole
      // (≈23° from vertical, Earth-like) so the granulation rotates as one rigid
      // body — the star turns on its axis instead of the camera orbiting it. Because
      // "sphere" seeds the granulation lookup, "dir", the radius and the sun branch
      // alike, rotating it here spins the entire surface coherently. uGiantSpin is 0
      // at rest → no-op; gated to the red giant so held later states never rotate.
      if(rgActive > 0.5){
        vec3 spinAxis = normalize(vec3(0.39, 0.92, 0.0)); // ~23° tilt off vertical
        sphere = rotateAxis(sphere, spinAxis, uGiantSpin);
      }

      // -- multi-scale granulation (Voronoi cells + warped fbm + supergranules) --
      // ROTATION-LOCK: the granulation is sampled from the SPUN 'sphere' (it already
      // turns rigidly with the body via rotateAxis(uGiantSpin) above). An independent
      // +Y time-advection ('churn') used to crawl the cells across the surface in their
      // OWN drift direction, so the mottling slid against the rotation instead of turning
      // WITH it. On the RED GIANT we now KILL that drift ENTIRELY (×0.0): churn = vec3(0),
      // so the cells are a PURE RIGID function of the spun sphere — a fixed texture painted
      // on the body that rotates coherently into view with uGiantSpin, with ZERO independent
      // boil/shimmer. OTHER branches (nebula boil / explosion turbulence, which reuse this
      // default path's gran/heat) keep the FULL churn so their time-evolution is unchanged —
      // the kill is gated to rgActive only, via the red-giant-zeroed factor below.
      float churnT = uTime * 0.025 * mix(1.0, 0.0, rgActive);   // red giant → ZERO drift (rigid, fully spin-locked); else full
      vec3 churn = vec3(0.0, churnT, 0.0);
      // BAKED-vs-ANALYTIC gate. On the red giant (rgActive, where churn is exactly
      // vec3(0)) the granulation is a rigid function of the spun 'sphere', so once
      // the boot-time cubemap bake is ready we replace the whole analytic block
      // with ONE fetch of the spun direction — bake(R(t)·d) is the same rigid
      // rotation of the same pattern as granField(R(t)·d), byte-near-identical up
      // to texture resolution. Every other branch (nebula boil, explosion
      // turbulence — non-zero churn, real time-evolution) and the not-yet-baked /
      // kill-switched fallback keep the FULL analytic path: today's exact shader.
      // The fetch also carries granRaggedBase(dir) in .a for the collapse block
      // below (same spun direction, one fetch feeds both).
      float granBakeOn = (rgActive > 0.5 && uGranBakeReady > 0.5) ? 1.0 : 0.0;
      vec4 granBaked = vec4(0.0);
      float gran;
      if(granBakeOn > 0.5){
        // NOTE: texture(), not textureCube() — three compiles ShaderMaterials as
        // GLSL 300 es and its VERTEX prefix only aliases texture2D (the fragment
        // prefix aliases textureCube, but this is the vertex stage). Vertex-stage
        // sampling has no derivatives → implicit lod 0, exactly the baked level.
        granBaked = texture(uGranTex, sphere);
        gran = granBaked.r;
      } else {
        gran = granField(sphere, churn, uGranScale);
      }
      heat = gran;

      // giant radius with a little granular relief so the limb isn't a perfect
      // circle (bumpy photosphere)
      float relief = 1.0 + 0.025*(gran - 0.6);
      float giantR = uGiantR * relief * rgScale;  // rgScale = red-giant-only inflate
      vec3 giantPos = sphere * giantR;

      // ================= UNIFIED NON-HOMOGENEOUS SURFACE COLLAPSE ============
      // THE explosion. There is no separate radial blast — the spiky "explosion"
      // IS this red-giant surface caving in unevenly. Each patch of the sphere
      // collapses inward at its OWN rate; the laggard patches stay near full radius
      // (and extend PAST it) while their neighbours shrink, so they read as long
      // radial finger-spikes streaming off a churning core (ref Image-3). It is
      // always ONE connected surface — never a big shell + a small core at once.
      //
      // Driven by uCollapse (0 = full red-giant sphere, 1 = collapsed to the point,
      // where the legacy supernova flash fires). ALL the motion fields are fbm over
      // the spatial dir (no aSeed term), so neighbouring particles share their
      // timers → the fingers move as COHERENT groups, not per-grain shimmer.
      vec3 dir = sphere;

      // fields the ragged swallow front uses: a fine fbm octave for the fringe, and a
      // tiny per-particle jitter (aThickN + aSeed hash, 0-centred, static at uTime=0) so
      // the eating edge grains don't form a clean line. The pure-direction part
      // (granRaggedBase: the coarse lobes + fine fringe, both plain fbm over the spun
      // dir with NO time term) rides the SAME baked cubemap as the granulation (.a,
      // same gate, same spun-direction fetch — granBaked was fetched above); the
      // per-grain jitter stays analytic (it is per-particle, not a function of dir).
      float raggedDir;
      if(granBakeOn > 0.5){                      // explicit branch (not ?:) so the
        raggedDir = granBaked.a;                 // analytic fbm pair is truly skipped
      } else {                                   // on the baked path
        raggedDir = granRaggedBase(dir);
      }
      float grainJit = 0.5*aThickN + 0.5*(h31(vec3(aSeed*31.7, 3.1, aSeed*7.9)) - 0.5);

      // === CORE SWALLOW (hollowed outside-in) =============================
      // The star is devoured into its own CORE (the centre). The outer photosphere is
      // consumed first and the eating works progressively inward, hollowing the shell
      // from the OUTSIDE toward the core, until the whole star has poured into the centre.
      // Each particle falls radially from its surface point toward the origin as the
      // ragged eating front passes over it — patches go at STAGGERED, irregular times so
      // the shell tears in organically rather than deflating uniformly. The sink is the
      // ORIGIN, so collapseScale (radius) → 0 and the consumers just scale dir by it.
      //
      // per-particle eating threshold: a ragged fbm field over the surface (0..1) decides
      // WHEN each patch is taken. Coarse lobes + a fine octave + a tiny per-grain jitter
      // → an organic, irregular front (no clean shell, no per-grain shimmer). No
      // directional bias — patches all over the surface are eaten as the front sweeps.
      float ragged = raggedDir                                 // coarse lobes + fine fringe
                                                               //   (granRaggedBase: baked .a
                                                               //   or the analytic fbm pair)
                   + grainJit*0.10;                            // per-grain fray
      float thresh = clamp(ragged, 0.0, 1.0);                  // when this patch is eaten

      // SWEEP the eating front inward with uCollapse. A patch is consumed once the front
      // passes its threshold. smoothstep WIDTH (0.30) is the soft eating edge. Endpoints:
      //   uCollapse=0 → front=1.25, top=1.55; thresh≤1 < 1.25 → eaten=0 EVERYWHERE → full
      //                 sphere (pinned).
      //   uCollapse=1 → front=-0.35, top=-0.05; thresh≥0 > -0.05 → eaten=1 EVERYWHERE →
      //                 every particle at the core (the point, pinned).
      // Both extremes sit strictly outside the [0,1] thresh range → pins are EXACT.
      float front = mix(1.25, -0.35, uCollapse);              // sweeps as uCollapse 0→1
      float swallow = smoothstep(front, front + 0.30, thresh); // 0 not-yet .. 1 eaten
      // ACCELERATE the infall once a patch is taken (gravity into the core): ease-in so it
      // starts drifting then plunges toward the centre.
      float eaten = pow(swallow, 1.6);
      vEaten = eaten;   // → fragment: heat the colour red→white and dim as it falls in

      // radial fall to the CORE: collapseScale is the particle's radius fraction. eaten=0
      // → 1.0 (on the surface); eaten=1 → collapseLo (≈the core point). The consumers
      // multiply dir (or the textured surface point) by this, so the gas falls straight
      // in toward the centre. Staggered eaten → the shell hollows outside-in, raggedly.
      float collapseLo = 0.04;
      float collapseScale = mix(1.0, collapseLo, eaten);

      // tangential swirl as the gas streams into the core — a curl-like vector projected
      // perpendicular to the radial fall (⊥ dir), drifting slowly with uTime so the
      // infalling sheet folds and shears on its way in rather than sliding glassy-straight.
      // UNIT-sphere space (consumers scale by radius). Faded by eaten*(1-eaten) so it is 0
      // at the surface AND 0 once at the core (the point pins exactly).
      vec3 dr = vec3(
        fbm(dir*3.4 +  7.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 19.0 + vec3(0.0, uTime*0.05, 0.0)),
        fbm(dir*3.4 + 41.0 + vec3(0.0, uTime*0.05, 0.0))
      ) - 0.5;
      dr -= dir*dot(dr, dir);                                  // ⊥ to the radial fall
      vec3 curlOff = dr * 0.18 * (eaten*(1.0 - eaten));        // unit-space swirl

      // default position (surface-renderer-inactive fallback): the radius pulled to the
      // core by collapseScale, plus the streaming swirl, scaled to the giant radius.
      pos = (dir*collapseScale + curlOff) * giantR;

      // === REVIEW PLACEHOLDERS (no real morph) ===========================
      // Minimal stand-ins for the three new states so their slot + look can be
      // reviewed. They HARD-SWAP (uYellow/uNebula/uDot arrive as 0 or 1) and
      // reshape/retint the same particle sphere. Replace this whole block (and
      // the matching fragment tint) with the real morphs later.
      //   reuse: sphere (unit sphere coord), giantR, gran/heat, churn.
      // -- yellow (sun-like) star: the standalone Sun render, ported ---------
      // Two coupled parts (matching the reference render):
      //  (A) a high-contrast mottled PHOTOSPHERE — domain-warped simplex fbm with
      //      crushed midtones (bright gold cells / deep dark inter-granular lanes),
      //      sunspots and a fine granule octave;
      //  (B) a thin ATMOSPHERE — a stable ~12% subset of particles is lifted off
      //      the surface into coronal LOOPS (arcs that rise over the limb and fall
      //      back to a conjugate foot), radial PROMINENCE jets, and white-hot
      //      FOOTPOINT knots at the loop bases.
      // Channels to the fragment: vSunM (photosphere ramp), vSunLimb (limb glow),
      // vSunDark (network/spots), vSunFlare (1 loop/jet), vSunHot, vSunRed (palette).
      //
      // The SAME recipe drives two states by palette + radius:
      //   - red giant : uGiant alone (no later state) → big, deep red, vSunRed=1
      //   - yellow sun: uYellow → smaller, gold, vSunRed=0
      // The red giant is the DEFAULT whenever the cloud isn't explicitly yellow / nebula /
      // dot. uNebula is now held high across the WHOLE nebula→star collapse handoff — the
      // real nebula, the collapse window AND its floor crossfade band (lifecycle holds the
      // collapse geometry simBlend>0 there via inWindowGeo, so nebulaShader → uNebula stays
      // 1). So the cloud reads as converging nebula GAS through the handoff and this default
      // stays 0 there. Without that hold, the floor crossfade (where simBlend/uNebula used
      // to snap to 0 while bodyOwnership still kept the cloud briefly visible UNDER the
      // forming yellow mesh) flashed a full red giant for a few eased frames.
      float redGiant = (uYellow < 0.5 && uNebula < 0.5 && uDot < 0.5) ? 1.0 : 0.0;
      float sunOn    = (uYellow > 0.5 || redGiant > 0.5) ? 1.0 : 0.0;
      if(sunOn > 0.5){
        vPlaceholder = 1.0;
        vSunRed = redGiant;
        vYrMix = uYrMix;   // 0 = smooth gold cloud sphere (post-swap) → 1 = red giant
        // The cloud-side red-giant base radius MUST match the held sphere-identity
        // radius (line ~414: uGiantR * rgScale ≈ 9) — the old 2.35× made the cloud side
        // ~21 units, so the held sphere POPPED to >2× size the instant the YR slot took
        // over at stage 2.05. Use rgScale alone so both paths render the SAME ~9-unit
        // giant; the ×0.18 grow below then shrinks it to the true yellow size. The yellow
        // sun keeps its 0.92 (that branch is only hit when uYellow>0.5, inert here).
        float sunRadFac = (redGiant > 0.5) ? rgScale : 0.92;
        // yellow → red giant grow: at uYrGrow=0 the cloud is size-matched to the
        // yellow mesh (×YELLOW_RED_RADIUS_RATIO = SUN_RIG_RADIUS/RED_GIANT_RADIUS),
        // inflating to the full red-giant radius at uYrGrow=1. No-op (×1.0) elsewhere.
        // The factor is interpolated from transitions.ts' YELLOW_RED_RADIUS_RATIO (the
        // SAME constant createScene uses for SUN_RIG_RADIUS) → byte-identical 0.18.
        sunRadFac *= mix(${ur}, 1.0, uYrGrow);
        // ROTATION-LOCK (red giant only): the photosphere mottle 'm' is built from the
        // SPUN 'sphere'/'sp' (sp = sphere*1.25, and 'sphere' was already rolled by
        // rotateAxis(uGiantSpin) above), so it already rotates rigidly with the body. The
        // 'tt' time term used to ADVECT the fbm lookups in their own time-drift, making the
        // mottling slide across the surface instead of rotating WITH it. On the RED GIANT
        // we now ZERO 'tt' (×0.0): every fbm lookup depends ONLY on the spun 'sp', so the
        // mottle is a PURE RIGID texture that rotates with the body — ZERO independent boil.
        // The YELLOW SUN keeps its full 'tt' boil (that path is gated by redGiant<0.5, which
        // is 0 for the yellow sun → mix picks 1.0), so its look is unchanged.
        float tt = uTime * 0.05 * mix(1.0, 0.0, redGiant);   // red giant → ZERO boil (fully spin-locked); yellow sun keeps full tt

        // === (A) photosphere field ==========================================
        // The domain-warped sfbm mottle (big cells / veins / sunspots) — the
        // recipe now lives in the shared granPhotoField() (GRAN_FIELD_GLSL) so
        // the cubemap bake compiles the identical maths. On the red giant tt is
        // 0 (rotation-locked above), making the field a pure rigid function of
        // the spun sphere — so the baked .g/.b (baked with tt = 0) replace the
        // ~54 simplex evals per vertex per frame with the one cubemap fetch
        // already made in the granulation block. The dormant point-cloud yellow
        // sun (uYellow) and the fallback keep the analytic call with live tt.
        float m, dark;
        if(granBakeOn > 0.5){
          m    = granBaked.g;
          dark = granBaked.b;
        } else {
          vec2 photo = granPhotoField(sphere, tt);
          m    = photo.x;
          dark = photo.y;
        }

        vSunM    = m;
        vSunDark = dark;

        // relief flattens to a perfectly round ball at the gold start (uYrMix→0),
        // returning to the bumpy red-giant photosphere as it reddens (uYrMix→1).
        float sunRelief = 1.0 + 0.05*(m - 0.55) * uYrMix;
        // CORE SWALLOW (from the block above): collapseScale pulls each particle's
        // photosphere radius inward toward the core as the ragged eating front sweeps
        // over its patch; curlOff is the streaming swirl on the way in. At the full red
        // giant (uCollapse=0) eaten=0 → collapseScale=1, curlOff=0 → the sphere is
        // unchanged. At uCollapse=1 every patch has fallen to the core → the point.
        float sunR0 = uGiantR * sunRadFac;
        // apply the radial fall + swirl in unit space, then scale by the textured surface
        // radius (sunRelief mottle rides the surface part; it vanishes as gas reaches core).
        vec3 surf = (sphere * collapseScale * sunRelief + curlOff) * sunR0;
        pos  = surf;
        heat = m;

        // === CLICK ERUPTIONS: geyser COLUMN + travelling surface ripple =======
        // Physical VERTEX displacement (this is a point cloud, unlike the mesh's
        // fragment-only recolour). The JET is a real volcanic GEYSER: only a tiny cap
        // of grains at the vent launches, and it launches along ONE shared axis (the
        // eruption-centre normal) so the grains shoot up as a TALL, NARROW collimated
        // column that sprays off the limb — NOT a hemisphere of surface bulging out
        // along each point's own radius (which read as a rounded blister/spot). The
        // travelling RIPPLE is unchanged: a ring wave that wobbles each point along its
        // OWN radial 'sphere' dir, which is correct for a surface wave. Gated to the
        // RED GIANT (vSunRed=1) so the gold swap-in ball / yellow placeholder never
        // erupt; idle slots (w=0) are skipped, so it's a no-op until a click fires.
        // Chord distance is measured in the UNSPUN frame (sphereUnspun vs the
        // stored-unspun ed) — the spin is thereby cancelled — while the column launches
        // along edNow (ed re-spun into the CURRENT frame, exactly as the surface spins
        // 'sphere'), so the geyser sticks to the clicked spot as the limb rotates.
        // Bigger hold (intensity) → taller column reaching farther off the limb + wider/
        // stronger ripple. CONSTANTS mirror the mesh geyser feel, but the giant keeps red.
        vec3  eruptCol = vec3(0.0);  // accumulated COLUMN launch along the shared axis (× sunR0)
        float eruptRip = 0.0;        // accumulated radial ripple wobble (× sunR0, signed)
        // COL_MAX: at peak intensity the FURTHEST grains in the plume travel ~1.6×
        // radius off the vent — a TALL dramatic prominence shooting well clear of the
        // limb (raised from 0.95). The heavy-tail throw (pow(grnd,3.5) below) keeps MOST
        // grains low so the base stays dense and the column stays collimated; only the
        // sparse top grains reach this far, so it reads as a tall geyser, not a spray ball.
        const float COL_MAX = 1.6;
        for(int i = 0; i < N_ERUPT; i++){
          float inten = uErupt[i].w;
          if(inten <= 0.0) continue;                       // idle slot
          vec3  ed  = normalize(uErupt[i].xyz);            // eruption centre (UNSPUN frame)
          // edNow = the eruption axis re-spun into the CURRENT frame, the SAME way the
          // surface spins 'sphere' (rotateAxis about the ~23° tilted pole by uGiantSpin).
          // This is the column's launch direction — the geyser shoots straight up off
          // the vent along it, and it tracks the rotating limb so the plume stays glued
          // to the clicked spot. Declared locally because the surface 'spinAxis' above
          // is scoped to its own block.
          vec3 spinAxis = normalize(vec3(0.39, 0.92, 0.0)); // ~23° tilt off vertical (matches surface)
          vec3 edNow    = rotateAxis(ed, spinAxis, uGiantSpin);
          float age = uEruptAge[i];
          // GIANT life — the geyser, the ballistic envelope AND the surface ripple all
          // age on this ONE longer clock (GIANT_ERUPT_LIFE, not the shared 2.4) so the
          // WHOLE event slows coherently: a sluggish loft, a long hang, a slow ring.
          float life = clamp(age / GIANT_ERUPT_LIFE, 0.0, 1.0);
          // chord distance on the unit sphere from THIS particle (unspun) to the
          // eruption centre (unspun) — 0 at the centre, up to 2 at the antipode. The
          // ripple is a circle in this distance, so it expands as a true ring across
          // the curved surface from the click point.
          float cd = length(sphereUnspun - ed);

          // -- JET / GEYSER COLUMN: only a TIGHT cap of grains at the vent erupts.
          // 'spread' is a SMALL angular footprint so the base is a narrow vent — not a
          // hemisphere. 'core' is the Gaussian gate that selects that cap; everything
          // outside it stays put (the rest of the giant is untouched).
          // RADIUS −20%: both spread terms are the old 0.07/0.09 × 0.8 (→0.056/0.072), so
          // the vent footprint AND the Gaussian core shrink to 80% of their former width
          // → a thinner, more collimated jet of the SAME throw height (COL_MAX unchanged).
          float spread = 0.056 + 0.072 * inten;            // TIGHT vent footprint, 80% of the old width
          float core   = exp(-pow(cd / spread, 2.0));      // cap selector — narrow vent, not a dome
          // -- BALLISTIC HEIGHT ENVELOPE (gravity feel). Replaces the old symmetric
          // sin(life*PI). 'rise' is the displacement-vs-time of a grain THROWN STRAIGHT
          // UP under constant gravity: h(t) = 4·t·(1−t) is a parabola — 0 at launch,
          // peak 1.0 at the apex (life=0.5), back to 0 at landing — whose VELOCITY
          // (dh/dt = 4·(1−2t)) is LINEAR in time and exactly ZERO at the apex. That is
          // the physically-correct projectile arc: it decelerates on the way up, hangs
          // (near-zero speed) at the top, then symmetrically ACCELERATES back down — the
          // "feel the gravity" cue the user asked for, and far more honest than a sine.
          float ball  = 4.0 * life * (1.0 - life);          // ballistic parabola: 0→1@apex→0
          // HANG bias: raising the parabola to a <1 power flattens its top (broadens the
          // apex plateau) without moving launch/landing, so the plume lingers LONGER near
          // the peak — extra hang time on top of the already-long GIANT_ERUPT_LIFE — while
          // the steep launch/fall flanks stay (still ballistic, just a fatter apex).
          // Per-grain HEAVY TAIL (declared before 'rise' so the apex-hang can use it):
          // pow(rand, 3.5) keeps MOST grains low (the dense glowing base of the fountain)
          // while a few fly far (the sparse arcing embers off the limb). aSeed/aU give
          // each grain a stable, distinct throw so the plume reads as discrete spraying
          // particles, not a solid spike.
          float grnd   = fract(aSeed*1.7 + aU*2.3);        // stable per-grain [0,1)
          float tail    = pow(grnd, 3.5);                  // heavy-tailed: most low, few high
          // PER-GRAIN apex hang: the highest-flying grains (large 'tail') get a SMALLER
          // exponent → a flatter, broader apex → they hang longest at the top, reinforcing
          // the gravity arc (the far embers loiter near the peak while the base grains have
          // already fallen). Base 0.7 (broad hang) eases to ~0.55 for the top grains; all
          // values <1 so every grain stays ballistic (0→1@apex→0), only the hang width
          // varies. ball is the projectile parabola from above.
          float rise   = pow(ball, mix(0.7, 0.55, tail));   // ballistic loft, far grains hang longest
          float height  = COL_MAX * inten * core * rise * (0.18 + 0.82 * tail);
          // Launch the cap MOSTLY along the shared column axis edNow (the collimated
          // up-shot), with a SMALL fraction along each grain's own radius so the very
          // base fans out a touch (a fountain mouth, not a pencil line). The dominant
          // term is edNow → a tall narrow column, the opposite of a radial bulge.
          eruptCol += height * (0.85 * edNow + 0.15 * sphere);
          // Tiny lateral jitter near the top so high-flying grains scatter sideways into
          // a spray/arc instead of a clean spike. hash33 gives a stable per-grain offset;
          // scaled by tail so only the far grains drift (the base stays collimated).
          // RADIUS −20%: top-spray amplitude is the old 0.18 × 0.8 (→0.144), shrinking the
          // column's lateral spread in proportion to the −20% vent width so the WHOLE jet
          // is uniformly narrower (same height — COL_MAX untouched).
          vec3 jit = (hash33(vec3(aSeed*31.0, aU*17.0, aPhase*7.0)) * 2.0 - 1.0);
          eruptCol += jit * (height * tail * 0.144);

          // -- RIPPLE: a LOCAL expanding ring wave in chord distance. It reads as a SHORT
          // disturbance rippling out a modest distance from the geyser BASE and dying —
          // NOT a giant ring crossing the whole limb. reach is now ~HALVED (≈0.22 tap →
          // ≈0.67 full hold, vs the old 0.45→1.60) so even a full hold's crest only travels
          // a small cap around the click and never sweeps over a neighbouring vent (which
          // used to let one eruption's ring visually wash over another's — see #2). radius
          // marches outward with life; a TIGHT Gaussian crest gives the bright travelling
          // leading edge; it fades over the life and is damped as it nears the (now near)
          // travel limit so the ring dies LOCALLY instead of popping off the silhouette.
          float reach   = 0.22 + 0.45 * inten;             // LOCAL ring-travel cap (chord units) — ~half the old reach
          float radius  = reach * life;                    // ring radius marches outward with age
          float width   = 0.09 + 0.13 * inten;             // TIGHT crest — a narrow local ring, not a broad swell
          float off     = cd - radius;
          float crest   = exp(-pow(off / width, 2.0));     // bright travelling crest
          float ripFade = (1.0 - life) * (1.0 - smoothstep(reach*0.7, reach, cd));
          float ripple  = crest * ripFade * inten;
          // a few % of the radius of radial wobble so the surface visibly ripples as the
          // wave passes (signed: the crest lifts the surface).
          eruptRip += ripple * 0.06;

          // accumulate the fragment glow: hot at the column root, warm on the ripple
          // crest. (height already encodes the per-grain tail, so far grains glow as the
          // plume.) Clamped per-slot contribution; the total is clamped after the loop.
          vEruptGlow += clamp(height*4.0 + ripple*1.2, 0.0, 2.0);
        }
        vEruptGlow = clamp(vEruptGlow, 0.0, 2.0);
        // apply the column launch (along the shared spun axis, in WORLD/unit dir) and the
        // radial ripple wobble (along this point's own SPUN 'sphere' dir, a true surface
        // wave). Both scaled to the giant's radius. The column is tall+narrow (a geyser),
        // the ripple is a shallow travelling ring — the spot/blister bulge is gone.
        pos += eruptCol * sunR0;
        pos += sphere * (eruptRip * sunR0);

        // === (B) atmosphere: loops / prominences / spicules =================
        // Pick a stable subset for the atmosphere using per-particle hashes (no
        // uTime → identity is fixed, so a loop stays a loop frame to frame). The
        // red giant is cooler and far less magnetically active than the yellow
        // sun, so it gets noticeably FEWER, softer features.
        // atmosphere anchored to the (collapsing) surface radius so loops/jets ride
        // the photosphere inward as it caves in rather than hanging in empty space.
        float sunR  = uGiantR * sunRadFac * collapseScale;  // actual (collapsed) radius
        float atmoThresh = (redGiant > 0.5) ? 0.94 : 0.91;
        // suppress loops/prominences while the cloud is the smooth gold swap-in
        // ball: push the pick threshold to ~never (≥1) at low uYrMix, easing the
        // (rare) red-giant flares back in only as it reddens. No-op at uYrMix=1.
        atmoThresh = mix(1.01, atmoThresh, smoothstep(0.6, 1.0, uYrMix));
        // collapse gate: as the surface caves in, fade the off-surface atmosphere out
        // so a collapsing red giant has NO loops/prominences/spicules sticking past the
        // shrinking limb. uCollapse=0 (stable red giant) → no-op (mix→atmoThresh); by
        // uCollapse≈0.45 the threshold is ≥1.01 → pick can never exceed it → every
        // atmosphere particle falls through to the collapsing photosphere 'surf'.
        atmoThresh = mix(atmoThresh, 1.01, smoothstep(0.05, 0.45, uCollapse));
        float pick = h31(vec3(aSeed*53.1, aPhase*11.7, aU*7.3));
        if(pick > atmoThresh){
          // which active region this particle belongs to (a few clustered sites)
          float site = floor(h31(vec3(aSeed*7.0, 2.0, aPhase*3.0)) * 7.0);
          // a stable base direction per active region (clustered, not uniform)
          vec3 rnd = hash33(vec3(site*13.1, site*7.7, site*3.3))*2.0 - 1.0;
          vec3 cdir = normalize(rnd + 1e-3);
          // tangent basis at the active-region centre
          vec3 up0 = abs(cdir.y) < 0.95 ? vec3(0,1,0) : vec3(1,0,0);
          vec3 t1 = normalize(cross(up0, cdir));
          vec3 t2 = cross(cdir, t1);

          float kind = h31(vec3(aPhase*9.0, aSeed*5.0, 4.0));
          float s    = aU;                                  // 0..1 param along feature
          float hp   = sin(3.14159265*s);                   // arch height profile

          if(kind < 0.66){
            // --- coronal LOOP: arch from one foot, over the limb, to the other ---
            float sep  = 0.10 + 0.14*h31(vec3(site, aSeed*3.0, 8.0)); // foot half-sep
            float kH   = 0.12 + 0.28*h31(vec3(site, 9.0, aPhase));     // arch height (contained)
            float az   = h31(vec3(site, aSeed, 1.0)) * 6.2831;         // loop plane spin
            vec3 span  = normalize(cos(az)*t1 + sin(az)*t2);
            // rotate base dir from -sep..+sep around the loop-plane normal
            vec3 axis  = normalize(cross(cdir, span));
            float ang  = (s - 0.5) * 2.0 * sep;
            float ca = cos(ang), sa = sin(ang);
            vec3 base = cdir*ca + cross(axis, cdir)*sa + axis*dot(axis,cdir)*(1.0-ca);
            float rad = sunR * (0.94 + kH*hp);               // rise above the surface
            vec3 lpos = normalize(base) * rad;
            // thin thread jitter so the loop reads as plasma, not a wire
            float thick = sunR * 0.010 * (0.3 + 0.7*hp);
            lpos += span * (h31(vec3(aSeed*31.0, aU*17.0, 5.0))-0.5) * thick;
            pos = lpos;
            float foot = pow(1.0 - hp, 1.6);                 // bright/hot near feet
            vSunFlare = 1.0;
            vSunHot   = clamp(0.25 + 0.65*foot, 0.0, 1.0);
          } else if(kind < 0.82){
            // --- PROMINENCE / jet: short radial spray rising off the surface ---
            float az  = h31(vec3(site, aSeed, 2.0)) * 6.2831;
            vec3 latd = normalize(cos(az)*t1 + sin(az)*t2);
            float hgt = sunR * (0.08 + 0.16*h31(vec3(site, aPhase, 6.0))); // contained
            vec3 jdir = normalize(cdir + latd*0.10);
            float lat = sunR*0.025*sin(s*8.0 + aSeed*6.0)*pow(s,0.7);
            vec3 jpos = jdir * (sunR*0.94 + hgt*s) + latd*lat;
            pos = jpos;
            vSunFlare = 1.0;
            vSunHot   = clamp(0.55 - 0.4*s, 0.0, 1.0);       // hot root, cooler tip
          } else {
            // --- SPICULE spray: short fine threads fanning up off the surface
            //     (a soft bright fringe at the active region, not a hard knot).
            vec3 jit = (hash33(vec3(aSeed*61.0, aPhase*23.0, aU*9.0))*2.0-1.0);
            vec3 sdir = normalize(cdir + (t1*jit.x + t2*jit.y)*0.18);
            float len = sunR * (0.05 + 0.10*h31(vec3(aU*5.0, aSeed, 3.0)));
            pos = sdir * (sunR*0.95 + len*s);
            vSunFlare = 1.0;                            // treat as thin plasma thread
            vSunHot   = clamp(0.5 - 0.3*s, 0.0, 1.0);   // hot root → cooler tip
          }
        }
        // dev: rigidly translate the whole red-giant orb (body + atmosphere) by a
        // world-space offset so a debug slider can reposition the star. Gated on
        // redGiant so the held nebula/dot states (which also keep uGiant=1) and the
        // yellow placeholder are untouched; defaults to (0,0,0) → no-op in prod.
        pos += uGiantCenter * redGiant;
      }
      // -- nebula: a sprawling emission cloud (Hubble/SHO look) — see block below.
      if(uNebula > 0.5){
        float nebGrow = clamp(uNebulaGrow, 0.0, 1.0);
        // ===== Emission nebula (Hubble/SHO look) =================================
        // The old version read as a dense orange BALL with radial spokes — a fireball,
        // not a nebula. Real emission nebulae (Eagle, Carina, Orion) are SPRAWLING,
        // DIFFUSE, IRREGULAR clouds: most of the frame is dark space and dark DUST
        // LANES, with bright gas piling up against the dust, and the iconic colour is
        // the narrowband palette — TEAL/cyan (OIII, hot energetic gas) threading
        // against GOLD/green (Hα) and RUST/crimson (SII, cooler shock fronts). The
        // teal↔rust contrast is what makes the eye read "nebula".
        //
        // So we drop the radial colour ramp and the shell-anchored spoke filaments.
        // Two fields shape everything, sampled in a stable per-particle SPACE so the
        // structure is rigid (only a slow drift), not per-grain shimmer:
        //   • a DOMAIN-WARPED density field carves the sprawling cloud + dark voids,
        //   • an independent EMISSION field (vNeb: 0 teal → 1 rust) interleaves the
        //     palette through the whole volume instead of by radius.
        float laneH = h31(vec3(aSeed*53.7, aPhase*11.3, 3.0)); // 0..1 lane selector
        // a BIG, gently-ROUNDED, IRREGULAR volume (near-spherical, not a flat disc).
        // The axes are evened-out so the cloud reads as a round ball, with a touch of
        // irregularity kept so it still feels organic like Eagle/Carina, not CGI.
        // MUST stay byte-identical to the ELL in gravitySim.ts (sim seed shares it).
        vec3 ELL = vec3(1.04, 1.0, 1.02);
        float NR = uGiantR * 1.72;                          // overall nebula extent (bigger → larger sphere, fills the frame)
        // a slow wandering drift so the whole cloud rolls/breathes (not frozen).
        vec3 nDrift = vec3(uTime*0.006, uTime*0.004, -uTime*0.005);

        // -- base + warped position: a FULLY-HASHED point in the volume shaped into
        // the irregular ellipsoid and domain-warped into organic cloud + voids. This
        // is now the SHARED nebulaPlace() (above), used VERBATIM by the GPGPU collapse
        // sim's seed pass so the sim starts identical to this analytic placement.
        vec3 wp = nebulaPlace(aSeed, aU, aPhase, uTime, uGiantR);

        // -- DENSITY field: bright gas where fbm is high, DARK DUST LANES where it's
        // low. A WIDE gas band so most of the cloud is filled, continuous nebulosity;
        // only the low-fbm ridges carve dark dust lanes through it. fine adds patchy
        // brightness variation so the gas isn't a flat wall.
        float gas  = fbm(wp*0.58 + nDrift*0.6);             // 0..1 large gas masses
        float fine = fbm(wp*1.7  + 9.0 + nDrift);           // finer patchy detail
        float dens = smoothstep(0.30, 0.70, gas) * (0.55 + 0.55*fine);
        // dark dust lanes: only the LOWEST-fbm ridges punch holes → black space.
        float lane = smoothstep(0.26, 0.40, gas);           // 0 in a dust lane → 1 in gas
        dens *= lane;

        // -- EMISSION field (drives the BLUE ramp + brightness, INDEPENDENT of radius).
        // For the smoky-blue look the cloud is near-monochrome: hue stays in navy→cyan
        // and only the DENSE gas climbs toward the bright cyan/white end. So we drive
        // emission mostly from local DENSITY (smoke reads as brightness variation, not
        // a hue map), with a little independent noise for organic patchiness. Biased
        // hard COOL so the bulk of the cloud sits navy/blue and only the piled-up dense
        // pockets reach bright cyan — the white-hot cores come from vHeat in the frag.
        float emi = fbm(wp*0.80 + 61.0 + nDrift*0.4);       // 0..1 patchiness noise
        emi = clamp(dens*0.72 + emi*0.28, 0.0, 1.0);        // brightness follows the gas
        emi = pow(emi, 1.85);                               // bias hard cool → mostly navy/blue haze

        // -- LIGHT MODEL: diffuse ambient + depth (no star inside; the gas is self-
        // luminous). Two cheap effects give the flat glow a sense of 3D VOLUME:
        //   1. SELF-OCCLUSION: sample the density field a couple of steps TOWARD the
        //      camera. Dense gas in FRONT of this particle dims it (its glow is partly
        //      hidden / absorbed), so the cloud occludes itself front-to-back instead
        //      of every grain reading at full brightness. The cloud sits at the origin
        //      with an identity model matrix, so cameraPosition (world space) shares
        //      the gas field's space — toward-camera is just normalize(cam - wp).
        //   2. DEPTH FADE: gas farther from the camera is dimmer and shifts slightly
        //      bluer (atmospheric/volumetric depth), so near gas reads in front of far.
        // Result: gentle dimensionality, no hard shadows — the even sprawling glow is
        // preserved, just given depth. uNebLight (0..1) lets the look be dialled.
        float occ = 0.0;
        // NEB_LOW_TRIM (LOW tier only — buildDisk sets the define): the two
        // toward-camera SELF-OCCLUSION resamples of the density field are the
        // costliest part of the nebula light model (2 extra fbm evaluations per
        // vertex per frame, ~22% of the nebula branch's noise stack) for its
        // subtlest cue. On low the occlusion term is compiled OUT (occ stays 0 →
        // occLight = 1); the ambient + depth-fade terms below — the cheap parts
        // that carry most of the perceived volume — are kept. Mid/high keep the
        // full model, byte-identical.
        #ifndef NEB_LOW_TRIM
        vec3 toCam = normalize(cameraPosition - wp);
        occ += smoothstep(0.28, 0.66, fbm((wp + toCam*(NR*0.16))*0.58 + nDrift*0.6));
        occ += smoothstep(0.28, 0.66, fbm((wp + toCam*(NR*0.34))*0.58 + nDrift*0.6));
        occ *= 0.5;                                          // 0 (clear in front) .. 1 (buried)
        #endif
        float occLight = mix(1.0, 0.34, occ);               // dim gas hidden behind dense gas
        // depth: view-space distance from camera, normalised across the cloud span.
        // The cloud sits at the origin, so the camera-to-centre distance is just
        // length(cameraPosition); the cloud spans ~±NR*1.3 in front/behind that.
        float camDist = length(cameraPosition);
        float vz = -(modelViewMatrix * vec4(wp, 1.0)).z;     // >0, larger = farther
        float depth01 = clamp((vz - (camDist - NR*1.3)) / (NR*2.6), 0.0, 1.0);
        float depthLight = mix(1.0, 0.6, depth01);          // far gas dimmer
        float ambient = 0.18;                                // soft even base (never pitch self-dark)
        float nebLight = mix(1.0, ambient + (1.0 - ambient)*occLight*depthLight, uNebLight);
        // far gas shifts a touch toward teal/blue (atmospheric depth on colour).
        emi = clamp(emi - depth01*0.12*uNebLight, 0.0, 1.0);

        pos = wp;
        vNeb = emi;                                          // 0 teal OIII → 1 rust SII
        vNebLight = nebLight;                                // depth/occlusion brightness factor
        vPlaceholder = 2.0;

        if(laneH < 0.045){
          // ---- FILAMENT LANE: a FEW soft lit threads in the smoke (subtle accents,
          // not hard ropes). Rare (~4.5% of points) so the cloud reads as continuous
          // smoke, not a web of strands. Each strand starts at a random interior point
          // drifts in a random direction, gently bent, crossing the cloud organically.
          float STRANDS = 160.0;
          float sid = floor(h31(vec3(aSeed*1.7, aPhase*2.3, 0.5)) * STRANDS);
          float sH1 = h31(vec3(sid, 11.0, 3.0));
          float sH2 = h31(vec3(sid, 23.0, 7.0));
          float sH3 = h31(vec3(sid, 41.0, 9.0));
          float sH4 = h31(vec3(sid, 67.0, 5.0));
          // strand origin: a random point spread through the volume (rim-biased so
          // they don't all converge at the centre → no spokes).
          float su  = sH1*2.0 - 1.0;
          float sphi = sH2 * 6.2831;
          float ssp = sqrt(max(0.0, 1.0 - su*su));
          vec3 so = vec3(ssp*cos(sphi), su, ssp*sin(sphi));
          vec3 origin = vec3(so.x*ELL.x, so.y*ELL.y, so.z*ELL.z) * (NR * (0.35 + 0.55*sH3));
          // random strand axis (free orientation → no radial spokes)
          float au = sH3*2.0 - 1.0;
          float aphi = sH4 * 6.2831;
          float asp = sqrt(max(0.0, 1.0 - au*au));
          vec3 along = vec3(asp*cos(aphi), au, asp*sin(aphi));
          vec3 up = abs(along.y) > 0.9 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
          vec3 tA = normalize(cross(along, up));
          vec3 tB = normalize(cross(along, tA));
          float s   = h31(vec3(aSeed*5.0, aPhase*3.0, 13.0)) - 0.5; // -0.5..0.5 arc
          float len = NR * mix(0.30, 0.70, sH1);            // medium strands
          float wFrq = mix(1.5, 4.5, sH3);
          float wob  = sin(s*wFrq*6.2831 + sH4*6.2831 + uTime*0.15) * (NR*mix(0.05,0.14,sH2));
          float bend = (sH2-0.5) * NR * 0.25;
          pos = origin + along*(s*len) + tA*wob + tB*(cos(s*3.14159)*bend);
          // thickness across the rope
          pos += tA*(h31(vec3(aSeed,2.0,8.0))-0.5)*(NR*0.025);
          pos += tB*(h31(vec3(aSeed,4.0,6.0))-0.5)*(NR*0.025);
          // colour from local emission, biased toward the BRIGHT-CYAN end (the wisps
          // are the lit threads in the smoke, not warm shock fronts). Kept cool — the
          // ramp tops out at icy cyan, never gold/rust.
          float femi = clamp(fbm(pos*0.80 + 61.0 + nDrift*0.4)*0.5 + 0.50, 0.0, 1.0);
          vNeb = femi;
          heat = 0.55 + 0.5*pow(h31(vec3(aSeed*4.0, sid, 8.0)), 2.5); // soft lit threads
          vNebLane = 1.0;                                   // filament wisp
        } else {
          // ---- DIFFUSE GAS LANE: the dominant nebulosity (~90% of points). CULL by
          // local density so the gas is CONTINUOUS where it's present and FADES to
          // black space only in the dust lanes/voids. Keep a healthy floor everywhere
          // gas exists (so the big soft puffs overlap into smooth sheets, not a grainy
          // starfield) and cull almost everything where dens≈0 (the dark lanes).
          float keep = h31(vec3(aSeed*23.0, aU*5.0, 19.0));
          if(keep > 0.18 + 0.78*smoothstep(0.0, 0.5, dens)) vNebLane = -1.0; // -1 → culled
          // emission ∝ local gas density, but the DENSEST pockets push hard toward the
          // white-hot end so they bloom into glowing cores (the lit smoke in the
          // reference); thin gas stays a dim navy haze.
          heat = 0.10 + 0.85*dens + 0.85*smoothstep(0.55, 0.95, dens);
        }
        // ---- ionising young-star knots: a tiny fraction become small blue-white
        // points scattered through the gas (the cluster lighting the cloud). Spread,
        // not piled at the centre, so they don't form a single glaring core.
        if(laneH > 0.997){
          vNeb = 0.0;
          vNebLane = 0.0;
          heat = 1.3;
          vPlaceholder = 2.5;                               // star sub-tag (→ white-blue)
        }
        // DOT → NEBULA: every particle begins at the same tiny pale-blue point and
        // grows linearly to its analytic cloud position. This is the real geometry
        // growth; the camera move in timeline.ts uses the same linear band.
        pos = mix(sphere * (uGiantR * 0.018), pos, nebGrow);
        vNebGrow = nebGrow;
      }
      // -- pale blue dot: collapse to a small, soft, cool sphere ------------
      if(uDot > 0.5 && uNebulaGrow <= 0.001){
        pos = sphere * (uGiantR * 0.018);
        heat = 0.5;
        vPlaceholder = 3.0;
      }
    }

    // === Real gravity sim collapse (nebula -> yellow star) ====================
    // The collapse is a STATEFUL N-body-style sim (gravitySim.ts) BAKED to a flipbook
    // at load: particles accelerate under a softened central well + GENTLE curl
    // turbulence, spiral cleanly inward (a small jittered swirl on a dominant inward
    // pull, not a chaotic implosion), and accrete onto the core.
    // Here we read the two baked snapshots that bracket the scroll position and blend
    // them (uSimMix), then blend THAT into the analytic placement (uSimBlend). Because
    // the snapshots are fixed, the result is a pure function of scroll — scrubbing back
    // and forth lands on the exact same frame every time (no snap-back). The sim is
    // seeded from the same analytic placement, so at uSimBlend~0 simP~pos -> no pop.
    if(uSimBlend > 0.0){
      vec4 simA = texture2D(uSimPos,  aSimUV);  // snapshot A (xyz = world pos, w = life)
      vec4 simB = texture2D(uSimPosB, aSimUV);  // snapshot B (next baked frame)
      vec4 simP = mix(simA, simB, uSimMix);     // interpolate between the two snapshots
      pos = mix(pos, simP.xyz, uSimBlend);
      vSimLife = simP.w;                          // → frag brightens/dims accreting matter
    }

    vec4 viewP  = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipP  = projectionMatrix * viewP;
    vec4 viewBH = modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    vec4 clipBH = projectionMatrix * viewBH;

    float dz = viewBH.z - viewP.z;                 // >0 if behind the BH
    float behindAmt = smoothstep(0.0, 3.0, dz);

    float mag, screenR;
    vec4 lClip = lensClip(clipP, clipBH, mag, screenR);
    vec2 ndcU = clipP.xy / clipP.w;
    vec2 ndcL = lClip.xy / lClip.w;

    bool drop = false;
    vec2 ndcFinal; float useMag;

    // The lens bends the far side of the disk up over the shadow. As the shadow
    // dies during the morph, ease the lensing off so the remnant flies straight.
    // Once the star forms (uGiant>0) lensing is killed entirely — no gravity.
    float lensAmt = behindAmt * (1.0 - smoothstep(0.1, 0.5, uMorph)) * (1.0 - step(0.001, uGiant));
    if(uImageSign > 0.0){
      ndcFinal = mix(ndcU, ndcL, lensAmt);
      useMag   = mix(1.0, min(mag, 1.9), lensAmt);
      if(uMorph < 0.4 && behindAmt > 0.5 && screenR < uShadowR*0.985) drop = true;
    } else {
      // secondary (lensed) image: only meaningful while the black hole exists.
      // It fades out as the shadow dies, so the remnant/star isn't doubled.
      if(uMorph > 0.25 || uGiant > 0.0) drop = true;
      vec2 bhN = clipBH.xy / clipBH.w;
      vec2 dN  = ndcL - bhN;
      vec2 dA  = vec2(dN.x*uAspect, dN.y) * uSec;     // isotropic scaling (aspect space)
      // uSecOffset (aspect-space) nudges the secondary band toward/away from the
      // primary so the hard seam between the two layers can be closed.
      ndcFinal = bhN + vec2((dA.x + uSecOffsetX)/uAspect, dA.y + uSecOffsetY);
      float sR = screenR * uSec;                      // radius after scaling
      useMag   = min(mag, 1.8);
      if(sR < uShadowR*1.0) drop = true;              // never inside the shadow
      if(sR > uShadowR*2.8) drop = true;              // outer guard
    }

    // dark core: only carve away matter BEHIND the shadow (it would be occluded).
    // The near face passes IN FRONT of the BH -> light visible in front.
    // Once the morph starts the shadow is collapsing, so the carve fades out:
    // the imploding/flaring matter is free to cross the (vanishing) centre.
    bool carve = uMorph < 0.5;
    vec2 bhN = clipBH.xy / clipBH.w;
    vec2 dFin = ndcFinal - bhN;
    float rFin = length(vec2(dFin.x*uAspect, dFin.y));
    if(carve && rFin < uHole*0.95 && behindAmt > 0.35) drop = true;
    // RE-FORMATION shadow re-assert (scroll-UP only). The dissolve below was written
    // for the SUPERNOVA (forward / scroll-DOWN): once morph passes ~0.5 the dying
    // centre lets matter cross it. But while the hero is RE-FORMING (the feed beat,
    // morph 0.30..0.46) the black hole is fully present and its shadow MUST stay a
    // pure black void — the re-lit clumpy gas must not smear over the interior.
    // reCarve must HOLD near 1 across the WHOLE beat and fall to 0 at BOTH ends —
    // NOT track the feed's 0.46->0.30 ramp (that decays mid-beat, letting the front-
    // face gas re-paint the centre by ~0.36). Low-end ramp (0.10->0.20) keeps morph->0
    // exactly as-is (the existing carve already handles the resting hero); high-end
    // ramp drops sharply 0.44->0.47 so it is 0 by the breakout -> the supernova that
    // must fill the dying centre (morph>~0.47) is untouched.
    float reCarve = smoothstep(0.10, 0.20, uMorph) * smoothstep(0.47, 0.44, uMorph);
    // re-drop FAR-side particles inside the shadow for the WHOLE beat (the generic
    // carve above already fades out as morph rises). Only behindAmt>0.35 (far side)
    // is dropped, so the near face of the disk still shows IN FRONT of the hole.
    if(rFin < uHole*0.98 && behindAmt > 0.35 && reCarve > 0.5) drop = true;

    // === EARLY CULL #2: dropped particles skip the trailing lighting/size block ===
    // PERF, pixel-identical. 'drop' is now FINAL (the lines above, 1100..1171, are its
    // only writers; below it is only READ). A dropped particle is occluded — behind
    // the gravitational lens / inside the shadow carve / outside the secondary guard —
    // and in the unmodified shader the tail does exactly:
    //     if(drop) bright = 0.0;        (zeroes every brightness contribution)
    //     if(drop) gl_PointSize = 0.0;  (zero point size → ZERO rasterised fragments)
    // so it contributes NO pixels today; only its (size-0) gl_Position differs, which
    // is visually irrelevant when no fragments are produced.
    //
    // 'drop' genuinely depends on the EXPENSIVE transformed position (clipP/viewP, the
    // lens math), so it can't be hoisted above the position block — but it IS known
    // before the SECOND expensive chunk: the whole brightness pipeline below (Doppler,
    // gravitational redshift, emissivity, the reverse-supernova lighting with its
    // smoothstep/exp/pow swarm, AND the uGiant>0 sun-surface lighting block — which
    // itself calls fbm()). Every output of that block is either 'bright' (forced to 0
    // for a dropped particle) or a varying (vHeat/vGiant/vExplode/vSunLimb…) that only
    // feeds the FRAGMENT shader — and a size-0 point spawns no fragments, so those
    // varyings are never read. Computing all of it is pure waste for a dropped grain.
    //
    // So we bail here with the SAME visible result the original produces for a dropped
    // particle: gl_PointSize=0 and an off-clip gl_Position (fully clipped). No fragment
    // is rasterised either way → byte-identical output. (Variables the size block reads
    // — morphFlare, vGiant, yellowSurf — are moot here: the original's final
    // 'if(drop) gl_PointSize = 0.0;' overrides whatever size they produced.)
    if(drop){
      gl_Position  = vec4(2.0, 2.0, 2.0, 1.0); // outside clip volume → fully clipped
      gl_PointSize = 0.0;
      vBright = 0.0;                            // match the dropped-particle output
      return;
    }

    float coreFade;
    if(behindAmt > 0.35){
      coreFade = smoothstep(uHole*0.95, uHole*1.20, rFin);              // back: carved, soft edge
    } else {
      coreFade = mix(0.14, 1.0, smoothstep(uHole*0.10, uHole*1.05, rFin)); // front: subtle veil at centre, bright at edge
    }
    // dissolve the carve as the shadow dies, so the flare fills the centre
    coreFade = mix(coreFade, 1.0, smoothstep(0.15, 0.6, uMorph));
    // reShadow: 1 INSIDE the shadow disc during the re-formation beat, 0 outside the
    // rim (rFin >= uHole*1.15 -> photon ring survives) and 0 at the hero/supernova
    // (reCarve guard). Reused below to gate the additive infall glow so NOTHING paints
    // the interior during the beat.
    float reShadow = reCarve * (1.0 - smoothstep(uHole*0.85, uHole*1.15, rFin));
    // ...then RE-DARKEN the centre during the re-formation beat only: force coreFade->0
    // (black) inside the shadow disc. bright multiplies coreFade (below), so zeroing it
    // zeroes the organic-feed product too (feed * 0 = 0) — nothing multiplicative can
    // re-light the interior.
    coreFade = mix(coreFade, 0.0, reShadow);

    vec4 outClip = vec4(ndcFinal * clipP.w, clipP.z, clipP.w);

    // Doppler / relativistic beaming
    vec3 velW = uSpinDir * vec3(-sn, 0.0, cs);
    vec3 velV = normalize(mat3(modelViewMatrix) * velW);
    vec3 toCam = normalize(-viewP.xyz);
    float cosA = dot(velV, toCam);
    float beta = clamp(uBetaScale * inversesqrt(r), 0.0, 0.85);
    float gamma = inversesqrt(1.0 - beta*beta);
    float delta = 1.0 / (gamma * (1.0 - beta*cosA));
    float beam  = mix(1.0, pow(delta, uBeamExp), uDoppler);

    // gravitational redshift (darkens the interior)
    float grav = sqrt(max(0.0, 1.0 - 1.0/r));

    // radial emissivity (inner peak, softened thin-disk)
    float x = r / uRin;
    float emiss = pow(x, -2.0) * (1.0 - 0.62*sqrt(uRin/r));
    emiss = max(emiss, 0.0);

    float pv = 0.45 + 0.55*aSeed;
    float bright = 3.3 * uBright * beam * grav * emiss * useMag * pv * coreFade;

    // === center-out feed (scroll-UP: seed → hero disk) =====================
    // During the transition the disk lights from the CENTER OUTWARD: at high
    // uMorph only the inner ring glows; as uMorph→0 a front sweeps to the rim so
    // the full hero disk is lit (the disk "charges up" from a central source).
    // NO-OP at the hero (uMorph=0): the front sits past the rim → feed=1 for all
    // aU, so the resting disk is exactly unchanged. Only active for uMorph<0.46,
    // below the implosion lighting, so it never fights the explosion.
    float feedActive = smoothstep(0.46, 0.30, uMorph);          // 1 below 0.30 → 0 above 0.46
    float feedFront  = mix(1.25, 0.0, smoothstep(0.0, 0.45, uMorph)); // aU front: 1.25 @0 → 0 @0.45
    float feed       = smoothstep(feedFront + 0.22, feedFront, aU);   // inner (aU small) lit first
    float feedHot    = exp(-pow((aU - feedFront)/0.10, 2.0)) * 0.8;   // traveling feeding point
    feed = mix(1.0, feed * (1.0 + feedHot), feedActive);        // relax to 1.0 when inactive
    bright *= feed;

    // adjustable asymmetries: top/bottom and left/right (relative to BH centre, screen space)
    float yN = (rFin > 1e-4) ? dFin.y / rFin : 0.0;            // +up / -down
    float xN = (rFin > 1e-4) ? (dFin.x*uAspect) / rFin : 0.0;  // +right / -left
    bright *= clamp(1.0 + uVertAsym * yN, 0.0, 3.0);
    bright *= clamp(1.0 - uHorizAsym * xN, 0.0, 3.0);
    if(uImageSign < 0.0) bright *= 1.15;   // secondary halo blended into the Doppler

    // === Reverse-supernova lighting & heat ==================================
    // Implosion glow on the way in, a punchy shock-breakout flash, a thin shock
    // SHELL racing outward, then a structured filamentary remnant whose light
    // falls as the shell inflates (energy conservation) but whose bright wisps
    // persist. A heat proxy (vExplode) drives the blue-white→amber→red ramp.
    float morphImplode = smoothstep(0.0, 0.46, uMorph);
    // morphFlare ramps FAST (done by ~0.66) so the structured hollow-shell
    // remnant takes over from the bright dense bulk as soon as the blast starts
    // — otherwise the bright implosion glow lingers and buries the radial rays.
    float morphFlare   = smoothstep(0.46, 0.70, uMorph);
    bright *= 1.0 + 1.2*morphImplode*(1.0 - morphFlare);  // hotter as it compresses
    // SEED BLACK HOLE: just before the flash the collapsed matter darkens so it
    // reads as a tiny dense seed (a small black hole) — the light has fallen into
    // the point — then the shock-breakout flash erupts from it. The dip is centred
    // slightly BEFORE the flash (0.44); it darkens the very dense CORE (small
    // absolute radius) while keeping a thin bright rim on the shell just outside,
    // so the seed reads as a compact point with a glowing edge, not a soft blob.
    // The dense core goes genuinely DARK — the light has fallen into the point, so
    // the seed reads as a real black hole, not a painted glow. Widen the dark zone
    // (uRin*0.6) and broaden+deepen the dip (σ0.07, 0.97) so the core holds near-
    // black across the whole seed beat. coreDark is declared ONCE here and reused
    // by the accretion-stream light and the flash gate below.
    float coreDark = 1.0 - smoothstep(uRin*0.15, uRin*0.6, r); // 1 deep in the core
    // centred just BEFORE the flash and narrow, so the core is near-black at the
    // seed but releases by the breakout (0.50) → the loud flash survives.
    float seedDip = exp(-pow((uMorph-0.42)/0.04, 2.0));
    bright *= 1.0 - 0.97*seedDip*coreDark;
    // peak-compression dip — edge-shaping; the JS uBright cut + the ceiling
    // below do the heavy lifting against a whiteout, this softens the burst rim.
    float compress = exp(-pow((uMorph-0.5)/0.15, 2.0));
    bright *= 1.0 - 0.40*compress;
    // the shock-breakout burst — the one bright beat we DO want for the supernova
    // proper, but GATED so it never paints a glow blob over the dark seed: the
    // dense core gets almost none of it (it must read black), and the additive
    // glow is extra-suppressed right in the seed window. The spread-out SHELL and
    // fingers (coreDark≈0 out there) keep the full loud breakout, so the detonation
    // is unchanged — only the central blob is removed.
    // narrow + early so it darkens the seed (≤0.47) but is RELEASED by the flash
    // peak (0.50) — otherwise it eats the loud breakout the user wants to keep.
    float seedSuppress = exp(-pow((uMorph-0.42)/0.035, 2.0));   // 1 at seed → 0 by flash
    float flashGate = (1.0 - 0.92*coreDark) * (1.0 - 0.80*seedSuppress*coreDark);
    bright += uFlash * (0.85 + 1.1*pv) * (0.6 + 0.4*useMag) * flashGate;
    // accretion stream: light ONLY on the strained infalling matter just OUTSIDE
    // the dark core (∝ inward strain), so you see glowing strands spiralling into
    // a black point — the "aspiration" read — instead of a glow blob. Never lights
    // the core itself ((1-coreDark)). infallGlow comes from the position block.
    // Also gate by (1-reShadow): during the RE-FORMATION beat this additive seed
    // glow must not paint the shadow interior either (coreFade only kills the
    // multiplicative path). reShadow is 0 outside the beat, so the seed/supernova
    // aspiration read past 0.44 is fully preserved.
    bright += infallGlow * (0.5 + 0.6*pv) * (1.0 - coreDark) * (1.0 - reShadow);

    // -- expanding shock shell -----------------------------------------------
    // A thin bright spherical front sweeps outward AHEAD of the bulk debris
    // (exponent 0.5 < the bulk's 0.62 reach), lighting particles near it then
    // passing them; it dims as it inflates and thins (E∝1/r²). Additive, so it
    // flashes through voids too. shellFront/band are reused by the heat proxy.
    // This bright front is the structural hero of the blast — it stays vivid
    // once the matter has SPREAD (low density) so it can't whiteout. Its radius
    // tracks the (now modest) ejecta so it lights real particles, not empty space.
    float shellFront = uRout * (0.06 + 0.55*pow(flare, 0.42)); // 0.06→0.61 rOut, faster
    float shellW     = uRout * 0.05;                            // thin crisp band
    float band       = exp(-pow((r - shellFront)/shellW, 2.0));
    // brighter, launches earlier — a wall of light sweeping outward. The shell is
    // LOW-density (matter has spread), so it can be bright without a whiteout.
    float shellLight = band * (1.0 - 0.3*flare) * 5.2 * smoothstep(0.46, 0.66, uMorph);
    bright += shellLight * (0.6 + 1.2*pv);

    // remnant: a HOLLOW expanding shell of radial rays. The matter has left the
    // centre, so brightness peaks out at the shell front and falls toward the
    // core (a hollow bubble, like a real supernova remnant) — this carves a dark
    // interior so the radial finger structure reads against it instead of being
    // buried under a solid bright disc. Modulated hard by the jet/clump field so
    // the bright RAYS stand out over near-dark voids between them.
    float shellProfile = smoothstep(coreR, shellFront, r);   // 0 core → 1 at front
    shellProfile *= smoothstep(shellFront + shellW*2.5, shellFront, r); // fade past front
    // sharpen the rays: bright fingers glow, the voids between them go darker,
    // so the radial structure reads as fingers instead of a uniform dust ball —
    // but keep a real floor so the whole bubble stays visible.
    float rays = pow(clump*0.7, 1.7);                        // radial fingers
    float remnant = (0.05 + 0.95*shellProfile) * (0.35 + 1.9*rays);
    bright = mix(bright, remnant, morphFlare);

    // -- whiteout ceiling: while matter is still dense (implosion → just past the
    // flash, AND the surface collapsing to its point) clamp per-particle emission so
    // ~1.2M additively-blended overlapping dots cannot stack into an edge-to-edge
    // white plate. The ceiling lifts as the matter spreads out (density falls) so
    // the shell/jets/fingers keep their punch.
    float dense = exp(-pow((uMorph-0.48)/0.12, 2.0));     // 1 at the flash → 0 away
    // also clamp the packed point of the surface collapse — but ONLY while the giant
    // surface model is active (uGiant>0). At the hero (uGiant=0) uCollapse is pinned
    // at 1, so without this gate it would wrongly dim the black-hole disk.
    dense = max(dense, smoothstep(0.6, 1.0, uCollapse) * step(0.001, uGiant));
    float ceil  = mix(40.0, 3.4, dense);                  // cap at the flash (a touch higher → louder)
    bright = min(bright, ceil);

    // -- explosion HEAT proxy (drives the colour ramp) -----------------------
    // 1 = blue-white (flash / shock front), → amber → ~0 deep red as the bulk
    // cools and spreads outward. Gated off until the flash so the black-hole
    // ember ramp is untouched during the implosion.
    float cool = 1.0 - smoothstep(coreR, shellFront + shellW, r); // 1 inner→0 far
    float heatExp = clamp(
        0.30*morphFlare        // warm amber base so debris isn't all dark-red
      + 0.85*uFlash            // blinding blue-white at breakout
      + 0.65*band              // shock front stays hot
      + 0.55*cool*morphFlare   // hotter toward the still-dense interior
      + 0.35*clump,            // bright filaments run hotter than voids
      0.0, 1.2);
    vExplode = heatExp * smoothstep(0.40, 0.50, uMorph);

    // === Sun surface lighting (transition 2) ================================
    // Replace the black-hole/remnant lighting with a textured photosphere as
    // uGiant rises: physical limb darkening, multi-scale granulation, dark
    // sunspots with bright penumbrae, and bright plage/active regions.
    float spotMask = 0.0;
    if(uGiant > 0.0){
      vec3 nrm = normalize(pos);
      float mu = clamp(dot(nrm, toCam), 0.0, 1.0);  // cos(angle from disk centre)

      // canonical solar limb darkening (linear law, u≈0.6): centre bright, rim
      // dim. Keep a thin bright limb rim (chromosphere/forward-scattered corona).
      float limbDark = 1.0 - 0.62*(1.0 - mu);
      float rimGlow  = smoothstep(0.30, 0.0, mu) * 0.85;

      float gran = heat;                            // multi-scale granulation 0..1.3

      // dark sunspot regions: low-frequency mask carves cool umbrae with a
      // slightly brighter penumbral ring around them.
      float spotF = fbm(nrm*1.4 + 11.0);
      float umbra   = smoothstep(0.40, 0.30, spotF);          // deep dark core
      float penumbra= smoothstep(0.52, 0.44, spotF) - umbra;  // ring around it
      spotMask = umbra;
      float surf = (0.5 + 0.85*gran);
      surf *= mix(1.0, 0.18, umbra);                 // umbra very dark
      surf *= mix(1.0, 0.7, max(penumbra,0.0));      // penumbra a touch cooler

      // bright plage / active regions: broad hot patches near (but not in) spots
      float plage = smoothstep(0.55, 0.7, spotF) * 0.4;
      surf += plage;

      float photo = (surf * limbDark + rimGlow);

      // overall scale — warm and richly lit. The real brightness fix is the lowered
      // grade tone-map compression (uToneComp) for the red giant; this scale just needs
      // to give the tone-map something to work with, so 1.1 is plenty (1.3 risked a wash
      // once the compression was relaxed). The deep-red ramp keeps it red, not white.
      float giantBright = photo * 1.1;

      // Hold the photosphere lighting on through the COLLAPSE so the shrinking,
      // spiking surface stays a lit (red→warm) surface rather than greying into the
      // dark ember ramp early. g rides uGiant for the gather/red-giant, but is
      // floored to ~1 across the collapse window (1-uCollapse only releases it right
      // at the point, where the legacy flash/ember ramp takes over). At uGiant=0 it
      // is 0 → the hero/seed disk is untouched.
      float g = smoothstep(0.0, 1.0, uGiant);
      g = max(g, smoothstep(0.04, 0.30, uGiant) * (1.0 - smoothstep(0.85, 1.0, uCollapse)));
      bright = mix(bright, giantBright, g);

      // heat channel for the colour ramp: deep red base, hot plage highlights.
      float hch = clamp(gran*(1.0 - 0.85*umbra) + plage*1.2, 0.0, 1.15);
      vHeat = mix(0.5, hch, g);
      vGiant = g;

      // --- sun override: brightness from the ported photosphere recipe ------
      // The standalone Sun render lights its surface by the warm field vSunM,
      // limb darkening, active-region lift and a bright fresnel limb. The same
      // lighting drives the red giant (vSunRed=1), only cooler and dimmer so it
      // reads as a big, deep-red, matte star rather than a vivid gold sun.
      if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
        float limb = pow(1.0 - mu, 2.0);              // fresnel limb (pow 2)
        vSunLimb = limb;
        if(vSunFlare > 0.5){
          // coronal LOOP / prominence thread — glowing plasma, hotter toward
          // the feet/root (vSunHot), softer at the apex/tip. Red giant runs its
          // (rare) features dimmer and cooler.
          bright = (0.7 + 1.5*vSunHot) * mix(1.0, 0.7, vSunRed);
        } else {
          // PHOTOSPHERE — warm cells bright, veins/spots dark. Kept deliberately
          // LOW so ~1M additively-blended points don't stack into a white centre;
          // the colour ramp carries the hue, brightness only modulates it. A
          // gentle limb-darkening keeps the disc edge from glaring.
          float m = vSunM;
          // red giant: a big, DARK, molten ember star — NOT a clean lit gold sun. The
          // previous floor/ceiling (0.80/1.05) lit the WHOLE surface bright and even, which
          // is exactly what read as "yellow sun". Pull the red-giant floor DOWN hard
          // (baseLo 0.80→0.34) so the burnt-mass body sits dark, and lower the ceiling a
          // touch (baseHi 1.05→0.92) — but WIDEN the dynamic range (baseHi*m carries the hot
          // cells) so the few bright cells still climb high enough to bloom while the bulk of
          // the surface stays a heavy burnt-orange/red-brown mass. limbMu kept low (0.14) so
          // the parked limb still reads as a lit, glowing edge, not a black silhouette.
          float baseLo = mix(0.30, 0.34, vSunRed);
          float baseHi = mix(0.62, 0.92, vSunRed);
          float limbMu = mix(0.18, 0.14, vSunRed);
          // contrast push (red giant only): square the mottle so the value distribution is
          // bottom-heavy — most of the surface lands in the dark burnt band and only the
          // bright cell tops carry the sodium/hot stops. mEffLum 0.55 mixes in the squared
          // field so it deepens the shadows without killing the hot cell peaks.
          float mLit = mix(m, m*m, mix(0.0, 0.55, vSunRed));
          float lum = (baseLo + baseHi*mLit) * (1.0 - vSunDark*0.90) * ((1.0-limbMu) + limbMu*mu);
          float arBright = smoothstep(0.90, 0.997, m) * mix(0.45, 0.28, vSunRed);
          // light the fresnel limb warmly so the curved edge glows — but pulled DOWN for the
          // red giant (0.50→0.34) so the sodium-orange rim is a hot EDGE, not a bright band
          // washing the outer third of the body toward gold.
          bright = (lum + arBright + limb*mix(0.30, 0.34, vSunRed));
          vHeat = m;
        }
      }
      // --- nebula lighting: glowing emission gas, not a lit surface -----------
      // The giant photosphere lighting above is meaningless for a scattered cloud,
      // so override it. Emission tracks LOCAL GAS DENSITY (heat, from the geometry
      // block) — bright clumps and filament cores glow, the thin veil between dust
      // lanes barely glows. No radial dimming any more: vNeb is the emission/colour
      // field now, so brightness is purely density-driven. Kept LOW per-particle
      // because the big overlapping grains accumulate additively — bloom/grade
      // supply the overall glow.
      if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
        float dens = clamp(heat, 0.0, 1.7);
        if(vNebLane > 0.5){
          // FILAMENT strands: the bright wispy web threading the gas — the structure
          // the eye latches onto. Crisp and luminous with brighter knots.
          bright = 0.40 + 1.30*dens*dens;
        } else {
          // DIFFUSE gas: dim soft nebulosity that the colour palette survives on,
          // NOT a bright wall that clips to cream. Scales with local density so the
          // gas masses glow and the dust lanes stay near-black.
          bright = 0.05 + 0.42*dens;
        }
        if(vPlaceholder > 2.4) bright = 3.0;     // central star cluster: bright point
        vHeat = dens;                            // keep density for the spine lift
        vGiant = 1.0;                            // (unused by the nebula tint path)
      }
    } else {
      vHeat = 0.5;
      vGiant = 0.0;
    }

    if(drop) bright = 0.0;

    vBright = bright * uVisibleBrightGain;
    vSeed   = aSeed;
    gl_Position = outClip;

    float dist = -viewP.z;
    // photosphere grains sit larger so the surface reads as solid.
    float baseSize = uPixelRatio * (1.0 + 0.6*sqrt(min(bright,6.0))) * (16.0/dist);
    // Low-tier grain fattening (uPointGain==1.0 on high → exact no-op). Folded into
    // baseSize so every point-size branch below inherits it; the clamp ceilings are
    // also scaled by uPointGain (below) so the boost survives the clamp.
    baseSize *= uPointGain;
    // Black-hole shrink moves grains CLOSER to the origin (smaller dist), which would
    // balloon them via the 16/dist term and mush the disk. Scale the grain size with the
    // shrink so the contracting disk stays crisp and grainy. Gated to uGiant==0 (step is
    // 1 only when uGiant==0); the red giant / later states keep their own sizing.
    baseSize *= mix(1.0, uBlackHoleScale, step(uGiant, 0.0));
    float surfSize = baseSize * 1.7;
    // yellow photosphere: enlarge the grains so ~1M points OVERLAP into a solid
    // surface (kills the sandy per-point speckle, leaving the big swirly cells).
    float yellowSurf = (vPlaceholder > 0.5 && vPlaceholder < 1.5 && vSunFlare < 0.5) ? 1.0 : 0.0;
    // red giant gets slightly FATTER grains (3.6 vs the yellow 3.0) so the photosphere
    // reads denser at the parked limb — closing the worst black gaps — while keeping
    // visible granulation (not a flat solid wall). vSunRed is 1 only for the red giant.
    float surfGrain = mix(3.0, 3.6, vSunRed);
    surfSize = mix(surfSize, baseSize * surfGrain, yellowSurf);
    // ejecta grains swell modestly during the blast so the debris reads as
    // glowing embers/streamers, but not so much that they overlap into a wash.
    float blastSize = baseSize * 1.5;
    float size = mix(baseSize, blastSize, morphFlare);
    size = mix(size, surfSize, vGiant);
    float maxSize = mix(mix(4.5, 6.0, morphFlare), 7.0, vGiant);
    maxSize = mix(maxSize, 13.0, yellowSurf);   // bigger grains may overlap solid
    maxSize *= uPointGain;                       // low tier ONLY: raise the ceiling so the
    //   fattened grains aren't clamped back down (no-op at uPointGain==1.0)
    gl_PointSize = clamp(size, 0.6, maxSize);
    // yellow-sun atmosphere: loop/jet threads are THIN; footpoint knots a bit
    // larger and bright. Overrides the generic surface sizing above.
    if(vSunFlare > 1.5){
      gl_PointSize = clamp(baseSize * 0.9, 0.8, 2.8 * uPointGain);    // footpoint grain (small)
    } else if(vSunFlare > 0.5){
      gl_PointSize = clamp(baseSize * 0.8, 0.6, 2.4 * uPointGain);    // loop / jet thread
    }
    // nebula: DIFFERENT sizing per lane. Filament wisps get fat soft grains that
    // overlap into glowing ropes; the surviving diffuse gas gets BIG soft puffs that
    // melt into continuous nebulosity (we view from outside now, so the grains must
    // be large to overlap into sheets rather than read as a grainy starfield).
    // Culled diffuse grains (vNebLane < 0) are sized to 0 so the voids stay black.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
      float sizeRand = 0.7 + 0.6*aSeed;                  // per-particle variety (tighter → smoother overlap)
      float growSize = max(vNebGrow, 0.05);
      if(vNebLane > 0.5){
        gl_PointSize = clamp(baseSize * (1.3 + 1.8*vHeat) * sizeRand * growSize, 0.4, 8.0 * uPointGain); // soft lit thread
      } else {
        // BIG soft puffs so ~1M grains overlap into continuous smoke (not a grainy
        // starfield). Larger floor/cap than before → fewer hard gaps between grains.
        gl_PointSize = clamp(baseSize * (3.0 + 3.2*vHeat) * sizeRand * growSize, 0.4, 16.0 * uPointGain); // soft smoke puff
      }
      if(vPlaceholder > 2.4) gl_PointSize = clamp(baseSize * 3.0 * growSize, 0.5, 9.0 * uPointGain); // young-star knot (small bright point)
      if(vNebLane < -0.5) gl_PointSize = 0.0;            // culled diffuse grain
      // ABSORPTION CONTRACT: as a grain parks onto the photosphere (accrete = 1 - vSimLife
      // → 1) it must visibly CONTRACT into the surface, not just dim — so a big soft puff
      // shrinks to a pinpoint right as it is swallowed. The shrink ramps across the last
      // stretch of the fall (0.70→0.985) so the grain is already drawing in as it lands,
      // then is a near-point as the sharp wink-out (frag, accrete 0.90→0.985) eats it. We
      // shrink to 12% (not 0) so a still-bright grain doesn't vanish a frame before its
      // brightness fade completes — the two together read as "pulled in and consumed".
      // vSimLife defaults to 1.0 (accrete 0) outside the collapse window → factor 1, no-op.
      float accreteShrink = smoothstep(0.70, 0.985, 1.0 - clamp(vSimLife, 0.0, 1.0));
      gl_PointSize *= 1.0 - 0.88*accreteShrink;          // big puff → pinpoint as the star eats it
    }
    if(vPlaceholder > 2.9){
      // pale blue dot: the closing speck. The cloud is ~1.2M points all collapsed onto
      // the SAME tiny sphere (pos = sphere * uGiantR*0.018), so we only draw a sparse
      // SUBSET of them — otherwise the additive stack blows the speck into a bright blob.
      // The OLD gate (aSeed < 0.000018 → ~22 points, size 0.10/0.35..0.75) drew so few
      // sub-pixel points the speck was effectively INVISIBLE. Relax the seed threshold to
      // ~0.06% of the cloud (~700 points) and bump the size a touch so the cluster forms a
      // coherent, small, soft point — a few clean pixels with a glow, not a flat blob.
      // DOT_SEED_GATE / DOT_SIZE_MUL are the taste levers: raise the gate or the size to
      // make the speck bigger/brighter, lower them to make it quieter. (Light to render it
      // comes from the DOT_* grade in lifecycle.ts; colour #DDEBFF + breath in the frag.)
      // ROUND-SPECK RETUNE: the old gate (0.0006, ~700 pts) at 0.7-1.8 px stacked into a
      // hard-edged white SQUARE (each point is 1-2 device pixels — the round falloff can't
      // resolve below ~3 px, so the additive pile-up read as a solid square sprite). Fewer
      // points (~350), each LARGER (2.2-4.5 px) with a gaussian profile in the fragment
      // shader, fuse into one small soft ROUND glow — the famous speck, not a pixel block.
      //
      // HALO SPRITES: the speck's soft glow is drawn IN-SCENE by a second tiny subset of
      // points rendered as large (26 px), very dim gaussian sprites. The post bloom CANNOT
      // make this halo: at its low mip resolutions the few-pixel speck is a single texel,
      // and bilinear upsampling stamps a SQUARE gradient around it (the audit's square
      // glow). In-scene gaussians are perfectly round at any size; the bloom is dialled
      // near-off for the dot in lifecycle.ts.
      const float DOT_SEED_GATE = 0.0003;   // fraction of the cloud that draws the speck (~0.03%)
      const float DOT_HALO_GATE = 0.00034;  // the next ~50 points become the round halo sprites
      const float DOT_SIZE_MUL  = 0.55;     // per-point size multiplier (soft round speck)
      if (aSeed < DOT_SEED_GATE) {
        gl_PointSize = clamp(baseSize * DOT_SIZE_MUL, 2.2, 4.5);
      } else if (aSeed < DOT_HALO_GATE) {
        gl_PointSize = 26.0;
        vBright *= 0.035; // whisper-dim: ~50 stacked sprites sum to a soft halo, not a glow ball
      } else {
        gl_PointSize = 0.0;
      }
    }
    if(drop) gl_PointSize = 0.0;

    // --- HALF-RES PARTICLE PASS: size + energy compensation ---------------------
    // Skipped entirely at uSizeScale == 1 (the full-res single pass — byte-identical).
    // gl_PointSize above is in FULL-RES pixels; on the scaled-down particle target the
    // same number would cover 1/uSizeScale× the intended screen footprint (≈4× energy
    // at 0.5 after the bilinear upsample — measured as a fat white haze around the
    // disk). Two steps, both against the size the full-res raster would ACTUALLY have
    // produced (GL rasterises any 0<size<1 point as ~1px, and this shader's floors sit
    // at 0.4-0.8, so the reference is max(size, 1)):
    //   1. rescale the point to uSizeScale× so its SCREEN footprint matches full-res;
    //   2. sprites that then land under the 1px raster floor still cover a whole texel
    //      (up to 1/(scale²)× their ideal area), so vSizeComp scales their intensity by
    //      (ideal/actual)² — the fragment folds it into the final inten, conserving the
    //      total added light exactly (a 1px full-res grain becomes one quarter-bright
    //      half-res texel that upsamples back to its original energy, slightly softer).
    if(uSizeScale < 0.999 && gl_PointSize > 0.0){
      float fullPx   = max(gl_PointSize, 1.0);   // what the full-res raster actually draws
      float targetPx = fullPx * uSizeScale;      // ideal size on the scaled-down target
      float rasterPx = max(targetPx, 1.0);       // what THIS raster will actually draw
      vSizeComp = (targetPx * targetPx) / (rasterPx * rasterPx);
      gl_PointSize = rasterPx;
    }
  }
`,mr=`
  precision highp float;
  uniform float uDotTime;   // dedicated always-live clock for the opening dot's breath (uTime is frozen across the nebula window, which includes the dot); 0 under reduced-motion → steady dot
  uniform float uSat;
  uniform float uYrFlash;   // yellow→red swap flash: whitens the gold cloud sphere
  uniform float uNebFade;   // global gas-density fade across the collapse window (1 full gas →
  //   0 fully agglomerated). Applied AFTER the per-grain nebula intensity formulas below: their
  //   constant floors (0.04/0.10 + …·vBright) hold every grain at a minimum no matter how far
  //   uBright drops, so the collapse density envelope needs this post-floor multiply to truly
  //   empty the cloud as the gas finishes feeding the star.
  uniform float uPointGain; // low-tier grain-SIZE multiplier (1.0 on high). Shared with the
  //   vertex shader: there it fattens gl_PointSize, here it WIDENS the gaussian core in step
  //   (softP/softN below) so the fattened sparse grains overlap instead of speckling.
  uniform float uTailEps;   // invisible-tail discard epsilon (DISK_TAIL_EPS default; 0 = off).
  //   Fragments whose FINAL additive intensity lands below this are discarded before the
  //   blend — they are under the HalfFloat pipeline's visible threshold, so skipping their
  //   ROP/blend cost trims the gaussian-tail fill every sprite currently pays for. See the
  //   DISK_TAIL_EPS doc at the top of this file for the epsilon/accumulation reasoning.
  varying float vBright;
  varying float vSeed;
  varying float vGiant;
  varying float vHeat;
  varying float vExplode;
  varying float vPlaceholder; // REVIEW: 0 none, 1 yellow, 2 nebula, 3 dot
  varying float vNeb;    // nebula emission field → colour palette (0 teal OIII → 1 rust SII)
  varying float vNebLane;// nebula lane: 0 = diffuse haze, 1 = filament strand
  varying float vNebLight;// nebula depth/occlusion brightness factor
  varying float vNebGrow;// dot→nebula linear growth factor
  varying float vSunM;    // warm photosphere field for the yellow-sun ramp
  varying float vSunLimb; // limb factor → bright gold rim glow
  varying float vSunDark; // sunspot/network darkening
  varying float vSunFlare;// 0 photosphere, 1 loop/jet, 2 footpoint knot
  varying float vSunHot;  // white-hot factor along loops / at footpoints
  varying float vSunRed;  // 0 = gold (yellow sun) palette, 1 = red-giant palette
  varying float vYrMix;   // 0 = smooth gold cloud sphere, 1 = granular red giant
  varying float vSimLife; // GPGPU collapse: 1 = free gas, →0 as it accretes onto the star
  varying float vEaten;   // core-swallow progress (0 = on surface, 1 = fallen to the core)
  varying float vEruptGlow; // click-eruption heat (jet root + ripple crest) → hot brightening
  varying float vSizeComp; // half-res pass energy compensation (1.0 on the full-res path):
  //   sprites floored to 1px on the scaled-down particle target carry (ideal/actual)² here
  //   so their total added light matches the full-res raster (see the vertex-end block).
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    // soft round falloff that fills the photosphere.
    float a = smoothstep(0.5, 0.04, d);
    // --- low-tier gaussian widening -------------------------------------------
    // The low tier draws fewer grains and fattens each one via uPointGain (vertex:
    // gl_PointSize *= uPointGain). A fatter SPRITE with a fixed-width gaussian core is
    // just a small bright dot floating in a big transparent square: exp(-d²·7) has
    // already fallen to ~0 well before the sprite edge, so the fattened grains DON'T
    // touch → sandpaper / golf-ball speckle. The fix: widen the lit core IN STEP with
    // the sprite. A wider gaussian = a SMALLER exponent, so we divide the exponent by
    // a function of uPointGain (σ ∝ 1/√exponent, so dividing by g grows σ by √g).
    // RE-TUNED LIGHTER: with the cheap quarter-res bloom now spreading every grain's
    // light and ~2× more grains overlapping on their own, uPointGain itself is much
    // smaller (~2.0 vs the old ~4.8) AND the per-(g-1) widening coefficients are
    // pulled DOWN. The old aggressive widening (softP = 1 + 1.6·(g-1), reaching ~7×)
    // was compensating for NO bloom and very few grains — it bloated each grain's core
    // so far that the surface smeared into a flat molten wall with no convection. Now
    // bloom does the final smoothing, so we widen the core only ENOUGH to close the
    // intergranular gaps and let the bloom blend the rest, keeping visible convection.
    // Both terms are written so they are EXACTLY 1.0 at uPointGain==1.0 (high tier),
    // where every exponent reduces to its EXACT original constant (7.0 / 9.0 / 4.5)
    // → the high path is byte-identical.
    float softP = 1.0 + 1.0 * (uPointGain - 1.0);    // 1.0 high → ~2.0 at low (pointGain≈2.0) — gentle core, bloom finishes it
    float softN = 1.0 + 0.95 * (uPointGain - 1.0);   // 1.0 high → ~1.95 low (gas widens enough that the 8.5×-sparser cloud melts the gaps shut)
    // yellow photosphere / red giant: a smooth GAUSSIAN profile (no flat disc
    // core) whose width tracks uPointGain so the big overlapping grains average
    // into a continuous molten surface instead of a field of hard little discs —
    // this is what kills the sandy speckle on the sparse low tier.
    if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
      a = (vSunFlare < 0.5) ? exp(-d*d*(7.0/softP)) : exp(-d*d*(9.0/softP));
    }
    // nebula: a soft wide gaussian (widened more gently for gas, via softN) so the
    // big varied grains melt into continuous glowing gas with no hard edges
    // (cloud, not confetti) even when the low tier thins the cloud right out.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.5){
      a = exp(-d*d*(4.5/softN));
    }
    // pale blue dot: gaussian profile so the few overlapping speck points fuse into
    // one small round glow. Without this the dot fell through to the generic
    // smoothstep, which at 2-4 px point sizes rendered each point as a hard square.
    if(vPlaceholder > 2.9){
      a = exp(-d*d*6.0);
    }

    // --- black-hole accretion ramp (ITEM 2: COLD silver / bone / faint blue-white,
    //     near-monochrome). The lensing line + disk read as a thin SILVER rim of light,
    //     NOT a warm sunburst: the low end is a cold blue-silver (accent #9EA8B8 family),
    //     the mid a cool bone, the hot a faint blue-white. Cold + gravitational. ---
    float t = vBright / (vBright + 1.6);
    vec3 cLow = vec3(0.66, 0.71, 0.80);   // cold blue-silver (the #9EA8B8 cold accent)
    vec3 cMid = vec3(0.88, 0.91, 0.95);   // cool bone
    vec3 cHot = vec3(0.97, 0.99, 1.00);   // faint blue-white hot edge
    vec3 emberCol = mix(cLow, cMid, smoothstep(0.0, 0.45, t));
    emberCol = mix(emberCol, cHot, smoothstep(0.45, 0.92, t));
    float luma = dot(emberCol, vec3(0.299,0.587,0.114));
    emberCol = mix(vec3(luma), emberCol, uSat);

    // --- sun ramp: deep brown → sodium orange → amber → white-hot, driven by the
    //     temperature proxy. PALETTE (red-giant spec): sodium orange / deep brown.
    //     The green channel is lifted across the ramp so the lows read as warm DEEP
    //     BROWN (not maroon) and the body climbs to sodium orange. Base photosphere
    //     stays sodium; only the brightest plage reaches the hot amber/white end. ---
    float h = clamp(vHeat, 0.0, 1.15);
    vec3 gDark = vec3(0.13, 0.045, 0.010);  // deep-BROWN intergranular lanes / umbrae
    vec3 gRed  = vec3(0.66, 0.24, 0.03);    // base photosphere brown-orange
    vec3 gOrng = vec3(0.95, 0.46, 0.07);    // bright sodium-orange granule / network
    vec3 gAmbr = vec3(1.00, 0.64, 0.16);    // hot amber plage
    vec3 gWhite= vec3(1.00, 0.92, 0.74);    // brightest plage highlight
    vec3 sunCol = mix(gDark, gRed,  smoothstep(0.10, 0.40, h));
    sunCol = mix(sunCol, gOrng,  smoothstep(0.42, 0.66, h));
    sunCol = mix(sunCol, gAmbr,  smoothstep(0.66, 0.86, h));
    sunCol = mix(sunCol, gWhite, smoothstep(0.90, 1.08, h));

    // --- explosion ramp: burnt-orange shadows → amber edge → white-hot center,
    //     driven by the shock-breakout heat proxy. PALETTE (supernova spec):
    //     white-hot center / amber edge / burnt-orange shadows — NO blue core. The
    //     old blue-white flash stop is removed: the hottest end now resolves to a
    //     white-hot core (the time-based NovaShader whiteout supplies the blinding
    //     peak), so the debris ramp stays in the warm white→amber→burnt family. The
    //     cooled outer filaments are a clear BURNT ORANGE (green lifted off pure red),
    //     and the mid is a clean amber. Sits between the ember ramp and the sun ramp. ---
    // ITEM 3 collapse ramp: white #F3EFE2 -> amber #FF9A2E -> red #6A1608 -> dark #090302.
    // The reverse-collapse is a brief TRANSITION FLASH (cold silver-line -> hot ember in
    // under a second), so the ramp goes from a clean warm-white core down through a hot
    // amber edge to a deep collapse-red and a near-black dark — handing straight into the
    // red-giant surface. Tighter than the old burnt-orange debris ramp.
    float e = clamp(vExplode, 0.0, 1.2);
    vec3 eDark  = vec3(0.035, 0.012, 0.008); // #090302 dark collapse shadow (deepest)
    vec3 eRed   = vec3(0.415, 0.086, 0.031); // #6A1608 collapse red (cooled inner debris/shadows)
    vec3 eAmbr  = vec3(1.000, 0.604, 0.180); // #FF9A2E hot amber mid/edge
    vec3 eWhite = vec3(0.953, 0.937, 0.886); // #F3EFE2 warm-white shock front
    vec3 eCore  = vec3(0.980, 0.972, 0.945); // warm-white CENTER (filmic, never pure white)
    vec3 exCol = mix(eDark, eRed,  smoothstep(0.0, 0.18, e));
    exCol = mix(exCol, eAmbr,  smoothstep(0.18, 0.46, e));
    exCol = mix(exCol, eWhite, smoothstep(0.46, 0.80, e));
    exCol = mix(exCol, eCore,  smoothstep(0.92, 1.12, e));
    float exLuma = dot(exCol, vec3(0.299,0.587,0.114));
    exCol = mix(vec3(exLuma), exCol, uSat);  // respect global desaturation

    // ember (black hole) → explosion (morph) → sun (giant)
    vec3 col = mix(emberCol, exCol, clamp(vExplode, 0.0, 1.0));
    col = mix(col, sunCol, vGiant);

    // === STATE TINTS ======================================================
    // Yellow (sun) is a full port of the standalone Sun render's colour grade;
    // nebula and pale-blue-dot remain flat placeholders.
    if(vPlaceholder > 0.5){
      vec3 pcol = col;
      if(vPlaceholder < 1.5){
        // -- sun (ported recipe): gold for the yellow star, deep red for the
        //    red giant. vSunRed (0 gold / 1 red) selects the palette. ---------
        if(vSunFlare > 0.5){
          // coronal loops / prominences: hot plasma, deep cool tip → bright root.
          float ht = clamp(vSunHot, 0.0, 1.0);
          // gold-sun flare ramp
          vec3 gfc = mix(vec3(1.0, 0.40, 0.06), vec3(1.0, 0.72, 0.26), smoothstep(0.2, 0.6, ht));
          gfc = mix(gfc, vec3(1.0, 0.94, 0.78), smoothstep(0.6, 1.0, ht));
          // red-giant flare ramp: molten ember root → sodium orange → rare hot edge. The
          // base is pulled into the deep-ember shadow band (#4E0E05, matching the molten-red
          // surface shadow stop) so flares read as molten surface activity, not glowing gold;
          // only the hottest tip reaches sodium/hot-edge (those stops are UNCHANGED).
          vec3 rfc = mix(vec3(0.282, 0.044, 0.018), vec3(0.690, 0.166, 0.046), smoothstep(0.2, 0.62, ht));
          rfc = mix(rfc, vec3(0.906, 0.392, 0.094), smoothstep(0.62, 0.88, ht));
          rfc = mix(rfc, vec3(0.906, 0.392, 0.094), smoothstep(0.88, 1.0, ht)); // (gold crest killed → sodium orange #E76418 per grade)
          pcol = mix(gfc, rfc, vSunRed);
        } else {
          // PHOTOSPHERE: the warm field vSunM drives a 5-stop ramp. The gold ramp
          // (umbra→red→orange→gold→pale yellow) is the standalone Sun render; the
          // red-giant ramp stays deep maroon→blood-red→red-orange (no gold/white)
          // so the big star reads unmistakably RED.
          float m = vSunM;
          // At the gold swap-in (vYrMix→0) flatten the mottle toward its mean so
          // the cloud reads as a SMOOTH gold ball (no granulation); it relaxes to
          // the true grainy field as it reddens (vYrMix→1). vYrMix is 1 (no-op)
          // for the settled red giant and every other stage.
          float mEff = mix(0.62, m, vYrMix);
          // gold (yellow sun) — unchanged; only reached when vSunRed<1 (mesh's job),
          // so for the cloud (vSunRed=1) this term is mixed out below.
          // PALETTE (yellow-star spec): pale gold / soft cream. The crest is nudged
          // toward a soft CREAM (green/blue lifted 0.84/0.40 → 0.90/0.62) so the bright
          // photosphere reads pale-gold-into-cream, not a saturated orange-gold.
          // Dark-vein attenuation for the LOW tier (preserved from the device-tier work):
          // fat grains (uPointGain>1) turn each dark-veined grain into a visible PIT
          // instead of soft mottling, so we soften the network depth as grains fatten.
          // With the lighter re-tune (uPointGain ~2.0 not ~4.8) this lands around ~0.88 —
          // a gentle touch that keeps convection visible while the cheap bloom blurs out
          // any residual pitting. EXACTLY 1.0 at uPointGain==1.0 → byte-identical on high.
          // The red-giant ramp below also reads this, so it MUST be declared here.
          float veinAtten = 1.0 / (1.0 + 0.13 * (uPointGain - 1.0)); // 1.0 high → ~0.88 low
          vec3 sc = vec3(0.20, 0.028, 0.0);
          sc = mix(sc, vec3(0.72, 0.17, 0.01), smoothstep(0.10, 0.34, m));
          sc = mix(sc, vec3(1.00, 0.46, 0.08), smoothstep(0.28, 0.52, m));
          sc = mix(sc, vec3(1.00, 0.68, 0.24), smoothstep(0.52, 0.76, m));
          sc = mix(sc, vec3(1.00, 0.90, 0.62), smoothstep(0.84, 0.99, m));  // soft cream crest
          sc = mix(sc, vec3(0.20, 0.030, 0.0), vSunDark*veinAtten);

          sc += smoothstep(0.88, 0.99, m) * vec3(0.5, 0.28, 0.07);
          sc = mix(sc, vec3(1.0, 0.74, 0.30), vSunLimb*0.72);
          sc += vSunLimb * vec3(0.6, 0.32, 0.08);
          sc *= 1.15;
          // red giant — BURNT-EMBER photosphere: a DARK, HEAVY, molten mass, not a clean
          // sodium-orange sun. PALETTE (red-giant ember spec): ~70% burnt red-brown shadow
          // mass, ~20% sodium-orange body→rim, ~10% rare pale-gold hot accents. The body
          // stops are pulled DOWN into burnt-orange / red-brown (anchors #220803→#451006→
          // #7A240B→#B43A10) so the AVERAGE surface reads dark & molten; the sodium-orange
          // (#E76418) only shows on the brighter cells, and the rare hot edge (#FF9E2C) sits
          // at the extreme top of the value range. Surrounding space stays TRUE BLACK.
          // The smoothstep windows are shifted UP so the burnt-mass band owns the bulk of
          // the surface and only the noise tail reaches the hot stops.
          // MOLTEN-RED PASS (GREEN-DOMINANT): the SHADOW + MIDTONE stops are pushed toward
          // saturated ember red — red held ~steady, GREEN (and blue) pulled DOWN — so the body
          // mass reads as deep molten red, not burnt amber. A hue/saturation move, NOT a
          // brightening: R/G climbs sharply in every shadow+mid stop while LUMINANCE holds flat
          // or DROPS (the body/ember stops read slightly DARKER, never brighter). The smoothstep
          // windows are unchanged (body still ~70% of the surface). Rim (#E76418) and the
          // pale-gold crest (#FF9E2C) and their windows are UNTOUCHED.
          vec3 rc = vec3(0.109, 0.016, 0.008);                  // #1D0402 ember floor — deep red (was #220803); shadows pulled −5% per grade
          rc = mix(rc, vec3(0.268, 0.042, 0.017), smoothstep(0.06, 0.30, mEff)); // #480B05 deep ember shadow mass (was #451006); shadows pulled −5% per grade
          rc = mix(rc, vec3(0.470, 0.100, 0.028), smoothstep(0.26, 0.56, mEff)); // #781A07 molten red body (DOMINANT; was #7A240B)
          rc = mix(rc, vec3(0.690, 0.166, 0.046), smoothstep(0.58, 0.80, mEff)); // #B02A0C molten ember (greener-down; was #B43A10)
          rc = mix(rc, vec3(0.906, 0.392, 0.094), smoothstep(0.80, 0.93, mEff)); // #E76418 sodium orange (active cells) — UNCHANGED rim
          rc = mix(rc, vec3(0.906, 0.392, 0.094), smoothstep(0.94, 1.0, mEff));  // hot edge (RARE crest) — (gold crest #FF9E2C killed → sodium orange #E76418 per grade; window unchanged)
          // Dark ember umbrae / veins. veinAtten (declared with the gold ramp above, 1.0
          // on high) softens the vein depth on the LOW tier — few + fat grains (uPointGain>1)
          // would otherwise punch each dark-veined grain into a visible PIT instead of soft
          // mottling. Byte-identical on the high path; the ember colour is unchanged.
          rc = mix(rc, vec3(0.065, 0.010, 0.005), vSunDark*vYrMix*veinAtten); // #110301 deep ember umbrae/dark veins (green down, red held); shadows pulled −5% per grade
          // sodium-orange limb (forward-scattered) — a HOT edge, not a creamy-white wash.
          // Pulled toward sodium orange (#E76418→#FF9E2C) and the wide-band weight cut so it
          // doesn't flood the outer body with bright rim.
          rc = mix(rc, vec3(0.906, 0.392, 0.094), vSunLimb*0.45*vYrMix);
          rc += vSunLimb * vec3(0.40, 0.16, 0.03) * vYrMix;

          // gold swap-in target: a clean warm gold that matches the yellow mesh,
          // so the flash-masked mesh→cloud handoff is seamless. Lerp gold → red
          // by vYrMix (single monotonic curve; no red→yellow→red path).
          vec3 goldC = mix(vec3(0.70, 0.30, 0.04), vec3(1.00, 0.66, 0.20),
                           smoothstep(0.2, 0.9, mEff));
          vec3 redBody = mix(goldC, rc, vYrMix);
          // vSunRed is 1 for the cloud, so this selects redBody; the mesh path
          // (vSunRed<1, gold sc) is unaffected.
          pcol = mix(sc, redBody, vSunRed);
          // whiten under the swap flash so the incoming gold cloud frames bloom to
          // match the mesh handoff (subtle — a warm brightening, not a white-out).
          // No-op when uYrFlash=0.
          pcol = mix(pcol, vec3(1.0, 0.92, 0.78), clamp(uYrFlash, 0.0, 1.0) * 0.08);

          // CORE-SWALLOW HEATING: as each patch of gas falls into the core (vEaten 0→1)
          // it compresses and HEATS — the colour ramps red → orange → white-hot. Two
          // stops so it lingers red for most of the fall then whitens near the core.
          // Gated by vSunRed so only the red giant heats (the gold sun path is untouched).
          float heatK = pow(clamp(vEaten, 0.0, 1.0), 1.5) * vSunRed;
          vec3 hotMid = vec3(1.0, 0.55, 0.15);                 // red → hot orange
          vec3 hotWhite = vec3(1.0, 0.95, 0.88);               // → near-white core
          pcol = mix(pcol, hotMid,   smoothstep(0.0, 0.6, heatK));
          pcol = mix(pcol, hotWhite, smoothstep(0.55, 1.0, heatK));

          // CLICK-ERUPTION HEAT: where points launch into the geyser column / the
          // ripple crest passes (vEruptGlow > 0) the plasma flares HOT — but it stays in
          // the RED-GIANT palette, NEVER whitening. The giant is blood-red, so its
          // eruption is hot RED plasma: it ramps from the giant's own blood-red up to a
          // bright RED-ORANGE at the column root (the equivalent of the mesh eruption's
          // fully-red end), staying in the same hue family as the surrounding surface —
          // brighter and more saturated, but no gold/white/pink. Gated by vSunRed (red
          // giant only); additive + capped so it can't blow to white under bloom. No-op
          // when vEruptGlow=0. (Stops mirror the red-giant ramp r3..r4 in sun.glsl.ts.)
          float eg = clamp(vEruptGlow, 0.0, 2.0) * vSunRed;
          // The plume reads as hot SODIUM-ORANGE plasma, in the SAME hue family as the
          // (now sodium-orange) surface — the green channel is raised across all three
          // stops so the geyser matches the body instead of skewing blood-red. NO white,
          // NO pink — the hottest root only reaches a bright sodium orange. Gated by
          // vSunRed (red giant only). The grains carry these colours as they arc off the
          // limb, so the geyser particles themselves read sodium orange.
          vec3 eRed  = vec3(0.690, 0.166, 0.046); // #B02A0C molten ember (giant surface, hotter than body; greener-down to match the molten-red body stop)
          vec3 eOrng = vec3(0.906, 0.392, 0.094); // #E76418 sodium orange (plume body) — UNCHANGED
          vec3 eRoot = vec3(0.906, 0.392, 0.094); // hot edge at the root (active region, no white) — (gold crest #FF9E2C killed → sodium orange #E76418 per grade)
          pcol = mix(pcol, eRed,  smoothstep(0.0, 0.6, eg));   // base of the plume heats to sodium orange
          pcol = mix(pcol, eOrng, smoothstep(0.5, 1.2, eg));   // brighter sodium orange up the column
          pcol += eRoot * smoothstep(0.9, 1.8, eg) * 0.5;      // hot sodium-orange glow at the root (additive)
        }
      } else if(vPlaceholder < 2.9){
        // nebula (smoky-blue, backlit-haze look): the eye should read SMOKE lit from
        // within — deep navy in the thin gas, climbing through teal/cyan as the gas
        // gets denser/hotter, blowing out to a cool WHITE in the bright cores. This is
        // a near-monochrome BLUE cloud (the iStock/Hubble blue-nebula reference), not
        // the multi-hue SHO rainbow: hue barely shifts, BRIGHTNESS carries the form.
        // vNeb walks the cool ramp; the hottest gas (vHeat) pushes toward white.
        // PALETTE (nebula spec): cold blue-white dominant / FAINT VIOLET / minimal
        // amber accents. The navy + mid stops carry a faint VIOLET cast (red lifted a
        // touch relative to green so the deep gas reads blue-violet, not pure navy);
        // the dense-gas stop is pulled toward cold BLUE-WHITE (red lifted 0.34→0.55 so
        // it no longer reads cyan/teal); the crest stays cold blue-white.
        // ITEM 5 palette: the COLDEST scene after the black hole — push the OUTER gas
        // toward BLUE-VIOLET and keep the mid cold-white/ice. cNavy -> violet #7D6AE8
        // (the deep outer haze), cBlue -> blue #8EA8FF, cCyan -> cold-white #DDE7FF,
        // cIce -> ice #BFD4FF. A small soft cream/gold core (#E8C46A) is mixed in only at
        // the very centre below (it comes from the just-formed yellow star). The eye-reset
        // after the warm red/yellow chapters: a cold violet-blue cloud, not a teal one.
        float rr = clamp(vNeb, 0.0, 1.0);
        vec3 cNavy = vec3(0.49, 0.42, 0.91);  // 0.00 deep VIOLET #7D6AE8 (thin outer haze)
        vec3 cBlue = vec3(0.56, 0.66, 1.00);  // 0.35 blue #8EA8FF (mid-outer gas)
        vec3 cCyan = vec3(0.87, 0.91, 1.00);  // 0.70 cold-white #DDE7FF (denser gas)
        vec3 cIce  = vec3(0.75, 0.83, 1.00);  // 1.00 ice #BFD4FF (hot cores, cold blue-white)
        vec3 ncol = mix(cNavy, cBlue, smoothstep(0.00, 0.40, rr));
        ncol = mix(ncol, cCyan, smoothstep(0.35, 0.78, rr));
        ncol = mix(ncol, cIce,  smoothstep(0.74, 1.00, rr));
        // ITEM 5: MINIMAL warm accents — sparser + fainter than before so the cloud reads
        // dominantly cold violet-blue (the eye-reset). Reduced to ~3% of grains at low tint.
        float amberPick = step(0.97, fract(vSeed * 71.7));        // ~3% of grains (was ~6%)
        vec3 cAmber = vec3(0.91, 0.77, 0.42);                     // faint soft-gold #E8C46A accent
        ncol = mix(ncol, cAmber, amberPick * 0.40 * (0.4 + 0.6*rr));
        // MASS → HEAT → COLOUR: the densest gas clusters carry the most mass. ITEM 5: the
        // VERY-CENTRE dense core takes a small soft CREAM/GOLD tint (#E8C46A) — it comes
        // from the just-formed yellow star at the centre — while the rest of the cores stay
        // cold blue-white. The gold is gated to the densest gas (high vHeat) so it only
        // shows in the very centre; the broad cloud stays cold violet-blue.
        float core = smoothstep(0.85, 1.70, vHeat);              // dense/hot cores
        ncol = mix(ncol, vec3(0.62, 0.74, 1.00), core*0.45);     // cold azure cores (less green)
        ncol = mix(ncol, vec3(0.91, 0.77, 0.42), smoothstep(1.45, 1.85, vHeat)*0.42); // small soft-gold CENTRE core (#E8C46A)
        // scattered young stars read crisp blue-white, off-ramp.
        ncol = mix(ncol, vec3(0.85, 0.92, 1.00), step(2.4, vPlaceholder));
        // GRAVITATIONAL COLLAPSE — WARM GOLD ACCRETION RAMP: as gas accretes onto the
        // forming star (vSimLife 1→0) it is COMPRESSED → heats up → and must WARM toward
        // the GOLD of the YELLOW star it is feeding (NOT hot blue-white — that conflicted
        // with the gold sun and read as a messy blue flash mid-infall). Each grain ramps
        // cold-blue nebula → warm WHITE → gold as accreteHeat goes 0→1, so the convergence
        // visibly heats from the nebula's cold palette into the star's photosphere colour.
        //   • warm-white waypoint (#FFEBCC) at the mid stop so the path goes
        //     cold-blue → warm-white → gold (a clean two-leg warm ramp), never a muddy
        //     direct blue→gold lerp through grey.
        //   • the gold target (#FFDB73 ≈ vec3(1.00,0.86,0.45)) matches the yellow star's
        //     photosphere band (the gold swap-in #FFA833 ≈ vec3(1.0,0.66,0.20) and the
        //     soft-cream crest vec3(1.0,0.90,0.62) in the sun ramp above), so a grain that
        //     reaches the core is already the star's colour → seamless merge, no recolour pop.
        float accreteHeat = 1.0 - clamp(vSimLife, 0.0, 1.0);
        vec3 warmWhite = vec3(1.00, 0.92, 0.80);                 // #FFEBCC warm-white waypoint (heating gas)
        vec3 goldStar  = vec3(1.00, 0.86, 0.45);                 // #FFDB73 photosphere gold (matches the yellow sun)
        ncol = mix(ncol, warmWhite, smoothstep(0.08, 0.50, accreteHeat)); // cold-blue → warm white (first leg)
        ncol = mix(ncol, goldStar,  smoothstep(0.45, 0.92, accreteHeat)); // warm white → gold (second leg, into the star)
        pcol = ncol;
      } else {
        // pale blue dot: the famous faint blue point. Pushed a step bluer than the old
        // near-white (0.87,0.92,1.0): the dot grade desaturates (gradeSat 0.72), which
        // was washing the speck to plain grey-white — starting bluer survives the grade
        // and lands on a readable PALE BLUE, still far from a saturated sci-fi cyan.
        pcol = vec3(0.72, 0.84, 1.0);
      }
      col = pcol;
    }

    float inten = vBright * a;
    // OPENING PALE-BLUE-DOT BREATHES WITH LIGHT (brightness only — no size change).
    // The lone speck at the top of the page (vPlaceholder == 3.0) doesn't enter any of
    // the state branches below, so its brightness is just this baseline. Modulate it
    // with a slow sine — a quiet swell-and-fade of light, not a flicker. The factor
    // averages ~1.0 (so normal brightness is preserved) and stays in 0.44..1.12 so the
    // dot never fully vanishes nor blows out. We drive it from uDotTime, NOT uTime: the
    // disk's uTime is frozen to 0 across the nebula window (which the opening dot is part
    // of), so it can't animate; uDotTime is the dedicated always-live clock. Under
    // reduced motion uDotTime is 0 → the dot holds steady at 0.78 (no pulse), as desired.
    if(vPlaceholder > 2.5 && vPlaceholder < 3.5){
      float dotPulse = 0.74 + 0.40 * sin(uDotTime * 2.1);   // ~0.34..1.14, ~3s period: a visible heartbeat
      inten *= dotPulse;
    }
    if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
      inten *= clamp(vNebGrow, 0.0, 1.0);
    }
    // Yellow (sun): the photosphere ramp colour already encodes surface
    // luminance, so drive its intensity mostly from coverage (×a) with a gentle
    // lift — keeps the gold gradient true instead of clipping to white, and lets
    // the bloom/grade passes supply the glow (as the standalone render's bloom
    // does). Atmosphere particles (loops/jets/knots) keep their full additive
    // brightness so they read as glowing plasma against the disc.
    if(vPlaceholder > 0.5 && vPlaceholder < 1.5){
      if(vSunFlare > 0.5){
        inten = a * clamp(vBright, 0.0, 2.2);
      } else {
        // bigger overlapping photosphere grains accumulate additively → keep
        // per-grain intensity low so the disc stays in gamut and the cells show.
        // The gold swap-in BALL (vYrMix→0) used to be LIFTED 1.4× — but that made the
        // particle cloud noticeably BRIGHTER than the dimmer mesh sun that swaps in,
        // so the swap read as a brightness DROP (bright white blob → dim gold sphere).
        // Pull the cloud-ball factor DOWN to 0.50 so the smooth particle sphere lands
        // at/just-below the mesh brightness → the cloud→mesh handoff is continuous.
        // (vYrMix=1, the settled red giant + every other stage, is the 1.0 no-op end.)
        inten = a * (0.22 + 0.42*clamp(vBright, 0.0, 1.3)) * mix(0.50, 1.0, vYrMix);
      }
      // CORE-SWALLOW DIM: as the gas falls into the core (vEaten→1) the photosphere
      // collapses to a dense speck and DIMS — hold full brightness through most of the
      // fall, then fade in the last third so the collapsed core reads dark, not a bright
      // dot. Ramps only in the back half of the swallow so the bright body holds first.
      float eatenDim = smoothstep(0.45, 1.0, vEaten);
      inten *= 1.0 - 0.82*eatenDim;
      // CLICK-ERUPTION LIFT: erupting/rippling grains glow brighter so the jet + crest
      // read as luminous plasma, not just a recolour. Additive on top of the body
      // brightness; capped so the giant stays in gamut. No-op when vEruptGlow=0.
      inten *= 1.0 + 1.1*clamp(vEruptGlow, 0.0, 2.0);
    }
    // nebula: per-grain intensity stays MODERATE so the overlapping soft grains
    // accumulate additively into luminous gas WITHOUT clipping to white — the SHO
    // colour ramp (teal → rust) must survive. The diffuse gas carries the glow now
    // (it's the dominant lane, viewed from outside), so it's lifted enough to read as
    // continuous nebulosity; filaments are the brighter wisps. Bloom glows on top.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.4){
      if(vNebLane > 0.5){
        inten = a * (0.10 + 0.34*clamp(vBright, 0.0, 2.2));   // soft lit thread
      } else {
        // diffuse smoke: thin haze stays DIM, but the dense pockets (high vHeat) bloom
        // into bright lit cores → the strong dim↔bright contrast of backlit smoke.
        // ITEM 5: the CENTRAL bright cores are pulled DOWN ~20% (core boost 2.2 -> 1.75)
        // so the bright centre — which sits behind the left text column — reads quieter,
        // letting the headline keep authority. The dim haze is unchanged.
        float coreBoost = smoothstep(0.7, 1.4, vHeat);        // 0 in haze → 1 in dense cores
        inten = a * (0.04 + 0.26*clamp(vBright, 0.0, 1.3)) * (1.0 + 1.75*coreBoost);
      }
      inten *= vNebLight;   // ambient+depth light model: dim far / self-occluded gas
    } else if(vPlaceholder > 2.4 && vPlaceholder < 2.9){
      inten = a * clamp(vBright, 0.0, 4.0);          // young-star knot: bright point
    }
    // GLOBAL COLLAPSE DENSITY FADE — multiplied in AFTER the nebula formulas above (which
    // floor per-grain intensity and so cannot be driven to zero through vBright), so the
    // collapse window's density envelope (lifecycle's nebFade, 1 → 0 as the gas finishes
    // agglomerating onto the star) truly empties the cloud. Covers the whole nebula family
    // (diffuse haze, filaments, young-star knots); 1 (no-op) outside the collapse window.
    if(vPlaceholder > 1.5 && vPlaceholder < 2.9){
      inten *= clamp(uNebFade, 0.0, 1.0);
    }
    // GPGPU collapse glow — BRIGHTEN-INTO-CORE then a CRISP SWALLOW at the surface: as gas
    // accretes onto the core (vSimLife 1→0) it compresses and heats, so it gets BRIGHTER the
    // closer it gets — monotonically — then the star EATS it: a sharp flash-and-wink-out right
    // at the photosphere, so the eye reads "the star consumed that grain" rather than "the gas
    // softly dissolved near the star". Behaviour:
    //   • brightness ramps UP smoothly across the whole infall (1.0 → ~2.0× at the surface), so
    //     each grain glows hotter as it spirals in and merges, matching the warm-gold colour
    //     ramp above — dispersed cold gas condenses into a brighter, warmer point. Lifted 1.8→
    //     2.0× so the final pre-swallow flare pops a touch more (the grain blazes as it lands).
    //   • the fade-out is SHARP and pinned to the photosphere: smoothstep(0.90, 0.985) — a
    //     narrower, later band than the old (0.85, 0.99) soft dissolve — so the grain holds full
    //     brightness right up to the surface then WINKS OUT in a tight sliver as it is absorbed
    //     and the opaque mesh star takes over. Crisp swallow, never a lingering mid-air fade.
    float accrete = 1.0 - clamp(vSimLife, 0.0, 1.0);   // 0 free gas → 1 fully parked
    inten *= 1.0 + 1.0*smoothstep(0.0, 0.92, accrete); // monotonic heat brightening (→ ~2.0× at the core, blazes as it lands)
    inten *= 1.0 - smoothstep(0.90, 0.985, accrete);   // SHARP wink-out at the photosphere (the star eats it; mesh takes over)
    // Half-res pass energy conservation: fold in the vertex's raster-floor
    // compensation (exactly 1.0 on the full-res path → no-op). Applied BEFORE the
    // tail discard so the epsilon tests the true final contribution.
    inten *= vSizeComp;
    // --- INVISIBLE-TAIL DISCARD (fill-rate trim) ---------------------------------
    // Placed LAST, after every state multiplier has been folded into inten, so the
    // test sees the exact value that would have been blended. Sub-epsilon fragments
    // are the gaussian-tail / dim-grain residue below the HalfFloat pipeline's visible
    // threshold — discarding them skips the additive blend/ROP cost they'd otherwise
    // pay. The PALE DOT (vPlaceholder ≈ 3) is excluded: its halo is ~50 deliberately
    // whisper-dim sprites whose SUM is the design (and the dot draws ~400 sprites
    // total — no fill to win there). This material renders depthTest:false and the
    // shader already discards (d > 0.5), so no early-z is lost. uTailEps = 0 disables
    // (inten is never < 0) → byte-identical original output for A/B.
    if(vPlaceholder < 2.9 && inten < uTailEps) discard;
    gl_FragColor = vec4(col * inten, 1.0);
  }
`;function gr(o,t,u,n=!1,p=!1){const c=Math.floor(t),e=ns(c,I.diskParticles,n,p),f=new Float32Array(c),d=new Float32Array(c),a=new Float32Array(c),m=new Float32Array(c);for(let T=0;T<c;T++){f[T]=Math.random(),d[T]=Math.random()*Math.PI*2;const L=Math.random()*2-1;a[T]=L*L*L,m[T]=Math.random()}const h=ps(c),i=new Float32Array(c*2);for(let T=0;T<c;T++)i[T*2+0]=(T%h.width+.5)/h.width,i[T*2+1]=(Math.floor(T/h.width)+.5)/h.height;const l=new $e;l.setAttribute("aU",new k(f,1)),l.setAttribute("aPhase",new k(d,1)),l.setAttribute("aThickN",new k(a,1)),l.setAttribute("aSeed",new k(m,1)),l.setAttribute("aSimUV",new k(i,2)),l.setAttribute("position",new k(new Float32Array(c*3),3)),l.boundingSphere=new He(new M(0,0,0),1e4);const E={uTime:{value:0},uDotTime:{value:0},uOmega0:{value:I.omega0},uSpinDir:{value:I.spinDir},uBetaScale:{value:I.betaScale},uBeamExp:{value:I.beamExp},uDoppler:{value:I.doppler},uRin:{value:I.rIn},uRout:{value:I.rOut},uThick:{value:I.diskThickness},uPixelRatio:{value:u},uThetaE:{value:.1},uShadowR:{value:.1},uAspect:{value:1},uImageSign:{value:1},uSat:{value:I.saturation},uSec:{value:I.secScale},uSecOffsetX:{value:0},uSecOffsetY:{value:0},uHole:{value:.12},uVertAsym:{value:I.vertAsym},uHorizAsym:{value:I.horizAsym},uDistrib:{value:I.diskDistrib},uBlackHoleScale:{value:1},uVisibleRatio:{value:1},uVisibleBrightGain:{value:1},uBright:{value:1.25*e.brightGain},uSizeScale:{value:1},uTailEps:{value:pr},uPointGain:{value:e.pointGain},uMorph:{value:0},uFlash:{value:0},uCollapse:{value:0},uGiant:{value:0},uGiantR:{value:4.2},uGiantScale:{value:10.5/4.2},uGiantCenter:{value:new M(0,0,0)},uGiantSpin:{value:0},uGranScale:{value:26},uGranTex:{value:null},uGranBakeReady:{value:0},uBlastTex:{value:null},uBlastBakeReady:{value:0},uYellow:{value:0},uNebula:{value:0},uDot:{value:0},uNebulaGrow:{value:1},uNebLight:{value:1},uNebFade:{value:1},uYrFlash:{value:0},uYrMix:{value:1},uYrGrow:{value:1},uSimPos:{value:null},uSimPosB:{value:null},uSimMix:{value:0},uSimBlend:{value:0},uErupt:{value:Array.from({length:Xo},()=>new os(0,1,0,0))},uEruptAge:{value:Array.from({length:Xo},()=>0)}},w=new Me({uniforms:E,defines:n?{NEB_LOW_TRIM:1}:{},vertexShader:fr,fragmentShader:mr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),b=w.clone();b.uniforms=Ba.clone(E),b.uniforms.uImageSign.value=-1;const x=new Tt(l,w),A=new Tt(l,b);return x.frustumCulled=!1,A.frustumCulled=!1,o.add(x),o.add(A),{primary:w,secondary:b,primaryPts:x,secondaryPts:A,geo:l,uniforms:E,aSeed:m,aU:f,aPhase:d,count:c,dispose:()=>{o.remove(x),o.remove(A),l.dispose(),w.dispose(),b.dispose()}}}const vr=`
  attribute float aSeed;
  uniform float uTime, uPixelRatio, uShadowR, uThetaE, uAspect, uImageSign, uStarBright, uHole, uRotSpeed, uSizeScale;
  varying float vB;
  varying float vSizeComp;
  varying vec3 vTint;   // per-star colour family (warm-graphite / near-white / cool accent)

  // small hash so each star rolls an independent family without a new attribute.
  float starHash(float n){ return fract(sin(n*78.233)*43758.5453); }

  void main(){
    vSizeComp = 1.0;
    // --- STAR COLOUR FAMILIES -------------------------------------------------
    // Not one uniform tint (that reads dusty); a weighted palette so the field has
    // depth. Majority warm-graphite/bone to sit with the warm grade, a slice of
    // crisp near-white for the bright points, and a RARE cool accent so the scene
    // never goes fully beige. Brighter stars (high aSeed) bias toward near-white,
    // faint ones toward bone — bright = crisp, faint = warm (the reference look).
    // ITEM 2: cool the star families toward COLD silver so the black-hole field reads
    // cold + near-monochrome (the warm-bone majority was what made the opening read as a
    // warm space scene). The 'warmGraphite' family is renamed in spirit to a cold silver
    // (blue lifted above red), the near-white pushed faintly blue, the cool accent kept.
    float fam = starHash(aSeed*131.71 + 4.0);             // family roll 0..1
    vec3 warmGraphite = mix(vec3(0.42,0.45,0.50),         // faint cold silver
                            vec3(0.62,0.67,0.74), aSeed); // brighter cold silver
    vec3 nearWhite    = vec3(0.92,0.95,0.99);             // crisp, faintly blue-white
    vec3 coolAccent   = vec3(0.70,0.78,0.94);             // faint cobalt depth
    float roll = clamp(fam*0.78 + aSeed*0.22, 0.0, 1.0);  // bright points bias white
    vec3 tint = warmGraphite;
    tint = mix(tint, nearWhite,  step(0.74, roll));       // ~18% near-white (the bright)
    tint = mix(tint, coolAccent, step(0.92, roll));       // ~8% cool accent (rare depth)
    vTint = tint;

    // --- SLOW ORBIT AROUND THE HOLE -------------------------------------------
    // Spin the star's world position around the same ~23°-tilted pole the
    // photosphere uses BEFORE projection, so the existing per-vertex screen-space
    // lensing math below bends a MOVING field for free (the warp visibly acts on
    // orbiting stars, not a static backdrop). The hole sits at the world origin,
    // which is invariant under this rotation, so bhC stays put.
    float orbAng = uTime * uRotSpeed;
    vec3  orbAxis = normalize(vec3(sin(0.401), cos(0.401), 0.0)); // 0.401 rad ≈ 23° off world-Y
    float orbC = cos(orbAng);
    float orbS = sin(orbAng);
    // Rodrigues' rotation of position about orbAxis.
    vec3 orbPos = position * orbC
                + cross(orbAxis, position) * orbS
                + orbAxis * dot(orbAxis, position) * (1.0 - orbC);

    vec4 clip = projectionMatrix * modelViewMatrix * vec4(orbPos,1.0);
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

    // The particle target has fewer pixels, so point size must scale with its
    // resolution. Points smaller than one target pixel still rasterise as a full
    // pixel: compensate their additive intensity by (ideal / actual)^2 so the
    // bilinear full-res composite preserves the original field energy.
    if(uSizeScale < 0.999 && gl_PointSize > 0.0){
      float fullPx   = max(gl_PointSize, 1.0);
      float targetPx = fullPx * uSizeScale;
      float rasterPx = max(targetPx, 1.0);
      vSizeComp = (targetPx * targetPx) / (rasterPx * rasterPx);
      gl_PointSize = rasterPx;
    }
  }
`,br=`
  precision highp float; varying float vB; varying float vSizeComp; varying vec3 vTint;
  void main(){
    vec2 c = gl_PointCoord-0.5; if(length(c)>0.5) discard;
    float a = smoothstep(0.5,0.0,length(c));
    // per-star family tint (warm-graphite majority / crisp near-white / rare cool).
    gl_FragColor = vec4(vTint*vB*a*vSizeComp, 1.0);
  }
`,wr=`
  attribute float aShard;
  attribute float aSeed;
  uniform float uTime, uPixelRatio, uHole, uPresence;
  varying float vB;

  ${gs}

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
`,yr=`
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
`;function Sr(o,t,u,n=!1){const p=n?.5:1,c=Math.max(2500,Math.floor(t*.11*I.starDensity*p)),e=ns(t,I.diskParticles,n),f=new Float32Array(c*3),d=new Float32Array(c);for(let x=0;x<c;x++){const A=200+Math.random()*320,N=Math.random()*2-1,T=Math.random()*Math.PI*2,L=Math.sqrt(1-N*N);f[x*3+0]=A*L*Math.cos(T),f[x*3+1]=A*N,f[x*3+2]=A*L*Math.sin(T),d[x]=Math.random()}const a=new $e;a.setAttribute("position",new k(f,3)),a.setAttribute("aSeed",new k(d,1)),a.boundingSphere=new He(new M(0,0,0),1e7);const m=Math.PI*2/1200,h={uTime:{value:0},uPixelRatio:{value:u},uShadowR:{value:.1},uThetaE:{value:.15},uAspect:{value:1},uImageSign:{value:1},uStarBright:{value:I.starBright*e.brightGain},uHole:{value:.12},uRotSpeed:{value:m},uSizeScale:{value:1}},i=new Me({uniforms:h,vertexShader:vr,fragmentShader:br,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),l=i.clone();l.uniforms=Ba.clone(h),l.uniforms.uImageSign.value=-1;const E=new Tt(a,i);E.frustumCulled=!1,o.add(E);const w=new Tt(a,l);return w.frustumCulled=!1,w.visible=!1,o.add(w),{pts:E,secPts:w,geo:a,mat:i,matSec:l,uniforms:h,dispose:()=>{o.remove(E),o.remove(w),a.dispose(),i.dispose(),l.dispose()}}}function xr(o,t){const n=new Float32Array(27),p=new Float32Array(9),c=new Float32Array(9);for(let h=0;h<9;h++)p[h]=h/8,c[h]=Math.random();const e=new $e;e.setAttribute("position",new k(n,3)),e.setAttribute("aShard",new k(p,1)),e.setAttribute("aSeed",new k(c,1)),e.boundingSphere=new He(new M(0,0,0),1e7);const f={uTime:{value:0},uPixelRatio:{value:t},uShadowR:{value:.1},uThetaE:{value:.15},uAspect:{value:1},uImageSign:{value:1},uHole:{value:.12},uPresence:{value:1}},d=new Me({uniforms:f,vertexShader:wr,fragmentShader:yr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),a=new Tt(e,d);return a.frustumCulled=!1,o.add(a),{pts:a,geo:e,mat:d,uniforms:f,dispose:()=>{o.remove(a),e.dispose(),d.dispose()}}}const Er=`
  attribute float aSeed; attribute float aS;     // aS ∈ [-1,1] along the arc
  uniform float uTime, uShadowR, uThetaE, uAspect, uImageSign, uWarp, uHole;
  varying float vB; varying float vAbs;
  void main(){
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    vec4 bhC  = projectionMatrix * modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
    bool drop = (clip.w <= 0.0);
    vec2 ndc   = clip.xy / max(clip.w,1e-4);
    vec2 ndcBH = bhC.xy  / max(bhC.w,1e-4);
    vec2 off = ndc - ndcBH; vec2 a = vec2(off.x*uAspect, off.y);
    float beta = max(length(a), 2e-4); vec2 dir = a/beta;

    // point-lens deflection (same formulae as the starfield)
    float root = sqrt(beta*beta + 4.0*uThetaE*uThetaE);
    float thetaImg = (uImageSign>0.0) ? 0.5*(beta+root) : 0.5*(beta-root);
    float u = beta/uThetaE;
    float magCore = (u*u+2.0)/(u*sqrt(u*u+4.0));
    float mag = (uImageSign>0.0) ? abs(0.5*(magCore+1.0)) : abs(0.5*(magCore-1.0));

    vec2 aImg = dir * thetaImg;                  // image position (may be opposite)
    float rNew = length(aImg);
    vec2 idir = aImg / max(rNew, 1e-5);          // radial direction of the IMAGE
    float phi0 = atan(idir.y, idir.x);

    // tangential magnification μ_t = θ/β
    float tang = rNew / beta;
    // lensed stretch: ONLY in a thin band near the ring (no orbit).
    // Beyond that, stars stay point-like -> it's the DENSITY that deforms.
    float prox = smoothstep(uThetaE*1.4, uThetaE*1.03, rNew);
    float dPhi = min(prox * 0.30 * clamp(tang-1.0, 0.0, 6.0) * uWarp, 0.20); // very short half-width (rad)
    float phi = phi0 + aS * dPhi;                // arc along the circle of radius rNew
    vec2 aP = rNew * vec2(cos(phi), sin(phi));
    vec2 ndcNew = ndcBH + vec2(aP.x/uAspect, aP.y);

    if(rNew < uHole) drop = true;
    if(uImageSign<0.0 && rNew > uThetaE*1.35) drop = true; // 2nd image confined near the ring

    gl_Position = vec4(ndcNew, 0.0, 1.0);
    float tw = 0.65 + 0.35*sin(uTime*0.7 + aSeed*40.0);
    float caustic = smoothstep(uThetaE*0.05, uThetaE*0.6, beta); // avoid near-aligned arcs being too bright
    vB = (0.2 + 0.8*aSeed) * tw * (0.3 + 0.7*prox) * clamp(mag, 0.4, 1.8) * mix(0.3, 1.0, caustic);
    if(uImageSign<0.0) vB *= 0.7;
    if(drop) vB = 0.0;
    vAbs = abs(aS);                              // 0 at the arc centre -> 1 at the ends
  }
`,Tr=`
  precision highp float; varying float vB; varying float vAbs;
  void main(){
    float fade = smoothstep(1.0, 0.05, vAbs);    // bright at centre, fades at the ends
    // ITEM 2: the lensed warp arcs read COLD silver / faint blue-white (eased a touch
    // cooler) so the bent light around the shadow stays in the cold black-hole palette.
    gl_FragColor = vec4(vec3(0.90,0.94,1.00) * vB * fade * 0.9, 1.0);
  }
`;function Ar(o,t,u=!1){const n=u?1200:Math.max(2e3,Math.floor(t*.02)),p=7,c=n*p*2,e=new Float32Array(c*3),f=new Float32Array(c),d=new Float32Array(c);let a=0;for(let x=0;x<n;x++){const A=150+Math.random()*360,N=Math.random()*2-1,T=Math.random()*Math.PI*2,L=Math.sqrt(1-N*N),F=A*L*Math.cos(T),C=A*N,X=A*L*Math.sin(T),P=Math.random();for(let $=0;$<p;$++){const se=$/p*2-1,z=($+1)/p*2-1;e[a*3]=F,e[a*3+1]=C,e[a*3+2]=X,f[a]=P,d[a]=se,a++,e[a*3]=F,e[a*3+1]=C,e[a*3+2]=X,f[a]=P,d[a]=z,a++}}const m=new $e;m.setAttribute("position",new k(e,3)),m.setAttribute("aSeed",new k(f,1)),m.setAttribute("aS",new k(d,1)),m.boundingSphere=new He(new M(0,0,0),1e7);const h={uTime:{value:0},uShadowR:{value:.1},uThetaE:{value:.15},uAspect:{value:1},uImageSign:{value:1},uWarp:{value:I.warp},uHole:{value:.12}},i=new Me({uniforms:h,vertexShader:Er,fragmentShader:Tr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),l=i.clone();l.uniforms=Ba.clone(h),l.uniforms.uImageSign.value=-1;const E=new fa(m,i);E.frustumCulled=!1,o.add(E);const w=new fa(m,l);return w.frustumCulled=!1,o.add(w),{seg:E,seg2:w,geo:m,mat:i,matSec:l,uniforms:h,dispose:()=>{o.remove(E),o.remove(w),m.dispose(),i.dispose(),l.dispose()}}}const kr=`
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
`,Rr=`
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
`,Pr=4.2,Dr=Pr*1.3,Fa=new M(1.55,.78,1.15);function Nr(o,t,u){const e=new Float32Array(2160),f=new Float32Array(720),d=new Float32Array(720),a=new Float32Array(720);for(let w=0;w<360;w++){const b=Math.random()*2-1,x=Math.random()*Math.PI*2,A=Math.sqrt(Math.max(0,1-b*b)),N=Dr*(.25+.75*Math.cbrt(Math.random())),T=A*Math.cos(x)*Fa.x*N,L=b*Fa.y*N,F=A*Math.sin(x)*Fa.z*N,C=Math.random(),X=w<7?1:0,P=w*2,$=P+1;e[P*3]=T,e[P*3+1]=L,e[P*3+2]=F,e[$*3]=T,e[$*3+1]=L,e[$*3+2]=F,f[P]=C,f[$]=C,d[P]=0,d[$]=1,a[P]=X,a[$]=X}const m=new $e;m.setAttribute("position",new k(e,3)),m.setAttribute("aSeed",new k(f,1)),m.setAttribute("aEnd",new k(d,1)),m.setAttribute("aStrong",new k(a,1)),m.boundingSphere=new He(new M(0,0,0),1e7);const h={uTime:{value:0},uPixelRatio:{value:u},uAspect:{value:1},uStreak:{value:0},uStreakDir:{value:1}},i=new Me({uniforms:h,vertexShader:kr,fragmentShader:Rr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),l=new fa(m,i);return l.frustumCulled=!1,l.visible=!1,o.add(l),{seg:l,geo:m,mat:i,uniforms:h,dispose:()=>{o.remove(l),m.dispose(),i.dispose()}}}const Mr=`
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
`,Lr=`
  precision highp float; varying float vB;
  void main(){
    vec2 c = gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // ITEM 2: the photon ring is a COLD silver / blue-white hairline (was warm 0.97,0.97,0.96),
    // so the rim of light reads cold-silver, never a warm halo.
    gl_FragColor = vec4(vec3(0.90,0.94,1.00) * vB * a * 1.0, 1.0);
  }
`;function Or(o,t,u=!1){const n=u?16e3:64e3,p=u?4:1,c=new Float32Array(n),e=new Float32Array(n);for(let i=0;i<n;i++)c[i]=Math.random()*Math.PI*2,e[i]=Math.random();const f=new $e;f.setAttribute("position",new k(new Float32Array(n*3),3)),f.setAttribute("aAng",new k(c,1)),f.setAttribute("aSeed",new k(e,1)),f.boundingSphere=new He(new M(0,0,0),1e6);const d={uTime:{value:0},uPixelRatio:{value:t},uShadowR:{value:.1},uAspect:{value:1},uHole:{value:.12},uVertAsym:{value:I.vertAsym},uHorizAsym:{value:I.horizAsym},uRingBright:{value:I.ringBright*p},uRingScale:{value:1},uMorph:{value:0}},a=new Me({uniforms:d,vertexShader:Mr,fragmentShader:Lr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),m=new Tt(f,a);return m.frustumCulled=!1,o.add(m),{pts:m,geo:f,mat:a,uniforms:d,dispose:()=>{o.remove(m),f.dispose(),a.dispose()}}}const ys=`
vec4 clipFromDesign(vec2 p) {
  return vec4(p.x / 960.0 - 1.0, 1.0 - p.y / 540.0, 0.0, 1.0);
}
`,Ss=`
uniform float uDecloak;
uniform float uTime;
float ckHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123);
}
float cloakField(vec2 p) {
  vec2 q = (p - vec2(960.0, 1015.0)) / vec2(1180.0, 1110.0);
  float travel = length(q);
  float grain = ckHash(floor(p / 17.0)) - 0.5;
  float tick = floor(uTime * 18.0);
  float shimmer = ckHash(floor(p / 8.0) + vec2(tick * 0.73, tick * 0.31)) - 0.5;
  return travel + grain * 0.10 + shimmer * 0.025 * (1.0 - uDecloak);
}
float cloakMask(vec2 p) {
  if (uDecloak >= 0.999) return 1.0;
  if (uDecloak <= 0.001) return 0.0;
  float field = cloakField(p);
  float front = uDecloak * 1.42;
  float present = 1.0 - smoothstep(front - 0.045, front + 0.055, field);
  float wave = 1.0 - smoothstep(0.035, 0.14, abs(field - front));
  float fine = ckHash(floor(p / 6.0) + floor(uTime * 20.0));
  return present * mix(1.0, 0.72 + 0.28 * fine, wave * (1.0 - uDecloak));
}
vec3 cloakTint(vec3 col, vec2 p) {
  if (uDecloak >= 0.999) return col;
  float wave = 1.0 - smoothstep(0.025, 0.13, abs(cloakField(p) - uDecloak * 1.42));
  float pulse = 0.72 + 0.28 * sin(uTime * 24.0 + p.x * 0.035 + p.y * 0.021);
  float lum = max(col.r, max(col.g, col.b));
  vec3 heat = mix(vec3(0.42, 0.68, 0.86), vec3(1.0, 0.62, 0.24), smoothstep(0.30, 0.82, uDecloak));
  return col + heat * lum * wave * pulse * 0.9;
}
`,Ir=`
uniform vec2 uLight;
uniform vec3 uStarColor;
uniform float uStarIntensity;
uniform float uNova;
float litAt(vec2 p) {
  float d = distance(p, uLight);
  float wide = exp(-d / 950.0);
  float hot = exp(-d * d / (2.0 * 240.0 * 240.0));
  return (wide * 0.65 + hot * 1.6) * uStarIntensity;
}
float vigMul(vec2 p) {
  vec2 q = vec2(p.x / 1920.0 - 0.5, 0.5 - p.y / 1080.0);
  float vig = smoothstep(1.10, 0.28, length(q) * 1.25);
  return mix(0.78, 1.0, vig);
}
vec3 novaWash(vec3 col) {
  return mix(col, vec3(1.0, 0.97, 0.92), uNova * 0.9);
}
`,Fr=`
${ys}
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vPos = position.xy;
  vUv = uv;
  gl_Position = clipFromDesign(position.xy);
}
`,Cr=`
precision highp float;
${Ir}
${Ss}
uniform sampler2D uPlate;
uniform float uAlpha;
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec4 plate = texture2D(uPlate, vUv);
  vec3 col = plate.rgb;

  // Amber pixels are the highlight mask; neutral graphite stays mostly fixed.
  float trim = smoothstep(0.10, 0.30, col.r - col.b);
  float light = min(litAt(vPos), 1.45);
  float material = plate.a * (0.018 + 0.050 * trim) * light;
  col += uStarColor * material;
  col *= vigMul(vPos);
  col = novaWash(col);
  col = cloakTint(col, vPos);

  gl_FragColor = vec4(col, plate.a * uAlpha * cloakMask(vPos));
}
`,Gr=`
attribute vec2 aPos;
attribute vec2 aNorm;
attribute float aSide;
attribute float aHalf;
attribute float aFollow;
uniform vec2 uLight;
uniform float uHudDeploy;
uniform float uHalfW;
${ys}
varying float vAcross;
varying vec2 vPos;
varying float vCover;
varying float vDeploy;
void main() {
  float drawnHalf = max(aHalf, 0.85);
  vCover = aHalf / drawnHalf;
  float deploy = smoothstep(0.0, 1.0, uHudDeploy);
  vec2 target = aPos + uLight * aFollow;
  vec2 mount = mix(vec2(960.0, 182.0), uLight, aFollow);
  vec2 p = mix(mount, target, deploy)
         + aNorm * (aSide * uHalfW * 2.0 * drawnHalf);
  vPos = p;
  vAcross = aSide;
  vDeploy = deploy;
  gl_Position = clipFromDesign(p);
}
`,Br=`
precision highp float;
${Ss}
uniform vec3 uHud;
uniform float uAlpha;
varying float vAcross;
varying vec2 vPos;
varying float vCover;
varying float vDeploy;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
  float powered = smoothstep(0.08, 0.46, vDeploy);
  gl_FragColor = vec4(uHud, uAlpha * edge * vCover * 0.78 * powered * cloakMask(vPos));
}
`,Ca=Wt/2;function $o(o,t,u,n=72){const p=[];for(let c=0;c<=n;c++){const e=c/n*Math.PI*2;p.push([o+Math.cos(e)*u,t+Math.sin(e)*u])}return p}function _r(o,t,u){const n=[];for(let p=0;p<=6;p++){const c=p/6*Math.PI*2-Math.PI/2;n.push([o+Math.cos(c)*u,t+Math.sin(c)*u])}return n}function zr(){const o=[];o.push({pts:$o(0,0,132),hw:.55,follow:1,closed:!0}),o.push({pts:$o(0,0,132*.62),hw:.35,follow:1,closed:!0});for(let d=0;d<48;d++){const a=d/48*Math.PI*2,m=d%4===0,h=128,i=h-(m?12:6);o.push({pts:[[Math.cos(a)*h,Math.sin(a)*h],[Math.cos(a)*i,Math.sin(a)*i]],hw:m?.55:.4,follow:1})}o.push({pts:_r(0,0,24),hw:.65,follow:1,closed:!0});const u=132*1.75,n=36;for(const[d,a]of[[0,-1],[0,1],[-1,0],[1,0]])o.push({pts:[[d*n,a*n],[d*u,a*u]],hw:.4,follow:1});const p=132*1.35,c=36;for(const[d,a]of[[-1,-1],[1,-1],[-1,1],[1,1]])o.push({pts:[[d*p-d*c,a*p],[d*p,a*p],[d*p,a*p-a*c]],hw:.7,follow:1});const e=182,f=300;for(let d=-6;d<=6;d++){const a=Ca+d/6*f,m=d%3===0;o.push({pts:[[a,e],[a,e+(m?16:9)]],hw:m?.7:.5,follow:0})}return o.push({pts:[[Ca-f,e],[Ca+f,e]],hw:.5,follow:0}),o}function Ur(){const o=zr(),t=[],u=[],n=[],p=[],c=[],e=[];for(const d of o){const a=d.closed?[...d.pts,d.pts[0]]:[...d.pts],m=a.length;if(m<2)continue;const h=t.length/2;for(let i=0;i<m;i++){const l=a[i],E=i>0?a[i-1]:d.closed?a[m-2]:a[0],w=i<m-1?a[i+1]:d.closed?a[1]:a[m-1];let b=l[0]-E[0],x=l[1]-E[1],A=w[0]-l[0],N=w[1]-l[1];const T=Math.hypot(b,x)||1,L=Math.hypot(A,N)||1;b/=T,x/=T,A/=L,N/=L;let F=b+A,C=x+N;const X=Math.hypot(F,C)||1;F/=X,C/=X;const P=-C,$=F,se=1/Math.max(.4,P*-x+$*b);for(const z of[-1,1])t.push(l[0],l[1]),u.push(P*se,$*se),n.push(z),p.push(d.hw),c.push(d.follow)}for(let i=0;i<m-1;i++){const l=h+i*2;e.push(l,l+1,l+2,l+1,l+3,l+2)}}const f=new $e;return f.setAttribute("aPos",new k(new Float32Array(t),2)),f.setAttribute("aNorm",new k(new Float32Array(u),2)),f.setAttribute("aSide",new k(new Float32Array(n),1)),f.setAttribute("aHalf",new k(new Float32Array(p),1)),f.setAttribute("aFollow",new k(new Float32Array(c),1)),f.setAttribute("position",f.getAttribute("aPos")),f.setIndex(e),f.boundingSphere=new He(new M(960,540,0),4e3),f}const Hr=new Vt(.88,.92,.99),Mt=[{s:0,c:[.88,.86,.8],i:.85},{s:.5,c:[1,1,1],i:1.35},{s:1.6,c:[1,.6,.36],i:1.05},{s:2.9,c:[1,.84,.52],i:1.2},{s:4,c:[.78,.85,1],i:.85},{s:4.5,c:[.74,.82,1],i:.72}];function Wr(o,t){let u=Mt[0],n=Mt[Mt.length-1];for(let e=0;e<Mt.length-1;e++)if(o>=Mt[e].s&&o<=Mt[e+1].s){u=Mt[e],n=Mt[e+1];break}const p=Math.max(1e-5,n.s-u.s),c=Math.min(1,Math.max(0,(o-u.s)/p));return t.setRGB(u.c[0]+(n.c[0]-u.c[0])*c,u.c[1]+(n.c[1]-u.c[1])*c,u.c[2]+(n.c[2]-u.c[2])*c),u.i+(n.i-u.i)*c}function Vr(){const o=new $e;return o.setAttribute("position",new k(new Float32Array([0,0,0,Wt,0,0,Wt,Ut,0,0,Ut,0]),3)),o.setAttribute("uv",new k(new Float32Array([0,1,1,1,1,0,0,0]),2)),o.setIndex([0,1,2,0,2,3]),o.boundingSphere=new He(new M(0,0,0),1e6),o}const Zo={transparent:!0,depthWrite:!1,depthTest:!1,side:ni};function Yr(){const o=new Lt,t={uDecloak:{value:0},uHudDeploy:{value:0},uTime:{value:0},uLight:{value:new sa(Wt/2,Ut*.43)},uStarColor:{value:new Vt(.88,.86,.8)},uStarIntensity:{value:.65},uNova:{value:0},uAlpha:{value:0},uHalfW:{value:.55}},u=new ri().load(Hi);u.generateMipmaps=!1,u.minFilter=Yt,u.magFilter=Yt;const n=Vr(),p={...t,uPlate:{value:u}},c=new Me({uniforms:p,vertexShader:Fr,fragmentShader:Cr,...Zo}),e=new ct(n,c);e.frustumCulled=!1,e.renderOrder=40,e.visible=!1,o.add(e);const f=Ur(),d={...t,uHud:{value:Hr.clone()}},a=new Me({uniforms:d,vertexShader:Gr,fragmentShader:Br,...Zo}),m=new ct(f,a);m.frustumCulled=!1,m.renderOrder=41,m.visible=!1,o.add(m);const h=[e,m];let i=0,l=0,E=-1,w=null;const b=new Vt;return{frame:(T,L,F,C,X,P)=>{(w===null||X!==w)&&(w=X,l=i,E=C);const $=w?1.8:.8,se=Math.min(1,Math.max(0,(C-E)/$)),z=w?se*(.85+.15*se):se*se;i=l+((w?1:0)-l)*z;const de=i>.001;if(e.visible=de,m.visible=de,!de)return;t.uDecloak.value=i,t.uHudDeploy.value=Math.min(1,Math.max(0,(i-.46)/.48)),t.uTime.value=C,t.uAlpha.value=1,t.uNova.value=P;const U=Math.max(-200,Math.min(Wt+200,(T*.5+.5)*Wt)),ne=Math.max(-200,Math.min(Ut+200,(1-(L*.5+.5))*Ut));t.uLight.value.set(U,ne),t.uStarIntensity.value=Wr(F,b),t.uStarColor.value.copy(b),t.uHalfW.value=.5*(Ut/window.innerHeight)},render:(T,L)=>{if(i<=.001)return;const F=T.autoClear;T.autoClear=!1,T.render(o,L),T.autoClear=F},dispose:()=>{for(const T of h)o.remove(T);n.dispose(),f.dispose(),c.dispose(),a.dispose(),u.dispose()}}}const xs=`
  vec3 blueshiftColor(float shift, vec3 warm, vec3 blue) {
    float t = clamp((shift - 1.0) / 1.5, 0.0, 1.0);
    return mix(warm, blue, t);
  }
`,jr=`
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
`,qr=`
  precision highp float;
  varying float vI;
  varying float vB;
  ${xs}
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
`,Kr=`
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
`,Xr=`
  precision highp float;
  varying float vI;
  varying float vB;
  ${xs}
  void main(){
    // Additive; graded by the same blueshift ramp as the head so a photon and
    // its streak read as ONE object — warm dim silver far out, blue-white where
    // the arc whips the rim. The streak carries the visual (heads are dim).
    vec3 col = blueshiftColor(vB, vec3(0.78, 0.80, 0.84), vec3(0.75, 0.90, 1.00));
    gl_FragColor = vec4(col * vI, 1.0);
  }
`,ke=768,$r=8,Jo=.08,Zr=3.5,Qo=.5,es=2,Jr=.05,ts=9,Qt=I.coreSize*I.holeFactor,Qr=.05,en=.175,tn=1.75,an=.35,as=4,on=.5,sn=60,rn=.28,nn=.45,ln=6.5,hn=.0015,cn=.6,dn=2.5,un=.3,Ue=20,Et=Ue-1,pn=.85;function fn(o){const t=new Float32Array(ke*3),u=new Float32Array(ke*3),n=new Float32Array(ke),p=new Float32Array(ke),c=new Float32Array(ke),e=new Float32Array(ke),f=new Uint8Array(ke),d=new Float32Array(ke),a=new Float32Array(ke),m=new Float32Array(ke),h=new $e;h.setAttribute("position",new k(t,3)),h.setAttribute("aI",new k(d,1)),h.setAttribute("aS",new k(a,1)),h.setAttribute("aB",new k(m,1)),h.boundingSphere=new He(new M(0,0,0),1e6);const i=new Me({uniforms:{uPixelRatio:{value:typeof window>"u"?1:Math.min(window.devicePixelRatio||1,2)},uSize:{value:ln}},vertexShader:jr,fragmentShader:qr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),l=new Tt(h,i);l.frustumCulled=!1,o.add(l);const E=new Float32Array(ke*Ue*3),w=new Uint8Array(ke),b=new Uint8Array(ke),x=new Uint8Array(ke),A=new Float32Array(ke*Et*2*3),N=new Float32Array(ke*Et*2),T=new Float32Array(ke*Et*2),L=new $e;L.setAttribute("position",new k(A,3)),L.setAttribute("aI",new k(N,1)),L.setAttribute("aB",new k(T,1)),L.boundingSphere=new He(new M(0,0,0),1e6);const F=new Me({vertexShader:Kr,fragmentShader:Xr,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),C=new fa(L,F);C.frustumCulled=!1,o.add(C),l.visible=!1,C.visible=!1;const X=new M,P=new M,$=new M,se=new M,z=new M,de=new M,U=new M,ne=new M,Z=new M,fe=new M;let Ze=99,We=99,ee=0,Ve=!1,pt=0,G=0;const Be=()=>{for(let O=0;O<ke;O++)if(f[O]===0)return O;return-1},Le=()=>{z.copy(P);const O=z.length(),B=tn*Qt;if(O<=B+1e-4)return;z.multiplyScalar(1/O),U.copy(Z).addScaledVector(z,-Z.dot(z)),U.lengthSq()<1e-8&&(U.crossVectors(z,de),U.lengthSq()<1e-8&&U.set(0,1,0),Math.random()<.5&&U.multiplyScalar(-1)),U.normalize();const Fe=B/O;ne.copy(z).multiplyScalar(-Math.sqrt(Math.max(0,1-Fe*Fe))).addScaledVector(U,Fe),Z.normalize().lerp(ne,an).normalize()},me=O=>{const B=Be();B<0||(Le(),Z.normalize().multiplyScalar(ts),t[B*3]=P.x,t[B*3+1]=P.y,t[B*3+2]=P.z,u[B*3]=Z.x,u[B*3+1]=Z.y,u[B*3+2]=Z.z,n[B]=O,p[B]=1,c[B]=0,e[B]=0,f[B]=1,w[B]=1,b[B]=0,E[B*Ue*3]=P.x,E[B*Ue*3+1]=P.y,E[B*Ue*3+2]=P.z,G++)},Q=O=>{f[O]=0,d[O]=0,a[O]=0,x[O]&&(N.fill(0,O*Et*2,(O+1)*Et*2),x[O]=0),G--};return{pts:l,update:(O,B,Fe,le,ie)=>{const ge=Fe<=0?1:Math.max(0,1-Fe/nn),dt=Math.hypot(le-Ze,ie-We),ye=Math.abs(Ze)<=1.5,ft=dt>hn&&ye,r=ft&&O>0?dt/O:0,v=Math.min(1,Math.max(0,(r-Jo)/(Zr-Jo))),D=v*v*(3-2*v),Y=Qo+(es-Qo)*D;let y=0;ft&&ge>0?(ee+=$r*Math.max(D,Jr)*ge,y=Math.floor(ee),ee-=y):ee=0;const he=ge>0?Math.round(pt*ge):0;if(pt=0,y+he>0&&O>0){const S=X.set(0,0,0).project(B).z;if(P.set(le,ie,S).unproject(B),B.getWorldDirection(de),y>0){$.set(Ze,We,S).unproject(B),se.copy(P).sub($);const ae=se.lengthSq()>1e-8;ae&&se.normalize();for(let J=0;J<y;J++){if(ae){U.crossVectors(se,de),U.lengthSq()<1e-8&&U.set(0,1,0),U.normalize();const Je=(Math.random()*2-1)*en;Z.copy(se).multiplyScalar(Math.cos(Je)).addScaledVector(U,Math.sin(Je))}else z.copy(P),z.lengthSq()<1e-8&&z.set(1,0,0),z.normalize(),U.crossVectors(z,de),U.lengthSq()<1e-8&&U.set(0,1,0),U.normalize(),Math.random()<.5&&U.multiplyScalar(-1),Z.copy(U).addScaledVector(z,(Math.random()-.65)*.45);me(Y)}}if(he>0){z.set(0,1,0).cross(de),z.lengthSq()<1e-8&&z.set(1,0,0),z.normalize(),U.crossVectors(de,z).normalize();for(let ae=0;ae<he;ae++){const J=(ae+Math.random()*.8)/he*Math.PI*2;Z.copy(z).multiplyScalar(Math.cos(J)).addScaledVector(U,Math.sin(J)),me(es)}}}Ve=!Ve;for(let S=0;S<ke;S++){const ae=f[S];if(ae===0)continue;if(ae===2){e[S]+=O;const j=Math.min(1,e[S]/rn);d[S]=n[S]*2*(1-j),a[S]=p[S]*(1-j),j>=1&&Q(S);continue}c[S]+=O,fe.set(t[S*3],t[S*3+1],t[S*3+2]);const J=fe.length();if(c[S]>as||J>sn){Q(S);continue}if(J<Qt){f[S]=2,e[S]=0;continue}const Je=Math.max(J-Qt,Qr),Qe=-150/(Je*Je)/J;Z.set(u[S*3],u[S*3+1],u[S*3+2]),Z.addScaledVector(fe,Qe*O),Z.normalize().multiplyScalar(ts),fe.addScaledVector(Z,O),u[S*3]=Z.x,u[S*3+1]=Z.y,u[S*3+2]=Z.z,t[S*3]=fe.x,t[S*3+1]=fe.y,t[S*3+2]=fe.z;const ue=Math.min(dn,1+cn*Qt/Math.max(J-Qt,un));m[S]=ue;const Se=Math.min(1,(as-c[S])/on);if(d[S]=n[S]*Se*ue,a[S]=p[S],Ve){const j=(b[S]+1)%Ue;b[S]=j,w[S]<Ue&&w[S]++,E[(S*Ue+j)*3]=fe.x,E[(S*Ue+j)*3+1]=fe.y,E[(S*Ue+j)*3+2]=fe.z}}Ze=le,We=ie;for(let S=0;S<ke;S++){if(f[S]===0)continue;const ae=w[S],J=b[S],Je=S*Et*2,Qe=d[S]*pn,ue=m[S];for(let Se=0;Se<Et;Se++){const j=Je+Se*2;if(Se+1>=ae){N[j]=0,N[j+1]=0;continue}const Pe=(S*Ue+(J-Se+Ue)%Ue)*3,et=(S*Ue+(J-Se-1+Ue*2)%Ue)*3;A[j*3]=E[Pe],A[j*3+1]=E[Pe+1],A[j*3+2]=E[Pe+2],A[j*3+3]=E[et],A[j*3+4]=E[et+1],A[j*3+5]=E[et+2];const Ce=1-Se/Et,Ye=1-(Se+1)/Et;N[j]=Qe*Ce*Ce,N[j+1]=Qe*Ye*Ye,T[j]=ue,T[j+1]=ue}x[S]=1}const H=G>0;l.visible=H,C.visible=H,H&&(h.attributes.position.needsUpdate=!0,h.attributes.aI.needsUpdate=!0,h.attributes.aS.needsUpdate=!0,h.attributes.aB.needsUpdate=!0,L.attributes.position.needsUpdate=!0,L.attributes.aI.needsUpdate=!0,L.attributes.aB.needsUpdate=!0)},burst:O=>{pt=O},dispose:()=>{o.remove(l),o.remove(C),h.dispose(),i.dispose(),L.dispose(),F.dispose()}}}function Es(o,t,u){const n=new is(t,{format:Ga,type:jt,minFilter:Yt,magFilter:Yt,generateMipmaps:!1,depthBuffer:!1,stencilBuffer:!1}),p=new $e;p.setAttribute("position",new k(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),p.boundingSphere=new He(new M(0,0,0),1e6);const c=new Me({uniforms:{uFace:{value:0}},vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,fragmentShader:`
      precision highp float;
      uniform float uFace; // 0..5 = +X,-X,+Y,-Y,+Z,-Z (three's setRenderTarget face order)
      varying vec2 vUv;
      ${u}
      vec3 faceDir(float face, vec2 st){
        vec2 uv = st * 2.0 - 1.0;                       // (sc, tc) in [-1, 1]
        if(face < 0.5)      return vec3( 1.0, -uv.y, -uv.x); // +X
        else if(face < 1.5) return vec3(-1.0, -uv.y,  uv.x); // -X
        else if(face < 2.5) return vec3( uv.x,  1.0,  uv.y); // +Y
        else if(face < 3.5) return vec3( uv.x, -1.0, -uv.y); // -Y
        else if(face < 4.5) return vec3( uv.x, -uv.y,  1.0); // +Z
        else                return vec3(-uv.x, -uv.y, -1.0); // -Z
      }
      void main(){
        vec3 dir = normalize(faceDir(uFace, vUv));
        gl_FragColor = bakeField(dir);
      }
    `,depthWrite:!1,depthTest:!1}),e=new ct(p,c);e.frustumCulled=!1;const f=new Lt;f.add(e);const d=new rs(-1,1,1,-1,0,1);let a=!1,m=!1;const h=()=>{if(a)return;a=!0;const E=o.getRenderTarget(),w=o.autoClear;try{o.autoClear=!1;for(let b=0;b<6;b++)c.uniforms.uFace.value=b,o.setRenderTarget(n,b),o.render(f,d);m=!0}catch{}finally{o.setRenderTarget(E),o.autoClear=w}},i=()=>m,l=()=>{f.remove(e),p.dispose(),c.dispose(),n.dispose()};return{texture:n.texture,bake:h,isBaked:i,dispose:l}}const mn=256;function gn(o){return Es(o,mn,`
      ${Ua}
      ${ws}
      vec4 bakeField(vec3 dir){ return blastField(dir); }
    `)}const vn=512;function bn(o,t,u=vn){const n=new is(u,{format:Ga,type:jt,minFilter:Yt,magFilter:Yt,generateMipmaps:!1,depthBuffer:!1,stencilBuffer:!1}),p=new $e;p.setAttribute("position",new k(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),p.boundingSphere=new He(new M(0,0,0),1e6);const c=new Me({uniforms:{uGranScale:{value:t},uFace:{value:0}},vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,fragmentShader:`
      precision highp float;
      uniform float uGranScale;
      uniform float uFace; // 0..5 = +X,-X,+Y,-Y,+Z,-Z (three's setRenderTarget face order)
      varying vec2 vUv;
      ${Ua}
      ${vs}
      ${bs}
      vec3 faceDir(float face, vec2 st){
        vec2 uv = st * 2.0 - 1.0;                       // (sc, tc) in [-1, 1]
        if(face < 0.5)      return vec3( 1.0, -uv.y, -uv.x); // +X
        else if(face < 1.5) return vec3(-1.0, -uv.y,  uv.x); // -X
        else if(face < 2.5) return vec3( uv.x,  1.0,  uv.y); // +Y
        else if(face < 3.5) return vec3( uv.x, -1.0, -uv.y); // -Y
        else if(face < 4.5) return vec3( uv.x, -uv.y,  1.0); // +Z
        else                return vec3(-uv.x, -uv.y, -1.0); // -Z
      }
      void main(){
        vec3 dir = normalize(faceDir(uFace, vUv));
        vec2 photo = granPhotoField(dir, 0.0); // tt = 0: the red giant's rotation-locked value
        gl_FragColor = vec4(granField(dir, vec3(0.0), uGranScale), photo, granRaggedBase(dir));
      }
    `,depthWrite:!1,depthTest:!1}),e=new ct(p,c);e.frustumCulled=!1;const f=new Lt;f.add(e);const d=new rs(-1,1,1,-1,0,1);let a=!1,m=!1;const h=()=>{if(a)return;a=!0;const E=o.getRenderTarget(),w=o.autoClear;try{o.autoClear=!1;for(let b=0;b<6;b++)c.uniforms.uFace.value=b,o.setRenderTarget(n,b),o.render(f,d);m=!0}catch{}finally{o.setRenderTarget(E),o.autoClear=w}},i=()=>m,l=()=>{f.remove(e),p.dispose(),c.dispose(),n.dispose()};return{texture:n.texture,bake:h,isBaked:i,dispose:l}}const wn=256;function yn(o){return Es(o,wn,`
      ${za}
      ${fs}
      vec4 bakeField(vec3 dir){ return vec4(sunSurfaceField(dir, 0.0, vec3(0.0)), 0.0); }
    `)}const aa=1;function Sn(o,t,u=jt){const n=new _a(2,2,{type:u,depthBuffer:!1,stencilBuffer:!1}),p=new $e;p.setAttribute("position",new k(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),p.boundingSphere=new He(new M(0,0,0),1e6);const c=new Me({uniforms:{uTex:{value:n.texture}},vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,fragmentShader:`
      precision highp float;
      uniform sampler2D uTex;
      varying vec2 vUv;
      void main(){
        gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0);
      }
    `,transparent:!0,blending:rt,depthWrite:!1,depthTest:!1}),e=new ct(p,c);e.frustumCulled=!1,e.renderOrder=-1,e.visible=!1,o.add(e);const f=(h,i,l)=>{n.setSize(Math.max(1,Math.round(h*l*t)),Math.max(1,Math.round(i*l*t)))},d=new Vt;return{quad:e,target:n,setSize:f,renderInto:(h,i,l)=>{const E=l.layers.mask,w=h.getClearAlpha(),b=h.autoClear;h.getClearColor(d),l.layers.set(aa),h.setRenderTarget(n),h.setClearColor(0,0),h.autoClear=!1,h.clear(!0,!1,!1),h.render(i,l),h.setRenderTarget(null),h.autoClear=b,h.setClearColor(d,w),l.layers.mask=E},dispose:()=>{o.remove(e),p.dispose(),c.dispose(),n.dispose()}}}const ea={uniforms:{tDiffuse:{value:null},uTime:{value:0},uResolution:{value:new sa(1,1)},uExposure:{value:1},uGrain:{value:.05},uGrainAmt:{value:0},uGrainSeed:{value:0},uWarmth:{value:.05},uSat:{value:.1},uOlive:{value:.6},uToneComp:{value:.78}},vertexShader:`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,fragmentShader:`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGrain, uWarmth, uSat, uOlive, uToneComp;
    uniform float uGrainAmt, uGrainSeed;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
      // soft tone map (preserves the white core). uToneComp is the compression
      // denominator — lower for the red giant so its deep red isn't crushed to black.
      col = col / (col + vec3(uToneComp));
      col = pow(col, vec3(0.92));
      // desaturate -> grey
      float luma = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(luma), col, uSat);
      // slight warm tint in the highlights
      col *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth*0.85);
      // COLD-SILVER tint of the background + halo falloff (ITEM 2). The black-hole
      // spec is cold: bg #030405, dust #11151A, accent #9EA8B8 — a near-monochrome
      // silver/black room, gravitational and EMPTY, with NO warm bone. uOlive (kept as
      // the uniform name for back-compat) now drives a COOL grade: BLUE sits highest
      // and red is pulled DOWN, so the shadows go cold silver-graphite, the eye-reset
      // opposite of the warm red/yellow chapters. This is gated per-state by look.olive
      // (≈0 in every later state, full only at the black hole), so the cold cast NEVER
      // warm- or cold-bleeds into the other chapters.
      float shW = 1.0 - smoothstep(0.0, 0.5, luma);          // weight in the shadows
      col *= mix(vec3(1.0), vec3(0.92, 0.97, 1.04), uOlive*shW);  // cool silver-blue shadow cast
      col += vec3(0.011, 0.013, 0.016) * uOlive;             // cold-graphite floor (faint blue-silver, #11151A family)
      col += vec3(0.004, 0.0045, 0.005);                     // slight cool-neutral floor
      // fine grain
      float g = hash(vUv*uResolution + fract(uTime)*97.0);
      col += (g-0.5)*uGrain;
      // LUMINANCE-ADAPTIVE film grain (uGrainAmt; 0 = off, term is exactly 0).
      // Purpose: let the particle-cloud density be lowered without the cloud
      // resolving into discrete dots ("confetti"). Signed hash noise (±0.5),
      // re-seeded per frame via uGrainSeed, weighted by a luminance curve that
      // PEAKS in the dark-to-mid range and fades to ~0 in highlights — it fills
      // the dim gaps BETWEEN sparse grains while leaving the bright disk/bloom
      // core clean. A small positive lift rides along in the near-black so gaps
      // read as textured gas rather than pure black holes between dots.
      // TEXTURE: vertically-correlated ("old-TV") noise — the hash is sampled at a
      // y-compressed coordinate (px.y / GRAIN_STRETCH, ~8px of vertical correlation)
      // so it forms subtle vertical streaks like analog CRT noise, blended 70/30
      // with plain per-pixel hash so it never reads as pure banding. Both layers
      // ride uGrainSeed so the streaks re-seed (shimmer) every frame.
      const float GRAIN_STRETCH = 8.0;                              // px of vertical correlation
      float fl = dot(col, vec3(0.299,0.587,0.114));                 // post-grade luma
      vec2 fpx = vUv*uResolution;
      vec2 fseed = vec2(fract(uGrainSeed)*113.0, fract(uGrainSeed*0.61)*57.0);
      float fgStreak = hash(vec2(fpx.x, floor(fpx.y / GRAIN_STRETCH)) + fseed) - 0.5; // vertical streaks
      float fgPixel  = hash(fpx + fseed) - 0.5;                     // per-pixel salt
      float fg = fgStreak*0.7 + fgPixel*0.3;                        // signed ±
      float fw = smoothstep(0.85, 0.30, fl);                        // full in dark/mid, ~0 in highlights
      float flift = (1.0 - smoothstep(0.0, 0.14, fl)) * 0.30;       // near-black lift
      col += (fg + flift) * uGrainAmt * fw;
      // vignette
      vec2 q = vUv-0.5;
      float vig = smoothstep(1.10, 0.28, length(q)*1.25);
      col *= mix(0.66, 1.0, vig);
      col = clamp(col,0.0,1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `},ta={uniforms:{tDiffuse:{value:null},uNova:{value:0},uNovaDir:{value:1},uAspect:{value:1},uCenter:{value:new sa(.5,.5)},uPeak:{value:.94},uShock:{value:.82},uShockDeg:{value:26},uShockWide:{value:1.5},uShockPersp:{value:.85},uShockRoll:{value:18},uTime:{value:0}},fragmentShader:`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uNova, uNovaDir, uAspect, uPeak, uShock, uShockDeg, uShockWide, uShockPersp, uShockRoll, uTime;
    uniform vec2 uCenter;
    varying vec2 vUv;
    #define PI 3.14159265
    // --- value-noise fbm for the turbulent shock gas (cheap, GPU-friendly) ---
    float hashN(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p, p+34.5); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      float a = hashN(i), b = hashN(i+vec2(1.0,0.0));
      float c = hashN(i+vec2(0.0,1.0)), dd = hashN(i+vec2(1.0,1.0));
      return mix(mix(a,b,u.x), mix(c,dd,u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
      return v;
    }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // EARLY-OUT (uniform branch — coherent across the whole screen): outside the
      // supernova band the envelope is numerically zero (uNova is a stage-space
      // Gaussian; it is < 1e-4 for every stage beyond ~±0.27 of the blast centre,
      // i.e. EVERY settled state) and then BOTH composited terms below are zero:
      //   bleach ≤ uNova·0.28·uPeak < 3e-5   and
      //   gasAmt ≤ 1.3·smoothstep(0,0.16,uNova)·uShock < 2e-6,
      // each far below one 8-bit LSB (1/255 ≈ 3.9e-3) on the canvas this pass
      // writes to — so skipping the ~10 fbm octaves + shock-disk math per pixel is
      // pixel-identical. The pass itself still runs (it is the composer's
      // renderToScreen output), only the wasted per-pixel ALU is dropped; inside
      // the blast band the full path runs unchanged.
      if (uNova >= 1e-4) {
      // distance from the blast origin, aspect-corrected so the front is a
      // circle, not an ellipse on a wide viewport.
      vec2 q = (vUv - uCenter); q.x *= uAspect;
      float d = length(q);
      bool implode = uNovaDir < 0.0;
      // RADIAL FRONT.
      //  explode: the white front expands OUTWARD as the envelope grows — bright
      //    inside the radius (uNova*1.4), soft 0.45 falloff so it reads as light.
      //  implode: the front COLLAPSES INWARD. As the envelope rises the lit region
      //    shrinks from the whole frame down to the center: it's white OUTSIDE a
      //    radius that contracts from far (edges) to 0 (center). Same 0.45 soft
      //    edge, mirrored. This is the un-explosion's gathering shell of light.
      float front = implode
        ? smoothstep((1.0 - uNova) * 1.4, (1.0 - uNova) * 1.4 + 0.45, d)
        : smoothstep(uNova * 1.4, uNova * 1.4 - 0.45, d);
      // Keep the flash radial and cinematic: bright around the origin/front, with
      // the corners protected so the beat never reads as a flat loading whiteout.
      // Tighter edge guard (1.00→0.18) keeps the OUTER frame darker so the blast
      // reads as a glowing ball, not an edge-to-edge wash. A small hot core bloom
      // adds punch at the centre without flooding the screen.
      float edgeGuard = smoothstep(1.00, 0.18, d);
      float coreBloom = smoothstep(0.88, 1.0, uNova) * smoothstep(0.58, 0.0, d) * 0.20;
      // The big FILLED whiteout used to be the whole supernova; now the turbulent gas disk
      // (below) is the headline, so the filled flash is pulled WAY down (×0.28) — it would
      // otherwise wash the disk's interior flat grey. What survives is a restrained warm
      // bloom at the very centre so the detonation still flashes, but the disk reads against
      // dark space, cinematic. coreBloom keeps the tight central punch.
      float bleach = max(uNova * front * edgeGuard * 0.28, coreBloom) * uPeak;
      // ============================ INCLINED SHOCK GAS DISK ============================
      // The blast is a turbulent ring of incandescent gas lying in a flat plane TILTED in 3D
      // toward the camera, so it reads as a real disk receding INTO the frame (Saturn-rings
      // perspective) — NOT a flat squashed oval painted on the glass. We do a true camera
      // RAY → DISK-PLANE intersection: build a view ray for each pixel, intersect it with the
      // tilted plane, and sample the turbulent gas at the 3D hit point. That gives genuine
      // perspective — the NEAR (bottom) half large & spread, the FAR (top) half compressed &
      // converging toward a vanishing line — instead of a top-bottom-symmetric ellipse.
      float ringE = clamp(implode ? (1.0 - uNova) : uNova, 0.0, 1.0);
      float ringR = pow(ringE, 0.6) * 1.05;            // expanding shock radius in DISK-PLANE units
      // blast envelope (0 at rest → 1 mid-blast → 0): gates both the gas and the hot core so
      // the whole disk fades in and out with the supernova instead of sitting there.
      float shockEnv = smoothstep(0.0, 0.16, uNova) * smoothstep(1.0, 0.22, uNova);
      // --- project the screen point onto the tilted disk plane (2D perspective model) ---
      // We want a disk that (a) lies in a flat plane TILTED toward the camera and (b) reads
      // in PERSPECTIVE — the NEAR (bottom) half larger & more open, the FAR (top) half
      // compressed & converging toward a vanishing line up the frame. A symmetric squashed
      // ellipse fails (b); a full ray-plane trace collapses to an invisible sliver at steep
      // tilts. This closed-form perspective map gives both, robustly, and always fills frame.
      //   - horizontal: full-width lateral axis (undo the flash aspect, widen by uShockWide)
      //   - vertical: foreshorten by sin(incl), THEN apply a perspective DIVIDE keyed to the
      //     vertical position so the far (upper) half compresses and the near (lower) half
      //     opens — the asymmetry that makes it read as a 3D plane, not a flat oval.
      float incl   = radians(uShockDeg);               // 0 = edge-on, 90 = face-on
      float vFore  = max(0.10, sin(incl));             // base vertical foreshortening
      // ROLL: rotate the whole disk frame in-plane so its long (lateral) axis sits on a
      // DIAGONAL slant across the frame — like a clock hand — instead of dead horizontal.
      // We rotate the screen point INTO the disk's frame by -roll, build the flat/perspective
      // disk there, and the result is the disk slanted by +roll on screen. uAspect is undone
      // first so the rotation is by a true geometric angle, not skewed by the wide viewport.
      float roll = radians(uShockRoll);
      vec2  qa   = vec2(q.x / uAspect, q.y);           // aspect-true screen offset from centre
      float cr = cos(roll), sr = sin(roll);
      vec2  qr = vec2(qa.x * cr + qa.y * sr, -qa.x * sr + qa.y * cr); // rotate into the disk frame
      float yC     = qr.y;                             // signed depth across the (rolled) disk
      // perspective divide along the disk's depth axis: points on the FAR side push to larger
      // in-plane V (compressed on screen → converging); the NEAR side opens out. uShockPersp
      // sets the convergence strength (0 = flat symmetric ellipse, ~1 = strong 3D tilt).
      float persp  = 1.0 / (1.0 - uShockPersp * clamp(yC * 2.0, -0.9, 0.9));
      float diskX  = qr.x / uShockWide;                // lateral axis (along the rolled long axis)
      float diskY  = (yC / vFore) * persp;             // foreshortened + perspective-warped depth axis
      vec2  dp = vec2(diskX, diskY);                   // position in the disk plane
      float onDisk = 1.0;                              // (2D model: the whole frame maps onto the plane)
      float rDisk = length(dp);                        // radius in the disk plane
      // TURBULENT GAS DENSITY — fbm sampled in disk-plane CARTESIAN coords (NOT polar), so
      // the clumps are isotropic with NO central pinwheel/spoke artifact and no atan branch
      // seam. We advect the clouds OUTWARD by pulling the sample point inward along its own
      // radial direction over time (dp - dir*flow), so the gas appears to stream out of the
      // core along the shock. Two octave sets: coarse billows + fine filaments.
      float flow = uTime * 0.16;
      vec2  rdir = dp / max(rDisk, 1e-3);
      float billow = fbm(dp * 3.0 - rdir * flow);
      float fine   = fbm(dp * 8.5 + vec2(11.0, 4.0) - rdir * flow * 1.6);
      float gas = mix(billow, fine, 0.45);             // 0..1 turbulent density field
      // CONTRAST the density for a CINEMATIC read: gamma it up so the clumps separate into
      // bright filaments and deep dark lanes (a soft uniform field reads as cheap haze). The
      // remap pushes the low end toward black and keeps the peaks, so the gas has structure.
      gas = pow(clamp(gas, 0.0, 1.0), 1.7);
      // RADIAL SHELL: the gas lives in a band around the expanding shock radius — a wide
      // INNER fill (already-shocked gas glowing behind the front) plus a tight bright CREST
      // at the front. The turbulence erodes the band edges so the rim is ragged, not a wire.
      // Bands narrowed + inner fill cut so the disk is a defined RING with dark space around
      // it, not a frame-filling glow.
      float band  = smoothstep(0.42, 0.0, abs(rDisk - ringR));     // broad shell (tighter)
      float crest = smoothstep(0.12, 0.0, abs(rDisk - ringR));     // bright leading rim
      float inner = smoothstep(ringR + 0.0, ringR - 0.32, rDisk);  // fill trailing the crest, toward core
      float shell = max(crest * 0.85, max(band * (0.20 + 0.80 * gas), inner * 0.35 * gas));
      // clouds: modulate the whole shell by the gas so it breaks into clumps + dark lanes.
      // Lower floor (0.18) = the gaps go properly dark, the structure reads as volume.
      shell *= (0.18 + 0.95 * gas);
      // VOLUME / limb-brightening: thicken the RIM gas near the disk's top & bottom edges
      // (where, seen at this shallow tilt, we look through more gas) so it reads as a fat
      // torus. Gated to the rim band (rDisk near ringR) so it ONLY shapes the gas ring and
      // never touches the core — otherwise abs(diskY)/rDisk blowing up near the centre
      // carved a bow-tie into the hot heart. The rims are where |diskY| ≈ rDisk.
      float rimBand = smoothstep(0.45, 0.12, abs(rDisk - ringR)); // 1 on the ring, 0 at centre
      float limb = smoothstep(0.82, 1.0, abs(diskY) / max(rDisk, 1e-3)) * rimBand;
      shell *= (1.0 + 0.35 * limb);                    // gentler so it never carves a dark mid-lane
      // SHADOW GAP: a SOFT, shallow moat just inside the ring so the hot heart reads as
      // separated from the gas — depth, not a flat blob. Kept soft + shallow (×0.30, wide
      // smoothstep) because on this strongly-inclined disk the gap projects to a thin
      // horizontal lane, and a hard version read as an ugly dark SEAM across the middle.
      float gapZone = smoothstep(0.40, 0.16, rDisk) * smoothstep(0.02, 0.16, rDisk);
      shell *= (1.0 - 0.30 * gapZone);
      // HOT CORE: a tight, round, hot heart at the disk centre (the detonating star), so the
      // middle reads as searing light the gas streams out of — not flat textured cloud. Added
      // AFTER the limb shaping so the rim's vertical-axis weighting can't carve it into an
      // hourglass. DIMMED + tightened (0.30 radius, ×0.7) so it's a controlled bright point,
      // not a blown-out wash.
      float core = smoothstep(0.30, 0.0, rDisk) * shockEnv;
      shell = max(shell, core * 0.7);
      // reach guard (in disk-plane radius). Pulled IN so the outer gas falls to black sooner —
      // darker, moodier frame, no haze to the edges. onDisk masks the half-frame where the
      // view ray escapes ABOVE the tilted plane's horizon (no disk there → true perspective,
      // the far side fades into space). Soften the horizon so it isn't a hard cut.
      float reach     = smoothstep(1.5, 0.10, rDisk);
      float gasAmt    = clamp(shell, 0.0, 1.3) * shockEnv * reach * uShock * onDisk;
      // FIERY PALETTE (mirrors the reference): deep maroon/rust at the cool outer rim →
      // burnt orange → hot amber → blazing magenta-white at the inner/hottest edge. Mapped
      // by where we are across the shell (hot toward the shock radius / core, cool outward).
      float heat = clamp(1.0 - (rDisk - (ringR - 0.30)) / 0.9, 0.0, 1.0); // 1 hot (inner) → 0 cool (outer)
      heat = clamp(heat + 0.25 * (gas - 0.5), 0.0, 1.0);                  // turbulence mottles the temperature
      // Cool end pushed toward a DARK ember-red (not grey) so low-density gas reads as
      // embers fading to black, never a muddy grey haze. Warm mids kept saturated.
      vec3 cMaroon = vec3(0.20, 0.025, 0.03);  // #340708 near-black ember red (dark outer/low-density)
      vec3 cRust   = vec3(0.80, 0.20, 0.09);   // #CC3317 burnt orange
      vec3 cAmber  = vec3(1.0,  0.56, 0.22);   // #FF8F38 hot amber
      vec3 cMagma  = vec3(1.0,  0.50, 0.62);   // #FF809E hot rose core — saturated, not washed pink-grey
      vec3 gasCol = mix(cMaroon, cRust, smoothstep(0.0, 0.30, heat));
      gasCol = mix(gasCol, cAmber, smoothstep(0.30, 0.66, heat));
      gasCol = mix(gasCol, cMagma, smoothstep(0.66, 1.0, heat));
      // keep the interior saturated: pull any grey back toward the warm hue, so the fill
      // reads as glowing gas, not desaturated smoke.
      float lum = dot(gasCol, vec3(0.299, 0.587, 0.114));
      gasCol = mix(vec3(lum), gasCol, 1.25);   // >1 = boost saturation
      gasCol = max(gasCol, vec3(0.0));
      // composite the COLORED gas additively over the graded frame (gas EMITS light), capped
      // by uPeak so the hottest clumps stay just under pure white like the rest of the scene.
      // Gain dimmed (1.4 → 0.90) so the disk glows like deep incandescent matter, not a
      // blown-out light — the brief asks for less glow / more cinematic mood.
      col += gasCol * gasAmt * uPeak * 0.90;
      // TEMPERATURE.
      //  explode: blue-white when hot (high uNova) → warm amber as it cools.
      //  implode: time-reversed — gathers cool/amber, SNAPS blue-white at the peak
      //    (light arriving), the exact mirror of the explode cooldown. Achieved by
      //    reading the ramp on the rising envelope the same way; the perceptual
      //    reversal comes from the inward-collapsing front above carrying it.
      // Warmer overall so the supernova reads as incandescent stellar matter, not
      // a cold grey/white screen wipe. The peak is a warm white-gold; it never goes
      // fully blue-white. The cast is stronger (0.42 white mix vs 0.6) so the warm
      // temperature survives the bleach instead of washing to neutral grey.
      // PALETTE (supernova): white-hot center → amber edge → burnt-orange shadows.
      // The hot peak stays a warm white; the cooling trailing edge is pushed toward a
      // clear BURNT ORANGE (green 0.82 → 0.74, blue 0.55 → 0.40) so the flash cools
      // into the same burnt-orange shadow family the debris ramp carries.
      // ITEM 3 collapse palette: warm-white front #F3EFE2 -> hot amber edge #FF9A2E.
      vec3 cold = vec3(0.953, 0.937, 0.886); // #F3EFE2 warm-white shock front
      vec3 warm = vec3(1.0, 0.604, 0.180);   // #FF9A2E hot amber cooling edge
      vec3 tint = mix(warm, cold, smoothstep(0.35, 0.90, uNova));
      vec3 white = mix(vec3(1.0), tint, 0.42); // warm-tinted, never neutral white
      col = mix(col, white, clamp(bleach, 0.0, 1.0));
      } // end of the uNova early-out branch (see the top of main)
      gl_FragColor = vec4(col, 1.0);
    }
  `},xn=(()=>{const o=ea.fragmentShader.indexOf("void main(){"),t=ta.fragmentShader.indexOf("#define PI"),u=ta.fragmentShader.indexOf("uniform float uNova");if(o<0||u<0||t<u)throw new Error("GradeNovaShader assembly markers are missing or out of order.");const n=ta.fragmentShader.slice(u,t),p=`    varying vec2 vUv;
`,c="uniform float uNova, uNovaDir, uAspect, uPeak, uShock, uShockDeg, uShockWide, uShockPersp, uShockRoll, uTime;";if(!n.includes(p)||!n.includes(c))throw new Error("GradeNovaShader nova uniform block no longer matches the expected source.");const e=ea.fragmentShader.slice(o),f=`void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;`,d="gl_FragColor = vec4(col,1.0);";if(!e.includes(f)||!e.includes(d))throw new Error("GradeNovaShader grade body no longer matches the expected source.");const a=ta.fragmentShader.slice(t),m="vec3 col = texture2D(tDiffuse, vUv).rgb;";if(!a.includes(m))throw new Error("GradeNovaShader nova body no longer matches the expected source.");return{uniforms:{...ea.uniforms,...ta.uniforms},vertexShader:ea.vertexShader,fragmentShader:`${ea.fragmentShader.slice(0,o)}${n.replace(p,"").replace(c,c.replace(", uTime",""))}${e.replace(f,`vec3 grade(vec3 col){
      col *= uExposure;`).replace(d,"return col;")}${a.replace(m,"vec3 col = grade(texture2D(tDiffuse, vUv).rgb);")}`}})(),En={full:1,mid:.55,cheap:.3,none:1},Tn={full:1,mid:1,cheap:1,none:1},An={full:1,mid:1,cheap:1.15,none:1};function kn(o,t,u,n="full",p=ls){const c=n==="cheap"?Go:jt,e=new Bi(o,new _a(1,1,{type:c}));e.addPass(new _i(t,u));const f=En[n];let d=null;if(n!=="none"&&(d=new zi(new sa(1,1),I.bloomStr*Tn[n],I.bloomRad*An[n],.55),e.addPass(d),n==="cheap"))for(const l of[...d.renderTargetsHorizontal,...d.renderTargetsVertical,d.renderTargetBright])l.texture.type=Go,l.dispose();const a=new Ui(xn);return a.uniforms.uExposure.value=I.exposure,a.uniforms.uGrain.value=I.grain,a.uniforms.uGrainAmt.value=fi(p),a.uniforms.uWarmth.value=I.warmth,a.uniforms.uSat.value=I.saturation,a.uniforms.uOlive.value=I.olive,a.renderToScreen=!0,e.addPass(a),{composer:e,bloom:d,postPass:a,render:()=>{e.render()},setSize:(l,E)=>{e.setSize(l,E),d&&d.setSize(Math.round(l*f),Math.round(E*f))},dispose:()=>{e.dispose(),a.material.dispose(),d&&d.dispose()}}}const pa=240,Rn=500;function Pn(o){const{renderer:t}=o,u=document.createElement("div");u.setAttribute("aria-hidden","true"),u.style.cssText=["position:fixed","top:8px","right:8px","z-index:2147483000","padding:8px 10px","background:rgba(8,10,14,0.78)","color:#9fd8a3","font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace","white-space:pre","pointer-events:none","border:1px solid rgba(159,216,163,0.25)","border-radius:4px","text-align:left"].join(";"),document.body.appendChild(u);let n="unknown";try{const h=t.getContext(),i=h.getExtension("WEBGL_debug_renderer_info");i&&(n=String(h.getParameter(i.UNMASKED_RENDERER_WEBGL)))}catch{}const p=new Float64Array(pa),c=new Float64Array(pa);let e=0,f=0,d=0,a=0;const m=h=>{const i=e;if(i===0)return;c.set(p.subarray(0,i));const l=c.subarray(0,i);l.sort();const E=i%2===0?(l[i/2-1]+l[i/2])/2:l[(i-1)/2],w=l[Math.min(i-1,Math.floor(i*.99))];let b=0;for(let X=0;X<i;X++)b+=l[X];const x=b/i,A=t.info,N=o.getFrameStats(),T=t.domElement.width,L=t.domElement.height,F=performance.memory,C=F?`heap  ${(F.usedJSHeapSize/1048576).toFixed(0)} / ${(F.jsHeapSizeLimit/1048576).toFixed(0)} MB
`:"";u.textContent=`fps   ${(1e3/E).toFixed(1)}  (1% low ${(1e3/w).toFixed(1)})
frame ${x.toFixed(2)} ms mean
gpu-t n/a
draws ${N.calls}  pts ${N.points.toLocaleString("en-US")}
tris  ${N.triangles.toLocaleString("en-US")}  lines ${N.lines}
geo   ${A.memory.geometries}  tex ${A.memory.textures}  prog ${A.programs?.length??0}
tier  ${o.bootTier} (${o.tierSource}) → ${o.getActiveTier()}  dpr ${t.getPixelRatio().toFixed(2)}
buf   ${T}×${L}  grains ${o.diskParticles.toLocaleString("en-US")}
half-res ${o.halfResParticles?"on":"off"}  gran-bake ${o.getGranBakeApplied()?"on":"off"}  grav-sim ${o.gravitySimActive?"on":"off"}
`+C+n,a=h};return{tick(h){if(d>0){const i=h-d;i>0&&i<1e3&&(p[f]=i,f=(f+1)%pa,e<pa&&e++)}d=h,h-a>=Rn&&m(h)},dispose(){u.remove()}}}function Dn(){if(typeof document>"u")return!1;try{const o=document.createElement("canvas");return!!(o.getContext("webgl2")||o.getContext("webgl")||o.getContext("experimental-webgl"))}catch{return!1}}function zt(){const o=globalThis;if(typeof o.scheduler?.yield=="function")try{return o.scheduler.yield()}catch{}return new Promise(t=>{setTimeout(t,0)})}async function Yn(o,t,u,n="high"){const p=mi(n==="mid"?Pi:1),c=Math.max(1e4,Math.round(ki(n)*p));if(!Dn())throw new jo;let e;try{e=new li({antialias:n!=="low",powerPreference:"high-performance"})}catch(s){throw new jo(s instanceof Error?`WebGL renderer creation failed: ${s.message}`:void 0)}e.setPixelRatio(Bo(t,n)),e.setSize(window.innerWidth,window.innerHeight),e.setClearColor(0,1);const f=new Vt;e.toneMapping=hi,e.outputColorSpace=ci,o.appendChild(e.domElement);const d=new Lt,a=new di(I.fovDeg,window.innerWidth/window.innerHeight,.1,4e3),m=e.getPixelRatio();await zt();const h=gr(d,c,m,n==="low",p<1),i=h.primary,l=h.secondary,E=h.primaryPts,w=h.secondaryPts;await zt();const b=Sr(d,c,m,n==="low"),x=b.uniforms,A=b.mat,N=b.matSec,T=b.pts,L=b.secPts,F=xr(d,m),C=F.uniforms,X=F.pts;await zt();const P=Ar(d,c,n==="low"),$=P.uniforms,se=P.mat,z=P.matSec,de=P.seg,U=P.seg2,ne=Nr(d,c,m),Z=ne.uniforms,fe=ne.mat,Ze=ne.seg,We=Or(d,m,n==="low"),ee=We.uniforms,Ve=We.mat,pt=We.pts,G=Yr(),Be=!t&&n!=="low"&&gi()?fn(d):null;await zt();const Le=kn(e,d,a,n==="low"?"cheap":n==="mid"?"mid":"full",n==="mid"?Ri:ls),me=Le.bloom,Q=Le.postPass,te=n!=="low"?vi():1,Oe=te<1?Sn(d,te):null;Oe&&(E.layers.set(aa),w.layers.set(aa),T.layers.set(aa),i.uniforms.uSizeScale.value=te,l.uniforms.uSizeScale.value=te,A.uniforms.uSizeScale.value=te);const Ie=e.capabilities.isWebGL2&&bi()?bn(e,i.uniforms.uGranScale.value):null;let O=!1,B=!1;const Fe=()=>{if(!(B||!Ie||!Ie.isBaked())){for(const s of[i,l])s.uniforms.uGranTex.value=Ie.texture,s.uniforms.uGranBakeReady.value=1;B=!0}},le=e.capabilities.isWebGL2&&wi()?gn(e):null;let ie=!1,ge=!1;const dt=()=>{if(!(ge||!le||!le.isBaked())){for(const s of[i,l])s.uniforms.uBlastTex.value=le.texture,s.uniforms.uBlastBakeReady.value=1;ge=!0}},ye=n==="low"&&e.capabilities.isWebGL2&&yi()?yn(e):null;let ft=!1,r=!1;const v=()=>{r||!ye||!ye.isBaked()||(y.surfaceMat.uniforms.uSunTex.value=ye.texture,y.surfaceMat.uniforms.uSunBakeReady.value=1,r=!0)},D=4.2*ds,Y=D*cs,y=dr(d,Y,e.getPixelRatio());await zt();const H=t||n==="low"?{available:!1,step:()=>{},bake:()=>{},isBaked:()=>!1,sampleAt:()=>null,dispose:()=>{}}:Qi({renderer:e,count:h.count,aSeed:h.aSeed,aU:h.aU,aPhase:h.aPhase,giantR:i.uniforms.uGiantR.value,coreR:Y});await zt();function S(){const s=window.innerWidth/window.innerHeight,g=pi.degToRad(a.fov),R=a.position.length(),W=I.coreSize/R/Math.tan(g/2),V=W*I.lens,Ke=W*I.holeFactor,yt=Ke*1.55,Xe=e.getPixelRatio();for(const Te of[i,l])Te.uniforms.uAspect.value=s,Te.uniforms.uShadowR.value=W,Te.uniforms.uThetaE.value=V,Te.uniforms.uHole.value=Ke,Te.uniforms.uPixelRatio.value=Xe;ee.uShadowR.value=W,ee.uAspect.value=s,ee.uHole.value=Ke,ee.uPixelRatio.value=Xe;for(const Te of[x,N.uniforms])Te.uShadowR.value=W,Te.uThetaE.value=yt,Te.uHole.value=Ke,Te.uAspect.value=s,Te.uPixelRatio.value=Xe;C.uShadowR.value=W,C.uThetaE.value=yt,C.uHole.value=Ke,C.uAspect.value=s,C.uPixelRatio.value=Xe;for(const Te of[$,z.uniforms])Te.uShadowR.value=W,Te.uThetaE.value=yt,Te.uHole.value=Ke,Te.uAspect.value=s;Z.uAspect.value=s,Z.uPixelRatio.value=Xe}function ae(){const s=window.innerWidth,g=window.innerHeight,R=Bo(t,Sa);e.setPixelRatio(Math.min(R,R*Bt.dprScale,$a?Ns:R)),e.setSize(s,g),Le.setSize(s,g),Oe?.setSize(s,g,e.getPixelRatio()),a.aspect=s/g,a.updateProjectionMatrix(),Q.uniforms.uResolution.value.set(s*e.getPixelRatio(),g*e.getPixelRatio()),Q.uniforms.uAspect.value=s/g,S()}window.addEventListener("resize",ae);const J=1.5,Je=Math.PI*2/180,Qe=[.23,.33],ue=[.36,.43],Se=7,j=4,Pe=.15,et=.21,Ce=new M,Ye=new M,_e=new M(0,0,0);let xe=0,Ge=0;const ut=s=>{xe=s.clientX/window.innerWidth-.5,Ge=s.clientY/window.innerHeight-.5};t||window.addEventListener("pointermove",ut);const tt=2.4,It=5.5,mt=1.5,it=Array.from({length:y.surfaceMat.uniforms.uErupt.value.length},()=>({dir:new M(0,1,0),intensity:0,age:0})),at=new ui,gt=new sa,je=new M;let At=!1,kt=0,Rt=null;const vt=Array.from({length:i.uniforms.uErupt.value.length},()=>({dir:new M(0,1,0),intensity:0,age:0})),qt=new He(new M(0,0,0),1),ia=new M,K=new M(.39,.92,0).normalize();let De=!1,Ft=0,Pt=null;const ra=(s,g)=>{let R=0,ot=-1;for(let V=0;V<it.length;V++){if(it[V].intensity<=0){R=V,ot=-1;break}it[V].age>ot&&(ot=it[V].age,R=V)}const W=it[R];W.dir.copy(s),W.intensity=g,W.age=0},Ts=(s,g)=>{let R=0,ot=-1;for(let V=0;V<vt.length;V++){if(vt[V].intensity<=0){R=V,ot=-1;break}vt[V].age>ot&&(ot=vt[V].age,R=V)}const W=vt[R];W.dir.copy(s),W.intensity=g,W.age=0},Ha=(s,g)=>{const R=e.domElement.getBoundingClientRect();return R.width<=0||R.height<=0?!1:(gt.set((s-R.left)/R.width*2-1,-((g-R.top)/R.height*2-1)),at.setFromCamera(gt,a),qt.radius=i.uniforms.uGiantR.value*i.uniforms.uGiantScale.value,at.ray.intersectSphere(qt,ia)!==null)},As=(s,g)=>{const R=e.domElement.getBoundingClientRect();return R.width<=0||R.height<=0?!1:(gt.set((s-R.left)/R.width*2-1,-((g-R.top)/R.height*2-1)),at.setFromCamera(gt,a),at.intersectObject(y.surface,!1).length>0)},ks=(s,g)=>De&&Ha(s,g)||At&&As(s,g),Wa=s=>{if(!At&&!De)return;const g=e.domElement.getBoundingClientRect();if(gt.set((s.clientX-g.left)/g.width*2-1,-((s.clientY-g.top)/g.height*2-1)),at.setFromCamera(gt,a),At){const R=at.intersectObject(y.surface,!1)[0];if(!R)return;Rt=y.surface.worldToLocal(R.point.clone()).normalize(),kt=performance.now()}else{if(!Ha(s.clientX,s.clientY))return;const R=ia.clone().sub(qt.center).normalize();R.applyAxisAngle(K,-i.uniforms.uGiantSpin.value),Pt=R,Ft=performance.now()}},Va=()=>{if(Rt){const s=(performance.now()-kt)/1e3,g=Math.max(.25,Math.min(1,.25+s/mt));ra(Rt,g)}else if(Pt){const s=(performance.now()-Ft)/1e3,g=Math.max(.25,Math.min(1,.25+s/mt));Ts(Pt,g)}Rt=null,kt=0,Pt=null,Ft=0},na=()=>{Rt=null,kt=0,Pt=null,Ft=0},Ya=()=>{Be?.burst(48)};t||(Be&&window.addEventListener("pointerdown",Ya),window.addEventListener("pointerdown",Wa),window.addEventListener("pointerup",Va),window.addEventListener("pointercancel",na),window.addEventListener("pointerleave",na));const Rs=performance.now();let bt=0,nt=!1,Kt=!1,la=-1,Ee=u.getStage(),qe=u.getProgress?.()??Yo(Ee),Ct=0,ma=!1,ga=Ee,ja=1,va=0,qa=0,Ka=Ee,Xa=qe;const ba=1e-4;let wa=0;const Ps=500,Ds=25,Ns=.4,Gt=(()=>{if(n!=="low")return!1;try{const s=e.getContext(),g=s.getExtension("WEBGL_debug_renderer_info"),R=g?String(s.getParameter(g.UNMASKED_RENDERER_WEBGL)):"";return Si(R)}catch{return!1}})();let $a=Gt,ya=0,Za=0;const Ja=(()=>{try{return window.sessionStorage?.getItem(_o)==="1"}catch{return!1}})();Gt&&document.documentElement.setAttribute("data-soft-gl",""),Gt&&(E.geometry.setDrawRange(0,Math.floor(c*.8)),w.geometry.setDrawRange(0,Math.floor(c*.8)));const Sa=n,Ms=xi(),Bt={visibleRatio:1,dprScale:1,slowWindows:0,fastWindows:0,recoveryLatch:4},Qa=new Float32Array(Zt);let xa=0,ha=0,Ea=0,Ta=0,_t=!1,eo=0,Aa=!1,to=null,ao=null;const ca=new M,oo=new M,ka=new M,Ls=new M;let Ra=0;const Os=1.5,so=.82,Is=.28,io=.55,Fs=.62,ro=new M(0,0,-2),Cs={red:D*1.15,yellow:Y*1.25},Pa=ro.clone(),Gs=21,Bs=-14,_s=new M(0,1,0),lt=new M,Ot=new M,no=()=>{!document.hidden&&!nt&&bt===0&&Xt()};document.addEventListener("visibilitychange",no);const lo=s=>{s.preventDefault(),nt=!0,cancelAnimationFrame(bt),bt=0,u.onContextLost?.()},ho=()=>{nt&&(nt=!1,bt===0&&!document.hidden&&Xt(),u.onContextRestored?.())};e.domElement.addEventListener("webglcontextlost",lo,!1),e.domElement.addEventListener("webglcontextrestored",ho,!1);const ve=(s,g)=>{i.uniforms[s].value=g,l.uniforms[s].value=g},St={focusEmission:1,focusBloom:1,focusDome:1,streakGasDim:1,simBlend:0,giantScale:0,nebLight:1,nebulaFlashBloom:0},zs=(s,g)=>{ve("uMorph",s.morph),Ve.uniforms.uMorph.value=s.morph,ve("uFlash",s.flash),ve("uCollapse",s.kCollapse),ve("uBlackHoleScale",s.blackHoleScale),ve("uGiant",s.giantHeld),ve("uGiantScale",g.giantScale),ve("uYellow",0),ve("uNebula",s.nebulaShader?1:0),ve("uDot",s.dot?1:0),ve("uNebulaGrow",s.nebulaGrow),ve("uSimBlend",g.simBlend),ve("uNebLight",g.nebLight),ve("uNebFade",s.nebFade),ve("uYrFlash",s.yrFlash),ve("uYrGrow",s.cloudSide?s.yrGrow:1),ve("uYrMix",s.cloudSide?s.yrColor:1),ve("uBright",s.baseBright*s.cloudBright*s.cloudW*g.focusEmission*g.streakGasDim),ve("uSat",s.diskSat),y.group.scale.setScalar(s.starFormed>0?.004+.996*s.starFormed:1),y.surfaceMat.uniforms.uBlue.value=s.starFormed>0?1-we((s.starFormed-.25)/.55):0,y.surfaceMat.uniforms.uDetail.value=1;{const ot=s.starFormed>0?1+2.2*(1-s.starFormed)*(1-s.starFormed):1;y.surfaceMat.uniforms.uSeedGlow.value=ot}y.surfaceMat.uniforms.uRed.value=0,y.coronaMat.uniforms.uRed.value=0,y.surfaceMat.uniforms.uMeshFade.value=s.meshW;const R=(s.starFormed>0?we((s.starFormed-.97)/.03):1)*s.meshW;y.loopMat.uniforms.uFade.value=R,y.coronaMat.uniforms.uFade.value=R,y.loops.visible=R>0,y.corona.visible=R>0,y.glowMat.uniforms.uFade.value=s.meshW,y.starMat.uniforms.uOpacity.value=1,y.group.visible=s.sunRigVisible,y.starBack.visible=s.starBackVisible,y.starMat.uniforms.uBright.value=ms*s.starBackBright*g.focusDome,E.visible=s.cloudShown,T.visible=s.starPtsVisible,A.uniforms.uStarBright.value=s.starBright*(n==="low"?2:1),de.visible=!s.gravityGone,U.visible=n!=="low"&&!s.gravityGone,w.visible=n!=="low"&&s.diskGhostVisible,pt.visible=s.ringVisible,L.visible=!1,me&&(me.strength=s.bloomStrength*g.focusBloom+g.nebulaFlashBloom,me.radius=s.bloomRadius),Q.uniforms.uExposure.value=s.exposure,Q.uniforms.uOlive.value=s.olive,Q.uniforms.uWarmth.value=s.warmth,Q.uniforms.uSat.value=s.gradeSat,Q.uniforms.uToneComp.value=s.toneComp,Q.uniforms.uGrain.value=s.grain,Q.uniforms.uGrainSeed.value=t?0:Math.random(),e.setClearColor(f.setRGB(s.roomTint[0],s.roomTint[1],s.roomTint[2]),1)},wt={programsAtFirstFrame:0,programsAfterWarm:0,bakeDone:!1,granBakeDone:!1,blastBakeDone:!1,sunBakeDone:!1,programsNow:()=>e.info.programs?.length??0},xt={calls:0,points:0,triangles:0,lines:0};let da=!1;window[oe.drawAudit]={snapshot:()=>(da=!0,{calls:xt.calls,points:xt.points,triangles:xt.triangles,lines:xt.lines,programs:e.info.programs?.length??0,geometries:e.info.memory.geometries,textures:e.info.memory.textures})};const ua=Ei()?Pn({renderer:e,bootTier:n,tierSource:Ti(),getActiveTier:()=>Sa,diskParticles:c,halfResParticles:Oe!==null,gravitySimActive:H.available,getGranBakeApplied:()=>B,getFrameStats:()=>xt}):null;ua&&(da=!0);let co=!1;const uo=()=>{co||(co=!0,window.dispatchEvent(new CustomEvent(Ni)))};(Ie||le||ye||H.available)&&!Gt&&window.dispatchEvent(new CustomEvent(Ai));let po=!1;const Us=()=>{if(po)return;po=!0,wt.programsAtFirstFrame=e.info.programs?.length??0,window[oe.gpuWarm]=wt;const s=()=>{if(nt){uo();return}if(Ie&&!O){O=!0,Ie.bake(),Fe(),wt.granBakeDone=B,requestAnimationFrame(s);return}if(le&&!ie){ie=!0,le.bake(),dt(),wt.blastBakeDone=ge,requestAnimationFrame(s);return}if(ye&&!ft){ft=!0,ye.bake(),v(),wt.sunBakeDone=r,requestAnimationFrame(s);return}if(H.available&&!H.isBaked()){H.bake(),requestAnimationFrame(s);return}wt.bakeDone=!H.available||H.isBaked(),wt.programsAfterWarm=e.info.programs?.length??0,uo()};requestAnimationFrame(s)},Hs=()=>{Us()};function Xt(){if(nt)return;if(document.hidden){bt=0;return}bt=requestAnimationFrame(Xt);const s=performance.now();ua?.tick(s);const g=(s-Rs)/1e3,ot=u.isExplorationMode?.()===!0?u.getFocusTarget?.()??null:null;qe=Math.max(0,Math.min(1,u.getProgress?.()??qe)),Ee=u.getStage();const W=.25;g<W&&(ga=Ee);const V=ce(oe.morph);typeof V=="number"&&(Ee=V,qe=Yo(V));let Xe=t?0:Math.exp(-Math.pow((Ee-.62)/.09,2));const Te=ce(oe.flash);typeof Te=="number"&&(Xe=Math.max(0,Math.min(1,Te)));const fo=ce(oe.nebulaFlash),mo=typeof fo=="number"?Math.max(0,Math.min(1,fo)):0,go=Xe*.72,vo=mo*.5,bo=Math.max(go,vo),Ws=vo>go;Q.uniforms.uNova.value=bo,Q.uniforms.uPeak.value=.88;const wo=ce(oe.flashDir);Q.uniforms.uNovaDir.value=Ws?1:typeof wo=="number"?wo:1;const q=qi({stage:Ee,reduced:t,nova:Xe,cfg:I});Ct+=((ot?1:0)-Ct)*(t?1:.08),St.focusEmission=1+Ct*.18,St.focusBloom=1+Ct*.12,St.focusDome=1+Ct*.08;const Vs=Math.abs(Ee-Ka),Ys=Math.abs(qe-Xa);Ka=Ee,Xa=qe;const js=V!==void 0||Te!==void 0||ce(oe.nebLight)!==void 0||ce(oe.nebulaFlash)!==void 0||ce(oe.erupt)!==void 0||ce(oe.giantErupt)!==void 0||ce(oe.streak)!==void 0||ce(oe.tailEps)!==void 0,qs=Math.abs((ot?1:0)-Ct)<ba,Ks=!H.available||H.isBaked(),Xs=q.dot&&Ks,$s=Kt&&g>=W&&Vs<ba&&Ys<ba&&Xe<.001&&!_t&&qs&&!js&&Xs,Zs=Sa==="low"&&!$a&&s-wa<Ds,Js=s-wa>=Ps;if($s&&!Js||Zs&&Kt)return;wa=s;const yo=window;if(yo.__bhRendered=(yo.__bhRendered|0)+1,Ms){if(Ta!==0){const _=s-Ta;_>0&&_<1e3&&(xa===Zt?Ea-=Qa[ha]:xa+=1,Qa[ha]=_,Ea+=_,ha=(ha+1)%Zt,xa===Zt&&Mi(Bt,Ea/Zt)&&(i.uniforms.uVisibleRatio.value=Bt.visibleRatio,l.uniforms.uVisibleRatio.value=Bt.visibleRatio,i.uniforms.uVisibleBrightGain.value=Uo(Bt.visibleRatio),l.uniforms.uVisibleBrightGain.value=Uo(Bt.visibleRatio),ae()))}Ta=s}const So=ce(oe.giantSize);St.giantScale=typeof So=="number"?So/i.uniforms.uGiantR.value:q.giantScale;const xo=t?0:g*Je;i.uniforms.uGiantSpin.value=xo,l.uniforms.uGiantSpin.value=xo;const Qs=.45,ei=-.18,Eo=q.cloudSide?4*q.yrGrow*(1-q.yrGrow):0;_e.set(Qs*Eo,ei*Eo,0),i.uniforms.uGiantCenter.value=_e,l.uniforms.uGiantCenter.value=_e;let Da=0;const ti=Ee>=2.3;if(H.available&&(ti||q.nebulaShader)&&!H.isBaked()&&H.bake(),Ie&&!O&&(O=!0,Ie.bake(),Fe(),wt.granBakeDone=B),le&&!ie&&(ie=!0,le.bake(),dt(),wt.blastBakeDone=ge),ye&&!ft&&(ft=!0,ye.bake(),v(),wt.sunBakeDone=r),H.available&&H.isBaked()&&(q.simBlend>.001||q.collapse>.001)){const _=H.sampleAt(q.collapse);_&&(i.uniforms.uSimPos.value=_.texA,l.uniforms.uSimPos.value=_.texA,i.uniforms.uSimPosB.value=_.texB,l.uniforms.uSimPosB.value=_.texB,i.uniforms.uSimMix.value=_.mix,l.uniforms.uSimMix.value=_.mix,Da=q.simBlend)}St.simBlend=Da,ce(oe.inspect)&&(window.__bhLook={stage:Ee,simAvailable:H.available,simBaked:H.isBaked(),lookSimBlend:q.simBlend,lookCollapse:q.collapse,ctxSimBlend:Da,cloudBright:q.cloudBright,nebFade:q.nebFade,cloudW:q.cloudW,meshW:q.meshW,starFormed:q.starFormed,nebulaShader:q.nebulaShader,camLen:a.position.length()});const To=ce(oe.nebLight);St.nebLight=typeof To=="number"?To:1;const Ao=ce(oe.tailEps);typeof Ao=="number"&&ve("uTailEps",Math.max(0,Ao));const ko=ce(oe.rgbake);typeof ko=="number"&&ve("uGranBakeReady",ko>0&&B?1:0);const Ro=ce(oe.blastbake);typeof Ro=="number"&&ve("uBlastBakeReady",Ro>0&&ge?1:0);const Po=ce(oe.sunbake);typeof Po=="number"&&(y.surfaceMat.uniforms.uSunBakeReady.value=Po>0&&r?1:0);const Do=q.starFormed>0&&q.starFormed<1;Do?(y.glowMat.uniforms.uColor.value.setRGB(.35+.65*q.starFormed,.55*q.starFormed+.55*(1-q.starFormed),.16+.74*(1-q.starFormed)),ma=!1):ma||(y.glowMat.uniforms.uColor.value.setRGB(.72,.56,.24),ma=!0),At=q.sunRigVisible&&!Do,De=q.cloudSide&&q.cloudShown&&q.yrGrow>.9&&q.yrColor>.9&&q.kCollapse<.02;const No=1-we((Ee-.08)/.34);X.visible=!q.gravityGone&&Ee<.45&&No>0,C.uPresence.value=X.visible?No:0;const Mo=Ee-ga;Math.abs(Mo)>6e-4&&(ja=Mo>0?1:-1),ga=Ee;const Lo=ce(oe.streak),Na=typeof Lo=="number"?Lo:q.streak;Ze.visible=Na>.001,Z.uStreak.value=Na,Z.uStreakDir.value=ja,St.streakGasDim=1-.6*Na,St.nebulaFlashBloom=mo*.18,zs(q,St),!t&&la>=0&&g<la+J&&(Q.uniforms.uExposure.value*=1+.45*(1-(g-la)/J));const ht=Oi(qe,g,Xe,t);if(a.position.set(ht.position[0],ht.position[1],ht.position[2]),lt.set(ht.target[0],ht.target[1],ht.target[2]),!t&&ht.parallax>0&&(a.position.x+=xe*ht.parallax,a.position.y+=-Ge*ht.parallax*.45,lt.x+=xe*ht.parallax*.35,lt.y+=-Ge*ht.parallax*.18),!t){const _=qo(Math.min(g/j,1)),Ae=we(qe/Pe),pe=Math.max(_,Ae),ze=1-we((qe-Pe)/(et-Pe)),Ne=Se*pe*ze;Ne>1e-4&&(Ye.set(lt.x,lt.y,lt.z),Ce.copy(a.position).sub(Ye),Ce.lengthSq()>1e-6&&(Ce.normalize(),a.position.addScaledVector(Ce,Ne)))}const Oo=ce(oe.giantPosX),Io=ce(oe.giantPosY);if(Oo!==void 0||Io!==void 0){const _=Oo??0,Ae=Io??0,pe=we((qe-Qe[0])/(Qe[1]-Qe[0])),ze=we((qe-ue[0])/(ue[1]-ue[0])),Ne=pe*(1-ze);a.position.x+=_*Ne,a.position.y+=Ae*Ne,lt.x+=_*Ne,lt.y+=Ae*Ne}if(a.lookAt(lt),_t){const _=Math.min(1,(performance.now()-eo)/1e3/(t?Is:Os));if(!t){const pe=qo(_);a.position.lerpVectors(ca,Pa,pe),a.position.applyAxisAngle(_s,Bs*Math.PI/180*(1-pe)),lt.lerpVectors(oo,ka,pe),a.lookAt(lt),a.fov=I.fovDeg+(Gs-I.fovDeg)*pe,a.updateProjectionMatrix()}const Ae=Math.min(1,(_-io)/(so-io));Ra=Ae<=0?0:Ci(Ae)*Fs,ao?.(Ra),!Aa&&_>=so&&(Aa=!0,to?.())}else Ra=0;if(Ot.set(0,0,0).project(a),Q.uniforms.uCenter.value.set(Math.max(0,Math.min(1,Ot.x*.5+.5)),Math.max(0,Math.min(1,Ot.y*.5+.5))),u.onMarkerFrame){const _=Ot.x,Ae=Ot.y,pe=Ee>=4.5,ze=pe?0:28,Ne=pe?0:-36,be=(_*.5+.5)*window.innerWidth+ze,re=(1-(Ae*.5+.5))*window.innerHeight+Ne,st=_>-1.1&&_<1.1&&Ae>-1.1&&Ae<1.1,Dt=Ii(Fi(qe)),Nt=Dt!==null&&Xe<.01&&!_t;u.onMarkerFrame({x:be,y:re,stage:Ee,visible:st&&Nt,gateOk:Nt,beatId:Dt})}if(G.frame(Ot.x,Ot.y,Ee,g,u.isHudActive?u.isHudActive():!1,bo),!t){const _=qe>=.39&&qe<=.49,pe=qe>=.74?.08:_?.25:1,ze=Math.sin(g*.067+2.3)*.0016*pe,Ne=ht.shake;if(Ne>1e-4){const be=g*47,re=a.position.length()*.0045*Ne,st=(Math.sin(be*1)+Math.sin(be*2.3+1.3))*.5*re,Dt=(Math.sin(be*1.37+.7)+Math.sin(be*2.9+3.1))*.5*re,Nt=Math.sin(be*.83+2)*re*.6;a.translateX(st),a.translateY(Dt),a.translateZ(Nt);const $t=(Math.sin(be*.91+.4)+Math.sin(be*1.7+2.6))*.5*.028*Ne;a.rotateZ(ze+$t)}else a.rotateZ(ze)}if(!(_t&&!t)&&a.fov!==I.fovDeg&&(a.fov=I.fovDeg,a.updateProjectionMatrix()),Be){const _=Math.min(Math.max(g-qa,0),.1);qa=g,Be.update(_,a,Ee,xe*2,-Ge*2)}const Re=t?0:g,Fo=t||q.nebulaShader?0:g;if(i.uniforms.uTime.value=Fo,l.uniforms.uTime.value=Fo,i.uniforms.uDotTime.value=Re,l.uniforms.uDotTime.value=Re,A.uniforms.uTime.value=Re,N.uniforms.uTime.value=Re,Q.uniforms.uTime.value=Re,C.uTime.value=Re,se.uniforms.uTime.value=Re,z.uniforms.uTime.value=Re,Ve.uniforms.uTime.value=Re,Ze.visible&&(fe.uniforms.uTime.value=Re),y.group.visible&&(y.surfaceMat.uniforms.uTime.value=Re,y.coronaMat.uniforms.uTime.value=Re,y.loopMat.uniforms.uTime.value=Re,y.corona.quaternion.copy(a.quaternion),!t)){const _=Math.min(Math.max(Re-va,0),.1),Ae=y.surfaceMat.uniforms.uErupt.value,pe=y.surfaceMat.uniforms.uEruptAge.value,ze=ce(oe.erupt);for(let be=0;be<it.length;be++){const re=it[be];re.intensity>0&&(re.age+=_,re.age>=tt&&(re.intensity=0)),typeof ze=="number"&&be===it.length-1?(je.copy(a.position),y.surface.worldToLocal(je).normalize(),Ae[be].set(je.x,je.y,je.z,Math.max(0,Math.min(1,ze))),pe[be]=Re%tt):(Ae[be].set(re.dir.x,re.dir.y,re.dir.z,re.intensity),pe[be]=re.age)}const Ne=ce(oe.waveFlow);typeof Ne=="number"&&(y.surfaceMat.uniforms.uWaveFlow.value=Ne)}if(!t){const _=Math.min(Math.max(Re-va,0),.1),Ae=i.uniforms.uErupt.value,pe=i.uniforms.uEruptAge.value,ze=l.uniforms.uErupt.value,Ne=l.uniforms.uEruptAge.value,be=ce(oe.giantErupt);for(let re=0;re<vt.length;re++){const st=vt[re];st.intensity>0&&(st.age+=_,st.age>=It&&(st.intensity=0));let Dt=st.dir.x,Nt=st.dir.y,$t=st.dir.z,Ma=st.intensity,La=st.age;typeof be=="number"&&re===vt.length-1&&st.intensity<=0&&(je.copy(a.position).normalize(),je.applyAxisAngle(K,-i.uniforms.uGiantSpin.value),Dt=je.x,Nt=je.y,$t=je.z,Ma=Math.max(0,Math.min(1,be)),La=Re%It),Ae[re].set(Dt,Nt,$t,Ma),pe[re]=La,ze[re].set(Dt,Nt,$t,Ma),Ne[re]=La}}if(va=Re,y.starBack.visible&&(y.starMat.uniforms.uTime.value=Re),S(),da&&(e.info.autoReset=!1,e.info.reset()),Oe){const _=q.particleFullRes,Ae=_?0:aa;E.layers.set(Ae),w.layers.set(Ae);const pe=_?1:te;i.uniforms.uSizeScale.value!==pe&&(i.uniforms.uSizeScale.value=pe,l.uniforms.uSizeScale.value=pe);const ze=T.visible||!_&&(E.visible||w.visible);Oe.quad.visible=ze,ze&&Oe.renderInto(e,d,a)}if(Le.render(),G.render(e,a),da&&(xt.calls=e.info.render.calls,xt.points=e.info.render.points,xt.triangles=e.info.render.triangles,xt.lines=e.info.render.lines),!(!Kt&&Gt&&!Ja&&g<8&&(g<4||(ya=s-Za<=36?ya+1:0,Za=s,ya<15)))&&!Kt){Kt=!0,la=g,document.body.dataset[Di]="true",window.dispatchEvent(new CustomEvent(zo));try{window.sessionStorage?.setItem(_o,"1")}catch{}Hs()}}return ae(),(async()=>{try{if(typeof e.compileAsync=="function"){const s=new _a(2,2,{type:jt}),g=new ss(2,2),R=[];if(me){const W=me;W.materialHighPassFilter&&R.push(W.materialHighPassFilter),Array.isArray(W.separableBlurMaterials)&&R.push(...W.separableBlurMaterials),W.compositeMaterial&&R.push(W.compositeMaterial),W.blendMaterial&&R.push(W.blendMaterial)}if(e.getContext().getExtension("KHR_parallel_shader_compile")!==null){const W=[];e.setRenderTarget(s);try{W.push(e.compileAsync(d,a));const Ke=new Lt;for(const yt of R)Ke.add(new ct(g,yt));W.push(e.compileAsync(Ke,a))}finally{e.setRenderTarget(null)}const V=new Lt;V.add(new ct(g,Q.material)),W.push(e.compileAsync(V,a)),await Promise.all(W),g.dispose(),s.dispose()}else if(Gt){const W=[()=>{e.setRenderTarget(s);try{e.compile(d,a)}finally{e.setRenderTarget(null)}},()=>{e.setRenderTarget(s);try{const V=new Lt;for(const Ke of R)V.add(new ct(g,Ke));e.compile(V,a)}finally{e.setRenderTarget(null)}},()=>{const V=new Lt;V.add(new ct(g,Q.material)),e.compile(V,a),g.dispose(),s.dispose()}];if(Ja){let V=!1;const Ke=()=>{if(V)return;V=!0;let yt=0;const Xe=()=>{nt||(W[yt](),yt+=1,yt<W.length&&requestAnimationFrame(Xe))};requestAnimationFrame(Xe)};window.addEventListener(zo,Ke,{once:!0}),window.setTimeout(Ke,6e3)}else for(const V of W)V()}else g.dispose(),s.dispose()}}catch{}nt||Xt()})(),Object.assign(()=>{nt=!0,cancelAnimationFrame(bt),window.removeEventListener("resize",ae),window.removeEventListener("pointermove",ut),document.removeEventListener("visibilitychange",no),window.removeEventListener("pointerdown",Wa),window.removeEventListener("pointerdown",Ya),window.removeEventListener("pointerup",Va),window.removeEventListener("pointercancel",na),window.removeEventListener("pointerleave",na),e.domElement.removeEventListener("webglcontextlost",lo,!1),e.domElement.removeEventListener("webglcontextrestored",ho,!1);const s=[Le,h,b,F,P,ne,We,y,G];Oe&&s.push(Oe),le&&s.push(le),ye&&s.push(ye),Ie&&s.push(Ie),ua&&s.push(ua),Be&&s.push(Be);for(const g of s)g.dispose();H.dispose(),e.dispose(),e.domElement.parentNode===o&&o.removeChild(e.domElement)},{hitTestGiant:ks,beginDive:s=>{if(_t)return;_t=!0,Aa=!1,to=s.onApex,ao=s.onDiveProgress??null,eo=performance.now(),ca.copy(a.position),oo.copy(lt);const g=s.state!==void 0?Cs[s.state]:void 0;if(g!==void 0?Pa.copy(ca).normalize().multiplyScalar(Math.min(g,ca.length()*.6)):Pa.copy(ro),s.targetNdc){const R=Ls.set(0,0,0).project(a).z;ka.set(s.targetNdc.x,s.targetNdc.y,R).unproject(a)}else ka.set(0,0,0)},pauseRendering:()=>{nt=!0,cancelAnimationFrame(bt),bt=0},resumeRendering:()=>{nt&&(nt=!1,bt===0&&!document.hidden&&Xt())}})}export{Yn as createScene};
