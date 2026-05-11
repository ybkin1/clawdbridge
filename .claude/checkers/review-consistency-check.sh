#!/usr/bin/env bash
# Checker: review-consistency-check
# Mode: hybrid
# Scope: review-bundles/, reviews/, state files
# Purpose: 检测评审一致性（state/review pack/provenance/report 不自相矛盾）
# Failure: gate failed (contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
WARNINGS=()

# 1. 检查 review receipt 的必需字段
for receipt in "$TASK_ROOT"/.claude/tasks/*/reviews/*/receipt.yaml; do
    [ -f "$receipt" ] || continue
    task_name=$(basename "$(dirname "$(dirname "$receipt")")")

    for field in "review_id:" "task_id:" "gate_type:" "verdict:" "review_date:" "round:"; do
        if ! grep -q "$field" "$receipt" 2>/dev/null; then
            ERRORS+=("$task_name: receipt.yaml 缺少字段 $field")
        fi
    done

    # 检查 verdict 值是否有效
    verdict=$(grep "verdict:" "$receipt" | sed 's/.*verdict://' | tr -d ' "' || true)
    if [ -n "$verdict" ]; then
        case "$verdict" in
            passed|request_changes|blocked|contract_not_closed) ;;
            *) ERRORS+=("$task_name: receipt 包含无效 verdict: $verdict") ;;
        esac
    fi
done

# 2. 检查 review report 是否被 receipt 引用
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    reviews_dir="$task_dir/reviews"
    [ -d "$reviews_dir" ] || continue

    for report in "$reviews_dir"/*/*-report.md; do
        [ -f "$report" ] || continue
        report_name=$(basename "$report")
        # 检查是否有对应的 receipt 引用此 report
        if ! grep -r "$report_name" "$reviews_dir"/*.yaml 2>/dev/null | grep -q "report_path:"; then
            WARNINGS+=("$task_name: report $report_name 未被任何 receipt 显式引用")
        fi
    done
done

# 3. 检查 review bundle 结构完整性
for bundle_dir in "$TASK_ROOT"/.claude/tasks/*/review-bundles/*/; do
    [ -d "$bundle_dir" ] || continue
    task_name=$(basename "$(dirname "$(dirname "$bundle_dir")")")
    bundle_name=$(basename "$bundle_dir")

    for required in "README.md" "00-user-intent.md" "01-truth-sources.md" "02-review-rubric.yaml" "03-hard-fail-rules.yaml" "04-scope-boundary.md"; do
        if [ ! -f "$bundle_dir/$required" ]; then
            ERRORS+=("$task_name/$bundle_name: 缺少必需文件 $required")
        fi
    done
done

# 4. 检查 same_class_streak >= 3 时是否已 blocked
for receipt in "$TASK_ROOT"/.claude/tasks/*/reviews/*/receipt.yaml; do
    [ -f "$receipt" ] || continue
    task_name=$(basename "$(dirname "$(dirname "$receipt")")")

    streak=$(grep "attempts_in_streak:" "$receipt" | sed 's/.*://' | tr -d ' ' || true)
    verdict=$(grep "verdict:" "$receipt" | sed 's/.*verdict://' | tr -d ' "' || true)

    if [ -n "$streak" ] && [ "$streak" != "" ] && [ "${streak%.*}" -ge 3 ] 2>/dev/null; then
        if [ "$verdict" != "blocked" ]; then
            ERRORS+=("$task_name: same_class_streak=$streak >=3 但 verdict 不是 blocked ($verdict)")
        fi
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: review-consistency-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "WARNINGS: review-consistency-check"
    for w in "${WARNINGS[@]}"; do
        echo "  WARNING: $w"
    done
fi

if [ ${#ERRORS[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo "PASSED: review-consistency-check — review artifacts consistent"
    exit 0
elif [ ${#ERRORS[@]} -eq 0 ]; then
    echo "PASSED (with warnings): review-consistency-check"
    exit 0
else
    exit 1
fi
