// Pure text helpers for the derived-count copy (P6). Split from contentStats.ts
// on purpose: contentStats imports the `astro:content` virtual module, which
// only exists inside an Astro build — these helpers are plain functions needed
// BOTH there and in the client-side FinaleLedger, and unit-tested directly by
// test/content-stats.test.mjs via node's type-stripping import.

/** Small counts read better spelled out in prose ("nine shaders", never "9
 *  shaders"). One–twelve are worded; anything larger falls back to digits. */
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
] as const;

export function numberToWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/** The GRAVEYARD ledger note. "both honest" only means anything when there are
 *  exactly two specimens — the wording is a function of the count so a third
 *  interment can never leave a stale "both" on the finale. */
export function graveyardNote(dead: number): string {
  if (dead === 2) return '2 dead, both honest';
  if (dead === 1) return '1 dead, honest';
  return `${dead} dead, all honest`;
}

/** The PROJECTS ledger note. */
export function projectsNote(shipped: number): string {
  return `${shipped} shipped`;
}
