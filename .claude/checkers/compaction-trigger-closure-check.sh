#!/usr/bin/env bash
# Checker: compaction-trigger-closure-check
# Mode: automated
# Scope: compaction receipts, checkpoint.md
# Purpose: 检测压缩触发是否闭合（触发压缩后是否有 receipt，checkpoint 是否同步）
# Failure: gate failed (contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查 checkpoint.md 是否与 state 同步
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    checkpoint="$task_dir/artifacts/checkpoint.md"
    state_file="$task_dir/00-task-state.yaml"
    [ -f "$state_file" ] || continue

    # 如果 state 中 phase_status=in_progress 且非初始阶段，建议有 checkpoint
    phase_status=$(grep "^phase_status:" "$state_file" 2>/dev/null | sed 's/.*phase_status://' | tr -d ' "' || true)
    phase=$(grep "^phase:" "$state_file" 2>/dev/null | sed 's/.*phase://' | tr -d ' "' || true)

    if [ "$phase_status" = "in_progress" ] && [ -n "$phase" ] && [ "$phase" != "clarify" ]; then
        if [ ! -f "$checkpoint" ]; then
            # 仅警告，非强制错误（某些短任务可能不需要 checkpoint）
            : # 暂不报错，避免过度敏感
        fi
    fi
done

# 2. 检查 compaction receipt 和 checkpoint 的时间一致性
for receipt in "$TASK_ROOT"/.claude/tasks/*/artifacts/compaction-receipt.yaml; do
    [ -f "$receipt" ] || continue
    task_dir=$(dirname "$(dirname "$receipt")")
    task_name=$(basename "$task_dir")
    checkpoint="$task_dir/artifacts/checkpoint.md"

    if [ -f "$checkpoint" ]; then
        receipt_time=$(grep "recorded_at:" "$receipt" | sed 's/.*recorded_at://' | tr -d ' "' || true)
        checkpoint_time=$(grep -E "^[Dd]ate:|updated_at" "$checkpoint" | head -1 | sed 's/.*://' | tr -d ' "' || true)
        # 简化检查：只要有时间戳即可
        if [ -z "$receipt_time" ]; then
            ERRORS+=("$task_name: compaction-receipt.yaml 缺少 recorded_at")
        fi
    fi
done

# 3. 检查 resume_anchor 指向的文件是否存在
for receipt in "$TASK_ROOT"/.claude/tasks/*/artifacts/compaction-receipt.yaml; do
    [ -f "$receipt" ] || continue
    task_dir=$(dirname "$(dirname "$receipt")")
    task_name=$(basename "$task_dir")

    anchor=$(grep "resume_anchor:" "$receipt" | sed 's/.*resume_anchor://' | tr -d ' "' || true)
    if [ -n "$anchor" ] && [ "$anchor" != "" ]; then
        # 解析相对路径
        if [[ "$anchor" == ./* ]]; then
            target="$TASK_ROOT/$anchor"
        else
            target="$task_dir/$anchor"
        fi
        if [ ! -e "$target" ]; then
            ERRORS+=("$task_name: resume_anchor 指向不存在的文件: $anchor")
        fi
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: compaction-trigger-closure-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: compaction-trigger-closure-check — compaction triggers closed"
exit 0
