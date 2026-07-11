# Proxy-jury protocol — 9-person blind scoring

Owner-run validation (INPUTS-NEEDED #8). This simulates the Awwwards jury
before the real one sees the site. The internal gates in
`docs/roadmaps/acceptance-gates.md` hang on these numbers: **overall ≥8.25
(SOTD-ready), ≥8.5 (SOTM-ready), with Design ≥8.2 / Usability ≥8.0 /
Creativity ≥8.8 / Content ≥8.2 and every route ≥8.0 on both desktop and
mobile.**

## Panel

Nine people, three per lens, none of whom worked on the site or have seen
it in progress:

- **3 × design** — working visual/interaction designers (agency or product).
- **3 × dev** — front-end engineers who can open DevTools without prompting.
- **3 × client** — people who commission/buy work: PMs, founders,
  hiring managers. They stand in for the non-specialist juror.

Blind rules: participants are NOT told the site's owner, the award goal, or
which scores would "pass". Send only the URL and the scoring form. No
walkthrough, no context. Desktop AND their own phone, own network. Ask for
~20 minutes: free exploration first, then the form.

## Calibration (do this before scoring the site)

Each juror first scores **two current Awwwards SOTD winners** (pick two from
awwwards.com/websites/sites_of_the_day/ from the last 30 days — same two for
all nine jurors) on the same form. This anchors what "8" feels like: SOTD
winners typically land 6.5–7.5 on jury averages. If a juror's calibration
scores run >1.5 above or below the panel median, weight their site scores
accordingly (note it, don't silently drop them). The site's scores are only
meaningful RELATIVE to the same juror's calibration scores — report both.

## Scoring form (Awwwards weights: Design 40 / Usability 30 / Creativity 20 / Content 10)

Each dimension 1–10, one decimal allowed. Give jurors the observable anchors
— they score against behaviors, not vibes:

**Design (40%)** — visual craft, typography, composition, art direction
coherence.
- 6: competent, template-adjacent; 8: distinctive system, every route
  clearly the same designed world, typography deliberate at all sizes;
- 10: nothing to remove — every pixel argues for the concept.
- Anchor checks: do the six lifecycle states feel like ONE piece? Does each
  route (Work/Writing/Graveyard/Behind the Build/About/Contact) keep its own
  physical law without breaking the family? Grayscale test: does hierarchy
  survive with color removed?

**Usability (30%)** — can anyone use it, immediately, on anything.
- 6: usable with patience; 8: primary nav obvious in ≤5s, no dead ends,
  loader honest and skippable, mobile one-handed, back button sane;
- 10: degraded modes (no JS, reduced motion, slow network) feel designed,
  not tolerated.
- Anchor checks: reach Work in 15s? Contact in 30s? Does scrolling ever
  trap you? Does anything move that you can't stop?

**Creativity (20%)** — originality of concept and its execution depth.
- 6: a nice twist on a known pattern; 8: an idea you haven't seen shipped
  before, carried through the whole site; 10: the concept and the medium
  are inseparable — copying it would be obvious.
- Anchor checks: is the reversed stellar lifecycle a gimmick or the
  site's actual information architecture? Does the graveyard-as-content
  choice land? Q: "describe one thing you've never seen a site do."

**Content (10%)** — substance, honesty, writing quality.
- 6: real work shown; 8: claims carry visible evidence, failures documented
  as first-class content, writing tight; 10: you'd cite it.
- Anchor checks: do the case studies prove anything (the PROOF ledgers)?
  Is anything hedge-worded that shouldn't be — or claimed without backing?

Per-route row: jurors also give one 1–10 overall per route, desktop and
mobile (the every-route ≥8.0 gate). Routes: Home, Work, Writing, one post,
Graveyard, Behind the Build, About, Contact, and the 404 (linked directly).

Free-text (required): best moment, worst moment, one thing to cut, one
thing to keep at all costs, "would you award this today — why/why not".

## Scoring math

- Juror overall = 0.4·Design + 0.3·Usability + 0.2·Creativity + 0.1·Content.
- Panel score per dimension = median of the nine (median resists one
  outlier better than mean at n=9; report the mean too).
- Report: panel overall, per-dimension medians, per-lens (design/dev/client)
  splits, per-route medians desktop+mobile, calibration deltas.

## Pass / act

| Result | Action |
|--------|--------|
| Overall ≥8.25 AND all dimension floors met AND every route ≥8.0 | SOTD-ready gate passes; log in the RC dossier |
| Overall ≥8.5 (same floors) | SOTM-ready jury gate passes |
| Any dimension below floor | Every free-text comment touching that dimension becomes a triaged finding; fix; re-run with a FRESH panel (jurors can't unsee) |
| A single route <8.0 | Route-scoped findings; the per-route art-direction notes in the P9 commit are the fix surface |

Record in `docs/validation/results/jury-YYYY-MM-DD.md`: anonymized juror
table, raw scores, medians, calibration scores, all free text, and the
findings list. The RC dossier links this file when the jury gate flips.
