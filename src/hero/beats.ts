// ===========================================================================
// beats.ts — the single source of truth for the reverse-lifecycle timeline and
// its manifesto copy.
//
// The home page plays the stellar lifecycle BACKWARDS as the visitor scrolls:
// black hole (top) → dying-star bridge → red giant → dying star → nebula →
// beginning dot (bottom). Each lifecycle state is one beat of the manifesto.
//
// This module is imported by BOTH the client-only React island
// (BlackHole.tsx, which renders the live cross-fading overlay) AND
// index.astro at build time (which renders the .scene-stage scroll track and
// the <noscript> SSR fallback). Keeping the timeline + copy here means the
// stage count, the number of scroll stages, and the no-JS fallback copy can
// never drift apart — they all derive from this one array.
//
//  Core mechanic: each beat has TWO big lines and the big line SWAPS on scroll
//  DIRECTION. Scrolling DOWN rewinds time (the hopeful arc: from the black hole
//  at the end, back to the pale blue dot at the beginning); scrolling UP runs
//  time forward (the tragic arc: from one good decision out to the inevitable
//  collapse). The whisper is shared and does NOT swap.
//
//  All copy is real, selectable DOM text (never baked into the canvas) so it
//  stays indexable. Straight quotes only; no em/en dashes, no curly quotes.
// ---------------------------------------------------------------------------
export interface ManifestoBeat {
  /** Scroll-progress centre of the beat (it owns a ~1/6 slot around this). */
  at: number;
  /** The lifecycle state this beat narrates (for the label / a11y). */
  state: string;
  /** Big line shown while scrolling DOWN (rewind / hopeful arc). */
  down: string;
  /** Big line shown while scrolling UP (forward / tragic arc). */
  up: string;
  /** Small dim elaboration. Shared across both directions; never swaps. */
  whisper: string;
}

// Six states on the scroll timeline, black hole at the top and the beginning dot
// near the bottom. The final two copy beats are intentionally delayed so the
// nebula and the tiny beginning star get a silent observation window first.
export const BEATS: ManifestoBeat[] = [
  {
    at: 0.02,
    state: 'black hole',
    down: 'every project ends. eventually.',
    up: 'every project ends. eventually.',
    whisper: 'the part nobody sees is what holds it together.',
  },
  {
    at: 1 / 6,
    state: 'dying star',
    down: 'uncertain. still holding.',
    up: 'and one day it gives way.',
    whisper: 'fast to build. faster to fall apart.',
  },
  {
    at: 2 / 6,
    state: 'red giant',
    down: "bigger isn't the same as lasting.",
    up: 'then it grows faster than anyone can hold.',
    whisper: "the ai keeps adding. nobody's left who understands it.",
  },
  {
    at: 3 / 6,
    state: 'dying star',
    down: 'small enough to doubt.',
    up: 'for a while, it just works.',
    whisper: "the part that's still up at 3am. that's engineering.",
  },
  {
    at: 0.72,
    state: 'nebula',
    down: 'everything starts here.',
    up: "a few more, and it's a real thing.",
    whisper: 'stars are born from what the last one left behind.',
  },
  {
    at: 0.89,
    state: 'beginning',
    down: 'in the beginning.',
    up: 'it starts with one good decision.',
    whisper: "every line you'll ever ship fits on that dot. worth doing properly, then.",
  },
];

// Six lifecycle states divide the scroll track into six full-viewport stages;
// the five morphs run across stage boundaries 0→1 … 4→5. BUILT_STAGES caps the
// lifecycle position so the bottom of the page rests on the final state instead
// of running off the end. Both derive from BEATS so the timeline can never
// disagree with the copy: STAGE_COUNT === the number of beats, and there is one
// fewer morph than there are states.
export const STAGE_COUNT = BEATS.length;
export const BUILT_STAGES = BEATS.length - 1;
