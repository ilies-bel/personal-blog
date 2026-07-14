#!/usr/bin/env bash
# check-completeness-gate-removed.sh
#
# Post-install verification: confirms the completeness gate has been removed
# from the globally-installed mars framework.
#
# Usage (under the rebuild-and-reinstall step):
#
#   bash scripts/check-completeness-gate-removed.sh
#
# The script:
#   1. Resolves the globally-installed mars package directory via `which mars`.
#   2. Greps its shipped source/bundle/dist files for retired-gate identifiers.
#   3. Prints the installed version and build SHA (if embedded).
#   4. Exits 0 with a one-line 'clean' summary when no retired identifiers found.
#   5. Exits 1 and lists each offending file:line if any retired identifier is present.
#
# Retired identifiers checked:
#   - completenessGate / completeness_gate / COMPLETENESS_GATE
#   - CompletionReport / COMPLETION_REPORT / completion report (phrase)
#
# Run this immediately after `npm install -g mars` (or the equivalent pnpm/yarn
# global install) to confirm the new build no longer enforces the retired gate.
#
# --help: prints this header and exits 0.

set -euo pipefail

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,/^# --help/p' "$0" | sed 's/^#[[:space:]]*//'
  exit 0
fi

# ---------------------------------------------------------------------------
# Locate the mars package root
# ---------------------------------------------------------------------------
MARS_BIN="$(which mars 2>/dev/null || true)"
if [[ -z "$MARS_BIN" ]]; then
  echo "ERROR: 'mars' not found in PATH. Install it first with:" >&2
  echo "  npm install -g mars" >&2
  exit 2
fi

# Resolve symlinks to reach the real binary path
MARS_REAL="$(readlink -f "$MARS_BIN" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$MARS_BIN")"

# The binary lives at <prefix>/bin/mars.mjs — walk up two levels to the package root.
# Layout: <prefix>/bin/mars.mjs -> package root is <prefix>/../
# More precisely: bin/mars.mjs is inside the package, so parent of bin/ is package root.
MARS_PKG_ROOT="$(dirname "$(dirname "$MARS_REAL")")"

# Sanity-check: package.json must exist there.
if [[ ! -f "$MARS_PKG_ROOT/package.json" ]]; then
  echo "ERROR: Could not locate mars package root (expected package.json at $MARS_PKG_ROOT)." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Print version information
# ---------------------------------------------------------------------------
INSTALLED_VERSION="$(python3 -c "import json; d=json.load(open('$MARS_PKG_ROOT/package.json')); print(d.get('version','unknown'))" 2>/dev/null || echo "unknown")"

# Look for an embedded build SHA (common patterns: version.ts, .buildinfo, package.json field)
BUILD_SHA="$(
  # Try version.ts constant
  grep -oE 'BUILD_SHA\s*=\s*"[0-9a-f]{7,40}"' "$MARS_PKG_ROOT/src/version.ts" 2>/dev/null \
    | grep -oE '[0-9a-f]{7,40}' \
  || \
  # Try package.json gitHead field (npm sometimes injects this)
  python3 -c "import json; d=json.load(open('$MARS_PKG_ROOT/package.json')); print(d.get('gitHead',''))" 2>/dev/null \
  || \
  true
)"

echo "mars installed version : $INSTALLED_VERSION"
if [[ -n "$BUILD_SHA" ]]; then
  echo "mars build SHA         : $BUILD_SHA"
else
  echo "mars build SHA         : (not embedded)"
fi
echo "mars package root      : $MARS_PKG_ROOT"
echo ""

# ---------------------------------------------------------------------------
# Identify which directories to scan
# ---------------------------------------------------------------------------
SCAN_DIRS=()

for candidate in dist bundle src bin; do
  dir="$MARS_PKG_ROOT/$candidate"
  if [[ -d "$dir" ]]; then
    SCAN_DIRS+=("$dir")
  fi
done

if [[ ${#SCAN_DIRS[@]} -eq 0 ]]; then
  echo "ERROR: No scannable directories found under $MARS_PKG_ROOT" >&2
  echo "       (looked for: dist, bundle, src, bin)" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Grep for retired-gate identifiers
# ---------------------------------------------------------------------------
# Patterns that must NOT appear in a clean build:
#   completenessGate   — primary gate function/constant name
#   completeness_gate  — snake_case variant
#   COMPLETENESS_GATE  — SCREAMING_SNAKE variant
#   CompletionReport   — class/type name
#   COMPLETION_REPORT  — constant variant
#   completion report  — phrase used in gate messages (case-insensitive)

# Collect matching files/lines (skip test files — they may document the old behaviour).
# Uses rg (ripgrep) when available for speed; falls back to portable grep.
OFFENDERS="$(
  if command -v rg >/dev/null 2>&1; then
    rg \
      --no-heading \
      --line-number \
      --with-filename \
      --ignore-case \
      --glob '!*.test.ts' \
      --glob '!*.test.js' \
      --glob '!*.spec.ts' \
      --glob '!*.spec.js' \
      --glob '!__tests__/**' \
      --glob '!*.md' \
      -e 'completenessGate' \
      -e 'completeness_gate' \
      -e 'COMPLETENESS_GATE' \
      -e 'CompletionReport' \
      -e 'COMPLETION_REPORT' \
      -e 'completion report' \
      "${SCAN_DIRS[@]}" 2>/dev/null || true
  else
    # POSIX grep fallback — slightly slower but universally available
    find "${SCAN_DIRS[@]}" -type f \( \
        -name '*.ts' -o -name '*.tsx' -o \
        -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \
      \) \
      ! -name '*.test.*' ! -name '*.spec.*' \
      ! -path '*/__tests__/*' \
      -print0 \
    | xargs -0 grep -inH \
        -e 'completenessGate' \
        -e 'completeness_gate' \
        -e 'COMPLETENESS_GATE' \
        -e 'CompletionReport' \
        -e 'COMPLETION_REPORT' \
        -e 'completion report' \
      2>/dev/null || true
  fi
)"

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ -z "$OFFENDERS" ]]; then
  echo "✓ clean — no retired completeness-gate identifiers found in the installed mars bundle."
  exit 0
else
  echo "✗ FAIL — retired completeness-gate identifiers still present in the installed bundle:" >&2
  echo "" >&2
  echo "$OFFENDERS" >&2
  echo "" >&2
  echo "Re-run the rebuild-and-reinstall step and try again." >&2
  exit 1
fi
