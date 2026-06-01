// Small hook: type a string out character-by-character. Respects
// prefers-reduced-motion by rendering instantly. Returns the visible substring
// and a `done` flag.
import { useEffect, useRef, useState } from 'react';

export function useTypewriter(text: string, opts: { cps?: number; start?: boolean } = {}) {
  const cps = opts.cps ?? 42; // characters per second
  const start = opts.start ?? true;
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    setShown('');
    setDone(false);
    if (!start || !text) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(text);
      setDone(true);
      return;
    }

    let i = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      const add = Math.max(1, Math.floor(dt * cps));
      if (dt * cps >= 1) {
        i = Math.min(text.length, i + add);
        setShown(text.slice(0, i));
        last = now;
      }
      if (i < text.length) raf.current = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [text, cps, start]);

  return { shown, done };
}
