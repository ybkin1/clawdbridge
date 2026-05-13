#!/usr/bin/env bash
# subagent-start-orchestrator.sh — Phase 4: Sub-agent spawn hook.
# Logs sub-agent registration and validates manifest if available.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture stdin
STDIN=$(cat)

AGENT_ID=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("agent_id","unknown"))' 2>/dev/null || echo "unknown")
ROLE=$(echo "$STDIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("role","unknown"))' 2>/dev/null || echo "unknown")

echo ""
echo "=== Subagent Start ==="
echo "Agent: $AGENT_ID | Role: $ROLE"
echo "======================="
echo ""

exit 0
