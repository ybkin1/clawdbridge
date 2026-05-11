#!/usr/bin/env bash
# Checker: route-output-closure-check
# Mode: automated
# Scope: task state, route-projection.yaml
# Purpose: 检测路由输出是否闭合（route-projection.yaml 是否存在且包含必需字段）
# Failure: gate failed (contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查每个任务目录是否有 route-projection.yaml
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")

    # 无 state 文件的历史任务跳过（规范建立前创建的任务）
    state_file="$task_dir/00-task-state.yaml"
    if [ ! -f "$state_file" ]; then
        continue
    fi

    # Trivial 任务可跳过
    if grep -qE 'delivery_mode:\s*(quick|advisory)' "$state_file" 2>/dev/null; then
        continue
    fi

    route_file="$task_dir/artifacts/route-projection.yaml"
    if [ ! -f "$route_file" ]; then
        ERRORS+=("$task_name: 缺少 route-projection.yaml")
        continue
    fi

    # 2. 检查必需字段
    for field in "task_id:" "ownership_route:" "delivery_mode:" "workflow_route:" "execution_orchestration_route:" "review_requirement_route:" "escalation_route:" "routed_at:"; do
        if ! grep -q "$field" "$route_file" 2>/dev/null; then
            ERRORS+=("$task_name: route-projection.yaml 缺少字段 $field")
        fi
    done
done

# 3. 检查 intent_route 和 tool_routing 字段（如果 action_family 非 clarify）
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    route_file="$task_dir/artifacts/route-projection.yaml"
    [ -f "$route_file" ] || continue

    # 如果存在 action_family 且非 clarify，检查 intent_route
    if grep -q "action_family:" "$route_file" 2>/dev/null; then
        action_family=$(grep "action_family:" "$route_file" | sed 's/.*action_family://' | tr -d ' ')
        if [ "$action_family" != "clarify" ] && [ "$action_family" != "" ]; then
            if ! grep -q "intent_route:" "$route_file" 2>/dev/null; then
                ERRORS+=("$task_name: 非 clarify 任务的 route-projection 缺少 intent_route")
            fi
        fi
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: route-output-closure-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: route-output-closure-check — all route projections closed"
exit 0
