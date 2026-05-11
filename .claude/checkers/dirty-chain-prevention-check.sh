#!/usr/bin/env bash
# Checker: dirty-chain-prevention-check
# Mode: automated
# Scope: task directory, artifacts/, state files
# Purpose: 检测脏链路防止是否到位（state → review pack → report → provenance → handoff 链完整性）
# Failure: gate failed (professional gate, contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查 state 中的 last_review_report 是否指向存在的文件
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    [ -f "$state_file" ] || continue

    # 检查 last_review_report
    if grep -q "last_review_report:" "$state_file" 2>/dev/null; then
        ref=$(grep "last_review_report:" "$state_file" | sed 's/.*last_review_report://' | tr -d ' "')
        if [ -n "$ref" ] && [ "$ref" != "" ]; then
            target="$task_dir/$ref"
            if [ ! -e "$target" ]; then
                ERRORS+=("$task_name: last_review_report 指向不存在的文件: $ref")
            fi
        fi
    fi

    # 检查 last_blocker_report
    if grep -q "last_blocker_report:" "$state_file" 2>/dev/null; then
        ref=$(grep "last_blocker_report:" "$state_file" | sed 's/.*last_blocker_report://' | tr -d ' "')
        if [ -n "$ref" ] && [ "$ref" != "" ]; then
            target="$task_dir/$ref"
            if [ ! -e "$target" ]; then
                ERRORS+=("$task_name: last_blocker_report 指向不存在的文件: $ref")
            fi
        fi
    fi
done

# 2. 检查 review-bundles 中是否有孤儿 bundle（state 未引用但存在）
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    bundles_dir="$task_dir/review-bundles"

    if [ -d "$bundles_dir" ] && [ -f "$state_file" ]; then
        state_content=$(cat "$state_file" 2>/dev/null || true)
        for bundle in "$bundles_dir"/*/; do
            [ -d "$bundle" ] || continue
            bundle_name=$(basename "$bundle")
            if ! echo "$state_content" | grep -q "$bundle_name" 2>/dev/null; then
                ERRORS+=("$task_name: review-bundle $bundle_name 未被 state 引用（孤儿 bundle）")
            fi
        done
    fi
done

# 3. 检查 phase/gate passed 时 evidence 是否同步
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    [ -f "$state_file" ] || continue

    # 如果 gate_results 中任何 gate 为 passed，检查 reviews/ 目录是否有对应证据
    if grep -q "status: passed" "$state_file" 2>/dev/null; then
        reviews_dir="$task_dir/reviews"
        if [ ! -d "$reviews_dir" ] || [ -z "$(ls -A "$reviews_dir" 2>/dev/null)" ]; then
            ERRORS+=("$task_name: gate 标记为 passed 但 reviews/ 目录为空或不存在")
        fi
    fi
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: dirty-chain-prevention-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: dirty-chain-prevention-check — no dirty chains detected"
exit 0
