export type HudTargetId = 'end' | 'collapse' | 'expansion' | 'rebirth' | 'beginning';

export interface HudNavItem {
  id: HudTargetId;
  glyph: string;
  motion: 'pulse' | 'breathe' | 'drift' | 'flicker' | 'still';
  label: string;
  destination: string;
  object: string;
  stage: number;
  body: string;
  href?: string;
}

export const HUD_NAV_ITEMS: readonly HudNavItem[] = [
  {
    id: 'end',
    glyph: '◉',
    motion: 'pulse',
    label: 'BLACK HOLE',
    destination: 'Inspirations',
    object: 'black hole',
    stage: 0,
    body: 'References, atmospheres, and systems that survive the collapse.',
  },
  {
    id: 'collapse',
    glyph: '◌',
    motion: 'breathe',
    label: 'DYING STAR',
    destination: 'Projects',
    object: 'dying star',
    stage: 1.35,
    body: 'Selected builds under pressure: constraints, tradeoffs, and what held.',
  },
  {
    id: 'expansion',
    glyph: '✧',
    motion: 'drift',
    label: 'RED GIANT',
    destination: 'Writing',
    object: 'red giant',
    stage: 2.2,
    body: 'Notes on code, interfaces, tooling, and the systems around them.',
    href: 'writing',
  },
  {
    id: 'rebirth',
    glyph: '✦',
    motion: 'flicker',
    label: 'NEBULA',
    destination: 'Experiments',
    object: 'nebula',
    stage: 4,
    body: 'Small prototypes and simulations where the next thing starts forming.',
  },
  {
    id: 'beginning',
    glyph: '•',
    motion: 'still',
    label: 'BEGINNING',
    destination: 'About me',
    object: 'origin point',
    stage: 5,
    body: 'The quiet frame behind the work: engineer, writer, builder on the web.',
    href: 'about',
  },
];

export const HUD_NAV_BY_ID = HUD_NAV_ITEMS.reduce<Record<HudTargetId, HudNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<HudTargetId, HudNavItem>);

const WORK_REVEAL = {
  index: '01 / 03',
  label: 'Selected work',
  title: 'Selected builds under pressure',
  meta: 'Projects / interfaces / resilient systems',
  body: HUD_NAV_BY_ID.collapse.body,
};

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
  /** The highlighted target: preview > committed selection > scroll position.
   *  Resolved upstream so the readout + loud "active" treatment track it. */
  activeId: HudTargetId | null;
  /** The committed (clicked) target — rendered louder than a scroll highlight. */
  selectedId: HudTargetId | null;
  /** The target the current scroll position maps to (scroll-spy "you are here").
   *  Drives a quiet ambient marker, distinct from the deliberate active/selected
   *  treatments, so the rail reflects scroll even when idle. */
  currentId: HudTargetId | null;
  base: string;
  onPreview: (id: HudTargetId) => void;
  onPreviewEnd: () => void;
  onActivate: (id: HudTargetId) => void;
  onClearSelection: () => void;
}

function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

export default function HudNavigation({
  visible,
  activeId,
  selectedId,
  currentId,
  base,
  onPreview,
  onPreviewEnd,
  onActivate,
  onClearSelection,
}: HudNavigationProps) {
  const activeItem = activeId ? HUD_NAV_BY_ID[activeId] : null;
  const selectedItem = selectedId ? HUD_NAV_BY_ID[selectedId] : null;
  // The mobile readout names the stage in focus: a deliberate preview/selection
  // if there is one, otherwise the scroll-spy current stage so it tracks scroll.
  const readoutItem = activeItem ?? (currentId ? HUD_NAV_BY_ID[currentId] : null);

  return (
    <>
      <div className="hud-system" data-visible={visible} onMouseLeave={onPreviewEnd}>
        <nav
          className="hud-nav"
          aria-label="Explore portfolio stages"
          aria-hidden={!visible}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onPreviewEnd();
              onClearSelection();
            }
          }}
        >
          <ol className="hud-nav-list">
            {HUD_NAV_ITEMS.map((item) => {
              const isActive = activeId === item.id;
              const isSelected = selectedId === item.id;
              // Scroll-spy "you are here": where the scroll position sits in the
              // lifecycle. This is the visitor's real location in the set, so it owns
              // aria-current. The quiet visual marker is suppressed when the same row
              // is already lit louder by a hover/focus preview or selection, so the
              // two treatments never double up.
              const isCurrent = currentId === item.id;
              const showCurrentMarker = isCurrent && !isActive && !isSelected;

              return (
                <li className="hud-nav-row" key={item.id}>
                  <button
                    className="hud-nav-button"
                    data-active={isActive || isSelected}
                    data-selected={isSelected}
                    data-current={showCurrentMarker}
                    data-motion={item.motion}
                    type="button"
                    aria-label={`${item.label}. ${item.destination}. ${item.object}.`}
                    tabIndex={visible ? 0 : -1}
                    aria-current={isCurrent ? 'location' : undefined}
                    aria-expanded={isActive || isSelected}
                    aria-pressed={isSelected}
                    onFocus={() => onPreview(item.id)}
                    onBlur={onPreviewEnd}
                    onMouseEnter={() => onPreview(item.id)}
                    onClick={() => onActivate(item.id)}
                  >
                    <span className="hud-nav-glyph" aria-hidden="true">{item.glyph}</span>
                    <span className="hud-nav-copy">
                      <span className="hud-nav-title">{item.label}</span>
                      <span className="hud-nav-destination">{item.destination}</span>
                    </span>
                    <span className="hud-nav-connector" aria-hidden="true">
                      <span className="hud-nav-object">{item.object}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {readoutItem && (
          <p className="hud-nav-mobile-readout" aria-hidden="true">
            <span>{readoutItem.label}</span>
            <span>{readoutItem.destination}</span>
          </p>
        )}

        {selectedItem?.href && (
          <a className="hud-nav-panel-link hud-nav-inline-link" href={resolveHref(base, selectedItem.href)}>
            {selectedItem.destination}
          </a>
        )}
      </div>

      <aside className="hud-work-reveal" data-visible={visible} aria-hidden={!visible}>
        <p className="hud-work-kicker">
          <span>{WORK_REVEAL.label}</span>
          <span>{WORK_REVEAL.index}</span>
        </p>
        <h2>{WORK_REVEAL.title}</h2>
        <p className="hud-work-meta">{WORK_REVEAL.meta}</p>
        <p className="hud-work-body">{WORK_REVEAL.body}</p>
        <div className="hud-work-index" aria-hidden="true">
          <span data-active="true" />
          <span />
          <span />
        </div>
      </aside>
    </>
  );
}
