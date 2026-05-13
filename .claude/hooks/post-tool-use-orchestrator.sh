#!/usr/bin/env bash
# post-tool-use-orchestrator.sh — Phase 4: Post-tool audit hook.
# Runs after Write/Edit operations to update evidence and trigger checkers.
#
# Architecture: Thin hook. Heavy logic delegated to MCP constraint-enforcer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture stdin
STDIN=$(cat)

TOOL_NAME=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_name",""))' 2>/dev/null || echo "")
FILE_PATH=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("file_path",""))' 2>/dev/null || echo "")

HELPER_PATH="${SCRIPT_DIR}/hook-enforcer-helper.js"

# ---------------------------------------------------------------------------
# 1. After Write/Edit: trigger lightweight checks
# ---------------------------------------------------------------------------
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]] && [ -n "$FILE_PATH" ]; then
    # If helper available, request evidence lock refresh for sensitive files
    if [ -f "$HELPER_PATH" ] && command -v node >/dev/null 2>&1; then
        node "$HELPER_PATH" --post-use "$FILE_PATH" 2>/dev/null || true
    fi
fi

exit 0
