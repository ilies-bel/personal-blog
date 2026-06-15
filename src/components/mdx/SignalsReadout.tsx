// SignalsReadout — a live, in-prose demonstration of the very thing this essay argues.
//
// The "Personalized Hero With Zero Backend" post claims the browser already hands a
// page enough ambient context to say hello — local time, timezone, device, referrer,
// dark-mode preference — without a single network request or stored identifier. Rather
// than only describe that, this component PROVES it in place: it reads those signals
// directly inside the island, computes one playful greeting from them, and lets the
// reader reroll to see how the same signals fan out into many sentences.
//
// HONESTY GUARDRAILS that match the post's no-tracking thesis:
//  • Every read is synchronous and local: `new Date()`, `Intl.DateTimeFormat`, the
//    `navigator.userAgent` string, `document.referrer`, `matchMedia` — nothing is
//    fetched, awaited, or persisted. There is no fetch / XHR / sendBeacon anywhere
//    in this module, and no storage of any kind.
//  • The signals + greeting only exist in this component's local React state for the
//    lifetime of the island; nothing escapes the page.
//  • A footer line spells that contract out for the reader — the prose argues it, the
//    panel embodies it, and the footnote names it.
//
// It carries no scene/three dependency; it is a tiny, self-contained island so it stays
// honest about the "no server, no tracking" point it illustrates. Mirrors IslandsDemo's
// shape (data-hydrated, the hairline panel + dot + mono caps) so the two embeds read
// as the same instrument family.
import { useEffect, useMemo, useState } from 'react';

interface Signals {
  /** 0–23 — the visitor's own clock, never normalized to UTC. */
  hour: number;
  /** IANA timezone, e.g. "Europe/Paris" — for the "you're reading at 03:14 in X" line. */
  timezone: string;
  /** Coarse browser bucket (Chrome / Firefox / Safari / Edge / Other). UA strings lie;
   *  this is intentionally a rough classification, not fingerprinting. */
  browser: string;
  /** Coarse referrer bucket — 'direct' | 'search' | 'social' | 'other' — derived from
   *  `document.referrer`'s hostname. We never store the raw URL. */
  referrer: ReferrerKind;
  /** Resolved prefers-color-scheme — the browser tells us whether the visitor's OS
   *  is in dark or light mode without a permission prompt. */
  colorScheme: 'dark' | 'light';
}

type ReferrerKind = 'direct' | 'search' | 'social' | 'other';

function detectBrowser(ua: string): string {
  // Order matters: Edge / Chromium-fork strings contain "Chrome" / "Safari", and
  // Chrome on iOS reports as Safari. We sniff the most specific markers first.
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'a browser';
}

function classifyReferrer(raw: string): ReferrerKind {
  if (!raw) return 'direct';
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (/(google|bing|duckduckgo|kagi|ecosia|qwant|yandex)\./.test(host)) return 'search';
  if (/(news\.ycombinator|reddit|lobste\.rs|x\.com|twitter|bsky|mastodon|linkedin|threads)\./.test(host)) return 'social';
  return 'other';
}

function readSignals(): Signals {
  const now = new Date();
  return {
    hour: now.getHours(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    browser: detectBrowser(navigator.userAgent || ''),
    referrer: classifyReferrer(document.referrer || ''),
    colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  };
}

function openerFor(hour: number): string[] {
  if (hour < 5) return ['Up late', 'Burning the midnight oil', '3 a.m. reader detected'];
  if (hour < 12) return ['Good morning', 'Morning read', 'Coffee-in-hand hello'];
  if (hour < 18) return ['Good afternoon', 'Midday hello', 'Afternoon scroller'];
  if (hour < 22) return ['Good evening', 'Evening read', 'Hello after work'];
  return ['Late-night hello', 'Reading past sunset', 'Night-owl hello'];
}

function jabFor(s: Signals): string[] {
  const lines: string[] = [];
  if (s.referrer === 'search') lines.push('arrived by search — welcome from the index');
  if (s.referrer === 'social') lines.push('beamed in from a feed — thank the algorithm');
  if (s.referrer === 'direct') lines.push('typed the URL — old-school, respect');
  if (s.referrer === 'other') lines.push('followed a link from somewhere off the beaten path');
  if (s.browser === 'Safari') lines.push('reading on Safari, which is fine');
  if (s.browser === 'Firefox') lines.push('reading on Firefox — the web thanks you');
  if (s.browser === 'Chrome') lines.push('Chrome, naturally');
  if (s.browser === 'Edge') lines.push('Edge — an underrated pick');
  if (s.colorScheme === 'dark') lines.push('and your OS is in dark mode, like this page');
  else lines.push('and your OS is in light mode, while this page sticks to dark');
  return lines;
}

function pickGreeting(s: Signals, seed: number): string {
  // Deterministic pick from `seed` so re-renders inside one click are stable. The
  // button bumps the seed to surface a new sentence — same trick the real hero uses.
  const openers = openerFor(s.hour);
  const jabs = jabFor(s);
  const opener = openers[seed % openers.length] ?? openers[0];
  const jab = jabs[(seed * 7 + 3) % jabs.length] ?? jabs[0];
  return `${opener} — ${jab}.`;
}

function describeReferrer(kind: ReferrerKind): string {
  switch (kind) {
    case 'direct':
      return 'direct visit';
    case 'search':
      return 'a search engine';
    case 'social':
      return 'a social feed';
    case 'other':
      return 'another site';
  }
}

export default function SignalsReadout() {
  // null until hydration — server can't know the visitor's clock, so we render a
  // neutral placeholder in static HTML and swap in the live readout client-side,
  // exactly the progressive-enhancement story the post argues for.
  const [signals, setSignals] = useState<Signals | null>(null);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    setSignals(readSignals());
    // Initial seed varies per mount so a refresh shows a different opener — same
    // "random opener picking" trick described in the prose.
    setSeed(Math.floor(Math.random() * 1000));
  }, []);

  const greeting = useMemo(() => (signals ? pickGreeting(signals, seed) : ''), [signals, seed]);
  const hydrated = signals !== null;

  return (
    <div className="signals-readout" data-hydrated={hydrated}>
      <div className="signals-readout-head">
        <span className="signals-readout-dot" aria-hidden="true" />
        <span className="signals-readout-label">what this page knows about you right now</span>
        <span className="signals-readout-state">{hydrated ? 'read locally' : 'inert html'}</span>
      </div>

      <dl className="signals-readout-grid">
        <div>
          <dt>local time</dt>
          <dd>{signals ? `${String(signals.hour).padStart(2, '0')}:00` : '—'}</dd>
        </div>
        <div>
          <dt>timezone</dt>
          <dd>{signals?.timezone ?? '—'}</dd>
        </div>
        <div>
          <dt>browser</dt>
          <dd>{signals?.browser ?? '—'}</dd>
        </div>
        <div>
          <dt>arrived via</dt>
          <dd>{signals ? describeReferrer(signals.referrer) : '—'}</dd>
        </div>
        <div>
          <dt>os theme</dt>
          <dd>{signals?.colorScheme ?? '—'}</dd>
        </div>
      </dl>

      <p className="signals-readout-greeting" aria-live="polite">
        {hydrated ? greeting : 'The greeting renders client-side, after the island hydrates.'}
      </p>

      <div className="signals-readout-controls">
        <button
          type="button"
          className="signals-readout-button"
          onClick={() => setSeed((s) => s + 1)}
          disabled={!hydrated}
        >
          {hydrated ? 'reroll the greeting' : 'not yet interactive'}
        </button>
        <span className="signals-readout-promise">
          Read-only. Nothing leaves your browser — no network call, no storage.
        </span>
      </div>
    </div>
  );
}
