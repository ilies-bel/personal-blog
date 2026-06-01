// ===========================================================================
// visits.ts — minimal returning-visitor counter, stored only in the visitor's
// own browser (localStorage). This is the ONLY thing the blog remembers, and it
// never leaves the device. Used solely so the hero can say "welcome back".
// ===========================================================================

const KEY = 'visits.v1';

interface VisitRecord {
  count: number;
  last: number; // epoch ms
}

/**
 * Returns how many times this person visited BEFORE now, then records this
 * visit. Degrades to 0 (treat as first-time) if storage is unavailable.
 */
export function registerVisit(nowMs: number): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(KEY);
    const prev: VisitRecord = raw ? JSON.parse(raw) : { count: 0, last: 0 };
    const priorVisits = typeof prev.count === 'number' ? prev.count : 0;
    localStorage.setItem(KEY, JSON.stringify({ count: priorVisits + 1, last: nowMs }));
    return priorVisits;
  } catch {
    return 0;
  }
}
