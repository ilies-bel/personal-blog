# CLAUDE.md

Personal blog built with **Astro** + **three.js**. The home page is dominated by a single
signature hero: a GPU-particle object that runs the **stellar lifecycle in reverse** as the
visitor scrolls.

## The reverse-lifecycle hero

Forward stellar physics is:

```
nebula → yellow star → red giant → supernova → black hole
```

The page plays this **backwards**. The top of the page (scroll = 0) is the **black hole**
(end of life); scrolling **down** walks back through the lifecycle toward the **nebula**
(birth). The intent is narrative — each state carries a line of the manifesto about building
software that lasts.

### Scroll stage → state map

The scroll height is 6 viewport-tall stages (`.scene-stage` in `src/pages/index.astro`).
Scroll progress (0..1) maps to a fractional `stage` (0..5):

| stage | state            | notes |
|-------|------------------|-------|
| 0     | black hole       | top of page, the big hero |
| 1     | supernova bridge | black-hole ↔ red-giant transition (loud blast → tiny seed) |
| 2     | red giant        | |
| 3     | yellow star      | rendered by a dedicated mesh "sun rig", not the cloud |
| 4     | nebula           | |
| 5     | pale blue dot    | bottom of page |

## Architecture

- **`src/hero/BlackHole.tsx`** — the entire scene (vanilla three.js inside a `client:only`
  React island). A ~1.2M-point GPU accretion-disk cloud, lensed starfield, warp arcs, photon
  ring, a post chain (UnrealBloom → grade shader), and the per-frame render loop. This is where
  almost all hero work happens.
  - The morph is driven by scroll via uniforms: **`uMorph`** (transition 1, = `min(1, stage)`),
    **`uFlash`** (supernova burst envelope), **`uGiant`** (gather into the star),
    `uYellow`/`uNebula`/`uDot` (later states).
  - The render loop `frame()` samples scroll, eases `stage`, and drives all uniforms + camera
    zoom + bloom/exposure grade per frame.
  - **Scale story**: the camera pushes IN at the hero black hole and pulls WAY back at the tiny
    seed so the black hole reads as enormous vs the speck it collapses to.
- **`src/hero/scroll.ts`** — `ScrollTracker`: maps `window.scrollY` to `progress` (0..1) and
  `stageF` (`progress * stageCount`).
- **`src/pages/index.astro`** — mounts the hero, defines the 6-stage scroll track, and holds a
  `<noscript>` SSR fallback that **mirrors the manifesto copy** (keep both in sync if copy
  changes).
- Manifesto beats (one per state, with scroll-direction-dependent big lines) live in the
  `BEATS` array in `BlackHole.tsx`.

## Debugging & verification

- **`window.__bhMorph`** (a number) force-sets `stage` in the render loop (no scroll, no
  easing) so a specific morph/explosion frame can be inspected. Used by the capture scripts.
- **`scratchpad/*.mjs`** — Playwright capture scripts that spin up the dev server, scroll or
  force `__bhMorph`, and save screenshots (`scratchpad/state-N-*.png`, `*-full.png`, etc.) for
  reviewing each state. `scratchpad/` is a workspace for probes/screenshots, not shipped code.

## Commands

- `npm run dev` — Astro dev server.
- `npm run build` — production build.
