# SOTY Readiness Execution Backlog

## Outcome

Turn the current award-worthy portfolio into a complete, resilient, evidence-rich campaign capable of competing for Awwwards Site of the Day, Developer Award, Site of the Month, and ultimately Site of the Year.

**Do not submit until MET-G01 and MET-G02 are green, every P0 and P1 acceptance criterion has evidence against one immutable production release, and the launch, rollback, submission, and ethical-voting rehearsals have passed.** The reverse stellar lifecycle is already the signature idea. This roadmap raises the surrounding product, proof, mobile experience, accessibility, engineering, and campaign discipline to the same level.

This is the canonical execution backlog. PRODUCT.md and the persisted SOTY critique define the product intent and current baseline. Where a task overlaps another task, the IDs remain separate because they own different outcomes: experience definition, implementation, human evidence, validation, release, or campaign.

## Official Awwwards facts versus internal standards

### Official facts

- Awwwards weights Design at 40%, Usability at 30%, Creativity at 20%, and Content at 10%: [Evaluation system](https://www.awwwards.com/about-evaluation/).
- Approved sites are sent to at least 18 jurors; the three scores furthest from the average are removed; normal voting lasts five days.
- Awwwards publishes no fixed SOTD score threshold. The highest-scoring sites compete for one of 365 daily awards.
- Every SOTD winner is evaluated for the Developer Award; a developer-jury score higher than 7 earns it.
- The eight highest-scoring sites each month are nominated for SOTM and reviewed again. User votes add weight to that decision.
- SOTM winners are automatically nominated for SOTY, alongside selected Awwwards favorites. The annual winner is announced the following February.
- Manual approval can take up to one week, and an approved site remains eligible for SOTD for up to three months: [FAQ](https://www.awwwards.com/faqs/).
- The main submission image is 1600 by 1200 pixels. Awwwards recommends selecting site elements and adding videos, ideally at the same dimensions.
- Submission fields and assets can be edited while the submission is a draft, but not once it is under review or approved.
- Awwwards rejects false-account voting; only eligible validated-user votes count.
- The official pages differ slightly on Honorable Mention. The evaluation page names a jury score of at least 6.5; the FAQ says both jury and eligible-user scores must reach 6.5. This roadmap uses the stricter interpretation.

### Proposed internal standards

All numeric gates, route floors, user-research targets, Core Web Vitals targets, bundle budgets, frame-rate targets, stability requirements, review-panel composition, and campaign rules below are internal release standards. They are deliberately stricter than the published minimums and are not represented as guarantees of an award.

## Priority legend

| Priority | Meaning |
|---|---|
| P0 | Submission blocker. A failure makes the judged experience unavailable, misleading, legally unsafe, inaccessible, or operationally fragile. |
| P1 | Required for a credible SOTY campaign. May not block a basic launch, but blocks award submission. |
| P2 | Competitive leverage after the core campaign is sound. Must not displace unresolved P0/P1 work. |
| P3 | Optional amplification or post-award investment. Ship only when it remains coherent, accessible, and performant. |

## Award gates

| Gate | Official path | Proposed internal exit |
|---|---|---|
| MET-G01 — SOTD-ready | No fixed published threshold; the highest-scoring sites compete for SOTD. | Zero open P0/P1 findings; nine-person blind-panel trimmed mean at least 8.25; category floors Design 8.2, Usability 8.0, Creativity 8.8, Content 8.2; every public route at least 8.0 on desktop and mobile; essential-task success at least 90%; three consecutive clean release candidates. |
| MET-G02 — Developer-Award-ready | SOTD winners enter developer evaluation; score must be higher than 7. | Internal developer score at least 8.25 and every developer dimension at least 8.0; WCAG 2.2 AA signoff; good Core Web Vitals; no release-blocking browser, device, fallback, hydration, console, network, reflow, or context-loss failure. |
| MET-G03 — SOTM-ready | The eight highest-scoring sites of the month are nominated and reviewed again; user votes add weight. | MET-G01 and MET-G02 passed; blind-panel score at least 8.5 with no official category below 8.3; top-decile result against at least 24 current SOTD/SOTM comparables; production stable for 30 consecutive days; ethical campaign kit complete. |
| MET-G04 — SOTY-campaign-ready | SOTM winners are automatically nominated; selected favorites can also be nominated. | MET-G03 passed; top-five-percent annual-comparable result; at least 80% seven-day unaided concept recall; three flagship proof packages or equivalent evidence depth; annual narrative and reel complete; production uptime at least 99.95% throughout the eligibility window; no unresolved legal, privacy, attribution, or accessibility exception. |

## Critical path

    Phase 0: charter, rules, evidence schema, baseline
      -> Phase 1: release-blocking defects and test foundation
      -> Phase 2: mobile access, shorter cut, canonical IA
      -> Phase 3: accessibility, responsive and fallback parity
      -> Phase 4: WebGL, WPO and asset budgets
      -> Phase 5: project evidence and editorial proof
      -> Phase 6: route-specific art direction and motion grammar
      -> Phase 7: full QA, real-device, usability and external jury validation
      -> MET-G01 + MET-G02
      -> Phase 8: immutable release, freeze, monitoring and rollback rehearsal
      -> Phase 9: submission, ethical SOTD campaign, Developer follow-through
      -> MET-G03 SOTM campaign
      -> MET-G04 SOTY campaign and long-term preservation

Optional P2/P3 work never jumps ahead of a red P0/P1 gate. Human-input tasks can run in parallel, but their dependent experience tasks cannot close until the required evidence is approved.

## Task schema

Award dimension codes: D Design; U Usability; Cr Creativity; Ct Content; Dev-WPO performance; Dev-RWD responsive; Dev-Markup markup/metadata; Dev-SEO semantics/SEO; Dev-Motion animation/transitions; Dev-A11y accessibility; All cross-cutting.

## Phase 0 — Program charter and evidence intake

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| CAM-001 | P0 | All | — | Campaign lead | Signed SOTY campaign charter covering objective, target cycle, scope, budget authority, review gate, and ethical limits. | One target award cycle and one fallback path are named; no stakeholder can interpret verified as permission to submit or merge. | evidence/program/campaign-charter.md |
| MET-001 | P0 | All | CAM-001 | Research lead | Dated official-rules register with source URL, exact claim, access date, conflict note, and owner. | Every external award claim in this roadmap is traceable; Evaluation/FAQ HM discrepancy is recorded; register has a recheck trigger before submission. | evidence/program/official-rules-register.md |
| MET-002 | P0 | All | MET-001 | Research lead | Internal scoring rubric anchored to the official 40/30/20/10 formula and current comparables. | Scores 5 through 10 have observable anchors; creativity is not double-counted as design; developer criteria are scored separately. | evidence/scoring/internal-jury-rubric.md |
| MET-003 | P0 | All | MET-002 | Independent review lead | Current full-app scorecard and risk baseline. | Every public route, desktop/mobile edition, reduced-motion path, no-JS path, and no-WebGL path has a score, finding severity, owner, and confidence. | evidence/scoring/baseline-scorecard.md |
| CAM-002 | P1 | D/U/Cr/Ct | MET-001 | Creative strategist | Live field of at least 24 relevant portfolio, WebGL, SOTD, SOTM, and SOTY comparables. | Each entry records award result, date, four official category scores when public, mobile model, proof depth, and differentiating idea; cohort is refreshed before each external panel. | evidence/competition/comparable-field.csv |
| CAM-003 | P1 | All | CAM-001, CAM-002 | Producer | Review governance and dependency board. | Weekly internal review, milestone external panels, go/no-go authority, escalation owner, and evidence retention policy are agreed; every task has one accountable owner. | evidence/program/review-governance.md |
| CON-001 | P0 | Ct | CAM-001 | Portfolio owner | Canonical project-evidence schema. | Schema requires context, problem, stakes, role, team, constraints, alternatives rejected, decisions, artifacts, outcome, accessibility/performance evidence, and public proof or honest redaction. | evidence/content/project-evidence-schema.md |
| CON-007 | P1 | U/Ct | CAM-001 | Portfolio owner | Approved availability, engagement, location, and contact facts. | Every public availability statement is current, dated, specific enough for a decision, and has an owner/review trigger. | evidence/content/availability-facts.md |
| CON-008 | P1 | Ct | CON-001 | Portfolio owner | Source-of-truth counts and status ledger for projects, articles, experiments, and Graveyard specimens. | No visible count or status is hard-coded without a matching source; private/redacted items are explicitly classified. | evidence/content/dynamic-status-ledger.json |
| CON-010 | P1 | D/Ct | CAM-003 | Portfolio owner, brand editor | Voice-hierarchy decision for manifesto, evidence, UI, captions, and technical explanation. | Each content mode has an approved tone and example; poetic language cannot substitute for proof; HUD language is reserved for actual instrumentation. | evidence/content/voice-hierarchy.md |
| CON-027 | P0 | Ct/Dev-Markup | CAM-001 | Portfolio owner, legal reviewer | Complete authorship, collaborator, provenance, and license intake. | Every font, image, video, shader source, logo, quote, project artifact, testimonial, and contributor has ownership, permission, attribution, and reuse status. | evidence/legal/authorship-license-ledger.csv |
| EXP-039 | P0 | Ct | CON-027 | Content designer | Visible credits and provenance model across routes and submission materials. | Credits are findable, accurate, human-readable, and consistent with Awwwards collaborator entries; uncertain rights never ship. | evidence/content/credits-provenance-captures/ |

## Phase 1 — Release blockers

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| ENG-001 | P0 | U/Dev-A11y | QA-001 | Frontend engineer | Technical no-JS loader and fallback correction. | With JavaScript disabled, no fixed cover remains; fallback content begins in the initial viewport; Work, Writing, About, Contact, and manifesto are reachable by keyboard. | evidence/engineering/no-js-production-trace/ |
| EXP-001 | P0 | U/Ct | ENG-001, CON-010 | UX/content designer | Authored no-JS edition of the homepage narrative. | It communicates identity and lifecycle thesis without canvas, does not imitate a broken live scene, and exposes all canonical destinations immediately. | evidence/experience/no-js-edition-captures/ |
| A11Y-001 | P0 | U/Dev-A11y | QA-001 | React/accessibility engineer | Hydration-stable motion-preference boot. | Server and first client markup match for fresh and persisted preferences; reduced motion logs zero hydration errors and never imports the heavy WebGL engine. | evidence/accessibility/reduced-motion-hydration-trace.json |
| EXP-002 | P0 | D/U/Dev-A11y | A11Y-001 | UX/motion designer | Deliberate reduced-motion edition. | The visitor receives the same message, IA, and proof through a calm authored treatment; the manual preference control is understandable and reversible. | evidence/experience/reduced-motion-edition-video.mp4 |
| ENG-002 | P1 | U/Dev-Markup | QA-001 | Frontend engineer | Stable icon and resource URL resolution. | Icons and referenced resources load with zero 404s on direct entry, nested routes, history traversal, canonical host, and production base path. | evidence/engineering/icon-url-network-log.har |
| ENG-003 | P0 | Ct/Dev-SEO | QA-001 | Astro engineer | Production exclusion of dev-only routes and assets. | /dev-blueprint and any diagnostic-only route are absent from production output, sitemap, internal links, search index, and crawl results. | evidence/engineering/production-route-manifest.txt |
| ENG-004 | P0 | U/Dev-RWD | QA-001 | Frontend engineer | Safe wrapping for long technical identifiers in articles. | The memory-leak article and all code/prose tokens fit 320–430px viewports without unintended page overflow or illegible character splitting. | evidence/responsive/article-token-reflow/ |
| ENG-005 | P0 | U/Dev-RWD | QA-001 | Frontend engineer | Fluid/contained Behind the Build budget presentation. | The budget table is usable at 320px, 200% zoom, and screen-reader table navigation; the document width never exceeds the viewport. | evidence/responsive/budget-table-reflow/ |
| A11Y-002 | P0 | U/Dev-Markup/Dev-A11y | QA-001 | Accessibility engineer | One-main-landmark document structure. | Every public route has exactly one main landmark, a logical heading outline, named navigation regions, and no duplicate landmark ambiguity. | evidence/accessibility/landmark-audit.html |
| ENG-008 | P0 | U/Dev-SEO | QA-001 | Astro engineer | Correct branded 404 routing and status behavior. | Unknown paths return HTTP 404 in production, preserve canonical chrome, have noindex behavior where appropriate, and provide working recovery links. | evidence/engineering/404-status-crawl.txt |
| EXP-011 | P1 | D/U/Ct | ENG-008, CON-010 | UX/content designer | Authored stellar 404 experience. | It is recognizably part of the same world, explains the failure plainly, avoids blaming the visitor, and offers Home, Work, Writing, About, and Contact. | evidence/experience/404-desktop-mobile/ |
| ENG-009 | P0 | Ct/Dev-Markup/Dev-SEO | QA-001 | SEO/Astro engineer | Complete per-route metadata and structured data foundation. | Unique title, description, canonical, OG/Twitter metadata, language, Person/WebSite/Article/CreativeWork schema, image dimensions, and sitemap intent validate on every route. | evidence/seo/metadata-schema-validation.json |
| QA-001 | P0 | All | MET-003 | Test engineer | Production-like E2E foundation with deterministic server lifecycle and artifact retention. | CI can boot the built app, visit every public route, capture console/network failures, test navigation and status codes, and retain screenshot/video/trace by commit SHA. | evidence/qa/e2e-foundation-run/ |

## Phase 2 — Mobile access and information architecture

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| ENG-006 | P0 | U/Dev-RWD | EXP-003, EXP-005 | Frontend engineer | First-viewport mobile navigation and bypass implementation. | Work, Writing, About, and Contact are labeled and operable without scrolling; skip/bypass preserves focus and history; controls clear 44px target policy. | evidence/mobile/first-viewport-navigation-trace/ |
| ENG-007 | P0 | D/U/Dev-RWD | EXP-004 | Hero engineer | Independent mobile lifecycle mapping. | The authored mobile arc spans 7–9 normal phone viewports, retains every narrative beat, and does not change the canonical lifecycle direction seam. | evidence/mobile/mobile-timeline-captures/ |
| EXP-003 | P0 | U | EXP-009, MET-003 | Information architect | Labeled mobile destinations in the opening viewport. | In five first-time mobile tests, at least 90% identify Work, Writing, About, and Contact without instruction and reach Work in at most 15 seconds. | evidence/research/mobile-first-click-report.md |
| EXP-004 | P0 | D/U/Cr | EXP-003 | Experience director | 7–9 viewport mobile cut with beat-by-beat pacing specification. | All lifecycle states, manifesto beats, opening gravity, and pale-dot resolution remain; no interval is merely empty scrolling; bypass remains persistently available. | evidence/experience/mobile-cut-storyboard.pdf |
| EXP-005 | P0 | U | EXP-003 | Interaction designer | Opening control model for scroll, skip, chapter access, and motion preference. | Labels explain outcomes rather than cockpit metaphors; controls have stable states, keyboard/touch parity, and no conflict with browser gestures. | evidence/experience/opening-control-spec.md |
| EXP-008 | P1 | D/Ct | EXP-004, CON-001 | Experience/content director | Proof-rich finale after the pale blue dot. | The ending exposes at least three concrete proof paths, retains the quiet resolution, and creates a second reason to continue instead of an undifferentiated link list. | evidence/experience/finale-prototype-video.mp4 |
| EXP-009 | P0 | U/Ct | CON-008, CON-010 | Information architect | Canonical Work, Writing, About, and Contact IA shared across all editions. | Names, destinations, ordering, selected state, URLs, history behavior, and fallback labels are identical in purpose across desktop, mobile, no-JS, no-WebGL, and reduced motion. | evidence/ia/canonical-destination-map.md |
| EXP-010 | P1 | U/Ct | EXP-009, CON-007 | Content/interaction designer | Decision-ready contact path. | Availability, engagement types, response expectation, location/time-zone context, and one primary contact action are visible without decoding icons or completing the hero. | evidence/experience/contact-decision-test.md |

## Phase 3 — Accessibility, responsive behavior, and fallback parity

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| EXP-006 | P0 | U/Dev-A11y | ENG-001, A11Y-001 | UX writer, interaction designer | Truthful, interruptible loader contract. | Loader names what is happening, never claims false progress, exposes navigation or a skip path immediately, times out into a usable edition, and cannot block fallback content. | evidence/experience/loader-state-matrix.md |
| EXP-007 | P0 | D/U/Cr | EXP-006, A11Y-004 | Art director, UX designer | Authored no-WebGL edition. | Capability failure produces an intentional poster/choreography with equivalent story and IA; no blank canvas, apology-only screen, or misleading live-scene control remains. | evidence/experience/no-webgl-edition-captures/ |
| EXP-012 | P0 | U/Dev-RWD | ENG-004, ENG-005 | Responsive design lead | All-route reflow specification and correction pass. | Every public route passes 320, 360, 375, 390, 412, and 430px at 100%/200% zoom, tablets in both orientations, and desktop/ultrawide without unintended overflow. | evidence/responsive/all-route-reflow-matrix/ |
| EXP-013 | P0 | D/U/Dev-A11y | A11Y-005 | UI designer | Interaction-layer contrast and target-size remediation. | All essential text meets WCAG 2.2 AA; interactive targets are at least 44 by 44 CSS px or have equivalent non-overlapping spacing; decorative dimness never styles actionable copy. | evidence/accessibility/contrast-target-audit.pdf |
| EXP-014 | P1 | D/U/Dev-Motion | A11Y-004 | Motion/UX lead | Cross-route transition contract. | Every transition defines purpose, trigger, interruption, reduced-motion behavior, focus behavior, duration token, and failure fallback; content is visible without animation completion. | evidence/motion/transition-contract.md |
| A11Y-003 | P0 | U/Ct/Dev-A11y | A11Y-002, EXP-009 | Accessibility/content engineer | Semantic lifecycle narrative and status model. | Canvas meaning has equivalent text; lifecycle order is intelligible without sight; decorative readouts are hidden appropriately; no live-region chatter follows scroll continuously. | evidence/accessibility/semantic-narrative-transcript.md |
| A11Y-004 | P0 | U/Dev-Motion/Dev-A11y | A11Y-001 | Accessibility/motion engineer | Centralized motion-preference service and complete animation inventory. | One source governs CSS, React, Three.js, transitions, custom cursor, and optional sound-adjacent effects; OS changes and manual overrides propagate without reload or hydration drift. | evidence/accessibility/motion-inventory-and-tests.json |
| A11Y-005 | P0 | D/U/Dev-A11y | MET-003 | Accessibility specialist | Measured contrast, type-size, and target-size audit. | All text/control/state combinations are measured on actual lifecycle frames; zero WCAG AA failure and zero essential target below policy remain. | evidence/accessibility/measured-contrast-targets.csv |
| A11Y-006 | P0 | U/Dev-A11y | A11Y-002, EXP-005 | Accessibility engineer | Focus, dialog, menu, and route-transition behavior. | Keyboard order matches visual intent; modal/menu focus is trapped only while open and restored on close; escape works; SPA navigation moves focus to a useful destination. | evidence/accessibility/focus-modal-test-videos/ |
| A11Y-007 | P0 | U/Dev-RWD/Dev-A11y | EXP-012 | Accessibility QA | Zoom, text-spacing, forced-colors, and high-contrast compatibility. | Essential content and controls survive 200–400% zoom, WCAG text-spacing overrides, Windows forced colors, and increased contrast without overlap, clipping, or lost state. | evidence/accessibility/zoom-forced-colors-captures/ |
| ENG-010 | P0 | Ct/Dev-Markup/Dev-SEO | A11Y-002, A11Y-003 | Semantic HTML engineer | Content-model and document-semantics correction. | Headings, articles, figures, tables, lists, quotations, code, dates, captions, and links use native elements; DOM order remains meaningful with CSS and JS disabled. | evidence/engineering/semantic-html-validation.html |
| QA-002 | P0 | All | QA-001, ENG-001, A11Y-001, ENG-006, EXP-012 | Test engineer | Regression coverage for fallback, navigation, status, reflow, and preference paths. | CI asserts no-JS, no-WebGL, context failure, reduced motion, first-viewport navigation, history, 404, keyboard, console, network, and mobile-width behavior on every release candidate. | evidence/qa/fallback-nav-reflow-ci/ |

## Phase 4 — WebGL, web performance, and assets

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| PERF-001 | P0 | U/Dev-WPO | QA-001 | WebGL performance engineer | Shared scene/context lifecycle with an absolute context cap. | Gallery/history stress tests never exceed two live WebGL contexts; abandoned contexts, RAFs, observers, materials, textures, composers, and listeners are disposed. | evidence/performance/webgl-context-gallery-trace.json |
| PERF-002 | P0 | D/U/Dev-WPO | PERF-001 | Creative developer | Lightweight ambient treatment for inner routes. | Reading and content routes load no Three.js graph; their visual atmosphere uses authored lightweight assets/effects and exposes a stable seam for the later route-material direction without copying the full hero. | evidence/performance/inner-route-network-comparison.har |
| PERF-003 | P0 | U/Dev-WPO | QA-001 | Rendering performance engineer | Marker update pipeline without layout thrashing. | No getBoundingClientRect/computed-style read follows frame-critical writes; performance trace shows zero forced synchronous layout attributable to marker tracking. | evidence/performance/marker-frame-trace.json |
| PERF-004 | P0 | D/Dev-WPO | PERF-006 | Image engineer | Responsive Golden Record media set. | Largest fallback is at most 250KB and target variant at most 150KB; AVIF/WebP plus sane fallback, art direction, dimensions, and visual-difference approval are present. | evidence/performance/golden-record-asset-report.json |
| PERF-005 | P0 | U/Dev-WPO/Dev-Markup | PERF-006 | Frontend/image engineer | Intrinsic sizing for every image, video, poster, and embedded media item. | No media lacks width/height or aspect-ratio reservation; field CLS is at most 0.10 and target lab CLS at most 0.02 on every public route. | evidence/performance/intrinsic-media-cls-report.json |
| PERF-006 | P0 | Dev-WPO | QA-001 | Build/image engineer | Reproducible media optimization pipeline with CI guard. | Source media generates responsive dimensions/formats, records byte size, strips accidental metadata, preserves color, and fails CI on oversized or dimensionless output. | evidence/performance/asset-pipeline-manifest.json |
| PERF-007 | P0 | U/Dev-WPO | PERF-001, PERF-002 | Bundle engineer | Route-aware JavaScript graph and enforced budgets. | Hero graph is at most 240KiB gzip hard/210 target; pre-hero JS at most 85KiB hard/65 target; reading routes ship zero Three.js bytes; CI reports no duplicate engine copy. | evidence/performance/bundle-budget-report.html |
| PERF-008 | P0 | U/Dev-WPO | PERF-005, PERF-007 | Performance engineer | Field and lab Core Web Vitals gate. | Field p75: LCP at most 2.5s, INP at most 200ms, CLS at most 0.10; lab targets: 2.0s/150ms/0.02; TBT at most 200ms on the agreed mid-range profile. | evidence/performance/cwv-lab-field-dashboard.pdf |
| PERF-009 | P0 | D/U/Cr/Dev-WPO | A11Y-004, QA-002 | Hero architect | Capability ladder for high, balanced, low, static/no-WebGL, and reduced-motion editions. | Selection uses measured capability rather than user-agent labels; every tier has equivalent IA/story; user override persists; downgrade can occur before failure. | evidence/performance/capability-ladder-test-matrix.md |
| PERF-010 | P0 | U/Dev-WPO | PERF-001, PERF-009 | WebGL resilience engineer | Context-loss recovery and authored failure transition. | Forced loss at every lifecycle stage restores state once or transitions to the no-WebGL edition; no reload loop, black frame, duplicate context, or lost navigation occurs. | evidence/performance/context-loss-videos/ |
| PERF-011 | P0 | D/U/Dev-WPO/Dev-Motion | PERF-003, PERF-009 | WebGL performance engineer | Real-device frame-time certification. | High tier median at least 55fps and 1% low at least 40fps; low tier median at least 28fps and 1% low at least 20fps; no repeated frame above 200ms during normal scroll. | evidence/performance/real-device-fps-report.csv |
| PERF-012 | P0 | U/Dev-WPO | PERF-001, QA-002 | Performance QA | Ten-cycle navigation and heap stability test. | After ten home/content/history cycles, retained-heap growth is below 10% or 15MB, whichever is stricter for the device; no increasing RAF/listener/context count remains. | evidence/performance/ten-cycle-heap-profile.heapsnapshot |
| PERF-013 | P1 | D/U/Dev-WPO | PERF-006, PERF-007 | Performance lead | CSS, font, and HTML delivery budgets. | Shared CSS at most 50KiB gzip hard/35 target; initial font transfer at most 180KiB hard/120 target; route HTML at most 100KiB hard/60 target; no invisible-text dependency. | evidence/performance/css-font-html-budgets.json |
| PERF-014 | P1 | Ct/Dev-WPO | PERF-008, PERF-011 | Technical writer, performance engineer | Truthful public FPS, particle, and budget readouts. | Every visible technical number is produced from a reproducible measurement or clearly labeled design target; dynamic readouts degrade honestly and never fabricate live telemetry. | evidence/performance/public-readout-provenance.md |

## Phase 5 — Project proof and editorial content

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| CON-002 | P0 | Ct | CON-001 | Portfolio owner, Fleet stakeholder | Verified Fleet outcome dossier. | Problem, personal role, team, production constraints, baseline, outcome metrics, dates, public links, and unverifiable claims are signed off by a knowledgeable stakeholder. | evidence/content/fleet-outcomes-dossier/ |
| CON-003 | P0 | Ct | CON-001 | Portfolio owner, privacy reviewer | Sanitized Mars project evidence. | Redaction rules protect confidential/client data while retaining real constraints, decisions, artifacts, failure modes, and outcomes; each redaction is labeled rather than disguised. | evidence/content/mars-sanitized-proof/ |
| CON-004 | P1 | Ct | CON-001, CAM-002 | Portfolio owner | Approved third public flagship selection. | Project is publicly inspectable, materially different from Fleet/Mars, has sufficient process artifacts and outcomes, and strengthens rather than pads the portfolio. | evidence/content/third-project-selection.md |
| CON-005 | P1 | D/Ct | CON-002, CON-003, CON-004 | Portfolio owner, media producer | Raw flagship media intake. | Each flagship has approved high-resolution product captures, real process material, mobile/desktop states, captions, alt-text notes, ownership, and responsive crop plan. | evidence/content/project-media-manifest.csv |
| CON-006 | P2 | Ct | CON-002, CON-003 | Portfolio owner | Approved testimonial/third-party proof intake. | Every quote is attributable, permissioned, dated, specific to observed work, and editable/withdrawable by its author; generic praise is rejected. | evidence/content/testimonial-permissions/ |
| CON-009 | P1 | Ct | CON-010 | Author, technical editor | Revised source copy for existing posts. | Claims, chronology, code, links, technical terminology, summaries, and conclusions are fact-checked; each post has a clear reader promise and useful ending. | evidence/content/revised-post-manuscripts/ |
| CON-020 | P1 | Ct/Cr | CON-002, CON-003, CON-004 | Portfolio owner, case-study editor | Three complete flagship narrative manuscripts. | Each follows CON-001, exposes a consequential decision and rejected path, separates individual/team work, and ends with outcome plus honest limitation. | evidence/content/flagship-narratives/ |
| CON-021 | P1 | Ct/Cr | CON-020 | Portfolio owner | Original process-artifact package for the flagships. | At least three meaningful artifacts per flagship—diagram, trace, prototype, test, decision record, or iteration—are legible, captioned, permissioned, and connected to a decision. | evidence/content/process-artifact-package/ |
| CON-022 | P1 | Ct | CON-004 | Portfolio owner | Full third-project evidence dossier. | Evidence passes the same schema and fact-check threshold as Fleet and Mars; no portfolio slot exists solely to reach a count. | evidence/content/third-project-dossier/ |
| CON-023 | P1 | Ct/Cr | CON-001 | Portfolio owner | Source material for 4–6 Graveyard specimens. | Each specimen has a real premise, why it failed/stopped, what was learned, one authentic artifact, provenance, and an explicit status. | evidence/content/graveyard-specimens/ |
| CON-024 | P2 | Ct | CON-009 | Author, editorial lead | Editorial pipeline for 3–5 additional strong articles. | Every planned article has a distinct question, evidence/source list, draft owner, and reason to exist; no filler is published merely for volume. | evidence/content/article-pipeline.md |
| CON-025 | P1 | Ct | CON-007, CON-010 | Portfolio owner, editor | Master professional and personal bio. | Short, medium, and long versions agree on identity, location, role, experience, interests, availability, and human detail; claims map to evidence. | evidence/content/master-bio.md |
| CON-026 | P2 | Ct | CON-006 | Collaborators, editor | Collaboration testimony and working-style evidence. | At least two permissioned accounts describe concrete behaviors, trade-offs, or outcomes; they are not rewritten into anonymous marketing praise. | evidence/content/collaboration-testimony/ |
| CAM-004 | P0 | Ct | CON-020, CON-021, CON-022, CON-023, CON-025 | Content director, fact checker | Full-site claims, editorial, and proof signoff. | Every visible factual claim maps to approved evidence; all manifesto/SSR/fallback copies are synchronized; no placeholder, stale status, unexplained private claim, or unsupported superlative remains. | evidence/content/editorial-fact-check-signoff.pdf |
| CAM-005 | P0 | Ct/Dev-Markup | CON-005, CON-006, CON-021, CON-027 | Legal/privacy reviewer | Publication, licensing, attribution, privacy, analytics, and submission-reuse signoff. | Every shipped and campaign asset has a lawful basis and approved reuse scope; client confidentiality and personal data are protected; unresolved items are removed. | evidence/legal/final-publication-signoff.pdf |
| EXP-015 | P1 | D/U/Ct | CON-020, EXP-009 | Product/experience designer | Projects route reorganized as proof rather than a card index. | A juror can identify problem, role, stakes, outcome, and proof before opening each flagship; hierarchy privileges evidence and meaningful differences between projects. | evidence/experience/projects-proof-usability-test.md |
| EXP-016 | P1 | D/U/Ct | CON-009, CON-024, EXP-009 | Editorial/UX designer | Writing orientation system. | Readers can distinguish investigations, build notes, essays, and updates; each entry exposes question, value, format, reading commitment, and publication/update status without HUD decoding. | evidence/experience/writing-orientation-captures/ |
| EXP-017 | P1 | U/Ct | CON-009, ENG-010 | Editorial designer | Complete long-form post reading experience. | Articles have reliable progress, headings, figures, code, footnotes/citations, previous/next orientation, related reading, author/date/update context, and a useful end state on all devices. | evidence/experience/article-reading-audit.pdf |
| EXP-018 | P1 | D/U/Ct | CON-025, CON-026 | Content/experience designer | About route that establishes credibility before abstraction. | Identity, role, track record, values proven by examples, working style, current availability, and Contact are understandable within one normal viewport plus one scroll. | evidence/experience/about-comprehension-test.md |
| EXP-019 | P1 | D/U/Ct/Cr | CON-023, CON-021 | Experience/content designer | Hardened Graveyard and Behind the Build routes. | Both preserve their distinctive strength, add inspectable evidence, resolve mobile/reflow/a11y gaps, and avoid becoming self-congratulatory process galleries. | evidence/experience/graveyard-build-route-review.pdf |
| EXP-023 | P1 | D/Ct/Cr | CON-002, CON-020, CON-021 | Case-study designer, engineer | Proof-rich Fleet case study. | Includes a live/repository/public proof path where possible, role/team, constraints, key decision, rejected path, measured result, production evidence, and one honest limitation. | evidence/case-studies/fleet-final-review/ |
| EXP-024 | P1 | D/Ct | CON-003, CON-020, CON-021 | Case-study designer, privacy reviewer | Transparent redacted Mars case study. | Redactions are visible and explained; remaining evidence still supports judgment, role, constraints, technical decisions, and outcomes without reconstructing confidential information. | evidence/case-studies/mars-redaction-review/ |
| EXP-025 | P1 | D/Ct/Cr | CON-022, CON-020, CON-021 | Case-study designer | Third public flagship case study. | Public artifact is inspectable; story adds a different capability/scale; evidence quality matches Fleet/Mars; route is fully responsive, semantic, and accessible. | evidence/case-studies/third-flagship-final-review/ |
| EXP-026 | P1 | Ct | CAM-004 | Content designer | Replacement of self-praise callouts with evidence-led statements. | Every claim such as fast, scalable, polished, resilient, or thoughtful is replaced by a result, artifact, constraint, third-party observation, or removed. | evidence/content/self-praise-replacement-diff.md |
| EXP-028 | P1 | D/Ct/Cr | CON-009, CON-021 | Technical writer, forensic art director | Forensic edition of the memory-leak investigation. | Timeline, hypotheses, discarded leads, instrumentation, heap/trace evidence, root cause, fix, verification, and reusable method are inspectable; long identifiers reflow safely. | evidence/articles/memory-leak-editorial-review.pdf |
| EXP-029 | P1 | D/Ct/Cr | CON-009, CON-005 | Essay editor, art director | Physical-archive edition of the inspiration/Golden Record essay. | Essay connects artifact, influence, and resulting design decisions; imagery is responsive and licensed; physical-record treatment aids reading rather than decorating it. | evidence/articles/inspiration-essay-review.pdf |
| EXP-030 | P1 | D/Ct/Cr | CON-023 | Content/experience designer | Graveyard expanded to 4–6 fully evidenced specimens. | Every specimen is materially distinct, honest about stopping/failure, carries one authentic artifact and lesson, and remains scannable/operable on mobile and keyboard. | evidence/routes/graveyard-specimen-matrix.md |
| EXP-031 | P1 | D/Ct/Cr | CON-021, PERF-014 | Technical art director, hero engineer | Annotated engine-anatomy Behind the Build edition. | Diagrams map lifecycle timeline, rigs, shaders, camera, GPU simulation, fallbacks, budgets, and trade-offs to real source architecture; claims have reproducible evidence. | evidence/routes/behind-build-engine-anatomy-review.pdf |
| EXP-032 | P1 | D/U/Ct | CON-025, CON-026 | Portrait/editorial designer | Human-scale About edition. | Includes a specific portrait or authentic personal artifact, non-performative biography, collaboration evidence, availability, and direct Contact while preserving the cinematic world. | evidence/routes/about-human-scale-review/ |
| EXP-033 | P1 | D/U/Ct | EXP-010, CON-007 | UX/content designer | Dedicated Contact route. | One primary action works without JavaScript; alternate contact and availability are clear; spam/privacy choices are documented; success/error/retry states are accessible and on-brand. | evidence/routes/contact-task-test.md |

## Phase 6 — Route-specific art direction and motion

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| EXP-020 | P1 | D/Cr | EXP-015–019 | Creative director | One lifecycle-derived physical law assigned to each major route. | Every law changes composition or interaction meaningfully, fits the route content, remains legible without motion, and is not merely another particle background or HUD skin. | evidence/art-direction/route-physical-laws.md |
| EXP-021 | P1 | D/Ct/Cr | EXP-008, EXP-015 | Experience director | A second homepage peak based on proof and trust. | After the quiet dot, the experience reveals a compelling flagship artifact/outcome with equal editorial authority but without trying to out-shout the supernova. | evidence/art-direction/home-second-peak-review.mp4 |
| EXP-022 | P1 | D/U/Cr | EXP-015, EXP-020 | Art/interaction director | Orbital Projects composition. | Project relationships, scale, or trajectories determine layout; titles/outcomes remain directly scannable and keyboard reachable; the system has a clear list/static equivalent. | evidence/art-direction/projects-orbital-prototype/ |
| EXP-027 | P1 | D/U/Cr | EXP-016, EXP-020 | Editorial/interaction designer | Nebular Writing map. | Articles cluster by genuine theme and relation, support list/search orientation, expose readable metadata, and avoid forcing spatial navigation for essential discovery. | evidence/art-direction/writing-nebula-usability-test.md |
| EXP-034 | P1 | D/Ct | CON-010 | Design-system lead | Mono/HUD usage reserved for real instrumentation. | Inventory shows mono/readout styling only where values, state, navigation, or machine-like annotation justify it; editorial prose and section scaffolding use route-appropriate language. | evidence/design-system/hud-usage-audit.pdf |
| EXP-035 | P1 | D/Cr | EXP-020, EXP-034 | Art director | Distinct material system for each route. | Materials have named physical references and tokenized roles; route identity is recognizable in grayscale and static captures; all remain one brand without identical panels/lines. | evidence/art-direction/route-material-board.pdf |
| EXP-036 | P1 | D/Ct | EXP-016–019, EXP-035 | Typographic director | Route-specific typography rhythms. | Projects, Writing, articles, Graveyard, Behind the Build, About, and Contact have content-led hierarchy and measure; no repeated eyebrow scaffolding; display tracking stays at least -0.04em. | evidence/art-direction/route-typesetting-review.pdf |
| EXP-037 | P1 | D/U/Cr/Dev-Motion | EXP-014, EXP-020 | Motion director | Distinct route motion verbs governed by one shared physics grammar. | Each route has one named motion verb tied to meaning; interactions stay interruptible, frame-budgeted, keyboard/touch equivalent, and fully specified for reduced motion. | evidence/motion/route-motion-grammar.md |
| EXP-038 | P1 | U/Ct | EXP-017–019, EXP-033 | UX/content designer | Meaningful route continuations and endings. | Every route ends with a contextually relevant next action or reflection; no generic three-card footer; user can always return to canonical destinations and Contact. | evidence/experience/route-ending-map.md |
| ENG-011 | P1 | D/U/Dev-Motion | EXP-034–037 | Frontend/design-system engineer | Verified removal of relevant detector and anti-pattern findings. | Real height transitions, side-stripe callout, repeated decorative eyebrows, dead style rules, and other confirmed warnings are redesigned; false positives are documented rather than blindly changed. | evidence/engineering/detector-resolution-report.json |
| EXP-050 | P3 | D/Cr/Dev-A11y | A11Y-004, PERF-009 | Sound designer, accessibility lead | Opt-in spatial sound layer. | Sound is off by default, never required for meaning, starts only from explicit consent, has persistent mute/volume state, respects motion/data preferences, and adds a demonstrable narrative role. | evidence/optional/sound-accessibility-review.mp4 |
| EXP-051 | P2 | U/Cr | EXP-005, ENG-007 | Interaction/URL-state engineer | Shareable lifecycle-state deep links. | A copied URL opens a named state with canonical context, correct history/focus, fallback equivalence, and no bypass of loader/capability safety; invalid states recover cleanly. | evidence/optional/deep-link-matrix.json |
| EXP-053 | P3 | D/Cr | PERF-009, EXP-051 | Exhibition experience designer | Deliberate exhibition/autoplay mode. | Mode is explicit, pauseable, loop-safe, screen-burn/thermal aware, never becomes the default web experience, and retains visible navigation/credits. | evidence/optional/exhibition-mode-runbook.md |

## Phase 7 — Test, QA, and external validation

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| MET-004 | P0 | All | QA-002, PERF-009 | QA lead | Canonical device, browser, viewport, input, capability, network, and assistive-technology matrix. | Every blocking matrix cell has an environment, owner, last-run SHA, pass/fail state, and linked evidence; no unsupported gap is silently marked not applicable. | evidence/validation/canonical-test-matrix.csv |
| MET-005 | P0 | U/Dev-A11y | A11Y-003–007, MET-004 | Independent accessibility specialist | WCAG 2.2 AA audit plus disability-led usability signoff. | Zero critical/serious automated issue; manual keyboard/screen-reader/zoom/forced-colors tasks pass; at least four relevant disabled users complete essential tasks without blocker. | evidence/validation/accessibility-conformance-report.pdf |
| MET-006 | P0 | U/Dev-WPO | PERF-004–013, MET-004 | Independent performance engineer | Reproducible lab, real-device, and privacy-safe field performance signoff. | All hard budgets pass on the immutable SHA; target misses are explicit; cold/warm runs include variance; WebGL, fallback, reading, and long-session behavior are represented. | evidence/validation/performance-signoff.pdf |
| MET-007 | P0 | U/Ct | EXP-003–010, EXP-015–019, EXP-033 | UX research lead | Moderated first-time, one-handed mobile, prospective-client, and fallback usability study. | At least five users per primary cohort; at least 90% find Work within 15 seconds and Contact within 30; nobody is trapped; proof comprehension and task confidence meet study thresholds. | evidence/validation/usability-study-report.pdf |
| MET-008 | P1 | D/U/Cr/Ct | CAM-002, CAM-003, MET-002, MET-007 | Independent jury coordinator | Nine-person blind external jury and competitive review. | At least three design, three development, and three client/generalist reviewers score without contributor context; calibration spread is acceptable; MET-G01 floors and top-decile benchmark pass. | evidence/validation/blind-jury-scorebook.xlsx |
| MET-009 | P0 | All | MET-005–008, QA-003 | Program QA lead | Live evidence-backed gate dashboard and final readiness audit. | Every P0/P1 has acceptance evidence against one SHA; three consecutive release-candidate runs are clean; MET-G01 and MET-G02 status is signed, with no undocumented waiver. | evidence/validation/award-gate-dashboard.pdf |
| QA-003 | P0 | All | QA-002, PERF-008, MET-004 | QA/SRE/privacy team | CI, assistive-technology, real-device, synthetic, and privacy-safe RUM release system. | Build/type/unit/E2E/visual/a11y/budget/link/metadata gates block regressions; AT and device runs are recorded; RUM captures CWV/errors without fingerprinting or pre-consent nonessential storage. | evidence/qa/final-release-pipeline/ |
| EXP-054 | P2 | D/U/Dev-RWD | MET-004, PERF-011 | Device interaction designer | Physical-device polish for notches, safe areas, orientation, pointer classes, and haptics where appropriate. | Real-device matrix has no obscured control, accidental browser-gesture conflict, hover-only dependency, or unsupported haptic claim. | evidence/optional/device-physical-polish/ |

## Phase 8 — Production release, freeze, and recovery

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| REL-001 | P0 | U/Ct/Dev-WPO/Dev-SEO | MET-009, CAM-005, ENG-003, ENG-008, ENG-009 | DevOps, SEO, privacy leads | Production platform certification covering domain, HTTPS, CDN/cache, compression, routes, 404, robots/sitemap, canonicals/schema, analytics/consent, and global delivery. | Apex/www policy is singular; TLS/headers pass; dev routes are absent; crawl has zero broken link/mixed content/metadata blocker; nonessential analytics obey consent/GPC policy; three-region checks pass. | evidence/release/production-platform-certification.pdf |
| REL-002 | P0 | All | REL-001, MET-G01, MET-G02 | Release manager, SRE | Immutable release candidate, signed dossier, freeze, monitoring, alerting, backup, and rollback rehearsal. | One SHA owns all evidence; feature/content/code freezes are active; alert tests page an owner; last-known-good rollback plus CDN purge completes within 10 minutes twice; go/no-go is signed. | evidence/release/immutable-rc-dossier/ |
| REL-003 | P1 | All | REL-002 | SRE, archivist, campaign lead | Award-period change control and judged-build preservation. | Only evidence-backed hotfixes ship during the eligibility window; every change reruns blocking gates; uptime is at least 99.95%; exact source, assets, config, lockfile, captures, and deploy remain reconstructible. | evidence/release/award-period-continuity-log.md |

## Phase 9 — Awwwards submission and ethical SOTD to SOTM to SOTY campaign

| ID | Pri | Award dimension | Dependencies | Owner type | Deliverable | Measurable exit criteria | Evidence artifact |
|---|---:|---|---|---|---|---|---|
| CAM-006 | P0 | Ct | CAM-005, MET-001 | Campaign lead | Current Awwwards account/profile, collaborators, category, tags, technologies, and Honors positioning. | Names, roles, links, credits, primary category, tags, and technologies match the judged build and current Awwwards vocabulary; cycle/cutoff questions are confirmed before purchase. | evidence/submission/profile-taxonomy-checklist.pdf |
| CON-050 | P1 | Ct/Cr | CAM-004, CON-020, PERF-014 | Portfolio owner, awards editor | Approved submission narrative source. | Short/long copy explains the reverse lifecycle, personal contribution, proof, accessibility, performance discipline, and complete portfolio without unsupported award language or hidden limitations. | evidence/submission/submission-narrative-source.md |
| CAM-007 | P1 | Ct/Cr | CON-050, CAM-006 | Awards editor | Final field-length submission copy and juror context sheet. | Copy fits current form constraints, survives two independent fact/typo reviews, and communicates concept/value in the opening sentences without requiring the reel. | evidence/submission/submission-copy-final.md |
| CAM-008 | P0 | D/Cr | REL-002, CAM-007 | Art director, capture engineer | Production-derived 1600 by 1200 main thumbnail and still library. | Main image reads at feed size and is not a loader frame; at least 12 color-approved stills cover lifecycle, mobile, proof, content, and fallback editions with no hidden defect or fabricated state. | evidence/submission/still-library/ |
| CAM-009 | P1 | D/U/Cr/Ct | CAM-008 | Art director | Curated Awwwards Elements set. | Eight non-duplicative elements cover opening, supernova, giant/sun, nebula/dot, mobile access, flagship proof, Graveyard, and engine anatomy; each has a clear caption and accessibility note. | evidence/submission/elements-curation-board.pdf |
| CAM-010 | P1 | D/U/Cr | CAM-009, EXP-056 | Motion editor | Element loops, 30–45 second campaign trailer, and accessible master reel. | Captures come from production, show desktop and mobile/fallback quality, have clean pacing/crop/color, captions/transcript/poster frames, and no cut that hides loading or usability defects. | evidence/submission/video-master-pack/ |
| EXP-052 | P2 | D/Ct | ENG-009, CAM-008 | Brand/SEO designer | Route-specific OG cards. | Home and every major route have unique 1200 by 630 production-derived imagery, safe text areas, intrinsic dimensions, accurate alt/metadata, and passing platform preview validators. | evidence/submission/route-og-validation/ |
| CON-051 | P2 | Ct | CON-050, CON-027 | Portfolio owner, PR editor | Approved press-kit source material. | Bio, synopsis, credits, technical facts, accessibility facts, project facts, quotes, contact, and reuse permissions are complete and consistent with the submission. | evidence/submission/press-kit-source/ |
| CAM-011 | P2 | D/Ct | CAM-008, CAM-010, EXP-052, CON-051 | Brand/PR lead | OG/social variants and press kit. | 1200 by 630, square, portrait, landscape, poster, press still, caption, transcript, credit, and contact assets validate on target platforms and carry no unlicensed material. | evidence/submission/social-press-kit/ |
| EXP-056 | P2 | D/U/Cr/Ct | MET-G01, CAM-007 | Experience/motion director | Guided reel that honestly explains the full experience. | Reel covers concept, scroll arc, immediate mobile access, three proof moments, fallback/accessibility edition, and ending in 60–90 seconds; captions/transcript and source-state list are complete. | evidence/submission/guided-reel-storyboard.pdf |
| CAM-012 | P0 | All | CAM-006–011, REL-002 | Campaign producer, release manager | Submission dry run, asset upload validation, timing decision, and campaign staffing plan. | Two reviewers reproduce every field/credit/URL/asset; uploads validate; site is stable; approval contingency and five-day voting coverage are staffed; exact draft snapshot is approved. | evidence/submission/dry-run-and-timing-signoff.pdf |
| CAM-013 | P0 | All | CAM-012, REL-003 | Account owner, SRE | Frozen submission and approval watch. | Receipt, submission ID, URL, exact assets/fields, payment record, and timestamp are archived; status is checked; judged behavior stays stable; Awwwards requests use approved material only. | evidence/submission/submission-receipt-snapshot/ |
| CAM-014 | P0 | U/Ct | MET-001, CAM-003 | Campaign/community lead | Published ethical voting policy and permission-based outreach register. | Explicit bans cover fake/new accounts for voting, requested scores, incentives, vote swaps, bots, purchased/scraped lists, spam, or undisclosed manipulation; opt-outs and outreach are logged. | evidence/campaign/ethical-voting-policy.md |
| CAM-015 | P1 | All | CAM-013, CAM-014, REL-003 | Community lead, SRE | Nominee announcement, five-day SOTD campaign, Developer follow-through, and reusable SOTM campaign pack. | Outreach invites genuine eligible users to experience and vote honestly; cadence is bounded; useful process content is supplied; production is monitored; developer evidence and SOTM narrative are ready without score pressure. | evidence/campaign/sotd-sotm-campaign-log/ |
| CAM-016 | P1 | All | MET-G03, CAM-015, REL-003 | Creative director, campaign lead | SOTY narrative, annual reel, earned-media plan, preservation strategy, and campaign closeout. | MET-G04 passes; narrative connects concept, proof, engineering, accessibility, and reception; outreach is relevant and non-manipulative; judged build remains live; retrospective credits all contributors. | evidence/campaign/soty-campaign-package/ |
| MET-010 | P1 | All | CAM-015 or CAM-016 | Research lead | Award-stage outcome analysis and gate calibration. | Actual award result, qualitative feedback, eligible engagement, traffic quality, CWV/errors, predicted versus observed score, spend, incidents, and ethical compliance are documented; next-cycle decisions are explicit. | evidence/campaign/award-stage-analysis.pdf |
| EXP-055 | P3 | Cr | MET-G01, REL-002 | Creative director | One earned, discoverable easter egg grounded in the stellar/build narrative. | It rewards curiosity without hiding essential content, harming performance/accessibility, confusing analytics, or imitating a defect; removal would not break any task. | evidence/optional/easter-egg-review.mp4 |

## Human-input queue

These inputs cannot be invented by design or engineering agents. An agent may structure, redact, edit, and verify them, but the portfolio owner or named stakeholder must supply and approve the underlying facts.

| Queue | IDs | Human decision or material required | Blocks |
|---|---|---|---|
| Evidence foundation | CON-001, CON-007, CON-008, CON-010, CON-027 | Evidence schema, current availability, true counts/status, voice hierarchy, and complete authorship/license facts. | Program baseline, IA, all editorial work, legal signoff. |
| Fleet proof | CON-002, CON-005, CON-020, CON-021 | Outcomes, role/team facts, original media, narrative approval, and real process artifacts. | EXP-015, EXP-021, EXP-023, submission proof. |
| Mars proof | CON-003, CON-005, CON-020, CON-021 | Sanitized evidence, confidentiality boundaries, media, narrative approval, and artifacts. | EXP-024, legal signoff, flagship completeness. |
| Third flagship | CON-004, CON-005, CON-022 | Project choice, public evidence, media, role/outcomes, and permission to publish. | EXP-025, MET-G01 Content floor, MET-G04. |
| Third-party trust | CON-006, CON-026 | Specific permissioned testimonials and collaboration accounts. | EXP-018 and optional trust layer; absence must not block truthful launch copy. |
| Editorial pipeline | CON-009, CON-023, CON-024, CON-025 | Revised posts, Graveyard source material, additional article commitments, and master bio. | EXP-016–019, EXP-028–032. |
| Campaign copy | CON-050, CON-051 | Submission narrative approval, bio, quotes, press facts, and reuse permissions. | CAM-007, CAM-011, CAM-012. |

Human-input rules:

- Unknown metrics remain unknown; never reverse-engineer a flattering number.
- Redaction is visible and explained. It must not imply stronger evidence than the source allows.
- Team work names the team and isolates personal responsibility without erasing collaborators.
- Testimonials remain attributable and revocable; they are not rewritten into generic praise.
- Availability, project status, and counts have a review owner so they cannot silently become stale.

## Canonical test matrix

MET-004 owns the live matrix. This table defines the minimum blocking policy; exact device models are recorded in evidence and refreshed as browser/device releases change.

| Dimension | Blocking coverage | Required evidence |
|---|---|---|
| Mobile viewports | 320, 360, 375, 390, 412, and 430px at 100% and 200% zoom. | Full-page captures, overflow assertion, tap-target overlay, keyboard/touch trace. |
| Tablets | 768, 820, and 1024px in portrait and landscape. | Route and lifecycle captures, orientation-change trace, safe-area check. |
| Desktop | 1280, 1440, 1728/1920, and 2560px; DPR 1 and 2. | Route captures, scale/composition comparison, ultrawide readability check. |
| Browsers | Current and previous Safari, Chrome, Firefox, and Edge; current Samsung Internet. | Browser/version matrix, console/network log, visual diff. |
| Hardware | Current and previous iPhone class; mid-range Android; iPad; Apple Silicon Mac; integrated-GPU Windows; discrete-GPU Windows. | Model/OS/GPU profile, FPS/frame-time capture, thermal and memory run. |
| Inputs | Mouse, trackpad, keyboard only, touch, coarse pointer, screen reader. | Task video and pass/fail matrix for every essential action. |
| Accessibility | VoiceOver on macOS/iOS, NVDA on Windows, TalkBack on Android, forced colors, increased contrast, text spacing, 200–400% zoom. | Manual transcript, focus log, screenshots, participant study notes. |
| Preferences | OS reduced motion, site motion override in both directions, persisted/fresh state, data-saving/capability downgrade. | Network/module trace and state-transition E2E. |
| Failure modes | JavaScript disabled, WebGL unavailable, forced context loss, asset/CDN failure, blocked third party, offline/intermittent network, history restore. | Recovery video, status/console/network trace, accessible copy check. |
| Networks | Broadband, fast 4G, slow 4G, cold and warm cache. | Repeatable lab profile, median/variance, perceived-loader study. |
| Regions | At least Europe, North America, and Asia synthetic locations. | TTFB/LCP/asset waterfall, DNS/TLS/CDN confirmation. |

Blocking policy:

- A matrix cell is not passed by simulator evidence alone when a real-device row exists.
- No browser can be marked unsupported after submission unless the limitation is documented before MET-G01 and the authored capability ladder remains fully usable.
- A screenshot cannot prove focus, semantics, performance, context disposal, or assistive-technology behavior; those require the corresponding trace or manual record.
- All evidence names the commit SHA, production/staging URL, browser and device, preference/capability state, test data, tool version, and reviewer.

## Performance budgets

These are internal release gates, not official Awwwards thresholds. Hard limits block submission; targets guide refinement and cannot be advertised as measured results until PERF-014 provenance exists.

| Area | Hard limit | Target | Owner task |
|---|---:|---:|---|
| Live WebGL contexts | At most 2 | 1 outside intentional transition overlap | PERF-001 |
| Pre-hero JavaScript | 85KiB gzip | 65KiB gzip | PERF-007 |
| Hero JavaScript graph | 240KiB gzip | 210KiB gzip | PERF-007 |
| Three.js on reading routes | 0 bytes | 0 bytes | PERF-002, PERF-007 |
| Golden Record largest fallback | 250KB | 150KB | PERF-004 |
| Field LCP p75 | 2.5s | Better than 2.0s in lab profile | PERF-008 |
| Field INP p75 | 200ms | At most 150ms in lab profile | PERF-008 |
| Field CLS p75 | 0.10 | At most 0.02 in lab profile | PERF-005, PERF-008 |
| Lab TBT | 200ms | Below 150ms | PERF-008 |
| High-tier frame rate | Median at least 55fps; 1% low at least 40fps | Stable 60fps where display permits | PERF-011 |
| Low-tier frame rate | Median at least 28fps; 1% low at least 20fps | Stable 30fps | PERF-011 |
| Ten-cycle retained heap | Growth below 10% or 15MB, whichever is stricter | Flat after warm-up | PERF-012 |
| Shared CSS | 50KiB gzip | 35KiB gzip | PERF-013 |
| Initial fonts | 180KiB | 120KiB | PERF-013 |
| Route HTML | 100KiB | 60KiB | PERF-013 |
| Dimensionless media | 0 | 0 | PERF-005, PERF-006 |
| Repeated frame above 200ms | 0 during normal interaction | 0 | PERF-011 |

Measurement rules:

- Measure production builds, not the development server.
- Record cold and warm cache runs and report median plus variance, not the best run.
- Treat navigation availability and truthful perceived progress as performance outcomes, not only numeric metrics.
- Field monitoring is privacy-safe and cannot require consented analytics to keep the site operable.
- A capability downgrade is a successful performance strategy only if story, navigation, content, and proof remain equivalent.

## Proof package

MET-G01 cannot pass on narrative polish alone. The minimum proof package is:

| Package | Required contents | Acceptance owner |
|---|---|---|
| Fleet flagship | Problem/stakes; personal role and team; production constraints; decisive choice and rejected path; original artifact; outcome with baseline/source; public link or inspectable artifact; accessibility/performance evidence; limitation. | CON-002, EXP-023, CAM-004 |
| Mars flagship | Same evidence schema; explicit confidentiality boundary; visible redactions; enough sanitized artifact detail to support judgment; no reconstructed client data. | CON-003, EXP-024, CAM-005 |
| Third public flagship | Publicly inspectable work, materially different capability, full process/outcome dossier, responsive media, and evidence quality equal to the other flagships. | CON-004, CON-022, EXP-025 |
| Graveyard | Four to six real specimens with premise, stopped/failed reason, authentic artifact, lesson, status, and provenance. | CON-023, EXP-030 |
| Behind the Build | Annotated architecture, timeline/rig/shader/camera/simulation anatomy, capability/fallback ladder, budgets, traces, trade-offs, and reproducible public readouts. | CON-021, EXP-031, PERF-014 |
| Writing | Fact-checked existing posts, complete reading system, forensic memory-leak evidence, physical-archive essay, and a bounded pipeline of additional non-filler articles. | CON-009, CON-024, EXP-016, EXP-017, EXP-028, EXP-029 |
| About/Contact | Master bio, concrete working style, permissioned collaboration proof where available, current availability, direct contact, privacy-safe failure/success states. | CON-025, CON-026, EXP-032, EXP-033 |

Evidence quality rules:

- Outcomes state baseline, unit, measurement window, source, and the contributor's actual influence.
- Process artifacts must illuminate a decision; decorative screenshots do not count.
- Repository/live links are preferred but never used to leak confidential information.
- Private work can remain private; the case study must then say exactly what cannot be shown and why.
- No case study passes merely because it has many screens or a cinematic route.

## Awwwards submission asset checklist

| Asset | Requirement | Owner |
|---|---|---|
| Profile and credits | Accurate bio, avatar, URL, category, tags, technology, collaborator usernames, roles, and rights. | CAM-006 |
| Main thumbnail | 1600 by 1200, production-derived, feed-legible, signature black-hole identity, no loader ambiguity. | CAM-008 |
| Still library | At least 12 approved 1600 by 1200 masters spanning lifecycle, mobile, proof, content, and fallback quality. | CAM-008 |
| Elements | Eight distinct elements with caption, state/route, poster/still, video where useful, and accessibility note. | CAM-009 |
| Element videos | Clean production captures, validated upload format, consistent crop/color, loop-friendly edit, no hidden stalls or defects. | CAM-010 |
| Guided reel | 60–90 seconds covering concept, mobile access, proof, fallback/accessibility, and ending; captioned and transcribed. | EXP-056, CAM-010 |
| Campaign trailer | 30–45 seconds plus a short cutdown; hook in opening seconds; desktop and mobile shown honestly. | CAM-010 |
| Submission copy | Short/long descriptions, concept, role, credits, proof, accessibility/performance facts, no unsupported superlative. | CON-050, CAM-007 |
| Social/OG | Unique route cards plus square, portrait, landscape, poster, press variants; validated previews and alt copy. | EXP-052, CAM-011 |
| Press kit | Bio, synopsis, facts, credits, quotes, approved imagery/video, captions/transcript, contact, reuse terms. | CON-051, CAM-011 |
| Legal/privacy | Asset reuse, font/image/video rights, project permission, attribution, analytics/consent, and privacy signoff. | CAM-005 |
| Dry-run archive | Exact form fields, upload checks, two-reviewer proof, draft snapshot, target cycle confirmation, staffing, and go/no-go link. | CAM-012 |
| Submission archive | Receipt, ID, payment, URL, submitted assets/copy/credits, timestamp, judged SHA, and approval communications. | CAM-013 |

## Ethical voting policy

Allowed:

- Announce the nomination publicly and explain the work.
- Invite existing peers, collaborators, readers, clients, and communities with a genuine relationship to experience the site and vote honestly if eligible.
- Share useful behind-the-scenes material, accessibility/performance notes, and project evidence during the voting period.
- Send a bounded reminder where the recipient reasonably expects updates and can opt out.
- Thank voters and contributors without asking what score they gave.

Prohibited:

- Creating or asking anyone to create an account only to vote.
- Asking for a particular score, suggesting that only a high score is supportive, or screening out critical feedback.
- Buying votes, offering prizes/discounts/access, exchanging votes, coordinating score rings, or using bots.
- Purchased/scraped lists, repetitive unsolicited direct messages, or pretending a mass message is personal.
- Hiding sponsorship, paid placement, conflicts, contributor relationships, or coordinated outreach.
- Shipping a materially different site to jurors than the one shown in campaign assets.

Operational controls:

- CAM-014 owns the written policy and outreach register.
- Campaign success is measured by genuine qualified visits, completed experiences, useful feedback, and production health—not a target number of perfect scores.
- Any suspected manipulation stops outreach immediately and is escalated to the campaign lead; questionable votes are never defended as growth tactics.

## Suggested isolated worktree and review batches

Every batch is implemented by a subagent in its own git worktree, built and verified there, committed, then stopped for human review. No branch is merged, removed, or rebased onto main without explicit human approval.

| Batch | Canonical scope | Merge dependency |
|---|---|---|
| B00 — program/evidence | CAM-001–003, MET-001–003, CON-001, CON-007/008/010/027, EXP-039 | None; documentation/evidence only. |
| B01 — fatal fallbacks | QA-001, ENG-001, A11Y-001, EXP-001/002/006, ENG-002/003 | B00 review. |
| B02 — semantics/reflow/recovery | ENG-004/005/008/009/010, A11Y-002/003, EXP-011/012 | B01 accepted where shared layout overlaps. |
| B03 — mobile IA | EXP-003–005, EXP-008–010, ENG-006/007 | B00 IA/evidence; coordinate with B01 loader controls. |
| B04 — accessibility system | A11Y-004–007, EXP-013/014, QA-002 | B01–B03 accepted. |
| B05 — WebGL lifecycle/WPO | PERF-001–003, PERF-007/009–012 | B01 and B03 accepted; no content-route art direction bundled. |
| B06 — asset delivery | PERF-004–006, PERF-008/013/014 | B05 measurement seam agreed. |
| B07 — flagship proof | CON-002–005/020–022, EXP-015/023–026, CAM-004/005 | Human evidence ready; no invented placeholder outcomes. |
| B08 — publication routes | CON-009/023–026, EXP-016–019/028–033 | B02 semantics and B06 asset pipeline accepted. |
| B09 — route art direction | EXP-020–022/027/034–038, ENG-011, PERF-002 | B07/B08 content stable enough to art-direct. |
| B10 — optional experience | EXP-050/051/053–055 | MET-G01 otherwise green; each option gets its own accept/reject review. |
| B11 — validation/release | MET-004–009, QA-003, REL-001–003 | All required implementation batches accepted. |
| B12 — submission/campaign | CAM-006–016, CON-050/051, EXP-052/056, MET-010 | MET-G01/MET-G02 and immutable release accepted. |

## Explicit non-goals

- Do not redesign or reverse the core reverse-stellar-lifecycle concept, its single lifecycle-direction seam, or the black-hole-to-pale-dot scale story.
- Do not add automatic sound. EXP-050 is explicitly opt-in and optional.
- Do not hide loaders, mobile access costs, fallback quality, frame drops, inaccessible states, weak case studies, or other defects through selective reel editing.
- Do not create fake votes, score rings, incentives, vote swaps, bots, throwaway accounts, or spam campaigns.
- Do not inflate the portfolio with weak projects, filler articles, fabricated metrics, generic testimonials, or decorative process artifacts.
- Do not make reading routes load the full Three.js scene merely to maintain atmosphere.
- Do not use route-specific art direction as permission to fragment navigation, semantics, typography legibility, or accessibility behavior.
- Do not make no-JS, no-WebGL, reduced-motion, or low-capability editions feel like punishment tiers.
- Do not turn public FPS, particle, budget, count, or status labels into fictional cockpit flavor.
- Do not submit while the live site and captured submission assets differ materially.
- Do not merge any implementation worktree on verification alone; explicit human review and approval remain mandatory.
