// StarMarker interaction contract — behavioural unit tests.
//
// StarMarker.tsx owns four interaction contracts that must survive refactors:
//   1. Lock engages when pointer enters the engage circle (HEX_PEAK_RATIO × boxWidth).
//   2. Lock holds (hysteresis) until the pointer passes the release radius.
//   3. Tier escalation: idle → hover → active as the pointer approaches; each
//      boundary has its own sticky hysteresis margin.
//   4. Card keep-alive: while locked, moving past the release circle does NOT
//      drop the lock if the pointer is in the padded card region.
//
// These tests mirror the LOGIC (not the DOM wiring) of the rAF tick function.
// They are hand-translated pure JS equivalents of the constants + branches in
// StarMarker.tsx so they run under `node --test` with zero dependencies and
// zero DOM. A refactor that keeps the same observable behaviour leaves these
// tests green; a refactor that changes the geometry trips them immediately.
//
// NOTE: the tap-lock (touch) and keyboard-focus paths are purely event-driven
// (set by DOM event handlers) and have no geometry; they are not duplicated here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Constants (must stay in sync with StarMarker.tsx) ─────────────────────
const HEX_PEAK_RATIO    = 50 / 116;   // engage radius = boxWidth × ratio
const LOCK_RELEASE_MARGIN = 14;        // px past engage before lock releases
const ACTIVE_RADIUS_FACTOR = 1.55;     // active band starts at 1× engage radius
const HOVER_RADIUS_FACTOR  = 2.7;      // hover band starts at ACTIVE_RADIUS_FACTOR×
const TIER_RELEASE_MARGIN  = 10;       // px hysteresis on each tier boundary
const KEEP_ALIVE_PAD = 28;             // px padding around card body for keep-alive

// ── Pure geometry helpers (mirror of tick() branches) ─────────────────────

/** Engage radius: the circular hitbox radius for locking. */
const engageRadius = (boxWidth) => boxWidth * HEX_PEAK_RATIO;

/**
 * Compute next lock state given current pointer distance-squared, the engage
 * radius, and whether the lock was held last frame (hysteresis).
 *
 * Returns true if the lock should be engaged next frame, false to release.
 * Does NOT handle touch-lock or keyboard-focus paths (those are event-driven).
 */
function lockTransition(distSq, radius, lastLocked) {
  const engageSq  = radius * radius;
  const releaseR  = radius + LOCK_RELEASE_MARGIN;
  const releaseSq = releaseR * releaseR;
  if (!lastLocked) return distSq <= engageSq;       // engage when inside circle
  if (distSq > releaseSq) return false;             // release past hysteresis edge
  return true;                                       // hold between engage and release
}

/**
 * Compute the marker's visual tier (data-state) for this frame.
 *
 * distSq   — pointer distance-squared to marker centre, or -1 for no pointer.
 * radius   — engage radius (HEX_PEAK_RATIO × boxWidth).
 * lastState — tier from the previous frame (drives hysteresis).
 * nextLocked — whether the lock is engaged this frame.
 */
function markerTier(distSq, radius, lastState, nextLocked) {
  if (nextLocked)  return 'locked';
  if (distSq < 0)  return 'idle';
  const activeR = radius * ACTIVE_RADIUS_FACTOR;
  const hoverR  = radius * HOVER_RADIUS_FACTOR;
  const m = TIER_RELEASE_MARGIN;
  const inActive =
    lastState === 'active' || lastState === 'locked'
      ? distSq <= (activeR + m) * (activeR + m)
      : distSq <= activeR * activeR;
  const inHover =
    lastState === 'hover' || lastState === 'active' || lastState === 'locked'
      ? distSq <= (hoverR + m) * (hoverR + m)
      : distSq <= hoverR * hoverR;
  if (inActive) return 'active';
  if (inHover)  return 'hover';
  return 'idle';
}

/**
 * Returns true if `pointer` is in the padded card region after adjusting for
 * any marker displacement (dx, dy) since the card rect was snapshotted.
 */
function cardKeepAlive(pointer, cardRect, dx, dy) {
  return (
    pointer.x >= cardRect.left   + dx - KEEP_ALIVE_PAD &&
    pointer.x <= cardRect.right  + dx + KEEP_ALIVE_PAD &&
    pointer.y >= cardRect.top    + dy - KEEP_ALIVE_PAD &&
    pointer.y <= cardRect.bottom + dy + KEEP_ALIVE_PAD
  );
}

// ── Tests: engage radius ───────────────────────────────────────────────────

test('engage radius: 116 px box → exactly 50 px radius (50/116 ratio)', () => {
  assert.strictEqual(engageRadius(116), 50);
});

test('engage radius: zero-width box → zero radius (no lock when element has no size)', () => {
  assert.strictEqual(engageRadius(0), 0);
});

// ── Tests: lock engage / release ──────────────────────────────────────────

test('lock engages when pointer is exactly on the engage circle edge', () => {
  const r = engageRadius(116); // 50 px
  assert.ok(lockTransition(r * r, r, false), 'pointer on edge → lock');
});

test('lock engages when pointer is inside the engage circle', () => {
  const r = engageRadius(116);
  assert.ok(lockTransition((r - 1) ** 2, r, false), 'pointer 1px inside → lock');
});

test('lock does NOT engage when pointer is outside the engage circle', () => {
  const r = engageRadius(116);
  assert.ok(!lockTransition((r + 1) ** 2, r, false), 'pointer 1px outside → no lock');
});

// ── Tests: lock hysteresis ────────────────────────────────────────────────

test('lock holds while pointer is between engage and release radius', () => {
  const r       = engageRadius(116);           // 50 px
  const relR    = r + LOCK_RELEASE_MARGIN;     // 64 px
  // Just past engage radius but before release
  assert.ok(lockTransition((r + 1) ** 2, r, true), 'just past engage → stays locked');
  // 1 px before release edge
  assert.ok(lockTransition((relR - 1) ** 2, r, true), '1px before release → stays locked');
});

test('lock releases once pointer passes the release radius (engage + margin)', () => {
  const r    = engageRadius(116);
  const relR = r + LOCK_RELEASE_MARGIN;
  assert.ok(!lockTransition((relR + 1) ** 2, r, true), '1px past release → unlocks');
});

test('hysteresis: pointer that went out and came back inside engage circle re-locks', () => {
  const r = engageRadius(116);
  // Unlocked state, pointer re-enters engage circle
  assert.ok(lockTransition((r - 2) ** 2, r, false), 're-entry inside circle → locks again');
});

// ── Tests: tier escalation ────────────────────────────────────────────────

test('tier is idle when no pointer is present', () => {
  const r = engageRadius(116);
  assert.strictEqual(markerTier(-1, r, 'idle', false), 'idle');
});

test('tier is idle when pointer is beyond the hover circle', () => {
  const r     = engageRadius(116);
  const farSq = (r * HOVER_RADIUS_FACTOR + 10) ** 2;
  assert.strictEqual(markerTier(farSq, r, 'idle', false), 'idle');
});

test('tier is hover when pointer is inside the hover circle but outside active', () => {
  const r       = engageRadius(116);
  const hoverR  = r * HOVER_RADIUS_FACTOR;
  const activeR = r * ACTIVE_RADIUS_FACTOR;
  // Midpoint between active and hover circles
  const midSq = ((hoverR + activeR) / 2) ** 2;
  assert.strictEqual(markerTier(midSq, r, 'idle', false), 'hover');
});

test('tier is active when pointer is inside the active circle (but not locked)', () => {
  const r       = engageRadius(116);
  const activeR = r * ACTIVE_RADIUS_FACTOR;
  const midSq   = (activeR / 2) ** 2;
  assert.strictEqual(markerTier(midSq, r, 'idle', false), 'active');
});

test('tier is always locked when nextLocked is true, regardless of pointer distance', () => {
  const r = engageRadius(116);
  assert.strictEqual(markerTier(1e9, r, 'idle',   true), 'locked', 'far pointer + locked → locked');
  assert.strictEqual(markerTier(-1,  r, 'hover',  true), 'locked', 'no pointer + locked → locked');
  assert.strictEqual(markerTier(0,   r, 'active', true), 'locked', 'at centre + locked → locked');
});

// ── Tests: tier hysteresis ────────────────────────────────────────────────

test('active tier persists into the (activeR + margin) hysteresis band', () => {
  const r       = engageRadius(116);
  const activeR = r * ACTIVE_RADIUS_FACTOR;
  const m       = TIER_RELEASE_MARGIN;
  // Inside hysteresis band (active radius < dist < active radius + margin)
  const bandSq = (activeR + m - 1) ** 2;
  assert.strictEqual(
    markerTier(bandSq, r, 'active', false),
    'active',
    'still in hysteresis band → stays active',
  );
});

test('active tier drops to hover once pointer is past (activeR + margin)', () => {
  const r       = engageRadius(116);
  const activeR = r * ACTIVE_RADIUS_FACTOR;
  const m       = TIER_RELEASE_MARGIN;
  const pastSq  = (activeR + m + 1) ** 2;
  assert.strictEqual(
    markerTier(pastSq, r, 'active', false),
    'hover',
    'past hysteresis edge → drops to hover',
  );
});

test('hover tier persists into the (hoverR + margin) hysteresis band', () => {
  const r      = engageRadius(116);
  const hoverR = r * HOVER_RADIUS_FACTOR;
  const m      = TIER_RELEASE_MARGIN;
  const bandSq = (hoverR + m - 1) ** 2;
  assert.strictEqual(
    markerTier(bandSq, r, 'hover', false),
    'hover',
    'still in hover hysteresis band → stays hover',
  );
});

test('hover tier drops to idle once pointer is past (hoverR + margin)', () => {
  const r      = engageRadius(116);
  const hoverR = r * HOVER_RADIUS_FACTOR;
  const m      = TIER_RELEASE_MARGIN;
  const pastSq = (hoverR + m + 1) ** 2;
  assert.strictEqual(
    markerTier(pastSq, r, 'hover', false),
    'idle',
    'past hover hysteresis edge → idle',
  );
});

// ── Tests: card keep-alive region ─────────────────────────────────────────

test('card keep-alive: pointer directly inside card body keeps lock', () => {
  const card = { left: 200, right: 350, top: 100, bottom: 180 };
  assert.ok(cardKeepAlive({ x: 275, y: 140 }, card, 0, 0), 'pointer inside card → keep alive');
});

test('card keep-alive: pointer within pad distance of card edge keeps lock', () => {
  const card = { left: 200, right: 350, top: 100, bottom: 180 };
  // 1px inside the left pad boundary
  assert.ok(cardKeepAlive({ x: 200 - KEEP_ALIVE_PAD + 1, y: 140 }, card, 0, 0));
});

test('card keep-alive: pointer outside the pad distance releases lock', () => {
  const card = { left: 200, right: 350, top: 100, bottom: 180 };
  // 1px outside the left pad boundary
  assert.ok(!cardKeepAlive({ x: 200 - KEEP_ALIVE_PAD - 1, y: 140 }, card, 0, 0));
});

test('card keep-alive: adjusts for marker displacement since snapshot (dx/dy)', () => {
  // Snapshot: card at left=400, right=550, top=200, bottom=280.
  // Marker moved 50 px right (dx=50, dy=0).
  // Shifted card: effective left = 400+50 = 450.
  // Padded region starts at left: 450 − KEEP_ALIVE_PAD(28) = 422.
  //   x=421 → 421 >= 422? NO → outside padded region → releases lock.
  //   x=423 → 423 >= 422? YES → inside padded region → keeps lock.
  const card = { left: 400, right: 550, top: 200, bottom: 280 };
  const dx = 50;
  const dy = 0;
  const midY = 240;
  assert.ok(!cardKeepAlive({ x: 421, y: midY }, card, dx, dy), 'outside shifted padded region → releases');
  assert.ok( cardKeepAlive({ x: 423, y: midY }, card, dx, dy), 'inside shifted padded region → keeps alive');
});

test('card keep-alive: pointer above card top boundary (with pad) releases lock', () => {
  const card = { left: 200, right: 350, top: 100, bottom: 180 };
  assert.ok(!cardKeepAlive({ x: 275, y: 100 - KEEP_ALIVE_PAD - 1 }, card, 0, 0));
});

test('card keep-alive: pointer below card bottom boundary (with pad) releases lock', () => {
  const card = { left: 200, right: 350, top: 100, bottom: 180 };
  assert.ok(!cardKeepAlive({ x: 275, y: 180 + KEEP_ALIVE_PAD + 1 }, card, 0, 0));
});
