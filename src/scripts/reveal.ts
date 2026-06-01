// ===========================================================================
// reveal.ts — scroll-reveal enhancer. Progressive enhancement ONLY.
//
// Every [data-reveal] section renders fully visible by default (see global.css:
// the resting state is the finished state). This script gates the *entrance*
// behind a [data-revealed] attribute it adds the first time the section enters
// the viewport, then stops observing it. If JS never runs (crawler, no-JS,
// headless), nothing is hidden — the page just doesn't animate in.
//
// Under prefers-reduced-motion we reveal everything immediately, so there's no
// transition to pause on a hidden tab and no chance of a section never firing.
// ===========================================================================

function revealAll(els: Iterable<Element>): void {
  for (const el of els) el.setAttribute('data-revealed', '');
}

function init(): void {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (targets.length === 0) return;

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // No IntersectionObserver (or reduced motion): show the finished state at once.
  if (reduced || typeof IntersectionObserver === 'undefined') {
    revealAll(targets);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-revealed', '');
        observer.unobserve(entry.target); // once per section, then done
      }
    },
    { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
  );

  for (const t of targets) {
    // Anything already on screen at load (e.g. above the fold) reveals now, so
    // it doesn't sit waiting for a scroll that may never come.
    const rect = t.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      t.setAttribute('data-revealed', '');
    } else {
      observer.observe(t);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
