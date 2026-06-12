// Small URL helpers shared across the hero island.

/**
 * Join the site base (`import.meta.env.BASE_URL`) with a base-relative asset or
 * page path, collapsing any double slashes so the result resolves cleanly under
 * the site's base path (e.g. the GitHub Pages `/personal-blog/` prefix).
 */
export function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}
