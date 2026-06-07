# Cursor glossary

The site replaces the native pointer with a single quiet custom cursor, defined
entirely in one self-contained component (`src/components/CustomCursor.astro`:
scoped `<style>` + a guarded IIFE `<script>`, mounted once sitewide from
`BaseLayout.astro`). This glossary pins down the cursor's visible states, how
"interactive" is decided (including the hero **red-giant surface** hit-test), and
the identifiers involved — so the cursor's behaviour is documented next to the hero
state glossary it now reaches into.

The cursor is **move-driven**: everything below is recomputed on `document`
`mousemove` (`onMove`, ~413). It never imports three.js or the scene; the one place
it touches the hero is through a `window.__bhHitGiant` bridge (below).

---

## Visible states

| state | element / class | what you see | controlled by |
|-------|-----------------|--------------|---------------|
| **default dot** | `.cursor__dot` (~113) | a 5px filled off-white dot at ~38% opacity | always shown |
| **interactive hexagon** | `.cursor__hex` (~127) | a thin hexagon outline that eases in around the dot | `.cursor--interactive` on the root (~141) |
| **comet trail** | `.cursor-trail` canvas (~101) | a soft luminous tail that follows + curves behind the dot, then vanishes at rest | the canvas-2D draw loop (suppressed under reduced motion) |

### Default dot — `.cursor__dot`

The whole resting cursor: one 5px filled dot at ~38% opacity, centred in a 40px
box (`width: 5px` ~117, `opacity: 0.38` ~122). It is pinned exactly on the pointer
(`translate3d` per frame in the loop, ~365) so the cursor is precise and leads.

### Interactive hexagon — `.cursor__hex` + `.cursor--interactive`

A flat-top hexagon outline (inline SVG `<polygon>`, ~57) that is hidden + slightly
shrunk by default and eases up to full size + ~50% opacity **only** when the root
carries `cursor--interactive` (`.cursor.cursor--interactive .cursor__hex`, ~141).
The dot stays put through the swap. The class is toggled once per move in `onMove`
(`cursor.classList.toggle('cursor--interactive', interactive)`, ~450).

### Comet trail — `.cursor-trail`

A full-viewport fixed canvas one z-index step **below** the dot. The tail is a
preallocated ring buffer of recent points (each with a spawn time); the loop
interpolates extra points on fast moves so the trail bends, fades every point by
age (`TRAIL_LIFE_MS`, ~241), and strokes one smooth gradient path. The loop idles
when the cursor settles (zero CPU at rest). Purely decorative — it never affects
interactivity.

---

## How "interactive" is decided

`onMove` (~413) computes a single boolean `interactive`, then toggles
`cursor--interactive`. The checks run cheapest-first and short-circuit:

1. **Semantic / opt-in elements** — `target.closest(INTERACTIVE_SELECTOR)` (~436).
   `INTERACTIVE_SELECTOR` (~207) is
   `a[href], button, input, textarea, select, label, [role="button"],
   [data-cursor="interactive"]`. `closest()` is used so a child of a link/button
   (an icon, a `<span>`) still counts.
2. **Computed-cursor fallback** — if still false, `getComputedStyle(target).cursor
   === 'pointer'` (~438) covers anything styled clickable without a semantic tag.
3. **Red-giant surface** — if STILL false, the hero's beat-gated sphere hit-test:
   `window.__bhHitGiant(targetX, targetY)` (~447). Guarded by `typeof === 'function'`
   so pages without the scrollable hero (about, …) simply skip it.

### The red-giant surface hit-test (`__bhHitGiant`)

The cursor must show the hexagon over the **rendered red-giant surface** — but the
cursor is a standalone IIFE that can't import three.js or the scene. So the bridge
is a tiny `window` hook (mirroring the project's `__bh*` debug-hook convention):

- **Published by** `HeroIsland.tsx` (~199): on mount it sets
  `window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant`, and deletes it on
  unmount (~204) so other pages never see a stale closure. The key literal is
  `'__bhHitGiant'`, defined once in `CURSOR_WINDOW_KEYS` (`src/hero/lib/constants.ts`).
- **Served by** the scene's `hitTestGiant(clientX, clientY)`
  (`src/hero/scene/createScene.ts` ~338), returned from `createScene` as a method
  bolted onto the dispose function via `Object.assign` (~1052) — so `dispose()`
  still works exactly as before. It is:
  - **Beat-gated:** returns `false` immediately unless `redGiantClickable` (~750) is
    true — the same flag the click handler uses, true only when the settled,
    full-size, idle red giant is the body actually on screen (`cloudSide &&
    cloudShown && yrGrow > 0.9 && yrColor > 0.9 && kCollapse < 0.02`). So the hexagon
    never appears for the black hole, nebula, dot, supernova, yellow mesh, or during
    the yellow⇄red swap/shrink/collapse.
  - **Precise:** when the beat is active it raycasts the live camera against the
    giant's invisible sphere at the world origin, radius = `uGiantR × uGiantScale`
    (`giantSphereHit`, ~321 — shared with the click path so the math is identical),
    and returns whether the ray intersects. Reuses scratch objects (`eruptRaycaster`,
    `eruptPointerNdc`, `giantSphere`, `giantHitPoint`) so the move-driven path never
    allocates.

This is a **cursor change only** — no click action. (Clicking the same surface is a
separate feature: `onPointerDownSun`, ~319, fires a geyser eruption.)

> Move-driven limitation: like the click handler, the hit-test only re-evaluates on
> actual mouse movement. If the giant scrolls *under* a stationary cursor the hexagon
> won't update until the next move. Accepted for now — no scroll listener / per-frame
> DOM poking.

---

## Naming cheat-sheet

| identifier | meaning | file |
|---|---|---|
| `cursor--interactive` | root class that fades the hexagon in | `CustomCursor.astro` (~141) |
| `INTERACTIVE_SELECTOR` | the semantic/opt-in element list checked via `closest()` | `CustomCursor.astro` (~207) |
| `__bhHitGiant` | `window` bridge: `(x, y) → boolean`, is the point over the live red giant? | `CustomCursor.astro` (~447), `HeroIsland.tsx` (~46/199), `constants.ts` (`CURSOR_WINDOW_KEYS.hitGiant`) |
| `hitTestGiant` | the scene method serving `__bhHitGiant` (beat gate + sphere raycast) | `createScene.ts` (~338) |
| `giantSphereHit` | shared NDC → camera ray → origin-sphere intersect (click + cursor) | `createScene.ts` (~321) |
| `redGiantClickable` | per-frame beat gate: the settled red giant is the body on screen | `createScene.ts` (~750) |
| `giantSphere` | the invisible origin-centred raycast sphere (radius `uGiantR × uGiantScale`) | `createScene.ts` (~258) |
| `SceneHandle` | `createScene`'s return type: a dispose fn that also carries `hitTestGiant` | `scene/types.ts` |

---

## Accessibility / device behaviour

- **Reduced motion** (`prefers-reduced-motion: reduce`): the comet **tail is
  suppressed** (the draw loop never starts; the canvas is also hidden in CSS, ~150)
  and the hexagon **snaps** in/out instead of easing (`.cursor__hex { transition:
  none }`, ~151). The dot still tracks the pointer and the interactive checks
  (including the red-giant hit-test) still run.
- **Coarse / no-fine pointer** (`not (pointer: fine)`): **no custom cursor at all**
  — the script bails on the `(pointer: fine)` check (~185) and CSS hides the elements
  belt-and-braces (~162), leaving the native cursor intact so touch/keyboard users
  are never left cursorless.

---

_Line numbers are approximate — grep the identifier (`cursor--interactive`,
`INTERACTIVE_SELECTOR`, `__bhHitGiant`, `hitTestGiant`, `giantSphere`) if they have
drifted._
