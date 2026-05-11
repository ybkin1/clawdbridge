#!/usr/bin/env bash
# checker-reminder.sh — PreToolUse hook: mechanical gap reminder (Linux/bash version)
# Purpose: Check active task state before sensitive Write/Edit operations.
# Non-blocking: outputs text to agent context only.

set -euo pipefail

# Consume stdin (do NOT block the hook pipeline)
STDIN=$(cat)

# Resolve task directory from cwd (passed in stdin or fallback to PWD)
CWD=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("cwd", ""))' 2>/dev/null || echo "")
[ -z "$CWD" ] && CWD="$PWD"

TASKS_DIR="${CWD}/.claude/tasks"
[ -d "$TASKS_DIR" ] || exit 0

# Find the most recently modified active task
ACTIVE_TASK=$(find "$TASKS_DIR" -maxdepth 1 -type d -name 'tk-*' | while read -r dir; do
    sf="${dir}/00-task-state.yaml"
    if [ -f "$sf" ]; then
        mtime=$(stat -c %Y "$sf" 2>/dev/null || stat -f %m "$sf" 2>/dev/null)
        echo "${mtime}|${dir}"
    fi
done | sort -t'|' -k1 -nr | head -1 | cut -d'|' -f2)

[ -z "$ACTIVE_TASK" ] && exit 0

TASK_ID=$(basename "$ACTIVE_TASK")
STATE_FILE="${ACTIVE_TASK}/00-task-state.yaml"
[ -f "$STATE_FILE" ] || exit 0

# Extract key fields using Python (robust YAML parsing)
read -r PHASE PHASE_STATUS CLOSEOUT <<EOF
$(python3 -c "
import yaml
with open('${STATE_FILE}') as f:
    data = yaml.safe_load(f)
print(data.get('phase',''), data.get('phase_status',''), data.get('closeout_allowed',''))
")
EOF

# Only remind when task is actively in progress
[[ "$PHASE_STATUS" != "in_progress" && "$PHASE_STATUS" != "in_review" ]] && exit 0
[ "$CLOSEOUT" = "true" ] && exit 0

GAPS=()

# 1. Check for unresolved blockers
BLOCKER=$(python3 -c "
import yaml
with open('${STATE_FILE}') as f:
    data = yaml.safe_load(f)
print(data.get('last_blocker_report',''))
" 2>/dev/null || echo "")
[ -n "$BLOCKER" ] && [ "$BLOCKER" != '""' ] && [ "$BLOCKER" != "null" ] && GAPS+=("Unresolved blocker report exists")

# 2. Check gate results for failures
if grep -q "status: failed" "$STATE_FILE" 2>/dev/null; then
    GAPS+=("Gate result contains FAILED status")
fi

# 3. Check mandatory checkers via route-projection
ROUTE_FILE="${ACTIVE_TASK}/route-projection.yaml"
if [ -f "$ROUTE_FILE" ]; then
    MANDATORY=$(python3 -c "
import yaml
with open('${ROUTE_FILE}') as f:
    data = yaml.safe_load(f)
mc = data.get('mandatory_checkers', [])
print(','.join(str(c) for c in mc))
" 2>/dev/null || echo "")

    if [ -n "$MANDATORY" ]; then
        IFS=',' read -ra CHECKERS <<< "$MANDATORY"
        CHECKER_DIR="${ACTIVE_TASK}/checkers"
        for c in "${CHECKERS[@]}"; do
            c=$(echo "$c" | tr -d ' "'"'" )
            [ -z "$c" ] && continue
            if [ ! -d "$CHECKER_DIR" ] || [ -z "$(find "$CHECKER_DIR" -maxdepth 1 -name "*${c}*" -print -quit 2>/dev/null)" ]; then
                GAPS+=("Mandatory checker not run: $c")
            fi
        done
    fi
fi

# 4. Check evidence lock
EV_LOCK="${ACTIVE_TASK}/checkers/evidence-lock-${PHASE}.yaml"
[ ! -f "$EV_LOCK" ] && [ "$PHASE" != "clarify" ] && GAPS+=("Evidence lock missing: checkers/evidence-lock-${PHASE}.yaml")

# Output reminder if gaps found
if [ ${#GAPS[@]} -gt 0 ]; then
    echo ""
    echo "!!! MECHANICAL GAP DETECTED - Task ${TASK_ID} !!!"
    echo "Phase: ${PHASE} | Status: ${PHASE_STATUS}"
    echo "----------------------------------------"
    for g in "${GAPS[@]}"; do
        echo "  [GAP] $g"
    done
    echo "----------------------------------------"
    echo "Phase transition is BLOCKED until all gaps resolved."
    echo "See task-tracking-workflow-spec.md section 4.2 and 4.5."
    echo "!!!"
    echo ""
fi

exit 0
