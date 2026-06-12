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
    backdrop: z.enum(['tesseract']).optional(),
  }),
});

export const collections = { posts };
