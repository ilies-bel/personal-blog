// The public route inventory the E2E suites sweep. Kept as an explicit list
// (not a dist glob) so test collection never depends on a build existing
// before the webServer step runs. When a route is added or removed, update
// this list — the smoke suite failing on a 404 is the reminder.
export const CONTENT_ROUTES = [
  '/projects',
  '/writing',
  '/graveyard',
  '/behind-the-build',
  '/about',
  '/contact',
  '/posts/memory-leak-search-and-destroy',
  '/posts/thanks-for-scrolling-to-the-bottom',
] as const;

export const ALL_ROUTES = ['/', ...CONTENT_ROUTES] as const;

/** Mobile widths from the roadmap's viewport matrix. */
export const MOBILE_WIDTHS = [320, 360, 375, 390, 412, 430] as const;
