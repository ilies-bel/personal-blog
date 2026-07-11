# Screen-reader sessions — NVDA / VoiceOver / TalkBack walkthrough

Owner-run validation (INPUTS-NEEDED #8). Axe runs on every route in CI
(WCAG 2.2 AA, serious/critical gate, including loader-up / no-JS /
reduced-motion / modal states), so this session is NOT a rule check — it
verifies the things only ears can: announcement wording, reading order,
and whether the experience *makes sense* non-visually. Where possible, run
one session with a screen-reader user, not just an owner-driven pass.

## Setups (one pass each)

| Setup | Browser | Notes |
|-------|---------|-------|
| NVDA (latest) | Firefox, Windows | browse mode + focus mode; also spot-check Chrome |
| VoiceOver | Safari, macOS | VO+A read-all on one post |
| VoiceOver | Safari, iOS (real iPhone) | swipe navigation + rotor headings |
| TalkBack | Chrome, Android | swipe navigation + reading controls headings |

Record each pass (audio of the SR + screen). Log deviations from the
"expect" column below in `docs/validation/results/sr-YYYY-MM-DD.md`.

## Global checks (every route)

- [ ] Page title announced on load: home = "Iliès"; all others =
      "<Page> · Iliès" (e.g. "Projects · Iliès", "Page not found · Iliès").
- [ ] First Tab stop = "Skip to main content"; activating it moves focus
      into the main region (no visual jump-flash).
- [ ] Nav landmark announced as "Sections, navigation" with links
      **Work, Writing, About, Contact** (+ "GitHub", "X" labelled icon
      links). The current section reports "current page" — EXCEPT on
      /graveyard, where by design nothing is current (verify it doesn't
      announce a wrong one).
- [ ] Exactly one main landmark, one h1 per page (rotor/headings list).
- [ ] Footer (reading routes): "Footer links, navigation".
- [ ] Nothing decorative leaks: no announcements for canvases, backdrops,
      HUD gauges, status dots, bracket glyphs, the warp "ENGAGING
      HYPERDRIVE" readout, or the big "404" numeral.

## Route scripts

### 1. Home `/` — the critical one (15 min)

The hero is a WebGL scene; the accessible page is the sr-only h1 + the
manifesto beats + nav. Known-by-design behaviors to CONFIRM, not fix:
loader/stage changes are deliberately NOT auto-announced (no live region
on the loader or HUD readouts); on the live hero only the currently
visible manifesto beat is in the accessibility tree (one beat at a time).

Walkthrough, in order:

1. Load. Expect title "Iliès"; no announcement storm from the loader
   (its mark is aria-hidden).
2. Tab order from top: skip link → Work/Writing/About/Contact → GitHub →
   X → "Power the navigation HUD" (toggle button, reports pressed state)
   → the motion toggle (its label names the ACTION — "Reduce motion" when
   motion is on, flipping once pressed; aria-pressed carries state) →
   **"Skip intro"** button while the loader is up (~10 stops — e2e pins
   this). The brand lockup link "Home — ILIÈS BELDJILALI, Software
   Engineer" sits inside the hero, later in the order. Activate Skip
   intro with Enter: expect no trap, page becomes browsable.
3. Headings rotor: h1 "ILIÈS BELDJILALI — Software Engineer" (visually
   hidden — must still be listed), then h2 manifesto beats.
4. Scroll/read through the beats (browse mode / swipe). Expected h2 text
   in order, each whisper prefixed by its sr-only state name:
   - "Under pressure, structure remains." (whisper starts "black hole.")
   - "Complexity expands. My work is to keep the center readable." ("red giant.")
   - "Systems grow. Interfaces drift. Complexity compounds." ("yellow star.")
   - "One clear boundary can save a thousand future decisions." ("nebula.")
   - "What remains is the work." ("pale blue dot.")
   Judge: does the sequence read as a coherent statement without visuals?
5. Star markers (after the loader is gone they join tab order — verify
   they are NOT tabbable while the loader is up): links announced as
   headline + body, e.g. "Hi, I'm Iliès. Web software, technical writing,
   understandable systems., link" (about) or "Things I abandoned. Dead
   repos, false starts, and what each one was trying to teach., link"
   (graveyard). Escape closes an open marker card without navigating.
6. HUD: activate "Power the navigation HUD" (aria-pressed flips to true).
   The rail is "Explore portfolio stages, navigation"; rows announce
   "Travel to BLACK HOLE" … "Travel to THE BEGINNING", the current stage
   reporting "current location" (aria-current="location"). Activate one:
   expect focus/context to survive the travel. Compass CTA announces its action (e.g. "Reverse the
   collapse — begin the descent").
7. Finale: "Site index, navigation" — links PROJECTS / GRAVEYARD /
   WRITING / BEHIND THE BUILD / ABOUT / GET IN TOUCH (+ REPLAY button),
   each with its count note. Verify they are only reachable when the
   finale band is on screen (tab-gating).
8. Reduced-motion modal: with OS reduce-motion ON, load home. Expect the
   one-time "You are seeing the still version" dialog: announced as a
   dialog with title + description, focus starts on the primary button,
   Tab wraps inside it, Escape closes and returns focus, background inert
   while open. Under reduced motion ALL beats are readable at once.
9. SPA navigation: follow "Work" from the hero. Expect focus to land on
   the destination's main region and reading to continue from the top of
   the new page (a11y-states spec pins the focus move; the EAR check is
   that the new page title/h1 is what you hear next).

### 2. Work `/projects` (5 min)

- h1 "The work that held." Group announced "Shipped projects".
- Per project: h2 name → reading order: problem/choice/outcome prose →
  h3 "Proof" (region "<title>: claims and evidence") — each claim with
  its evidence kind/source/date; the two draft claims read their hedged
  wording + "evidence being gathered" → h3 "Decisions & consequences"
  (h4 "Paths not taken" / "Known limits" / "Current status").
- Case-study figures: real alt text + figcaption (listen: alt should
  describe, caption should attribute — no doubled text).
- Route ending: "The continuation … Want this on your team?" link → /contact.

### 3. Writing `/writing` (3 min)

- h1 "Everything, in plain words." h2 shelves: "Articles" (or per-type
  shelves), "The graveyard", "About this site".
- Article rows: title + description + "Topics: …" (sr-only prefix) +
  date + reading time all in ONE link announcement — is it informative
  or exhausting? (Judgement call worth recording.)

### 4. Graveyard `/graveyard` (5 min)

- h1 "Not everything survives." Group "Failed and abandoned projects".
- Per specimen: h2 name → "Specimen record: INTERRED <date> CAUSE: <cause>"
  (sr-only prefix; the dot separator must NOT be read) → definition list:
  Hypothesis / Warning signs / What survived — dl semantics announced.
- Specimen images: real alt + figcaption. External artifact links
  announce as links (new-window behavior noted by the SR).
- Nav check: subnav announces NO current section here (by design).

### 5. Behind the Build `/behind-the-build` (7 min)

- h1 "Behind the Build"; h2s: Architecture / Live shader gallery /
  Performance budgets / Fallback ladder / Design decisions. Reading-
  progress aside is labelled "Reading progress" and stays quiet (no
  live announcements while scrolling — confirm).
- Shader gallery: h3 per shader; the `<details>` disclosure "View GLSL —
  first N of M lines" announces expanded/collapsed on toggle; "Full
  source" link is a separate stop AFTER the summary (not nested inside).
- "Run live" figures: button announced; on activation the role="status"
  note speaks (context granted/denied wording); scrolling away returns
  the poster without a stuck announcement.
- Budgets table: region "Performance budgets table" (focusable, scrolls
  with arrow keys); column/row headers announced per cell.
- FpsMeter: "Run 5s benchmark" button; results readable after the run.

### 6. About `/about` (3 min)

- h1 is the lead sentence ("Hi, I'm Iliès…"). The NOW block reads as a
  definition list: Role / Base / Availability / Proof. h2 "Get in touch",
  h2 "Credits & provenance" (dl: Collaborators / Imagery / Type / Tooling).
- Signature flattens to "Signed, Iliès" (flourish silent).
- Corner nav here is the static skin: no HUD power button; the
  "Toggle background scene" button reports pressed state.

### 7. Contact `/contact` (2 min)

- h1 "Open channel." Primary action announces "Send a transmission"
  + the email address (mailto). Channel readout reads as a dl:
  Status / Engagements / Location / Timezone / Response.
- "Other channels, navigation" with GitHub / Twitter.

### 8. One post end-to-end (VO read-all / continuous reading, 5 min)

- /posts/memory-leak-search-and-destroy: "Back to writing" link, kicker,
  h1, co-author byline, "Tags: …" (sr-only prefix), body h2/h3s, code
  blocks (SR code reading is rough — note anything unintelligible that
  prose should carry), Evidence aside announced with its title, the
  continuation footer "Continue reading" incl. "Scene: <from> to <to>"
  image-role glyph and the next-post link.

### 9. 404 (1 min)

- Direct-load a bad URL: title "Page not found · Iliès", h1 "This page
  collapsed.", the giant 404 numeral silent, six labelled destination
  links each with its " — note" suffix read.

## Pass bar

No trap, no unreachable interactive control, no misleading announcement,
reading order matches the visual argument on every route, and the home
manifesto reads as a coherent statement. Wording-quality findings (e.g.
the writing-row verbosity) are logged as editorial items, not blockers,
unless they obscure function.
