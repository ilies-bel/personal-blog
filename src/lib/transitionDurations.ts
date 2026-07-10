/**
 * Transition duration tokens — the single JavaScript source of truth for every
 * timed navigation and interaction choreography on the site.
 *
 * Governance
 * ----------
 * DESTINATION tokens are transitions that reveal content at the arrival page.
 * They MUST be <= 700ms (DESTINATION_TRANSITION_CAP_MS). The unit test in
 * test/transitionDurations.test.mjs asserts this for every entry in
 * DESTINATION_TOKENS.
 *
 * SET-PIECE tokens are departure choreography (e.g. the warp jump-out). They
 * are narrative experiences, not content gates, and are exempt from the cap.
 * The unit test explicitly documents each exemption.
 *
 * INTERACTION tokens are pointer/keyboard responses that are not navigation.
 * They are governed by the same 700ms cap as destination tokens so the site
 * never imposes a felt delay on the reader.
 *
 * All destination and interaction transitions MUST be interruptible and MUST
 * NOT gate content: the page DOM must be readable before or without the
 * animation completing.
 *
 * CSS counterparts live in src/styles/tokens.css under --transition-dur-*.
 * Any change to a value here must be mirrored in tokens.css, and vice versa,
 * so the two layers remain in sync.
 */

// ---------------------------------------------------------------------------
// Warp transition (src/scripts/warpTransition.ts)
// ---------------------------------------------------------------------------

/**
 * DEPARTURE set-piece: the Star-Wars jump-out acceleration from sub-light to
 * the white-flash apex. Navigation fires at (WARP_JUMP_MS − WARP_NAV_BEFORE_END_MS),
 * so content loads behind the peak brightness.
 *
 * Exempt from the 700ms cap — this is a deliberate narrative experience.
 * The content is never gated: the SPA swap fires at the flash apex and content
 * is in the DOM before the jump animation nominally ends.
 */
export const WARP_JUMP_MS = 1500;

/**
 * DESTINATION transition: the arrival fade-out of warp streaks over the
 * already-loaded About page. The About content is in the DOM and accessible
 * from the moment the SPA swap completes; this overlay merely dissolves.
 *
 * Must be <= 700ms (DESTINATION_TRANSITION_CAP_MS).
 */
export const WARP_ARRIVE_MS = 700;

/**
 * Internal timing offset: navigate this many ms before WARP_JUMP_MS so the
 * SPA swap lands at the white-flash apex.
 */
export const WARP_NAV_BEFORE_END_MS = 130;

// ---------------------------------------------------------------------------
// ClientRouter view transitions (src/styles/transitions.css)
// ---------------------------------------------------------------------------

/**
 * DESTINATION transition — outgoing content: the old page settles down-and-dim
 * quickly so the incoming rise owns the moment.
 * CSS: --transition-dur-settle.
 * Must be <= 700ms.
 */
export const VT_SETTLE_MS = 250;

/**
 * DESTINATION transition — incoming content: the new page rises 14 px into
 * place on the house ease-out-quint curve.
 * CSS: --transition-dur-rise.
 * Must be <= 700ms.
 */
export const VT_RISE_MS = 450;

// ---------------------------------------------------------------------------
// Hard-load entrance choreography (src/styles/transitions.css)
// ---------------------------------------------------------------------------

/**
 * Entrance animation for hero blocks (kicker, h1, lead) on hard loads.
 * CSS: --transition-dur-page-enter.
 *
 * NOT a navigation/destination transition — content is already rendered in the
 * DOM before this animation runs; it is purely additive visual choreography.
 * Stagger delays can push total reveal past 700ms for the last item, but each
 * individual element's animation duration is 600ms.
 */
export const PAGE_ENTER_MS = 600;

/**
 * Entrance animation for list/row stagger (first 6 rows) on hard loads.
 * CSS: --transition-dur-page-enter-rows.
 * Same exemption as PAGE_ENTER_MS.
 */
export const PAGE_ENTER_ROWS_MS = 500;

// ---------------------------------------------------------------------------
// Decode hover (src/scripts/decodeHover.ts)
// ---------------------------------------------------------------------------

/**
 * INTERACTION: the text-scramble decode duration for [data-decode] labels.
 * POINTER ONLY — keyboard focus never scrambles.
 * Must be <= 700ms.
 */
export const DECODE_HOVER_MS = 300;

// ---------------------------------------------------------------------------
// Card flips — reserved, not yet implemented
// ---------------------------------------------------------------------------

/**
 * DESTINATION transition: card flip reveal for Projects route cards (EXP-022,
 * EXP-037 planned, not yet implemented in this codebase).
 *
 * When implemented the flip must satisfy:
 *   - Duration <= DESTINATION_TRANSITION_CAP_MS (700ms)
 *   - Interruptible at any point without leaving the card in a half-flipped state
 *   - Reduced-motion variant: instant reveal (no rotation)
 *   - Content on the back face must be in the DOM before the flip begins
 *
 * Must be <= 700ms once implemented.
 */
export const CARD_FLIP_MS = 400; // reserved; not yet wired to any component

// ---------------------------------------------------------------------------
// Governance constants
// ---------------------------------------------------------------------------

/**
 * Maximum allowed duration for any DESTINATION or INTERACTION transition.
 * All tokens in DESTINATION_TOKENS must satisfy: token <= DESTINATION_TRANSITION_CAP_MS.
 * The unit test in test/transitionDurations.test.mjs enforces this.
 */
export const DESTINATION_TRANSITION_CAP_MS = 700;

/**
 * Every destination and interaction token that must satisfy the 700ms cap.
 * Add any new navigation/reveal/interaction duration here so the unit test
 * automatically catches a future regression.
 */
export const DESTINATION_TOKENS: Record<string, number> = {
  WARP_ARRIVE_MS,
  VT_SETTLE_MS,
  VT_RISE_MS,
  DECODE_HOVER_MS,
  CARD_FLIP_MS,
};
