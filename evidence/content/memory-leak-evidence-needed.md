# Memory Leak — Evidence Needed

Generated during the forensic art-direction of
`src/content/posts/memory-leak-search-and-destroy.mdx` (EXP-028, 2026-07-10).

Each item below corresponds to a claim in the article that would be strengthened
by a concrete artifact — a screenshot, graph, or file — that does not currently
exist in the repository. **Do not fabricate these artifacts.** Collect them from
the original investigation recordings if available, or reproduce them by running
the Gatling scenario described in the article against a version of the application
that still carries Sentry SDK 6.12.1.

Collected artifacts should pass through the PERF-006 optimization pipeline before
being committed to `public/posts/memory-leak/`.

---

## E-1 — Crash-time heap dump

**Article reference:** Incident log, T+0 / T+2; Phase 1 starting conditions.

**Why it matters:** No heap dump was captured when the application crashed in
production. The entire investigation was reconstructed from a reproduction run,
not from the actual crash event. A heap dump from the crash instant would provide
ground-truth evidence of what was in memory at the moment of failure.

**What to collect:** The `.hprof` file that `-XX:+HeapDumpOnOutOfMemoryError`
would have generated automatically.

**Retroactive availability:** Unlikely — the instance was probably restarted
immediately after the crash, losing the heap state.

**Preventive action for future incidents:** Add
`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/dumps/` to JVM startup
flags in all environments.

---

## E-2 — Heap-growth graph during Gatling reproduction

**Article reference:** Phase 1 — Reproducing the leak.

**Why it matters:** The article states "heap usage climbed steadily toward the
container memory limit." A graph of heap used vs. time, annotated with the
load-test window and the container memory limit line, makes this immediately
visible rather than asserted.

**What to collect:** Screenshot or exported PNG of the heap monitor in IntelliJ,
VisualVM, or a monitoring platform (Datadog, Prometheus/Grafana), captured during
the Gatling run that reproduced the leak. Annotate: test start, test end, container
memory limit, observed peak.

**Figure requirements (PERF-006):**
- Minimum source width: 1200 px before compression.
- Include axis labels (time on x, heap MB on y) and a title.
- Suggested destination: `public/posts/memory-leak/heap-growth-reproduction.png`

---

## E-3 — Heap dump object table screenshot

**Article reference:** Phase 3a — Heap dump.

**Why it matters:** `ConcurrentHashMap` is identified as the top retained-memory
holder. The object table from the profiler is the primary evidence for this claim.
Without it, the identification rests on narrative alone.

**What to collect:** Screenshot of the Objects (or Memory) tab in IntelliJ profiler
or Eclipse MAT, sorted by Retained size descending, showing `ConcurrentHashMap`
prominently ranked. Ideally include the Count, Shallow, and Retained columns.

**Figure requirements (PERF-006):**
- Minimum source width: 1200 px before compression.
- Crop to the relevant table area; avoid capturing personal or production data.
- Suggested destination: `public/posts/memory-leak/heap-objects-by-retained.png`

---

## E-4 — Flamegraph from IntelliJ profiler during Gatling run

**Article reference:** Phase 3b — Flamegraph.

**Why it matters:** The flamegraph is the single most important piece of evidence
in this investigation. It is the only artifact that directly connects the observed
`ConcurrentHashMap` growth to a specific call site
(`io.sentry.transport.HttpConnection.createConnection`) and proves the allocation
occurred in the Sentry SDK, not in application code.

**What to collect:** Full-resolution screenshot or exported PNG of the allocation
flamegraph from IntelliJ profiler, captured during a Gatling run with Sentry SDK
6.12.1 active. Must show:
- `Thread.run` as the root entry point.
- `io.sentry.transport.HttpConnection.createConnection` spanning approximately
  50 % of the total allocation width.

**Figure requirements (PERF-006):**
- Minimum source width: 1600 px before compression (flamegraphs are wide).
- If the full flamegraph is too wide, provide two crops: a wide-view showing
  the proportional width of the Sentry subtree, and a zoomed view showing the
  `createConnection` call site with its label visible.
- Suggested destination: `public/posts/memory-leak/flamegraph-sentry-allocation.png`

---

## E-5 — Before/after heap graphs: Sentry enabled vs. disabled

**Article reference:** Phase 4 — Hypothesis B confirmation.

**Why it matters:** The article asserts that disabling the Sentry SDK caused heap
growth to stop under the same Gatling load. This is the confirmation step for
Hypothesis B. A side-by-side comparison converts a narrative claim into visual
evidence.

**What to collect:** Two memory graphs from identical Gatling runs:
- **Run A (Sentry 6.12.1 active):** heap climbs toward the container limit.
- **Run B (Sentry removed/disabled):** heap remains stable.

Both graphs should share the same time axis scale and memory axis scale so the
contrast is legible at a glance.

**Figure requirements (PERF-006):**
- Present as a single side-by-side image or two separate images with identical
  crop dimensions.
- Minimum source width per panel: 900 px before compression.
- Suggested destination:
  `public/posts/memory-leak/heap-sentry-enabled.png` and
  `public/posts/memory-leak/heap-sentry-disabled.png`

---

## E-6 — Post-fix heap graph: Sentry SDK 6.13

**Article reference:** Phase 7 — Verification, Step 2.

**Why it matters:** This closes the evidentiary loop. It shows that updating the
SDK resolves the leak under the same load conditions that previously caused it.

**What to collect:** Heap-usage graph from a Gatling run with Sentry SDK 6.13 or
later. Ideally captured at the same scale as E-5 Run A for a direct comparison.

**Figure requirements (PERF-006):**
- Same axis scales as E-5 Run A if shown alongside it.
- Minimum source width: 900 px before compression.
- Suggested destination: `public/posts/memory-leak/heap-sentry-6.13-fixed.png`

---

## Collection notes

All screenshots and graphs should:
1. Use the Gatling scenario that was used in the original investigation (or a
   faithful reproduction of it), so the load pattern is auditable.
2. Be exported at the minimum widths listed above, then passed through the
   PERF-006 optimization pipeline before being committed.
3. Contain no personally identifiable information and no production hostnames,
   IP addresses, or credentials — crop or redact as needed.
4. Be committed with a note in the pull-request description identifying which
   evidence item (E-1 through E-6) the file satisfies.
