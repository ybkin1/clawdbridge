#!/usr/bin/env bash
# pre-tool-use-orchestrator.sh — Phase 4: Config-driven thin hook.
# Delegates sensitivity checks to MCP enforcer helper.
# Falls back to legacy hardcoded logic if helper is unavailable.
#
# Architecture: Hook reads .claude/config/write-permissions.yaml (via Node helper)
#               → shares config with MCP constraint-enforcer → no redundant rules.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture stdin
STDIN=$(cat)

# Parse tool info from stdin
TOOL_NAME=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_name",""))' 2>/dev/null || echo "")
FILE_PATH=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("file_path",""))' 2>/dev/null || echo "")
NEW_CONTENT=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("content",ti.get("new_string","")))' 2>/dev/null || echo "")

# Only intercept Write/Edit
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]] || [ -z "$FILE_PATH" ]; then
    exit 0
fi

# ---------------------------------------------------------------------------
# Primary: Call MCP enforcer helper (config-driven)
# ---------------------------------------------------------------------------
HELPER_PATH="${SCRIPT_DIR}/hook-enforcer-helper.js"
MCP_ALLOWED=""
MCP_REASON=""

# Verify node is available before invoking helper
if [ -f "$HELPER_PATH" ] && command -v node >/dev/null 2>&1; then
    HELPER_INPUT=$(python3 -c "import json,sys; print(json.dumps({'file_path':sys.argv[1],'operation':sys.argv[2],'newContent':sys.argv[3]}))" "$FILE_PATH" "$TOOL_NAME" "$NEW_CONTENT" 2>/dev/null || echo "{}")
    HELPER_OUTPUT=$(echo "$HELPER_INPUT" | node "$HELPER_PATH" 2>/dev/null || echo "{}")
    MCP_ALLOWED=$(echo "$HELPER_OUTPUT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if d.get("allowed",False) else "false")' 2>/dev/null || echo "false")
    MCP_REASON=$(echo "$HELPER_OUTPUT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("reason",""))' 2>/dev/null || echo "")
fi

if [ "$MCP_ALLOWED" = "false" ]; then
    echo ""
    echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
    echo "Operation: ${TOOL_NAME} -> ${FILE_PATH}"
    echo "Block reason: ${MCP_REASON}"
    echo "[BLOCKED] Operation blocked."
    echo "!!!"
    echo ""
    exit 1
fi

if [ "$MCP_ALLOWED" = "true" ]; then
    # MCP helper explicitly allowed; proceed
    exit 0
fi

# ---------------------------------------------------------------------------
# Fallback: MCP helper unavailable — block all Write/Edit
# ---------------------------------------------------------------------------
echo ""
echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
echo "Operation: ${TOOL_NAME} -> ${FILE_PATH}"
echo "Block reason: MCP enforcer helper unavailable or returned no result."
echo "[BLOCKED] All Write/Edit operations require MCP constraint enforcement."
echo "!!!"
echo ""
exit 1
