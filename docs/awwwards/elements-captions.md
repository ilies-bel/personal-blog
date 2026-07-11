# Awwwards Elements — candidates & caption skeletons

Eight non-duplicative Elements submissions, each mapped to a real, shipped
site feature and to the capture that serves it (see `press-kit.md` for where
each capture lives). One Element per distinct interaction system — never two
crops of the same feature.

Caption skeletons keep the site's register: name the mechanism, state the
constraint it respects, no adjectives doing the work. `[OWNER]` = final voice
pass.

| # | Element category | Site feature | Serving capture / loop |
|---|------------------|--------------|------------------------|
| 1 | Scroll animation | The reversed stellar lifecycle: scroll rewinds black hole → supernova → red giant → yellow star → nebula → pale blue dot | Reel chapter 1 (the full descent); stills `main-01…04`, `still-01…04` |
| 2 | Loader | The honest loader: paints pre-JS, reveals on the scene's real first frame, ≤1s floor, working "Skip intro" button before hydration | Reel opening (boot beat, untrimmed) |
| 3 | Page transition | The hyperspace warp into About / the marker dive into articles (bloom veil covers the swap, destination resurfaces) | Reel chapter 2 (Work transition) + a dedicated warp screen recording [regenerate on GPU hardware] |
| 4 | Cursor | The dot→hexagon custom cursor + the decode-hover scramble on mono labels | Short dedicated loop [OWNER: record 10s over the nav + footer links] |
| 5 | Navigation | The HUD corner nav: celestial stations that boot with the pilot's power toggle (the decloak), locked section indices on reading pages | Still `main-01` (corner chrome visible variant: rerun shoot-submission without the DOM hide) + reel nav moments |
| 6 | Storytelling | The finale ledger: build-derived counts (2 shipped, 2 dead), a replay control, the manifesto resolving on the pale blue dot | Still `main-04-finale-ledger` |
| 7 | 404 page | "This page collapsed." — branded, static, every primary route one link away, real HTTP 404 | Screenshot from `scratchpad/p9/` route sheets (or rerun `scripts/shoot-routes-grayscale.mjs`) |
| 8 | Background / ambient interaction | The contact transmission frame: pale-blue-dot poster + static signal rings + motion-gated radial pulse — zero JS, zero WebGL | Still `still-08-contact`; OG card `public/og/contact.png` |

## Caption skeletons

1. **Scroll animation** — "The page plays stellar physics in reverse: the
   black hole you open on is the end of the story. Six scroll states, one
   GPU particle cloud (~1.2M points), one seam in the code to flip the
   direction back. [OWNER: 1 line on why reverse.]"
2. **Loader** — "The loader never lies: it lifts on the engine's actual first
   composited frame, holds at most one second, and ships a Skip button that
   works before React does. No-JS visitors never see it at all."
3. **Page transition** — "Navigations stay under 700ms except the two
   authored set-pieces: the hyperspace jump to About and the marker dive
   into an article — one canvas persisted across the swap, so the streaks
   never cut."
4. **Cursor** — "A quiet dot that becomes a hexagon over anything
   interactive; mono labels scramble-resolve on hover, pointer-only,
   reduced-motion no-op, original text always restored."
5. **Navigation** — "The site nav is a cockpit HUD the visitor powers up
   themselves — off by default, one bit of state, persisted. Sections are
   celestial stations; the current one locks with a two-digit index."
6. **Storytelling** — "The finale ledger's numbers are compiled from the
   content collections at build time — '2 shipped, 2 dead' can't drift from
   the truth, and the dead ones get their own page."
7. **404** — "This page collapsed. The error page is the only static
   lifecycle joke on the site; every primary route is one link away and the
   HTTP status is honestly 404."
8. **Ambient interaction** — "Contact renders a transmission: signal rings
   over the pale blue dot, pulsing only when your OS allows motion. It's a
   poster and CSS — the reading routes ship zero WebGL."

## Rules

- Re-capture any Element asset on real GPU hardware before upload (sandbox
  captures are SwiftShader-rendered).
- Every caption's factual claim must stay true on the submitted build — when
  in doubt, rerun the check that guards it (see acceptance-gates.md).
