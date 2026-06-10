// Shared scene types: the uniform-block alias and the render-loop hook surface.
import type { HudTargetId } from '../HudNavigation';

export type Uniforms = Record<string, { value: unknown }>;

/** Options for the cinematic camera dive (beginDive). The caller owns navigation:
 *  the scene fires onApex at the bloom apex and the caller routes the SPA there.
 *  The scene drives only the geometry (camera plunge) + the overlay strength. */
export interface DiveOptions {
  /** Bloom aim in NDC. Defaults to the projected star origin when omitted — the
   *  caller can pass the marker's screen point so the whiteout erupts from where
   *  the visitor clicked rather than dead-centre. */
  targetNdc?: { x: number; y: number };
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
  /** True only when the red-giant beat is on screen AND the client point falls on
   *  the giant's projected surface (a sphere raycast at the world origin). Cheap
   *  no-op (returns false) outside the red-giant beat. */
  hitTestGiant(clientX: number, clientY: number): boolean;
  /** Begin the cinematic dive into the star; no-op if a dive is already active.
   *  Plunges the LIVE camera toward the world origin and ramps an overlay strength
   *  to full white, firing onApex once at the apex for the caller to navigate. */
  beginDive(opts: DiveOptions): void;
  /** Stop the per-frame render loop WITHOUT disposing the GL context. Idempotent.
   *  HeroIsland calls this on `astro:before-swap` so the heavy ~1.2M-point render
   *  loop is not competing with ClientRouter for the main thread while it prepares
   *  and runs the view-transition swap — the cause of the occasional SPA stall on
   *  this page. Disposal (the GL teardown) still happens later, on React unmount. */
  pauseRendering(): void;
}

/** Per-frame marker data emitted by the scene, consumed by StarMarker without
 *  triggering React re-renders (written to a ref, read on rAF). x/y are CSS pixels
 *  relative to the viewport (position: fixed coordinate space). stage is the current
 *  eased legacy stage value so the component can determine which settled state is
 *  active without re-importing timeline logic. visible combines the on-screen check
 *  with the settled-window gate: false means hide the marker entirely. */
export interface MarkerFrame {
  x: number;
  y: number;
  stage: number;
  visible: boolean;
  /** Settled-window + no-nova gate WITHOUT the on-screen test. Fixed-spot markers
   *  (authored at a viewport fraction, always on-screen by construction) read this
   *  instead of `visible`, so they aren't suppressed when the star's WORLD-ORIGIN
   *  projects off-screen — e.g. the camera-parked red giant on a narrow/mobile
   *  viewport, where the orb fills the frame but its centre projects past the NDC
   *  edge, making the origin-based `onScreen` false. */
  gateOk: boolean;
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
}
