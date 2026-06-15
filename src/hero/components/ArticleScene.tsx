// ArticleScene — the article-page sibling of HeroIsland's backdrop branch.
//
// THE WHOLE IDEA, in one sentence: the hero engine is already a pure function of
// ONE number (getStage). HeroIsland's backdrop mode pins that number to a CONSTANT
// (backdropStage) so the scene sits frozen behind the reading column. ArticleScene
// instead drives that SAME getStage from ARTICLE scroll — so reading the post scrubs
// the live stellar lifecycle through an authored window. No second engine, no new
// shaders, no new camera math: it is the identical createScene, fed a moving number.
//
// That is what makes the article read in the SAME ROOM, with the SAME motion grammar,
// as the hero — instead of being a static wallpaper the hero's choreography dies on.
//
// Readability is preserved by the CSS dim wash (body.article-page .bh-backdrop in
// hero.css), which this component does NOT weaken; it only PUBLISHES progress +
// the active section so the chrome (ArticleHud) and a subtle section-break brighten
// can react. The prose never depends on the canvas: no-WebGL / reduced-motion fall
// back to a readable page exactly like the hero does.
import { useEffect, useRef } from 'react';
import { ScrollTracker, clamp01 } from '../scroll';
import { BUILT_STAGES } from '../timeline';
import { detectDeviceTier } from '../lib/config';
import { isWebGLUnavailableError, type SceneHandle } from '../scene/types';
import { resolveReducedMotionNow } from './reduced-motion';

/** Custom-event name the scene publishes each meaningful scroll step. ArticleHud
 *  (a sibling island — islands don't share React context) listens for it on window
 *  rather than prop-drilling across roots. Mirrors the hero's window-event seam
 *  (HUD_POWER_EVENT et al.) so the two HUDs speak the same dialect. */
export const ARTICLE_PROGRESS_EVENT = 'article:progress';

export interface ArticleProgressDetail {
  /** 0 at the top of the article, 1 at the bottom of its scroll range. */
  progress: number;
  /** The getStage transition-space value the scene is currently pinned to —
   *  lerp(journey[0], journey[1], easedProgress). Published so chrome can name the
   *  active celestial beat with the same resolvers the hero uses. */
  stage: number;
}

interface ArticleSceneProps {
  /** [from, to] in getStage transition-space (0 = black hole … 3.5 = nebula). The
   *  article scrubs the scene across this window as it scrolls top → bottom. */
  journey: readonly [number, number];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Match the hero's perceptual gate: the scene render loop reads exact progress from
// the ref every frame, but we only re-broadcast to the (cross-root) chrome when the
// value has moved enough to matter — keeps the event traffic light without the chrome
// ever lagging a section change (section spy lives in ArticleHud off this same value).
const PROGRESS_MIN_DELTA = 1 / 600;

export default function ArticleScene({ journey }: ArticleSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Exact article progress (0..1). The scene's getStage reads this every frame; the
  // window event is throttled to PROGRESS_MIN_DELTA. A ref (not state) so scrolling
  // never re-renders this island — same discipline as HeroIsland's progressRef.
  const progressRef = useRef(0);
  const publishedRef = useRef(-1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const [from, to] = journey;
    // Clamp the authored window into the engine's valid getStage range so a typo in
    // frontmatter can never push the morph past the built lifecycle.
    const clampStage = (s: number): number => Math.min(BUILT_STAGES, Math.max(0, s));
    const stageFor = (p: number): number => clampStage(lerp(from, to, clamp01(p)));

    // Seed the published baseline at the journey START so the first frame (and any
    // dive resurface arriving into this article) opens on the article's opening beat,
    // not a flash of stage 0.
    progressRef.current = 0;

    const isReduced = resolveReducedMotionNow();
    const tier = detectDeviceTier();

    const broadcast = (force = false): void => {
      const p = progressRef.current;
      if (!force && Math.abs(p - publishedRef.current) < PROGRESS_MIN_DELTA) return;
      publishedRef.current = p;
      window.dispatchEvent(
        new CustomEvent<ArticleProgressDetail>(ARTICLE_PROGRESS_EVENT, {
          detail: { progress: p, stage: stageFor(p) },
        }),
      );
    };

    // The scroll tracker is pure JS, so it is wired the instant this island hydrates;
    // only the heavy GPU engine waits for its own dynamic chunk. stageCount is
    // irrelevant here (we map progress ourselves), so pass 1.
    const tracker = new ScrollTracker(1);
    const unsub = tracker.subscribe((s) => {
      progressRef.current = s.progress;
      broadcast();
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    broadcast(true);

    // REDUCED MOTION: never import the WebGL engine. The CSS dim layer + the article's
    // own copy stand on their own; ArticleHud still tracks scroll (it listens to the
    // same event, which we keep dispatching). The poster cross-fade is owned by the
    // page layout's reduced-motion path, not this canvas host.
    if (isReduced) {
      return () => {
        unsub();
        tracker.stop();
      };
    }

    let cancelled = false;
    let dispose: SceneHandle | null = null;

    // The article-scroll getStage — the ONE new mapping. Everything downstream
    // (camera arc, shader stage, dwell, scene id) is the engine's existing pure
    // function of this number, unchanged.
    const getStage = (): number => stageFor(progressRef.current);

    void import('../scene/createScene')
      .then(({ createScene }) => {
        if (cancelled) return;
        // Backdrop-shaped hook set: just getStage. We deliberately omit onMarkerFrame
        // (no in-article star markers) and the exploration/focus hooks (no HUD nav
        // rail driving previews) — the article HUD is a passive readout, not a
        // navigator. createScene tolerates the minimal hook set (backdrop mode already
        // passes only getStage).
        dispose = createScene(host, isReduced, { getStage }, tier);
      })
      .catch((error: unknown) => {
        // Like HeroIsland's backdrop branch: swallow a missing-WebGL / chunk-load
        // failure so this atmosphere layer simply stays blank while the article stays
        // fully readable. The typed narrowing keeps the WebGL case distinguishable.
        void isWebGLUnavailableError(error);
      });

    // Pause the render loop the instant ClientRouter starts a swap, mirroring
    // HeroIsland — the heavy GPU loop must not starve the view-transition while the
    // next page mounts its own backdrop. Disposal still happens on React unmount.
    const onBeforeSwap = (): void => {
      dispose?.pauseRendering?.();
    };
    document.addEventListener('astro:before-swap', onBeforeSwap);

    return () => {
      cancelled = true;
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      unsub();
      tracker.stop();
      dispose?.();
    };
  }, [journey]);

  // Same markup contract as HeroIsland's backdrop return: a single fixed canvas host
  // at the .bh-backdrop z-layer, dimmed by the existing CSS. aria-hidden — atmosphere.
  return (
    <div className="bh-root bh-root--backdrop">
      <div className="bh-stage bh-backdrop" ref={hostRef} aria-hidden="true" />
    </div>
  );
}
