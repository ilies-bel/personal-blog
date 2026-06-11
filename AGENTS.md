# AGENTS.md

Personal blog built with **Astro** + **three.js**. The home page is dominated by a single
signature hero: a GPU-particle object that runs the **stellar lifecycle in reverse** as the
visitor scrolls.

## The lifecycle hero

Forward stellar physics is:

```
(pale blue dot) → nebula → yellow star → red giant → supernova → black hole
```

The page plays this physics **in reverse** (`LIFECYCLE_DIRECTION = 'reverse'` in
`timeline.ts`). The top of the page (scroll = 0) **opens on the black hole** — the big hero
that pulls the portfolio in — which **rewinds through supernova → red giant → yellow star →
nebula** as you scroll down, then resolves into a **lone pale blue dot** at the bottom (a
single quiet speck / content unlock). The intent is narrative — each state carries a line
of the manifesto about building software that lasts. (The direction is a single seam:
`LIFECYCLE_DIRECTION` set to `'reverse'` mirrors the whole arc; flipping it back to
`'normal'` plays the forward lifecycle. `lifecycleProgress()` is the only place it's
applied.)

### Scroll progress → stage → state map

The scroll track is 6 viewport-tall stages (`.scene-stage` in `src/pages/index.astro`).
`legacyStageForProgress` in `timeline.ts` maps raw scroll progress 0..1 to a fractional
shader `stage`, but it routes through `lifecycleProgress()` first — so in `'reverse'` the
same downward scroll walks the stage coordinate the other way. The shader "stage" coordinate
itself is unchanged (it still runs 4.7→0.0 across the lifecycle); only which physical scroll
position maps to which stage is mirrored. The table below reads **top-of-page →
bottom-of-page** in the reversed order: the black hole opens at scroll 0, the pale blue dot
closes at scroll 1.

| progress     | stage      | state            | notes |
|--------------|------------|------------------|-------|
| 0.00 → 0.18  | 0.0 → 0.32 | black hole       | top of page, the big hero (settles as you scroll down off it) |
| ~0.18–0.34   | 0.32 → 1.05| supernova → collapse | loud blast (rewound) |
| ~0.34–0.49   | 2.05       | red giant        | |
| ~0.63        | ~2.9       | yellow star      | a dedicated mesh "sun rig", not the cloud |
| 0.68 → ~0.90 | 3.0 → 3.5  | collapse → nebula | round fullscreen gas; GPGPU collapse runs in reverse |
| 0.90 → 1.00  | 3.5 → 4.7  | nebula → dot     | the cloud contracts to the lone speck (camera flies out) |
| 1.00         | 4.7        | pale blue dot    | bottom of page — the lonely closing speck / content unlock |

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
    `t * 2π/180`) rolls the photosphere on a fixed ~23°-tilted pole so the star turns on
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
  - **Scale story**: the camera pushes IN at the hero black hole (the opening frame) and pulls
    WAY back at the tiny seed (the closing speck) so the black hole reads as enormous vs the
    lone pale blue dot the arc resolves to.
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

## Workflow

**All work must be done by a subagent in an isolated git worktree, and must STAY in
that worktree until the human reviews it.** Do not edit files on the main checkout
directly, and do **NOT** merge until the human has explicitly approved. For every task:

1. Spawn a subagent (the `Agent` tool) to do the actual work, running it with
   `isolation: "worktree"` so it operates on its own copy of the repo.
2. Let the subagent implement, build (`npm run build`), and verify its change inside
   that worktree, then commit on the worktree branch.
3. **STOP and hand the worktree back for review.** Report the worktree path, the branch
   name, the commit SHA, the files changed, and the build result. Then **wait** — do not
   run `git merge`, do not touch `main`, do not remove the worktree.
4. **Only after the human has explicitly said to merge** (e.g. "merge it", "looks good,
   ship it", "approved") do you merge the reviewed worktree branch back into `main` and
   clean up the worktree.

**Hard rule: never merge a worktree on your own initiative.** Completing and verifying
the work is NOT permission to merge — the human's review gate sits between "verified" and
"merged". If you are unsure whether you've been authorized to merge, assume you have NOT
and ask. The default end-state of any task is "committed in its worktree, awaiting
review", never "merged into main".

The main working tree stays clean; every change lands through a worktree-isolated
subagent, a human review, and only then a merge — never via a direct edit on `main`,
and never via an unreviewed auto-merge.
