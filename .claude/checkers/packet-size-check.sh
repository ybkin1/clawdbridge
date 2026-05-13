#!/usr/bin/env bash
# Checker: packet-size-check
# Mode: automated
# Scope: code files, dev plan
# Purpose: 每个包有效代码 ≤50 行或声明 oversized_justified

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
PACKET_FILE="$TASK_ROOT/.claude/tasks/*/work-packets.yaml"

# Find work packets definition
found=0
for f in $TASK_ROOT/.claude/tasks/*/work-packets.yaml; do
    [ -f "$f" ] || continue
    found=1
    # Check each packet max_lines
    while IFS= read -r line; do
        if echo "$line" | grep -q "max_lines:"; then
            val=$(echo "$line" | sed 's/.*max_lines:\s*//')
            if [ "$val" -gt 50 ] 2>/dev/null; then
                # Check for oversized_justified
                packet_ctx=$(grep -B5 -A2 "$line" "$f" || true)
                if ! echo "$packet_ctx" | grep -q "oversized_justified"; then
                    ERRORS+=("Packet max_lines=$val > 50 without oversized_justified: $f")
                fi
            fi
        fi
    done < "$f"
done

if [ $found -eq 0 ]; then
    echo "NOT_FOUND: No work-packets.yaml found. Skipping."
    exit 0
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: packet-size-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: packet-size-check — all packets within size limits or justified"
exit 0
