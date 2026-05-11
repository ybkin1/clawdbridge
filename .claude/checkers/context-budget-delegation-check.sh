#!/usr/bin/env bash
# Checker: context-budget-delegation-check
# Mode: automated
# Scope: context compaction receipts, 00-task-state.yaml
# Purpose: 检测上下文预算超标时是否有委派证据（子Agent委派或checkpoint）
# Failure: gate failed (professional gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查 compaction-receipt.yaml 是否完整
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    receipt_file="$task_dir/artifacts/compaction-receipt.yaml"

    # 如果 state 中声明了 compaction，必须有 receipt
    state_file="$task_dir/00-task-state.yaml"
    if [ -f "$state_file" ]; then
        if grep -q "compaction" "$state_file" 2>/dev/null || grep -q "context_budget_percent_estimate:" "$state_file" 2>/dev/null; then
            budget=$(grep "context_budget_percent_estimate:" "$state_file" | sed 's/.*://' | tr -d ' ' || true)
            if [ -n "$budget" ] && [ "$budget" != "0" ]; then
                # 如果预算 > 70%，必须有 compaction receipt 或 checkpoint
                if [ "${budget%.*}" -ge 70 ] 2>/dev/null; then
                    if [ ! -f "$receipt_file" ] && [ ! -f "$task_dir/artifacts/checkpoint.md" ]; then
                        ERRORS+=("$task_name: 上下文预算 $budget% 但缺少 compaction receipt 或 checkpoint")
                    fi
                fi
            fi
        fi
    fi
done

# 2. 检查 compaction receipt 的必需字段
for receipt in "$TASK_ROOT"/.claude/tasks/*/artifacts/compaction-receipt.yaml; do
    [ -f "$receipt" ] || continue
    task_name=$(basename "$(dirname "$(dirname "$receipt")")")

    for field in "trigger_level:" "trigger_reason:" "compaction_actions:" "preserved_truth_refs:" "resume_anchor:" "recorded_at:"; do
        if ! grep -q "$field" "$receipt" 2>/dev/null; then
            ERRORS+=("$task_name: compaction-receipt.yaml 缺少字段 $field")
        fi
    done
done

# 3. 检查 execution_orchestration_route=mandatory_multi_agent 时是否有 delegation plan
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    route_file="$task_dir/artifacts/route-projection.yaml"
    [ -f "$route_file" ] || continue

    if grep -q "execution_orchestration_route: mandatory_multi_agent" "$route_file" 2>/dev/null; then
        if [ ! -f "$task_dir/artifacts/delegation-plan.yaml" ]; then
            ERRORS+=("$task_name: mandatory_multi_agent 但缺少 delegation-plan.yaml")
        fi
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: context-budget-delegation-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: context-budget-delegation-check — budget delegation evidence complete"
exit 0
