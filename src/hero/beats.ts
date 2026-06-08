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
//
// The beats themselves are now colocated per scene in sceneTable.ts (SCENES);
// BEATS is the projection SCENES.flatMap(s => s.beat). They are re-exported here
// so the existing import paths ('../beats') resolve UNCHANGED, and the SSR
// <noscript> (which maps over BEATS) can never drift from the live copy.
// ---------------------------------------------------------------------------
export { BEATS } from './sceneTable';
export type { ManifestoBeat } from './sceneTable';

// The copy and the scroll distance are separate on purpose: the lifecycle needs a
// long physical runway, while headlines should be sparse.
export const SCROLL_SECTION_COUNT = 6;
export const STAGE_COUNT = SCROLL_SECTION_COUNT;
export const BUILT_STAGES = 3.5;
