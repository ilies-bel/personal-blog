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

The hero lives in `src/hero/`, split by concern so each piece is small and the three.js
engine is framework-agnostic (React only mounts/unmounts it):

- **`scene/`** — vanilla three.js, no React. `createScene.ts` builds the renderer/camera, wires
  the rigs, and owns the per-frame render loop (`frame()`); the rig factories (`buildDisk`,
  `buildStarfield`, `buildWarp`, `buildRing`, `buildSunRig`, `buildPostChain`) each own one piece
  of geometry + materials + disposal. `types.ts` holds the shared `Uniforms`/`SceneHooks` types.
  This is where almost all hero *engine* work happens — the ~1.2M-point GPU accretion-disk cloud,
  lensed starfield, warp arcs, photon ring, and the UnrealBloom → grade post chain.
  - The morph is driven by scroll via uniforms: **`uMorph`** (transition 1, = `min(1, stage)`),
    **`uFlash`** (supernova burst envelope), **`uGiant`** (gather into the star),
    `uYellow`/`uNebula`/`uDot` (later states).
  - The render loop samples scroll, eases `stage`, and drives all uniforms + camera zoom +
    bloom/exposure grade per frame.
  - **Scale story**: the camera pushes IN at the hero black hole and pulls WAY back at the tiny
    seed so the black hole reads as enormous vs the speck it collapses to.
- **`shaders/`** — the GLSL sources as `*.glsl.ts` string modules (lens, disk, star, warp, ring,
  sun, post), grouped by rig. The pure choreography (`lifecycle.ts`) and GPGPU collapse sim
  (`gravitySim.ts`) sit alongside in `src/hero/`.
- **`components/`** — the thin React layer. `HeroIsland.tsx` owns the canvas host element, the
  scroll tracker, refs and the mount/unmount effect, and publishes a scroll-driven snapshot via
  `SceneStateContext` (provider + `useSceneState`/`useSceneActions`). The presentational
  consumers — `HeroIdentity`, `ManifestoOverlay`, `ScrollHint`, `ExplorationHud` — read from it.
  `BlackHole.tsx` is a one-line re-export of `HeroIsland` (the import path the pages use).
- **`lib/`** — `config.ts` (the `CFG` tuning table + device/reduced-motion helpers) and
  `constants.ts` (magic strings + scroll/beat thresholds + the `__bh*` debug-hook keys).
- **`src/hero/scroll.ts`** — `ScrollTracker`: maps `window.scrollY` to `progress` (0..1) and
  `stageF` (`progress * stageCount`).
- **`src/pages/index.astro`** — mounts the hero, defines the 6-stage scroll track, and holds a
  `<noscript>` SSR fallback that **mirrors the manifesto copy** (keep both in sync if copy
  changes).
- Manifesto beats (one per state, with scroll-direction-dependent big lines) live in the
  `BEATS` array in **`src/hero/beats.ts`** (shared with `index.astro`'s SSR fallback).

### Styles

`src/styles/global.css` is a thin aggregator that `@import`s per-concern partials in cascade
order: `tokens.css` (the single source of CSS custom properties) → `base.css` → `chrome.css`
→ `scene.css` → `hero.css` → `hud.css` → `prose.css` → `about.css`. Add new rules to the
partial that owns the concern; only `tokens.css` defines `:root` variables.

## Debugging & verification

- **`window.__bhMorph`** (a number) force-sets `stage` in the render loop (no scroll, no
  easing) so a specific morph/explosion frame can be inspected. Used by the capture scripts.
- **`window.__bhFlash`** (a number 0..1) pins the **supernova whiteout envelope** (`nova`).
  The supernova flash is **time-based, decoupled from scroll** (it fires when `morph` crosses
  the breakout ≈0.5 in either direction, then runs its own ~1.6s rise→hold→decay clock so a
  fast scroller still sees the full blinding blast). Because it no longer tracks `morph`,
  `__bhMorph` alone won't show it — set `__bhMorph≈0.5` AND `__bhFlash` (e.g. `1.0` = peak
  whiteout) to inspect a flash frame. The whiteout itself is `NovaShader`, a fullscreen pass
  composited **after** the grade pass (so the grade tone-map/vignette can't swallow the white).
- **`window.__bhNebLight`** (a number 0..1) pins the **nebula light model** strength (`uNebLight`)
  — `0` = flat self-emission (every grain full bright), `1` = full ambient+depth+self-occlusion
  (front gas brighter, far/buried gas dimmer & bluer → 3D volume). There is no star inside the
  cloud, so the "light" is the gas occluding itself toward the camera plus a depth fade, not a
  point source. Set `__bhMorph≈4.0` (full nebula) AND `__bhNebLight` to A/B the look.
- **`scratchpad/*.mjs`** — Playwright capture scripts that spin up the dev server, scroll or
  force `__bhMorph`/`__bhFlash`, and save screenshots (`scratchpad/state-N-*.png`, `nova-*.png`,
  `live-*.png`, etc.) for reviewing each state. `scratchpad/` is a workspace for probes/
  screenshots, not shipped code.

## Commands

- `npm run dev` — Astro dev server.
- `npm run build` — production build.
