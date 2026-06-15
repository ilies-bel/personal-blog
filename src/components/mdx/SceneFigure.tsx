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
    const tier = detectDeviceTier();

    // Mount the engine only when the figure is actually near the viewport — an inline
    // canvas should never spin up GPU work while it's three screens away.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || dispose || cancelled) return;
        observer.disconnect();
        void import('../../hero/scene/createScene')
          .then(({ createScene }) => {
            if (cancelled) return;
            dispose = createScene(host, false, { getStage: () => pinned }, tier);
            setMode('live');
          })
          .catch((error: unknown) => {
            void isWebGLUnavailableError(error);
            setMode('static');
          });
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      dispose?.();
    };
  }, [stage]);

  return (
    <figure className="scene-figure" data-mode={mode}>
      <div className="scene-figure-stage" ref={hostRef} aria-hidden="true" />
      {caption && <figcaption className="scene-figure-caption">{caption}</figcaption>}
    </figure>
  );
}
