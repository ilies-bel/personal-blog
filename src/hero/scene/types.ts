// Shared scene types: the uniform-block alias and the render-loop hook surface.
import type { HudTargetId } from '../HudNavigation';

export type Uniforms = Record<string, { value: unknown }>;

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

/** What createScene() returns: the teardown function, which ALSO carries a
 *  per-frame hit-test so callers (HeroIsland) can ask whether a screen point is
 *  over the live red giant's projected disk. Calling the value disposes the scene
 *  exactly as before — the method is bolted on via Object.assign for back-compat. */
export interface SceneHandle {
  /** Tear down the scene (renderer, rigs, listeners). Same contract as before. */
  (): void;
  /** True only when the red-giant beat is on screen AND the client point falls on
   *  the giant's projected surface (a sphere raycast at the world origin). Cheap
   *  no-op (returns false) outside the red-giant beat. */
  hitTestGiant(clientX: number, clientY: number): boolean;
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
