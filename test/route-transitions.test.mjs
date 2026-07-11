// P9 ROUTE-TRANSITION BUDGET — every route transition must stay ≤ 700ms
// perceived. This pins the three surfaces that own navigation motion:
//
//   1. src/styles/transitions.css — the view-transition settle/rise, the
//      hard-load entrance choreography, and the per-route entry rhythms. EVERY
//      time literal in the file (durations AND delays) must be ≤ 700ms, so no
//      single navigation move can outlast the budget.
//   2. src/scripts/warpTransition.ts — the hyperspace jump to About. JUMP_MS
//      is the perceived transition (the swap lands NAV_BEFORE_END_MS before its
//      end and the arrival fade dissolves over the already-readable page), so
//      JUMP_MS and ARRIVE_MS are each pinned ≤ 700ms.
//   3. The dive arrival tail: the BaseLayout resurface recede and the
//      hero.css dive-resurface keyframe both ≤ 700ms.
//
// EXEMPTION (by design): the HOME hero's internal scroll choreography (the
// presentation clock's follow-ease, the loader glide, beat reveals in
// scene.css/hero.css) is scroll-scrubbed storytelling, NOT a route transition
// — it is deliberately not parsed here, except the dive-resurface keyframe,
// which IS a navigation arrival.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const BUDGET_MS = 700;

/** Every CSS time literal ("0.45s", "450ms") in the text, in ms. */
function cssTimesMs(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const times = [];
  for (const m of noComments.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
    times.push(m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000);
  }
  return times;
}

test('transitions.css: every time literal (duration or delay) is ≤ 700ms', () => {
  const times = cssTimesMs(read('src/styles/transitions.css'));
  assert.ok(times.length > 0, 'expected transitions.css to declare timed motion');
  for (const t of times) {
    assert.ok(t <= BUDGET_MS, `transitions.css carries a ${t}ms time — budget is ${BUDGET_MS}ms`);
  }
});

test('warpTransition.ts: the jump and arrival each fit the 700ms budget', () => {
  const src = read('src/scripts/warpTransition.ts');
  const constant = (name) => {
    const m = src.match(new RegExp(`const ${name} = (\\d+(?:\\.\\d+)?);`));
    assert.ok(m, `expected "const ${name} = <number>;" in warpTransition.ts`);
    return Number(m[1]);
  };
  const jump = constant('JUMP_MS');
  const arrive = constant('ARRIVE_MS');
  const navBeforeEnd = constant('NAV_BEFORE_END_MS');
  assert.ok(jump <= BUDGET_MS, `JUMP_MS ${jump} > ${BUDGET_MS} — the warp is a route transition`);
  assert.ok(arrive <= BUDGET_MS, `ARRIVE_MS ${arrive} > ${BUDGET_MS}`);
  // The swap must land INSIDE the jump (that's what makes JUMP_MS the
  // perceived duration): navigate strictly before the animation ends.
  assert.ok(navBeforeEnd > 0 && navBeforeEnd < jump, 'navigation must land before the jump ends');
});

test('dive arrival tail: resurface recede + dive-resurface keyframe are ≤ 700ms', () => {
  // BaseLayout eases the persisted bloom overlay out on arrival.
  const layout = read('src/layouts/BaseLayout.astro');
  const recede = layout.match(/overlay\.style\.transition = `opacity ([\d.]+)s/);
  assert.ok(recede, 'expected the dive resurface recede transition in BaseLayout.astro');
  assert.ok(
    Number(recede[1]) * 1000 <= BUDGET_MS,
    `dive recede ${recede[1]}s exceeds the ${BUDGET_MS}ms budget`,
  );
  // hero.css plays the content rise off body[data-resurface].
  const hero = read('src/styles/hero.css');
  const rise = hero.match(/animation:\s*dive-resurface\s+([\d.]+)s/);
  assert.ok(rise, 'expected the dive-resurface animation declaration in hero.css');
  assert.ok(
    Number(rise[1]) * 1000 <= BUDGET_MS,
    `dive-resurface ${rise[1]}s exceeds the ${BUDGET_MS}ms budget`,
  );
});
