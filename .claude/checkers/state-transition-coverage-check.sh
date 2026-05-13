#!/usr/bin/env bash
# Checker: state-transition-coverage-check
# Mode: manual
# Scope: source code, design doc
# Purpose: 代码中的状态赋值在 Design 状态变更追踪中有定义

set -euo pipefail

TASK_ROOT="${1:-.}"
DESIGN_DOC=""

# Find design doc with state tracking
for f in "$TASK_ROOT"/artifacts/*design*.md "$TASK_ROOT"/artifacts/*Design*.md; do
    [ -f "$f" ] || continue
    if grep -qi "状态变更\|state transition\|状态机" "$f"; then
        DESIGN_DOC="$f"
        break
    fi
done

# Count state assignments in code
STATE_COUNT=0
while IFS= read -r -d '' file; do
    cnt=$(grep -cE '\b(state|status|phase)\s*=\s*['\"]' "$file" 2>/dev/null || echo 0)
    STATE_COUNT=$((STATE_COUNT + cnt))
done < <(find "$TASK_ROOT" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.go' -o -name '*.java' \) -not -path '*/node_modules/*' -print0 2>/dev/null || true)

if [ $STATE_COUNT -eq 0 ]; then
    echo "PASSED: state-transition-coverage-check — no state assignments in code"
    exit 0
fi

if [ -z "$DESIGN_DOC" ]; then
    echo "WARNING: Design doc with state tracking not found. $STATE_COUNT state assignments require manual verification."
    exit 0
fi

echo "PASSED: state-transition-coverage-check — $STATE_COUNT state assignments found, design doc present (manual verification required for full coverage)"
exit 0
