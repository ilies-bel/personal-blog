# EXP-037 — Route Motion Grammar Evidence

**Task:** Distinct route motion verbs governed by one shared physics grammar.  
**Status:** Implemented  
**Source spec:** docs/specs/route-physical-laws.md (EXP-020)  
**Transition contract:** docs/specs/transition-contract.md (EXP-014)  

---

## Shared Physics Grammar

| Property | Value | Source |
|---|---|---|
| House easing curve | `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-out-quint`) | `tokens.css` |
| Peel easing override | `cubic-bezier(0.2, 0, 0.1, 1)` (`--ease-verb-peel`) | `tokens.css` (spec-mandated for BtB) |
| Destination cap | 700 ms | `transitionDurations.ts` `DESTINATION_TRANSITION_CAP_MS` |
| Animation properties | `transform`, `opacity`, `filter`, `box-shadow` only | `motion-verbs.css` |
| Reduced-motion gate | `@media (prefers-reduced-motion: reduce)` | `motion-verbs.css` |
| A11Y service | `html[data-reduced-motion]` + `motionPreference.ts` | A11Y-004 |

All interaction verb transitions use `will-change: transform` or `will-change: auto` where appropriate. No `width`, `height`, `top`, `left`, or `margin` is animated — only compositor-friendly properties.

---

## Route Verb Registry

### Projects — *arc*

**Lifecycle:** Yellow Star / Sustained Orbit  
**Token:** `VERB_ARC_MS = 350ms` (`--verb-dur-arc: 0.35s`)  
**Easing:** `--ease-out-quint`

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Hover | `perspective(640px) rotateY(-2.5deg) translateX(3px)` + left-edge shadow | `transform: none; box-shadow: none` |
| Keyboard focus | Rounded orbital outline (`border-radius: --radius-md`) | Static rounded outline (always shown) |
| Page entry | `verb-arc-enter` keyframe (80ms stagger per item, max 6 items) | `animation: none` |

**CSS:** `motion-verbs.css` § Projects  
**Keyframe:** `@keyframes verb-arc-enter` — `opacity: 0; perspective rotateY(3.5deg) translateX(-10px)` → final  
**Entrance token:** `VERB_ARC_ENTRY_MS = 500ms` (`--verb-dur-arc-entry: 0.5s`)

---

### Writing — *coalesce*

**Lifecycle:** Nebula / Dispersed Matter Coalescing  
**Token:** `VERB_COALESCE_PULL_MS = 300ms` (`--verb-dur-coalesce-pull: 0.3s`)  
**Easing:** `--ease-out-quint`

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Hover (nearby siblings) | `translateY(2px)` on non-hovered siblings (local gravitational pull, max 4px per spec) via `:has()` | `transform: none` |
| Page entry | `verb-coalesce-enter` keyframe (6px outward → cluster position, 60ms stagger) | `animation: none` |

**CSS:** `motion-verbs.css` § Writing  
**Keyframe:** `@keyframes verb-coalesce-enter` — `opacity: 0; translateX(6px)` → final  
**Entrance token:** `VERB_COALESCE_ENTRY_MS = 600ms` (`--verb-dur-coalesce-entry: 0.6s`)

---

### Graveyard — *contract*

**Lifecycle:** Post-Supernova / Thermal Decay (White Dwarf)  
**Token:** `VERB_CONTRACT_MS = 200ms` (`--verb-dur-contract: 0.2s`)  
**Easing:** `--ease-out-quint`

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Hover | `scale(0.985)` — barely perceptible inward pull (spec) | `transform: none` |
| Keyboard focus | 1px rectangular outline, no rounding, no glow (forensic) | Static (always shown) |
| Page entry | Pure opacity fade via `data-revealed` (IntersectionObserver in graveyard.astro) — no slide, no bounce (spec) | `opacity: 1; transition: none` |

**CSS:** `graveyard.css` (entry transition) + `motion-verbs.css` (hover verb)  
**Entry:** `transition: opacity var(--verb-dur-contract-entry) var(--ease-out-quint)` — 900ms per specimen  
**Entrance token:** `VERB_CONTRACT_ENTRY_MS = 900ms` (`--verb-dur-contract-entry: 0.9s`)  
**Height fix:** The scroll progress rail in `article.css` was changed from `transition: height` to `transform: scaleY` + `transition: transform` (backlog detector rule).

---

### Behind the Build — *peel*

**Lifecycle:** Stellar Formation / Red Giant (Interior Layers Exposed)  
**Token:** `VERB_PEEL_MS = 350ms` (`--verb-dur-peel: 0.35s`)  
**Easing:** `--ease-verb-peel` (`cubic-bezier(0.2, 0, 0.1, 1)` — spec-mandated)

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Hover over shader panel | `translateX(3px)` — layer peels forward from stratum | `transform: none` |
| Keyboard focus | Bracket pair `[·]` via `box-shadow: -3px 0 0 0 accent` (typographic, not animated) | Static (always shown) |
| Page entry | `verb-peel-enter` keyframe — `translateX(-12px)` slides in from left; 100ms stagger | `animation: none` |

**CSS:** `motion-verbs.css` § Behind the Build  
**Keyframe:** `@keyframes verb-peel-enter` — `opacity: 0; translateX(-12px)` → final  
**Entrance token:** `VERB_PEEL_ENTRY_MS = 450ms` (`--verb-dur-peel-entry: 0.45s`)

---

### About — *settle*

**Lifecycle:** Pale Blue Dot / Scale Contraction to Human  
**Token:** `VERB_SETTLE_HOVER_MS = 250ms` (`--verb-dur-settle-hover: 0.25s`)  
**Easing:** `--ease-out-quint`

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Page entry | `verb-settle-enter` keyframe — `translateY(-6px)` resolves downward into rest (spec: "gentle arrival") | `animation: none` |
| Hover on name/signature | `filter: brightness(1.12)` — luminance +12%; no size/position change (spec) | `filter: none` |
| Keyboard focus | Soft glow: `box-shadow: 0 0 0 4px accent/40%` (spec: 4px radius, 40% opacity) | Static (always shown) |

**CSS:** `motion-verbs.css` § About  
**Keyframe:** `@keyframes verb-settle-enter` — `opacity: 0; translateY(-6px)` → final  
**Entrance token:** `VERB_SETTLE_ENTRY_MS = 700ms` (`--verb-dur-settle-entry: 0.7s`)  
**Note:** 700ms exactly equals the destination cap but is an ENTRANCE token (content pre-rendered); exempt from cap enforcement.

---

### Contact — *transmit*

**Lifecycle:** Signal Transmission / Electromagnetic Propagation  
**Tokens:** `VERB_TRANSMIT_RIPPLE_MS = 400ms`, `VERB_TRANSMIT_SHIFT_MS = 300ms`  
**Easing:** `--ease-out-quint`

| Trigger | Full motion | Reduced motion |
|---|---|---|
| Field focus | `verb-transmit-ripple` keyframe on `::after` — opacity 60%→0%, scale 0.97→1.04 (spec: 400ms) | `display: none` on `::after` |
| Form submit | `translateX(4px)` on `.contact-submit[data-transmitting]` | `transform: none; opacity: 0.7` (opacity cross-fade only, per spec) |
| Page entry | `verb-transmit-enter` keyframe — `translateX(12px)` converges inward; 60ms stagger | `animation: none` |

**CSS:** `motion-verbs.css` § Contact  
**Keyframe:** `@keyframes verb-transmit-enter` — `opacity: 0; translateX(12px)` → final  
**Keyframe:** `@keyframes verb-transmit-ripple` — expand/fade from field boundary  
**Entrance token:** `VERB_TRANSMIT_ENTRY_MS = 500ms` (`--verb-dur-transmit-entry: 0.5s`)

---

## Height-Based Animation Fix

**Rule:** No `height`- or `width`-based transitions (backlog detector rule, EXP-037).

**File:** `src/styles/article.css`

| Before | After |
|---|---|
| `height: calc(var(--scene-progress, 0) * 100%); transition: height 0.12s linear` | `height: 100%; transform: scaleY(var(--scene-progress, 0)); transform-origin: top center; transition: transform 0.12s linear` |
| `width: calc(var(--scene-progress, 0) * 100%)` (mobile) | `width: 100%; transform: scaleX(var(--scene-progress, 0)); transform-origin: left center` (mobile) |

The `scaleY`/`scaleX` approach is GPU-composited; no layout paint occurs on scroll.

---

## Token Governance

| JS export | CSS property | Value | Cap |
|---|---|---|---|
| `VERB_ARC_MS` | `--verb-dur-arc` | 350ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_COALESCE_PULL_MS` | `--verb-dur-coalesce-pull` | 300ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_CONTRACT_MS` | `--verb-dur-contract` | 200ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_PEEL_MS` | `--verb-dur-peel` | 350ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_SETTLE_HOVER_MS` | `--verb-dur-settle-hover` | 250ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_TRANSMIT_RIPPLE_MS` | `--verb-dur-transmit-ripple` | 400ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_TRANSMIT_SHIFT_MS` | `--verb-dur-transmit-shift` | 300ms | ≤ 700ms ✓ (DESTINATION) |
| `VERB_ARC_ENTRY_MS` | `--verb-dur-arc-entry` | 500ms | Exempt (ENTRANCE) |
| `VERB_COALESCE_ENTRY_MS` | `--verb-dur-coalesce-entry` | 600ms | Exempt (ENTRANCE) |
| `VERB_CONTRACT_ENTRY_MS` | `--verb-dur-contract-entry` | 900ms | Exempt (ENTRANCE) |
| `VERB_PEEL_ENTRY_MS` | `--verb-dur-peel-entry` | 450ms | Exempt (ENTRANCE) |
| `VERB_SETTLE_ENTRY_MS` | `--verb-dur-settle-entry` | 700ms | Exempt (ENTRANCE) |
| `VERB_TRANSMIT_ENTRY_MS` | `--verb-dur-transmit-entry` | 500ms | Exempt (ENTRANCE) |

All DESTINATION/INTERACTION tokens are included in `DESTINATION_TOKENS` and enforced by `test/transitionDurations.test.mjs`. All ENTRANCE tokens are excluded from `DESTINATION_TOKENS`.

---

## Test Coverage

| Test file | What it verifies |
|---|---|
| `test/motionVerbs.test.mjs` | All 13 verb tokens defined, interaction tokens in DESTINATION_TOKENS ≤ 700ms, entrance tokens not in DESTINATION_TOKENS, CSS mirror values, grammar invariants |
| `test/transitionDurations.test.mjs` | DESTINATION_TOKENS global cap — now automatically covers the 7 verb interaction tokens |
| `e2e/reduced-motion.spec.ts` | A11Y-004 live propagation — verifies that the A11Y-004 service (which gates JS verb consumers) propagates correctly |
| `e2e/transition-contract.spec.ts` | EXP-014 contract — content not gated on any transition completing |

---

## Accessibility & Reduced Motion

Every verb has an explicit reduced-motion path gated by `@media (prefers-reduced-motion: reduce)`:

- **arc** → instant cross-fade; static orbital focus ring
- **coalesce** → no drift; no sibling pull; entry at final positions; opacity transitions only remain
- **contract** → no hover scale; entry is instant (handled in `graveyard.css`)
- **peel** → no slide; bracket focus pair remains (typographic); entry opacity only
- **settle** → no entry motion; hover brightness removed; focus glow is static box-shadow
- **transmit** → no ripple; no convergence; submit shift is opacity cross-fade only

The `html[data-reduced-motion='true']` attribute (A11Y-004 service) governs JS consumers. The CSS `@media` gate and the JS attribute gate are independent and complementary.
