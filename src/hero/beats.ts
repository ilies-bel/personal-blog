// ===========================================================================
// beats.ts — copy timing for the stellar-lifecycle hero.
//
// The scroll is one continuous normalized cinematic: a lone pale blue dot blooms
// into a nebula → yellow star → red giant → collapse → supernova → black hole →
// portfolio lure. The big lines are direction-aware: scroll down reads the
// current forward lifecycle; scroll up carries the future reverse arc.
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
    // PALE BLUE DOT — the opening speck (stage ~4.7 at the very top). Copy is
    // fully visible immediately, then fades out before the dot blooms into the
    // nebula. Dot hold is now 0.00 -> 0.055, so the fade-out starts at 0.06.
    at: 0.025,
    text: { inStart: 0.0, inEnd: 0.0, outStart: 0.06, outEnd: 0.09 },
    state: 'pale blue dot',
    down: 'I build software that stays understandable.',
    up: 'I build software that stays understandable.',
    whisper: 'understandable is a choice you make on purpose.',
  },
  {
    // NEBULA — after the longer lightspeed approach, the cloud grows into the held
    // frame. NEBULA_GROW_END is now 0.195; collapse starts at 0.33. The text fades
    // in as the cloud settles (~0.195) and out well before collapse (~0.28).
    at: 0.21,
    text: { inStart: 0.185, inEnd: 0.205, outStart: 0.265, outEnd: 0.295 },
    state: 'nebula',
    down: 'One boundary can outlive a thousand generated lines.',
    up: 'One boundary can outlive a thousand generated lines.',
    whisper: 'prompts, diffs, failing tests, half-ideas. raw material, not magic.',
  },
  {
    // YELLOW STAR — ignites by ~0.33 (STAR_IGNITION_START) and dwells through ~0.395
    // (YELLOW_SETTLE_END). The headline sits in the stable window. RED_HOLD_START is
    // now 0.524, so the copy fades out well before the red growth begins.
    at: 0.355,
    text: { inStart: 0.31, inEnd: 0.335, outStart: 0.375, outEnd: 0.395 },
    state: 'yellow star',
    down: 'Systems grow. Interfaces drift. Complexity compounds.',
    up: 'Systems grow. Interfaces drift. Complexity compounds.',
    whisper: "tests, review, small units, boring choices. that's the craft.",
  },
  {
    // RED GIANT — the hold band (stage 2.05, progress ~0.524 -> 0.678 with widened holds).
    at: 0.601,
    text: { inStart: 0.524, inEnd: 0.562, outStart: 0.638, outEnd: 0.676 },
    state: 'red giant',
    down: 'My work is to keep the center readable.',
    up: 'My work is to keep the center readable.',
    whisper: "the ai keeps adding. nobody's left who understands it.",
  },
  {
    // BLACK HOLE — enters after the easeOutExpo settle has visually completed
    // (~0.82 -> 0.946), so the frame is locked and magnetic before the copy reads.
    // This is the terminal state, so the line holds through progress=1 instead
    // of fading away at the absolute bottom.
    at: 0.968,
    text: { inStart: 0.955, inEnd: 0.965, outStart: 1.02, outEnd: 1.02 },
    state: 'black hole',
    down: 'Explore the projects.',
    up: 'Explore the projects.',
    whisper: 'even the repo you were proud of.',
  },
];

// The copy and the scroll distance are separate on purpose: the lifecycle needs a
// long physical runway, while headlines should be sparse.
export const SCROLL_SECTION_COUNT = 6;
export const STAGE_COUNT = SCROLL_SECTION_COUNT;
export const BUILT_STAGES = 3.5;
