# Usability sessions — first-time-user protocol

Owner-run validation (INPUTS-NEEDED #8). The emulated CI matrix proves the
site *works*; these sessions prove first-time humans can *use* it. Minimum
**5 participants** who have never seen the site (roadmap §7); ideally a mix
of technical and non-technical. Each session ≈ 20 minutes live + a 5-minute
follow-up call/message **7 days later** (the recall set below).

## Setup

- Participant's own device + browser, own network. Do not "prepare" the
  device — cold cache is the point.
- Screen recording on (phone: screen record; desktop: any capture tool).
  Ask permission first; recordings stay internal.
- You say ONLY the task prompts below. No steering, no "try scrolling",
  no reacting to struggle. Note timestamps; the recording backs them up.
- Start every task from a freshly loaded `https://ilies-bel.dev/` (hard
  reload between tasks so the intro loader state is honest).

## Tasks (timed)

| # | Prompt (read verbatim) | Pass bar | Record |
|---|------------------------|----------|--------|
| 1 | "Find the work this person has shipped." | Reaches /projects in **≤15s** from landing | time-to-Work, path taken (nav link? scrolled first? skip intro used?) |
| 2 | "You want to hire them. Get to the point where you could send a message." | Reaches /contact (or the mailto action) in **≤30s** from a fresh landing | time-to-Contact, path |
| 3 | "What is this site about? Tell me in one sentence." (ask after they've scrolled the home page once, no time limit) | Answer names the concept — software longevity / a stellar lifecycle / 'built to last' | their exact words |
| 4 | "Find something this person built that failed or was abandoned." | Reaches /graveyard, any specimen open | time, whether the nav label communicated |
| 5 | "Read one article far enough to say what it's about." | Post opened, summary roughly right | which post, any reading friction |
| 6 | Free exploration, 3 minutes: "Look around; think aloud." | — | quotes, confusion points, delight points, whether HUD/exploration mode is discovered |

Timing rule: the clock starts when the document paints (the loader wordmark
counts as painted) and stops at the destination's h1 being on screen. The
intro loader + "Skip intro" are part of the measured experience by design —
if the loader costs the task the 15s bar, that is a finding, not an excuse.

## One-handed mobile pass (per mobile participant)

Phone held in ONE hand, thumb only, standing if practical:

- [ ] Complete tasks 1 and 2 one-handed within the same time bars.
- [ ] Skip intro reachable and tappable with the thumb (bottom-reachable, ≥44px).
- [ ] Home scroll track traversable without regripping (no precision flicks
      needed to cross the supernova/finale beats; ≤9 viewports total).
- [ ] Nav links, Contact mailto, and one graveyard drawer all tappable
      first try (no mis-taps on neighbors — 44px targets are e2e-gated but
      real thumbs are the judge).
- [ ] Nothing requires pinch-zoom or landscape.

## Seven-day recall set (the ≥80% concept-recall gate)

Contact each participant 7 days later, unannounced at session time. Ask,
without offering choices:

1. "What do you remember about the site you looked at last week?"
   (PASS if they name the black hole / stellar lifecycle / space-death
   concept, or the graveyard idea, unprompted.)
2. "What does the person do?" (PASS: builds software / engineer; bonus if
   'built to last' framing survived.)
3. "Was there anything you'd never seen a site do before?" (record verbatim
   — this is the Creativity evidence.)
4. "Would you know how to reach them if you needed to?" (PASS: yes/email/
   contact page.)

Score: Q1 is THE concept-recall question — the SOTY-campaign gate needs
**≥80% of participants passing Q1** (roadmap: ≥80% seven-day recall).
Log per participant: Q1 pass/fail, Q2 pass/fail, Q3 quote, Q4 pass/fail.

## Recording the results

Create `docs/validation/results/usability-YYYY-MM-DD.md` per batch: one row
per participant (device, browser, task times, pass/fail per bar, notable
quotes), plus a findings list ranked by severity. Any task-bar miss by ≥2 of
5 participants is a release-blocking finding (enters the defect list, resets
the clean-RC count per `docs/RUNBOOK.md`).
