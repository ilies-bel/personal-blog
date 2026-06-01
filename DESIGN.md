---
name: Iliès
description: A personal blog and portfolio where the design is the product — a cobalt blue-hour terminal set in Geist.
colors:
  bg: "oklch(0.17 0.018 252)"
  surface: "oklch(0.205 0.022 252)"
  ink: "oklch(0.95 0.006 252)"
  muted: "oklch(0.72 0.012 252)"
  faint: "oklch(0.58 0.014 252)"
  cobalt: "oklch(0.66 0.15 252)"
  cobalt-strong: "oklch(0.70 0.15 252)"
  amber: "oklch(0.82 0.125 75)"
  line: "oklch(0.32 0.022 252)"
typography:
  display:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(2rem, 5.6vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(2rem, 5.5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.075rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: '"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace'
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "0.18em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.25rem"
  lg: "2rem"
  xl: "3rem"
components:
  link:
    textColor: "{colors.cobalt}"
  link-hover:
    textColor: "{colors.ink}"
  brand:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  post-card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1rem 0.75rem"
  post-card-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cobalt}"
  tag:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.55rem"
  code-inline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.15em 0.4em"
---

# Design System: Iliès

## 1. Overview

**Creative North Star: "The Blue-Hour Terminal"**

This is a personal blog and portfolio where the design *is* the product. It exists to make a hiring manager remember the engineer behind it in the few seconds they spend deciding whether to keep reading. The whole site lives in one room: a dark, cobalt-tinted space lit by the glow of a display at blue hour — that brief window after sunset when the sky goes deep indigo and the only warm light in the room is the screen itself and the amber of a distant lighthouse. The hero reads the visitor's browser and reports it back like a navigational instrument; the reading pages are the calm after, lit by the same cobalt, in the same Geist.

The system is built from one committed move done impeccably, not a pile of effects. A single cobalt seed (`oklch(0.478 0.136 251.8)`) generates every surface, line, and link; a single amber accent (`oklch(0.82 0.125 75)`) plays the warm light against the cool dark. Type is one family — Geist, in sans and mono — carrying the whole site through weight and scale contrast, never through a second competing typeface. Depth comes from tonal layering (a panel one step lighter than the room), not from drop shadows. There is exactly one atmospheric flourish, the hero's cobalt bloom, and it is bounded so it never costs a repaint anywhere else.

This system explicitly rejects the generic-blog template (Medium / Substack / dev.to default themes) — the point is to look unmistakably hand-built. It rejects the dark-purple-gradient SaaS landing clone and the hero-metric stat block. It rejects trying-too-hard maximalism: animation on every scroll, glassmorphism everywhere, effects with no purpose. And it categorically rejects the AI-default "warm cream + muted slate + tiny tracked eyebrow over every section" editorial scaffolding — there is no cream here, no warm-neutral body, and the one mono eyebrow earns its place only on the hero and as a single section label, never as per-section grammar.

**Key Characteristics:**
- One dark cobalt room, sitewide — the hero is continuous with the page, not a separate panel pasted on top.
- One typeface, Geist (sans + mono), carrying hierarchy through weight and scale, never a second face.
- Cobalt does the structural work (links, brand, the "about you" payoff); amber is the rare warm highlight.
- Depth by tonal layering, not shadow. Surfaces are flat at rest.
- Body text at ≥7:1 contrast — light-text-on-dark is generously lit, never muted-gray-on-tint.
- Calm by default. The hero is the showpiece; once a visitor commits to a post, the design gets out of the way.

## 2. Colors

A cool, deep cobalt/indigo room with one warm amber light. Every neutral is tinted toward the cobalt seed hue (252°); nothing here is a true gray, and nothing is warm except the amber accent.

### Primary
- **Cobalt** (`oklch(0.66 0.15 252)`, 6.14:1 on bg): The structural brand color and the site's voice. Carries links, the brand dot, post-title hover, the hero's "about you" fragment and typing caret, and focus rings. This is the color the page uses to point at *you*. **Cobalt-Strong** (`oklch(0.70 0.15 252)`, 7.16:1) is the same hue lifted for small or low-emphasis interactive text that needs extra lift against the dark.

### Secondary
- **Amber** (`oklch(0.82 0.125 75)`, 10.78:1 on bg): The lighthouse beam — the one warm light in the cool room. Reserved for the hero eyebrow, genuine highlights, and `<mark>`/emphasis moments. Rare by design. Amber is a guest, not a co-host; when amber starts appearing on every surface it has stopped being the beam and become decoration.

### Neutral
- **Room** (`oklch(0.17 0.018 252)`, `bg`): The body background. The dark room, sitewide. The hero shares it exactly, so the showpiece bleeds into the reading experience with no seam.
- **Panel** (`oklch(0.205 0.022 252)`, `surface`): One tonal step up from the room. Post-card hover, inline `code`, `pre` blocks, the hero's lit gradient top. This is how depth is built here: a lighter tint of the same hue, never a shadow.
- **Ink** (`oklch(0.95 0.006 252)`, 16.52:1 on bg): Display and body text. Near-white, barely cooled toward cobalt so it never reads clinical-blue.
- **Muted** (`oklch(0.72 0.012 252)`, 7.71:1 on bg): Secondary text — post descriptions, the hero tagline, footer links, nav at rest, blockquotes. Still comfortably above the 4.5:1 body floor; this is calm, not washed out.
- **Faint** (`oklch(0.58 0.014 252)`, 4.47:1 on bg): Labels and dates only — the mono section label, post dates, fact labels in the hero disclosure. Large/label use only (≥3:1 floor); never body copy.
- **Line** (`oklch(0.32 0.022 252)`): Hairlines — the footer rule, card-hover edges, `pre`/`code` borders, tag outlines. Always 1px.

### Named Rules
**The One Room Rule.** The whole site shares one background (`bg`, `oklch(0.17 0.018 252)`). The hero is not a panel pasted onto a different page; it is the same room, lit. If a surface introduces a second base background, the seam returns and the site reads as two sites stitched together — which is exactly the divergence this system was built to eliminate.

**The Beam Rule.** Amber appears on ≤5% of any screen. It is the one warm light in a cool room; its rarity is the entire point. The moment amber is doing structural work (links, borders, large fills) it has stopped being the lighthouse beam.

**The No-Vermilion Rule.** There is no hot vermilion (`#ff5c39`), no warm yellow (`#ffd23f`), no warm-cream (`#fbf7f2`), and no Inter anywhere in this system. Those were the old starter-template layer. One stray reference reads as AI slop and reintroduces the two-sites seam.

## 3. Typography

**Display Font:** Geist Variable (with `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Geist Variable — same family, lighter weights
**Label/Mono Font:** Geist Mono Variable (with `ui-monospace, "SF Mono", Menlo, monospace`)

**Character:** One family, two cuts. Geist is a precise, low-contrast grotesque with a quiet engineering confidence — it reads as built, not styled, which is exactly the brand. The mono cut is reserved for instrument-readout moments (dates, tags, the hero's fact labels, the single section label) where tabular, fixed-width type signals "this is data the page actually read." The pairing works because it is one voice in two registers, not two competing typefaces — which is why there is no serif here and no second sans.

### Hierarchy
- **Display** (800, `clamp(2rem, 5.6vw, 3.25rem)`, line-height 1.12, tracking -0.03em): The hero line only. The page's largest voice; capped well under the 6rem shouting ceiling.
- **Headline** (800, `clamp(2rem, 5.5vw, 3rem)`, line-height 1.15, tracking -0.02em): Article titles (`h1`).
- **Title** (700, 1.25rem–1.65rem, line-height 1.2): Post-card titles and in-article `h2`/`h3`. `text-wrap: balance` for even line breaks.
- **Body** (400, 1.075rem base / 1.12rem in prose, line-height 1.7–1.75): Reading copy. Measure capped at `--max: 46rem` (~70ch). Line-height runs at the high end of the range because light text on a dark ground reads lighter and needs the extra breathing room.
- **Label** (500, 0.72rem–0.78rem, tracking 0.08em–0.2em, UPPERCASE, mono): Section label, hero eyebrow, fact labels, tags, dates. Short strings only (≤4 words). The one tracked-uppercase element the system allows — used sparingly, never as per-section scaffolding.

### Named Rules
**The One Voice Rule.** Geist carries the entire site. Hierarchy comes from weight (400 → 700 → 800) and scale (≥1.25 between steps), never from importing a second display face. If a heading needs more presence, it gets weight or size, not a new font.

**The Dark-Reading Rule.** Light text on the dark room reads lighter than dark-on-light at the same size. Prose line-height is set at 1.75 (not the 1.6–1.65 a light theme would use) so the measure stays calm and legible.

## 4. Elevation

This system is flat. There are no drop shadows anywhere — depth is built entirely from tonal layering: a surface that needs to sit "above" the room is rendered one lightness step up in the same cobalt hue (`surface` at L 0.205 over `bg` at L 0.17), never with a `box-shadow`. The only light effect in the system is the hero's cobalt bloom, and it is an atmospheric glow (a contained radial gradient), not an elevation shadow — it conveys "a screen is lit in this room," not "this card floats."

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. The only response to state is a tonal shift (post-card hover lifts from `bg` to `surface`) or a color shift (title to cobalt, link to ink), never a shadow appearing. If something looks like it's casting a shadow, the design has drifted toward generic-card-UI and should be pulled back to tonal layering.

## 5. Components

### Buttons / Links
The site is link-led, not button-led; there are no filled CTA buttons. Links are the primary interactive element.
- **Default:** Cobalt (`oklch(0.66 0.15 252)`), underline offset 0.2em.
- **Hover:** Shift to ink (`oklch(0.95 0.006 252)`) — the link brightens toward white rather than changing hue.
- **In-prose links:** weight 600 so they're findable in a paragraph without relying on color alone.
- **Focus:** 2px cobalt outline, 3px offset. Always visible; never removed.

### Tags / Chips
- **Style:** Mono (Geist Mono), 0.72rem, muted text (`oklch(0.72 0.012 252)`) inside a 1px `line` border, fully pill-rounded (999px). Background is the room — they read as outlined readouts, not filled badges.
- **Reconciled:** the old yellow (`--accent-2`) tag color is retired. Tags are quiet muted-on-outline; amber is reserved for the beam, so tag pills no longer compete with it.

### Cards / Containers
- **Post card:** No visible card at rest — just a tappable row on the room background. On hover it lifts to `surface` (`oklch(0.205 0.022 252)`) with a 10px radius and the title shifts to cobalt. This is the one place a "card" appears, and only on interaction.
- **Hero panel:** The exception — a 18px-radius lit panel sharing the room's palette, with a 1px `line` border and the cobalt bloom. It is the showpiece; nothing else in the system gets this treatment.
- **Internal padding:** cards `1rem 0.75rem`; hero `clamp(1.75rem, 5vw, 2.75rem)`.

### Prose (blockquote / code)
- **Blockquote:** No side stripe. A full-bleed quiet panel: `surface` background, full 1px `line` border, `md` radius, muted italic text. (The old `border-left: 3px solid` side-stripe is banned and removed.)
- **Inline code:** `surface` background, 1px `line` border, `sm` radius, Geist Mono at 0.88em.
- **Pre blocks:** `surface` background, 1px `line` border, `md`–`lg` radius, horizontal scroll.

### Navigation
- **Style:** Geist, weight 600, 0.95rem. Brand wordmark in ink with a cobalt period (`.dot`).
- **States:** nav links muted (`oklch(0.72 0.012 252)`) at rest, brightening to cobalt on hover. Brand stays ink; only its dot is cobalt.

### Signature Component: The Personalized Hero
The one twist and the reason the site exists. A React island that, after hydration, reads the visitor's signals (time of day, device, browser, referrer, prior visits) and types a witty, personalized "about you" line into the hero in cobalt, with a blinking caret. It ships a crawler-safe fallback in static HTML (`"Welcome — glad you're here."`), so SEO and no-JS visitors get a complete hero. A `<details>` disclosure ("How does it know that?") reports exactly what was read, reinforcing that nothing leaves the tab. Every effect has a `prefers-reduced-motion` fallback (the line renders instantly, the caret hides, the glow shows in its resting state). The hero owns the system's only motion and its only atmospheric glow; the rest of the site is calm.

## 6. Do's and Don'ts

### Do:
- **Do** build every surface from the cobalt seed and keep the whole site on one background (`bg`, `oklch(0.17 0.018 252)`) — the hero must read as continuous with the page.
- **Do** use cobalt (`oklch(0.66 0.15 252)`) for links, brand, and interactive emphasis; reserve amber (`oklch(0.82 0.125 75)`) for the rare warm highlight (≤5% of any screen).
- **Do** keep body text at ≥4.5:1 (it runs 7–16:1 here). If a text color is even close to the floor, push it toward ink.
- **Do** carry the whole site in Geist; build hierarchy from weight (400/600/700/800) and scale (≥1.25 steps).
- **Do** convey depth with tonal layering — a lighter tint of the same hue (`surface` over `bg`) — never a drop shadow.
- **Do** keep the reading experience calm: legible measure (~70ch), prose line-height 1.75, zero gimmicks once a visitor commits to a post.
- **Do** give the hero its one bloom and its one motion sequence, and nothing else on the site competes with it.

### Don't:
- **Don't** reintroduce the retired starter layer: no hot vermilion (`#ff5c39`), no warm yellow (`#ffd23f`), no warm-cream `#fbf7f2` body, no Inter. One stray reference reads as AI slop.
- **Don't** use the AI-default "warm cream + muted slate + tiny tracked eyebrow over every section" editorial scaffolding. The one mono eyebrow lives on the hero and a single section label, never as per-section grammar.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe (the banned side-stripe). Blockquotes and callouts get full borders or background tints.
- **Don't** ship generic-blog-template chrome (Medium / Substack / dev.to default themes) — the whole point is to look hand-built.
- **Don't** build dark-purple-gradient SaaS landing clones, hero-metric stat blocks, or "build faster, ship faster" marketing cadence.
- **Don't** pile on trying-too-hard maximalism — animation on every scroll, glassmorphism everywhere, effects with no purpose. Cleverness should feel effortless.
- **Don't** let muted gray sit on the tinted dark as body copy. `faint` is for labels and dates only; body copy uses ink or muted.
- **Don't** add drop shadows. If a surface needs to lift, tint it up; don't float it.
