import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog posts live in src/content/posts/*.mdx
// The frontmatter schema below is validated at build time AND feeds the SEO
// metadata (title/description/dates) and JSON-LD structured data.
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // Relative to /public, e.g. "og-mypost.png". Optional; falls back to default.
    ogImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // Editorial classification — readers use this to orient at a glance.
    // Required on every post: forces explicit classification at authoring time.
    //   investigation — a live debugging or research case study ("I found X and here is how")
    //   build-note    — construction diary / technical decisions behind a shipped thing
    //   essay         — reflection, philosophy, or long-form argument
    //   failure       — a project or approach that didn't survive; kept and owned
    type: z.enum(['investigation', 'build-note', 'essay', 'failure']),
    // Subject-matter facets exposed on the writing index for orientation.
    // Distinct from tags (which are legacy / SEO-facing): topics are the handful
    // of concepts a reader would use to decide "is this for me?"
    topics: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Optional per-post backdrop override. When set, the post layout swaps the
    // default dimmed live <BlackHole backdrop> photon-ring scene for a bespoke
    // backdrop layer. 'tesseract' = the Interstellar bookcase-corridor image
    // backdrop (see TesseractBackdrop.astro). Unset = the default BlackHole scene.
    //
    // BACK-COMPAT: this top-level `backdrop` is the LEGACY field. New posts should
    // use the richer `scene` block below; `scene.backdrop: 'tesseract'` is
    // equivalent. The layout reads `scene` first and falls back to this, so the
    // existing INSPIRATION/01 post needs no migration.
    backdrop: z.enum(['tesseract']).optional(),
    // ART-DIRECTION: per-post scene journey. Opt-in — unset leaves today's frozen,
    // dimmed black-hole backdrop (a safe default; no existing post regresses). When
    // `journey` is set, the post layout drives the SAME hero engine's getStage()
    // from ARTICLE scroll instead of pinning it to a constant, so reading the post
    // scrubs the live stellar lifecycle through the window [from, to] in getStage
    // transition-space (0 = black hole … 3.5 = nebula). This single seam is what
    // turns the frozen wallpaper into a scripted scene journey — see ArticleScene.tsx.
    scene: z
      .object({
        // The lifecycle window the article scrubs through, [from, to]. e.g.
        // [3.5, 0] reads nebula → black hole as the essay "condenses" inward.
        journey: z.tuple([z.number(), z.number()]).optional(),
        // Which backdrop layer to mount. 'scene' = the live black-hole engine
        // (default); 'tesseract' = the bookcase corridor (legacy parity).
        backdrop: z.enum(['scene', 'tesseract']).default('scene'),
      })
      .optional(),
  }),
});

// ---------------------------------------------------------------------------
// Projects — shipped tools and products (CON-001 evidence schema).
// All evidence fields are optional so missing data is explicit, never invented.
// ---------------------------------------------------------------------------
const projects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
  schema: z.object({
    // Display identity
    name: z.string(),
    order: z.number().default(0),
    isPrivate: z.boolean().default(false),
    privateNote: z.string().optional(),

    // External links (github, npm, live demo, etc.)
    links: z
      .array(
        z.object({
          href: z.string(),
          label: z.string(),
          type: z.enum(['github', 'npm', 'live', 'other']),
        }),
      )
      .optional(),
    npmPackage: z.string().optional(),

    // CON-001 evidence fields — all optional; absent = evidence not yet captured.
    problem: z.string().optional(),
    role: z.string().optional(),
    team: z.string().optional(),
    stack: z.string().optional(),
    constraints: z.string().optional(),
    decisiveChoice: z.string().optional(),
    rejectedPath: z.string().optional(),
    outcome: z
      .object({
        summary: z.string(),
        baseline: z.string().optional(),
        source: z.string().optional(),
      })
      .optional(),
    proofLinks: z.array(z.string()).optional(),
    status: z.string().optional(),
    limitation: z.string().optional(),

    // Figure — screenshot or the topology-svg (Mars-specific inline SVG)
    figureType: z.enum(['screenshot', 'topology-svg']),
    figure: z.object({
      src: z.string().optional(), // relative to /public (screenshot only)
      alt: z.string(),
      caption: z.string(),
    }),

    // Body copy and optional proof/note callout
    body: z.array(z.string()),
    proofStatement: z.string().optional(),
    proofLabel: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Graveyard — projects that didn't survive.
// Evidence fields aligned with CON-001 spirit; all optional.
// ---------------------------------------------------------------------------
const graveyard = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/graveyard' }),
  schema: z.object({
    // Display identity
    name: z.string(),
    order: z.number().default(0),

    // Link to the (often still-alive) domain
    link: z.object({
      href: z.string(),
      label: z.string(),
    }),

    // Specimen image
    image: z.object({
      src: z.string(), // relative to /public (source raster; rendering uses the
                       // optimised opt/graveyard/<id>-<w> variants from PERF-006)
      alt: z.string(),
      caption: z.string(),
      // Intrinsic size of the 768-wide optimised fallback, carried so the <img>
      // can reserve space and prevent CLS (PERF-006). Optional: entries without
      // a generated raster simply omit the reservation.
      width: z.number().optional(),
      height: z.number().optional(),
    }),

    // Death certificate fields — these are required; they're what make a specimen
    interred: z.string(), // year of death / abandonment
    cause: z.string(),   // short mono-caps cause-of-death tag

    // Evidence-aligned optional fields (not yet filled; kept explicit)
    premise: z.string().optional(),        // the original hypothesis
    warningSign: z.string().optional(),    // what should have been spotted earlier
    causeOfDeath: z.string().optional(),   // longer form than `cause`
    survivingInsight: z.string().optional(), // what's still valuable
    artifact: z.string().optional(),       // link to any remaining public artifact

    // Status classification (private / redacted / public)
    status: z.string().optional(),

    // Body paragraphs and the lesson
    body: z.array(z.string()),
    lesson: z.string(),
  }),
});

export const collections = { posts, projects, graveyard };
