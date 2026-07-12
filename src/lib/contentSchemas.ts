// Content-collection zod schemas, extracted from src/content.config.ts so the
// unit suite can import and exercise them directly (test/content-schemas.test.mjs
// — pure erasable TS + `astro/zod`, no `astro:content` virtual module, so node's
// type-stripping import works exactly like test/gl-governor.test.mjs).
//
// THE EVIDENCE CONTRACT (the point of this module): a project may not state a
// claim about the world ("it has users", "it is in production") without either
// attached evidence or an explicit, machine-visible admission that the evidence
// is still owed (`draftEvidence: true`). A claim whose evidence.type is 'none'
// while draftEvidence is false FAILS THE BUILD, naming the offending claim — so
// unevidenced copy can never ship silently. Subjective voice ("the most
// ambitious thing I have built") needs no claim entry; only factual assertions do.
import { z } from 'astro/zod';

// WHY NOT the astro:content image() helper: Astro's content layer resolves
// image() frontmatter through a generated .astro/content-assets.mjs that
// STATICALLY IMPORTS every referenced original — Vite then emits the raw
// source files into dist (measured: heydaniel.png 679KB + keywordlens.png
// 509KB + fleet.png 151KB of dead, unreferenced weight), which fails the P5
// asset-size gate (scripts/check-asset-sizes.mjs, 500KB hard cap) that exists
// precisely to keep raw originals out of dist. So the schema validates a
// strict asset FILENAME instead, and the pages resolve it through
// import.meta.glob + <Picture> — the P5-proven pattern under which only the
// transformed AVIF/WebP rungs ship. A typo'd filename still fails the build:
// the shape is rejected here, and a missing file throws in the page's glob
// resolver during prerender.
const assetFilename = z
  .string()
  .regex(
    /^[\w][\w.-]*\.(png|jpe?g|webp|avif)$/,
    'must be a bare raster filename (e.g. "fleet.png") living in the page\'s src/assets/<section>/ folder',
  );

/** How a claim is backed. 'none' is allowed to exist ONLY under draftEvidence. */
export const EVIDENCE_TYPES = ['metric', 'testimonial', 'link', 'screenshot', 'none'] as const;

export const claimSchema = z.object({
  /** The factual statement being made on the page, verbatim or near-verbatim. */
  statement: z.string().min(1),
  evidence: z.object({
    type: z.enum(EVIDENCE_TYPES),
    /** Where the evidence lives (a metric name, who said it, a link label…). */
    source: z.string().optional(),
    url: z.string().url().optional(),
    /** When the evidence was captured — evidence goes stale; date it. */
    date: z.string().optional(),
  }),
});

export const projectSchema = z
  .object({
    title: z.string(),
    /** Lifecycle status. 'private' = delivered to a client but not public. */
    status: z.enum(['shipped', 'private', 'archived']),
    /** Display order on /projects (ascending). Ties break on filename id. */
    order: z.number().int().nonnegative().default(0),
    role: z.string(),
    stack: z.array(z.string()).min(1),
    period: z.string().optional(),
    summary: z.string(),
    links: z
      .object({
        github: z.string().url().optional(),
        /** npm PACKAGE NAME (e.g. '@scope/pkg'), not a URL. */
        npm: z.string().optional(),
        site: z.string().url().optional(),
      })
      .optional(),
    /** Shown under the title for entries without public links. */
    privateNote: z.string().optional(),
    /** Meta-row display string for Status (e.g. 'Open source · shipped'). */
    statusLabel: z.string(),
    /** The figure column: a real screenshot (filename under
     *  src/assets/projects/, resolved via the page's import.meta.glob), or a
     *  named hand-authored diagram component (see the DIAGRAMS registry in
     *  src/pages/projects.astro). */
    media: z
      .discriminatedUnion('kind', [
        z.object({
          kind: z.literal('image'),
          image: assetFilename,
          alt: z.string(),
          caption: z.string(),
        }),
        z.object({
          kind: z.literal('diagram'),
          diagram: z.enum(['mars-topology']),
          caption: z.string(),
        }),
      ])
      .optional(),
    /** Factual assertions made in the page copy, each with its backing. */
    claims: z.array(claimSchema).default([]),
    /** Approaches considered and dropped — honest engineering record. */
    rejectedPaths: z.array(z.string()).default([]),
    /** What the project does NOT do well. Required (≥1) once shipped. */
    limitations: z.array(z.string()).default([]),
    currentStatus: z.string().optional(),
    /** HOME FEATURE PROOF (PRD-003) — the narrow, validated projection that lets
     *  the hero's single yellow-star Projects marker feature ONE shipped project
     *  by name without hand-copying facts into sceneTable/StarMarker/CSS. Only a
     *  project that opts in with `feature: true` is eligible; the featured
     *  selection (and the "at most one public feature" invariant) is enforced by
     *  getFeaturedProof() in contentStats.ts, which reads the whole collection.
     *  The proof consumed by the hero is derived from THIS block plus the entry's
     *  own title/status/links + collection-id-derived '#<id>' fragment — never a
     *  scene literal — so evidence integrity survives content edits. */
    heroProof: z
      .object({
        /** Opt-in eligibility for the single public home feature. */
        feature: z.boolean().default(false),
        /** One concise, factual proof line for the marker card (e.g. the
         *  project's parallel-local-branch purpose). Kept short for the card. */
        summary: z.string().min(1).max(120),
        /** Approved short signal chips (e.g. 'Open source', 'Shipped'). Facts
         *  only — no adoption/metric claim that the entry cannot back. */
        signals: z.array(z.string().min(1)).min(1).max(4),
      })
      .optional(),
    /** Explicit debt flag: claims may carry evidence.type 'none' ONLY while
     *  this is true. Flipping it false with unevidenced claims fails the build. */
    draftEvidence: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // A project may only feature itself on the home page if it is PUBLIC —
    // a private/archived entry has no public /projects#<id> to land on.
    if (data.heroProof?.feature && data.status !== 'shipped') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heroProof', 'feature'],
        message: `Only a 'shipped' project may set heroProof.feature ("${data.title}" is '${data.status}'). The home feature must land on a public /projects#<id>.`,
      });
    }
    if (!data.draftEvidence) {
      for (const [i, claim] of data.claims.entries()) {
        if (claim.evidence.type === 'none') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['claims', i, 'evidence', 'type'],
            message:
              `Unevidenced claim: "${claim.statement}" has evidence.type 'none' ` +
              `and draftEvidence is false. Attach evidence (metric/testimonial/link/` +
              `screenshot) or set draftEvidence: true to flag the debt explicitly.`,
          });
        }
      }
    }
    if (data.status === 'shipped' && data.limitations.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitations'],
        message: `A shipped project must name at least one limitation ("${data.title}" has none). Honest ledgers list what does not hold.`,
      });
    }
  });

export const graveyardSchema = z.object({
  name: z.string(),
  link: z.object({ href: z.string().url(), label: z.string() }),
  /** src: filename under src/assets/graveyard/, resolved by the page's glob. */
  image: z.object({ src: assetFilename, alt: z.string(), caption: z.string() }),
  /** Year of death / abandonment (mono-caps drawer label). */
  interred: z.string(),
  /** Short cause-of-death tag (mono-caps drawer label). */
  cause: z.string(),
  /** What I believed going in — the bet, stated so the miss is auditable. */
  hypothesis: z.string().optional(),
  /** Signals that were visible before the end, in hindsight. */
  warningSigns: z.array(z.string()).default([]),
  /** The one-line "what it taught me" — rendered last, always present. */
  lesson: z.string(),
  /** What survived the death (code, habit, insight still in use). */
  survivingInsight: z.string().optional(),
});
