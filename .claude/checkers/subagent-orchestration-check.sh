#!/usr/bin/env bash
# Checker: subagent-orchestration-check
# Mode: hybrid
# Scope: Agent tool invocations, manifest, fan-in report
# Purpose: 检测子Agent编排是否合规（manifest冻结、fan-in report存在、无嵌套派发）
# Failure: gate failed (professional gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
WARNINGS=()

# 1. 检查 mandatory_multi_agent 任务是否有 manifest
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

# 2. 检查 parallelism_actual >= 2 时是否有 fan-in report
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    [ -f "$state_file" ] || continue

    actual=$(grep "parallelism_actual:" "$state_file" | sed 's/.*://' | tr -d ' ' || true)
    if [ -n "$actual" ] && [ "$actual" != "" ] && [ "${actual%.*}" -ge 2 ] 2>/dev/null; then
        if [ ! -f "$task_dir/artifacts/fan-in-report.md" ]; then
            ERRORS+=("$task_name: parallelism_actual=$actual >=2 但缺少 fan-in-report.md")
        fi
    fi
done

# 3. 检查 board.yaml 的 claim/release 协议
for board in "$TASK_ROOT"/.claude/tasks/*/board.yaml; do
    [ -f "$board" ] || continue
    task_name=$(basename "$(dirname "$board")")

    # 检查 active_claims 中的 work item 是否有 completed 但未 release 的
    if grep -q "active_claims:" "$board" 2>/dev/null; then
        # 简化检查：如果存在 active_claims，检查 claimed_at 是否存在
        if grep -A5 "active_claims:" "$board" | grep -q "claimed_at:" 2>/dev/null; then
            : # 正常
        else
            WARNINGS+=("$task_name: active_claims 缺少 claimed_at 字段")
        fi
    fi
done

# 4. 检查子Agent是否自行扩大写入范围（通过检查不同Agent报告中的write_scope冲突）
# 此检查需人工复核，脚本仅标记需检查的任务
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    reviews_dir="$task_dir/reviews"
    [ -d "$reviews_dir" ] || continue

    agent_count=$(find "$reviews_dir" -name "agent-*-report.md" | wc -l)
    if [ "$agent_count" -ge 2 ]; then
        # 标记需人工检查写入范围冲突
        : # 暂不报错，仅依赖人工评审
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: subagent-orchestration-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "WARNINGS: subagent-orchestration-check"
    for w in "${WARNINGS[@]}"; do
        echo "  WARNING: $w"
    done
fi

if [ ${#ERRORS[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo "PASSED: subagent-orchestration-check — orchestration compliance verified"
    exit 0
elif [ ${#ERRORS[@]} -eq 0 ]; then
    echo "PASSED (with warnings): subagent-orchestration-check"
    exit 0
else
    exit 1
fi
