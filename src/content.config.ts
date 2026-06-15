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

export const collections = { posts };
