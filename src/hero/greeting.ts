// ===========================================================================
// greeting.ts — turns visitor signals into ONE witty, personalized hero line.
//
// Tone: clever, friendly, with a light playful jab. Never mean, never creepy.
// It implies "I noticed you" without claiming anything it can't actually see
// (no names, no precise location). Everything is read client-side and stays in
// the browser.
//
// Output shape: the greeting is built as STRUCTURED PARTS — a time-based
// `opener` (the calm, generic half) and an optional `jab` (the part that is
// actually about *you*: your device, browser, where you came from). The hero
// renders them differently — the jab is the bit it types in, in the accent
// color — so the visitor can literally see which half the page "knows".
//
// `buildGreeting` flattens the parts into the single sentence that crawlers,
// tests, and the no-JS fallback rely on. Don't change its output format without
// updating test/greeting.test.mjs and e2e/hero.spec.ts.
// ===========================================================================
import type { Signals } from './signals';

// Small non-repeating picker. Uses Math.random on the client; falls back to a
// stable index in the (server/test) sandbox where random is unavailable.
function pick<T>(arr: T[], seed = -1): T {
  if (arr.length === 1) return arr[0];
  let i: number;
  try {
    i = Math.floor(Math.random() * arr.length);
  } catch {
    i = 0;
  }
  if (i === seed) i = (i + 1) % arr.length;
  return arr[i];
}

interface GreetingInput {
  signals: Signals;
  /** How many times this person has visited before (0 = first time). */
  priorVisits: number;
}

/**
 * The greeting, split into the half that's generic (opener) and the half that's
 * about the visitor (jab). `jab` is null when no signal produced one — the
 * opener then stands on its own with a warm close.
 */
export interface GreetingParts {
  /** The calm, time-based half. Always present. Capitalized, no trailing punctuation. */
  opener: string;
  /** The "about you" half — what the page noticed. Null if nothing applied. */
  jab: string | null;
  /** The complete, flattened sentence (what crawlers / no-JS / tests see). */
  full: string;
}

// --- Openers, keyed by part of day -----------------------------------------
// Tuned for the audience we most want to win: someone deciding whether to work
// with Iliès. Self-aware and warm; the joke is on the shared situation, never
// at the reader's expense.
//
// Two registers per slot. SHORT openers lead when a jab follows — the jab is
// the payoff and deserves the room, so the opener stays out of its way and the
// headline doesn't run six lines deep. LONG openers stand alone (no jab applied)
// and carry the personality themselves.
interface OpenerSet {
  short: string[];
  long: string[];
}
const OPENERS: Record<Signals['partOfDay'], OpenerSet> = {
  'small hours': {
    // Keep a late-hour cue in every short opener (night / 3 a.m. / oil) — the
    // greeting tests assert small-hours lines always evoke the late hour.
    short: ['Late night', 'Burning the 3 a.m. oil'],
    long: [
      "It's the middle of the night and you're reading a dev blog. Respect",
      'Up at 3 a.m. I know that feeling, and I hope whatever you’re debugging gives in soon',
    ],
  },
  'early morning': {
    short: ['Early start', 'Up with the sun'],
    long: [
      'Up before everyone else, already reading code. That’s a good sign',
      'This early? Either discipline or one of those mornings. Either way, welcome',
    ],
  },
  morning: {
    short: ['Good morning'],
    long: ['Morning, perfect time to fall into a good rabbit hole'],
  },
  afternoon: {
    short: ['Good afternoon'],
    long: ['Afternoon, the productive kind of detour, I hope'],
  },
  evening: {
    short: ['Good evening'],
    long: ['Evening, and you’re spending it on a stranger’s blog. I’m honored'],
  },
  night: {
    short: ['Good evening', 'Evening'],
    long: ['Getting late, and yet here you are. Glad you stopped by'],
  },
};

// --- Jabs, each a function of the signals. Return null when not applicable. --
// Each returns the lowercase "about you" fragment, written to follow the opener
// with a comma ("Good evening, on a Mac, naturally."). Kept gentle: the humor is
// recognition and self-awareness, not a verdict on the reader's taste.
type Jab = (s: Signals, prior: number) => string | null;

const browserJab: Jab = (s) => {
  switch (s.browser) {
    case 'Safari':
      return pick([
        'on Safari, the one I always forget to test in, so thank you for the reminder',
        'on Safari, quietly keeping me honest about my CSS',
      ]);
    case 'Firefox':
      return pick([
        'on Firefox, a person of principle. I won’t even tease you for it',
        'on Firefox, single-handedly keeping the web from being a monoculture. Genuinely, thank you',
      ]);
    case 'Edge':
      return pick([
        'on Edge, which honestly got good when nobody was looking',
        'on Edge, the underdog browser, and I respect a contrarian',
      ]);
    case 'Chrome':
      return pick([
        'on Chrome, like most of the planet. No notes',
        'on Chrome, the sensible default, and there’s nothing wrong with sensible',
      ]);
    case 'Opera':
      return pick(['on Opera, you order the interesting thing on the menu, and I like that']);
    default:
      return pick(['on a browser niche enough that you clearly have good reasons']);
  }
};

const osJab: Jab = (s) => {
  switch (s.os) {
    case 'Linux':
      return pick([
        'on Linux, so you’ve probably already spotted something you’d configure differently. Fair',
        'on Linux, which means you’ve earned your opinions about font rendering',
      ]);
    case 'Windows':
      return pick([
        'on Windows, where half of us actually ship from, whatever the timelines say',
        'on Windows, WSL and all, doing real work',
      ]);
    case 'macOS':
      return pick([
        'from a Mac, naturally',
        'on a Mac, the unofficial uniform of people who write about code',
      ]);
    case 'Android':
      return pick(['on Android, the quietly-sensible choice']);
    case 'iOS':
      return pick(['on an iPhone, and I’ll keep this thumb-friendly']);
    default:
      return null;
  }
};

const deviceJab: Jab = (s) => {
  if (s.device === 'phone')
    return pick([
      'reading a tech blog on a phone, which is real dedication. I’ll keep the snippets merciful',
      'on a small screen, so I’ll spare you the wide code blocks',
    ]);
  if (s.device === 'tablet') return pick(['on a tablet, comfortably, and I respect the setup']);
  return null;
};

const referrerJab: Jab = (s) => {
  const r = s.referrer;
  if (r.kind === 'aggregator')
    return pick([
      `straight from ${r.source}, arriving with healthy skepticism. I’ll try to earn it`,
      `${r.source} sent you, so the bar is high. Good`,
    ]);
  if (r.kind === 'search')
    return pick([
      `you ${r.source}-d your way here, which means something nearby is on fire. I hope the fix is below`,
      `${r.source} dropped you off, fingers crossed the answer’s in here somewhere`,
    ]);
  if (r.kind === 'social' && r.source)
    return pick([`fresh off ${r.source}, dopamine still warm from the scroll`]);
  if (r.kind === 'direct')
    return pick([
      'and you typed the URL straight in. That’s either loyalty or a very good memory',
    ]);
  return null;
};

const returningJab: Jab = (_s, prior) => {
  if (prior <= 0) return null;
  if (prior === 1) return pick(['and you came back for a second look. I’m flattered']);
  if (prior < 5) return pick([`and this isn’t your first visit (${prior + 1} and counting). A regular`]);
  return pick(['and at this point you basically have a desk here. Welcome back, again']);
};

// Order = priority. The returning-visitor jab is the most personal, so it's
// checked first; otherwise a random applicable jab keeps repeat loads fresh.
const JABS: Jab[] = [returningJab, referrerJab, browserJab, osJab, deviceJab];

/**
 * Build the personalized hero sentence as structured parts.
 * Always returns a complete, grammatical sentence in `full` — even if every
 * optional signal is missing (graceful fallback).
 */
export function buildGreetingParts({ signals, priorVisits }: GreetingInput): GreetingParts {
  const set = OPENERS[signals.partOfDay];

  const applicable = JABS.map((j) => j(signals, priorVisits)).filter(
    (x): x is string => Boolean(x),
  );

  if (applicable.length === 0) {
    // Nothing to say about the visitor — let the opener carry the line itself.
    const opener = capitalize(pick(set.long));
    return {
      opener,
      jab: null,
      full: `${opener}. Welcome, make yourself at home.`,
    };
  }

  // A jab is the payoff, so keep the opener short and give the jab the room.
  // The returning-visitor jab (always JABS[0]) is the most personal, so prefer
  // it; otherwise pick a random applicable jab so repeat loads feel fresh.
  const opener = capitalize(pick(set.short));
  const returning = returningJab(signals, priorVisits);
  const jab = returning ?? pick(applicable);

  return {
    opener,
    jab,
    full: `${opener}, ${jab}.`,
  };
}

/**
 * Build the single personalized hero sentence (flattened).
 * Kept for the no-JS fallback, the crawler HTML, and the unit/E2E tests, which
 * all depend on this exact string format.
 */
export function buildGreeting(input: GreetingInput): string {
  return buildGreetingParts(input).full;
}

/** Capitalize the first letter; the rest of the sentence is left untouched. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A neutral line shown before JS hydrates / for crawlers. */
export const FALLBACK_GREETING = 'Welcome. Glad you’re here.';
