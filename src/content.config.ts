import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema, graveyardSchema } from './lib/contentSchemas';
import { AUTHOR_NAME } from './consts';

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
    draft: z.boolean().default(false),
    // FORMALIZED CO-AUTHORSHIP (P6): every author of the piece, site owner
    // included. Flows into the BlogPosting JSON-LD author array (BaseHead) and
    // the visible byline on the article page when there is more than one name.
    authors: z.array(z.string()).min(1).default([AUTHOR_NAME]),
    // Where the piece first ran, when that was elsewhere. Replaces the old
    // hardcoded `origins` map in writing.astro — one source of truth, in data.
    provenance: z
      .object({
        note: z.string(),
        url: z.string().url().optional(),
      })
      .optional(),
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

// Shipped / delivered work — src/content/projects/*.mdx. The schema (see
// src/lib/contentSchemas.ts) ENFORCES the evidence contract at build time:
// any factual claim with evidence.type 'none' while draftEvidence is false
// fails the build naming the claim, and a shipped project must list at least
// one limitation. The MDX body carries the entry's running copy; the figure
// (screenshot filename or diagram name) is declared in frontmatter `media`.
// (Screenshots are validated filenames, NOT the image() helper — see the
// dist-weight rationale at the top of contentSchemas.ts.)
const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: projectSchema,
});

// Dead projects — src/content/graveyard/*.mdx. MDX (not yaml/json) on purpose:
// the specimens' prose is long-form and will grow richer in P13; the loader and
// body handling stay consistent with `posts`. Frontmatter carries the specimen
// record (interred/cause/lesson/…); the body carries the story paragraphs.
const graveyard = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/graveyard' }),
  schema: graveyardSchema,
});

export const collections = { posts, projects, graveyard };
