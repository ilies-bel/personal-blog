// PageHud wiring — drives the static list-page cockpit (PageHud.astro):
//   • the rail fill tracks window scroll (the same --scene-progress custom
//     property the live ArticleHud sets from scene events);
//   • the section readout scroll-spies the page's entries (elements matching
//     the hud's data-spy selector, named by their data-hud-title).
// One listener set bound per session; astro:page-load re-inits against each
// swapped-in body. Pages without a .page-hud no-op for free.

interface PageHudGlobal {
  io: IntersectionObserver | null;
  bound: boolean;
}
declare global {
  interface Window {
    __bhPageHud?: PageHudGlobal;
  }
}
const state: PageHudGlobal = (window.__bhPageHud = window.__bhPageHud ?? {
  io: null,
  bound: false,
});

let progressRaf = 0;

function updateProgress(): void {
  const rail = document.querySelector<HTMLElement>('.page-hud .article-hud-rail');
  if (!rail) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  rail.style.setProperty('--scene-progress', progress.toFixed(4));
}

/** Rebuild the entry scroll-spy for the current page (idempotent). The most
 *  visible target wins; its data-hud-title becomes the section readout. */
function initSpy(): void {
  state.io?.disconnect();
  state.io = null;
  const hud = document.querySelector<HTMLElement>('.page-hud');
  const sectionEl = hud?.querySelector<HTMLElement>('.page-hud-section');
  const selector = hud?.dataset.spy;
  if (!hud || !sectionEl || !selector || !('IntersectionObserver' in window)) return;
  const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (targets.length === 0) return;

  const visibility = new Map<Element, number>();
  state.io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visibility.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      }
      let best: HTMLElement | null = null;
      let bestRatio = 0;
      for (const target of targets) {
        const ratio = visibility.get(target) ?? 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = target;
        }
      }
      const title = best?.dataset.hudTitle ?? '';
      if (sectionEl.textContent !== title) {
        sectionEl.textContent = title;
      }
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  );
  targets.forEach((target) => state.io?.observe(target));
}

function init(): void {
  updateProgress();
  initSpy();
}

if (!state.bound) {
  state.bound = true;
  window.addEventListener(
    'scroll',
    () => {
      window.cancelAnimationFrame(progressRaf);
      progressRaf = window.requestAnimationFrame(updateProgress);
    },
    { passive: true },
  );
  document.addEventListener('astro:page-load', init);
}
init();

export {};
