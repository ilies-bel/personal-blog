// Shared scene types: the uniform-block alias and the render-loop hook surface.
import type { HudTargetId } from '../HudNavigation';

export type Uniforms = Record<string, { value: unknown }>;

/** The seam every rig factory (buildDisk/buildStarfield/buildWarp/buildRing/
 *  buildStreak/buildSunRig/buildPostChain) satisfies: a rig owns some three.js
 *  resources and knows how to release them. createScene assembles a heterogeneous
 *  set of rigs but tears them ALL down through this one contract — `rigs.forEach(r
 *  => r.dispose())` — instead of seven hand-listed disposal calls that drift as
 *  rigs are added or removed. The per-rig specifics (materials, points, segments,
 *  passes) stay on each concrete `*Rig` type; this names only what they share. */
export interface Rig {
  dispose: () => void;
}

/** A Rig that also exposes a shared uniform block driven per frame. The five
 *  GPU-geometry rigs (disk, starfield, warp, ring, streak) all hand the render
 *  loop a single `uniforms` object their material(s) reference, so the loop can
 *  write `uTime`/look uniforms through this common surface. (SunRig and PostRig
 *  are plain `Rig`s: their uniforms live on per-mesh materials / per-pass passes,
 *  not one shared block, so they deliberately do NOT widen to this.) */
export interface UniformRig extends Rig {
  uniforms: Uniforms;
}

/** Thrown by createScene() when the WebGL visual cannot be created — either no
 *  WebGL context is obtainable (browser/device without WebGL, or it is blocked)
 *  or THREE.WebGLRenderer construction itself throws. createScene FAILS GRACEFULLY:
 *  it disposes anything partially built and throws THIS typed error (never a raw
 *  GL string), so the caller can `.catch(isWebGLUnavailableError)` and show the
 *  on-brand fallback instead of crashing on an unhandled rejection. A dedicated
 *  class (not a bare Error) lets HeroIsland tell "no WebGL" apart from an unrelated
 *  failure (e.g. the dynamic-import chunk failing to load) without string-matching. */
export class WebGLUnavailableError extends Error {
  constructor(message = 'WebGL is unavailable: the hero visual cannot be created.') {
    super(message);
    this.name = 'WebGLUnavailableError';
  }
}

/** Narrow an unknown caught value to WebGLUnavailableError. Used in HeroIsland's
 *  dynamic-import `.catch()` so the no-WebGL path is handled explicitly while any
 *  OTHER rejection (chunk load error, programming bug) is left to surface normally. */
export function isWebGLUnavailableError(error: unknown): error is WebGLUnavailableError {
  return error instanceof WebGLUnavailableError;
}

/** Options for the cinematic camera dive (beginDive). The caller owns navigation:
 *  the scene fires onApex at the bloom apex and the caller routes the SPA there.
 *  The scene drives only the geometry (camera plunge) + the overlay strength. */
export interface DiveOptions {
  /** Bloom/plunge aim in NDC (x,y each in [-1,1], y up). When supplied the camera
   *  turns to FACE this on-screen point as it dollies in — so the clicked marker
   *  (even an off-centre nebula speck) grows + centres and the camera dives INTO it,
   *  not toward dead-centre. Defaults to the star at the world origin when omitted
   *  (a centred plunge, the original behaviour). */
  targetNdc?: { x: number; y: number };
  /** Which lifecycle state fired the dive. The caller (HeroIsland) uses it to pick
   *  the bloom's tint (a `data-bloom-state` attribute on the overlay → a per-state
   *  colour in hero.css); the scene uses it to pick the dolly END POINT — solid
   *  bodies (red giant / yellow star) brake just off the photosphere instead of
   *  flying through it (DIVE_SURFACE_STOP in createScene), so the camera never
   *  clips inside a star. Optional: absent falls back to the default tint and the
   *  through-the-origin plunge. */
  state?: HudTargetId;
  /** Called every frame with the 0..1 overlay (bloom-to-white) strength so the
   *  caller can drive a fullscreen white layer's opacity. Optional. */
  onDiveProgress?: (strength: number) => void;
  /** Fired EXACTLY ONCE at the bloom apex — the caller navigates here. The plunge
   *  keeps running visually for the brief tail after the apex, hidden under the
   *  white, while the destination page loads. */
  onApex: () => void;
}

/** What createScene() returns: the teardown function, which ALSO carries a
 *  per-frame hit-test so callers (HeroIsland) can ask whether a screen point is
 *  over the live red giant's projected disk, plus the cinematic dive entry point.
 *  Calling the value disposes the scene exactly as before — the methods are bolted
 *  on via Object.assign for back-compat. */
export interface SceneHandle {
  /** Tear down the scene (renderer, rigs, listeners). Same contract as before. */
  (): void;
  /** True when the client point falls on either clickable star body:
   *  • the settled red giant's projected surface (sphere raycast at the world origin)
   *    when `redGiantClickable` (the calm red-giant resting beat), OR
   *  • the yellow-star photosphere mesh when `sunClickable` (the settled yellow star).
   *  Cheap no-op (returns false) outside both resting beats; never depends on HUD state. */
  hitTestGiant(clientX: number, clientY: number): boolean;
  /** Begin the cinematic dive into the clicked marker; no-op if a dive is already
   *  active. Dollies the LIVE camera toward (and just past) the world origin while
   *  turning to face opts.targetNdc (the marker's on-screen point — so an off-centre
   *  marker is dived INTO, not lurched-to-centre), and ramps an overlay strength to a
   *  soft cap, firing onApex once at the apex for the caller to navigate. */
  beginDive(opts: DiveOptions): void;
  /** Stop the per-frame render loop WITHOUT disposing the GL context. Idempotent.
   *  HeroIsland calls this on `astro:before-swap` so the heavy ~1.2M-point render
   *  loop is not competing with ClientRouter for the main thread while it prepares
   *  and runs the view-transition swap — the cause of the occasional SPA stall on
   *  this page. Disposal (the GL teardown) still happens later, on React unmount. */
  pauseRendering(): void;
  /** Resume the per-frame render loop after a `pauseRendering()` (mirrors the
   *  internal visibilitychange re-kick + onContextRestored resume path). Idempotent:
   *  no-op if the loop is already running. ArticleScene uses this from an
   *  IntersectionObserver — pause when the article has scrolled fully out of view,
   *  resume when any of it returns — so the GPU isn't morphing a backdrop nobody
   *  can see while the tab is still in the foreground. */
  resumeRendering(): void;
}

/** Per-frame marker data emitted by the scene, consumed by StarMarker without
 *  triggering React re-renders (written to a ref, read on rAF). x/y are CSS pixels
 *  relative to the viewport (position: fixed coordinate space). stage is the current
 *  eased legacy stage value (kept for readouts). visible combines the on-screen
 *  check with the beat-band gate: false means hide the marker entirely. */
export interface MarkerFrame {
  x: number;
  y: number;
  stage: number;
  visible: boolean;
  /** Beat-band + no-nova gate WITHOUT the on-screen test. Fixed-spot markers
   *  (authored at a viewport fraction, always on-screen by construction) read this
   *  instead of `visible`, so they aren't suppressed when the star's WORLD-ORIGIN
   *  projects off-screen — e.g. the camera-parked red giant on a narrow/mobile
   *  viewport, where the orb fills the frame but its centre projects past the NDC
   *  edge, making the origin-based `onScreen` false. */
  gateOk: boolean;
  /** The scene whose manifesto BEAT copy is on screen right now — computed by
   *  beatIdForLifecycleP from the same RAW scroll the text overlay reads — or
   *  null in a between-beats gap. StarMarker/HudNavigation compare this against
   *  a placement's state, so a marker's show/hide is frame-locked to its text. */
  beatId: HudTargetId | null;
}

export interface SceneHooks {
  /** Returns the current legacy shader lifecycle position. Sampled once per frame.
   *  The public scroll story is normalized progress; the shader stage is now an
   *  implementation detail produced by timeline.ts. */
  getStage: () => number;
  /** Returns the normalized forward scroll progress (0..1) for the camera rig. */
  getProgress?: () => number;
  /** Returns the active scene's dwell STRENGTH (0..1) for the CURRENT scroll
   *  position, 0 when the active scene declares no dwell. The render loop DAMPS its
   *  morph follow-ease by this amount so the visitor lingers on a dwelling beat. It
   *  is a damping of the internal ease only — the page scrollbar is never touched.
   *  Optional: backdrop mode and reduced motion ignore it (the ease is already
   *  instant under reduced motion). */
  getDwell?: () => number;
  /** Active HUD target. The render loop uses this only for a quiet focus boost;
   *  the stage preview itself still flows through getStage(). */
  getFocusTarget?: () => HudTargetId | null;
  /** True while the final HUD is controlling previews. Suppresses cinematic-only
   *  effects such as the supernova whiteout so menu hover never becomes flashy. */
  isExplorationMode?: () => boolean;
  /** Called once per frame with the projected position of the star object. Used by
   *  StarMarker to anchor HTML markers over the on-screen object without triggering
   *  React re-renders. Optional: backdrop mode does not provide this callback. */
  onMarkerFrame?: (m: MarkerFrame) => void;
  /** Fired when the GPU drops the WebGL context (`webglcontextlost`). The scene has
   *  already called preventDefault() (so the context CAN be restored) and PAUSED its
   *  render loop by the time this runs. The caller (HeroIsland) shows the on-brand
   *  fallback note + reveals the loader, mirroring the no-WebGL-at-mount path — a
   *  frozen canvas is replaced by usable, scroll-driven DOM. Optional. */
  onContextLost?: () => void;
  /** Fired when the GPU restores the context (`webglcontextrestored`) and the scene
   *  has best-effort resumed its render loop. The caller can clear the fallback note.
   *  NOTE: only the standard rigs recover on the live context; a full GPGPU re-bake is
   *  a documented follow-up, so callers may choose to keep the fallback up. Optional. */
  onContextRestored?: () => void;
}
