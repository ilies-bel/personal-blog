// Derived site counts (P6) — SERVER-ONLY (imports the `astro:content` virtual
// module, so it can only run inside Astro frontmatter / server modules). Every
// count shown anywhere on the site comes THROUGH here, from the collections
// themselves — never a hand-written literal:
//   • the FinaleLedger notes on '/' (index.astro passes getCounts() into the
//     BlackHole island as a serialized prop),
//   • the "one engine, N shaders" prose on /writing and /behind-the-build.
// Adding a project, burying another product, or documenting a tenth shader
// updates every count on the next build, with nothing to remember.
import { getCollection } from 'astro:content';
import { HUD_NAV_ITEMS } from '../hero/sceneTable';
import { SHADERS } from './shaderCatalog';

export interface SiteCounts {
  /** Delivered work on /projects: status 'shipped' OR 'private' (a private
   *  B2B product is shipped work — it just has no public link). 'archived'
   *  entries would drop out of this count. Matches the /projects page, which
   *  lists exactly these entries. */
  shipped: number;
  /** Specimens in the graveyard. */
  dead: number;
  /** Published articles — excludes drafts AND the site-meta Inspiration essay,
   *  the same filter /writing applies to its Articles shelf. */
  posts: number;
  /** Documented shaders — SHADERS.length from the shared catalog, the same
   *  array behind-the-build renders as its gallery (see shaderCatalog.ts for
   *  why this is NOT a file glob). */
  shaders: number;
}

export async function getCounts(): Promise<SiteCounts> {
  // The Inspiration essay lives in the posts collection but reads as site meta —
  // /writing excludes it from the Articles shelf, so the posts count must too.
  // Its id derives from the hero's own black-hole nav row, the same source of
  // truth writing.astro uses, so a slug change can't strand this filter.
  const inspirationHref = HUD_NAV_ITEMS.find((item) => item.id === 'end')?.href ?? '';
  const inspirationId = inspirationHref.replace(/^posts\//, '');

  const [projects, graveyard, posts] = await Promise.all([
    getCollection('projects'),
    getCollection('graveyard'),
    getCollection('posts', ({ data }) => !data.draft),
  ]);

  return {
    shipped: projects.filter((p) => p.data.status !== 'archived').length,
    dead: graveyard.length,
    posts: posts.filter((post) => post.id !== inspirationId).length,
    shaders: SHADERS.length,
  };
}
