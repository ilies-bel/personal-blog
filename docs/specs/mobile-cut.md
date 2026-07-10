# Mobile Hero Cut — Beat-by-Beat Pacing Specification

**Backlog entry:** EXP-004 (P0, submission blocker)
**Status:** SPEC ONLY — implementation is ENG-007, blocked on this document
**Date authored:** 2026-07-10
**Viewport target:** 8 × 100svh (within the sanctioned 7–9 range)

---

## 1. Orientation

### 1.1 Current state

The hero scroll track is six `.scene-stage` divs, each one `100dvh` tall — six total
viewport heights on desktop. On a 390 × 844 px phone (iPhone 14 form factor) the dvh
unit is shorter relative to the total scroll distance, and the track effectively spans
≈ 18 screen-heights of travel. That is why users miss the supernova entirely or abandon
before reaching the pale blue dot.

### 1.2 Target

**8 phone-viewport heights of total travel.** Each beat in this specification occupies
roughly one viewport height, which means a normal undamped scroll lands users reliably
inside each state. Two beats (B1 and B8) get additional scene-progress damping to
guarantee the supernova and the finale cannot be skipped by a single hard flick.

### 1.3 Direction seam (non-goal, untouchable)

`LIFECYCLE_DIRECTION = 'reverse'` in `src/hero/scroll.ts` **must not change.**
The top of the page is always the black hole; the bottom is always the pale blue dot.
This is stated explicitly in ENG-007's exit criteria and in the canonical lifecycle-seam
comment in `scroll.ts`.

### 1.4 Stage coordinate system

`lifecycle.ts` uses a **legacy stage coordinate** ranging from `0.0` (black hole) to
`~5.0` (past pale blue dot). The reverse scroll direction makes raw scroll progress `p`
(0 at top, 1 at bottom) map to stage as:

```
stage ≈ p × 5.0
```

Key thresholds referenced throughout this spec:

| Stage | Scroll % | Landmark |
|-------|----------|----------|
| 0.00  | 0 %      | Black hole, gravity at full |
| 0.10  | 2 %      | `SHRINK_START` — black hole begins contracting |
| 0.42  | 8.4 %    | Photon ring disappears (`morph >= 0.42`) |
| 0.46  | 9.2 %    | `SHRINK_END`; `giant` ramp activates → star forms |
| 0.50  | 10 %     | `COLLAPSE_LO` — surface fully collapsed |
| **0.62** | **12.4 %** | **`NOVA_CENTER` — supernova flash peaks** |
| 1.00  | 20 %     | Settled red giant |
| 1.60  | 32 %     | `COLLAPSE_HI` — giant surface begins crushing |
| 2.50  | 50 %     | `YELLOW_ACTIVE_STAGE` — yellow star slot active |
| 2.88  | 57.6 %   | `SWAP_STAGE` — yellow ↔ red cloud flash-swap |
| 3.00  | 60 %     | `NEB_COLLAPSE_LO` — gravitational collapse floor |
| 3.32  | 66.4 %   | `STREAK_LO` — hyperspace streaks begin |
| 3.42  | 68.4 %   | Nebula room tint (blue-teal) peaks |
| 3.50  | 70 %     | `NEBULA_ACTIVE_STAGE` = `NEB_COLLAPSE_HI` |
| 4.25  | 85 %     | Pre-dot grade handoff begins in nebula branch |
| 4.50  | 90 %     | `DOT_ACTIVE_STAGE` — pale blue dot activates |
| 4.72  | 94.4 %   | `STREAK_HI` — hyperspace streaks clear |
| 5.00  | 100 %    | Track end |

---

## 2. Scroll Track Architecture

| Parameter | Desktop (current) | Mobile (target) |
|-----------|-------------------|-----------------|
| `.scene-stage` count | 6 | 6 (unchanged) |
| `.scene-stage` height | 100dvh | `calc(8/6 * 100svh)` ≈ 133svh |
| Total track height | 6 × 100dvh | 8 × 100svh |
| Stage-to-scroll ratio | stage ≈ p × 5 | stage ≈ p × 5 (unchanged) |

Changing the `.scene-stage` CSS height for mobile is the **minimal diff** that
achieves 8 viewports without touching `scroll.ts`, `lifecycle.ts`, `sceneTable.ts`, or
`timeline.ts`. The stage coordinate system and every threshold constant are untouched.
If ENG-007 finds that stageCount parity causes a copy-band timing issue, the alternative
is a dedicated `STAGE_COUNT_MOBILE = 8` with a corresponding mobile stage-to-scroll
remap — but that is an ENG-007 decision, not a spec constraint.

---

## 3. Beat Map

> **Reading guide.** Scroll ranges are percentages of the 8-viewport mobile track
> (0 % = hero top; 100 % = hero bottom). Stage ranges use the legacy coordinate from
> `lifecycle.ts`. Copy appears as: **headline** (large) / _whisper_ (small dim
> subheading). All copy from `sceneTable.ts` SCENES array.

---

### Beat 1 — Event Horizon (Black Hole)

| | |
|---|---|
| **Viewport** | VP 1 |
| **Scroll range** | 0 % – 12.5 % |
| **Stage range** | 0.00 – 0.625 |
| **Celestial state** | Black hole → supernova breakout |

**Visual description:**

- **Stage 0.00 – 0.10:** Black hole at full scale. Photon ring visible (`morph < 0.42`,
  ring envelope = `1 - smoothstep(0.10, 0.42, morph)`). Full gravitational lensing
  (`lensLive = 1`). Cold-indigo room tint. Lensed starfield (`starPtsVisible = true`).
- **Stage 0.10 – 0.42:** Hole contracts (`SHRINK_START = 0.10`, `SHRINK_MIN = 0.18`
  at `SHRINK_END = 0.46`). Ring fades. Secondary lensed ghost visible until
  `morph = 0.25`.
- **Stage 0.42 – 0.50:** Ring submission ceases (`ringVisible = false`). Star forms
  at stage 0.46 (`giant` ramp activates). Lens warp fades (`lensLive` → 0 across
  morph 0.1 → 0.5). Gravity gone once `giantHeld > 0.02`.
- **Stage 0.50 – 0.625:** ⚡ **NOVA FLASH.** `NOVA_CENTER = 0.62` at **12.4 % scroll
  — the single most time-critical moment in the journey.** The Gaussian envelope
  (`σ = 0.09`) peaks here; `flash = 1.45 × nova`, `bloomStrength` spikes. The screen
  effectively whites out. This is what the scroll-damping in §5 is protecting.

**On-screen copy:**

> **Under pressure, structure remains.**
> _software engineer building systems that stay readable as they grow._

Copy fades **in** as the black hole settles (~stage 0.05) and fades **out** before the
nova whiteout obscures it (~stage 0.50).

**Pacing intent:** Cold, heavy, silent arrival. The photon ring and lensed disk should
register as the first still frame. The supernova flash at the beat's end must not be
skippable — this beat lives inside the **supernova damping zone** (see §5.1).

---

### Beat 2 — Post-Breakout / Red Giant Reveal

| | |
|---|---|
| **Viewport** | VP 2 |
| **Scroll range** | 12.5 % – 25 % |
| **Stage range** | 0.625 – 1.25 |
| **Celestial state** | Red giant (early, expanding) |

**Visual description:**

- Nova envelope decays past peak (still ~0.4 amplitude at stage 0.70).
- `giant` fully saturated. `kCollapse` still > 0.47 — sphere is partially collapsed,
  the surface reads battered and dense.
- `gravityGone = true`; lensed starfield is off. Star backdrop dome appears.
- `redGiantActive = true`. Room tint rises through violet toward ember.
- Stage 0.90 onward: red giant substantially settled, `kCollapse` approaching 0.6.
  Red grain cloud fully visible (point-cloud body, `cloudShown = true`).
- `giantScale = GIANT_RADIUS_SCALE` — the star is large on screen.

**On-screen copy:**

> **Complexity expands. My work is to keep the center readable.**
> _The AI keeps adding. Nobody is left who understands it._

**Pacing intent:** The explosion subsides; the red giant breathes into view. This beat is
the first non-frantic moment — let the scale of the star read. No damping; normal scroll
pace after the supernova dwell.

---

### Beat 3 — Red Giant / Surface Collapse Begins

| | |
|---|---|
| **Viewport** | VP 3 |
| **Scroll range** | 25 % – 37.5 % |
| **Stage range** | 1.25 – 1.875 |
| **Celestial state** | Red giant (collapse onset) |

**Visual description:**

- Room tint peaks at ember (stage 2.05 = 41 % scroll, just past this beat — the
  warmest it gets). Within this beat the tint rises from violet toward ember.
- `COLLAPSE_HI = 1.60` at **32 % scroll**: the surface-crush begins.
  `kCollapse = min(1, max(0, (1.6 − stage)/(1.6 − 0.5)))` drops below 1 and the
  per-region shrink becomes visible.
- By stage 1.875 (`kCollapse ≈ 0.66`) the collapse is well underway but not
  dramatic yet — more "dilation" than implosion at this point.
- `toneComp = 0.34` (red giant branch) — deep red photosphere reads as a solid
  glowing wall, not tone-mapped to black.

**On-screen copy:** (Beat 2 copy continues — "Complexity expands…" — held through
the deliberate collapse so the relationship between the collapsing star and the
manifesto line lands.)

**Pacing intent:** Slow and deliberate. The collapse should read as an inevitability,
not a sudden event. Normal scroll pace; the 12.5 % scroll range gives the surface
enough travel to visibly crush inward.

---

### Beat 4 — Red Giant Collapse → Yellow Star Boundary

| | |
|---|---|
| **Viewport** | VP 4 |
| **Scroll range** | 37.5 % – 50 % |
| **Stage range** | 1.875 – 2.50 |
| **Celestial state** | Red giant collapse → yellow star threshold |

**Visual description:**

- `kCollapse` continues falling: at stage 2.50 (`kCollapse ≈ 0.09`) the surface is
  nearly fully in the new-state configuration.
- Stage 2.50 = `YELLOW_ACTIVE_STAGE` (exactly at the 50 % scroll / VP4–VP5
  boundary): yellow star slot activates. The renderer hands off to the yellow mesh sun
  at the very end of this beat.
- Room tint transitions through ember (stage 2.05, hit early in this beat at ≈41 %)
  toward warm amber (stage 2.915 = 58.3 % scroll, in the next beat).
- Copy for this beat (Beat 3 manifesto) arrives mid-beat as the collapse reads
  conclusive.

**On-screen copy:**

> **Systems grow. Interfaces drift. Complexity compounds.**
> _tests, review, small units, boring choices. that's the craft._

Copy fades in around stage 2.00 (beat midpoint, 40 % scroll) and holds through Beat 5.

**Pacing intent:** Tension then release. The viewer watches the red star finish
compressing; the yellow star arrives at the beat boundary as a sudden brightness
shift — high contrast. Normal pace.

---

### Beat 5 — Yellow Star / The Sun

| | |
|---|---|
| **Viewport** | VP 5 |
| **Scroll range** | 50 % – 62.5 % |
| **Stage range** | 2.50 – 3.125 |
| **Celestial state** | Yellow star / sun → gravitational collapse start |

**Visual description:**

- `yellow = true` (stage ≥ 2.50). `sunRigVisible = true`. Yellow mesh sun rig.
- `SWAP_STAGE = 2.88` at **57.6 % scroll**: yellow ↔ red flash-swap. `yrFlash`
  whiteout masks the hard geometry switch. `meshSide → true` after swap.
- Room tint: warm amber peak at stage 2.915 ≈ 58.3 % scroll (mid-beat).
- Sun grade: `YELLOW_EXPOSURE = 1.05`, `YELLOW_BLOOM = 0.34`, `toneComp = 0.42`.
  The star reads as a **blazing gold-white** main-sequence sun — the brightest state.
- Star backdrop dome (`starBackVisible = true`), twinkling far-field stars behind.
- Stage 3.00 = `NEB_COLLAPSE_LO` at **60 % scroll**: gravitational collapse window
  opens. `settled = 1 - smoothstep(...)` begins fading the bright grade toward the
  collapse-camera look. This lands in the last 20 % of this beat.

**On-screen copy:** (Beat 3 copy continues — "Systems grow…" — the sun is the resolved
craft state. Copy fades out approaching stage 3.00.)

**Pacing intent:** Luminous arrival. This is the page's brightness apex. The swap
flash at 57.6 % should be allowed to read — it is the single clearest "this just
changed" moment between red and yellow. Normal pace; the settled-sun hold is brief
(stage 2.88 – 3.00) before the collapse transitions in.

---

### Beat 6 — Gravitational Collapse / Nebula Formation

| | |
|---|---|
| **Viewport** | VP 6 |
| **Scroll range** | 62.5 % – 75 % |
| **Stage range** | 3.125 – 3.75 |
| **Celestial state** | Gravitational collapse → nebula activates |

**Visual description:**

- Stage 3.125 – 3.32: collapse window (`inWindow = 1`). `collapse` drive ramps inward
  (`prog^0.85`). Gas converges on the core; `simBlend` rises.
- `STREAK_LO = 3.32` at **66.4 % scroll**: hyperspace radial streaks appear
  (`streakIn` ramp). The gas begins smearing into radial light lines.
- Stage 3.42 at **68.4 %**: blue-teal room tint arrives (nebula room identity).
  Film grain zeroed (`grain → 0` via `ne` factor in nebula branch).
- `NEBULA_ACTIVE_STAGE = 3.50` at **70 % scroll**: `nebula = true`.
  `nebulaShader = true`. Cloud geometry fully active. `cloudShown = true`.
  Vivid SHO palette (`gradeSat = 1.55`), soft wide bloom (`bloomRadius = 0.75`).
- Stage 3.50 – 3.75: dispersed early nebula cloud. `starFormed = 1` at the collapse
  floor, so the yellow mesh is fully formed but now hidden under the cloud (`cloudW`
  owns this range, `meshW = 0`).

**On-screen copy:**

> **One clear boundary can save a thousand future decisions.**
> _prompts, diffs, failing tests, half-ideas. raw material, not magic._

Copy fades in at the collapse midpoint (~stage 3.15) and holds through Beat 7.

**Pacing intent:** Kinetic transition. The gas visibly converging inward is the most
physically motivated motion in the piece; give it room to breathe before advancing.
The nebula arrival at 70 % should feel like a revelation (the cloud snaps in). Normal
pace throughout.

---

### Beat 7 — Nebula

| | |
|---|---|
| **Viewport** | VP 7 |
| **Scroll range** | 75 % – 87.5 % |
| **Stage range** | 3.75 – 4.375 |
| **Celestial state** | Nebula (full cloud) → pre-dot handoff |

**Visual description:**

- Full gas cloud. SHO palette (`gradeSat = 1.55`), wide soft bloom, moderate exposure.
- `STREAK_HI = 4.72` is past this beat's end, so streaks are still active through VP7
  (stage 3.75–4.375 all show `streakIn` at full or decaying, `streakOut` not yet
  dominant). The nebula reads as moving outward / dezoom continuing.
- Stage 4.25 = **85 % scroll** (late in this beat): pre-dot grade handoff begins
  inside the nebula branch: `de = smoothstep01((stage - 4.25) / 0.2)`. Bloom tames
  (`0.38 → 0.05`), radius narrows (`0.75 → 0.16`), exposure settles
  (`0.58 → 0.46 = DOT_EXPOSURE`), saturation drops. The gas visually shrinks toward
  the dot.
- By the end of this beat (stage 4.375, 87.5 % scroll) the pre-dot handoff is
  ≈ 62 % complete — the cloud is visibly collapsing toward a single point but still
  identifiable as gas.

**On-screen copy:** (Beat 4 copy continues — "One clear boundary…" — through the
cloud. Fades out as the dot approach begins, ~stage 4.15.)

**Pacing intent:** Immersive. The viewer should feel surrounded by the gas before the
dezoom pulls back. The pre-dot shrink at the end creates visual pull toward the
finale. Normal pace; **finale damping zone activates at the very end of this beat
(stage ≥ 4.30, scroll ≥ 86 %) — see §5.2.**

---

### Beat 8 — Pale Blue Dot (Finale)

| | |
|---|---|
| **Viewport** | VP 8 |
| **Scroll range** | 87.5 % – 100 % |
| **Stage range** | 4.375 – 5.00 |
| **Celestial state** | Pale blue dot (pre-arrival → settled) |

**Visual description:**

- Stage 4.375 – 4.50 (87.5 % – 90 %): pre-dot handoff completing (`dot = false` until
  stage 4.50). Grade is nearly identical to dot grade (`de` factor ≈ 0.87). The gas
  is a tiny receding orb.
- Stage 4.50 = `DOT_ACTIVE_STAGE` at **90 % scroll** (20 % into VP8): `dot = true`.
  Grade locks to `DOT_EXPOSURE = 0.46`, `DOT_BLOOM_STRENGTH = 0.05`,
  `DOT_BLOOM_RADIUS = 0.16`. `particleFullRes = true` (crisp pixels at low count).
  `warmth = -0.03` (perceptibly blue). Deep night-blue room tint (stage 4.70 = 94 %).
- Stage 4.50 – 5.00: speck breathes (in-scene gaussian pulse from `disk.glsl.ts`
  DOT_HALO_GATE). Site-index ledger fades in (finale layout). Whisper copy arrives.
- Stage 5.00: track end. This final 10 % (stage 4.72 – 5.00, scroll 94.4 % – 100 %)
  is **not dead scrolling**: streaks clear (`STREAK_HI = 4.72` at 94.4 %), the
  site-index arrival is the primary visual event, and the copy is held at full
  opacity. Reviewers must ensure ENG-007 authors at least one visual change in the
  stage 4.75–5.00 range (e.g., site-index line-by-line stagger).

**On-screen copy (finale layout — centered full-viewport column):**

> **What remains is the work.**
> _everything else burned away. this is what's left, and it reads._
>
> _(site-index ledger below — three to five proof paths)_

**Pacing intent:** Resolution. Quiet, final, unhurried. **DAMPED** (see §5.2). The
manifesto headline and the first site-index link must be fully readable before the user
hits the bottom of the page. Bypass converts to "↑ Back to top" in this beat (see §6).

---

## 4. Summary Table

| Beat | VP | Scroll | Stage start | Stage end | Celestial state | Manifesto | Damping |
|------|-----|--------|-------------|-----------|-----------------|-----------|---------|
| B1 Event Horizon | VP1 | 0–12.5 % | 0.00 | 0.625 | Black hole → supernova | Beat 1 | **DAMPED** (supernova zone, §5.1) |
| B2 Red Giant Reveal | VP2 | 12.5–25 % | 0.625 | 1.25 | Red giant early | Beat 2 | — |
| B3 Red Giant Collapse | VP3 | 25–37.5 % | 1.25 | 1.875 | Red giant surface crush | Beat 2 (cont.) | — |
| B4 Collapse → Yellow | VP4 | 37.5–50 % | 1.875 | 2.50 | Red giant → yellow star boundary | Beat 3 | — |
| B5 Yellow Star / Sun | VP5 | 50–62.5 % | 2.50 | 3.125 | Sun + flash swap + collapse opens | Beat 3 (cont.) | — |
| B6 Nebula Formation | VP6 | 62.5–75 % | 3.125 | 3.75 | Gravitational collapse → nebula | Beat 4 | — |
| B7 Nebula | VP7 | 75–87.5 % | 3.75 | 4.375 | Nebula → pre-dot handoff | Beat 4 (cont.) | (finale zone enters at ~86 %) |
| B8 Pale Blue Dot | VP8 | 87.5–100 % | 4.375 | 5.00 | Dot pre-arrival → settled dot | Beat 5 | **DAMPED** (finale zone, §5.2) |

**All 5 manifesto beats present. All 9 distinct lifecycle states preserved. No beat is
empty scrolling.**

### Lifecycle state checklist

| State | Stage range | Beats present | Note |
|-------|-------------|--------------|------|
| Black hole (lensing, photon ring) | 0.00 – 0.46 | B1 | Ring gone at stage 0.42 |
| Supernova flash | 0.46 – 0.90 | B1 (damped) | Nova peaks at stage 0.62 (12.4 %) |
| Red giant expanding | 0.90 – 1.60 | B2 | |
| Red giant surface collapse | 1.60 – 2.50 | B3, B4 | `COLLAPSE_HI` to `YELLOW_ACTIVE_STAGE` |
| Yellow ↔ red flash swap | ~2.88 | B5 | `SWAP_STAGE`, masked by `yrFlash` |
| Yellow star / sun | 2.50 – 3.00 | B4–B5 | Brightest grade state |
| Gravitational collapse | 3.00 – 3.50 | B6 | GPGPU well drive, streaks begin |
| Nebula | 3.50 – 4.50 | B6, B7 | SHO palette, wide bloom |
| Pale blue dot | 4.50 – 5.00 | B8 | `particleFullRes`, finale layout |

---

## 5. Scroll-Velocity Handling (Scene-Progress Damping)

> **Constraint:** "a normal flick cannot skip the supernova or the finale entirely."
> **Approach:** Scene-progress damping — the **visual stage** advance rate is capped
> when scroll velocity is high. The **DOM scroll position is never programmatically
> controlled** (no scroll-jacking). The page scrolls at the native OS rate; only the
> 3D scene's stage lags behind.

### 5.1 Model

The frame loop maintains a `visualStage` follower that tracks `rawStage` with a
per-frame cap inside declared zones:

```
rawStage    = scrollTracker.current.progress × stageMax   // ~5.0
// Outside damp zones:
visualStage = rawStage                                     // zero latency
// Inside a damp zone, per 60 fps frame:
visualStage += clamp(rawStage − visualStage, −MAX_DELTA, +MAX_DELTA)
```

`lifecycle()` and all copy-band evaluations receive `visualStage`, not `rawStage`.
Outside zones `MAX_DELTA = Infinity` (follower is exact). Catch-up after the user
stops: once `|scrollVelocity| < 0.2 vp/s`, `MAX_DELTA = Infinity` again — visual
stage snaps to the resting position instantly, no creep.

**Trigger:** Damping engages only when the scroll velocity entering a zone exceeds
**1.5 vp/s** (a deliberate flick, not a careful drag). Below that threshold, the
follower is passthrough (zero lag), preserving the direct-manipulation feel for users
who scroll slowly.

### 5.2 Supernova Damping Zone

Protects Beat 1 (the only beat where a single phone flick can cover the entire beat).

| Parameter | Value |
|-----------|-------|
| Zone stage range | 0.40 – 0.90 |
| Zone scroll range (mobile track) | 8 % – 18 % |
| `MAX_DELTA` (60 fps frame) | **0.018 stage/frame** |
| Equivalent visual advance rate | 1.08 stage/s |
| Nova envelope width (2σ) | stage 0.44 – 0.80 (0.36 stage units) |
| Minimum visual dwell through envelope at 2 vp/s flick | ≥ 0.33 s (≥ 20 frames) |

**Effect:** Even if the user flicks at 3 vp/s and crosses B1 in under 0.25 s of real
scroll time, `visualStage` advances at most 1.08 stage/s, ensuring the nova envelope
(0.36 stage units) plays for at least 333 ms of visual time. The flash registers.

### 5.3 Finale Damping Zone

Protects the pale blue dot reveal (the narrative resolution).

| Parameter | Value |
|-----------|-------|
| Zone stage range | 4.30 – 5.00 |
| Zone scroll range (mobile track) | 86 % – 100 % |
| `MAX_DELTA` (60 fps frame) | **0.015 stage/frame** |
| Equivalent visual advance rate | 0.90 stage/s |
| Stage range from zone entry to dot activation | 0.20 stage units |
| Minimum visual dwell on settled dot (stage ≥ 4.50) before page end | ≥ 20 frames ≈ 333 ms |

**Effect:** A user who flicks from VP7 into the bottom of the page will see the gas
shrink, the dot appear, and the "What remains is the work." headline before the visual
state catches up to the page end. The site-index ledger has time to stagger in.

### 5.4 Interaction with copy bands

Copy-band `inStart` / `inEnd` / `outStart` / `outEnd` values in `sceneTable.ts` must
be authored against **`visualStage`** (the damped follower), not `rawStage`. The
frame loop resolves `visualStage` and passes it to both `lifecycle()` and the copy-band
evaluation before any write.

### 5.5 Reduced-motion override

Under `prefers-reduced-motion: reduce`:

- Scene-progress damping is **disabled entirely.**
- The lifecycle renders discrete still frames at beat midpoints (one poster per beat,
  consistent with existing `reduced` flag behavior in `lifecycle.ts`).
- Beat-to-beat advance: directional swipe only, not velocity-scaled.
- Bypass control: unchanged (see §6).

---

## 6. Bypass Control

The bypass ("skip") control lets users exit the hero scroll without completing it.

### Availability

The bypass is **persistently rendered** across all 8 beats. It is never hidden or
auto-focused; it receives tab focus only on explicit keyboard navigation.

### Placement and sizing

- **Position:** Fixed, bottom-right corner, `z-index` above all hero overlays (copy,
  HUD, manifesto).
- **Touch target:** 44 × 44 px minimum (per EXP-005 / WCAG 2.5.5 AAA target).
- **Opacity:** 0.85 at rest; 1.0 on hover/focus. Dimmed to 0.4 only in B8 (finale)
  where the beat's own visual hierarchy is the primary signal.

### Behavior by beat

| Beat | Label | Action |
|------|-------|--------|
| B1 – B7 | "Skip →" | Immediately sets `window.scrollY` to the bottom of the hero track (page transition to post-hero content). No animation; instant jump. |
| B8 (finale) | "↑ Back" (optional) | Scrolls to `scrollY = 0` (top of page / black hole) **or** hides. ENG-007 to decide based on EXP-005 outcome. |

### Keyboard

- Tab-accessible at all times.
- `Enter` or `Space` activates.
- Does **not** interfere with native scroll (no `preventDefault` on any scroll event).

---

## 7. No-Dead-Scrolling Guarantee

Each beat must contain at least one **visual delta** visible to a stationary observer
between the beat's start and end stages. Verification table:

| Beat | Primary visual delta across beat |
|------|----------------------------------|
| B1 | Ring fades → hole shrinks → nova whiteout |
| B2 | Blast dissipates → red star size stabilizes |
| B3 | Surface crush begins, room tint shifts ember |
| B4 | Collapse deepens, yellow star snaps in at boundary |
| B5 | Swap flash → bright sun → collapse grade transition |
| B6 | Gas converges, streaks appear, nebula activates |
| B7 | Cloud disperses outward, pre-dot shrink begins |
| B8 | Dot arrives, site-index ledger staggers in, streaks clear |

Beat B8, stage 4.72–5.00 (streaks clear to track end): ENG-007 must author at least
one deliberate visual event here — suggested: site-index links stagger in line-by-line
with a 60 ms delay per line.

---

## 8. Implementation Notes for ENG-007

### 8.1 CSS change (minimal diff)

```css
/* Mobile-only: expand each stage from 100dvh to 133svh so
   6 stages × 133svh ≈ 8 × 100svh total. */
@media (max-width: 767px) {
  .scene-stage {
    height: calc(8 / 6 * 100svh); /* ≈ 133.33svh */
  }
}
```

This single rule achieves the 8-viewport target without any JS change. The stage
coordinate system is untouched.

### 8.2 Scene-progress damper placement

The damper belongs in the **frame loop** (the impure shell that reads `ScrollTracker`
and calls `lifecycle()`). The damper reads `scrollTracker.current.progress`, derives
`rawStage`, applies the per-zone cap to produce `visualStage`, and passes `visualStage`
as the `stage` field of `LifecycleInput`. `ScrollTracker` itself is unchanged.

### 8.3 Copy band remapping

Mobile copy bands (`inStart`, `inEnd`, `outStart`, `outEnd`) need to shift to match
the 8-viewport proportions, since the existing values were authored for the desktop
6-viewport layout. The recommended approach: add a `mobile` variant object per scene
entry in `sceneTable.ts` (mirroring the existing band shape) and select the variant
based on a viewport-width media query or a CSS custom property read at mount.

### 8.4 Non-goals (canonical seam is untouched)

- `LIFECYCLE_DIRECTION` in `scroll.ts` **must not change.**
- Stage threshold constants (`DOT_ACTIVE_STAGE`, `NEBULA_ACTIVE_STAGE`,
  `YELLOW_ACTIVE_STAGE`, `NEB_COLLAPSE_HI`, `NEB_COLLAPSE_LO`, `SWAP_STAGE`, etc.)
  **must not change.**
- `stageCount = SCROLL_SECTION_COUNT = 6` in `timeline.ts` / `HeroIsland.tsx`
  **should not change** if the CSS-only approach (§8.1) is taken.

---

## 9. Exit Criteria Cross-Reference (EXP-004)

| EXP-004 criterion | Where specified |
|-------------------|----------------|
| 7–9 viewport mobile cut | §2 (8 VP target), §8.1 (CSS) |
| All lifecycle states retained | §4 lifecycle state checklist |
| All manifesto beats retained | §3 (each beat), §4 summary table |
| Opening gravity present | B1 (photon ring, lensing, §3 Beat 1) |
| Pale-dot resolution present | B8 (§3 Beat 8), §5.2 (finale damping) |
| No interval is merely empty scrolling | §7 guarantee table |
| Supernova cannot be skipped by a normal flick | §5.1 supernova damping zone |
| Finale cannot be skipped by a normal flick | §5.2 finale damping zone |
| Bypass persistently available at every beat | §6 |
| No scroll-jacking | §5 model (DOM scroll never controlled) |
