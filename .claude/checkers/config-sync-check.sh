#!/usr/bin/env bash
# Checker: config-sync-check
# Mode: automated
# Scope: .claude/config/*.yaml, registry.yaml, checkers/index.yaml
# Purpose: 验证 7 个配置源之间的一致性

set -euo pipefail

TASK_ROOT="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve js-yaml from MCP server node_modules
MCP_NODE_MODULES="$(cd "$SCRIPT_DIR/../mcp-servers/constraint-enforcer" && pwd)/node_modules"
export NODE_PATH="$MCP_NODE_MODULES${NODE_PATH:+:$NODE_PATH}"

# Delegate to Node.js implementation for YAML parsing
node "$SCRIPT_DIR/config-sync-check.js" "$TASK_ROOT"
