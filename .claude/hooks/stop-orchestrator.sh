#!/usr/bin/env bash
# stop-orchestrator.sh — Phase 4: Session stop / cleanup hook.
# Triggers dirty-hygiene checks and prints closeout reminders.
#
# Architecture: Thin hook. Delegates checker execution to MCP constraint-enforcer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_PATH="${SCRIPT_DIR}/hook-enforcer-helper.js"

# ---------------------------------------------------------------------------
# 1. Run dirty-hygiene reminder
# ---------------------------------------------------------------------------
echo ""
echo "=== Session Stop Hook ==="
echo "Reminder: Rule 4 (Dirty Hygiene) — audit and clean orphaned outputs before closeout."
echo ""

# ---------------------------------------------------------------------------
# 2. If helper available, run lightweight state projection check
# ---------------------------------------------------------------------------
if [ -f "$HELPER_PATH" ] && command -v node >/dev/null 2>&1; then
    node "$HELPER_PATH" --stop 2>/dev/null || true
fi

echo "=== Session Ended ==="
echo ""

exit 0
