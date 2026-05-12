# 00-user-intent.md — Re-Audit

## Original Intent
Integrate the spec architecture (27 contracts in `.claude/contracts/`) with the MCP constraint enforcer so that:
- Spec is Single Source of Truth
- MCP reads from config, not hardcoded rules
- Agents cannot forget to follow specs (anti-forgetting)

## Re-Audit Intent
Verify that the 5 critical defects found in the first architecture audit have been **completely and correctly fixed** before the task proceeds to closeout or further implementation.

## Success Criteria
1. All P0 defects are fully remediated with no residual risk
2. All P1 defects are remediated or have acceptable compensating controls
3. New code/changes do not introduce regressions
4. Tests pass (config-sync-check + enforcer test.js)
