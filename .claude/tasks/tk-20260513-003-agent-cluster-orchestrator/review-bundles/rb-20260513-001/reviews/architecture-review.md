# Architecture Review — rb-20260513-001

## Summary
**Conditional Pass**

The v2.0 eight-layer architecture specification is structurally sound, well-documented, and demonstrates strong separation between L1 (Spec) and L2 (Config). The MCP enforcer correctly implements a config-driven, zero-hard-coded-rules engine with 83 passing tests. However, four issues prevent a full Pass: (1) a layer leakage where L3 MCP `tools.js` embeds atomicity rule constants that should live in L2 config; (2) missing L2 config files referenced in documentation (`mcp-capabilities.yaml` and `agent-orchestration-rules.yaml` are present, but `schemas/` directory is empty); (3) incomplete hook coverage (SubagentStart/SubagentStop hooks registered in `settings.json` but no corresponding `.sh` scripts exist in the repo); and (4) `settings.json` contains project-specific paths (`.claude/mcp-servers/constraint-enforcer/index.js`) that are not generic across all projects.

---

## Findings (sorted by severity)

### Critical
*None.*

### High

#### H1: L3 MCP `tools.js` embeds L2 config constants (Layer Leakage)
- **Location**: `claude-config/mcp-servers/constraint-enforcer/tools.js` lines 91-93, 148-153
- **Issue**: The `agent_orchestrator` tool description hardcodes atomicity rules ("description ≤15 words, params ≤5, lines ≤50") directly in the tool schema description string. These values are already defined in `claude-config/config/atomicity-rules.yaml`. If L2 config changes, the L3 tool description becomes a stale source of truth.
- **Impact**: Users reading tool definitions via MCP will see outdated constants; violates "MCP only reads config, never hardcodes rules" principle stated in README.md L3 description.
- **Recommendation**: Replace hardcoded numbers in `tools.js` with a reference to `atomicity-rules.yaml`, or load description text dynamically from config at runtime.

#### H2: Missing JSON Schema files in L2 `schemas/` directory
- **Location**: `claude-config/config/schemas/` (referenced in README.md and `enforcer.js` lines 173-181)
- **Issue**: `enforcer.js` attempts to load JSON Schema files (`schemas/${name}.schema.json`) for config validation, but no schema files exist in the repository. `validateConfigs()` silently skips schema validation when files are missing. The README.md L2 directory listing includes `schemas/` as a subdirectory, implying schemas should exist.
- **Impact**: Config validation is weaker than documented; malformed configs may pass startup validation undetected.
- **Recommendation**: Either create the 4+ JSON Schema files for required configs (`mechanical-conditions`, `phase-state-machine`, `write-permissions`, `mcp-capabilities`), or remove `schemas/` from the documented L2 structure and downgrade `enforcer.js` validation to light-weight field checks only.

### Medium

#### M1: SubagentStart/SubagentStop hook scripts missing despite `settings.json` registration
- **Location**: `claude-config/settings.json` lines 70-93; `claude-config/hooks/`
- **Issue**: `settings.json` registers `SubagentStart` and `SubagentStop` hooks pointing to `.claude/hooks/subagent-start-orchestrator.js` and `subagent-stop-orchestrator.js`. However, the repository only contains `session-start-orchestrator.sh`, `pre-tool-use-orchestrator.sh`, `post-tool-use-orchestrator.sh`, and `stop-orchestrator.sh`. No `subagent-start` or `subagent-stop` scripts exist.
- **Impact**: The hooks will fail silently (`2>/dev/null || true`) at runtime, meaning SubagentStart/SubagentStop lifecycle events are not actually intercepted. This breaks the documented "6 lifecycle hooks" coverage.
- **Recommendation**: Add `subagent-start-orchestrator.sh` and `subagent-stop-orchestrator.sh` to `claude-config/hooks/`, or remove the registrations from `settings.json` if sub-agent hooks are not yet implemented.

#### M2: `settings.json` MCP path is project-specific, not generic
- **Location**: `claude-config/settings.json` line 6
- **Issue**: The MCP server command is hardcoded as `node .claude/mcp-servers/constraint-enforcer/index.js`. While this matches the deployment mapping, a generic settings template should either use a placeholder or document that this path must be adjusted per project.
- **Impact**: Direct copy-paste deployment may fail if a project places the MCP server at a different relative path.
- **Recommendation**: Add a comment in `settings.json` (or a companion `settings.json.template`) indicating the path is project-dependent. Alternatively, document in README.md that `settings.json` paths may need adjustment during deployment.

#### M3: `agent_orchestrator` and `agent_status` tools registered in `tools.js` but not wired in `index.js`
- **Location**: `claude-config/mcp-servers/constraint-enforcer/index.js` lines 37-58; `tools.js` lines 148-235
- **Issue**: `tools.js` defines 11 tools (including `agent_orchestrator`, `agent_status`, `checkpoint_sync`), but `index.js` only wires 6 tools in its `switch` statement. The additional 5 tools have implementations in `enforcer.js` but are unreachable via MCP.
- **Impact**: MCP clients cannot invoke `agent_orchestrator`, `agent_status`, or `checkpoint_sync`, even though they are advertised in `ListTools`.
- **Recommendation**: Add the missing `case` branches in `index.js` for `agent_orchestrator`, `agent_status`, and `checkpoint_sync`.

### Low

#### L1: Lingering v1.0 references in checklist templates
- **Location**: `claude-code-norms/checklists/test-review-checklist.md` line 12; `claude-code-norms/checklists/tech-review-checklist.md` line 20, 57
- **Issue**: Checklists still reference `templates/05-test-plan-template.md` and `templates/03-arch-design-template.md`, which are v1.0 five-layer directory structure filenames. The v2.0 templates directory no longer uses numeric prefixes.
- **Impact**: Minor confusion for users following checklists; does not affect runtime behavior.
- **Recommendation**: Update checklist references to match v2.0 template filenames (if they exist) or remove stale references.

#### L2: `pre-tool-use-orchestrator.ps1` references external `clawd-on-desk` path
- **Location**: `claude-config/hooks/pre-tool-use-orchestrator.ps1` lines 20-23
- **Issue**: The PowerShell hook contains a hardcoded relative path to `clawd-on-desk-main/hooks/clawd-node-wrapper.ps1`, which is outside the claude-code-rule repository scope.
- **Impact**: If deployed to a project without clawd-on-desk, the hook will attempt to invoke a non-existent script (though wrapped in `Test-Path`, so it fails silently).
- **Recommendation**: Document this clawd-on-desk integration as optional, or move the integration point to a project-specific overlay file.

#### L3: `agent-orchestration-rules.yaml` lacks `updated_at` consistency
- **Location**: `claude-config/config/agent-orchestration-rules.yaml` line 7
- **Issue**: `updated_at` is "2026-05-13" while most other configs are "2026-05-12". This is trivial but suggests the config set was not updated atomically.
- **Impact**: None functional.
- **Recommendation**: Align `updated_at` timestamps across the config set during the next update.

### Informational

#### I1: Strong L1-L2 boundary compliance
- The README.md and CLAUDE.md clearly articulate that L1 defines rules, L2 provides machine-readable projections, and L3 only reads L2. This is well-executed in `enforcer.js` (all config loaded via `loadConfig()`).

#### I2: Agent definitions (`researcher.md`, `auditor.md`) conform to schema
- Both files use the expected front-matter (`name`, `description`, `tools`) and provide structured output schemas. The `auditor.md` correctly declares its verdict as read-only, matching the `task-tracking-workflow-spec.md` Rule 8 (Auditor verdict cannot be overridden).

#### I3: Hook coverage matrix
| Hook | `.sh` exists | `.ps1` exists | `settings.json` registered |
|------|--------------|---------------|---------------------------|
| SessionStart | Yes | No | Yes |
| PreToolUse | Yes | Yes | Yes |
| PostToolUse | Yes | No | Yes |
| Stop | Yes | No | Yes |
| SubagentStart | **No** | No | Yes |
| SubagentStop | **No** | No | Yes |

- The `.ps1` variants are only provided for PreToolUse and checker-reminder. Consider adding `.ps1` equivalents for SessionStart, PostToolUse, and Stop if Windows/PowerShell is a primary target environment.

#### I4: v1.0 removal status
- No v1.0 directory structure (`01-`, `02-`, `03-`, `04-`, `05-`) remains in the current tree. Historical task directories (`claude-code-norms/tasks/tk-20260430-*/`) contain v1.0-era reports, but these are archival artifacts, not active specification. The README.md and CLAUDE.md correctly state v1.0 is removed.

#### I5: Deployment mapping correctness
- The README.md deployment table correctly maps:
  - `claude-code-norms/` -> `.claude/`
  - `claude-config/config/` -> `.claude/config/`
  - `claude-config/hooks/` -> `.claude/hooks/`
  - `claude-config/mcp-servers/` -> `.claude/mcp-servers/`
  - `claude-config/settings.json` -> `.claude/settings.json`
- This matches the actual repository structure.

---

## Recommendations

1. **Fix H1**: Refactor `tools.js` to remove hardcoded atomicity constants from tool descriptions; load them from `atomicity-rules.yaml` at runtime or replace with generic references.
2. **Fix H2**: Create JSON Schema files for the 4 required configs, or remove the `schemas/` directory from documentation and `enforcer.js` validation logic.
3. **Fix M1**: Implement `subagent-start-orchestrator.sh` and `subagent-stop-orchestrator.sh`, or deregister the hooks from `settings.json` until they are ready.
4. **Fix M3**: Wire `agent_orchestrator`, `agent_status`, and `checkpoint_sync` into `index.js` so the advertised MCP tools are actually callable.
5. **Fix L1**: Audit all checklist files for stale v1.0 template references and update to v2.0 filenames.
6. **Consider**: Add a `settings.json.template` with `{{PROJECT_ROOT}}` placeholders to make deployment guidance clearer.
