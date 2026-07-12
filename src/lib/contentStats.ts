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

/** Data for the three featured proof cards in the finale section. Computed
 *  server-side at build time from the content collections — titles, summaries,
 *  and slugs always reflect the actual entries, never hand-synced literals. */
export interface FeaturedCardData {
  /** The first active project (lowest `order`, status not 'archived'). */
  flagship: {
    title: string;
    summary: string;
  };
  /** The first investigation-type post (by pubDate, oldest first). */
  investigation: {
    slug: string;
    title: string;
    description: string;
  };
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

/** Derive the featured proof-card data from the collections. Returns the first
 *  active project (by `order`) and the first investigation-type post (by
 *  pubDate, oldest first) — both guaranteed to exist if their collections are
 *  non-empty; the caller falls back to empty strings if not. */
export async function getFeaturedCards(): Promise<FeaturedCardData> {
  const [projects, posts] = await Promise.all([
    getCollection('projects'),
    getCollection('posts', ({ data }) => !data.draft && data.type === 'investigation'),
  ]);

  const active = projects
    .filter((p) => p.data.status !== 'archived')
    .sort((a, b) => a.data.order - b.data.order);

  const investigations = posts.sort(
    (a, b) => a.data.pubDate.getTime() - b.data.pubDate.getTime(),
  );

  const flagship = active[0];
  const investigation = investigations[0];

  return {
    flagship: flagship
      ? { title: flagship.data.title, summary: flagship.data.summary }
      : { title: '', summary: '' },
    investigation: investigation
      ? {
          slug: investigation.id,
          title: investigation.data.title,
          description: investigation.data.description,
        }
      : { slug: '', title: '', description: '' },
  };
}

/** The validated home-feature proof (PRD-003) consumed by the hero's single
 *  yellow-star Projects marker AND the SSR no-JS/no-WebGL fallback. Every field
 *  is derived from the featured project's own content entry — never a scene
 *  literal — so the marker's facts and destination can never drift from the
 *  catalogue. `null` means no project opted in (the marker keeps its generic
 *  Projects copy). */
export interface HeroProofData {
  /** Collection id of the featured project (also the article fragment target). */
  id: string;
  /** The project's real name (its frontmatter title), for the marker headline. */
  name: string;
  /** One concise factual proof line (heroProof.summary). */
  summary: string;
  /** Approved short signal chips (heroProof.signals). */
  signals: readonly string[];
  /** npm PACKAGE NAME, when the entry publishes one (links.npm). */
  npm?: string;
  /** Public source URL, when the entry publishes one (links.github). */
  github?: string;
  /** Base-relative href with the catalogue fragment, e.g. 'projects#fleet'.
   *  Projects remains the route identity; the fragment lands on the entry's
   *  <article id={id}> (CaseStudy.astro), which the build guarantees exists. */
  href: string;
  /** The bare '#<id>' fragment, for callers that already own the /projects path. */
  fragment: string;
}

/** Derive the single validated home-feature proof from the projects collection.
 *
 *  The contract, enforced here at build time (a breach throws and FAILS THE
 *  BUILD rather than silently reverting to stale generic marker text):
 *   - AT MOST ONE project may set heroProof.feature — two is an authoring error.
 *   - the featured project must be public ('shipped') and carry every proof
 *     field (the schema already guarantees summary + ≥1 signal on any heroProof;
 *     the 'shipped' gate is enforced by projectSchema.superRefine).
 *   - the fragment is derived from the collection id, so it always matches the
 *     rendered <article id> and can never point at a dead anchor.
 *
 *  Returns null when no project opts in — the caller then leaves the marker's
 *  existing generic Projects copy untouched. */
export async function getFeaturedProof(): Promise<HeroProofData | null> {
  const projects = await getCollection('projects');
  const featured = projects.filter((p) => p.data.heroProof?.feature === true);

  if (featured.length === 0) return null;
  if (featured.length > 1) {
    const ids = featured.map((p) => p.id).join(', ');
    throw new Error(
      `Home feature contract: at most one project may set heroProof.feature, ` +
        `but ${featured.length} do (${ids}). Feature exactly one, or none.`,
    );
  }

  const entry = featured[0];
  const proof = entry.data.heroProof;
  // Defensive: the schema guarantees these, but a null proof here would be a
  // silent regression — fail loudly instead.
  if (!proof) {
    throw new Error(`Featured project "${entry.id}" lost its heroProof after filtering.`);
  }

  return {
    id: entry.id,
    name: entry.data.title,
    summary: proof.summary,
    signals: proof.signals,
    npm: entry.data.links?.npm,
    github: entry.data.links?.github,
    href: `projects#${entry.id}`,
    fragment: `#${entry.id}`,
  };
}
