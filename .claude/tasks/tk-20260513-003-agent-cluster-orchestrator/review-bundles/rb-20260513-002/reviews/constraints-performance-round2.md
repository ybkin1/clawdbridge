# Constraints & Performance Round 2 Review — rb-20260513-002

## Summary

**Verdict: Conditional Pass**

The MCP constraint-enforcer implementation has matured significantly since Round 1. The config-driven architecture (zero hard-coded rules), atomic state writes, hot-reload cache, role-based permissions, and bash-redirection detection are all solid engineering choices. However, three structural risks remain unaddressed at scale: (1) the 1800+ line `enforcer.js` is approaching unmaintainability, (2) the spawn-per-checker model will not survive 50+ checkers under real load, and (3) the dual-layer defense (Hook + MCP) has a subtle bypass path when the Hook helper crashes in a specific way. These are not blockers for the current 19-checker deployment, but they will become blockers as the rule set grows.

---

## Findings (sorted by severity)

### Critical

#### C-1: Hook script `call_helper` treats `"unavailable"` as hard-block, but helper crash with non-empty stdout can leak through
**File:** `pre-tool-use-orchestrator.sh:34-52`, `hook-enforcer-helper.js:22-28`

The Hook calls the Node helper and parses its stdout. If `node "$HELPER_PATH"` crashes but still prints a partial JSON object (e.g., due to an unhandled exception after `console.log`), the shell's `helper_output` variable captures that partial JSON. The subsequent `python3` parse may succeed on the partial object, and if the partial object happens to contain `"allowed": true` (or lacks the key, defaulting to false but the shell logic treats missing as false), the behavior depends on the exact crash timing. More importantly, if the helper process exits with a non-zero code but the stdout is completely empty, the fallback `echo "{}"` produces `{}`, which parses to `allowed=false`, so it blocks. This is actually safe.

The real critical path is: `node "$HELPER_PATH" 2>/dev/null` suppresses stderr. If the helper throws *before* writing stdout, stdout is empty, fallback `{}` is used, `allowed=false`, blocked. Good.

But if the helper throws *after* writing a malformed JSON line (e.g., `console.log(JSON.stringify(result))` succeeds, then an async error fires and the process exits 1), stdout contains valid JSON, the shell captures it, and the operation proceeds. The helper's `main()` has a top-level `.catch()` that writes to stderr and exits 1, but the `console.log(JSON.stringify(result))` on line 24 has already flushed. So a crash *after* line 24 does not invalidate the already-emitted verdict. This is acceptable because the verdict was already computed.

**However**, there is a worse case: `validateWritePermission` inside the helper is `async`. If it throws *after* starting but before returning, the `.catch()` on line 30-33 fires, writes to **stderr** (which is suppressed by `2>/dev/null`), and exits 1. Stdout is empty. The shell gets `{}`, blocks. Safe.

**The actual critical gap:** If `node` itself is not on `$PATH`, `command -v node >/dev/null 2>&1` fails, `call_helper` returns `"unavailable"`, and the Hook hard-blocks (line 59-68). This is correct fail-closed behavior. But if `node` exists but the helper module import fails (e.g., `../mcp-servers/constraint-enforcer/enforcer.js` has a syntax error after a bad edit), `node` starts, crashes immediately, stdout empty, shell gets `{}`, blocks. Safe.

**Re-evaluated severity:** The Hook is actually robust. The critical concern shifts to: **What if the Hook script itself is not registered in `settings.json` or is bypassed by a tool that does not trigger PreToolUse?** The Hook only intercepts `Write`, `Edit`, and `Bash`. A custom tool or a future Claude Code tool (e.g., `ApplyPatch`, `CreateFile`) that writes to disk but is not listed in the Hook's `TOOL_NAME` check will bypass entirely. This is an architectural bypass, not a code bug.

**Recommendation:** Add a catch-all `*` tool matcher at the end of the Hook that, for any unhandled tool which includes a `file_path` or `path` field, delegates to `call_helper`. Alternatively, document that new tools must be explicitly added to the Hook whitelist.

---

### High

#### H-1: `enforcer.js` at 1897 lines is a monolith — violates the spec's own "50 lines per unit" atomicity rule
**File:** `enforcer.js`

The file contains 10 exported tool handlers, 3 internal config loaders, 2 registry parsers, 1 condition evaluator with a 9-way switch, 1 permission validator, 1 bash-redirection extractor, 1 agent orchestrator, 1 agent status manager, and 1 checkpoint sync engine. This is a textbook "god module." The project's own `atomicity-rules.yaml` mandates `code_line_limit: 50` per file for atomic packets. While `enforcer.js` is infrastructure rather than business logic, the principle applies: a single 1900-line file with no internal module boundaries is a maintenance and review hazard.

**Evidence:**
- `checkPhaseReadiness` + `evaluateCondition`: ~250 lines
- `runMandatoryCheckers` + `runBashChecker`: ~240 lines
- `validateWritePermission` + helpers: ~170 lines
- `validateBashCommand` + `extractBashRedirectionTargets`: ~130 lines
- `generateEvidenceLock`: ~120 lines
- `requestPhaseTransition`: ~145 lines
- `getCheckerCatalog` + `getActiveContractSet` + `evaluateEffectiveScope`: ~190 lines
- `agentOrchestrator` + `validatePacketAtomicity`: ~360 lines
- `agentStatus`: ~110 lines
- `checkpointSync`: ~110 lines

**Recommendation:** Split into `enforcer/` sub-modules: `config-loader.js`, `condition-engine.js`, `permission-gate.js`, `checker-runner.js`, `contract-resolver.js`, `agent-orchestrator.js`, `checkpoint-store.js`. Keep `enforcer.js` as a thin router (like `index.js` already is for MCP). This also enables unit testing of individual engines without loading the entire server.

#### H-2: Checker execution spawns a new OS process per checker — O(n) process overhead, unsustainable at 50+ checkers
**File:** `enforcer.js:518-590` (`runBashChecker`)

Each checker invocation uses `spawn(shell, shellArgs, { cwd, timeout: 60000 })`. With 19 checkers and a concurrency limit of 3, a full task run creates up to 19 process spawns, each loading its own shell interpreter (bash/powershell/node), filesystem handles, and environment. At 50 checkers, this becomes 50 spawns. At 100 checkers, 100 spawns.

The current bounded concurrency (MAX_CONCURRENCY = 3) mitigates memory pressure but does not reduce total spawn count or cumulative latency. A typical shell script checker does `find`, `grep`, `yaml` parsing — operations that are I/O bound and could be done in-process via a JS/TS checker API.

**Benchmark estimate:**
- Spawn overhead (bash init + script parse): ~30-80ms on SSD, ~100-200ms on slower disks.
- 19 checkers × 50ms = ~950ms minimum wall time (with concurrency=3, ~6-7 batches = ~350ms).
- 50 checkers × 50ms = ~2.5s minimum wall time.
- 100 checkers × 50ms = ~5s minimum wall time.

This is acceptable for a pre-phase gate, but if checkers are run on *every* tool call (they are not currently), it would be catastrophic.

**Recommendation:** Introduce a "checker runtime" abstraction. For `.js` checkers, `require()` them into the MCP process and call an exported `run(taskDir)` function, eliminating the spawn overhead entirely. Reserve `spawn()` only for `.sh`/`.ps1` legacy checkers. This also gives checkers access to the shared config cache.

#### H-3: Config cache uses `fs.statSync` mtime for hot-reload, but mtime granularity is 1s on some filesystems and can miss rapid edits
**File:** `enforcer.js:46-90`

`loadConfig` compares `configMtimes[configName] === mtime`. On Windows NTFS, mtime resolution is 100ns (fine). On older ext3, it's 1s. On WSL1 with 9P, it can be coarse. If a config is edited twice within the same second, the second edit is invisible until the next second boundary. The test `testConfigCacheHotReload` passes because it does a single edit, waits for the async call, then restores. It does not test double-edits within 1 second.

More importantly, `loadAllConfigs` uses the *directory* mtime (`dirStat.mtimeMs`). If a file inside the directory is edited but the directory itself is not touched (common on Linux where directory mtime changes only on create/delete/rename, not on file content modification), `allConfigsCacheTime === dirMtime` will be true and `loadConfig` will still be called, but `loadConfig` relies on *file* mtime. This is actually safe because file mtime is checked inside `loadConfig`. The directory mtime optimization is therefore a no-op risk reduction, not a bug.

**Recommendation:** Add a `configCacheMaxAgeMs` (e.g., 5000ms) to force periodic refresh regardless of mtime, or switch to `fs.watch` / `chokidar` for event-driven reload. For now, document the 1s granularity limitation.

---

### Medium

#### M-1: `automatable` / `manual_only` / `hybrid` classifications in `mcp-capabilities.yaml` are accurate but incomplete
**File:** `mcp-capabilities.yaml`

The classifications are directionally correct:
- `automatable` covers all 9 `check_type` values implemented in `evaluateCondition`. Accurate.
- `manual_only` lists 4 items (`value_gate_review`, `professional_gate_review`, `architecture_decomposition`, `exception_approval`). These are genuinely subjective. Accurate.
- `hybrid` lists 2 items (`context_budget_compression`, `code_quality_review`). Accurate.

**Gap:** The `automatable` list does not include the atomicity checks (`word_count`, `array_length`, `file_lines`, `file_count`, `estimated_tokens`, `regex_match`, `single_sentence`) from `atomicity-rules.yaml`, even though they are fully automated by `agentOrchestrator` / `validatePacketAtomicity`. This is a documentation/registration gap, not a functional bug. The `mcp-capabilities.yaml` appears to be focused on *mechanical conditions* (phase readiness) rather than *atomicity rules* (packet validation). A reader might incorrectly conclude that atomicity checks are manual.

**Recommendation:** Add an `automatable_atomicity` section to `mcp-capabilities.yaml`, or rename the top-level key to `automatable_phase_conditions` and add `automatable_packet_conditions` to make the scope explicit.

#### M-2: `getActiveContractSet` evaluates `context_budget >= 55%` but `estimateTokens` has ±30% accuracy, making threshold decisions unreliable
**File:** `enforcer.js:104-110`, `mcp-capabilities.yaml:55`

`estimateTokens` uses a naive heuristic (`enWords / 0.75 + cnChars`). The comment admits ±30% accuracy. If the true token count is near a threshold (e.g., estimated 54%, actual 70%), the contract activation decision is wrong. `context-compaction` is marked `manual` verification mode, so this is a guidance issue, not a hard gate. Still, automating a threshold with a ±30% estimator is risky.

**Recommendation:** Either (a) tighten the estimator using a proper tokenizer (e.g., `gpt-tokenizer` or `@anthropic-ai/tokenizer`), or (b) add a safety margin (e.g., trigger at 50% instead of 55% to account for +30% overestimation). Given the project's dependency on `js-yaml`, adding `gpt-tokenizer` is low friction.

#### M-3: `validatePacketAtomicity` silently skips unknown `check_type` values instead of warning
**File:** `enforcer.js:1598-1601`

```javascript
default:
  // Unknown check_type in atomicity-rules: skip silently to avoid false blocks
  break;
```

This is a conservative choice, but it means a typo in `atomicity-rules.yaml` (e.g., `check_type: word_cout`) is invisible. The config validator (`validateConfigs`) only validates `mechanical-conditions.yaml`, not `atomicity-rules.yaml`. A malformed atomicity rule will never fire, and no one will know until a manual audit.

**Recommendation:** Add `atomicity-rules.yaml` to the startup validation loop, or at minimum log a warning for unknown `check_type` in `validatePacketAtomicity`.

#### M-4: Token cost of 19 checkers × 10 tasks is not measured, but checker result YAMLs accumulate indefinitely
**File:** `enforcer.js:640-650`, `.claude/tasks/*/checkers/`

Each checker run produces a YAML result file named `<checker_id>-<timestamp>.yaml`. Over 10 tasks with 19 checkers each = 190 result files. Each file is ~500-1000 bytes. Total ~150-300 KB. Negligible.

However, the *context window* cost is not the file size but the text injected into prompts. The MCP tools return JSON summaries (e.g., `check_phase_readiness` returns gaps + warnings). If the caller (Claude Code) includes these summaries in the next prompt, the token cost is proportional to gap count. With 19 checkers, a failed readiness check could return 10-15 gap strings, each ~100 chars = ~1500 chars ≈ 500 tokens. This is acceptable.

The real concern is `getCheckerCatalog`, which returns the full catalog (19 checkers × ~10 fields each). That's ~2000 chars ≈ 700 tokens. Called rarely. Acceptable.

**Recommendation:** No immediate action. Monitor `checkers/` directory growth and add a retention policy (e.g., archive results older than 30 days) if disk usage becomes a concern.

---

### Low

#### L-1: `evaluateEffectiveScope` parses `"all Standard/Complex tasks"` as a bare string and fails the literal check
**File:** `enforcer.js:1380-1427`

The registry contains:
```yaml
completeness-audit:
  effective_scope: [all Standard/Complex tasks, any source material adaptation]
```

`evaluateEffectiveScope` does not handle `"all Standard/Complex tasks"`. It falls through to:
```javascript
const actual = context[str];
if (actual === undefined || actual === null || actual === false) return false;
```
`context["all Standard/Complex tasks"]` is undefined, so this returns `false`. The contract `completeness-audit` will never activate via `getActiveContractSet` unless the caller happens to set `context["all Standard/Complex tasks"] = true`, which is impossible.

This is currently harmless because `completeness-audit` is manual and not gate-bound, but it means the registry's `effective_scope` for this contract is effectively broken.

**Recommendation:** Fix the registry entry to use parseable expressions (e.g., `task_complexity=Standard|Complex`) or extend `evaluateEffectiveScope` to handle `all <category>` patterns.

#### L-2: `pre-tool-use-orchestrator.sh` uses `python3` for JSON parsing, creating a dependency that may not exist in minimal CI containers
**File:** `pre-tool-use-orchestrator.sh:17-20`

The Hook spawns `python3 -c '...'` four times per invocation. In a minimal Docker container or CI runner without Python, the Hook will fail, `call_helper` will return `"unavailable"`, and all Write/Edit operations will be hard-blocked. This is fail-closed, but it prevents operation entirely.

**Recommendation:** Rewrite the Hook's JSON extraction in pure Bash using `jq` (if available) or a minimal Node script (since Node is already required for the helper). Alternatively, make the Hook gracefully degrade by parsing only the essential fields with `sed`/`grep` if `python3` is missing.

#### L-3: `runBashChecker` timeout is hard-coded to 60s with no per-checker override
**File:** `enforcer.js:544`

Some checkers (e.g., `orphan-code-detection` scanning a large git history, or `assembly-interface-alignment-check` running a full type-check build) may legitimately exceed 60s. The current code kills them with SIGTERM and marks them `blocked`. This is a false negative — the checker didn't fail, it just needed more time.

**Recommendation:** Add an optional `timeout_ms` field to `checkers/index.yaml` entries, and read it in `runBashChecker`.

#### L-4: `agentOrchestrator` assigns agent IDs with millisecond-precision timestamps, which can collide under rapid calls
**File:** `enforcer.js:1608-1611`

```javascript
const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
return `ag-${role}-${packetId}-${ts}`;
```

The timestamp has 1-second granularity (`slice(0, 15)` covers `20260513T123456`). If two packets with the same `packet_id` are orchestrated in the same second, the IDs collide. The `agentsDir` write uses `fs.writeFileSync(agentFile, yaml.dump(doc))`, which would overwrite the previous agent file, losing state.

**Recommendation:** Append a random suffix or use `Date.now()` (millis) instead of `toISOString().slice(0,15)`.

---

### Informational

#### I-1: The spec itself (`CLAUDE.md` + contracts + checklists) consumes ~5-8k tokens, which is ~3-5% of a 200k context window
**File:** `.claude/CLAUDE.md` (~150 lines), `.claude/CLAUDE.md` (~161 lines), contracts, checklists

The user's question asks: "Does the spec itself consume too much context window? The `.claude/CLAUDE.md` is ~150 lines, plus contracts, plus checklists — how does this affect the 55/70/85 thresholds?"

**Measurement:**
- `.claude/CLAUDE.md` (project root): ~150 lines ≈ ~3000 tokens.
- `.claude/CLAUDE.md` (kernel): ~161 lines ≈ ~3200 tokens.
- `registry.yaml`: ~380 lines ≈ ~2500 tokens.
- 5 config YAMLs: ~300 lines ≈ ~1500 tokens.
- 8 checklists (estimated): ~800 lines ≈ ~4000 tokens.
- Total spec surface: ~14,200 tokens.

For a 200k context window (Claude 3.7 Sonnet), 14k tokens = 7%. This is below the 55% threshold and does not trigger `context-compaction`. It is also loaded once at session start, not on every turn.

**However**, if the conversation grows to 100k tokens (50% of window), the spec + conversation = 57%, which crosses the 55% threshold and triggers compaction. The spec itself is not the problem; the problem is the *combination* of spec + long conversation + large code blocks.

**Recommendation:** The current architecture is fine. If context pressure becomes real, consider:
1. Loading only the `action_family`-relevant contracts (already partially done via `getActiveContractSet`).
2. Summarizing checklists into a "compressed checklist" artifact for active tasks.
3. Using `context_budget_percent` to dynamically suppress non-essential contracts.

#### I-2: `request_phase_transition` has a duplicate "Step 6" comment (lines 1259 and 1243)
**File:** `enforcer.js:1243`, `enforcer.js:1259`

Cosmetic. The state update logic is labeled "Step 6" and the atomic write logic is also labeled "Step 6". The second should be "Step 7".

#### I-3: `test.js` Round 3 coverage for `validateBashCommand` is good but does not test `command.length > 10000` cap
**File:** `test.js:694-730`

The `testBashRedirectionDetection` tests `>`, `>>`, `tee`, and `/dev/null` filtering, but does not test the 10,000-character length cap or the heredoc stripping logic. These are defensive measures against regex backtracking attacks.

---

## Recommendations

| Priority | Item | Action | Owner |
|---------|------|--------|-------|
| P0 | C-1 Hook bypass for unhandled tools | Document or add catch-all matcher to Hook | Hook maintainer |
| P0 | H-1 Monolithic `enforcer.js` | Split into 6-7 sub-modules under `enforcer/` | Code maintainer |
| P1 | H-2 Process spawn overhead | Implement in-process JS checker runtime; spawn only for `.sh`/`.ps1` | Performance owner |
| P1 | H-3 Cache mtime granularity | Add `configCacheMaxAgeMs` or switch to `fs.watch` | Config owner |
| P1 | M-1 Atomicity automatable gap | Add `automatable_packet_conditions` to `mcp-capabilities.yaml` | Spec maintainer |
| P1 | M-2 Token estimator accuracy | Replace naive estimator with `gpt-tokenizer` or add safety margin | MCP owner |
| P2 | M-3 Silent skip of unknown atomicity check_type | Add `atomicity-rules.yaml` to startup validator | MCP owner |
| P2 | L-1 Broken `effective_scope` for `completeness-audit` | Fix registry entry to parseable expression | Registry maintainer |
| P2 | L-2 Python3 dependency in Hook | Provide `jq` or pure Bash fallback for JSON extraction | Hook maintainer |
| P2 | L-3 Hard-coded 60s checker timeout | Add `timeout_ms` to `checkers/index.yaml` schema | Checker maintainer |
| P2 | L-4 Agent ID collision | Use `Date.now()` or random suffix in ID generation | Orchestrator owner |
| P3 | I-1 Context budget impact | Monitor; no action needed until 100k+ token conversations | Context governance |
| P3 | I-2 Duplicate Step 6 comment | Rename second to Step 7 | Code maintainer |
| P3 | I-3 Missing length cap test | Add `command.length > 10000` test case | Test maintainer |
