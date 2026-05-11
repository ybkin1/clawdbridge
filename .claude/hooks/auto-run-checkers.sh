#!/usr/bin/env bash
# auto-run-checkers.sh — Phase 2: Auto-run missing mandatory checkers
# Automatically detects missing checker results and runs/generates them.
# Generates standard checker_result.yaml per verification-checker.md schema.

set -euo pipefail

TASK_DIR="${1:-}"
CHECKER_FILTER="${2:-}"

# Resolve task directory
if [ -z "$TASK_DIR" ]; then
    TASKS_DIR="${PWD}/.claude/tasks"
    [ -d "$TASKS_DIR" ] || { echo "[AUTO-CHECKER] No .claude/tasks directory found."; exit 0; }

    ACTIVE_TASK=$(find "$TASKS_DIR" -maxdepth 1 -type d -name 'tk-*' | while read -r dir; do
        sf="${dir}/00-task-state.yaml"
        if [ -f "$sf" ]; then
            mtime=$(stat -c %Y "$sf" 2>/dev/null || stat -f %m "$sf" 2>/dev/null)
            echo "${mtime}|${dir}"
        fi
    done | sort -t'|' -k1 -nr | head -1 | cut -d'|' -f2)

    [ -z "$ACTIVE_TASK" ] && { echo "[AUTO-CHECKER] No active task found."; exit 0; }
    TASK_DIR="$ACTIVE_TASK"
fi

TASK_ID=$(basename "$TASK_DIR")
ROUTE_FILE="${TASK_DIR}/route-projection.yaml"

[ -f "$ROUTE_FILE" ] || { echo "[AUTO-CHECKER] No route-projection.yaml found for task ${TASK_ID}. Skipping."; exit 0; }

# Extract mandatory_checkers from route-projection
MANDATORY=$(python3 -c "
import yaml
with open('${ROUTE_FILE}') as f:
    data = yaml.safe_load(f)
mc = data.get('mandatory_checkers', [])
print(','.join(str(c) for c in mc))
" 2>/dev/null || echo "")

[ -n "$MANDATORY" ] || { echo "[AUTO-CHECKER] No mandatory_checkers defined for task ${TASK_ID}. Skipping."; exit 0; }

# Apply filter if specified
if [ -n "$CHECKER_FILTER" ]; then
    FILTERED=""
    IFS=',' read -ra ALL_CHECKERS <<< "$MANDATORY"
    IFS=',' read -ra FILTER_SET <<< "$CHECKER_FILTER"
    for c in "${ALL_CHECKERS[@]}"; do
        c=$(echo "$c" | tr -d ' "'"'" )
        for f in "${FILTER_SET[@]}"; do
            f=$(echo "$f" | tr -d ' "'"'" )
            [ "$c" = "$f" ] && { FILTERED="${FILTERED},${c}"; break; }
        done
    done
    MANDATORY="${FILTERED#,}"
fi

CHECKER_ROOT="${PWD}/.claude/checkers"
TASK_CHECKER_DIR="${TASK_DIR}/checkers"
[ -d "$TASK_CHECKER_DIR" ] || mkdir -p "$TASK_CHECKER_DIR"

RUN_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS=()

IFS=',' read -ra CHECKERS <<< "$MANDATORY"
for CHECKER_ID in "${CHECKERS[@]}"; do
    CHECKER_ID=$(echo "$CHECKER_ID" | tr -d ' "'"'" )
    [ -z "$CHECKER_ID" ] && continue

    # Skip if already has a result file
    if [ -d "$TASK_CHECKER_DIR" ] && [ -n "$(find "$TASK_CHECKER_DIR" -maxdepth 1 -name "*${CHECKER_ID}*" -print -quit 2>/dev/null)" ]; then
        EXISTING=$(find "$TASK_CHECKER_DIR" -maxdepth 1 -name "*${CHECKER_ID}*" | head -1)
        RESULTS+=("[SKIP] ${CHECKER_ID} - already has result: $(basename "$EXISTING")")
        continue
    fi

    # Locate checker script
    SCRIPT_PATH="${CHECKER_ROOT}/${CHECKER_ID}.sh"
    [ -f "$SCRIPT_PATH" ] || SCRIPT_PATH="${CHECKER_ROOT}/${CHECKER_ID}.ps1"

    RUN_ID="${CHECKER_ID}-${RUN_TIMESTAMP}"
    RESULT_FILE="${TASK_CHECKER_DIR}/${RUN_ID}.yaml"

    if [ ! -f "$SCRIPT_PATH" ]; then
        # Placeholder checker: generate manual_pending result
        cat > "$RESULT_FILE" <<YAML
checker_run_id: "${RUN_ID}"
checker_id: "${CHECKER_ID}"
task_id: "${TASK_ID}"
run_at: "$(date -Iseconds)"
mode: manual
status: manual_pending
target_ref: "${TASK_DIR}"
summary: "Checker script not found: ${CHECKER_ID}"
evidence_ref: ""
gate_binding: ""
failure_detail:
  affected_gate: ""
  severity: ""
  description: "Checker implementation is placeholder. Manual verification required."
  remediation_hint: "Implement ${CHECKER_ID}.sh or provide manual evidence."
manual_evidence:
  method: "pending"
  result: ""
  evidence_path: ""
  reviewed_by: ""
legacy_text_output: ""
YAML
        RESULTS+=("[PENDING] ${CHECKER_ID} - script not found, manual_pending result created at checkers/${RUN_ID}.yaml")
        continue
    fi

    # Run checker script
    echo "[RUN] Executing ${CHECKER_ID} ..."
    set +e
    OUTPUT=$(bash "$SCRIPT_PATH" "$PWD" 2>&1)
    EXIT_CODE=$?
    set -e

    if echo "$OUTPUT" | grep -q "PASSED"; then
        STATUS="passed"
    else
        STATUS="failed"
    fi

    # Escape output for YAML
    ESCAPED_OUTPUT=$(echo "$OUTPUT" | sed 's/^/  /')

    cat > "$RESULT_FILE" <<YAML
checker_run_id: "${RUN_ID}"
checker_id: "${CHECKER_ID}"
task_id: "${TASK_ID}"
run_at: "$(date -Iseconds)"
mode: automated
status: ${STATUS}
target_ref: "${TASK_DIR}"
summary: "Auto-run by pre-tool-use-orchestrator"
evidence_ref: "checkers/${RUN_ID}.yaml"
gate_binding: ""
failure_detail:
  affected_gate: ""
  severity: ""
  description: ""
  remediation_hint: ""
manual_evidence:
  method: ""
  result: ""
  evidence_path: ""
  reviewed_by: ""
legacy_text_output: |
${ESCAPED_OUTPUT}
YAML

    RESULTS+=("[${STATUS}] ${CHECKER_ID} - result written to checkers/${RUN_ID}.yaml")
done

echo ""
echo "========== Auto-Checker Summary =========="
if [ ${#RESULTS[@]} -eq 0 ]; then
    echo "No checkers needed to run."
else
    for r in "${RESULTS[@]}"; do
        echo "$r"
    done
fi
echo "=========================================="

exit 0
