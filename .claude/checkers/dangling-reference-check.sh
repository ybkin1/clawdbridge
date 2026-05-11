#!/usr/bin/env bash
# Checker: dangling-reference-check
# Mode: automated
# Scope: all markdown/yaml deliverables
# Purpose: 检测 Markdown 文件和 YAML 文件中引用不存在的文件/章节
# Failure: gate failed (professional gate)

set -euo pipefail

TASK_ROOT="${1:-.}"
ERRORS=()

# 1. 检测 Markdown 链接指向不存在的本地文件
# 提取所有 [text](local-path) 中的本地路径
while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    # match = "filepath|link"
    md_file="${match%%|*}"
    link="${match##*|}"
    # 跳过占位符
    case "$link" in
        \#*|http*|mailto*|"file.md"|"path"|"filename"|"extension"|"<"*) continue ;;
    esac
    dir=$(dirname "$md_file")
    target_path="${dir}/${link%%#*}"
    if [ ! -e "$target_path" ]; then
        ERRORS+=("悬空引用: $md_file -> $link")
    fi
done < <(
    find "$TASK_ROOT" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.claude/tasks/*/reviews/*' -not -path '*/clawd-on-desk-main/*' -print0 2>/dev/null | while IFS= read -r -d '' md_file; do
        grep -oE '\]\([^)]+\)' "$md_file" 2>/dev/null | sed 's/^](//;s/)$//' | sed 's/ .*//' | while IFS= read -r link; do
            [[ -n "$link" ]] && echo "${md_file}|${link}"
        done
    done || true
)

# 2. 检测 YAML front matter 中 required_contracts/depends_on 引用不存在的契约 ID
if [ -f "$TASK_ROOT/.claude/contracts/registry.yaml" ]; then
    registered=$(sed -n 's/^  \([a-z][a-z0-9_-]*\):.*/\1/p' "$TASK_ROOT/.claude/contracts/registry.yaml")

    for contract_file in "$TASK_ROOT"/.claude/contracts/*.md; do
        [ -f "$contract_file" ] || continue
        # 提取 YAML 块中的数组值
        sed -n '/^```yaml/,/^```/p' "$contract_file" | \
            grep -E '(required_contracts|depends_on):' | \
            grep -oE '\[[^]]*\]' | tr -d '[]' | tr ',' '\n' | tr -d "\"'" | while IFS= read -r ref; do
            ref=$(echo "$ref" | tr -d ' ')
            [[ -z "$ref" ]] && continue
            # 跳过模板占位符（含尖括号、中文、通用描述词）
            case "$ref" in
                \<*|依赖*|上游*|检查项*|允许*|被替代*|任务链*|最小*|可为*|任务*|交付*|动作*) continue ;;
            esac
            if ! echo "$registered" | grep -q "^${ref}$"; then
                echo "契约引用无效: $(basename "$contract_file") -> $ref"
            fi
        done
    done > /tmp/crg_contract_refs_$$ 2>/dev/null || true
    if [ -s /tmp/crg_contract_refs_$$ ]; then
        while IFS= read -r err; do
            ERRORS+=("$err")
        done < /tmp/crg_contract_refs_$$
    fi
    rm -f /tmp/crg_contract_refs_$$
fi

# 3. 检测 CLAUDE.md 契约导航表中的引用
if [ -f "$TASK_ROOT/.claude/CLAUDE.md" ]; then
    while IFS= read -r ref; do
        [[ -z "$ref" ]] && continue
        # 跳过已知非文件引用（action_family 名称、task-tracking 标准状态值等）
        case "$ref" in
            clarify|research|authoring|implementation|verification|review|closeout) continue ;;
            not_started|in_progress|in_review|passed|failed|blocked|archived) continue ;;
            full|quick|advisory) continue ;;
            reviewing|revising|syncing) continue ;;
        esac
        # 尝试多种文件名模式
        found=0
        for pattern in "$ref.md" "$ref-contract.md" "$ref-spec.md"; do
            if [ -f "$TASK_ROOT/.claude/contracts/$pattern" ]; then
                found=1
                break
            fi
        done
        if [ $found -eq 0 ]; then
            ERRORS+=("CLAUDE.md 引用无效: $ref")
        fi
    done < <(grep -oE '`[a-z][a-z0-9-]*`' "$TASK_ROOT/.claude/CLAUDE.md" 2>/dev/null | sed 's/`//g' | grep -v 'CLAUDE\.md\|registry\.yaml\|intent-routing\.md' || true)
fi

# 输出
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "FAILED: dangling-reference-check"
    for e in "${ERRORS[@]}"; do
        echo "  ERROR: $e"
    done
    exit 1
fi

echo "PASSED: dangling-reference-check — no dangling references found"
exit 0
