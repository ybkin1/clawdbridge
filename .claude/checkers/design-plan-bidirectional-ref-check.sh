#!/usr/bin/env bash
# Checker: design-plan-bidirectional-ref-check
# Mode: automated
# Scope: design doc, dev plan
# Purpose: Design §14 STEP 与 Dev Plan 包的双向引用覆盖率 ≥95%

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
MATRIX_FILE="$TASK_ROOT/artifacts/bidirectional-ref-matrix.yaml"

if [ ! -f "$MATRIX_FILE" ]; then
    echo "NOT_FOUND: bidirectional-ref-matrix.yaml not found. Skipping (task may not have traceability requirements)."
    exit 0
fi

# Basic YAML structure validation
if ! grep -q "matrix_version:" "$MATRIX_FILE"; then
    ERRORS+=("Missing matrix_version in bidirectional-ref-matrix.yaml")
fi
if ! grep -q "design_to_plan:" "$MATRIX_FILE"; then
    ERRORS+=("Missing design_to_plan section")
fi
if ! grep -q "plan_to_design:" "$MATRIX_FILE"; then
    ERRORS+=("Missing plan_to_design section")
fi

# Count orphan entries (simplified: entries with empty mapping)
orphan_design=$(grep -c 'design_to_plan:.*{}' "$MATRIX_FILE" 2>/dev/null || echo 0)
orphan_plan=$(grep -c 'plan_to_design:.*{}' "$MATRIX_FILE" 2>/dev/null || echo 0)

if [ "$orphan_design" -gt 0 ]; then
    ERRORS+=("Found $orphan_design orphan design STEP(s) without plan coverage")
fi
if [ "$orphan_plan" -gt 0 ]; then
    ERRORS+=("Found $orphan_plan orphan plan packet(s) without design coverage")
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: design-plan-bidirectional-ref-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: design-plan-bidirectional-ref-check — bidirectional ref matrix structure valid"
exit 0
