# Architecture & Separation Round 2 Review — rb-20260513-002

## Summary

**Verdict: Conditional Pass**

The 8-layer separation model is structurally sound and largely config-driven, with clear L1→L2→L3 data flow and a well-implemented fail-closed L7 Hook. However, several hard-coded constants and fallback rule sets remain in L3 (enforcer.js), creating a drift risk between L2 Config and L3 MCP. Additionally, L4-L6 orchestration logic is co-located inside the same enforcer.js module, blurring the boundary between the execution engine (L3) and the orchestration layer (L4-L6). The Hook complementarity is good but not complete: certain disk-writing tools (e.g., Bash with cp, mv, touch) bypass both Hook and MCP. Cross-repo sync with claude-code-rule/ is partially polluted by legacy references. Remediation of the identified hard-coding and boundary-blurring issues would raise the verdict to Pass.

---

## Findings (sorted by severity)

### Critical

#### C-1: Hard-Coded Check Type Fallback in getKnownCheckTypes()

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:124-136`
- **Gap**: The function `getKnownCheckTypes()` contains a fallback `new Set([...])` with 9 hard-coded check type strings (`field_equals`, `field_not_equals`, `field_empty_or_null`, `gate_results_all_passed`, `file_exists_and_size_gt_0`, `timestamp_freshness`, `checker_result_status`, `mandatory_checkers_all_passed_or_excepted`, `evidence_lock_exists`). This is a direct violation of the zero hard-coded rules claim.
- **Impact**: If `mechanical-conditions.yaml` is updated with new `check_types` but the enforcer process restarts without re-reading the config, the fallback set is used during `validateConfigs()`, causing false validation errors and blocking legitimate conditions.
- **Recommendation**: Remove the fallback entirely. If `mechanical-conditions.yaml` is missing or unreadable, `getKnownCheckTypes()` should return an empty Set and log a fatal error, forcing the operator to fix L2 Config rather than silently falling back to stale hard-coded knowledge.

#### C-2: Hard-Coded Script Extension Whitelist in runBashChecker()

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:532`
- **Gap**: `const allowedExts = [".sh", ".ps1", ".js"];` is hard-coded. This list should be derived from `checkers/index.yaml` or a dedicated `checker-config.yaml` config.
- **Impact**: Adding a new checker type (e.g., `.py` or `.ts`) requires modifying L3 source code, violating the principle that checker metadata should be fully L2-driven.
- **Recommendation**: Move `allowed_extensions` to `checkers/index.yaml` or a new `checker-config.yaml`, and read it dynamically in `runBashChecker()`.

#### C-3: Hard-Coded MAX_CONCURRENCY = 3 in runMandatoryCheckers()

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:740`
- **Gap**: `const MAX_CONCURRENCY = 3;` is a hard-coded operational constant. It should live in `agent-orchestration-rules.yaml` or `mcp-capabilities.yaml`.
- **Impact**: In CI environments with more resources, 3 is arbitrarily low. In constrained environments, 3 may be too high. The inability to tune this without source modification is a deployment anti-pattern.
- **Recommendation**: Add `max_checker_concurrency` to `mcp-capabilities.yaml` behavior section and read it in `runMandatoryCheckers()`.

### High

#### H-1: L4-L6 Orchestration Logic Co-Located in L3 Enforcer

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:1481-1896` (functions `agentOrchestrator`, `agentStatus`, `checkpointSync`)
- **Gap**: The MCP server (L3) contains 415+ lines of orchestration logic that conceptually belong to L4 (Orchestrator-Prime), L5 (Sub-Orchestrator), and L6 (Worker). These functions manage agent IDs, packet grouping, checkpoint snapshots, and execution plans — all orchestration concerns, not constraint enforcement concerns.
- **Impact**: This creates a tight coupling between the constraint enforcement engine and the orchestration layer. A change in orchestration strategy (e.g., changing group size from 3 to 5) requires modifying L3 code, which should be stable.
- **Recommendation**: Extract `agentOrchestrator`, `agentStatus`, and `checkpointSync` into a separate `orchestrator.js` module within a new `mcp-servers/orchestrator/` directory, or at minimum into a separate file imported by `index.js`. The L3 enforcer should expose only constraint-related tools; orchestration tools should be served by a distinct MCP server or at least a distinct module.

#### H-2: Hook Falls Back to Legacy Hardcoded Logic Comment but No Actual Fallback

- **Evidence**: `.claude/hooks/pre-tool-use-orchestrator.sh:4` and `.claude/hooks/pre-tool-use-orchestrator.ps1:3`
- **Gap**: Both Hook headers claim "Falls back to legacy hardcoded logic if helper is unavailable." However, the actual behavior when the helper is unavailable is to block (exit 1), not to fall back to any legacy logic. The comment is misleading and could cause operational confusion.
- **Impact**: Operators reading the comment may expect graceful degradation to hard-coded rules, but the system actually fails closed. While fail-closed is the correct security posture, the documentation/comment is inconsistent with the code.
- **Recommendation**: Update the comment to accurately reflect the behavior: "Fails closed if helper is unavailable. No legacy fallback — all Write/Edit operations require MCP constraint enforcement."

#### H-3: agentOrchestrator Hard-Codes Group Size = 3 for Sub-Orchestrators

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:1687`
- **Gap**: `const groupSize = 3;` is hard-coded inside the `multi_packet_parallel` branch. This is an orchestration parameter that should be in `agent-orchestration-rules.yaml`.
- **Impact**: Changing the fan-out grouping strategy requires L3 code change.
- **Recommendation**: Add `sub_orchestrator_group_size` to `agent-orchestration-rules.yaml` and read it dynamically.

#### H-4: Hook Does Not Intercept Bash with cp, mv, touch, rm

- **Evidence**: `.claude/hooks/pre-tool-use-orchestrator.sh:84-136` and `.claude/hooks/pre-tool-use-orchestrator.ps1:114-155`
- **Gap**: The Hook only detects bash redirections but does not intercept `cp`, `mv`, `touch`, or `rm` commands, all of which write to disk. The MCP `validateBashCommand()` in `enforcer.js` also only checks redirection targets, not these commands.
- **Impact**: A malicious or buggy Agent can bypass both Hook and MCP by using `cp sensitive.yaml /tmp/leak.yaml` or `rm -rf artifacts/`.
- **Recommendation**: Extend both Hook and MCP to detect common disk-writing bash commands. At minimum, parse `cp`, `mv`, `touch`, `rm`, `mkdir` targets and validate them through `validateWritePermission()`. Alternatively, add a `bash_command_allowlist` to `write-permissions.yaml`.

### Medium

#### M-1: validDecisions Array Hard-Coded in agentOrchestrator()

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:1627`
- **Gap**: `const validDecisions = ["multi_packet_parallel", "single_packet_direct", "single_thread_exception"];` duplicates the list already present in `agent-orchestration-rules.yaml` under `orchestration_decisions.valid`.
- **Impact**: If `agent-orchestration-rules.yaml` is updated with a new decision type, `agentOrchestrator()` will reject it until its hard-coded array is also updated.
- **Recommendation**: Read `orchestration_decisions.valid` from `agent-orchestration-rules.yaml` instead of hard-coding.

#### M-2: manualGates Filtering Hard-Codes value Gate

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:1107`
- **Gap**: `const manualGates = (phaseDef?.gates || []).filter((g) => g === "value");` hard-codes the assumption that only the `value` gate is manual. This knowledge belongs in `mcp-capabilities.yaml` under `manual_only`.
- **Impact**: If a new manual gate is added to `phase-state-machine.yaml`, the evidence lock will incorrectly report zero manual gates pending.
- **Recommendation**: Derive manual gates by intersecting `phaseDef.gates` with the IDs listed in `mcp-capabilities.yaml.manual_only`.

#### M-3: ALL_CONFIG_NAMES Array Is a Maintenance Burden

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:65-72`
- **Gap**: The `ALL_CONFIG_NAMES` array is a manual manifest of config files. If a new config is added (e.g., `new-rules.yaml`), this array must be updated.
- **Impact**: This is a form of soft coupling between L2 Config growth and L3 code maintenance.
- **Recommendation**: Replace the explicit array with a dynamic `fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.yaml'))` call, or maintain a `config-manifest.yaml` that lists all config files and is itself loaded first.

#### M-4: SUPPORTED_CONFIG_VERSION_MIN/MAX Hard-Coded

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:116-117`
- **Gap**: `const SUPPORTED_CONFIG_VERSION_MIN = 1; const SUPPORTED_CONFIG_VERSION_MAX = 1;` hard-codes the acceptable config version range.
- **Impact**: When config format evolves to v2, this constant must be changed in L3.
- **Recommendation**: Move `supported_version_range` to a new `config-meta.yaml` or add it to each config file with a top-level `min_enforcer_version` field.

#### M-5: Hook and MCP Both Implement Duplicate Bash Redirection Parsing

- **Evidence**: `.claude/hooks/pre-tool-use-orchestrator.sh:89-102` (Python regex) vs `.claude/mcp-servers/constraint-enforcer/enforcer.js:949-1002` (JS regex)
- **Gap**: Both L7 Hook and L3 MCP implement nearly identical regex-based bash redirection parsing. This violates DRY and creates a maintenance hazard if regex semantics diverge.
- **Impact**: A bash command that parses differently in Python vs JS could be allowed by one layer and blocked by the other, creating inconsistent behavior.
- **Recommendation**: Consolidate bash redirection parsing into a single canonical implementation. The Hook should delegate all parsing to the MCP helper (which it already does for Write/Edit), or both should share a common regex definition from `write-permissions.yaml`.

### Low

#### L-1: checkers/index.yaml Claims 19 Checkers but Lists 18

- **Evidence**: `.claude/checkers/index.yaml` (entire file)
- **Gap**: The file lists 10 existing + 7 execution-traceability + 1 atomicity + 1 config-sync = 19 entries. However, `config-sync-check` appears twice (once as `.sh` at line 276 and once as `.js` in the actual filesystem). The index only lists the `.sh` version. The actual filesystem has both `config-sync-check.sh` and `config-sync-check.js`.
- **Impact**: Minor inventory inconsistency. The `getCheckerCatalog()` function will report the `.sh` version only.
- **Recommendation**: Clarify in `index.yaml` which script is canonical, or merge them.

#### L-2: hook-enforcer-helper.js Imports from ../mcp-servers/constraint-enforcer/enforcer.js

- **Evidence**: `.claude/hooks/hook-enforcer-helper.js:6`
- **Gap**: The Hook helper imports directly from the MCP enforcer module using a relative path (`../mcp-servers/constraint-enforcer/enforcer.js`). This creates a physical dependency from L7 (Hook) into L3 (MCP).
- **Impact**: If the MCP server module is refactored or moved, the Hook breaks. This is a layer leak.
- **Recommendation**: Extract the shared `validateWritePermission()` logic into a common library (e.g., `.claude/lib/constraint-core.js`) that both L3 and L7 can import without cross-layer relative paths.

#### L-3: agent-orchestration-rules.yaml Duplicates Atomicity Constants

- **Evidence**: `.claude/config/agent-orchestration-rules.yaml:10-14`
- **Gap**: `max_description_words: 15`, `max_input_params: 5`, `max_lines: 50` duplicate values already present in `atomicity-rules.yaml`.
- **Impact**: Risk of config drift if one file is updated and the other is not.
- **Recommendation**: Remove the duplicate fields from `agent-orchestration-rules.yaml` and have `agentOrchestrator()` read them from `atomicity-rules.yaml`.

#### L-4: Registry YAML Loading Is Duplicated

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/enforcer.js:1315-1325` (`loadRegistryYaml`) vs `.claude/mcp-servers/constraint-enforcer/enforcer.js:46-61` (`loadConfig`)
- **Gap**: `loadRegistryYaml()` is a bespoke loader for `registry.yaml` that does not reuse the `loadConfig()` helper, even though `registry.yaml` is conceptually an L1 Spec that L3 reads.
- **Impact**: Minor code duplication. The caching logic in `loadConfig()` is not applied to registry loads.
- **Recommendation**: Make `registry.yaml` load through `loadConfig()` by adding it to `ALL_CONFIG_NAMES`, or rename `loadConfig()` to a more generic `loadYamlCached()` and use it for all YAML files.

### Informational

#### I-1: L1 Spec Does Not Declare L2 Config Schema

- **Evidence**: `.claude/contracts/registry.yaml` (entire file)
- **Gap**: There is no contract in `registry.yaml` that defines the schema or versioning policy for L2 Config files (`mechanical-conditions.yaml`, `phase-state-machine.yaml`, etc.).
- **Impact**: L2 Config evolution is not governed by any L1 contract, creating a potential gap in the spec-to-config chain.
- **Recommendation**: Add a new contract (e.g., `config-schema-governance`) to `registry.yaml` that defines the required fields, version policy, and schema validation rules for all `.claude/config/*.yaml` files.

#### I-2: No Dedicated L4-L6 Directory Structure

- **Evidence**: Project root and `.claude/` tree
- **Gap**: L4 (Orchestrator-Prime), L5 (Sub-Orchestrator), and L6 (Worker) are conceptual layers but have no dedicated physical directories. Their logic is either in the main Claude process (L4) or inside `enforcer.js` (L5-L6 proxies).
- **Impact**: The 8-layer model is clear on paper but blurry in the filesystem. New contributors may not know where to add orchestration logic.
- **Recommendation**: Create `.claude/orchestrator/` for L4-L6 code, with subdirectories `prime/`, `sub/`, and `worker/` to make the layer boundaries explicit in the directory structure.

#### I-3: Cross-Repo Sync Reference Is Legacy

- **Evidence**: `CLAUDE.md:1` and `.trae/rules/project_rules.md`
- **Gap**: The root `CLAUDE.md` and `.trae/rules/project_rules.md` contain references to `claude-code-rule/` repository, but the actual `.claude/` directory in `yb/` is self-contained. The separation between `yb/.claude/` and `claude-code-rule/` is not documented.
- **Impact**: Developers may be confused about which repository is the source of truth for contracts and configs.
- **Recommendation**: Add a `CROSS-REPO-SYNC.md` document to `yb/.claude/` that clarifies: (1) `claude-code-rule/` is the upstream spec repo, (2) `yb/.claude/` is the downstream implementation, and (3) the sync direction is one-way (spec to implementation) except for bug fixes.

#### I-4: tools.js References atomicity-rules.yaml but Does Not Validate Its Presence

- **Evidence**: `.claude/mcp-servers/constraint-enforcer/tools.js:148-154`
- **Gap**: The `agent_orchestrator` tool description mentions `atomicity-rules.yaml`, but there is no startup validation that this file exists.
- **Impact**: If `atomicity-rules.yaml` is accidentally deleted, `agentOrchestrator()` will silently load an empty ruleset and approve all packets.
- **Recommendation**: Add `atomicity-rules.yaml` to the `validateConfigs()` required list.

---

## Recommendations

| Priority | Item | Action | Owner |
|---------|------|--------|-------|
| Critical | C-1: Hard-coded check type fallback | Remove fallback Set from getKnownCheckTypes(); fail loudly if config missing | code-reviewer |
| Critical | C-2: Hard-coded extension whitelist | Move allowed_extensions to checkers/index.yaml | code-reviewer |
| Critical | C-3: Hard-coded MAX_CONCURRENCY | Add to mcp-capabilities.yaml and read dynamically | code-reviewer |
| High | H-1: L4-L6 logic in L3 enforcer | Extract orchestration tools to separate module/server | architect-reviewer |
| High | H-2: Misleading Hook fallback comment | Update comments in both .sh and .ps1 | architect-reviewer |
| High | H-3: Hard-coded groupSize = 3 | Add to agent-orchestration-rules.yaml | code-reviewer |
| High | H-4: Hook/MCP miss cp/mv/touch/rm | Extend bash command detection in both Hook and MCP | auditor-reviewer |
| Medium | M-1: Hard-coded validDecisions | Read from agent-orchestration-rules.yaml | code-reviewer |
| Medium | M-2: Hard-coded value gate filter | Derive from mcp-capabilities.yaml.manual_only | code-reviewer |
| Medium | M-3: ALL_CONFIG_NAMES maintenance burden | Dynamically discover configs or use manifest | code-reviewer |
| Medium | M-4: Hard-coded version range | Move to config-meta or per-config field | code-reviewer |
| Medium | M-5: Duplicate bash redirection parsing | Consolidate into shared library or single canonical regex | code-reviewer |
| Low | L-1: Checker count inconsistency | Clarify config-sync-check canonical script in index | contract-reviewer |
| Low | L-2: Hook imports from MCP module | Extract shared logic to .claude/lib/constraint-core.js | architect-reviewer |
| Low | L-3: Duplicate atomicity constants | Remove duplicates from agent-orchestration-rules.yaml | contract-reviewer |
| Low | L-4: Duplicate registry loader | Reuse loadConfig() for registry.yaml | code-reviewer |
| Info | I-1: Missing L2 Config schema contract | Add config-schema-governance to registry.yaml | contract-reviewer |
| Info | I-2: No L4-L6 physical directories | Create .claude/orchestrator/{prime,sub,worker}/ | architect-reviewer |
| Info | I-3: Cross-repo sync clarity | Add CROSS-REPO-SYNC.md documentation | contract-reviewer |
| Info | I-4: Missing atomicity config validation | Add atomicity-rules.yaml to startup validation | code-reviewer |
