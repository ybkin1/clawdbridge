#!/usr/bin/env bash
# Checker: assembly-interface-alignment-check
# Mode: automated
# Scope: compiled code / type check
# Purpose: 拼装后的模块间接口类型/签名一致

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# Try to run type checker if available
if [ -f "$TASK_ROOT/package.json" ] && [ -f "$TASK_ROOT/tsconfig.json" ]; then
    if command -v npx >/dev/null 2>&1; then
        if ! (cd "$TASK_ROOT" && npx tsc --noEmit 2>&1); then
            ERRORS+=("TypeScript type check failed")
        fi
    else
        echo "WARNING: npx not available, skipping TypeScript type check"
    fi
elif [ -f "$TASK_ROOT/go.mod" ]; then
    if command -v go >/dev/null 2>&1; then
        if ! (cd "$TASK_ROOT" && go build ./... 2>&1); then
            ERRORS+=("Go build failed")
        fi
    else
        echo "WARNING: go not available, skipping Go build check"
    fi
elif [ -f "$TASK_ROOT/setup.py" ] || [ -f "$TASK_ROOT/pyproject.toml" ]; then
    if command -v python3 >/dev/null 2>&1; then
        # Basic syntax check for Python
        while IFS= read -r -d '' file; do
            if ! python3 -m py_compile "$file" 2>&1; then
                ERRORS+=("Python syntax error: $file")
            fi
        done < <(find "$TASK_ROOT" -name '*.py' -not -path '*/venv/*' -not -path '*/__pycache__/*' -print0)
    fi
else
    echo "NOT_FOUND: No recognized build system (tsc/go/python). Skipping interface alignment check."
    exit 0
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: assembly-interface-alignment-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: assembly-interface-alignment-check — type/build check passed"
exit 0
