// SceneFigure — an inline figure that pins ONE lifecycle beat of the hero engine
// inside the prose, so a paragraph about a celestial moment can SHOW it rather than
// only name it.
//
// P4 CONTEXT GOVERNANCE: the figure no longer auto-mounts a live WebGL scene on
// scroll (ten figures on /behind-the-build used to mean up to eleven live GL
// contexts). By default it renders a BUILD-TIME CAPTURE of the exact same engine
// frame (scripts/capture-figures.mjs screenshots each unique pinned stage and
// commits it to src/assets/figures/) plus a labelled "Run live" button. Clicking
// the button asks the GL governor for one of the page's two context slots
// (PRIORITY_FIGURE = 1); on a grant the engine chunk is dynamically imported and
// the live scene mounts exactly as before. The live session ends — token released,
// renderer disposed, capture restored — when the figure scrolls away
// (IntersectionObserver exit), when a higher-priority holder evicts it, when the
// visitor clicks the button again, or on unmount. A denied grant (the budget is
// held by the ambient backdrop + another live figure) quietly keeps the capture
// and says so. Reduced motion never offers live mode: the capture IS the
// reduced-motion presentation. No WebGL / chunk-load failure ends on the capture
// too, with the button withdrawn.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageMetadata } from 'astro';
import { BUILT_STAGES } from '../../hero/timeline';
import { detectDeviceTier } from '../../hero/lib/config';
import { glGovernor, PRIORITY_FIGURE, type GovernorToken } from '../../hero/lib/glGovernor';
import { isWebGLUnavailableError, type SceneHandle } from '../../hero/scene/types';
import { useMotion } from '../../lib/motion';

interface SceneFigureProps {
  /** The lifecycle beat to pin, in getStage transition-space (0 = black hole …
   *  3.5 = nebula). Clamped into range. Also selects the build-time capture
   *  (figure-stage-<stage>.webp) — several figures may share one stage/capture. */
  stage: number;
  /** Caption rendered beneath the figure (also names the Run-live button). */
  caption?: string;
}

// Build-time captures of the engine at each unique pinned stage, produced by
// scripts/capture-figures.mjs (see the staleness gate in
// scripts/check-figure-staleness.mjs). Eager glob: the metadata is a few bytes
// per image and resolving synchronously keeps SSR and hydration identical. A
// missing capture (stage added but script not re-run yet) degrades to the CSS
// starfield placeholder — the figure never breaks.
const CAPTURES = import.meta.glob<{ default: ImageMetadata }>(
  '../../assets/figures/*.webp',
  { eager: true },
);
function captureForStage(stage: number): ImageMetadata | null {
  const entry = CAPTURES[`../../assets/figures/figure-stage-${stage}.webp`];
  return entry?.default ?? null;
}

// 'capture'  — the still capture + the Run-live offer (the resting default).
// 'live'     — a governor token is held and the engine is mounting/mounted.
// 'static'   — live mode is permanently withdrawn (no WebGL / chunk failure);
//              the capture (or placeholder) stands alone.
type FigureMode = 'capture' | 'live' | 'static';

// The quiet one-line status under the caption. 'busy' = the governor denied the
// grant (both context slots are held by higher/equal-priority scenes).
type FigureNote = 'busy' | 'unavailable' | null;

export default function SceneFigure({ stage, caption }: SceneFigureProps) {
  const figureRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FigureMode>('capture');
  const [note, setNote] = useState<FigureNote>(null);

  // Resolved motion preference (hydration-safe — see src/lib/motion.ts). Under
  // reduced motion the capture is the whole presentation: no button, no engine.
  const reduced = useMotion() === 'reduced';

  const capture = captureForStage(stage);

  // The live session's imperative state. tokenRef holds the governor grant,
  // disposeRef the mounted engine handle; sessionRef increments to cancel any
  // in-flight async boot (dynamic import + sliced createScene) the moment the
  // session ends, so a late-resolving handle is disposed immediately.
  const tokenRef = useRef<GovernorToken | null>(null);
  const disposeRef = useRef<SceneHandle | null>(null);
  const sessionRef = useRef(0);

  // Tear the live session down: cancel in-flight boots, dispose the renderer,
  // release the token. The ONE dispose/release path — eviction, scroll-away,
  // manual stop, failure and unmount all come through here.
  const teardown = useCallback((): void => {
    sessionRef.current += 1;
    const dispose = disposeRef.current;
    disposeRef.current = null;
    dispose?.();
    glGovernor.release(tokenRef.current);
    tokenRef.current = null;
  }, []);

  const stopLive = useCallback(
    (next: FigureMode = 'capture'): void => {
      teardown();
      setMode(next);
    },
    [teardown],
  );

  const runLive = useCallback((): void => {
    if (tokenRef.current) return; // already live/booting
    const token = glGovernor.acquire({
      priority: PRIORITY_FIGURE,
      // Evicted by a higher-priority holder: the token is already released by
      // the governor; teardown()'s release is the documented no-op. Dispose the
      // renderer and fall back to the capture.
      onEvict: () => stopLive('capture'),
    });
    if (!token) {
      // Budget spent (ambient backdrop + another live figure). Keep the capture
      // and say so — the other figure releases its slot on scroll-away.
      setNote('busy');
      return;
    }
    tokenRef.current = token;
    setNote(null);
    setMode('live'); // the engine mounts via the effect below, once the host exists
  }, [stopLive]);

  // Mount the engine while mode === 'live'. Split from runLive so the canvas
  // host <div> is committed to the DOM before createScene appends into it.
  useEffect(() => {
    if (mode !== 'live') return;
    const host = hostRef.current;
    if (!host) return;

    const session = ++sessionRef.current;
    const pinned = Math.min(BUILT_STAGES, Math.max(0, stage));
    const tier = detectDeviceTier();

    void import('../../hero/scene/createScene')
      .then(async ({ createScene }) => {
        if (session !== sessionRef.current) return;
        // createScene is async (sliced boot). A teardown racing the build
        // disposes the fresh handle the moment it resolves.
        const handle = await createScene(host, false, { getStage: () => pinned }, tier);
        if (session !== sessionRef.current) {
          handle();
          return;
        }
        disposeRef.current = handle;
        // Freshly rendering — mark the token so LRU eviction prefers stale holders.
        glGovernor.touch(tokenRef.current);
      })
      .catch((error: unknown) => {
        void isWebGLUnavailableError(error);
        if (session !== sessionRef.current) return;
        // WebGL / chunk load failed: withdraw the live offer for good on this
        // figure and stand on the capture (or the CSS placeholder).
        stopLive('static');
        setNote('unavailable');
      });

    // Scroll-away ends the session: a live figure three screens away must not
    // hold a context slot (this is the leak the old dispose-only-on-unmount
    // version had). Observed on the whole figure with the same 200px margin the
    // old mount gate used.
    let observer: IntersectionObserver | null = null;
    const el = figureRef.current;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) return;
          stopLive('capture');
        },
        { rootMargin: '200px 0px' },
      );
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      // Mode flip away from 'live' already ran teardown via stopLive; this
      // covers the unmount-while-live path (teardown is idempotent).
      teardown();
    };
  }, [mode, stage, stopLive, teardown]);

  // A motion-preference flip to reduced mid-session ends any live run — the
  // capture is the reduced-motion presentation. (No-op when nothing is live.)
  useEffect(() => {
    if (reduced && tokenRef.current) stopLive('capture');
  }, [reduced, stopLive]);

  const live = mode === 'live';
  const offerLive = !reduced && mode !== 'static';
  const buttonLabel = live ? 'Show still' : 'Run live';

  return (
    <figure className="scene-figure" data-mode={mode} data-stage={stage} ref={figureRef}>
      <div className="scene-figure-stage" aria-hidden="true">
        {/* The capture stays mounted UNDER the live canvas so stopping never
            flashes an empty frame; the live host simply covers it. */}
        {capture && (
          <img
            className="scene-figure-capture"
            src={capture.src}
            width={capture.width}
            height={capture.height}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
        {live && <div className="scene-figure-live" ref={hostRef} />}
      </div>
      {offerLive && (
        <button
          type="button"
          className="scene-figure-run"
          onClick={live ? () => stopLive('capture') : runLive}
          aria-pressed={live}
          aria-label={caption ? `${buttonLabel} — ${caption}` : buttonLabel}
        >
          {buttonLabel}
        </button>
      )}
      {(caption || note) && (
        <figcaption className="scene-figure-caption">
          {caption}
          {note && (
            <span className="scene-figure-note" role="status">
              {note === 'busy'
                ? ' — live view busy: the GPU budget is held by another panel.'
                : ' — live view unavailable on this device.'}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
