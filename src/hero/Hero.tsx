// ===========================================================================
// Hero.tsx — the one twist. A React island that, after mounting in the browser,
// reads visitor signals and writes a witty, personalized line into the hero.
//
// The reveal: the hero shows a neutral fallback line on the server and before
// hydration (crawlers + no-JS see a complete, sensible hero). Once mounted, the
// calm "opener" half appears immediately, then the part that's actually about
// *you* — your device, browser, where you came from — TYPES itself in, in the
// accent color, so the visitor literally watches the page read them.
//
// SSG / SEO: the swap happens in an effect, post-mount — no hydration mismatch,
// no layout jump (the line reserves its space), and the personalized text never
// gates content visibility (reduced motion renders it instantly).
// ===========================================================================
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { readSignals, readBattery, type Signals } from './signals';
import { buildGreetingParts, FALLBACK_GREETING, type GreetingParts } from './greeting';
import { registerVisit } from './visits';
import { useTypewriter } from './useTypewriter';

// The signature object — a faceted cobalt gem rendered with React Three Fiber,
// sitting where the flat `.hero-glow` bloom lives. Lazy-loaded so the three.js
// bundle never blocks hydration of the personalized line; if it fails to load
// (or WebGL is unavailable) the flat CSS glow underneath simply shows through.
const Crystal = lazy(() => import('./Crystal'));

/** Does the visitor prefer reduced motion? Read once, client-side. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface HeroProps {
  /** The static tagline shown beneath the personalized line. */
  tagline: string;
  /** The name shown top-left, around the centered planet (e.g. "Iliès"). */
  name?: string;
  /** The role/subtitle under the name, top-left (e.g. "Software Engineer"). */
  role?: string;
}

/** A human-readable list of what the hero actually read off the browser. */
interface ReadFact {
  label: string;
  value: string;
}

export default function Hero({ tagline, name, role }: HeroProps) {
  const [parts, setParts] = useState<GreetingParts | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [priorVisits, setPriorVisits] = useState(0);
  // The crystal mounts only after the personalized line resolves, so the heavy
  // 3D bundle never contends with the hero's first, most important paint.
  const [showCrystal, setShowCrystal] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Which boundary splits the crystal's colour. 'center' (default) anchors the
  // gem to the middle of the first viewport with a vertical cobalt/copper split;
  // compare the others live with ?crystal=corner or ?crystal=divider in the URL.
  const [crystalVariant, setCrystalVariant] = useState<'corner' | 'divider' | 'center'>('center');

  useEffect(() => {
    const s = readSignals();
    const prior = registerVisit(Date.now());
    setSignals(s);
    setPriorVisits(prior);
    setParts(buildGreetingParts({ signals: s, priorVisits: prior }));
    setReduceMotion(prefersReducedMotion());
    setShowCrystal(true);
    const v = new URLSearchParams(window.location.search).get('crystal');
    if (v === 'divider' || v === 'corner' || v === 'center') setCrystalVariant(v);

    // Battery is async; if it resolves, regenerate (rarely changes the line,
    // but keeps the signal set complete for any future battery-based jabs).
    readBattery().then((b) => {
      if (!b) return;
      const merged = { ...s, battery: b };
      setSignals(merged);
      setParts(buildGreetingParts({ signals: merged, priorVisits: prior }));
    });
  }, []);

  const personalized = parts !== null;

  // Only the "about you" fragment types in. The opener appears instantly so the
  // line is readable from the first frame; the jab is the bit worth watching.
  const jabText = parts?.jab ?? '';
  const { shown: typedJab, done: jabDone } = useTypewriter(jabText, {
    cps: 38,
    start: personalized,
  });

  // What the page read — shown in the "how does it know?" disclosure. Built only
  // once signals exist; reinforces that it's all client-side and nothing's stored.
  const facts = useMemo<ReadFact[]>(() => (signals ? describeSignals(signals, priorVisits) : []), [
    signals,
    priorVisits,
  ]);

  return (
    <>
      {/* The signature object lives on its own FIXED, full-viewport layer — NOT
          inside .hero (which clips + isolates), so the single crystal can cross
          the hero's edge and wear two colours: cobalt inside the hero rectangle,
          its copper negative outside. It measures .hero itself to find the
          boundary. z-index sits below the content but above the page bg. */}
      {showCrystal && (
        <div className="crystal-layer" aria-hidden="true">
          <Suspense fallback={null}>
            <Crystal animate={!reduceMotion} variant={crystalVariant} />
          </Suspense>
        </div>
      )}

      <header className={`hero${crystalVariant === 'center' ? ' hero--centered' : ''}`}>
        {/* In the centered variant the planet is pinned to viewport center and the
            text is arranged AROUND it: identity top-left, tagline bottom-right, and
            the big personalized line as a band along the bottom (a la the reference
            layout). A viewport-filling CSS grid places the three slots; the
            corner/divider variants keep the original single stacked column. */}

        {/* TOP-LEFT — identity. The eyebrow sits above the name + role, the way
            "RISHABH UPADHYAY / Software Engineer" anchors the reference's top-left. */}
        <div className="hero-id">
        <p className="hero-eyebrow" aria-hidden={personalized ? undefined : 'true'}>
        {personalized ? 'hey, you' : ' '}
      </p>
          {name && <p className="hero-name">{name}</p>}
          {role && <p className="hero-role">{role}</p>}
        </div>

      {/* BOTTOM-RIGHT — the quiet tagline, right-aligned beside the planet. */}
      <p className="hero-tagline">{tagline}</p>

      {/* BOTTOM BAND — the big personalized line, spanning the width under the
          planet. aria-live announces it once resolved; crawlers / no-JS read the
          fallback already in the DOM. */}
      <h1
        className={`hero-line${personalized ? ' is-personalized' : ''}`}
        aria-live="polite"
      >
        {personalized && parts ? (
          <>
            <span className="hero-opener">{parts.opener}</span>
            {parts.jab && (
              <>
                <span className="hero-sep">, </span>
                <span className={`hero-jab${jabDone ? ' is-done' : ''}`}>
                  {typedJab}
                  <span className="hero-caret" aria-hidden="true" />
                </span>
                {/* The closing period snaps in only once typing finishes, so it
                    never dangles after a half-typed jab. */}
                {jabDone && <span className="hero-stop">.</span>}
              </>
            )}
            {!parts.jab && <span className="hero-stop">. Welcome, make yourself at home.</span>}
          </>
        ) : (
          FALLBACK_GREETING
        )}
      </h1>

      {personalized && facts.length > 0 && (
        <details className="hero-reveal">
          <summary>
            <span className="hero-reveal-q">How does it know that?</span>
            <span className="hero-reveal-hint">and where does it go?</span>
          </summary>
          <div className="hero-reveal-body">
            <p className="hero-reveal-lede">
              When the page loaded, your browser handed it a few public facts. No
              account, no tracking, nothing leaves this tab. The line is assembled
              right here and forgotten on refresh.
            </p>
            <dl className="hero-facts">
              {facts.map((f) => (
                <div className="hero-fact" key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      )}
      </header>
    </>
  );
}

/**
 * Turn the raw signals into the short, honest list shown in the disclosure.
 * Only includes facts the greeting could actually have used.
 */
function describeSignals(s: Signals, prior: number): ReadFact[] {
  const facts: ReadFact[] = [];

  const partOfDay = s.partOfDay === 'small hours' ? 'the small hours' : s.partOfDay;
  facts.push({ label: 'Local time', value: `${partOfDay} (${pad(s.hour)}:00, ${s.timezone})` });

  facts.push({ label: 'Device', value: `${cap(s.device)} · ${s.os} · ${s.browser}` });

  const r = s.referrer;
  const arrival =
    r.kind === 'direct'
      ? 'typed the address straight in'
      : r.source
        ? `arrived from ${r.source}`
        : r.kind === 'internal'
          ? 'came from elsewhere on this site'
          : 'arrived from another site';
  facts.push({ label: 'Arrival', value: arrival });

  facts.push({
    label: 'Visits',
    value: prior <= 0 ? 'first time here' : `${prior + 1} times (counted only in your browser)`,
  });

  return facts;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
