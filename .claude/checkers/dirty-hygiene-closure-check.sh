#!/usr/bin/env bash
# Checker: dirty-hygiene-closure-check
# Mode: automated
# Scope: task directory + all write operations
# Purpose: 检测脏数据/脏链路（临时文件、中文文件名、孤儿文件）
# Failure: gate failed (professional gate, contract gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()
WARNINGS=()

# 1. 检测中文/非ASCII文件名
while IFS= read -r -d '' file; do
    basename_file=$(basename "$file")
    if echo "$basename_file" | grep -qP '[^\x00-\x7F]'; then
        ERRORS+=("非ASCII文件名: $file")
    fi
done < <(find "$TASK_ROOT" -name '*.md' -o -name '*.yaml' -o -name '*.txt' -o -name '*.b64' -print0 2>/dev/null)

# 2. 检测孤儿临时文件
for pattern in '*.tmp' '*.bak' '*.orig' '*.swp' '*.swo' '*.b64' 'gen_report.py' 'test.txt' 'test_write.txt'; do
    found=$(find "$TASK_ROOT" -name "$pattern" 2>/dev/null | head -5)
    if [ -n "$found" ]; then
        while IFS= read -r f; do
            ERRORS+=("孤儿临时文件: $f")
        done <<< "$found"
    fi
done

# 3. 检测任务目录是否缺少必需子目录
for task_dir in "$TASK_ROOT"/.claude/tasks/*/; do
    [ -d "$task_dir" ] || continue
    task_name=$(basename "$task_dir")
    for subdir in artifacts review-bundles checkers exceptions; do
        if [ ! -d "$task_dir/$subdir" ]; then
            WARNINGS+=("任务目录缺少 $subdir/: $task_name")
        fi
    done
done

# 4. 检测契约目录中的幽灵引用（定义了但不存在的文件）
if [ -d "$TASK_ROOT/.claude/contracts/references" ]; then
    if [ ! -f "$TASK_ROOT/.claude/contracts/references/repo-profile.md" ]; then
        ERRORS+=("幽灵文件: references/repo-profile.md 不存在")
    fi
    if [ ! -f "$TASK_ROOT/.claude/contracts/references/command-catalog.md" ]; then
        ERRORS+=("幽灵文件: references/command-catalog.md 不存在")
    fi
fi

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: dirty-hygiene-closure-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "PASSED (with warnings): dirty-hygiene-closure-check"
    for w in "${WARNINGS[@]}"; do
        echo "  WARNING: $w"
    done
    exit 0
fi

echo "PASSED: dirty-hygiene-closure-check — no dirty data detected"
exit 0
