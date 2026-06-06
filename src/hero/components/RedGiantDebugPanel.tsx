// RedGiantDebugPanel — a DEV-ONLY slider panel to live-tune the red giant's size
// and its parked camera framing. It writes the window.__bh* debug hooks (see
// lib/constants.ts → DEBUG_WINDOW_KEYS) that the scene's per-frame loop reads.
//
//   __bhGiantR      → red-giant size (drives the red-giant-only uGiantScale)
//   __bhGiantCenter → [x, y, z] the CAMERA PARK vantage (RED_GIANT_PARK). The orb
//                     itself stays centred at the world origin; these sliders move
//                     the CAMERA to frame the grown giant off-centre (the vast limb).
//   __bhMorph       → force the lifecycle stage (used by "pin" so the parked giant
//                     is on screen while you tune — pin to ~1.9, inside the park hold)
//
// It renders nothing in a production build (guarded by import.meta.env.DEV), so it
// never ships. Mount it once alongside the hero (see index.astro).
import { useEffect, useState } from 'react';
import { DEBUG_WINDOW_KEYS } from '../lib/constants';

// Defaults mirror the SHIPPED red-giant look: size is uGiantScale 8.5/4.2 (the
// slider reads in effective-uGiantR world units, so 8.5); the "pos" sliders now
// drive the CAMERA PARK vantage (RED_GIANT_PARK in createScene), not the orb — the
// star stays centred at origin and the camera moves to show its scale. Baked park
// vantage is [4.6, -3.15, 7]. Keep in sync if those defaults change.
const DEFAULT_RADIUS = 8.5;
const DEFAULT_CENTER: [number, number, number] = [4.6, -3.15, 7];
// Stage that pins the grown, PARKED red giant (inside the camera-park hold ~1.9) so
// the off-centre framing the sliders tune is the one on screen.
const RED_GIANT_STAGE = 1.9;

interface Axis {
  key: 'x' | 'y' | 'z';
  label: string;
  index: 0 | 1 | 2;
}
const AXES: Axis[] = [
  { key: 'x', label: 'cam X', index: 0 },
  { key: 'y', label: 'cam Y', index: 1 },
  { key: 'z', label: 'cam Z', index: 2 },
];

function setWindowValue(key: string, value: unknown): void {
  (window as unknown as Record<string, unknown>)[key] = value;
}
function clearWindowValue(key: string): void {
  delete (window as unknown as Record<string, unknown>)[key];
}

export default function RedGiantDebugPanel() {
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [center, setCenter] = useState<[number, number, number]>(DEFAULT_CENTER);
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(true);

  // Push radius/center → the window hooks ONLY while PINNED (actively tuning). When not
  // pinned the lifecycle owns the red-giant size + park vantage (it now ANIMATES the size
  // across the reveal — a constant override would defeat that), so the hooks are cleared
  // and the scene falls back to look.giantScale / the baked RED_GIANT_PARK.
  useEffect(() => {
    if (pinned) setWindowValue(DEBUG_WINDOW_KEYS.giantRadius, radius);
    else clearWindowValue(DEBUG_WINDOW_KEYS.giantRadius);
  }, [pinned, radius]);

  useEffect(() => {
    if (pinned) setWindowValue(DEBUG_WINDOW_KEYS.giantCenter, [...center]);
    else clearWindowValue(DEBUG_WINDOW_KEYS.giantCenter);
  }, [pinned, center]);

  // Pin / unpin the lifecycle stage so the red giant is framed while tuning.
  useEffect(() => {
    if (pinned) setWindowValue(DEBUG_WINDOW_KEYS.morph, RED_GIANT_STAGE);
    else clearWindowValue(DEBUG_WINDOW_KEYS.morph);
  }, [pinned]);

  // Clean every hook this panel set when it unmounts so it never leaves the scene
  // pinned to a debug frame.
  useEffect(() => {
    return () => {
      clearWindowValue(DEBUG_WINDOW_KEYS.giantRadius);
      clearWindowValue(DEBUG_WINDOW_KEYS.giantCenter);
      clearWindowValue(DEBUG_WINDOW_KEYS.morph);
    };
  }, []);

  const setAxis = (index: 0 | 1 | 2, value: number): void => {
    setCenter((prev) => {
      const next = [...prev] as [number, number, number];
      next[index] = value;
      return next;
    });
  };

  const reset = (): void => {
    setRadius(DEFAULT_RADIUS);
    setCenter([...DEFAULT_CENTER]);
  };

  if (!import.meta.env.DEV) return null;

  return (
    <div className="rg-debug" data-open={open}>
      <button
        type="button"
        className="rg-debug__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        red giant {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="rg-debug__body">
          <label className="rg-debug__pin">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            pin to red-giant frame
          </label>

          <div className="rg-debug__row">
            <span className="rg-debug__name">size</span>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.05}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
            <span className="rg-debug__val">{radius.toFixed(2)}</span>
          </div>

          {AXES.map((axis) => (
            <div className="rg-debug__row" key={axis.key}>
              <span className="rg-debug__name">{axis.label}</span>
              <input
                type="range"
                min={-40}
                max={40}
                step={0.1}
                value={center[axis.index]}
                onChange={(e) => setAxis(axis.index, Number(e.target.value))}
              />
              <span className="rg-debug__val">{center[axis.index].toFixed(1)}</span>
            </div>
          ))}

          <button type="button" className="rg-debug__reset" onClick={reset}>
            reset
          </button>
        </div>
      )}
    </div>
  );
}
