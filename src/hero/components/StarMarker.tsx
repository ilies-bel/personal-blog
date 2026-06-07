// StarMarker — anchors a single clickable HTML link over the on-screen star object.
// One marker per settled lifecycle state. Position is updated every rAF from a ref
// written by the scene's onMarkerFrame callback, avoiding per-frame React re-renders.
// The component only re-renders when the visible/stage snapshot changes meaningfully.
import { useEffect, useRef, useState } from 'react';
import { HUD_NAV_ITEMS, type HudNavItem } from '../HudNavigation';
import type { MarkerFrame } from '../scene/types';
import { useSceneState } from './SceneStateContext';

interface StarMarkerProps {
  /** Ref written by the scene frame loop. StarMarker reads it on rAF. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

// Settled-window stage thresholds (same as createScene.ts — kept here as the
// single source of truth for the component's "which item is active" logic).
// Returns the HudNavItem whose stage window contains `stage`, or null if mid-transition.
function settledItemForStage(stage: number): HudNavItem | null {
  // dot: stage 4.45 - 4.72
  if (stage >= 4.45 && stage <= 4.72) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'beginning') ?? null;
  }
  // nebula: stage 3.38 - 3.56
  if (stage >= 3.38 && stage <= 3.56) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'nebula') ?? null;
  }
  // yellow star: stage 2.85 - 3.04
  if (stage >= 2.85 && stage <= 3.04) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'yellow') ?? null;
  }
  // red giant: stage 2.00 - 2.38
  if (stage >= 2.0 && stage <= 2.38) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'red') ?? null;
  }
  // black hole: stage 0.00 - 0.13
  if (stage >= 0.0 && stage <= 0.13) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'end') ?? null;
  }
  return null;
}

function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

export default function StarMarker({ markerFrameRef }: StarMarkerProps) {
  const { reduced, base } = useSceneState();

  // The DOM element that receives inline left/top updates every rAF. Mutated
  // directly (no React state) to avoid per-frame re-renders.
  const elRef = useRef<HTMLAnchorElement>(null);

  // Snapshot of the currently active nav item (React state, updated only when
  // the settled state changes — typically 0-5 times per page view).
  const [activeItem, setActiveItem] = useState<HudNavItem | null>(null);
  // Whether the marker is currently in the visible window (gates opacity CSS class).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let lastVisible = false;
    let lastItemId: string | null = null;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const frame = markerFrameRef.current;
      if (!frame) return;

      // Update position directly on the DOM element (no setState, no re-render).
      const el = elRef.current;
      if (el) {
        el.style.left = `${frame.x.toFixed(1)}px`;
        el.style.top = `${frame.y.toFixed(1)}px`;
      }

      // Determine the settled item from stage.
      const item = frame.visible ? settledItemForStage(frame.stage) : null;
      const nextVisible = frame.visible && item !== null;
      const nextItemId = item?.id ?? null;

      // Only trigger React re-renders when the visible state or active item changes.
      if (nextVisible !== lastVisible) {
        lastVisible = nextVisible;
        setVisible(nextVisible);
      }
      if (nextItemId !== lastItemId) {
        lastItemId = nextItemId;
        setActiveItem(item);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [markerFrameRef]);

  if (!activeItem) return null;

  return (
    <a
      ref={elRef}
      className="star-marker"
      href={resolveHref(base, activeItem.href)}
      aria-label={`${activeItem.label}. Go to ${activeItem.destination}.`}
      data-visible={visible}
      data-reduced={reduced}
    >
      <span className="star-marker-dot" aria-hidden="true" />
      <span className="star-marker-ring" aria-hidden="true" />
    </a>
  );
}
