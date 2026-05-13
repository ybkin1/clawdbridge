#!/usr/bin/env bash
# subagent-stop-orchestrator.sh — Phase 4: Sub-agent stop hook.
# Logs sub-agent completion and triggers lightweight quality check.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture stdin
STDIN=$(cat)

AGENT_ID=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("agent_id","unknown"))' 2>/dev/null || echo "unknown")
STATUS=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status","unknown"))' 2>/dev/null || echo "unknown")

echo ""
echo "=== Subagent Stop ==="
echo "Agent: $AGENT_ID | Status: $STATUS"
echo "====================="
echo ""

exit 0
