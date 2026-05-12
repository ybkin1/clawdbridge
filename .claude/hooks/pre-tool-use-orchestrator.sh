#!/usr/bin/env bash
# pre-tool-use-orchestrator.sh — Phase 1: Precise blocking (sensitive-file-level)
# Phase 2+ simplified: outputs MCP tool suggestions instead of auto-running checkers
#
# Blocking policy:
#   - Write/Edit to 00-task-state.yaml with phase_status: passed/archived  -> BLOCK
#   - Write/Edit to 00-task-state.yaml with closeout_allowed: true         -> BLOCK
#   - Write to evidence-lock-*.yaml                                         -> BLOCK
#   - Write to checkers/*.yaml (checker results)                            -> BLOCK
#   - Write to reviews/receipt-*.yaml                                       -> BLOCK
#   - All other operations (Read, Grep, Glob, code edits)                   -> PASS
#
# On block: outputs MCP tool fix suggestions, then exits 1.

set -euo pipefail

# Capture stdin
STDIN=$(cat)

# Parse tool info from stdin
TOOL_NAME=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_name",""))' 2>/dev/null || echo "")
FILE_PATH=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("file_path",""))' 2>/dev/null || echo "")
NEW_CONTENT=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); ti=d.get("tool_input",{}); print(ti.get("content",ti.get("new_string","")))' 2>/dev/null || echo "")

# Normalize path
NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# Determine if blocking is needed
SHOULD_BLOCK=false
BLOCK_REASON=""

if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]] && [ -n "$NORM_PATH" ]; then
    # Phase transition attempt
    if echo "$NORM_PATH" | grep -qE '00-task-state\.yaml$'; then
        if echo "$NEW_CONTENT" | grep -qE 'phase_status\s*:\s*(passed|archived)'; then
            SHOULD_BLOCK=true
            BLOCK_REASON="phase_transition"
        fi
        if echo "$NEW_CONTENT" | grep -qE 'closeout_allowed\s*:\s*true'; then
            SHOULD_BLOCK=true
            BLOCK_REASON="closeout"
        fi
    fi

    # Evidence lock write
    if echo "$NORM_PATH" | grep -qE 'evidence-lock-.*\.yaml$'; then
        SHOULD_BLOCK=true
        BLOCK_REASON="evidence_lock"
    fi

    # Checker result write (exclude evidence-lock files)
    if echo "$NORM_PATH" | grep -qE 'checkers/[^/]+\.yaml$' && ! echo "$NORM_PATH" | grep -qE 'evidence-lock'; then
        SHOULD_BLOCK=true
        BLOCK_REASON="checker_result"
    fi

    # Receipt write
    if echo "$NORM_PATH" | grep -qE 'reviews/receipt-.*\.yaml$'; then
        SHOULD_BLOCK=true
        BLOCK_REASON="receipt"
    fi
fi

# If not a blocking operation, exit cleanly
[ "$SHOULD_BLOCK" = false ] && exit 0

# Sensitive operation detected: run checker reminder + output MCP suggestions
echo ""
echo "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
echo "Operation: ${TOOL_NAME} -> ${FILE_PATH}"
echo "Block reason: ${BLOCK_REASON}"
echo "-------------------------------------------"

# Run checker reminder
REMINDER_SCRIPT="${PWD}/.claude/hooks/checker-reminder.sh"
if [ ! -f "$REMINDER_SCRIPT" ]; then
    echo "[WARNING] checker-reminder.sh not found. Cannot verify mechanical gaps."
    echo "[BLOCKED] Conservative block applied."
    echo "!!!"
    echo ""
    exit 1
fi

REMINDER_OUTPUT=$(echo "$STDIN" | bash "$REMINDER_SCRIPT" 2>/dev/null || echo "")

if ! echo "$REMINDER_OUTPUT" | grep -q "MECHANICAL GAP DETECTED"; then
    echo "[PASS] No mechanical gaps detected. Proceeding."
    echo "!!!"
    echo ""
    exit 0
fi

echo "$REMINDER_OUTPUT"

# Output MCP tool suggestions
echo ""
echo "[MCP FIX SUGGESTION] You can resolve gaps by calling the constraint-enforcer MCP tools:"
echo "  1. check_phase_readiness    — identify all mechanical gaps"
echo "  2. run_mandatory_checkers   — auto-run missing checkers"
echo "  3. generate_evidence_lock   — lock evidence for current phase"
echo "  4. request_phase_transition — validate and perform phase transition"
echo "-------------------------------------------"

echo ""
echo "[BLOCKED] Operation blocked due to unresolved mechanical gaps."
echo "Fix remaining issues (via MCP tools above) and retry the ${TOOL_NAME} operation."
echo "!!!"
echo ""

exit 1
