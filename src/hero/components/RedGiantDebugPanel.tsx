// DEV-ONLY red-giant framing panel. Lets you tune the held red giant's on-screen
// composition live (no rebuild) and read off the exact values to bake in.
//
// It writes the scene's debug hooks on `window`:
//   __bhMorph    — pin the lifecycle stage to the red-giant hold (2.05) so the giant
//                  is on screen without scrolling (the pin checkbox).
//   __bhGiantSize — red-giant WORLD radius (createScene divides by uGiantR=4.2 → uGiantScale).
//   __bhGiantPosX — on-screen X position (overrides RED_GIANT_PARK.x, the camera pan).
//   __bhGiantPosY — on-screen Y position (overrides RED_GIANT_PARK.y).
//
// Nothing here ships: index.astro mounts it only under import.meta.env.DEV.
import { useEffect, useState } from 'react';
import { DEBUG_WINDOW_KEYS } from '../lib/constants';

// Committed defaults (keep in sync with createScene's RED_GIANT_RADIUS / RED_GIANT_PARK).
const DEFAULTS = { size: 9.0, posX: 5.0, posY: -3.0 };
// Red-giant hold stage; pinning here forces progress ≈0.514, inside the camera-park window.
const PIN_STAGE = 2.05;

type Win = Record<string, unknown>;
const setHook = (key: string, value: number | undefined): void => {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Win;
  if (value === undefined) delete w[key];
  else w[key] = value;
};

export default function RedGiantDebugPanel() {
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [size, setSize] = useState(DEFAULTS.size);
  const [posX, setPosX] = useState(DEFAULTS.posX);
  const [posY, setPosY] = useState(DEFAULTS.posY);

  // Pin: hold the stage at the red-giant beat (or release back to scroll).
  useEffect(() => {
    setHook(DEBUG_WINDOW_KEYS.morph, pinned ? PIN_STAGE : undefined);
    return () => setHook(DEBUG_WINDOW_KEYS.morph, undefined);
  }, [pinned]);

  // Live size / position overrides only apply while pinned, so normal scrolling
  // through the page keeps the committed framing.
  useEffect(() => {
    setHook(DEBUG_WINDOW_KEYS.giantSize, pinned ? size : undefined);
    setHook(DEBUG_WINDOW_KEYS.giantPosX, pinned ? posX : undefined);
    setHook(DEBUG_WINDOW_KEYS.giantPosY, pinned ? posY : undefined);
    return () => {
      setHook(DEBUG_WINDOW_KEYS.giantSize, undefined);
      setHook(DEBUG_WINDOW_KEYS.giantPosX, undefined);
      setHook(DEBUG_WINDOW_KEYS.giantPosY, undefined);
    };
  }, [pinned, size, posX, posY]);

  const reset = (): void => {
    setSize(DEFAULTS.size);
    setPosX(DEFAULTS.posX);
    setPosY(DEFAULTS.posY);
  };

  return (
    <div className="rg-debug">
      <button className="rg-debug__title" onClick={() => setOpen((o) => !o)} type="button">
        RED GIANT {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="rg-debug__body">
          <label className="rg-debug__pin">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            pin to red-giant frame
          </label>

          <Row label="size" value={size} min={1} max={40} step={0.05} onChange={setSize} fmt={(v) => v.toFixed(2)} />
          <Row label="pos X" value={posX} min={-30} max={30} step={0.1} onChange={setPosX} fmt={(v) => v.toFixed(1)} />
          <Row label="pos Y" value={posY} min={-30} max={30} step={0.1} onChange={setPosY} fmt={(v) => v.toFixed(1)} />

          <button className="rg-debug__reset" onClick={reset} type="button">
            RESET
          </button>

          <div className="rg-debug__readout">
            size {size.toFixed(2)} · pos {posX.toFixed(1)}, {posY.toFixed(1)}
            {!pinned && <span className="rg-debug__hint"> — check “pin” to tune live</span>}
          </div>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}

function Row({ label, value, min, max, step, onChange, fmt }: RowProps) {
  return (
    <div className="rg-debug__row">
      <span className="rg-debug__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="rg-debug__value">{fmt(value)}</span>
    </div>
  );
}
