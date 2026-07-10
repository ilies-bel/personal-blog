# Route Physical Laws — EXP-020

## Purpose

Every major route derives one physical law from the stellar lifecycle that governs
the hero engine.  That law is not decorative — it determines layout geometry,
element density, edge treatment, rhythm, materials, and the single named motion
verb for interaction.  Routes authored under these laws must be identifiable in
blind grayscale screenshots without navigation chrome.

This spec is the upstream source for EXP-022 (Projects composition), EXP-027
(Writing map), EXP-035 (route material system), EXP-036 (route typography rhythms),
and EXP-037 (route motion verbs).  Each downstream task must satisfy the grayscale
blind test independently and together.

---

## Lifecycle Anchor

The hero engine reverses the stellar lifecycle: black hole → red giant → yellow star
→ nebula → pale blue dot.  Each major route corresponds to one phase of this arc and
inherits the physical law that governs that phase.

| Route | Lifecycle phase | Physical law |
|---|---|---|
| Projects | Yellow star / main-sequence | Sustained orbit |
| Writing | Nebula | Dispersed matter coalescing |
| Graveyard | Post-supernova / white dwarf | Thermal decay |
| Behind the Build | Stellar formation / red giant | Interior layers exposed |
| About | Pale blue dot | Scale contraction to human |
| Contact | Signal transmission | Electromagnetic propagation |

---

## Governing Non-Goals

The following constraints apply to all six routes and cannot be overridden by any
route's physical law.

**No new particle backgrounds.** No route adds a Three.js scene or HUD overlay.
Route pages use CSS-only materials; the hero engine is the home page only.

**Navigation legibility.** Nav chrome (header, in-page landmark links) must be
reachable and semantically identifiable on all routes regardless of the law's
density or material system.

**Semantic structure.** Physical-law composition must not break heading hierarchy
(one `<h1>` per page, logical `<h2>`/`<h3>` order) or ARIA landmark regions.

**Accessibility floor.** No motion verb, material, or layout geometry may reduce
contrast below WCAG AA (4.5:1 for body text, 3:1 for UI components).  Every motion
verb must have a fully specified reduced-motion path that is tested.

**Static equivalent.** Every spatial or clustering composition must have a
list/static equivalent reachable by keyboard — orbital clusters, nebular maps, and
layered anatomy must all degrade gracefully.

---

## 1. Projects — Sustained Orbit

**Lifecycle phase:** Yellow star / main-sequence stability

**Physical law:** Orbital mechanics — bodies in sustained orbit are held by mutual
gravity; their position encodes consequence, trajectory, and mass.  A shipped project
is a permanent consequence of past decisions and a constraint on future ones.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Projects are positioned relative to one another, not to a neutral grid. The dominant axis is orbital distance from a gravitational center (the most recent, highest-consequence project). Elements at greater distance are older or lighter in mass. |
| Density | High. Every project card carries its full proof surface: title, role, outcome, and evidence link. No card is empty or placeholder. |
| Clustering | Related tools orbit closer; solo experiments orbit wide. The spatial relationship between cards encodes relational distance, not alphabetical or chronological order. |
| Edge treatment | Strong, defined edges. Orbital paths have sharp boundaries. Card edges do not feather, dissolve, or blur. |

### Rhythm

Reading tempo is deliberate and slow — orbital rhythm is not fast.  Wide margins
surround each project so the eye rests before moving to the next.  Vertical
separation between projects is proportional to relational distance, not date.

### Materials

Surface: dense, opaque panels.  Projects have mass; they do not float.  
Color: desaturated amber-to-neutral (yellow-star room tint, pulled cool).  
Accent gold is used only for active or selected state — never as decoration.

### Interaction — motion verb: *arc*

| Trigger | Behavior |
|---|---|
| Hover | The card arcs in from a flat state — a rotational sense, not a lift or fade. The leading edge moves first. |
| Keyboard focus | Focus ring traces an orbital path — rounded and slow-pulse, not a rectangle. |
| Page entry | Cards enter with a staggered arc, each from a slightly different orbital angle, settling into final position. Stagger interval: 80 ms. |
| Reduced motion | Arc collapses to instant cross-fade. Orbital focus ring becomes a static rounded outline. Entry stagger is instant. |

### Legible without motion

In a static grayscale capture: the arrangement of cards around a gravitational
center is visible.  Card size and inter-card spacing encode mass.  Hierarchy is
readable without color or animation.

### Must NOT

- Fragment each project into multiple sub-panels that break keyboard tab order.
- Use identical radii for all projects (collapses the orbital law into a flat list).
- Omit a list/static equivalent; the orbital composition must coexist with a
  keyboard-reachable fallback index.

---

## 2. Writing — Dispersed Matter Coalescing

**Lifecycle phase:** Nebula

**Physical law:** Gravitational collapse — a dispersed gas cloud slowly gathers into
clusters; the clusters are emergent, not predefined.  Articles begin as dispersed
observations and coalesce into themes.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Articles cluster by genuine thematic gravity (investigation / build-note / essay / failure). Clusters are visually distinct; their spatial relationship is relational, not alphabetical or chronological. |
| Density | Variable and informative. A cluster with many articles is visibly denser than a cluster with one. Density is data — a sparse cluster is not a layout error. |
| Edge treatment | Soft. Cluster boundaries are implied by whitespace, not drawn borders. No boxes with full-perimeter strokes on cluster containers. |

### Rhythm

Reading tempo is exploratory — the user navigates a cloud, not a list.  Vertical
rhythm is non-uniform within a cluster (discovery spacing) and consistent between
clusters (equal cluster-to-cluster margin so the reader can count the themes).

### Materials

Surface: semi-transparent.  Articles in a nebula may overlap slightly at the cluster
edge without obscuring content.  
Color: teal-to-indigo range (nebula room tint).  Highlights are cool.  No warm tones.  
Outer cluster container edges dissolve — not a solid box.

### Interaction — motion verb: *coalesce*

| Trigger | Behavior |
|---|---|
| Topic filter active | Unrelated articles drift to 20 % opacity (they do not leave the layout); the matching cluster brightens and tightens its inter-card gap. |
| Hover over article card | Nearby siblings shift fractionally toward the hovered card — local gravitational pull. Maximum shift: 4 px. |
| Page entry | Articles begin at their final positions minus a 6 px outward offset; they drift inward to cluster position. Duration: 600 ms, ease-out. |
| Reduced motion | All drift and pull collapses to opacity transitions only. Entry positions are final positions from first paint. |

### Legible without motion

In a static grayscale capture: distinct clusters occupy identifiable regions of the
page.  Cluster density differences are visible — one region is clearly denser than
another.  A reader can count the themes without color or animation.

### Must NOT

- Force spatial navigation to find an article. A list/search equivalent must always
  be available alongside the cluster composition.
- Apply the coalesce motion verb to article metadata (dates, reading times).
  Metadata is anchored, not drifting.
- Produce clusters of identical density and size regardless of article count. If all
  clusters look the same, the physical law has not been applied.

---

## 3. Graveyard — Cooling / Collapse / Residue

**Lifecycle phase:** Post-supernova / white dwarf cooling

**Physical law:** Thermal decay — a collapsed star loses heat monotonically.  Its
surface dims, its radius contracts, its rotation slows.  What remains is the core:
dense, dim, and permanent.  A graveyard project is not deleted — it is cooled.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Narrow column — a white dwarf has a smaller radius than the star that produced it. All projects are presented in a contracted reading column. No wide-margin hero cards. |
| Density | Extremely high. Every line carries meaning: name, role, date of ending, cause, lesson. No decorative whitespace inside a specimen. |
| Edge treatment | Hard, cold hairlines. Nothing dissolves or feathers. The boundary of a cooled remnant is precise. Borders are 1 px, not rounded. |

### Rhythm

One project at a time.  Vertical rhythm is consistent: each specimen occupies the
same height (death is democratic).  No horizontal scrolling.  Everything descends.

### Materials

Surface: flat, matte, very low luminance.  No reflections, no gloss, no gradients.  
Color: near-neutral with a single cool accent (indigo or gray-blue) for active state.
No amber, no warm tones — this is the cooling phase, not the orbital phase.  
Border: hairline, cool-gray.

### Interaction — motion verb: *contract*

| Trigger | Behavior |
|---|---|
| Hover | The hovered specimen contracts very slightly — a barely perceptible inward pull (scale: 0.985). The inverse of expansion. |
| Keyboard focus | Focus ring is a 1 px rectangular outline — not glowing, not rounded. A forensic boundary. |
| Page entry | Specimens appear as if cooling into visibility — a very slow fade from black. Duration: 900 ms per specimen, staggered at 120 ms intervals. Not a slide. Not a bounce. |
| Reduced motion | Entry fade is instant. Hover contraction removed. Focus ring is static. |

### Legible without motion

In a static grayscale capture: the contracted column, hairline borders, and flat
matte surface must distinguish Graveyard from every other route.  The composition
reads as categorically different from Projects (wide orbital arrangement) and Behind
the Build (layered strata).

### Must NOT

- Present failed projects as achievements. The physical law is decay, not eulogy.
  Copy must not soften or reframe failure as triumph.
- Use amber or gold from the Projects material system. These are cooled things.
- Produce a layout wider than the reading column. The contrast with Projects' orbital
  spread is a semantic requirement, not optional.

---

## 4. Behind the Build — Exposed Layers / Engine Anatomy

**Lifecycle phase:** Stellar formation / red giant expansion

**Physical law:** Internal structure revealed — as a star expands, its internal layers
become visible.  The convection zone, radiation zone, and core are exposed by the
expansion.  This route is the site's own engine anatomy: the reader sees the
interior — decisions, trade-offs, and implementation details normally hidden inside
the finished surface.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Layered strata — sections are stacked as geological cross-sections, each layer labeled at its left edge with what lies beneath. The depth axis is explicit (labeled, not implied by shadow). |
| Density | Progressive. The top of the page is sparse (overview, framing); the bottom is densest (implementation specifics). Like reading deeper into the star's interior as you scroll. |
| Edge treatment | Exposed and cut — raw edges suggest a cross-section surface, not a finished facade. Section dividers are stepped or irregular, not smooth ruled lines. |

### Rhythm

Reading tempo is analytical.  Each layer invites close reading before descending.
Typography scales inversely with depth: larger type and more leading at the top
(high altitude, broader view), smaller type and denser paragraph blocks at the
bottom (deep interior, fine grain).

### Materials

Surface: intentionally unfinished — textural references to geological strata or
circuit board cross-sections (achieved in CSS, not Three.js).  
Color: desaturated deep orange-red (red-giant room tint, pulled toward neutral).
Warm, but not the stable amber of the Projects orbital system.  
Section labels at the left edge are in a monospace or condensed typeface to reinforce
the annotation/cross-section reading.

### Interaction — motion verb: *peel*

| Trigger | Behavior |
|---|---|
| Hover over section header | The content layer peels open — the header remains anchored while the body reveals from beneath it, like lifting a geological stratum. Ease: cubic-bezier(0.2, 0, 0.1, 1), 350 ms. |
| Keyboard focus on section header | Focus ring is a bracket pair: `[` at left edge, `]` at right edge — like a code annotation or cross-section label. Not a rectangle, not a glow. |
| Page entry | Layers slide in from the left (cross-section reading direction), each at a staggered delay top-to-bottom. The reader sees the strata assembling. Stagger: 100 ms per layer. |
| Reduced motion | Layer slide collapses to opacity fade. Peel removed. Focus brackets remain (they are typographic, not animated). Entry stagger is instant. |

### Legible without motion

In a static grayscale capture: the strata labels at the left edge and the density
gradient from top (sparse) to bottom (dense) must distinguish Behind the Build from
every other route.  The cross-section reading direction (left-edge anchoring) is
visible in the static state.

### Must NOT

- Use the card treatment from Projects. This is anatomy, not an orbital system.
  Cards here are cross-sections, not orbiting objects.
- Hide the layer structure behind a flat surface. The law requires interior to be
  exposed, not hinted at by a collapsed accordion.
- Gate essential content behind hover or interaction. All layers must be scannable
  without any interaction — peel is progressive enhancement, not a content gate.

---

## 5. About — Return from Cosmic to Human Scale

**Lifecycle phase:** Pale blue dot

**Physical law:** Scale contraction — the final beat of the lifecycle is the return
to a single human planet seen from deep space.  The frame contracts from cosmic to
comprehensible; the subject is a person, not a system.  The About route is that
final beat: one person, small against the cosmos, but the whole point.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Centered single column, narrow. Everything organized around one axis: the person. No multi-column layouts. |
| Density | Sparse. Wide margins, large leading, few words per line. After Projects' density and Behind the Build's complexity, this is relief. |
| Edge treatment | None. No visible edges, no borders, no panels. Content floats over the deep-blue backdrop. Edges are the silence around the words. |

### Rhythm

Slow and personal — the longest intended dwell time in the site is here.  Vertical
rhythm is even and unhurried.  No section feels urgent.  Paragraph spacing is
generous: at least 1.75 × body font-size.

### Materials

Surface: none intentional.  The backdrop (pale-blue-dot room tint: deep blue, very
low luminance) shows through.  Text is placed directly over it, no panel or card
layer in between.  
Color: pale blue / deep indigo.  No warm colors on this route — the blue dot is the
antithesis of the amber orbital system.  
Signature or name treatment: slightly brighter than body text to mark the
focal human point.

### Interaction — motion verb: *settle*

| Trigger | Behavior |
|---|---|
| Page entry | Text settles from a very slight upward offset (6 px) — not a dramatic rise, a gentle arrival. As if the camera has stopped moving and focus has resolved. Duration: 700 ms, ease-out. |
| Hover on name or signature | Subtle brightening — recognition, not expansion. The element does not change size or position. Luminance increase: 12 %. |
| Keyboard focus | Focus ring is a soft glow — not a box, not a bracket. A halo effect at 4 px radius, 40 % opacity. |
| Reduced motion | All entry motion removed. Hover brightness removed. Focus glow is static (rendered as a box-shadow at zero blur transition). |

### Legible without motion

In a static grayscale capture: the centered single column with maximal whitespace and
no panels must distinguish About from every other route.  The page should read like a
letter, not a layout.  The absence of edges is as identifiable as their presence.

### Must NOT

- Add decorative panels, cards, or borders. The no-surface law is definitive; any
  contained box breaks it.
- Use warm materials (amber, gold, red). This is the blue-dot phase.
- Present the person as a résumé — date-sorted bullets, job titles as primary
  headlines.  The law is human scale and direct address, not credential listing.

---

## 6. Contact — Transmission and Response

**Lifecycle phase:** Signal transmission across deep space

**Physical law:** Electromagnetic propagation — a signal sent from a point source
travels outward at the speed of light, decays in intensity with the inverse-square
law, and awaits a response that may take long.  Transmission is deliberate and
directed; response is delayed and uncertain.

### Composition

| Dimension | Rule |
|---|---|
| Layout geometry | Point-source focal — one transmitter (the send action) is the gravitational and visual center. Form fields lead inward toward it. Directional lines radiate outward from the send area to suggest the signal path. |
| Density | Minimal. The form is all. No content surrounds the transmission point. |
| Edge treatment | Thin, directional lines that emanate from the focal point. Not static decorative borders — these lines carry implied direction (outward from center). |

### Rhythm

Deliberate and brief: fill, review, send.  Three beats, no more.  Generous spacing
between form fields — each field is its own transmission parameter and deserves
visual separation.  No auxiliary sections, no content blocks below the form.

### Materials

Surface: deep space — near-black background.  The signal is the thing, not the
surface it sits on.  
Color: cool deep blue / indigo.  Single active-state accent that pulses at a
carrier-wave frequency when the form is ready to send — never flashing (WCAG 2.3.1:
no more than 3 Hz).  
Directional lines: hairline, cool-gray, opacity 30–50 %.

### Interaction — motion verb: *transmit*

| Trigger | Behavior |
|---|---|
| Field focus | A subtle ripple expands from the focused field — inverse-square decay in all directions. Duration: 400 ms. Opacity from 60 % to 0 %. |
| Form submission | The send button transmits — its label shifts outward (translate-x: 4 px) and a propagation indicator moves in the same direction. The form settles to a held/sent state while awaiting response. No bounce, no expansion. |
| Page entry | Elements converge from outside the viewport (signals arriving), moving inward toward the form's gravitational center. Duration: 500 ms per element, staggered at 60 ms. |
| Reduced motion | Ripple and convergence removed. Transmit animation is an opacity change only (label cross-fade to confirmation state). |

### Legible without motion

In a static grayscale capture: the point-source focal layout, radiating hairlines,
and near-black deep-space background must distinguish Contact from every other route.
The minimal form on a dark ground is immediately recognizable as distinct from the
matte-flat Graveyard (which is dark but column-dense) and the About route (which is
dark but text-only, no form, no directional lines).

### Must NOT

- Produce a generic centered form with no directional character. The transmission
  law requires the signal direction to be visible in the static composition.
- Reuse the Graveyard's near-black material without the directional lines.  Graveyard
  is matte and contracting; Contact is directional and expanding.  They share dark
  backgrounds but their edge treatment is opposite.
- Block or defer form submission feedback. The transmit verb requires visible
  confirmation that the signal has been sent — an ambiguous button state is a failure
  of the physical law.

---

## Cross-Route Verification

### The Grayscale Blind Test

Given six grayscale screenshots of the six routes (no nav chrome, no color), a
reviewer who has read this spec can correctly identify each route:

| Route | Grayscale signature |
|---|---|
| Projects | Orbital cluster arrangement; dense opaque cards; strong defined edges; wide lateral spread |
| Writing | Variable-density clusters; soft or absent cluster edges; exploratory inter-card spacing |
| Graveyard | Contracted narrow column; hairline borders; extreme density; flat matte surface |
| Behind the Build | Left-edge stratum labels; density gradient from sparse top to dense bottom; cut/stepped dividers |
| About | Single centered column; maximum surrounding whitespace; no edges or panels; letter-like |
| Contact | Point-source focal with radiating hairlines; near-black ground; minimal isolated form |

**Negative test:** If any two routes share the same grayscale signature, the laws
have not been applied.  The most likely collision pairs to audit:

- Projects ↔ Behind the Build (both have structure and density — distinguish by
  orbital spread vs. strata column and edge character)
- Graveyard ↔ Contact (both have dark grounds — distinguish by column density vs.
  point-source focal and directional lines)
- About ↔ Writing (both have open whitespace — distinguish by single column vs.
  multi-cluster arrangement)

### Acceptance Criteria (EXP-020)

- [ ] Each of the six major routes has exactly one assigned lifecycle phase and one
      named physical law documented in this spec.
- [ ] Every law produces a distinct grayscale signature (verified against the blind
      test table above).
- [ ] Each law specifies: layout geometry, density, edge treatment, rhythm,
      materials, motion verb with full trigger/behavior table, reduced-motion path,
      and at least one must-not constraint.
- [ ] No law introduces a new Three.js scene or HUD overlay.
- [ ] No law reduces contrast below WCAG AA or breaks heading hierarchy — all
      legibility and semantic requirements remain satisfied.
- [ ] Downstream tasks EXP-022, EXP-027, EXP-035, EXP-036, EXP-037 each reference
      the column of this spec that governs their scope (composition, materials,
      rhythm, motion verb respectively).

---

## Task Assignment Matrix

| Task | Route(s) | Column of this spec that governs it |
|---|---|---|
| EXP-022 | Projects | Composition, Rhythm, Interaction (arc verb) |
| EXP-027 | Writing | Composition, Rhythm, Interaction (coalesce verb) |
| EXP-035 | All routes | Materials column for each route |
| EXP-036 | All routes | Rhythm column for each route |
| EXP-037 | All routes | Interaction / motion verb column for each route |

Each downstream task implements one or more columns of this spec for one or more
routes.  When a downstream task is complete, re-run the grayscale blind test across
all routes to confirm no two routes have converged in signature.
