// The manifesto overlay: one beat per lifecycle state, pinned over the canvas and
// cross-faded by scroll. Each beat carries two big lines (down = rewind/hopeful,
// up = forward/tragic); the active one is chosen by scroll direction. Copy + the
// timeline live in ../beats (shared with index.astro's SSR fallback).
import { BEATS } from '../beats';
import { SCROLL_DOWN, SCROLL_UP, BEAT_HOLD, BEAT_FADE, type BeatEdge } from '../lib/constants';
import { useSceneState } from './SceneStateContext';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Per-beat opacity: a trapezoid centred on `at` — ramp in, hold across a flat top,
// ramp out — so neighbouring beats cross-dissolve. `edge` pins the open side so the
// first/last beats never leave a dead band at the page extremes: 'leading' holds
// full opacity before the centre (the opening black-hole beat sits at the very
// top), 'trailing' holds it after (so the closing beat stays reachable at the end).
function beatOpacity(progress: number, at: number, edge?: BeatEdge): number {
  if (edge === 'leading' && progress <= at) return 1;
  if (edge === 'trailing' && progress >= at) return 1;
  const distance = Math.abs(progress - at);
  if (distance <= BEAT_HOLD) return 1;
  if (distance >= BEAT_HOLD + BEAT_FADE) return 0;
  return clamp01((BEAT_HOLD + BEAT_FADE - distance) / BEAT_FADE);
}

export default function ManifestoOverlay() {
  const { progress, direction, reduced, explorationMode } = useSceneState();
  return (
    <div
      className="bh-overlay"
      data-exploring={explorationMode}
      style={{ opacity: explorationMode && !reduced ? 0 : undefined }}
    >
      {BEATS.map((beat, i) => {
        // Under reduced motion every beat is shown (so all copy is reachable);
        // otherwise the trapezoid fade reveals one beat at a time. The first and
        // last beats pin their outer edge so nothing goes blank at progress 0/1.
        const isLast = i === BEATS.length - 1;
        const edge: BeatEdge | undefined = i === 0 ? 'leading' : isLast ? 'trailing' : undefined;
        const opacity = reduced ? 1 : beatOpacity(progress, beat.at, edge);
        const visible = opacity > 0.5;
        return (
          <div className="bh-beat" key={i} style={{ opacity }} aria-hidden={!reduced && !visible}>
            {/* Big line: both directions rendered, crossfaded by `direction`.
                Under reduced motion both are shown stacked (no crossfade). */}
            <h2 className="bh-beat-big">
              <span
                className="bh-beat-line bh-beat-line--down"
                data-active={reduced || direction === SCROLL_DOWN}
              >
                {beat.down}
              </span>
              <span
                className="bh-beat-line bh-beat-line--up"
                data-active={reduced || direction === SCROLL_UP}
                aria-hidden={!reduced && direction !== SCROLL_UP}
              >
                {beat.up}
              </span>
            </h2>

            <p className="bh-beat-whisper">
              <span className="bh-beat-state">{beat.state}</span>
              {beat.whisper}
            </p>
          </div>
        );
      })}
    </div>
  );
}
