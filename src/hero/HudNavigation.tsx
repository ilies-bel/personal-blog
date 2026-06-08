import type { CSSProperties } from 'react';
import {
  HUD_NAV_ITEMS,
  MARKER_PLACEMENTS,
  settledIdForStage,
  type HudNavItem,
  type HudTargetId,
  type MarkerPlacement,
} from './sceneTable';
import { progressForLegacyStage } from './timeline';

// The HUD nav rows, on-screen markers, the settled-window gate and their shared
// types now live in sceneTable.ts (the pure data layer). They are re-exported
// here so the existing import paths ('../HudNavigation') resolve UNCHANGED. The
// duplicated literals + the byte-identical settled-window body that used to sit
// here are gone (the table is the single source).
export { HUD_NAV_ITEMS, MARKER_PLACEMENTS, settledIdForStage };
export type { HudNavItem, HudTargetId, MarkerPlacement };

export const HUD_NAV_BY_ID = HUD_NAV_ITEMS.reduce<Record<HudTargetId, HudNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<HudTargetId, HudNavItem>);

// Items in ascending `stage` order — the source list happens to already be sorted,
// but the scroll-spy mapping below depends on it, so make that contract explicit
// rather than relying on authoring order.
const HUD_NAV_BY_STAGE: readonly HudNavItem[] = [...HUD_NAV_ITEMS].sort((a, b) => a.stage - b.stage);

/**
 * Scroll-spy: map a lifecycle stage (0..5, the same transition-space `getStage`
 * produces) to the HUD target the visitor is currently "on" — the last stage
 * they have scrolled past. Returns the first item while still above it, so the
 * top of the rail (BLACK HOLE / stage 0) lights up at the very top of the page.
 */
export function hudIdForStage(stage: number): HudTargetId {
  let current = HUD_NAV_BY_STAGE[0];
  for (const item of HUD_NAV_BY_STAGE) {
    if (stage >= item.stage) current = item;
    else break;
  }
  return current.id;
}

interface HudNavigationProps {
  visible: boolean;
  /** prefers-reduced-motion: travel jumps instead of smooth-scrolling. */
  reduced: boolean;
  /** The target the current scroll position maps to (scroll-spy "you are here").
   *  Drives a quiet ambient marker so the rail reflects scroll position. */
  currentId: HudTargetId | null;
  base: string;
}

// Resolve a `public/` glyph asset against the deploy base (same base prop the
// links use), so the mask URL is correct whether base is `/` or `/personal-blog/`.
function resolveAsset(base: string, src: string): string {
  return `${base}/${src}`.replace(/\/+/g, '/');
}

/**
 * Travel to a lifecycle stage: map the stage to its scroll progress and scroll the
 * page there. Honours reduced-motion (jumps instead of smooth-scrolling). Used by
 * the HUD rail so clicking a glyph flies the visitor to that star rather than
 * navigating away to a page.
 */
function scrollToStage(stage: number, reduced: boolean): void {
  const progress = progressForLegacyStage(stage);
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: progress * max, behavior: reduced ? 'auto' : 'smooth' });
}

export default function HudNavigation({
  visible,
  reduced,
  currentId,
  base,
}: HudNavigationProps) {
  // The mobile readout names the stage the scroll position is currently on.
  const readoutItem = currentId ? HUD_NAV_BY_ID[currentId] : null;

  return (
    <div className="hud-system" data-visible={visible}>
      <nav
        className="hud-nav"
        aria-label="Explore portfolio stages"
        aria-hidden={!visible}
      >
        <ol className="hud-nav-list">
          {HUD_NAV_ITEMS.map((item) => {
            const isCurrent = currentId === item.id;

            return (
              <li className="hud-nav-row" key={item.id}>
                {/* A HUD glyph TRAVELS to its lifecycle stage rather than navigating
                    away — clicking it smooth-scrolls the page to that star. So it is a
                    real <button>, not a link (keyboard-accessible, no page load). The
                    on-screen StarMarker still owns the page navigation via item.href. */}
                <button
                  type="button"
                  className="hud-nav-button"
                  data-motion={item.motion}
                  data-current={isCurrent}
                  aria-label={`Travel to ${item.label}`}
                  tabIndex={visible ? 0 : -1}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={() => scrollToStage(item.stage, reduced)}
                >
                  <span
                    className="hud-nav-glyph"
                    aria-hidden="true"
                    style={{ '--glyph-mask': `url(${resolveAsset(base, item.glyphSrc)})` } as CSSProperties}
                  />
                  <span className="hud-nav-copy">
                    <span className="hud-nav-title">{item.label}</span>
                    <span className="hud-nav-destination">{item.destination}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* aria-hidden by design: this readout only re-states the label +
          destination of the currently-focused/active nav button, which the
          screen reader already announces from the button's own aria-label.
          Exposing it too would double-announce the same stage, so it stays
          visual-only (a glanceable readout for the compact mobile layout). */}
      {readoutItem && (
        <p className="hud-nav-mobile-readout" aria-hidden="true">
          <span>{readoutItem.label}</span>
          <span>{readoutItem.destination}</span>
        </p>
      )}
    </div>
  );
}
