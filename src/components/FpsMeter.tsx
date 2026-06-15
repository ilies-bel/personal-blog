// FpsMeter — a live frames-per-second readout for the Behind-the-Build page.
//
// Two jobs, one tiny island:
//   1. CONTINUOUS readout — a 1Hz EMA of measured frames-per-second, computed from
//      requestAnimationFrame deltas, displayed next to the resolved DeviceTier the
//      hero uses (same detectDeviceTier() probe — so what the page says about its
//      own engine is what the engine would actually see on this machine).
//   2. OPTIONAL benchmark — a "Run 5s benchmark" button samples per-frame deltas
//      for 5 seconds and reports min / median / max FPS. Hands the visitor the
//      same diagnostic the developer ran while tuning the perf budgets.
//
// No three.js — this measures the browser's rAF clock on its own, so it does not
// interfere with the page's actual GPU work. SSR-safe (no globals on import); the
// rAF loop only starts in useEffect, so server render produces a stable placeholder.
import { useEffect, useRef, useState } from 'react';
import { detectDeviceTier, type DeviceTier } from '../hero/lib/config';

interface BenchmarkResult {
  /** Slowest single-frame FPS observed during the sweep. */
  minFps: number;
  /** Median FPS across the sweep (50th percentile of frame samples). */
  medianFps: number;
  /** Fastest single-frame FPS observed. */
  maxFps: number;
  /** Number of frame samples collected in the window. */
  samples: number;
}

const BENCHMARK_MS = 5_000;
const EMA_ALPHA = 0.1; // gentle smoothing — fast enough to react to a stutter, slow enough not to hop on every frame.

/** Median of a (mutated) numeric array. Returns 0 for an empty array. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export default function FpsMeter() {
  // Resolved tier — set in effect so SSR shows a neutral 'auto' placeholder.
  const [tier, setTier] = useState<DeviceTier | null>(null);
  // Smoothed live FPS, displayed in the readout. 0 until the first frame lands.
  const [liveFps, setLiveFps] = useState(0);
  const [benchRunning, setBenchRunning] = useState(false);
  const [benchResult, setBenchResult] = useState<BenchmarkResult | null>(null);

  // The rAF id for the continuous loop; cleared on unmount.
  const rafRef = useRef<number | null>(null);
  // The exponential moving average — held in a ref so the rAF callback doesn't
  // close over a stale state value (and so we don't re-render every frame).
  const emaRef = useRef<number>(0);
  // Last setState pulse — at most 4Hz so React doesn't run reconciliation 60×/s.
  const lastPublishRef = useRef<number>(0);
  // When a benchmark is running, frame deltas (ms) accumulate here.
  const benchSamplesRef = useRef<number[]>([]);
  // Wall-clock end of the benchmark window; 0 means no benchmark running.
  const benchEndRef = useRef<number>(0);

  useEffect(() => {
    setTier(detectDeviceTier());

    let prev = performance.now();
    const tick = (now: number): void => {
      const dt = now - prev;
      prev = now;
      if (dt > 0 && dt < 1_000) {
        const fps = 1_000 / dt;
        emaRef.current = emaRef.current === 0 ? fps : emaRef.current + EMA_ALPHA * (fps - emaRef.current);
        if (now - lastPublishRef.current > 250) {
          lastPublishRef.current = now;
          setLiveFps(Math.round(emaRef.current));
        }
        // Benchmark accumulation: capture every legitimate frame delta in the window.
        if (benchEndRef.current > 0) {
          benchSamplesRef.current.push(dt);
          if (now >= benchEndRef.current) {
            const samples = benchSamplesRef.current;
            const fpsValues = samples.map((ms) => 1_000 / ms);
            const result: BenchmarkResult = {
              minFps: Math.round(Math.min(...fpsValues)),
              medianFps: Math.round(median(fpsValues)),
              maxFps: Math.round(Math.max(...fpsValues)),
              samples: samples.length,
            };
            benchSamplesRef.current = [];
            benchEndRef.current = 0;
            setBenchResult(result);
            setBenchRunning(false);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startBenchmark = (): void => {
    if (benchRunning) return;
    benchSamplesRef.current = [];
    benchEndRef.current = performance.now() + BENCHMARK_MS;
    setBenchResult(null);
    setBenchRunning(true);
  };

  return (
    <div className="fps-meter" data-running={benchRunning}>
      <div className="fps-meter-row">
        <span className="fps-meter-label">Tier</span>
        <span className="fps-meter-value">{tier ?? 'auto'}</span>
      </div>
      <div className="fps-meter-row">
        <span className="fps-meter-label">Live FPS</span>
        <span className="fps-meter-value fps-meter-live">{liveFps || '—'}</span>
      </div>
      <button
        type="button"
        className="fps-meter-button"
        onClick={startBenchmark}
        disabled={benchRunning}
      >
        {benchRunning ? 'Sampling…' : 'Run 5s benchmark'}
      </button>
      {benchResult && (
        <dl className="fps-meter-result" aria-label="Benchmark result">
          <div>
            <dt>min</dt>
            <dd>{benchResult.minFps} fps</dd>
          </div>
          <div>
            <dt>median</dt>
            <dd>{benchResult.medianFps} fps</dd>
          </div>
          <div>
            <dt>max</dt>
            <dd>{benchResult.maxFps} fps</dd>
          </div>
          <div>
            <dt>samples</dt>
            <dd>{benchResult.samples}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
