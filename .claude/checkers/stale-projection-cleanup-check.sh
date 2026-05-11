#!/usr/bin/env bash
# Checker: stale-projection-cleanup-check
# Mode: automated
# Scope: README.md, board.yaml, 派生文件
# Purpose: 检测过期投影是否已清理（旧版本 projection 是否标记 superseded 或删除）
# Failure: gate failed (contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检查 tasks 目录下是否有旧版本的 route-projection.yaml 未标记
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    artifacts_dir="$task_dir/artifacts"
    [ -d "$artifacts_dir" ] || continue

    # 检查是否有多个版本的 projection 文件
    projection_count=$(find "$artifacts_dir" -name '*projection*' -type f 2>/dev/null | wc -l)
    if [ "$projection_count" -gt 1 ]; then
        # 检查是否有 superseded 标记
        if [ ! -f "$artifacts_dir/.superseded" ] && [ ! -f "$artifacts_dir/archive/route-projection.yaml" ]; then
            ERRORS+=("$task_name: 存在多个 projection 文件但未标记 superseded 或归档")
        fi
    fi
done

# 2. 检查 board.yaml 是否与当前 phase 一致
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    board_file="$task_dir/board.yaml"

    if [ -f "$state_file" ] && [ -f "$board_file" ]; then
        state_phase=$(grep "^phase:" "$state_file" 2>/dev/null | sed 's/.*phase://' | tr -d ' "' || true)
        board_phase=$(grep "^phase:" "$board_file" 2>/dev/null | sed 's/.*phase://' | tr -d ' "' || true)
        if [ -n "$state_phase" ] && [ -n "$board_phase" ] && [ "$state_phase" != "$board_phase" ]; then
            ERRORS+=("$task_name: board.yaml phase ($board_phase) 与 state phase ($state_phase) 不一致")
        fi
    fi
done

# 3. 检查是否有未被 state 引用的临时/诊断/override 文件
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    state_file="$task_dir/00-task-state.yaml"
    [ -f "$state_file" ] || continue

    for pattern in '*.override' '*.diag' '*.tmp' 'test_*.md' 'draft_*.md'; do
        found=$(find "$task_dir" -name "$pattern" -type f 2>/dev/null || true)
        if [ -n "$found" ]; then
            while IFS= read -r f; do
                rel_path=$(realpath --relative-to="$task_dir" "$f" 2>/dev/null || echo "$f")
                ERRORS+=("$task_name: 未清理的临时/诊断文件: $rel_path")
            done <<< "$found"
        fi
    done
done

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: stale-projection-cleanup-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: stale-projection-cleanup-check — no stale projections detected"
exit 0
