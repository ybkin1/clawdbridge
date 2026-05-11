#!/bin/bash
# Claude Code 权限管理工具
# 用法: ./perm-admin.sh [backup|restore|list|status|rollback|diff]

CONFIG_FILE="/root/.claude/settings.json"
BACKUP_DIR="/root/.claude/backups"

mkdir -p "$BACKUP_DIR"

case "$1" in
  backup)
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    cp "$CONFIG_FILE" "$BACKUP_DIR/settings.json.backup-$TIMESTAMP"
    echo "备份完成: $BACKUP_DIR/settings.json.backup-$TIMESTAMP"
    ;;
  restore)
    if [ -z "$2" ]; then
      echo "请指定备份文件编号"
      echo "可用备份:"
      ls -lt "$BACKUP_DIR" | head -10
      exit 1
    fi
    BACKUP_FILE="$BACKUP_DIR/$2"
    if [ ! -f "$BACKUP_FILE" ]; then
      echo "备份文件不存在: $BACKUP_FILE"
      exit 1
    fi
    cp "$CONFIG_FILE" "$BACKUP_DIR/settings.json.pre-restore-$(date +%Y%m%d-%H%M%S)"
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    echo "恢复完成: $BACKUP_FILE -> $CONFIG_FILE"
    ;;
  list)
    echo "可用备份列表:"
    ls -lt "$BACKUP_DIR" | head -15
    ;;
  status)
    echo "当前权限状态:"
    python3 -c "
import json
with open('$CONFIG_FILE') as f:
    data = json.load(f)
allow = data['permissions']['allow']
deny = data['permissions']['deny']
print(f'  Allow: {len(allow)} 条')
print(f'  Deny:  {len(deny)} 条')
print(f'  环境变量: {list(data.get(\"env\", {}).keys())}')
"
    ;;
  rollback)
    LATEST=$(ls -t "$BACKUP_DIR" | head -1)
    if [ -z "$LATEST" ]; then
      echo "没有可用备份"
      exit 1
    fi
    cp "$CONFIG_FILE" "$BACKUP_DIR/settings.json.pre-rollback-$(date +%Y%m%d-%H%M%S)"
    cp "$BACKUP_DIR/$LATEST" "$CONFIG_FILE"
    echo "回滚完成: $LATEST"
    ;;
  diff)
    if [ -z "$2" ]; then
      echo "请指定要对比的备份文件"
      exit 1
    fi
    diff -u "$BACKUP_DIR/$2" "$CONFIG_FILE" || true
    ;;
  *)
    echo "Claude Code 权限管理工具"
    echo "用法: $0 [backup|restore|list|status|rollback|diff]"
    echo ""
    echo "  backup              - 创建当前配置备份"
    echo "  restore <文件名>     - 从指定备份恢复"
    echo "  list                - 列出所有备份"
    echo "  status              - 查看当前权限统计"
    echo "  rollback            - 回滚到最近备份"
    echo "  diff <文件名>        - 对比备份与当前配置"
    ;;
esac
