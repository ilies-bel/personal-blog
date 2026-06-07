// Shared scene types: the uniform-block alias and the render-loop hook surface.
import type { HudTargetId } from '../HudNavigation';

export type Uniforms = Record<string, { value: unknown }>;

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

export interface SceneHooks {
  /** Returns the current legacy shader lifecycle position. Sampled once per frame.
   *  The public scroll story is normalized progress; the shader stage is now an
   *  implementation detail produced by timeline.ts. */
  getStage: () => number;
  /** Returns the normalized forward scroll progress (0..1) for the camera rig. */
  getProgress?: () => number;
  /** Active HUD target. The render loop uses this only for a quiet focus boost;
   *  the stage preview itself still flows through getStage(). */
  getFocusTarget?: () => HudTargetId | null;
  /** True while the final HUD is controlling previews. Suppresses cinematic-only
   *  effects such as the supernova whiteout so menu hover never becomes flashy. */
  isExplorationMode?: () => boolean;
}
