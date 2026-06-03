# Red giant → yellow star transition — implementation notes

Status: **DONE (Option B).** Implemented on `main`'s sun-rig architecture. This
note records the decision, the spec, and what shipped. See [`README.md`](./README.md)
for the naming of every term used below.

## The original request

> Create the transition red star → yellow star.
> - Colour should vary **linearly** from one to the other, and so should the size.
> - Make the yellow star **30% smaller**.
> - Make the **flares more prominent**.

## The core problem

On `main` the two ends of this transition are drawn by **different renderers**:

- **red giant** = the **point cloud** (`sunRadFac = 1.45`, `vSunRed = 1`).
- **yellow star** = the **mesh sun rig** (`buildSunRig`).

A *true* per-particle linear morph from a point cloud into a separate mesh is not
possible — they are different geometry systems. So two approaches were on the
table (full history kept below). We chose **Option B: keep the mesh sun rig** (it
has the richer corona + animated loops, and keeps the Ashima simplex noise).

## What shipped (Option B)

All in `src/hero/BlackHole.tsx`:

1. **30% smaller** — the rig radius is derived from the red giant's world radius:
   ```
   RED_GIANT_RADIUS = 4.2 * 1.45   // = 6.09 (point-cloud red giant)
   SUN_RIG_RADIUS   = RED_GIANT_RADIUS * 0.7  // = 4.263, exactly 30% smaller
   ```
   The lifecycle zoom is identical at stage 2 and stage 3 (`growT` is saturated
   by stage 1.3), so on-screen size is directly proportional to world radius →
   the yellow star reads as 70% of the red giant.

2. **Soft cross-fade swap** (replaces the old hard pop at stage 2.5) — a SCALE
   cross-fade across a window centred on 2.5:
   - `rigGrow` = `smoothstep(2.40→2.62)` in, `smoothstep(3.40→3.50)` out.
   - the rig `group.scale` swells from a 0.12 seed → full size with `rigGrow`.
   - the point-cloud red giant is **held behind the rig** until the opaque
     photosphere covers it (`rigGrow > 0.6`), then hidden — so it reads as the
     giant contracting into the tighter yellow star, not one object blinking out.
   - the rig's star backdrop opacity tracks `rigGrow`.

3. **More prominent flares** — in `buildSunRig`:
   - loop arcades `NA` 16 → 22, "big" arcades 4 → 7, arches higher off the limb.
   - erupting prominences `NP` 9 → 15, each taller/denser (`scale` 0.7–1.5).

### Note on "linear colour + size"

Because the yellow star is a different object (the mesh rig), the colour/size
change across the boundary is a **scale cross-fade between two renderers**, not a
strictly per-particle linear ramp. This is the accepted Option-B trade-off (it
buys the rig's corona/loops). If a strictly linear colour+size morph is ever
wanted, see Option A below — it would drop the mesh rig for this state.

## Verification

- `npm run build` passes.
- Captured stage 2.0 → 3.0 with `scratchpad/shoot-handoff.mjs` (forces
  `__bhMorph`): red giant → smooth rig grow-in (2.45 cloud, 2.55 swelling sun) →
  settled smaller, flare-rich yellow star at 3.0. No page/shader errors.
- Glossary images (`red-giant.png`, `yellow-star.png`) were regenerated against
  this build via `scratchpad/shoot-glossary.mjs`.

---

## Appendix — the option that was NOT taken

### Option A — point-cloud sun does the whole morph (truly linear)
Drive the entire morph on the **point cloud** across `stage 2 → 3`, disabling the
mesh swap: `vSunRed = 1 - uYellow` (linear red→gold; the fragment already does
`mix(sc, rc, vSunRed)`), `sunRadFac = mix(1.45, 1.015, uYellow)` (30% smaller),
`atmoThresh` ramped for more flares, and `yellow` made a continuous ramp.
- Pro: genuinely linear colour + size. Con: drops the mesh rig's corona/loops.

## Verification harness gotcha (for the dev server)

This is a git worktree; its `node_modules` is empty. To run `npm run dev` for
screenshot capture:
1. symlink deps: `ln -s <main-checkout>/node_modules ./node_modules`, and
2. TEMPORARILY add to `astro.config.mjs` (revert before commit):
   `vite: { server: { fs: { allow: ['<main-checkout-abs-path>'] } } }`
   (Vite blocks serving the symlink's realpath outside the worktree otherwise →
   the React island 403s and the canvas renders black.)
