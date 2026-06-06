// ===========================================================================
// beats.ts — copy timing for the forward stellar-lifecycle hero.
//
// The scroll is one continuous normalized cinematic: nebula gathers → yellow
// star → red giant → collapse → supernova → black hole → portfolio lure.
// Text is deliberately sparse and appears only during stable states; the camera
// is free to move during collapse/release without asking the visitor to read.
//
// All copy is real, selectable DOM text (never baked into the canvas) so it
// stays indexable. Straight quotes only; no em/en dashes, no curly quotes.
// ---------------------------------------------------------------------------
export interface ManifestoBeat {
  /** Scroll-progress centre of the beat (it owns a ~1/6 slot around this). */
  at: number;
  /** Explicit scroll band for the live overlay copy. */
  text: {
    inStart: number;
    inEnd: number;
    outStart: number;
    outEnd: number;
  };
  /** The lifecycle state this beat narrates (for the label / a11y). */
  state: string;
  /** Primary line. `up` is kept for the existing crossfade component API. */
  down: string;
  up: string;
  /** Small dim elaboration. Shared across both directions; never swaps. */
  whisper: string;
}

export const BEATS: ManifestoBeat[] = [
  {
    at: 0.09,
    text: { inStart: 0.035, inEnd: 0.055, outStart: 0.125, outEnd: 0.155 },
    state: 'nebula',
    down: 'everything starts here.',
    up: 'everything starts here.',
    whisper: 'dust, pressure, and the patience to let shape appear.',
  },
  {
    at: 0.255,
    // The yellow star now ignites by ~0.22 and dwells in a nearly-flat
    // contemplation hold through ~0.30 (see legacyStageForProgress), so the
    // headline holds a touch longer (outStart 0.275 -> 0.285) to sit deeper in
    // that stable window before easing out by 0.300 (red beat starts at 0.460).
    text: { inStart: 0.210, inEnd: 0.235, outStart: 0.285, outEnd: 0.300 },
    state: 'yellow star',
    down: 'small enough to doubt.',
    up: 'small enough to doubt.',
    whisper: "the part that's still up at 3am. that's engineering.",
  },
  {
    at: 0.54,
    text: { inStart: 0.460, inEnd: 0.500, outStart: 0.580, outEnd: 0.620 },
    state: 'red giant',
    down: "bigger isn't the same as lasting.",
    up: "bigger isn't the same as lasting.",
    whisper: "the ai keeps adding. nobody's left who understands it.",
  },
  {
    at: 0.965,
    // Enters at 0.950 (was 0.940) so the headline appears AFTER the easeOutExpo
    // settle onto the black hole has visually completed (0.80–0.94), not during its
    // decelerating tail — the frame is locked and magnetic before the copy reads.
    text: { inStart: 0.950, inEnd: 0.962, outStart: 0.992, outEnd: 1.000 },
    state: 'black hole',
    down: 'what survives has gravity.',
    up: 'what survives has gravity.',
    whisper: 'selected work begins at the edge of the collapse.',
  },
];

// The copy and the scroll distance are separate on purpose: the lifecycle needs a
// long physical runway, while headlines should be sparse.
export const SCROLL_SECTION_COUNT = 6;
export const STAGE_COUNT = SCROLL_SECTION_COUNT;
export const BUILT_STAGES = 3.5;
