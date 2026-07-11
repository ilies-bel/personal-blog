# Submission dry run — form checklist & procedure

The goal: the REAL submission is the third time the form is filled, not the
first. Two full dry runs happen before money changes hands (procedure below).

> Field names/limits drift as Awwwards updates their form — verify each row
> against the live form during dry run 1 and correct this file in the same
> sitting. Rows marked [OWNER] need account/entitlement decisions
> (INPUTS-NEEDED #10).

## Form fields

| Field | Prepared value / source | Status |
|---|---|---|
| Site URL | `https://ilies-bel.dev` (apex, https, no trailing path) | ready |
| Site title | [OWNER: "Iliès Beldjilali" or a titled concept name — decide once, reuse everywhere] | pending |
| Description (short) | 50-word blurb from `submission-narratives.md` | template ready |
| Description (long, if offered) | 150-word block from `submission-narratives.md` | template ready |
| Category | [OWNER: Personal / Portfolio — check the live taxonomy] | pending |
| Tags/technologies | Astro, React, Three.js / WebGL, GLSL, TypeScript | ready |
| Fonts | Space Grotesk, IBM Plex Mono, Instrument Serif (all OFL, self-hosted) | ready |
| Colors | `#0a1017` (room), `#d8d0c3` (warm bone), gold accent family (tokens.css) | ready |
| Main image | 1600×1200 from `scratchpad/submission/main/` — pick AFTER feed-preview review; never a loader frame | regenerate on GPU hardware |
| Extra images / gallery | The 12 coverage stills (`scratchpad/submission/stills/`) | regenerate on GPU hardware |
| Video / reel (optional) | Edited 60–75s cut from `reel-raw.webm` (`scripts/record-reel.mjs` header has the ffmpeg recipe) | owner edit |
| Team / credits | Iliès Beldjilali; co-author credit Lansana Diomande where the form allows collaborators | ready |
| Country | France | ready |
| Developer Award opt-in | Yes — dossier: `developer-award-dossier.md` | dossier skeleton ready |
| Submission fee | [OWNER: confirm current fee + which plan] | pending |
| Submission window | [OWNER: pick a week with no planned deploys; code freeze T−3 per RUNBOOK] | pending |

## Asset format specs (verify against the live form)

- Main image: 1600×1200, JPG/PNG, check the current max-size limit before
  export; judge legibility at feed size using `scratchpad/submission/feed/`.
- Gallery stills: same canvas, one story each, no duplicate crops.
- Video: H.264 MP4, 1920×1080; keep a CRF-18 master and a compressed upload
  (commands in `scripts/record-reel.mjs` output).
- OG/social: already live per route (`public/og/`) — the shared link unfurls
  correctly regardless of what Awwwards renders.

## Two-dry-runs procedure

**Dry run 1 — form recon (no payment).**
1. Open the submission form logged in; walk every field to the payment step.
2. Correct THIS file: exact field names, character limits, image size caps,
   category/tag taxonomy as they actually appear.
3. Note anything the site must change (e.g. a required screenshot ratio we
   don't produce) as a repo issue — code changes go through the normal gates.

**Dry run 2 — full rehearsal (still no payment).**
1. Regenerate all assets on GPU hardware at the pinned release SHA
   (procedure in `press-kit.md`); run the full gate suite; freeze code (T−3).
2. Fill the entire form with final copy + final assets; screenshot every
   completed step; stop at payment.
3. Peer-review the screenshots (owner + one other reader) against
   `submission-narratives.md` and this checklist. Fix, re-screenshot.

**Real submission.**
1. Confirm the live site serves the pinned build (curl the commit-stamped
   asset hashes); confirm security headers live; confirm 200s via prod-crawl.
2. Repeat dry run 2's fill with the reviewed copy; pay; save the receipt and
   the submission confirmation into the release archive (RUNBOOK).
3. Freeze: no deploys while judging runs; monitor per RUNBOOK's post-launch
   checklist. Campaign conduct: `ethical-voting-policy.md`, no exceptions.
