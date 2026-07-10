# Cross-Route Transition Contract — EXP-014

**Dependency:** A11Y-004 (centralized motion-preference service)
**Evidence artifact:** evidence/motion/transition-contract.md
**Priority:** P1

---

## Purpose

This document is the authoritative specification for every timed transition and
animated interaction on the site. It defines the behavioural contract every
transition must satisfy, registers every current transition against that
contract, and reserves slots for planned transitions that do not yet exist in
code.

Any new transition introduced in the codebase MUST be registered here before
ship. Any transition that violates the contract rules below MUST be fixed before
the first submission release candidate.

---

## Contract Rules

Every transition on this site must satisfy all six contract dimensions:

| Dimension | Rule |
|---|---|
| **Purpose** | The transition communicates something meaningful — state change, spatial relationship, narrative continuity, or identity. Decorative-only transitions must not block reading. |
| **Trigger** | One clearly documented trigger event. No transition fires from ambiguous or multi-source signals. |
| **Interruption** | Every destination and interaction transition is interruptible at any point without leaving the UI in a broken or half-animated state. |
| **Reduced motion** | Every transition has an explicit reduced-motion variant via the A11Y-004 centralized service (`src/lib/motionPreference.ts`). The reduced variant must deliver the same navigation result and content accessibility as the full variant. |
| **Focus** | SPA navigations move focus to a useful destination. Interaction transitions never hijack focus. The reduced-motion path must be keyboard-operable with the same outcome as the pointer path. |
| **Duration** | DESTINATION transitions (transitions that reveal content at the arrival page) must be ≤ 700 ms. SET-PIECE transitions (deliberate departure choreography) are exempt. All durations are sourced from `src/lib/transitionDurations.ts` (JS) and `src/styles/tokens.css` (CSS) — no hard-coded literals. |
| **Failure fallback** | If the transition engine is unavailable (JS disabled, browser unsupported, canvas unavailable), navigation completes via the normal browser mechanism. Content is never gated on a transition completing. |

### Content-gating rule

Content MUST be in the DOM and accessible to assistive technology before or
without any animation completing. No animation may hold content at `display:none`,
`visibility:hidden`, `opacity:0` with `pointer-events:none`, or any other
inaccessible state beyond the duration of the transition itself. The
`animation-fill-mode: both` pattern in `transitions.css` is safe because content
begins at `opacity:0` only during the animation itself, and the animation only
runs when the document is ready and the element is rendered.

### Duration token rule

Duration literals are banned in individual stylesheets and scripts. All values
must reference:
- **CSS:** `var(--transition-dur-*)` custom properties defined in `src/styles/tokens.css`
- **JS/TS:** named exports from `src/lib/transitionDurations.ts`

The unit test `test/transitionDurations.test.mjs` asserts all destination tokens
are ≤ 700 ms and will fail CI if the cap is breached.

---

## Duration Token Registry

### JavaScript (`src/lib/transitionDurations.ts`)

| Export | Value | Class | Cap applies |
|---|---|---|---|
| `WARP_JUMP_MS` | 1500 ms | SET-PIECE (departure) | No — narrative experience |
| `WARP_ARRIVE_MS` | 700 ms | DESTINATION | Yes — ≤ 700 ms |
| `WARP_NAV_BEFORE_END_MS` | 130 ms | Internal timing offset | N/A |
| `VT_SETTLE_MS` | 250 ms | DESTINATION (outgoing) | Yes — ≤ 700 ms |
| `VT_RISE_MS` | 450 ms | DESTINATION (incoming) | Yes — ≤ 700 ms |
| `PAGE_ENTER_MS` | 600 ms | ENTRANCE (hard-load only) | Exempt — content pre-rendered |
| `PAGE_ENTER_ROWS_MS` | 500 ms | ENTRANCE (hard-load only) | Exempt — content pre-rendered |
| `DECODE_HOVER_MS` | 300 ms | INTERACTION | Yes — ≤ 700 ms |
| `CARD_FLIP_MS` | 400 ms | DESTINATION (reserved) | Yes — ≤ 700 ms |

### CSS (`src/styles/tokens.css`, under `--transition-dur-*`)

| Custom property | Value | Maps to JS export |
|---|---|---|
| `--transition-dur-settle` | `0.25s` | `VT_SETTLE_MS` |
| `--transition-dur-rise` | `0.45s` | `VT_RISE_MS` |
| `--transition-dur-page-enter` | `0.6s` | `PAGE_ENTER_MS` |
| `--transition-dur-page-enter-rows` | `0.5s` | `PAGE_ENTER_ROWS_MS` |

Note: warp durations live only in JS (`transitionDurations.ts`) because the
warp canvas is driven entirely from `requestAnimationFrame`; there is no CSS
counterpart for the warp jump or arrive.

---

## Transition Inventory

### 1. Warp Transition

**Source:** `src/scripts/warpTransition.ts`
**Status:** Implemented

#### Purpose

Signals a special cross-world journey: the About route represents the human
scale at the end of the reverse stellar lifecycle (pale blue dot). Clicking an
About link triggers a Star-Wars hyperspace jump-out, SPA-navigates to /about,
and dissolves the arrival streaks over the loaded page. The set-piece reinforces
the site's reverse-stellar-lifecycle narrative.

#### Trigger

Capture-phase click on any `<a href="*…/about">` on the same origin, with no
modifier keys and no existing jump in flight. Suppressed for same-page clicks
(already on /about).

#### Interruption

| Phase | Interruption behaviour |
|---|---|
| **Jump (departure)** | Non-interruptible by design. The first qualifying click commits to navigation; repeat clicks while `state.phase === 'jump'` are silently suppressed. Navigation is guaranteed to fire at the flash apex regardless. |
| **Arrive (destination)** | Interruptible. A new navigation fires `onPageLoad()` → `stopLoop()` → canvas cleared. The page content is already in the DOM and accessible. |

The jump's non-interruptibility is intentional: it is a narrative set-piece
that has already committed to navigating the user. The result is always the
same — arrival at /about.

#### Reduced-motion variant

When `resolveMotionPreference()` returns `true` (OS `prefers-reduced-motion:
reduce` or manual override):
- The click falls through to the normal ClientRouter navigation (no canvas,
  no `bh:warp` flag, no readout).
- The arrive handler (`onPageLoad`) no-ops the deceleration.
- The canvas is cleared and stood down immediately.

The plain SPA swap produced by ClientRouter is covered by the view-transition
reduced-motion rules (see §2 below).

#### Focus behaviour

The SPA swap is performed via Astro's ClientRouter `navigate()`. Focus behaviour
after the swap is governed by A11Y-006 (focus, dialog, menu, and route-transition
behaviour). The transition contract does not define focus destination — it
delegates to A11Y-006 and trusts ClientRouter's focus management.

Under reduced motion the plain ClientRouter swap applies directly, with the same
A11Y-006 focus behaviour.

#### Duration tokens

| Phase | Token | Value | Cap |
|---|---|---|---|
| Jump-out (departure) | `WARP_JUMP_MS` | 1500 ms | Exempt (set-piece) |
| Arrive (destination) | `WARP_ARRIVE_MS` | 700 ms | ≤ 700 ms ✓ |
| Nav timing offset | `WARP_NAV_BEFORE_END_MS` | 130 ms | N/A |

Navigation fires at `WARP_JUMP_MS − WARP_NAV_BEFORE_END_MS = 1370 ms`, ensuring
the SPA swap (and thus content load) happens while the canvas is still at peak
brightness, concealing the page swap visually.

#### Failure fallback

If the warp canvas (`[data-warp-overlay]`) is absent (JS disabled, element
removed, BaseLayout changed), `ensureState()` returns `null` and `onClick` falls
through to the normal anchor click → browser hard navigation. The `bh:warp` flag
is never set, so no arrive animation plays on the destination.

If the ClientRouter `import('astro:transitions/client')` dynamic import fails,
`navigateNow()` falls back to `window.location.assign(href)`, producing a hard
navigation. Content still loads; the canvas continues animating until the hard
reload clears it.

---

### 2. ClientRouter View Transitions

**Source:** `src/styles/transitions.css`, `src/layouts/BaseLayout.astro`
**Status:** Implemented

#### Purpose

Makes SPA navigations feel physically grounded: outgoing content settles
down-and-dim (a small sink) while incoming content rises into place. Shared-
element morphs (writing-row title → article `<h1>`) use the same curve to
connect the list and the article spatially.

The home → article dive (bloom veil) and the warp transition each suppress the
view-transition via `skipTransition()` / `transition:persist` so they never
double-animate under the custom choreography.

#### Trigger

Astro's ClientRouter fires view transitions on every SPA navigation that is not:
- explicitly skipped (`skipTransition()` called in the `before-swap` hook, e.g. for dive/warp navigations)
- reduced-motion (the CSS collapses every `::view-transition-*` animation to `none`)

#### Interruption

Astro's ClientRouter handles view-transition interruption natively. A new
navigation while a transition is running cancels the current transition and
starts a fresh one. Content is swapped into the DOM as normal.

#### Reduced-motion variant

```css
@media (prefers-reduced-motion: reduce) {
  :root::view-transition-group(*),
  :root::view-transition-image-pair(*),
  :root::view-transition-old(*),
  :root::view-transition-new(*) {
    animation: none;
  }
}
```

With `animation: none` the transition resolves instantly. No snapshot overlay
is shown; the page swap is immediate. This is the correct CSS-level gate;
the A11Y-004 `html[data-reduced-motion]` attribute governs JS consumers. The
two gates are independent and complementary.

#### Focus behaviour

Governed by A11Y-006. ClientRouter moves focus after the swap; the transition
contract defers to that specification.

#### Duration tokens

| Animation | CSS property | Token | Value | Cap |
|---|---|---|---|---|
| `vt-settle` (outgoing) | `animation-duration` | `--transition-dur-settle` | `0.25s` | ≤ 700 ms ✓ |
| `vt-rise` (incoming) | `animation-duration` | `--transition-dur-rise` | `0.45s` | ≤ 700 ms ✓ |
| Shared-element morph | `animation-duration` | `--transition-dur-rise` | `0.45s` | ≤ 700 ms ✓ |

#### Failure fallback

On browsers that do not support the View Transitions API, Astro's simulated
fallback produces a plain DOM swap (no snapshot overlay). Chrome pinning
(`transition:animate="none"` on subnav/footer) still applies. Content is never
hidden.

---

### 3. Hard-Load Entrance Choreography

**Source:** `src/styles/transitions.css`
**Status:** Implemented

#### Purpose

On hard loads of reading pages (Writing, Projects, Graveyard, articles), a
single orchestrated stagger-rise reveal announces that the content has landed.
It runs ONCE at load; SPA arrivals use the view-transition rise instead
(gated off via `html[data-astro-nav]`).

#### Trigger

Pure CSS animation — no class gating, no JavaScript required. Fires on every
hard load of a page containing `.writing-hero`, `.projects-hero`,
`.graveyard-hero`, `.article-header`, `.writing-featured`, `.writing-list`,
`.projects-list`, or `.graveyard-list`. Suppressed for SPA arrivals via the
`html:not([data-astro-nav])` selector (BaseLayout stamps `data-astro-nav` in
its `before-swap` hook).

#### Interruption

CSS animations are browser-managed. The `animation-fill-mode: both` ensures a
smooth start and end state. Because content is pre-rendered in HTML (no JS gate),
the page is readable with CSS disabled or in forced-colors mode.

#### Reduced-motion variant

Suppressed entirely at the media query level. No `animation-fill-mode: both`
fill can hide content under reduced motion because the entire `@media
(prefers-reduced-motion: no-preference)` block is absent for those users.

#### Focus behaviour

No focus change — this is a passive visual reveal. Keyboard users experience
the content immediately at full opacity; the animation is additive.

#### Duration tokens

| Target | Token | Value | Note |
|---|---|---|---|
| Hero block children | `--transition-dur-page-enter` | `0.6s` | Each item; delays stagger up to 0.24s |
| Featured pair | `--transition-dur-page-enter` | `0.6s` | Delay 0.16–0.22s |
| List rows 1–6 | `--transition-dur-page-enter-rows` | `0.5s` | Delays 0.18–0.40s |

**Exemption from 700 ms cap:** Content is already rendered in the DOM before
any animation runs. These animations are purely additive visual enhancements
and cannot gate content access. The last row in a stagger may take up to
`0.40 + 0.5 = 0.9 s` of total elapsed time, but content is accessible from
t=0.

#### Failure fallback

Because the animation is pure CSS with no `display:none` gate and no JS
dependency, disabling JavaScript leaves the content fully visible at all times.
The `from` keyframe (`opacity: 0; transform: translateY(12px)`) only applies
while the animation is running.

---

### 4. Decode Hover

**Source:** `src/scripts/decodeHover.ts`
**Status:** Implemented

#### Purpose

Mono instrument labels (`[data-decode]`) scramble through readout glyphs and
resolve left-to-right when the pointer enters them, like an instrument
re-acquiring a signal. Reinforces the site's HUD/instrument aesthetic on
interactive chrome. Confined to mono labels only (fixed-advance font eliminates
layout shift).

#### Trigger

Delegated `mouseover` on `document`. Fires when the pointer enters any element
containing or being `[data-decode]`, resolving the hover scope to the nearest
enclosing `<a>` or `<button>`. Only one delegated pair on `document` — survives
all ClientRouter swaps.

**Pointer only.** Keyboard focus deliberately does NOT scramble: a screen reader
computes the accessible name around focus time, and a mid-scramble name would be
announced as garbage. Focus-state visual treatments (underline, tick, colour
change) remain active under keyboard navigation regardless.

#### Interruption

Interruptible at any point via `mouseleave` (`mouseout` bubbles to document).
`stop()` cancels the `requestAnimationFrame` loop and immediately restores the
original text via `el.dataset.decodeText`. The element never stays scrambled
after the pointer leaves.

Re-entry while a decode is in progress is suppressed (`running.has(el)` guard);
the first decode completes before a new one can start.

#### Reduced-motion variant

`start()` no-ops when `resolveMotionPreference()` returns `true`. The
colour/underline hover treatments from CSS remain active, so the interactive
state is still confirmed visually and via CSS `:hover`.

#### Focus behaviour

No focus involvement. Keyboard focus does not trigger the scramble (no
`focusin`/`focus` listener). The accessible name is always the resolved
original text.

#### Duration tokens

| Token | Value | Cap |
|---|---|---|
| `DECODE_HOVER_MS` | 300 ms | ≤ 700 ms ✓ |

#### Failure fallback

If `requestAnimationFrame` is unavailable (very old or locked-down browser),
`start()` does nothing (unhandled exception suppressed at script scope). The
original text is already in the DOM. If the script fails entirely (JS disabled),
labels display their original text with no scramble.

---

### 5. Card Flips — Reserved

**Source:** Not yet implemented
**Status:** Reserved — planned for EXP-022 (Projects orbital composition) and
EXP-037 (route motion verbs)

#### Purpose (planned)

Reveal proof content on the back face of a Projects card when the user activates
it (click or keyboard Enter/Space). The flip signals a spatial depth metaphor
consistent with the "sustained orbit" physical law for the Projects route
(EXP-020).

#### When this section becomes binding

This section becomes a hard implementation contract when any card-flip component
is added to the codebase. The component must satisfy all fields below before
ship. Until then, `CARD_FLIP_MS = 400 ms` is reserved in
`src/lib/transitionDurations.ts` and included in the duration-cap unit test.

#### Required fields (to be completed at implementation time)

| Field | Required value |
|---|---|
| **Purpose** | Reveal proof content; signal spatial depth for Projects route |
| **Trigger** | Click or keyboard Enter/Space on a card in its front-face state |
| **Interruption** | Cancelable at any point; back-face re-click returns to front face immediately |
| **Reduced-motion variant** | Instant reveal (no rotation); CSS `@media (prefers-reduced-motion: reduce)` zeroes the transform duration |
| **Focus** | After flip: focus moves to the first interactive element on the back face; after un-flip: focus returns to the card trigger |
| **Duration** | ≤ `CARD_FLIP_MS` (400 ms, currently reserved in `DESTINATION_TOKENS`) |
| **Failure fallback** | Without JS: back-face content is in the DOM, either pre-visible or disclosed via `<details>`/`<summary>` |

#### Content-gating requirement

Back-face content MUST be in the DOM before the flip begins (e.g. rendered but
visually hidden via `backface-visibility: hidden` + `opacity: 0`, not `display:
none`). This ensures assistive technology can read the content without completing
the flip.

---

## Enforcement Checklist

This section is the pre-release gate for EXP-014.

### Automated assertions

- [ ] `npm test` includes `test/transitionDurations.test.mjs` which asserts
  every entry in `DESTINATION_TOKENS` is ≤ 700 ms.
- [ ] `npm run check` (Astro TypeScript check) passes with no errors in
  `src/lib/transitionDurations.ts`, `src/scripts/warpTransition.ts`, and
  `src/scripts/decodeHover.ts`.
- [ ] E2E spec `e2e/transition-contract.spec.ts` asserts SPA navigation completes
  with `prefers-reduced-motion: reduce` active and content is accessible.

### Human sign-off items

- [ ] Every transition in §Transition Inventory has been manually verified on
  the production build with `prefers-reduced-motion: reduce` active.
- [ ] Warp arrive plays and dissolves within 700 ms on a production build
  (timed with DevTools Performance panel).
- [ ] View-transition settle + rise play correctly in Chromium; Astro simulated
  fallback tested in Firefox and Safari.
- [ ] Decode hover scramble completes within 300 ms on a low-end device.
- [ ] No transition leaves content inaccessible (checked with VoiceOver on macOS,
  NVDA on Windows).
- [ ] Card flip contract fields are completed before first implementation ships.

---

## Change Protocol

1. **Adding a new transition:** Register it in this document (all six contract
   dimensions) before the PR merges. Add its duration token to
   `transitionDurations.ts` and — if it is a destination/interaction token —
   to `DESTINATION_TOKENS`.
2. **Changing a duration:** Update `transitionDurations.ts` AND the matching
   `--transition-dur-*` property in `tokens.css` in the same commit. The unit
   test catches a JS-only or CSS-only update.
3. **Removing a transition:** Remove its entry here and its token from
   `transitionDurations.ts`. If the token was in `DESTINATION_TOKENS`, remove it
   there too.
4. **Exceeding the 700 ms cap:** Requires explicit product sign-off and an update
   to this document explaining the exemption (like WARP_JUMP_MS). The unit test
   must be updated to reflect the exemption rather than bypassed.
