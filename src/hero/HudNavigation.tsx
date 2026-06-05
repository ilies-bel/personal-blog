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

interface HudNavigationProps {
  visible: boolean;
  activeId: HudTargetId | null;
  selectedId: HudTargetId | null;
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
  base,
  onPreview,
  onPreviewEnd,
  onActivate,
  onClearSelection,
}: HudNavigationProps) {
  const activeItem = activeId ? HUD_NAV_BY_ID[activeId] : null;
  const selectedItem = selectedId ? HUD_NAV_BY_ID[selectedId] : null;

  return (
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

            return (
              <li className="hud-nav-row" key={item.id}>
                <button
                  className="hud-nav-button"
                  data-active={isActive || isSelected}
                  data-selected={isSelected}
                  data-motion={item.motion}
                  type="button"
                  aria-label={`${item.label}. ${item.destination}. ${item.object}.`}
                  tabIndex={visible ? 0 : -1}
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

      {activeItem && (
        <p className="hud-nav-mobile-readout" aria-hidden="true">
          <span>{activeItem.label}</span>
          <span>{activeItem.destination}</span>
        </p>
      )}

      {selectedItem?.href && (
        <a className="hud-nav-panel-link hud-nav-inline-link" href={resolveHref(base, selectedItem.href)}>
          {selectedItem.destination}
        </a>
      )}
    </div>
  );
}
