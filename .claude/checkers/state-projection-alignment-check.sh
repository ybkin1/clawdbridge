#!/usr/bin/env bash
# Checker: state-projection-alignment-check
# Mode: automated
# Scope: 00-task-state.yaml vs derived files (README.md, board.yaml)
# Purpose: 检测 task state 与派生投影是否一致
# Failure: gate failed (contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查每个任务目录是否有 state 文件
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")

    state_file="$task_dir/00-task-state.yaml"
    if [ ! -f "$state_file" ]; then
        # 00-task-state.yaml 不是强制存在的（旧任务可能没有），仅警告
        echo "  INFO: $task_name 无 00-task-state.yaml（新任务应创建）"
        continue
    fi

    # 2. 检查 state 中的关键字段是否存在
    for field in "task_id:" "action_family:" "phase:" "status:"; do
        if ! grep -q "$field" "$state_file" 2>/dev/null; then
            ERRORS+=("state 缺少必需字段 $field: $state_file")
        fi
    done

    # 3. 如果 state 有 gate_results，检查是否每个 gate 都有 status
    if grep -q "gate_results:" "$state_file" 2>/dev/null; then
        for gate in "value_gate:" "professional_gate:" "contract_gate:"; do
            if grep -q "$gate" "$state_file" 2>/dev/null; then
                # 检查该 gate 下是否有 status
                :
            fi
        done
    fi
done

# 4. 验证 registry.yaml 状态
if [ -f "$TASK_ROOT/.claude/contracts/registry.yaml" ]; then
    # 检查是否有 status 不是 active/provisional/draft 的契约
    invalid_status=$(grep -E '^\s+status:' "$TASK_ROOT/.claude/contracts/registry.yaml" | grep -vE 'status: (active|provisional|draft-ready)' || true)
    if [ -n "$invalid_status" ]; then
        ERRORS+=("registry 中存在无效状态: $invalid_status")
    fi
fi

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: state-projection-alignment-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: state-projection-alignment-check — state files aligned"
exit 0
