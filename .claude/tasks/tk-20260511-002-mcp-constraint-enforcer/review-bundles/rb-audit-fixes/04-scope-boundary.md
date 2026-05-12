# 04-scope-boundary.md

## In Scope
- Hook scripts: `hook-enforcer-helper.js`, `pre-tool-use-orchestrator.ps1`, `pre-tool-use-orchestrator.sh`
- New checker: `config-sync-check.sh`, `config-sync-check.js`
- Registry fix: `registry.yaml` contract-schema checker_refs
- Test results: `test.js` and `config-sync-check` execution

## Out of Scope
- MCP enforcer core logic (`enforcer.js`, `tools.js`, `index.js`) — already reviewed in R1-R3
- Existing 10 checkers — unchanged
- clawd-on-desk project — unrelated

## Blind Review
Reviewers should NOT read the Round 1 audit synthesis until AFTER they have completed their own independent verification, to avoid confirmation bias.
