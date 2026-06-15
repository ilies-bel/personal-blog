// IslandsDemo — a live, in-prose demonstration of the very thing the essay argues.
//
// The "Why I Build With Astro Islands" post claims that an island hydrates on its OWN
// schedule and the prose around it stays inert HTML. Rather than only describe that,
// this component PROVES it in place: it is itself an island, and it lights up the
// instant it hydrates, stamping the elapsed time from first paint. Drop two of them in
// a post with different client: directives (client:load vs client:visible) and the
// reader watches one wake immediately while the other waits until scrolled into view —
// the thesis, demonstrated, not asserted.
//
// It carries no scene/three dependency; it is a tiny, self-contained island so it stays
// honest about the "ship almost no JS" point it illustrates.
import { useEffect, useRef, useState } from 'react';

interface IslandsDemoProps {
  /** A short label so two demos in one post are distinguishable (e.g. the client:
   *  directive each was mounted with). Shown in the readout. */
  label?: string;
}

export default function IslandsDemo({ label = 'island' }: IslandsDemoProps) {
  // `hydrated` flips true in the mount effect, which only runs on the client AFTER
  // this island hydrates — so the visual change IS the hydration event, made visible.
  const [hydrated, setHydrated] = useState(false);
  const [clicks, setClicks] = useState(0);
  // Elapsed ms from page navigation start to hydration — the "how long did this island
  // wait?" number. performance.now() is monotonic from page load.
  const elapsedRef = useRef<number | null>(null);

  useEffect(() => {
    elapsedRef.current = Math.round(performance.now());
    setHydrated(true);
  }, []);

  return (
    <div className="islands-demo" data-hydrated={hydrated}>
      <div className="islands-demo-head">
        <span className="islands-demo-dot" aria-hidden="true" />
        <span className="islands-demo-label">{label}</span>
        <span className="islands-demo-state">
          {hydrated ? `hydrated · +${elapsedRef.current ?? 0}ms` : 'inert html'}
        </span>
      </div>
      <button
        type="button"
        className="islands-demo-button"
        onClick={() => setClicks((c) => c + 1)}
        disabled={!hydrated}
      >
        {hydrated
          ? clicks === 0
            ? 'I am interactive — click me'
            : `clicked ${clicks}×`
          : 'not yet interactive'}
      </button>
      <p className="islands-demo-note">
        {hydrated
          ? 'This island carries its own runtime. The prose around it shipped zero JS.'
          : 'Server-rendered HTML. The button does nothing until this island hydrates.'}
      </p>
    </div>
  );
}
