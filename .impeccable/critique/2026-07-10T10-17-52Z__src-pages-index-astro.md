---
target: full app / Awwwards SOTY readiness
total_score: 28
p0_count: 1
p1_count: 8
timestamp: 2026-07-10T10-17-52Z
slug: src-pages-index-astro
---
Method: dual-agent (A: `visual_review_fast` · B: `clean_detector_verifier`)

# Awwwards SOTY Readiness Critique

**Stable target:** `src/pages/index.astro`  
**Scope:** full application, desktop and mobile, including the lifecycle hero, supporting routes, fallbacks, reduced motion, responsive behavior, performance, content depth, and production readiness.

The separate technical audit supplied evidence only. Its judgment was isolated from the independent design and detector assessments; a later agent-list exposure was disclosed and excluded from the audit judgment.

## Bottom Line

**This is award-worthy work. It is not SOTY-ready yet.**

The reverse stellar lifecycle is a rare, memorable, genuinely authored portfolio idea. It has enough creative identity for an Awwwards audience and should be competitive for an **Honorable Mention**. A **Site of the Day is plausible but not bankable**. In the current build, a **Developer Award and Site of the Month are unlikely**, which in turn makes a Site of the Year path remote.

The blocker is not a lack of spectacle. It is the distance between the spectacle and the rest of the product: mobile access is costly, reduced-motion and no-JavaScript paths still fail, supporting routes do not consistently match the hero's level of authorship, and the portfolio does not yet prove the work with SOTY-level case-study depth.

**Internal SOTY-readiness score: 68/100.** This is an audit score, not an Awwwards metric.

## Design Health Score

| # | Nielsen heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | The loader, scroll cue, HUD state, and route transitions communicate activity, but several cues are faint and the hero's current control state is not always immediately legible. |
| 2 | Match Between System and Real World | 3/4 | The stellar metaphor is coherent, but cockpit language and reverse-collapse terminology require interpretation before they help navigation. |
| 3 | User Control and Freedom | 2/4 | Desktop has multiple routes into the content; mobile delays labeled destinations until roughly 18 viewports of scrolling and offers no equally prominent bypass at the opening. |
| 4 | Consistency and Standards | 4/4 | Tokens, typography, chrome, navigation vocabulary, and lifecycle state language form a disciplined system across the app. |
| 5 | Error Prevention | 3/4 | WebGL and loader backstops exist, but responsive overflow and the no-JavaScript cover failure are preventable release defects. |
| 6 | Recognition Rather Than Recall | 2/4 | Iconic markers and delayed mobile labels make visitors infer where work lives instead of recognizing destinations immediately. |
| 7 | Flexibility and Efficiency of Use | 2/4 | Keyboard and direct-route foundations exist, but there is no efficient, first-viewport mobile path around the cinematic sequence. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The dominant object and pacing are exceptionally focused; HUD ornament, faint metadata, and repeated technical signals occasionally compete with the message. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 3/4 | WebGL and no-script fallback content is thoughtfully authored, but the loader blocks one fallback and the generic 404 does not carry the same recovery quality. |
| 10 | Help and Documentation | 3/4 | Scroll hints and Behind the Build explain the experience, but the hero controls and navigation model are not self-evident for a first-time visitor. |
| **Total** |  | **28/40** | **Good foundation; major release issues remain.** |

## Technical Audit Health

| Area | Score | Evidence |
|---|---:|---|
| Accessibility | 2/4 | Reduced-motion hydration mismatch, blocked no-JavaScript fallback, faint secondary copy, small controls, and nested `<main>` landmarks. |
| Performance | 2/4 | The 236.7 KB-gzip hero engine is reused for ambient backdrops, marker positioning forces layout, and one 4,073,030-byte image ships without responsive sizing or intrinsic dimensions. |
| Responsive | 2/4 | Mobile withholds labeled work destinations for about 18 viewports; two audited pages exceed a 390 px viewport. |
| Theming | 3/4 | The graphite/gold lifecycle system is coherent, but supporting pages converge on a familiar dark technical-portfolio vocabulary. |
| Anti-patterns | 3/4 | No broad AI-template pattern, but one side stripe, one real height transition, and repeated font/eyebrow signals remain. |
| **Total** | **12/20** | **Technically credible, not award-submission hardened.** |

The technical audit recorded **P0 1 / P1 8 / P2 5 / P3 2**. Those are raw technical findings. The strategic design P1 issues below are not added to that count, and the five priorities consolidate related findings rather than pretending to be a new combined total.

## Anti-Patterns Verdict

### LLM assessment

**No AI slop.** The reverse stellar lifecycle, particle choreography, scale story, cockpit geometry, manifesto pacing, and pale-dot resolution form a singular authored hero. This does not look like a generated landing-page template.

The risk appears after the hero. Supporting routes increasingly resemble a familiar 2026 dark technical portfolio: near-black surfaces, mono readouts, fine rules, uppercase microcopy, HUD framing, and editorial-style content rows. Those ingredients are valid here, but their repetition narrows the site's authorship precisely where the work should broaden it. The hero asks “how was this made?”; some inner routes answer with patterns the category already knows.

### Deterministic scan

The clean detector assessment returned **10 raw warnings**:

- `em-dash-overuse` twice: `src/components/CustomCursor.astro` and `src/layouts/BaseLayout.astro`. Both counted source comments, not user-facing copy, so both are clear false positives.
- `broken-image` once at `src/styles/hero.css:168`. It matched an `<img>` token inside a CSS comment, another clear false positive.
- `layout-transition` twice: a real height transition at `src/styles/article.css:60`, plus `src/styles/hud.css:95`, which the clean verifier found syntactically valid but dead as a runtime concern because the element's height does not change.
- `side-tab` once at `src/styles/article.css:338`. This is a valid side-stripe signal and should be redesigned rather than rationalized.
- `overused-font` four times at `src/styles/fonts.css:24`, `:35`, `:61`, and `:72`. These collapse to two families repeated across Latin and Latin-ext subsets, not four separate fonts, but they still reinforce the repeated technical/editorial signal.

At least **3 of 10 are clear false positives**, with one additional disputed/dead transition warning. The useful detector signal is therefore compact: one side stripe, one real height animation, and two repeatedly loaded font families. The automated result does not overturn the authored-design verdict.

### Visual overlays

The independent detector assessment completed CLI and headless DOM evidence, but its detector injection was interrupted after the live server started. Browser presentation was headless-only, so **no reliable user-visible `[Human]` overlay exists**. A separate technical pass successfully injected `detect.js` headlessly on `/`, `/posts/memory-leak-search-and-destroy`, and `/about`, and confirmed overlay nodes in the DOM; that still did not create a human-visible browser overlay.

## Overall Impression

The first desktop impression is award-calibre: one dominant visual system, a confident boot sequence, unusual narrative direction, and choreography with real emotional shape. The black hole has gravity in both the visual and editorial sense. The red giant, yellow-star swap, nebula, and lone dot give the page a beginning, reversal, and ending instead of a WebGL object that merely reacts to scroll.

The site loses authority when the jury stops watching and starts evaluating. Usability is weakest on mobile, proof is thinner than the spectacle promises, and inner pages do not all feel like new chapters of the same authored world. The single biggest opportunity is to turn the hero from a spectacular introduction into the organizing logic for the entire portfolio: faster access, deeper evidence, route-specific art direction, and production behavior that survives hostile conditions.

## Cognitive Load and Emotional Journey

The interface fails **2 of 8 cognitive-load checks**, a moderate result:

- **Working memory:** a first-time mobile visitor must infer that destinations will eventually emerge and remember that promise while traversing the lifecycle.
- **Progressive disclosure:** complexity is sequenced well, but useful navigation is disclosed too late; roughly 18 viewports is not progressive disclosure, it is an access penalty.

Single focus, chunking, grouping, visual hierarchy, and one-thing-at-a-time pacing are strong. The desktop rail presents five destinations at one decision point, just over the four-item working-memory target, but its consistent labels and hierarchy keep it manageable.

The emotional peak is the hero's reverse supernova and giant-star sequence. The pale-dot ending supplies a memorable quiet resolution. The valley arrives immediately after: the visitor moves from cinematic transformation to more conventional indexes and articles, while project proof remains less vivid than the opening claim. For SOTY, the ending cannot merely unlock content; the content must deliver a second peak based on evidence and trust.

## Route Scorecard

These are internal visual/UX review scores, not Awwwards scores.

| Route | Desktop | Mobile | Assessment |
|---|---:|---:|---|
| Home | 8.6 | 7.2 | Signature idea and strongest desktop execution; mobile access cost produces the largest gap. |
| Projects | 7.4 | 7.0 | Clear index, but proof and art direction do not yet match the hero's promise. |
| Writing | 7.5 | 7.1 | Readable and coherent; still close to a familiar technical-publication treatment. |
| Memory-leak article | 7.4 | 6.6 | Strong technical content, undermined by a 444 px reflow from the long Sentry symbol at 390 px. |
| Thanks / inspiration | 7.8 | 7.4 | Personal, distinctive content; the 4 MB Golden Record image is avoidable delivery debt. |
| Graveyard | 8.2 | 7.7 | The best supporting route: concept, honesty, and presentation reinforce each other. |
| Behind the Build | 8.3 | 6.9 | Excellent proof-of-craft direction; a fixed-width budget table creates a 404–405 px layout at 390 px. |
| About | 7.8 | 7.3 | Credible voice and contact path; could expose stronger project outcomes sooner. |
| **Average** | **7.9** | **7.15** | **The desktop concept is ahead of mobile resilience and content delivery.** |

## Awwwards Benchmark

### Official facts

Awwwards' [evaluation system](https://www.awwwards.com/about-evaluation/) weights **Design 40%, Usability 30%, Creativity 20%, and Content 10%**. It states that at least 18 jurors score an approved site, three outlier scores are removed, and voting normally lasts five days. Its [FAQ](https://www.awwwards.com/faqs/) says an Honorable Mention needs both jury and eligible-user scores of at least 6.5. Awwwards does not publish a fixed SOTD threshold: its evaluation page says the highest-scoring sites compete for one of 365 daily awards.

Every SOTD winner proceeds to Developer Award evaluation, where Awwwards says a score **higher than 7** earns the award. The eight highest-scoring sites each month are nominated for SOTM. SOTM winners are automatically nominated for SOTY, alongside selected Awwwards favorites. The [annual winners archive](https://www.awwwards.com/annual-awards/winners) shows the level of the final field.

The separate [Awwwards Honors](https://www.awwwards.com/honors/about) program nominates the top 20 highest-rated projects in each category whether or not they win SOTD. Its Portfolio category explicitly values a comprehensive view of projects, skills, and accomplishments. That makes portfolio depth—not only opening spectacle—part of the relevant official benchmark. The current field can be browsed in the [official portfolio gallery](https://www.awwwards.com/websites/portfolio/).

### Audit inference, not an official score

| Awwwards component | Predicted jury score | Reasoning |
|---|---:|---|
| Design | 8.0 | Cohesive art direction, typography, composition, and exceptional hero staging; supporting routes are less authored. |
| Usability | 6.7 | Functional desktop navigation and fallbacks, offset by mobile access cost, reflow, faint controls, and broken reduced/no-JS paths. |
| Creativity | 8.7 | Reverse stellar physics, GPU choreography, cockpit instrument framing, and the manifesto arc are legitimately original. |
| Content | 7.4 | Strong voice, Graveyard, technical writing, and Behind the Build; project case studies lack enough outcomes and external proof. |
| **Official weighted formula** | **7.69 (~7.7)** | **8.0×40% + 6.7×30% + 8.7×20% + 7.4×10%.** |

This **7.69 is a projection**, not an actual jury score or a guarantee. It supports “likely Honorable Mention” and “plausible SOTD,” but the 30% usability weight makes the current defects too consequential to treat SOTD as bankable.

The internal Developer Award estimate is **37/60, approximately 6.2/10**:

| Developer dimension | Estimate |
|---|---:|
| Semantics / SEO | 7/10 |
| Animations / transitions | 7/10 |
| Accessibility | 5/10 |
| Web Performance Optimization | 5/10 |
| Responsive implementation | 6/10 |
| Markup / metadata | 7/10 |
| **Total** | **37/60 (~6.2/10)** |

That estimate sits below Awwwards' stated >7 Developer Award bar. It is an audit inference, not a developer-jury result.

### Relevant official comparables

| Site | Official result | What it says about this portfolio |
|---|---|---|
| [Bruno's Portfolio](https://www.awwwards.com/sites/brunos-portfolio) | 8.11; SOTM, January 2026 | A current portfolio benchmark couples a memorable surface with month-level completeness. |
| [Pacôme Pertant Portfolio](https://www.awwwards.com/sites/pacome-pertant-portfolio) | SOTD 7.76; Developer 7.62 | A score near this audit's 7.69 projection can win SOTD, but only with developer execution above the separate threshold. |
| [Lando Norris](https://www.awwwards.com/sites/lando-norris) | 2025 SOTY; 8.18 | SOTY combines a strong concept with a fully resolved public identity, content system, and production finish. |
| [Igloo Inc](https://www.awwwards.com/sites/igloo-inc) | 2024 SOTY; 7.92 | Raw score alone is not the whole story; distinctiveness and completeness can outweigh a narrow numeric comparison. |
| [Lusion v3](https://www.awwwards.com/sites/lusion-v3) | 2023 SOTY; 8.25 | The closest creative-technology benchmark sustains its craft and identity beyond a single hero moment. |

The comparison is directional, not predictive. Awwwards does not define a public “SOTY score,” and annual selection depends on first clearing earlier awards and then standing out within that year's field.

## What's Working

1. **The hero has a real thesis.** Reversing a stellar lifecycle turns “build software that lasts” into structure, scale, and pacing. The interaction is not decorative; the metaphor and implementation reinforce one another.
2. **The scene craft is unusually deep.** The 1.2M-point GPU object, lensed starfield, dedicated sun rig, red-giant camera park, supernova clock, nebular light model, cockpit geometry, bloom/grade chain, and quiet dot resolution demonstrate sustained art direction rather than one shader trick.
3. **The strongest content is honest and specific.** Graveyard and Behind the Build show failures, constraints, implementation decisions, and process. The shared tokens, SSR copy, WebGL fallback intent, skip link, motion preference, and route vocabulary show systems thinking even where defects remain.

## Priority Issues

### 1. [P0] The no-JavaScript loader blocks the fallback it is meant to protect

**Why it matters:** With JavaScript disabled or unavailable, `.scene-loader` and its full-screen `::before` remain at z-index 60 because only JavaScript adds `body.scene-ready`. The `<noscript>` manifesto exists underneath but cannot be reached visually. This completely blocks the homepage for a legitimate fallback path and contradicts the site's core durability claim.

**Fix:** Make the loader opt-in to a confirmed JavaScript path, or add an immediate `<noscript>` style that removes the loader and restores the document. Capture the entire home page with JavaScript disabled and verify that manifesto copy, work/writing/about destinations, and contact are visible and keyboard reachable.

**Suggested command:** `$impeccable harden`

### 2. [P1] Reduced motion still produces a React hydration mismatch

**Why it matters:** Re-verification with `prefers-reduced-motion: reduce` reproduced React error #418. The server renders the non-reduced branch while the first client render can resolve the OS preference differently. Even though the heavy scene import is synchronously gated, hydration instability damages trust in the exact accessibility path meant to be safest.

**Fix:** Keep server and first-client markup identical. Use a server snapshot for the preference, defer branch-specific copy until hydration, or isolate the motion poster behind a client-stable boundary while continuing to block the WebGL import. Test fresh storage, persisted overrides in both directions, OS changes, SPA returns, keyboard control, and a zero-console-error reduced-motion boot.

**Suggested command:** `$impeccable audit`

### 3. [P1] Mobile turns discovery into endurance and still breaks reflow

**Why it matters:** A mobile visitor can traverse about 18 viewports before seeing labeled work destinations at the opening. That is a direct usability penalty, not cinematic pacing. Two 390 px audits also overflow: the memory-leak article reaches 444 px because `io.sentry.transport.HttpConnection.createConnection` cannot wrap, and Behind the Build reaches roughly 404–405 px because `.btb-budget-table` holds a 380 px width. This is the clearest reason the inferred Usability score is only 6.7.

**Fix:** Put a labeled Work / Writing / About path or “skip the experience” action in the first mobile viewport without removing the narrative. Shorten the mobile timeline independently. Add safe wrapping for long technical tokens and convert the budget table to a scroll-contained, stacked, or genuinely fluid presentation. Gate release on 320, 360, 375, 390, 412, and 430 px reflow checks at 100% and 200% zoom.

**Suggested command:** `$impeccable adapt`

### 4. [P1] The portfolio peaks before it proves the work

**Why it matters:** Home, Graveyard, and Behind the Build feel authored; Projects, Writing, articles, and parts of About increasingly settle into a conventional dark ledger/HUD pattern. At the same time, project evidence is too thin for the opening claim: not enough problem framing, individual contribution, constraints, alternatives rejected, measurable outcomes, artifacts, or links to finished work. A prospective client and an Awwwards juror both encounter the same gap between promise and proof.

**Fix:** Build two or three flagship case studies to SOTY depth before expanding breadth. Each needs the problem, stakes, role, team, constraints, decisive technical/design choices, failed paths, performance/accessibility evidence, outcome, and live or repository proof. Give every major route one lifecycle-derived compositional idea of its own instead of carrying the same chrome unchanged across the site.

**Suggested command:** `$impeccable shape`

### 5. [P1] Production and performance debt weakens the Developer Award case

**Why it matters:** `/dev-blueprint` is indexable, pages create nested `<main>` landmarks, marker tracking forces layout, the full 236.7 KB-gzip engine is reused as an ambient backdrop on reading routes, and `public/inspirations/voyager-golden-record.jpg` is 4,073,030 bytes with no responsive variants or intrinsic dimensions. There is no end-to-end suite protecting the exact no-JS, reduced-motion, navigation, and reflow paths that failed. These are not invisible implementation details when a developer jury is the target.

**Fix:** Exclude or remove the dev route in production, restore one `<main>` landmark per document, batch marker reads away from frame-critical writes, and replace reading-route backdrops with captured imagery or a deliberately trimmed renderer. Convert the Golden Record image to responsive AVIF/WebP with explicit dimensions and a sane fallback. Add E2E gates for no-JS, reduced motion, WebGL loss, SPA navigation, keyboard access, console errors, and mobile reflow.

**Suggested command:** `$impeccable optimize`

## Persona Red Flags

### Jordan, first-time visitor

Jordan's primary action is to understand who this is and open a piece of work. Desktop communicates the identity quickly, but the cockpit metaphor, icon markers, and reverse lifecycle require learning before navigation feels ordinary. On mobile, labeled destinations are absent at the opening and arrive only after a long scroll. Jordan may admire the black hole without discovering the portfolio.

### Casey, distracted mobile visitor

Casey's primary action is to reach Work or Contact one-handed on a slow connection. The long homepage sequence delays that action, small/faint controls reduce tap confidence, the full hero engine is expensive, and two content routes exceed the viewport. An interruption during the cinematic track leaves no obvious fast resume point. The experience asks for uninterrupted attention that mobile users cannot promise.

### Riley, deliberate stress tester

Riley's primary action is to verify that the experience survives its advertised edge cases. JavaScript-off reveals a permanent cover instead of the fallback, reduced motion logs React #418, long content breaks reflow, and the generic 404 weakens recovery. The absence of E2E coverage means these defects can recur despite strong comments and careful intent.

### Awwwards juror

The juror's primary action is to score design, usability, creativity, and content in limited time. Creativity clears the bar immediately, and desktop design is strong. Usability defects are easy to reproduce, however, and carry 30% of the official formula. The quality drop after the hero and incomplete case-study proof make the work feel like an exceptional opening attached to a good portfolio, not yet a complete SOTY candidate.

### Prospective client or collaborator

This visitor's primary action is to decide whether Iliès can finish difficult work and deliver outcomes. Graveyard and Behind the Build establish honesty and engineering judgment, but the Projects route does not consistently answer what changed for a real user or organization, what Iliès personally owned, and what result survived production. The site demonstrates capability more strongly than it demonstrates impact.

## Minor Observations

- Several interactive controls and labels are too small or faint for reliable use over a live scene; decorative dimness has leaked into the interaction layer.
- The generic 404 is a missed brand and recovery moment. It should keep the stellar language while offering explicit routes back to Work, Writing, and Home.
- The real `height` transition in `article.css` should become a transform/clip/opacity treatment or a measured one-off animation that cannot trigger layout throughout the page.
- The article side stripe is a familiar callout trope inside an otherwise original system. Replace it with spacing, a full frame, a glyph, or typographic contrast.
- Repeated mono/uppercase eyebrow signals are coherent but overused. Reserve them for true instrument readouts and let supporting content develop a second cadence.
- The Golden Record image is thematically perfect and technically wasteful; optimizing it will improve the experience without sacrificing any art direction.

## Questions to Consider

- If the hero disappeared, would the Projects route alone convince a skeptical juror that this is SOTY-level work?
- What is the earliest mobile frame at which a visitor should be allowed to choose Work, Writing, or About without “failing” the intended story?
- Which two projects can carry enough evidence—constraints, rejected paths, metrics, artifacts, and outcomes—to become the site's second emotional peak?
- Can each supporting route inherit one physical law or visual behavior from a lifecycle state instead of inheriting the same HUD skin?
- What would have to be true for the no-JS and reduced-motion paths to feel like deliberate editions of the experience rather than fallback tiers?
