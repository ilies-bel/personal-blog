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
    // nebula (~0.075). Sits inside the dot hold (progress 0.00 -> 0.04) so the
    // line reads on the still point.
    at: 0.02,
    text: { inStart: 0.0, inEnd: 0.0, outStart: 0.05, outEnd: 0.075 },
    state: 'pale blue dot',
    down: 'it starts with one decision worth keeping.',
    up: 'start with one decision worth keeping.',
    whisper: 'one good boundary can outlive a thousand generated lines.',
  },
  {
    // NEBULA — the dispersed cloud hold (stage ~3.5 -> 3.42, progress ~0.10 -> 0.154).
    at: 0.155,
    text: { inStart: 0.115, inEnd: 0.135, outStart: 0.205, outEnd: 0.235 },
    state: 'nebula',
    down: 'then the dust becomes a system.',
    up: 'shape the dust first.',
    whisper: 'prompts, diffs, failing tests, half-ideas. raw material, not magic.',
  },
  {
    // YELLOW STAR — ignites by ~0.316 and dwells in the nearly-flat contemplation
    // hold through ~0.37 (see legacyStageForProgress), so the headline sits in that
    // stable window before easing out ahead of the red beat (starts at 0.514).
    at: 0.33,
    text: { inStart: 0.29, inEnd: 0.315, outStart: 0.355, outEnd: 0.375 },
    state: 'yellow star',
    down: 'for a while, it burns clean.',
    up: 'make it boring enough to burn.',
    whisper: "tests, review, small units, boring choices. that's the craft.",
  },
  {
    // RED GIANT — the hold band (stage 2.05, progress ~0.514 -> 0.658).
    at: 0.586,
    text: { inStart: 0.514, inEnd: 0.55, outStart: 0.62, outEnd: 0.66 },
    state: 'red giant',
    down: 'then the codebase starts expanding.',
    up: "bigger isn't the same as lasting.",
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
    down: 'every project ends. eventually.',
    up: 'every project ends. eventually.',
    whisper: 'even the repo you were proud of.',
  },
];

// The copy and the scroll distance are separate on purpose: the lifecycle needs a
// long physical runway, while headlines should be sparse.
export const SCROLL_SECTION_COUNT = 6;
export const STAGE_COUNT = SCROLL_SECTION_COUNT;
export const BUILT_STAGES = 3.5;
