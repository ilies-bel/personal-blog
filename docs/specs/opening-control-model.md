# Opening Control Model — EXP-005

## Purpose

The home page opening surface is the first contact point for every visitor.
This spec defines the control hierarchy, labelling contract, and interaction
model for all controls present during and after the cinematic scroll experience.

---

## Control Hierarchy

### Primary: Scroll

Scrolling is **the** primary narrative interaction on the home page.  The scroll
track drives the stellar lifecycle from black hole (opening) down to pale blue
dot (close).  No control competes with or interrupts scroll by default.  Controls
exist to support, escape from, or adjust the experience — never to replace scroll
as the author of the narrative.

### Tier 1: Skip Experience (persistent escape hatch)

A single, always-visible **"Skip experience"** link allows any visitor to bypass
the cinematic opening and jump directly to the portfolio work at any moment.

| Attribute | Value |
|---|---|
| Element | `<a>` (navigates, not an action) |
| Visible label | `Skip experience` |
| Accessible name | `Skip experience` |
| Destination | `/projects` — the portfolio work index |
| Placement | Bottom-right corner, fixed |
| Z-layer | `z-index: 62` — above the intro loader (`z-60`) |
| Persistence | Present from initial server render through every lifecycle phase |
| Touch target | Min 44 × 44 CSS px (WCAG 2.5.5) |

**Why Tier 1:** Visitors who already know the work, or who are on limited time,
must always have an immediate, zero-scroll path to the actual portfolio.  The label
explains the outcome ("Skip experience") rather than a cockpit metaphor.

### Tier 2: Site Navigation Links (Work, Writing, About, Contact)

The four canonical destinations, rendered in the top-right corner overlay as
mono-uppercase labels.  These are destination links, not meta-controls.

- Labels name destinations, not scene stages or celestial bodies
- Server-rendered, keyboard-navigable, touch-friendly from zero JS
- Visual gate: dims while scroll is in the opening hold (`body.at-opening`) to
  keep the initial spectacle quiet; **always keyboard-accessible** regardless of
  visual state

### Tier 3: Utility Controls (secondary, grouped)

Secondary controls are grouped together, visually smaller than the nav labels,
and positioned after the site-navigation links in both DOM order and visual
layout.  They carry `aria-pressed` to communicate their current state.

| Control | Old label (cockpit metaphor) | Corrected label (outcome) |
|---|---|---|
| Power button | `Power the navigation HUD` | `Toggle navigation controls` |
| Scene toggle | `Toggle background scene` | `Toggle background animation` |

**Grouping:** The power button and scene toggle are collected at the trailing
end of the `.overlay-blog` flex row, after the nav links and social icons, so
their visual weight is clearly less than the navigation destinations.

---

## State Stability Contract

| Control | State storage | Conflict risk |
|---|---|---|
| Skip experience | Stateless — always navigates to `/projects` | None |
| Power button | `localStorage["hud-state"]` — persists across reloads | None with scroll |
| Scene toggle | `localStorage["backdrop"]` — persists across reloads | None with nav |

No control mutates scroll position or intercepts browser scroll gestures.

---

## Keyboard Parity

Every control is reachable and operable by keyboard alone:

| Control | Element | Keyboard action |
|---|---|---|
| Skip experience | `<a>` | Tab → focus; Enter → navigate |
| Nav links | `<a>` | Tab → focus; Enter → navigate |
| Power button | `<button>` | Tab → focus; Enter or Space → toggle |
| Scene toggle | `<button>` | Tab → focus; Enter or Space → toggle |

DOM order matches visual reading order so screen-reader and keyboard-nav coherence
is maintained without `tabindex` hacks.

---

## Touch Parity

- Minimum touch target: 44 × 44 CSS px (WCAG 2.5.5) for every control
- No control relies on hover-only interactions
- No control conflicts with native browser scroll or swipe gestures — all controls
  are fixed-position overlays that do not intercept touch-scroll events

---

## No-JS Fallback

The skip experience link and nav links are server-rendered `<a>` elements — they
function with JavaScript disabled.  The power button and scene toggle are
JavaScript-enhanced controls; they are visually present but harmless when JS is
absent (the HUD and scene toggle scripts simply do not bind).

---

## Acceptance Criteria (EXP-005)

- [ ] Scroll is the primary narrative interaction; the opening surface communicates
      this (no control competes with scroll on first render)
- [ ] "Skip experience" link is present in the DOM from first server render, is
      keyboard-focusable, and navigates to `/projects` when activated at any point
      in the lifecycle (before, during, and after the loader completes)
- [ ] Power and scene-toggle labels describe outcomes, not cockpit metaphors
- [ ] Touch target ≥ 44 px for every control
- [ ] All controls are keyboard-operable (Tab + Enter/Space); no mouse-only path
