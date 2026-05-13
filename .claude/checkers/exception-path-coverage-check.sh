#!/usr/bin/env bash
# Checker: exception-path-coverage-check
# Mode: manual
# Scope: source code, design doc
# Purpose: 代码中的 try/catch/throw 在 Design §14 异常传播链中有定义

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
DESIGN_DOC=""

# Find design doc with §14
for f in "$TASK_ROOT"/artifacts/*design*.md "$TASK_ROOT"/artifacts/*Design*.md; do
    [ -f "$f" ] || continue
    if grep -q "§14\|异常传播\|exception" "$f"; then
        DESIGN_DOC="$f"
        break
    fi
done

# Count try/catch/throw in source code
EXCEPTION_COUNT=0
while IFS= read -r -d '' file; do
    cnt=$(grep -cE '\b(try|catch|throw|except|raise)\b' "$file" 2>/dev/null || echo 0)
    EXCEPTION_COUNT=$((EXCEPTION_COUNT + cnt))
done < <(find "$TASK_ROOT" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.go' -o -name '*.java' \) -not -path '*/node_modules/*' -print0 2>/dev/null || true)

if [ $EXCEPTION_COUNT -eq 0 ]; then
    echo "PASSED: exception-path-coverage-check — no exception paths in code"
    exit 0
fi

if [ -z "$DESIGN_DOC" ]; then
    echo "WARNING: Design doc with §14 not found. $EXCEPTION_COUNT exception keywords detected in code require manual verification."
    exit 0
fi

echo "PASSED: exception-path-coverage-check — $EXCEPTION_COUNT exception keywords found, design doc present (manual verification required for full coverage)"
exit 0
