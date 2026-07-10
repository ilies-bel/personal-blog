/** Minimal entry record for a shipped project.
 *  index.astro imports this array to derive the finaleCounts.projectCount
 *  passed down to FinaleLedger — the count is never hardcoded.
 *  Keep in sync with the article blocks in src/pages/projects.astro. */
export interface ProjectEntry {
  readonly id: string;
  readonly name: string;
}

/** The canonical list of shipped projects.
 *  Adding or removing an entry here automatically updates the finale counter
 *  and any other count derived from this array. */
export const PROJECTS: readonly ProjectEntry[] = [
  { id: 'fleet', name: 'Fleet' },
  { id: 'mars', name: 'Mars' },
] as const;
