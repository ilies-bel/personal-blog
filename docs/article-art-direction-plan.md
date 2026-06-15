# Article pages → SOTY parity with the hero

**The problem (reviewer, verbatim):** "The homepage is the award piece. The
rest is the actual website." The home sequence is a ~12k-line scroll-driven
Three.js stellar-lifecycle film with a HUD, dive-into markers, and
shared-element morphs. The article page is a 680px reading column floating on a
**frozen, dimmed** copy of that scene. The motion grammar dies at the threshold
between index and article.

**The goal:** every page shares the same art direction, the same motion grammar,
the same level of detail — *without* sacrificing readability. An article is
still a place you go to read.

---

## The key architectural insight (why this is "one site", not two)

The hero engine is already a **pure function of one number**. `createScene`
(`src/hero/scene/createScene.ts`) takes a `getStage()` callback; everything —
camera arc (`cameraPoseForProgress`), shader stage, dwell (`resolve().dwell`),
scene id, HUD scroll-spy — is derived from that one progress value through the
`sceneTable` walkers. The home page drives `getStage` from *page* scroll. The
article backdrop currently pins it to a **constant** (`backdropStage={0}`,
`HeroIsland.tsx:235-262`).

> **We do not build a second engine. We drive the existing `getStage` from
> article-body scroll.** That single change converts the frozen wallpaper into a
> scripted scene journey, and because it is literally the same engine, the
> article inherits the hero's motion grammar for free.

This is the seam. Everything below hangs off it.

---

## Decisions taken (from grilling)

- **Backdrop role:** full per-article scene journey — body scroll drives the
  scene start→end, authored per post.
- **Body ambition:** HUD-style reading chrome + interactive MDX embeds + marker
  "dive" continuity (reveal-on-scroll prose folded in as the cheap, always-on
  baseline — it costs nothing and reinforces the choreography).
- **Scope now:** full plan + ONE article rebuilt end-to-end as the reference
  beat, before rolling across all posts.

---

## A1 — Article scene journey (the core)

**New frontmatter contract** (`src/content.config.ts`). Replace the single
`backdrop` enum with a richer, still-optional `scene` block so prose stays
prose and only opted-in posts choreograph:

```ts
scene: z.object({
  // The lifecycle window the article scrubs through as you read, in getStage
  // transition-space (0 = black hole … 3.5 = nebula). [from, to].
  journey: z.tuple([z.number(), z.number()]).optional(),   // e.g. [3.5, 0.0]
  // Per-section scene anchors: heading slug → stage. Overrides linear journey
  // so a section break lands the reader on a specific celestial beat.
  anchors: z.record(z.string(), z.number()).optional(),
  backdrop: z.enum(['scene', 'tesseract']).default('scene'),
}).optional(),
```

Back-compat: `backdrop: 'tesseract'` keeps working via a normaliser; unset =
today's frozen behaviour (a safe default — no post regresses).

**New island: `ArticleScene.tsx`** (`src/hero/components/`). A thin sibling of
`HeroIsland`'s backdrop branch:

- Owns a `ScrollTracker` measuring **article scroll** (reuse `scroll.ts`
  verbatim — it already normalises `scrollY / (scrollHeight - innerHeight)`).
- `getStage = () => lerp(journey[0], journey[1], easedArticleProgress)` — or,
  when `anchors` is set, interpolates between the stage values pinned to each
  heading's measured `offsetTop`. This is the *only* new mapping function; it
  delegates straight into `createScene`'s existing `getStage` slot.
- Renders at the existing `.bh-backdrop` z-layer with the existing dim wash, but
  the dim is now **scroll-reactive**: ease the backdrop a touch brighter at
  section breaks (data-attr the active section, animate opacity in `hero.css`).
  Readability guard: dim floor stays where it is today between breaks.
- Honours reduced motion exactly like `HeroIsland` (no WebGL import; cross-fade
  the four lifecycle posters by article progress instead — `PosterSlideshow`
  already takes a `progress` prop).

**Engine changes:** none beyond passing a non-constant `getStage`. Verify the
existing `getDwell`/camera micro-drift behave under the article's narrower
journey window (they should — they're pure in progress).

---

## A2 — HUD-style reading chrome

Bring the cockpit to the reading frame, in the **same mono-gold HUD language**
(`hud.css`, `HudNavigation.tsx` tokens). New presentational component
`ArticleHud.tsx` (no new state model — reads article progress + section list):

- **Scroll-progress instrument:** a thin left rail mirroring the hero's nav rail
  geometry; fills with article progress.
- **Section/"stage" readout:** `02 / 04 · ISLANDS: HYDRATE WHAT MOVES` — section
  index over count + current heading, in the mono caps readout style. Driven by
  the same scroll-spy pattern as the hero rail (`hudIdForStage` analogue over
  heading offsets).
- **Animated back-affordance:** promote the existing `.article-back` L-bracket
  into the HUD family (it already tightens on hover — make it a HUD glyph).
- Bright-zone awareness: reuse `brightZoneFor()` so the chrome flips to a dark
  stroke when the article's scene window scrubs through the supernova/yellow
  bright beats — same `[data-zone]` swap as the hero. No new color logic.

---

## A3 — Interactive MDX embeds

A small kit of components authors drop into posts (registered via MDX
`components` map in `[...slug].astro`). Each is its own Astro/React island so the
prose stays zero-JS between them (this is literally what the *why-astro-islands*
post argues — so the post should *demonstrate* it):

- `<IslandsDemo/>` — a live, clickable hydrate-on-visible vs hydrate-on-load toy
  that lights up when it actually hydrates (proves the essay's thesis in-place).
- `<SceneFigure stage={2.88}/>` — an inline mini-canvas pinning ONE lifecycle
  beat (reuses `createScene` backdrop mode at a fixed stage), so a paragraph
  about the yellow-star beat shows it.
- `<Scrolly>` — a scrollytelling figure: a sticky inline canvas whose stage is
  driven by the steps scrolling past it (same `getStage` trick, scoped to the
  figure's own `IntersectionObserver`).

Ship `<IslandsDemo/>` + `<SceneFigure/>` in the reference build; `<Scrolly>` is
a fast-follow once the pattern is proven.

---

## A4 — Marker "dive" continuity

Half of this already exists: the dive overlay is `transition:persist`'d, and
articles run the resurface on load from the `bh:dive` sessionStorage flag
(`BaseLayout.astro`). Close the loop:

- **In:** the writing-index rows already carry the shared-element
  `transition:name`. Layer the hero's bloom-veil dive on the click so leaving the
  index feels like a marker dive, not a page nav. Reuse `beginDive`'s overlay
  ramp; the index has no live scene, so it's the overlay-only degraded path that
  `beginDive` already supports.
- **Out:** browser-back reverses the morph (View Transitions already do this).
- **Arrival:** the resurface should resolve INTO the article's *journey start*
  stage, not stage 0 — so the dive's bloom apex and the article's opening beat
  are the same frame. One-line wiring: ArticleScene seeds `getStage` from the
  journey start on first paint.

---

## Other reviewer items (tracked, not in the reference build)

These are the rest of the reviewer's table — enqueue as Mars tasks so they're
not lost, but they're separate from the article-interactivity reference beat:

- **Project page:** the "Screenshot pending" placeholder is **fatal for
  submission** — must be replaced before any SOTY entry. Highest-priority
  content fix. (`src/pages/projects.astro`.)
- **Graveyard page:** apply the same scene-journey + HUD chrome treatment (it's
  a strong concept that currently reads "too normal").
- **About modal/page:** needs one memorable personal moment, not just good copy.
- **Footer/contact:** too quiet for a conversion area; needs presence.

---

## Reference build (this session): *why-astro-islands*

Chosen because the post *argues* the islands thesis, so making it interactive is
self-demonstrating — the strongest possible reference beat.

1. Extend `content.config.ts` with the `scene` block (+ back-compat normaliser).
2. Build `ArticleScene.tsx` (the `getStage`-from-article-scroll island).
3. Build `ArticleHud.tsx` (progress rail + section readout + HUD back glyph).
4. Build `IslandsDemo` + `SceneFigure` MDX components; register the MDX map.
5. Rework `posts/[...slug].astro` to mount ArticleScene + ArticleHud and pass
   the MDX components; add the article-scene CSS to `prose.css`/a new
   `article.css`.
6. Rewrite the *why-astro-islands* MDX to: set `scene.journey: [3.5, 0.0]`
   (nebula → black hole as you read — the essay "condenses" toward the core),
   anchor each `##` to a beat, and embed `<IslandsDemo/>` where it argues
   hydration.
7. Verify: `npx tsc --noEmit`, `npm test --silent`, `npx biome check .`, plus a
   Playwright screenshot pass (`npm run screenshot`) at scroll 0/50/100%.

**Acceptance:** scrolling the article visibly scrubs the live scene through its
journey; the HUD rail + section readout track scroll; `<IslandsDemo/>` hydrates
on cue; reduced-motion falls back to the poster cross-fade; the build is green.
Reduced-motion and no-WebGL paths stay fully readable (the prose never depends
on the canvas).
