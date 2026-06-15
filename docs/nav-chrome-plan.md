# Nav icons & UI chrome → remove icons, sharpen chrome

**The review (verbatim intent):** The top-nav icons feel stock next to the custom
cosmic world. Six asks: one stroke width, an obvious active state, a hover state
that's more than glow, a keyboard-visible focus state, consistent card borders,
and corner brackets used *intentionally* — not everywhere. Underlying note:
"SOTY-level work needs a bespoke interface system, not generic HUD decoration."

**The decision (overriding the review's framing):** Don't redraw the icons —
**remove them.** Nav is **text labels in every mode**. The type system
(Space Grotesk + IBM Plex Mono on a disciplined 9-rung scale) is already
bespoke; the icons were the thing dragging it toward generic. Deleting them is
the stronger SOTY move than producing yet another icon set.

---

## What the audit actually found (evidence)

The review's "stock" read is correct, and the root cause is concrete:

1. **Strokes are genuinely inconsistent across the glyph set.** Measured stroke
   widths in `public/glyphs/`: `7` (black-hole), `6.5` (all markers), `3`
   (collapse, yellow-star), `2` (dot). `glyph-yellow-star.svg` even uses a
   different `viewBox` (`228 4 224 224`) than every other glyph (`296 6 88 88`),
   so its *rendered* stroke weight diverges again at the same box size.

2. **Two icon systems sit side-by-side in one nav row and clash.** The
   `overlay-blog` nav (`BaseLayout.astro:127–225`) draws its Links ("two
   planets") and Power glyphs as inline `<svg>` at **stroke-width 1.5** on a
   clean `0 0 32 32` grid — these are *fine*. But the four section icons next to
   them are the `glyph-marker-*` files masked down from a **6.5** stroke. Within
   one row: 1.5-stroke icons beside masked 6.5-stroke icons. Guaranteed mismatch
   — exactly the "stock" tell.

3. **Mixed icon vocabularies.** Geometric celestial marks (star/nebula/dot) in
   the rail vs. literal pictographs (person bust, pen, headstone, stacked
   squares) in the section nav. Two languages pretending to be one (the source
   comments even claim they "share the visual language").

4. **Active state is deliberately quiet** — `hud.css:220` tints the current row
   only `color-mix(--fg-dim 78%, --fg)`; the review's "barely visible" is by
   design and reads as a defect outside the author's head.

5. **Corner brackets appear in three places** — subnav target-lock
   (`chrome.css:172–193`), the StarMarker reticle, and the about-page close
   button (`about.css:28–48`). The review's "not everywhere" applies.

6. **Radii are nearly consistent already** — `--radius-sm` (11×), `--radius-md`
   (5×), pill (7×), plus a few stray `2px/3px/4px/50%`. Small cleanup, not a
   rebuild.

---

## The plan (scoped tasks)

### 1. Remove section icons; labels in every mode  ← the core change
- **Live hero rail (`overlay-blog`):** today labels fold to zero width at rest
  and the *icon* is the at-rest whisper (`scene.css:287–321`). With icons gone
  the rail must show **labels at rest** — small mono-uppercase, dim — and the
  hud-active state lifts/brightens rather than unfolds. Keep the gold
  underline-sweep hover and the focus ring; drop the icon nudge.
- **Reading-page subnav (`chrome.css`):** delete `.subnav-icon` and its mask
  machinery (`chrome.css:113–132, 189–191`); the label is already always shown,
  so this is pure removal.
- Delete `.overlay-blog-icon--glyph` (`scene.css:272–286`) and the four masked
  section `<span>`s in `BaseLayout.astro` (140, 149, 158, 167, 599). The Links +
  Power inline SVGs are **functional controls, not decoration** — keep them.
- Retire the now-unused `glyph-marker-*` files (or leave in `public/` unused;
  prefer deleting to avoid dead assets).
- **Verify:** `npx tsc --noEmit`, `npx biome check .`, visual check both navs.
- Save your work.

### 2. One label-state system (covers stroke/active/hover/focus, retargeted)
With icons gone, items 1–4 of the review collapse into **label states**, and the
good ones already exist — consolidate so subnav, overlay-blog, and footer share
one definition:
- **Hover:** keep the gold underline-sweep (it's "more than glow" + motion ✓).
- **Active/current:** make it **obvious** — bump beyond the current 78% tint to
  full `--fg-overlay` + a persistent (not hover-only) underline or left gold
  tick, so the current section is unmistakable.
- **Focus:** keep `:focus-visible` rings; unify offset/width/color across the
  three navs (currently 1px dim line in the rail vs 2px accent in subnav/footer).
- Save your work.

### 3. Corner brackets — keep ONE intentional use
- Keep brackets as the **current-section "lock"** in the subnav (it earns the
  metaphor: it marks where you are). Remove or simplify the duplicate bracket
  treatments (about-close, and reconsider the reticle's) so the gesture means
  one thing. Decide explicitly per-site, document the rule in a comment.
- Save your work.

### 4. Card / surface borders + radii cleanup
- Audit border opacity (everything should use `--hud-line` / `--line`, no
  one-off rgba), radius (snap strays to `--radius-sm/md/pill`), and padding on
  card-like rows (writing/projects/graveyard lists).
- Save your work.

---

## Open question for the live hero rail
Removing the at-rest icon means the corner shows **text labels while scrolling
the lifecycle film**. That's louder than the current icon-whisper. Options:
(a) labels at rest, small + very dim, brightening at the black hole; or
(b) a single quiet label/wordmark at rest that expands to the full menu on
hud-active. Lean (a) for "labels in every mode" literalness; confirm before
building the hero rail piece.
