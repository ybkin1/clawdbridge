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
BASH_COMMAND=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("command",""))' 2>/dev/null || echo "")

HELPER_PATH="${SCRIPT_DIR}/hook-enforcer-helper.js"
ROLE="${AGENT_ROLE:-}"

# ---------------------------------------------------------------------------
# Helper function: call MCP enforcer helper for a given file path
# ---------------------------------------------------------------------------
call_helper() {
    local target_path="$1"
    local operation="$2"
    local content="$3"
    local helper_role="$4"

    if [ ! -f "$HELPER_PATH" ] || ! command -v node >/dev/null 2>&1; then
        echo "unavailable"
        return
    fi

    local helper_input
    helper_input=$(python3 -c "import json,sys; print(json.dumps({'file_path':sys.argv[1],'operation':sys.argv[2],'newContent':sys.argv[3],'role':sys.argv[4]}))" "$target_path" "$operation" "$content" "$helper_role" 2>/dev/null || echo "{}")
    local helper_output
    helper_output=$(echo "$helper_input" | node "$HELPER_PATH" 2>/dev/null || echo "{}")
    local allowed
    allowed=$(echo "$helper_output" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if d.get("allowed",False) else "false")' 2>/dev/null || echo "false")
    if [ "$allowed" = "false" ]; then
        local reason
        reason=$(echo "$helper_output" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("reason",""))' 2>/dev/null || echo "")
        echo "blocked|$reason"
    else
        echo "allowed"
    fi
}

# ---------------------------------------------------------------------------
# 1. Write/Edit interception
# ---------------------------------------------------------------------------
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]] && [ -n "$FILE_PATH" ]; then
    RESULT=$(call_helper "$FILE_PATH" "$TOOL_NAME" "$NEW_CONTENT" "$ROLE")
    if [ "$RESULT" = "unavailable" ]; then
        echo ""
        echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        echo "Operation: ${TOOL_NAME} -> ${FILE_PATH}"
        echo "Block reason: MCP enforcer helper unavailable or returned no result."
        echo "[BLOCKED] All Write/Edit operations require MCP constraint enforcement."
        echo "!!!"
        echo ""
        exit 1
    fi
    if echo "$RESULT" | grep -q "^blocked|"; then
        REASON=$(echo "$RESULT" | cut -d'|' -f2-)
        echo ""
        echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        echo "Operation: ${TOOL_NAME} -> ${FILE_PATH}"
        echo "Block reason: ${REASON}"
        echo "[BLOCKED] Operation blocked."
        echo "!!!"
        echo ""
        exit 1
    fi
    # allowed
    exit 0
fi

# ---------------------------------------------------------------------------
# 2. Bash redirection detection (P0-2 fix)
# ---------------------------------------------------------------------------
if [[ "$TOOL_NAME" == "Bash" ]] && [ -n "$BASH_COMMAND" ]; then
    # Extract redirect targets from bash command
    REDIRECT_TARGETS=$(echo "$BASH_COMMAND" | python3 -c '
import sys, re, json
cmd = sys.stdin.read()
targets = set()
# Match >file, >> file, 2>file, &>file, etc.
for m in re.finditer(r"\d*\s*[>][&>]?\s*(\S+)", cmd):
    targets.add(m.group(1))
# Match | tee file, | tee -a file
for m in re.finditer(r"\|\s*tee\s+(?:-[a-z]+\s+)?(\S+)", cmd):
    targets.add(m.group(1))
# Filter out safe targets
filtered = [t for t in targets if not t.startswith("/dev/") and not t.startswith("-") and not t.startswith(">")]
print(json.dumps(filtered))
' 2>/dev/null || echo "[]")

    HAS_BLOCKED="false"
    BLOCK_REASON=""
    BLOCK_TARGET=""

    for target in $(echo "$REDIRECT_TARGETS" | python3 -c 'import sys,json; arr=json.load(sys.stdin); print("\n".join(arr))' 2>/dev/null); do
        if [ -z "$target" ]; then continue; fi
        RESULT=$(call_helper "$target" "Write" "" "$ROLE")
        if [ "$RESULT" = "unavailable" ]; then
            HAS_BLOCKED="true"
            BLOCK_REASON="MCP enforcer helper unavailable."
            BLOCK_TARGET="$target"
            break
        fi
        if echo "$RESULT" | grep -q "^blocked|"; then
            HAS_BLOCKED="true"
            BLOCK_REASON=$(echo "$RESULT" | cut -d'|' -f2-)
            BLOCK_TARGET="$target"
            break
        fi
    done

    if [ "$HAS_BLOCKED" = "true" ]; then
        echo ""
        echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        echo "Operation: Bash -> ${BASH_COMMAND}"
        echo "Redirect target: ${BLOCK_TARGET}"
        echo "Block reason: ${BLOCK_REASON}"
        echo "[BLOCKED] Bash redirect blocked."
        echo "!!!"
        echo ""
        exit 1
    fi
fi

# All other tools: allow
exit 0
