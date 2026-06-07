# CLAUDE.md

Personal blog built with **Astro** + **three.js**. The home page is dominated by a single
signature hero: a GPU-particle object that runs the **stellar lifecycle in reverse** as the
visitor scrolls.

## The lifecycle hero

Forward stellar physics is:

```
(pale blue dot) → nebula → yellow star → red giant → supernova → black hole
```

The page plays this **forward** (`LIFECYCLE_DIRECTION = 'normal'` in `timeline.ts`). The top
of the page (scroll = 0) **opens on a lone pale blue dot** — a single quiet speck — which
**blooms into the nebula** as you scroll down, then walks the full lifecycle to the **black
hole** at the bottom (the big hero that pulls the portfolio in). The intent is narrative —
each state carries a line of the manifesto about building software that lasts. (The
direction is a single seam: flipping `LIFECYCLE_DIRECTION` to `'reverse'` mirrors the whole
arc — `lifecycleProgress()` is the only place it's applied.)

### Scroll progress → stage → state map

The scroll track is 6 viewport-tall stages (`.scene-stage` in `src/pages/index.astro`). The
shader "stage" coordinate runs **high→low** as you scroll **down** (`legacyStageForProgress`
in `timeline.ts` maps progress 0..1 to a fractional `stage`). The pale-blue-dot opening
(stage 4.7→3.5) lives in progress `0.00–0.10`; the proven nebula→black-hole arc is compressed
into `0.10–1.00`.

| progress     | stage      | state            | notes |
|--------------|------------|------------------|-------|
| 0.00         | 4.7        | pale blue dot    | top of page — the opening speck |
| 0.00 → 0.10  | 4.7 → 3.5  | dot → nebula     | the speck blooms into the cloud (camera flies in) |
| 0.10 → ~0.32 | 3.5 → 3.0  | nebula → collapse| round fullscreen gas; GPGPU collapse feeds the star |
| ~0.37        | ~2.9       | yellow star      | a dedicated mesh "sun rig", not the cloud |
| ~0.51–0.66   | 2.05       | red giant        | |
| ~0.66–0.82   | 1.05 → 0.32| collapse → supernova | loud blast |
| 0.82 → 1.00  | 0.32 → 0.0 | black hole       | bottom of page, the big hero |

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
  - **Red-giant size/pose.** The orb **grows and stays CENTRED at the world origin** the
    whole time (the supernova collapses centred, the star grows centred). Its size is a
    red-giant-ONLY scale: `uGiantR` (4.2) is the base radius SHARED by the red giant, the
    yellow star, the nebula extent AND the gravity-sim seed — do **not** repurpose it to
    resize the red giant alone; **`uGiantScale`** is the red-giant-only multiplier (1.0
    everywhere else, so the nebula/dot/sun never balloon). **`uGiantSpin`** (radians,
    `t * 2π/60`) rolls the photosphere on a fixed ~23°-tilted pole so the star turns on
    its own axis. The big off-centre "vast limb" framing is **NOT** a geometry offset — it
    is a **camera move** (`RED_GIANT_PARK` in createScene): once the giant is grown the
    render loop slides the camera position + its look target by the same world vector
    (`parkWeight` ramps in ~stage 1.35→1.55, HOLDS across the red-giant beat, ramps out
    ~2.1→2.5 to **recentre for the yellow swap**), which reproduces the chosen comp
    framing while the star never leaves the origin. While parked, the orbital drift is
    frozen so the giant just sits and spins on its axis. (`uGiantCenter` exists but
    defaults to origin — it can nudge the geometry in world space for dev inspection.)
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
→ `scene.css` → `hero.css` → `hud.css` → `prose.css` → `about.css` → `debug.css` (dev-only
overlays). Add new rules to the partial that owns the concern; only `tokens.css` defines
`:root` variables.

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
- **`window.__bhGiantR`** (a number) and **`window.__bhGiantCenter`** (`[x, y, z]`) live-tune the
  **red giant** only: `__bhGiantR` reads in effective-`uGiantR` world units and drives the
  red-giant-only `uGiantScale` (= value / 4.2), so resizing the orb never touches the nebula/dot/
  sun/sim; `__bhGiantCenter` retargets the **camera park vantage** `RED_GIANT_PARK` (the orb stays
  centred at origin — these move the CAMERA to frame the grown giant off-centre). Both default to
  the shipped look (`uGiantScale` 17.6/4.2, park `[18, -12, 26]`). Set `__bhMorph≈1.9` to frame the
  parked orb while tuning. A **dev-only slider panel** (`src/hero/components/RedGiantDebugPanel.tsx`,
  mounted from `index.astro` behind `import.meta.env.DEV`) writes these hooks via UI; nothing ships
  in prod.
- **`scratchpad/*.mjs`** — Playwright capture scripts that spin up the dev server, scroll or
  force `__bhMorph`/`__bhFlash`, and save screenshots (`scratchpad/state-N-*.png`, `nova-*.png`,
  `live-*.png`, etc.) for reviewing each state. `scratchpad/` is a workspace for probes/
  screenshots, not shipped code.

## Commands

- `npm run dev` — Astro dev server.
- `npm run build` — production build.

## Workflow

**All work must be done by a subagent in an isolated git worktree, then merged back.**
Do not edit files on the main checkout directly. For every task:

1. Spawn a subagent (the `Agent` tool) to do the actual work, running it with
   `isolation: "worktree"` so it operates on its own copy of the repo.
2. Let the subagent implement, build (`npm run build`), and verify its change inside
   that worktree.
3. Only once the work is complete and verified, merge the worktree branch back into
   `main`.

The main working tree stays clean; every change lands through a worktree-isolated
subagent and a merge — never via a direct edit on `main`.
