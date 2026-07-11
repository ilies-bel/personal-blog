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
import { useEffect, useRef, useState } from 'react';
import { ScrollTracker, clamp01 } from '../scroll';
import { BUILT_STAGES } from '../timeline';
import { PresentationClock } from '../presentationClock';
import { detectDeviceTier } from '../lib/config';
// The sitewide 2-context WebGL budget: this island is a page's ONE ambient live
// layer (PRIORITY_AMBIENT). It acquires before the engine chunk is imported and
// releases on the same cleanup that disposes the renderer, so an inline figure's
// opt-in live run (PRIORITY_FIGURE) can never crowd it out — and a page at rest
// holds at most this one context.
import { glGovernor, PRIORITY_AMBIENT, type GovernorToken } from '../lib/glGovernor';
import { isWebGLUnavailableError, type SceneHandle } from '../scene/types';
import { PosterSlideshow, resolveReducedMotionNow } from './reduced-motion';

/** Custom-event name the scene publishes each meaningful scroll step. The reading
 *  HUDs (ArticleHud, GraveyardHud — sibling islands that don't share React context)
 *  listen for it on window rather than prop-drilling across roots. Named `scene:*`
 *  (not `article:*`) because the graveyard page consumes the SAME seam; mirrors the
 *  hero's window-event grammar (SCENE_READY_EVENT et al.) so every HUD speaks it. */
export const SCENE_PROGRESS_EVENT = 'scene:progress';

export interface SceneProgressDetail {
  /** 0 at the top of the page's scroll range, 1 at the bottom. */
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

// PosterSlideshow's four lifecycle slots are picked by Math.round(progress * 3) over
// 0..1. We only need to re-render this island when that index actually changes — at
// most three transitions across the whole article — so we quantise here instead of
// piping every scroll tick through React state. Mirrors progressRef/publishedRef's
// "ref while it doesn't change perception" discipline elsewhere in the file.
const posterSlotFor = (progress: number): number =>
  Math.round(clamp01(progress) * 3);

export default function ArticleScene({ journey }: ArticleSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Exact article progress (0..1). The scene's getStage reads this every frame; the
  // window event is throttled to PROGRESS_MIN_DELTA. A ref (not state) so scrolling
  // never re-renders this island — same discipline as HeroIsland's progressRef.
  const progressRef = useRef(0);
  const publishedRef = useRef(-1);

  // Mount-time render-mode decision. Both probes are memoised internally and SSR-safe
  // (this island is client:only "react", so window is present). We pick the branch
  // ONCE — reduced-motion preference flips DURING reading would only take effect on a
  // re-mount, matching how the rest of the article's chrome treats the preference.
  // 'canvas'   → today's live WebGL backdrop (high tier, motion allowed).
  // 'poster'   → PosterSlideshow driven by article progress (low tier, motion allowed)
  //              — protects 60fps / graceful-30fps on low-end GPUs the same way
  //              HeroIsland's reduced-motion branch protects the home page.
  // 'reduced'  → the existing reduced-motion early-out: no canvas, no slideshow here;
  //              the page layout's own reduced-motion path paints the backdrop.
  const [renderMode] = useState<'canvas' | 'poster' | 'reduced'>(() => {
    if (typeof window === 'undefined') return 'canvas';
    if (resolveReducedMotionNow()) return 'reduced';
    return detectDeviceTier() === 'low' ? 'poster' : 'canvas';
  });
  // Slideshow re-render trigger — only the slot index, not every frame's progress.
  const [posterSlot, setPosterSlot] = useState(0);
  const posterBase = import.meta.env.BASE_URL ?? '/';

  useEffect(() => {
    const host = hostRef.current;
    // The slideshow branch doesn't use the canvas host; for the other two branches
    // the host is required by createScene / the reduced-motion early-return cleanup.
    if (renderMode !== 'poster' && !host) return;

    const [from, to] = journey;
    // Clamp the authored window into the engine's valid getStage range so a typo in
    // frontmatter can never push the morph past the built lifecycle.
    const clampStage = (s: number): number => Math.min(BUILT_STAGES, Math.max(0, s));
    const stageFor = (p: number): number => clampStage(lerp(from, to, clamp01(p)));

    // Seed the published baseline at the journey START so the first frame (and any
    // dive resurface arriving into this article) opens on the article's opening beat,
    // not a flash of stage 0.
    progressRef.current = 0;

    // The article's PRESENTATION CLOCK — the same single-eased-clock seam the hero
    // uses (see presentationClock.ts). On the 'canvas' branch the engine samples
    // this clock AND the scene:progress broadcast below reads it, so the readout
    // chrome (ArticleHud / GraveyardHud) names the beat that is actually rendered,
    // never the one the scrollbar raced ahead to. The poster/reduced branches have
    // no smoothed canvas to sync to, so their clock is instant (reduced: true) —
    // byte-identical to the old raw broadcast.
    const clock = new PresentationClock(
      () => ({ progress: progressRef.current, stage: stageFor(progressRef.current) }),
      { reduced: renderMode !== 'canvas' },
    );

    const broadcast = (force = false): void => {
      const { progress: p, stage } = clock.current;
      if (!force && Math.abs(p - publishedRef.current) < PROGRESS_MIN_DELTA) return;
      publishedRef.current = p;
      window.dispatchEvent(
        new CustomEvent<SceneProgressDetail>(SCENE_PROGRESS_EVENT, {
          detail: { progress: p, stage },
        }),
      );
      // Low-tier slideshow: nudge React only when the active poster slot changes.
      // Lives next to broadcast() so the slideshow and ArticleHud see consistent
      // progress without a second subscription threading the same ref.
      if (renderMode === 'poster') {
        setPosterSlot((prev) => {
          const next = posterSlotFor(p);
          return next === prev ? prev : next;
        });
      }
    };
    const unsubClock = clock.subscribe(() => broadcast());

    // The governor token held while the canvas branch runs (null on the poster/
    // reduced branches and when the budget denies). Declared up here so the
    // scroll subscription below can `touch` it — an actively-scrolled backdrop
    // is FRESH under the governor's LRU tie-break, so an equal-priority
    // requester elsewhere would bump a stale holder before this one.
    let glToken: GovernorToken | null = null;

    // The scroll tracker is pure JS, so it is wired the instant this island hydrates;
    // only the heavy GPU engine waits for its own dynamic chunk. stageCount is
    // irrelevant here (we map progress ourselves), so pass 1.
    const tracker = new ScrollTracker(1);
    const unsub = tracker.subscribe((s) => {
      progressRef.current = s.progress;
      // New target: the clock eases toward it and re-broadcasts as it moves.
      clock.wake();
      if (glToken) glGovernor.touch(glToken);
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    // Start ON the live scroll position; the settle-snap window absorbs a late
    // browser scroll restoration without gliding the journey up from the top.
    clock.start();
    broadcast(true);

    // REDUCED MOTION: never import the WebGL engine. The CSS dim layer + the article's
    // own copy stand on their own; ArticleHud still tracks scroll (it listens to the
    // same event, which we keep dispatching). The poster cross-fade is owned by the
    // page layout's reduced-motion path, not this canvas host.
    if (renderMode === 'reduced') {
      return () => {
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }

    // LOW-TIER POSTER FALLBACK: same protection as HeroIsland's reduced-motion path,
    // applied for a different reason — a capable user on a weak GPU. Skipping the
    // GPU engine here is what holds the 60fps / graceful-30fps target on low-end
    // hardware (createScene's cheap post-chain + capped DPR alone aren't enough on
    // the very weakest tiers). The poster slot is updated inside broadcast() above,
    // so the same scroll subscription that drives ArticleHud also drives the
    // slideshow — no second scroll probe, just like the brief asks.
    if (renderMode === 'poster') {
      return () => {
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }

    let cancelled = false;
    let dispose: SceneHandle | null = null;

    // GL BUDGET: claim the page's ambient slot BEFORE the engine chunk is
    // requested. A denied grant (both slots held at equal/higher priority — not
    // reachable from a cold page load) leaves the CSS dim wash standing alone
    // while the scroll/broadcast chrome above keeps working, mirroring the
    // no-WebGL fallback below.
    glToken = glGovernor.acquire({
      priority: PRIORITY_AMBIENT,
      onEvict: () => {
        // Bumped by a higher-priority holder (the governor already released the
        // token): dispose the renderer; the dim CSS layer stands.
        cancelled = true;
        dispose?.();
        dispose = null;
        glToken = null;
      },
    });
    if (!glToken) {
      return () => {
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }
    // Off-screen gate: createScene loads via dynamic import, so the IntersectionObserver
    // can already have fired pause-while-out-of-view before `dispose` exists. We latch
    // the desired state here and apply it the moment the handle resolves, so the loop
    // starts already paused if the reader landed below the article (deep-link to a
    // fragment past the scroll range, restored scroll position, etc.).
    let offscreen = false;

    // The article-scroll getStage — the ONE mapping, sampled from the clock so the
    // engine renders the same eased value the broadcast publishes. Everything
    // downstream (camera arc, shader stage, scene id) is the engine's existing
    // pure function of this number, unchanged.
    const getStage = (): number => clock.current.stage;

    void import('../scene/createScene')
      .then(async ({ createScene }) => {
        if (cancelled) return;
        // Backdrop-shaped hook set: just getStage. We deliberately omit onMarkerFrame
        // (no in-article star markers) and the exploration/focus hooks (no HUD nav
        // rail driving previews) — the article HUD is a passive readout, not a
        // navigator. createScene tolerates the minimal hook set (backdrop mode already
        // passes only getStage).
        // In the 'canvas' branch renderMode has already filtered out reduced-motion
        // (→ 'reduced') and the low tier (→ 'poster'), so we pass the canvas-branch
        // invariants directly. The createScene signature still takes them so the same
        // entry point works for HeroIsland's backdrop / live branches.
        if (host) {
          // createScene is async now (sliced boot). A teardown racing the build
          // disposes the fresh handle the moment it resolves.
          const handle = await createScene(host, false, { getStage }, 'high');
          if (cancelled) {
            handle();
            return;
          }
          dispose = handle;
          // Apply the gate state the IO may have already latched before this resolved.
          if (offscreen) dispose.pauseRendering?.();
        }
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

    // Off-screen pause: the backdrop canvas itself is `position: fixed` (it stays at
    // inset:0 with the viewport), so an IntersectionObserver on `host` would always
    // report 100% intersection during scroll — useless as a gate. Instead we observe
    // the `<article>` content (the only element on the page that actually scrolls
    // past viewport): when no part of the article is in view, nothing the backdrop is
    // drawing is being read, so we pause the GPU loop; resume the instant any of it
    // returns. This is cheaper and off-main-thread vs a scroll listener, and complements
    // the existing tab-hide pause (visibilitychange inside createScene) — neither alone
    // catches the foreground-tab-scrolled-past case.
    const article: Element | null =
      typeof document === 'undefined' ? null : document.querySelector('article.prose');
    let observer: IntersectionObserver | null = null;
    if (article && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          if (entry.isIntersecting) {
            offscreen = false;
            dispose?.resumeRendering?.();
          } else {
            offscreen = true;
            dispose?.pauseRendering?.();
          }
        },
        // threshold 0 + a tiny rootMargin so the resume fires the instant any pixel of
        // the article re-enters viewport (rather than waiting on a noticeable strip).
        { threshold: 0, rootMargin: '0px' },
      );
      observer.observe(article);
    }

    return () => {
      cancelled = true;
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      observer?.disconnect();
      unsubClock();
      clock.stop();
      unsub();
      tracker.stop();
      dispose?.();
      dispose = null;
      // Return the ambient slot to the sitewide budget (idempotent — an evicted
      // token was already released by the governor).
      glGovernor.release(glToken);
      glToken = null;
    };
  }, [journey, renderMode]);

  // Same markup contract as HeroIsland's backdrop return: a single fixed host at the
  // .bh-backdrop z-layer, dimmed by the existing CSS. aria-hidden — atmosphere.
  //
  // The 'poster' branch swaps the WebGL canvas host for PosterSlideshow, mirroring
  // HeroIsland's reduced-motion swap; CSS .bh-poster-slideshow already pins it under
  // body.article-page's dim wash so the reading column stays the same readable layer.
  // The slideshow's PROGRESS prop here is the QUANTISED slot index re-projected back
  // to 0..1 (slot/3) — Math.round inside PosterSlideshow then snaps back to exactly
  // that slot. A direct progress pass would re-render on every scroll tick.
  //
  // CLS guard: BOTH the outer .bh-root--backdrop wrapper and the inner .bh-stage are
  // position:fixed; inset:0 (hero.css), so this entire React subtree sits OUT OF NORMAL
  // FLOW from the instant React paints it. When the WebGL canvas is appended into the
  // host on first frame (or when the dive-resurface keyframe animates main's transform),
  // there is no flow box behind the reading column that could expand/shrink — the
  // .prose width/position is fully owned by SSR CSS (prose.css), never by this canvas.
  return (
    <div className="bh-root bh-root--backdrop">
      {renderMode === 'poster' ? (
        <PosterSlideshow progress={posterSlot / 3} base={posterBase} />
      ) : (
        <div className="bh-stage bh-backdrop" ref={hostRef} aria-hidden="true" />
      )}
    </div>
  );
}
