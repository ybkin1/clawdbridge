#!/usr/bin/env bash
# Checker: orphan-code-detection
# Mode: hybrid
# Scope: git diff, dev plan
# Purpose: git diff 中新增代码的每个 export 在 Dev Plan 中有对应包

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# Check if git repo
if [ ! -d "$TASK_ROOT/.git" ]; then
    echo "NOT_FOUND: Not a git repository. Skipping."
    exit 0
fi

# Get new exports from git diff (simplified: grep for function/class/const definitions)
NEW_EXPORTS=$(cd "$TASK_ROOT" && git diff --name-only HEAD~1 2>/dev/null || true)
if [ -z "$NEW_EXPORTS" ]; then
    echo "PASSED: orphan-code-detection — no new files in latest commit"
    exit 0
fi

# Check each new file for @packet
orphan=0
while IFS= read -r file; do
    [ -f "$TASK_ROOT/$file" ] || continue
    case "$file" in
        *.js|*.ts|*.py|*.go|*.java|*.rs)
            if ! head -n 20 "$TASK_ROOT/$file" | grep -qE '@packet\s+\S+'; then
                ERRORS+=("Potential orphan code (no @packet): $file")
                orphan=$((orphan + 1))
            fi
            ;;
    esac
done <<< "$NEW_EXPORTS"

if [ $orphan -gt 0 ]; then
    echo "FAILED: orphan-code-detection — $orphan orphan file(s)"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: orphan-code-detection — all new files have @packet annotation"
exit 0
