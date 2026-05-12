# Truth Sources

1. `enforcer.js` — Core MCP logic, config cache, evaluateCondition engine
2. `test.js` — 36 assertions covering all 6 MCP tools
3. `pre-tool-use-orchestrator.ps1` / `.sh` — PreToolUse Hook implementation
4. `hook-enforcer-helper.js` — Node.js helper for Hook MCP calls
5. `mechanical-conditions.yaml` — 10 config-driven conditions
6. `phase-state-machine.yaml` — Phase order and gate mappings
7. `write-permissions.yaml` — Role-based permission matrix
8. `mcp-capabilities.yaml` — MCP capability boundaries
9. `verification-checker.md` — Checker catalog and Auditor Agent rules
10. `task-tracking-workflow-spec.md` — Phase transition rules and MCP integration spec
11. `config-sync-check.js` — Config drift validation checker
12. `settings.json` — MCP server registration
