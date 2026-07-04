// Pre-evaluation shim for the three.js core chunk — a TASK-SHAPING device, not an
// API. HeroIsland dynamically imports THIS module (its own micro-chunk) before the
// scene code, so the three-core chunk (its static dependency, split out via
// manualChunks in astro.config.mjs) is fetched + EVALUATED in its own main-thread
// task. The scene chunk that follows then evaluates only the addons + scene code —
// two medium eval tasks instead of one ~760 KB monster riding a single task.
//
// WHY NOT `await import('three')` DIRECTLY: a dynamic import builds the module's
// FULL namespace object, which marks every export of three as reachable and
// disables tree-shaking for the whole library (measured: +~230 KB raw on the
// three-core chunk). A NAMED static import here keeps the shaken module graph
// byte-identical — this shim adds one already-used binding and nothing else.
import { Vector3 } from 'three';

/** Truthy once the three-core chunk is evaluated. Exported (and re-exported by the
 *  importer's `await`) only so the import can't be dropped as side-effect-free. */
export const threeCoreReady: boolean = typeof Vector3 === 'function';
