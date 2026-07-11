# Real-device validation matrix

Owner-run validation (INPUTS-NEEDED #8). Everything in CI renders through
SwiftShader software GL, so **frame rate, thermals, battery, and touch feel
have never been measured on real silicon**. This checklist is the missing
half of the performance story (the deterministic half — bytes, CLS, budgets
— is already CI-gated).

## Devices (minimum set)

| Class | Example | Why |
|-------|---------|-----|
| Current iPhone | iPhone 14/15/16, Safari | webkit + real Apple GPU; the mobile-safari Playwright project only ever ran emulated |
| Current Android | Pixel 7/8/9, Chrome | reference Android GPU path |
| **Low-tier Android** | ≤ Snapdragon 6-series / 3–4GB RAM, Chrome | the tier ladder's real customer; `?tier=low` must be checked against what auto-detection actually picks here |
| Older iPhone (if available) | iPhone 11/12 | thermal throttling shows earliest here |
| iPad / tablet (optional) | any | the 768–1024px band only ever ran emulated |

Also once each on a device you have: Firefox Android, Samsung Internet.

## Per-device checklist

Cold start (site not visited today, normal network, brightness ~75%):

- [ ] Home loads; loader paints immediately; "Skip intro" works.
- [ ] Full home scroll top→bottom: all six lifecycle states appear, no
      stutter that breaks the illusion, supernova crest lands as the peak.
- [ ] FPS spot-check: on `/behind-the-build`, run the FpsMeter's
      "Run 5s benchmark" (reports min / 1% low / p50 / p95-frame / max);
      for the HOME hero attach remote DevTools (chrome://inspect / Safari
      Web Inspector → Timelines) and sample the frame rate at stage 0 and
      at the red giant. **Record numbers, not impressions.**
- [ ] Tier ladder: load `/?tier=low` and confirm the low tier still reads
      as designed on this screen (fewer particles, same identity); then
      reload without the override and note whether auto-detection's pick
      feels right for the device (smooth at the red giant = correct tier).
- [ ] Route hops: Home → Work → Graveyard → Behind the Build → Contact.
      Transitions ≤700ms feel, no white flashes, back button restores scroll.
- [ ] Behind the Build: activate one "Run live" figure — context comes up,
      scroll away — poster returns (governor working on real GPU).
- [ ] One article read end-to-end (memory-leak post): images sharp at
      device DPR, no reflow while lazy assets land.
- [ ] Reduced motion: enable OS reduce-motion → reload home → poster
      edition, no engine; disable again mid-session → live swap.
- [ ] Rotate to landscape on the hero and back: no layout break, no
      context loss note.
- [ ] Kill the tab, reopen from history: warm return reveals fast (<1s).

## The 5-minute thermal test (per device)

Purpose: prove the hero cannot cook a phone a juror leaves open.

1. Note starting battery %, device feel (cool/warm), and — Android with
   USB debugging — `adb shell dumpsys battery | grep temperature` (tenths
   of °C). iPhone: rely on touch + the battery delta.
2. Load `/`, scroll to the **red-giant stage** (the heaviest sustained
   draw), leave the page OPEN and UNTOUCHED for **5 minutes**, screen on.
3. Every 60s record: FPS (meter or DevTools), device temperature
   (adb value / hand feel: cool → warm → hot → uncomfortable), any visible
   degradation (dropped effects, dimming, browser slowing).
4. After 5 min: battery % consumed, final temperature, then scroll to the
   finale — does the page still hit its normal frame rate?

**Pass bar**: no thermal shutdown or browser tab kill; device at most
"warm"; battery drain ≤4% in the 5 minutes; FPS at minute 5 within ~20% of
minute 1 (thermal throttling is allowed to cost something — it must not
collapse the experience).

Fail → tier ladder needs a thermal governor (frame-rate cap after N minutes
idle-at-stage, or auto-downtier) — file it as a P0 defect, resets clean-RC.

## What to record

`docs/validation/results/device-YYYY-MM-DD.md`, one table per device:
model, OS/browser versions, network; per-checklist-row pass/fail; FPS
numbers (p50 / 1% low per stage sampled); thermal table (minute, temp,
fps); battery delta; photos/screen recordings filed alongside. Plus the
two numbers the roadmap gates want promoted to CI once a real-device lane
exists (INPUTS-NEEDED #1): real LCP on 4G (DevTools throttled) and the
re-baselined FPS floor for `e2e/perf-baseline.json`.
