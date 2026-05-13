#!/usr/bin/env bash
# Checker: code-packet-annotation-check
# Mode: automated
# Scope: source code
# Purpose: 每个代码文件头部有 @packet <id> 注释

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
COUNT=0
MISSING=0

# Scan source code files (excluding config/data files)
while IFS= read -r -d '' file; do
    COUNT=$((COUNT + 1))
    # Check first 20 lines for @packet
    if ! head -n 20 "$file" | grep -qE '@packet\s+\S+'; then
        ERRORS+=("Missing @packet annotation: $file")
        MISSING=$((MISSING + 1))
    fi
done < <(find "$TASK_ROOT" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.rs' \) -not -path '*/node_modules/*' -not -path '*/.git/*' -print0 2>/dev/null || true)

if [ $COUNT -eq 0 ]; then
    echo "NOT_FOUND: No source code files found. Skipping."
    exit 0
fi

if [ $MISSING -gt 0 ]; then
    echo "FAILED: code-packet-annotation-check ($MISSING/$COUNT files missing @packet)"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: code-packet-annotation-check — $COUNT files have @packet annotation"
exit 0
