// Post-processing passes: film grade + supernova whiteout.
// Extracted verbatim from BlackHole.tsx — GLSL is byte-identical.
import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 },
    uGrain: { value: 0.05 },
    uWarmth: { value: 0.05 },
    uSat: { value: 0.1 },
    uOlive: { value: 0.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGrain, uWarmth, uSat, uOlive;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
      // soft tone map (preserves the white core)
      col = col / (col + vec3(0.78));
      col = pow(col, vec3(0.92));
      // desaturate -> grey
      float luma = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(luma), col, uSat);
      // slight warm tint in the highlights
      col *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth*0.85);
      // warm-GRAPHITE tint of the background + halo falloff. Red sits highest and
      // blue is pulled DOWN (never green-above-red, which is what read as olive):
      // the shadows go warm charcoal/bone, matching the engraving reference, not moss.
      // (uOlive kept as the uniform name for back-compat; it now drives the warm grade.)
      float shW = 1.0 - smoothstep(0.0, 0.5, luma);          // weight in the shadows
      col *= mix(vec3(1.0), vec3(1.06, 1.00, 0.82), uOlive*shW);
      col += vec3(0.022, 0.018, 0.012) * uOlive;             // warm-graphite floor
      col += vec3(0.005);                                     // slight neutral floor
      // fine grain
      float g = hash(vUv*uResolution + fract(uTime)*97.0);
      col += (g-0.5)*uGrain;
      // vignette
      vec2 q = vUv-0.5;
      float vig = smoothstep(1.10, 0.28, length(q)*1.25);
      col *= mix(0.66, 1.0, vig);
      col = clamp(col,0.0,1.0);
      gl_FragColor = vec4(col,1.0);
    }
  `,
};

// ===========================================================================
//  NOVA SHADER — the supernova whiteout, composited AFTER the grade pass.
//
//  The reverse-supernova's defining beat is a blinding flash that bleaches the
//  WHOLE screen. The grade pass above can't produce that: its tone-map
//  (col/(col+0.78)), warm/olive tints, vignette and final clamp all conspire to
//  keep the frame filmic and the corners dark. So the whiteout is a dedicated
//  fullscreen pass that runs on the ALREADY-GRADED image and mixes it toward
//  white by `uNova` (a time-based 0..1 envelope, driven from the frame loop,
//  decoupled from scroll so a fast scroller still sees the full blast).
//
//  Structure (user-chosen): a radial hot-center that grows outward with the
//  envelope, a temperature tint that runs blue-white at the peak and cools to
//  amber as it fades (handing off into the warm debris grade beneath), and a
//  FILMIC cap (uPeak ≈ 0.94) so even peak white stays a touch under pure #FFF
//  to match the rest of the tone-mapped scene.
//
//  DIRECTION (uNovaDir): the blast is mirrored per scroll direction.
//   • +1 EXPLODE (scroll UP, red giant → black hole, time running FORWARD): a
//     bright core erupts and its white front sweeps OUTWARD (center → edges),
//     blue-white at the peak then cooling to amber as it dissipates. This is the
//     original behaviour and is reproduced bit-for-bit.
//   • -1 IMPLODE (scroll DOWN, black hole → red giant, time running BACKWARD):
//     the "un-explosion". The envelope is the same 0→1→0 intensity (you can't
//     emit negative light), but the front COLLAPSES inward — it starts as a wide
//     ring at the edges and contracts to the center as the envelope rises — and
//     the temperature gathers cool then SNAPS blue-white at the peak (the exact
//     time-reverse of the explode cooldown). At the peak both directions reach
//     the same edge-to-edge bleach, so the handoff into/out of white is seamless.
// ===========================================================================

export const NovaShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uNova: { value: 0 },                                  // 0..1 master envelope
    uNovaDir: { value: 1 },                               // +1 explode / -1 implode
    uAspect: { value: 1 },                                // round (not elliptical) falloff
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },      // blast origin in screen UV
    uPeak: { value: 0.94 },                               // filmic cap (NOT pure white)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uNova, uNovaDir, uAspect, uPeak;
    uniform vec2 uCenter;
    varying vec2 vUv;
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
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
      float edgeGuard = smoothstep(1.12, 0.24, d);
      float coreBloom = smoothstep(0.88, 1.0, uNova) * smoothstep(0.62, 0.0, d) * 0.18;
      float bleach = max(uNova * front * edgeGuard, coreBloom) * uPeak;
      // TEMPERATURE.
      //  explode: blue-white when hot (high uNova) → warm amber as it cools.
      //  implode: time-reversed — gathers cool/amber, SNAPS blue-white at the peak
      //    (light arriving), the exact mirror of the explode cooldown. Achieved by
      //    reading the ramp on the rising envelope the same way; the perceptual
      //    reversal comes from the inward-collapsing front above carrying it.
      vec3 cold = vec3(0.90, 0.95, 1.0);   // ~#E6F2FF blue-white shock front
      vec3 warm = vec3(1.0, 0.90, 0.74);   // ~#FFE6BD cooling amber
      vec3 tint = mix(warm, cold, smoothstep(0.35, 0.85, uNova));
      vec3 white = mix(vec3(1.0), tint, 0.6); // mostly white, a slight temperature cast
      col = mix(col, white, clamp(bleach, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
