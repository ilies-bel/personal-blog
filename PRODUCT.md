# Product

## Register

brand

## Users

The visitor we most want to win is a **hiring manager or technical recruiter** evaluating Iliès professionally. They arrive with limited time and a screening mindset: *can this person build, do they have taste, are they someone I'd want on the team?* Many will land directly (from a CV, a LinkedIn link, an email signature) rather than from an aggregator. A secondary audience is technical peers from Hacker News, Lobsters, or X who appreciate cleverness and craft.

Their job-to-be-done: form a fast, durable impression of Iliès as an engineer, then (ideally) read a post that proves the craft is real and not just surface.

## Product Purpose

A personal blog and portfolio where **the design is the product**. It exists to make Iliès memorable and credible in the seconds a hiring manager spends deciding whether to keep reading. The signature is a hero that personalizes itself client-side to each visitor (time of day, device, browser, where they came from, whether they've been here before) — a small, technically tasteful trick that demonstrates front-end command without a backend. Success looks like: a visitor remembers the site, trusts the craft, and reads at least one post.

## Brand Personality

**Sharp · crafted · self-aware.** Confident and witty, but clearly in control. The hero's playful jabs should read as *"this person has taste and sweats the details,"* never as *"this person is hard to work with."* Voice is a senior engineer who is funny because they are precise, not despite it. Warm enough to be likeable to someone outside the in-group; specific enough that an insider nods. Emotional goal: a small, genuine smile, followed by respect.

## Anti-references

- Generic blog templates: Medium, Substack, dev.to, Hashnode default themes. The whole point is to look unmistakably hand-built.
- Dark-purple-gradient SaaS landing clones; hero-metric stat blocks; "build faster, ship faster" marketing cadence.
- Trying-too-hard maximalism: animation on every scroll, glassmorphism everywhere, effects with no purpose. Cleverness should feel effortless, not effortful.
- Roasts that tip from witty into mean or smug. The audience is someone deciding whether to hire; alienating them is failure even if the joke lands.
- AI-default "warm cream + muted slate + tiny tracked eyebrow over every section" editorial scaffolding.

## Design Principles

1. **Show, don't tell.** The personalized hero proves front-end command better than any "skills" list. Let the craft be the argument.
2. **Wit in service of trust.** Every joke must leave the reader thinking *better* of Iliès, not just amused. If a line risks reading as abrasive to a hiring manager, soften it.
3. **The reading experience stays calm.** The hero is the showpiece; once a visitor commits to a post, get out of the way — legible measure, quiet typography, zero gimmicks.
4. **Effortless, not effortful.** Distinctiveness through a few committed moves (one signature, done impeccably), not a pile of effects. Restraint everywhere the hero isn't.
5. **Hand-built, on purpose.** Nothing here should be guessable as a template or as AI output. Every detail should answer "how was this made?", not "which generator made this?"

## Accessibility & Inclusion

Best-effort, ship-fast — but with a non-negotiable floor: WCAG AA contrast on body and interactive text, full keyboard operability, visible focus, and honored `prefers-reduced-motion` (the hero is JS-driven, so its swap must degrade gracefully and not strobe). Don't block shipping on edge-case AA, but never ship illegible muted-gray-on-tint or hover-only functionality.
