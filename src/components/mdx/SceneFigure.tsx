// SceneFigure — an inline figure that pins ONE lifecycle beat of the hero engine
// inside the prose, so a paragraph about a celestial moment can SHOW it rather than
// only name it. It is the same createScene engine the hero and the article backdrop
// use, mounted in a contained box at a FIXED getStage (no scroll coupling) — the
// in-article echo of the full scene, at reading scale.
//
// Lazy + graceful exactly like the backdrops: the ~200KB engine chunk is dynamically
// imported only when the figure scrolls into view (IntersectionObserver), and a
// missing-WebGL / chunk-load failure leaves the figure's caption + a quiet placeholder
// rather than throwing. Reduced motion skips the live engine and shows the caption box.
import { useEffect, useRef, useState } from 'react';
import { BUILT_STAGES } from '../../hero/timeline';
import { detectDeviceTier } from '../../hero/lib/config';
import { isWebGLUnavailableError, type SceneHandle } from '../../hero/scene/types';
import { resolveReducedMotionNow } from '../../hero/components/reduced-motion';
import { acquire, release } from '../../hero/scene/contextRegistry';

interface SceneFigureProps {
  /** The lifecycle beat to pin, in getStage transition-space (0 = black hole …
   *  3.5 = nebula). Clamped into range. */
  stage: number;
  /** Caption rendered beneath the figure (also the reduced-motion / no-WebGL text). */
  caption?: string;
}

export default function SceneFigure({ stage, caption }: SceneFigureProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // 'idle' before in-view; 'live' once the engine mounts; 'static' when reduced
  // motion or no WebGL keeps it a quiet placeholder. Drives the caption copy + a11y.
  const [mode, setMode] = useState<'idle' | 'live' | 'static'>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pinned = Math.min(BUILT_STAGES, Math.max(0, stage));

    if (resolveReducedMotionNow()) {
      setMode('static');
      return;
    }
    if (typeof IntersectionObserver === 'undefined') return;

    let cancelled = false;
    let dispose: SceneHandle | null = null;
    // true while we hold an acquired context slot from the registry.
    let held = false;
    const tier = detectDeviceTier();

    // Tear down any live scene and release the registry slot.  Safe to call
    // even when no scene has been mounted (dispose/held will be null/false).
    const unmountScene = (): void => {
      if (dispose) { dispose(); dispose = null; }
      if (held) { release(); held = false; }
      if (!cancelled) setMode('idle');
    };

    // Mount the engine only when the figure is near the viewport.  On each
    // exit the scene is fully disposed (freeing the GL context slot) so the
    // gallery virtualises: only the currently visible row holds a live context.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;

        if (!entry.isIntersecting) {
          // Row left the intersection zone — release its GL context slot so
          // another row (or another page element) can acquire one.
          unmountScene();
          return;
        }

        // Row entering the intersection zone.  Guard re-entry: if we already
        // hold a slot (or the effect has been cancelled), do nothing.
        if (dispose || held || cancelled) return;

        // Ask the site-wide registry for a context slot.  If the cap (2) is
        // already full, degrade to a static placeholder rather than exceeding
        // the limit — one of the held slots will be released when its owner
        // scrolls away, but we do not retry automatically (the figure stays
        // static for this scroll visit; on the NEXT exit+enter cycle the slot
        // may be free and the scene will mount).
        if (!acquire()) {
          setMode('static');
          return;
        }
        held = true;

        void import('../../hero/scene/createScene')
          .then(async ({ createScene }) => {
            // Guard: the row may have left view or the effect may have been
            // cancelled while the chunk was in flight.
            if (!held || cancelled) return;
            // createScene is async (sliced boot). A teardown racing the build
            // disposes the fresh handle the moment it resolves.
            const handle = await createScene(host, false, { getStage: () => pinned }, tier);
            if (!held || cancelled) {
              handle();
              return;
            }
            dispose = handle;
            setMode('live');
          })
          .catch((error: unknown) => {
            void isWebGLUnavailableError(error);
            // Release the slot we acquired but could not use.
            if (held) { release(); held = false; }
            setMode('static');
          });
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      unmountScene();
    };
  }, [stage]);

  return (
    <figure className="scene-figure" data-mode={mode}>
      <div className="scene-figure-stage" ref={hostRef} aria-hidden="true" />
      {caption && <figcaption className="scene-figure-caption">{caption}</figcaption>}
    </figure>
  );
}
