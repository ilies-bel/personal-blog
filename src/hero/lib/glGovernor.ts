// GL GOVERNOR — the sitewide WebGL context budget, as PURE token logic.
//
// Browsers cap live WebGL contexts per page (Chrome ~16, Safari fewer) and evict
// the oldest silently when the cap is crossed; long before that, every extra
// context burns GPU memory and a render loop. This site's rule is deliberate and
// small: AT MOST TWO live contexts, ever. The home hero (or a page's one ambient
// backdrop) holds one; one opt-in inline figure may hold the other. Everything
// else falls back to its still capture/poster.
//
// The governor is deliberately GL-free — it never touches canvases or renderers,
// it only hands out TOKENS. Holders do the GL work: they acquire() BEFORE
// constructing a renderer (a null grant means "render your fallback instead"),
// release() on their dispose path, and implement onEvict() by disposing their
// renderer + swapping to their fallback. Context LOSS is not release: a lost
// context keeps its token because the restore path revives the same renderer.
//
// Eviction policy (the whole algorithm):
//   • acquire() grants freely while fewer than MAX_CONTEXTS tokens are live.
//   • When full, the requester may EVICT a live token of strictly LOWER
//     priority (never equal — a second inline figure cannot bump the first;
//     the first must scroll away and release on its own).
//   • Among several evictable tokens the LOWEST priority goes first; ties break
//     LRU on touch() (holders that render actively touch their token, so the
//     stalest holder is the one bumped).
//   • Otherwise acquire() returns null and the requester falls back.
//
// Priorities in use (spelled once, here): home hero 10, ambient article/graveyard
// backdrop 5, opt-in inline figure 1.
//
// Pure logic on purpose: test/gl-governor.test.mjs imports this module directly
// (node strips types) and pins the policy without any GL or DOM.

export const MAX_CONTEXTS = 2;

/** Priority of the home hero's engine mount — never evicted in practice. */
export const PRIORITY_HERO = 10;
/** Priority of a page's single ambient scroll-driven backdrop (ArticleScene). */
export const PRIORITY_AMBIENT = 5;
/** Priority of an opt-in inline live figure (SceneFigure "Run live"). */
export const PRIORITY_FIGURE = 1;

export interface GovernorToken {
  /** The priority this token was granted at (higher survives lower). */
  readonly priority: number;
}

export interface AcquireOptions {
  /** Higher outranks lower; equal never evicts equal. */
  priority: number;
  /** Called when a higher-priority requester bumps this token. The holder MUST
   *  dispose its renderer and swap to its fallback; its token is already
   *  released when this runs (a defensive release() inside is a no-op). */
  onEvict: () => void;
}

export interface GlGovernor {
  /** Request a context slot. Null means the budget is spent on holders that
   *  outrank (or tie) you — render the fallback instead of a canvas. */
  acquire(opts: AcquireOptions): GovernorToken | null;
  /** Return a slot. Idempotent; unknown/stale tokens are ignored. */
  release(token: GovernorToken | null | undefined): void;
  /** Mark a token as actively used (LRU freshness for equal-priority ties). */
  touch(token: GovernorToken | null | undefined): void;
  /** Live token count — introspection for tests/debugging only. */
  liveCount(): number;
}

interface LiveToken extends GovernorToken {
  onEvict: () => void;
  /** Monotonic recency stamp — bumped on grant and on touch(). */
  lastUsed: number;
}

/** Factory (exported for the unit tests — each test gets a fresh instance).
 *  Production code uses the shared `glGovernor` singleton below. */
export function createGlGovernor(maxContexts: number = MAX_CONTEXTS): GlGovernor {
  const live: LiveToken[] = [];
  // Monotonic counter instead of Date.now(): grants/touches inside one tick
  // still order deterministically, and tests never depend on wall time.
  let clock = 0;

  const remove = (token: GovernorToken): LiveToken | null => {
    const index = live.findIndex((t) => t === token);
    if (index === -1) return null;
    const [removed] = live.splice(index, 1);
    return removed ?? null;
  };

  return {
    acquire(opts: AcquireOptions): GovernorToken | null {
      if (live.length < maxContexts) {
        const token: LiveToken = { priority: opts.priority, onEvict: opts.onEvict, lastUsed: ++clock };
        live.push(token);
        return token;
      }
      // Full: find the weakest live holder — lowest priority, then least
      // recently used. Evict it only if it is STRICTLY below the requester.
      let victim: LiveToken | null = null;
      for (const t of live) {
        if (!victim || t.priority < victim.priority
          || (t.priority === victim.priority && t.lastUsed < victim.lastUsed)) {
          victim = t;
        }
      }
      if (!victim || victim.priority >= opts.priority) return null;
      // Release the victim BEFORE its onEvict runs so a defensive release()
      // (or even a re-acquire) inside the eviction callback sees a consistent
      // ledger and can never double-free the slot.
      remove(victim);
      victim.onEvict();
      const token: LiveToken = { priority: opts.priority, onEvict: opts.onEvict, lastUsed: ++clock };
      live.push(token);
      return token;
    },

    release(token: GovernorToken | null | undefined): void {
      if (!token) return;
      remove(token); // idempotent: a second release finds nothing to remove
    },

    touch(token: GovernorToken | null | undefined): void {
      if (!token) return;
      const held = live.find((t) => t === token);
      if (held) held.lastUsed = ++clock;
    },

    liveCount(): number {
      return live.length;
    },
  };
}

/** THE page-wide governor. A bundled module evaluates once per session, so this
 *  singleton survives Astro ClientRouter SPA swaps — exactly what the budget
 *  needs (tokens are released by each island's unmount cleanup on swap). */
export const glGovernor = createGlGovernor();
