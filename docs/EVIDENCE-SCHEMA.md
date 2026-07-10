# Evidence schema — the claims-need-proof contract

Every factual claim a project page makes is data, validated at build time.
The zod schemas live in `src/lib/contentSchemas.ts` (imported by
`src/content.config.ts`); this doc records the contract and the workflow.

## The contract

```
projects collection (src/content/projects/*.mdx)
├─ status: 'shipped' | 'private' | 'archived'
├─ claims: [{ statement, evidence: { type, source?, url?, date? } }]
│    evidence.type ∈ metric | testimonial | link | screenshot | none
├─ limitations: string[]        — ≥1 REQUIRED when status is 'shipped'
├─ rejectedPaths, currentStatus — honesty fields rendered by the case-study
│                                 layout when present (P13)
└─ draftEvidence: boolean       — the escape hatch, default false
```

**Build rule (superRefine):** any claim whose `evidence.type` is `'none'`
fails the build — naming the claim verbatim — unless the entry sets
`draftEvidence: true`. Subjective voice ("the most ambitious thing I've
built") is not a claim and needs no entry; verifiable assertions ("has
users", "in production use") are claims and do.

The graveyard collection mirrors the honesty structure per specimen:
`interred`, `cause`, `hypothesis?`, `warningSigns?`, `lesson`,
`survivingInsight?`.

## Why build-time

Unsupported "adoption" / "in use" copy was the roadmap's core content
finding. Enforcing it in the schema means unevidenced claims are impossible
to ship silently: they either carry visible hedged wording + a greppable
`draftEvidence: true` flag, or the build fails. Counts shown anywhere on the
site (finale ledger, "N shaders" prose) are likewise derived from
collections/catalogs (`src/lib/contentStats.ts`, `src/lib/shaderCatalog.ts`),
never hand-written.

## Workflow to retire evidence debt

1. Owner supplies proof (see `docs/INPUTS-NEEDED.md` #2/#3/#5).
2. Replace the claim's `evidence: { type: 'none' }` with the real
   `metric`/`testimonial`/`link`/`screenshot` entry (source + date).
3. Remove `draftEvidence: true`; restore un-hedged wording if warranted.
4. The case-study layout (P13) renders evidence adjacent to each claim.

Current debt: `fleet.mdx` (adoption), `mars.mdx` (production use) — both
flagged, both hedged in copy.

## Proven failure mode

Flipping `draftEvidence` to `false` on mars.mdx produced:

```
[InvalidContentEntryDataError] … Unevidenced claim: "Mars is in production
use with its client."
```

(quoted from the P6 verification run — the gate works.)
