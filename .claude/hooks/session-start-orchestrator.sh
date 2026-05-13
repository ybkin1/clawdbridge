#!/usr/bin/env bash
# session-start-orchestrator.sh — Phase 4: Session initialization hook.
# Loads active contract set and prints context summary for the orchestrator.
#
# Architecture: Thin hook. Delegates contract resolution to MCP constraint-enforcer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_PATH="${SCRIPT_DIR}/hook-enforcer-helper.js"

# ---------------------------------------------------------------------------
# 1. Print architecture version banner
# ---------------------------------------------------------------------------
echo ""
echo "=== Claude Code Norms v2.0 | 8-Layer Architecture ==="
echo "Spec: .claude/contracts/ | Config: .claude/config/ | MCP: .claude/mcp-servers/"
echo ""

# ---------------------------------------------------------------------------
# 2. Load active contracts (if helper available)
# ---------------------------------------------------------------------------
if [ -f "$HELPER_PATH" ] && command -v node >/dev/null 2>&1; then
    ACTIVE_CONTRACTS=$(node "$HELPER_PATH" --session-start 2>/dev/null || echo "")
    if [ -n "$ACTIVE_CONTRACTS" ]; then
        echo "Active contracts: $ACTIVE_CONTRACTS"
        echo ""
    fi
fi

# ---------------------------------------------------------------------------
# 3. Check for stale task state
# ---------------------------------------------------------------------------
if [ -f ".claude/tasks/INDEX.md" ]; then
    TASK_COUNT=$(grep -c "^\s*-\s*tk-" .claude/tasks/INDEX.md 2>/dev/null || echo "0")
    echo "Tracked tasks: $TASK_COUNT"
fi

echo "=== Session Ready ==="
echo ""

exit 0
