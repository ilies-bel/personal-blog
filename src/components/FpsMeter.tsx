// FpsMeter — a live frames-per-second readout for the Behind-the-Build page.
//
// Two jobs, one tiny island:
//   1. CONTINUOUS readout — a 1Hz EMA of measured frames-per-second, computed from
//      requestAnimationFrame deltas, displayed next to the resolved DeviceTier the
//      hero uses (same detectDeviceTier() probe — so what the page says about its
//      own engine is what the engine would actually see on this machine).
//   2. OPTIONAL benchmark — a "Run 5s benchmark" button samples per-frame deltas
//      for 5 seconds and reports min / 1% low / p50 / p95-frame / max FPS. Hands
//      the visitor the same diagnostic the developer ran while tuning the perf
//      budgets. The percentile stats are computed over FRAME TIMES (the thing
//      that stutters), then expressed as FPS: p50 is the typical frame, "p95
//      frame" is the fps you get at the 95th-percentile (slow-end) frame time,
//      and "1% low" is the average fps across the slowest 1% of frames — the
//      standard stutter metrics, so a run that averages 60 but hitches visibly
//      can no longer hide behind its median.
//
// No three.js — this measures the browser's rAF clock on its own, so it does not
// interfere with the page's actual GPU work. SSR-safe (no globals on import); the
// rAF loop only starts in useEffect, so server render produces a stable placeholder.
import { useEffect, useRef, useState } from 'react';
import { detectDeviceTier, type DeviceTier } from '../hero/lib/config';

interface BenchmarkResult {
  /** Slowest single-frame FPS observed during the sweep. */
  minFps: number;
  /** Average FPS across the slowest 1% of frames ("1% low"). */
  onePercentLowFps: number;
  /** Median FPS (FPS at the 50th-percentile frame time). */
  p50Fps: number;
  /** FPS at the 95th-percentile (slow-end) frame time. */
  p95FrameFps: number;
  /** Fastest single-frame FPS observed. */
  maxFps: number;
  /** Number of frame samples collected in the window. */
  samples: number;
}

const BENCHMARK_MS = 5_000;
const EMA_ALPHA = 0.1; // gentle smoothing — fast enough to react to a stutter, slow enough not to hop on every frame.

/** Value at quantile q (0..1) of an ASCENDING-sorted array (nearest-rank). */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

/** Full stutter-aware summary over a sweep of frame times (ms). */
function summarizeFrameTimes(frameTimesMs: number[]): Omit<BenchmarkResult, 'samples'> {
  if (frameTimesMs.length === 0) {
    return { minFps: 0, onePercentLowFps: 0, p50Fps: 0, p95FrameFps: 0, maxFps: 0 };
  }
  const sorted = [...frameTimesMs].sort((a, b) => a - b);
  // Slowest 1% of frames (at least one frame): their MEAN frame time → fps.
  const worst = sorted.slice(-Math.max(1, Math.floor(sorted.length * 0.01)));
  const worstMean = worst.reduce((sum, t) => sum + t, 0) / worst.length;
  return {
    minFps: Math.round(1_000 / sorted[sorted.length - 1]!),
    onePercentLowFps: Math.round(1_000 / worstMean),
    p50Fps: Math.round(1_000 / quantileSorted(sorted, 0.5)),
    p95FrameFps: Math.round(1_000 / quantileSorted(sorted, 0.95)),
    maxFps: Math.round(1_000 / sorted[0]!),
  };
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
            const result: BenchmarkResult = {
              ...summarizeFrameTimes(samples),
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
            {/* Average fps across the slowest 1% of frames — the stutter number. */}
            <dt>1% low</dt>
            <dd>{benchResult.onePercentLowFps} fps</dd>
          </div>
          <div>
            <dt>p50</dt>
            <dd>{benchResult.p50Fps} fps</dd>
          </div>
          <div>
            {/* fps at the 95th-percentile (slow-end) frame time. */}
            <dt>p95 frame</dt>
            <dd>{benchResult.p95FrameFps} fps</dd>
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
