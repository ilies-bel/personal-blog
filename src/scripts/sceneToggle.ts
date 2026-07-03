// SCENE TOGGLE — the circular corner control (SiteNav's `.scene-toggle`) that
// parks the page's scene backdrop: body.backdrop-off hides every .bh-backdrop /
// poster / tesseract layer (hero.css). The choice PERSISTS in localStorage and
// is re-applied on every ClientRouter swap, so a visitor who turns the scenery
// off reads the whole site on the plain room until they turn it back on.
//
// Same delegation idiom as decodeHover.ts: one document-level click listener,
// bound once per session, covers the button on every page — no per-swap rebind.
// The home page renders no .scene-toggle (its scene IS the content and has its
// own power/motion controls), and its live stage is .bh-stage without
// .bh-backdrop, so the body class never touches it.

const STORAGE_KEY = 'bh:backdrop-off';
const BODY_CLASS = 'backdrop-off';

function readOff(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // private mode — scene stays on, toggle is session-only
  }
}

function writeOff(off: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, off ? '1' : '0');
  } catch {
    /* storage disabled — the body class still applies for this page */
  }
}

/** Mirror the persisted state onto the (possibly freshly swapped) body and
 *  every toggle button's aria-pressed. Idempotent. */
function apply(): void {
  const off = readOff();
  document.body.classList.toggle(BODY_CLASS, off);
  document.querySelectorAll<HTMLButtonElement>('.scene-toggle').forEach((btn) => {
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
  });
}

declare global {
  interface Window {
    __bhSceneToggleBound?: boolean;
  }
}
if (!window.__bhSceneToggleBound) {
  window.__bhSceneToggleBound = true;
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.scene-toggle')) return;
    writeOff(!readOff());
    apply();
  });
  // ClientRouter replaces <body> on navigation — re-mirror the state onto the
  // fresh body + buttons. Fires on the initial load too.
  document.addEventListener('astro:page-load', apply);
}
apply();

export {};
