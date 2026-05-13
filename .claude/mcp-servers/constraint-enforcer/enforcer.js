// enforcer.js — Core constraint logic for constraint-enforcer MCP Server
// 规范架构驱动版本：所有规则从 .claude/config/*.yaml 读取，零硬编码规范知识

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { spawn } from "child_process";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir) {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, ".claude", "checkers")) ||
      fs.existsSync(path.join(current, ".claude", "contracts"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

const PROJECT_ROOT = process.env.PROJECT_ROOT || findProjectRoot(__dirname);
const CONFIG_DIR = path.join(PROJECT_ROOT, ".claude", "config");

// ---------------------------------------------------------------------------
// Config cache (loaded once per process, can be invalidated)
// ---------------------------------------------------------------------------
let configCache = {};
let configMtimes = {};

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[loadYaml] Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

function loadConfig(configName) {
  const filePath = path.join(CONFIG_DIR, `${configName}.yaml`);
  if (!fs.existsSync(filePath)) return null;

  const mtime = fs.statSync(filePath).mtimeMs;
  if (configCache[configName] && configMtimes[configName] === mtime) {
    return configCache[configName];
  }

  const config = loadYaml(filePath);
  if (config) {
    configCache[configName] = config;
    configMtimes[configName] = mtime;
  }
  return config;
}

// Directory-level batch loading: 1 readdir + N stats instead of N separate calls (P-001 fix)
let allConfigsCacheTime = 0;
const ALL_CONFIG_NAMES = [
  "mechanical-conditions",
  "phase-state-machine",
  "write-permissions",
  "mcp-capabilities",
  "atomicity-rules",
  "agent-orchestration-rules",
];

function loadAllConfigs() {
  try {
    const dirStat = fs.statSync(CONFIG_DIR);
    const dirMtime = dirStat.mtimeMs;
    if (allConfigsCacheTime === dirMtime) {
      // Directory unchanged; all individual file caches are still valid
      return;
    }
    // Load all config files in one batch
    for (const name of ALL_CONFIG_NAMES) {
      loadConfig(name); // individual mtime cache still applies inside
    }
    allConfigsCacheTime = dirMtime;
  } catch (err) {
    // CONFIG_DIR may not exist; fall back to individual loads
  }
}

export function invalidateConfigCache() {
  configCache = {};
  configMtimes = {};
  allConfigsCacheTime = 0;
}

// ---------------------------------------------------------------------------
// Token estimation utility (F-004 fix)
// Approximation: EN words / 0.75 + CJK chars ≈ tokens
// Accuracy: ±30%; intended for budget threshold checks, not billing
// ---------------------------------------------------------------------------

export function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  const enWords = str.split(/\s+/).filter((w) => w.length > 0 && !/[\u4e00-\u9fff]/.test(w)).length;
  const cnChars = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.ceil(enWords / 0.75 + cnChars);
}

// ---------------------------------------------------------------------------
// Startup config validation — fail loud on unknown check_type or version mismatch
// ---------------------------------------------------------------------------

const SUPPORTED_CONFIG_VERSION_MIN = 1;
const SUPPORTED_CONFIG_VERSION_MAX = 1;

function getKnownCheckTypes() {
  const mc = loadConfig("mechanical-conditions");
  if (mc?.check_types && Array.isArray(mc.check_types) && mc.check_types.length > 0) {
    return new Set(mc.check_types);
  }
  // Fallback hard-coded set for backward compatibility during transition
  return new Set([
    "field_equals",
    "field_not_equals",
    "field_empty_or_null",
    "gate_results_all_passed",
    "file_exists_and_size_gt_0",
    "timestamp_freshness",
    "checker_result_status",
    "mandatory_checkers_all_passed_or_excepted",
    "evidence_lock_exists",
  ]);
}

function validateSchemaFields(name, cfg, schema) {
  const errors = [];
  if (!schema || !schema.required || !Array.isArray(schema.required)) return errors;
  for (const field of schema.required) {
    if (cfg[field] === undefined) {
      errors.push(`Config '${name}.yaml' missing required field: ${field}`);
    }
  }
  return errors;
}

function validateConfigs() {
  const errors = [];
  const configsToValidate = [
    { name: "mechanical-conditions", required: true },
    { name: "phase-state-machine", required: true },
    { name: "write-permissions", required: true },
    { name: "mcp-capabilities", required: true },
  ];

  for (const { name, required } of configsToValidate) {
    const cfg = loadConfig(name);
    if (!cfg) {
      if (required) errors.push(`Required config '${name}.yaml' is missing or unreadable.`);
      continue;
    }
    if (cfg.version !== undefined) {
      const v = Number(cfg.version);
      if (Number.isNaN(v) || v < SUPPORTED_CONFIG_VERSION_MIN || v > SUPPORTED_CONFIG_VERSION_MAX) {
        errors.push(
          `Config '${name}.yaml' version ${cfg.version} is not supported (supported: ${SUPPORTED_CONFIG_VERSION_MIN}-${SUPPORTED_CONFIG_VERSION_MAX}).`
        );
      }
    }
    // Optional extended validation: JSON Schema files in schemas/ are not required.
    // If present, they enable stricter field-level checks. Missing schemas are silently skipped.
    const schemaPath = path.join(CONFIG_DIR, "schemas", `${name}.schema.json`);
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
        errors.push(...validateSchemaFields(name, cfg, schema));
      } catch (e) {
        errors.push(`Failed to parse schema '${name}.schema.json': ${e.message}`);
      }
    }
  }

  const mc = loadConfig("mechanical-conditions");
  const knownTypes = getKnownCheckTypes();
  if (mc?.conditions) {
    for (const cond of mc.conditions) {
      if (cond.check_type && !knownTypes.has(cond.check_type)) {
        errors.push(
          `mechanical-conditions.yaml contains unknown check_type '${cond.check_type}' in condition '${cond.id}'. ` +
            `Known types: ${Array.from(knownTypes).join(", ")}. `
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error("[constraint-enforcer] CONFIG VALIDATION FAILED:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error("[constraint-enforcer] MCP tools may return errors until configs are fixed.");
  }
  return errors;
}

// Run once at module load
const startupValidationErrors = validateConfigs();

// ---------------------------------------------------------------------------
// Task resolution helpers
// ---------------------------------------------------------------------------

function findActiveTask(tasksDir) {
  if (!fs.existsSync(tasksDir)) return null;
  const dirs = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("tk-"))
    .map((d) => {
      const sf = path.join(tasksDir, d.name, "00-task-state.yaml");
      if (!fs.existsSync(sf)) return null;
      const stat = fs.statSync(sf);
      return { dir: path.join(tasksDir, d.name), mtime: stat.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  return dirs.length > 0 ? dirs[0].dir : null;
}

function resolveTaskDir(provided) {
  if (provided) return provided;
  const tasksDir = path.join(PROJECT_ROOT, ".claude", "tasks");
  return findActiveTask(tasksDir);
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hashDir(dirPath) {
  if (!fs.existsSync(dirPath)) return "";
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  const hashes = files
    .filter((f) => f.isFile())
    .map((f) => hashFile(path.join(dirPath, f.name)))
    .sort();
  return crypto.createHash("sha256").update(hashes.join("")).digest("hex");
}

// ---------------------------------------------------------------------------
// evaluateCondition — 配置驱动的机械条件评估引擎
// ---------------------------------------------------------------------------

async function evaluateCondition(cond, state, taskDir, checkerIndex = null) {
  const checkType = cond.check_type;

  switch (checkType) {
    case "field_equals": {
      const actual = state?.[cond.field];
      const passed = actual === cond.expected;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.description} (actual: '${actual}', expected: '${cond.expected}')`,
      };
    }

    case "field_not_equals": {
      const actual = state?.[cond.field];
      const passed = actual !== cond.expected;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.description} (actual: '${actual}')`,
      };
    }

    case "field_empty_or_null": {
      const val = state?.[cond.field];
      const isEmpty = !val || val === "" || val === '""' || val === "null" || val === null;
      return {
        passed: isEmpty,
        gap: isEmpty ? null : `Condition '${cond.id}': ${cond.description} (value exists: '${val}')`,
      };
    }

    case "gate_results_all_passed": {
      const prefix = cond.field_prefix || "gate_";
      const gates = Object.entries(state).filter(([k]) => k.startsWith(prefix));
      const failed = gates.filter(([_, v]) => v?.status !== "passed");

      // Verify expected gates from phase-state-machine config exist in state
      const psmConfig = loadConfig("phase-state-machine");
      const phaseDef = psmConfig?.phases?.find((p) => p.id === state?.phase);
      const expectedGates = phaseDef?.gates || [];
      const missingGates = [];
      for (const g of expectedGates) {
        const gateKey = `${prefix}${g}`;
        if (!state.hasOwnProperty(gateKey)) {
          missingGates.push(gateKey);
        }
      }

      const passed = failed.length === 0 && missingGates.length === 0;
      const failedMsg = failed.length > 0 ? `Gates not passed: ${failed.map(([k]) => k).join(", ")}` : "";
      const missingMsg = missingGates.length > 0 ? `Missing gate results: ${missingGates.join(", ")}` : "";
      const gapMsg = [failedMsg, missingMsg].filter(Boolean).join("; ");
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${gapMsg}`,
      };
    }

    case "file_exists_and_size_gt_0": {
      const relPath = state?.[cond.field];
      if (!relPath) {
        return { passed: false, gap: `Condition '${cond.id}': ${cond.description} (field '${cond.field}' is empty)` };
      }
      const filePath = path.join(taskDir, relPath);
      const exists = fs.existsSync(filePath);
      const size = exists ? fs.statSync(filePath).size : 0;
      const passed = exists && size > 0;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.description} (exists: ${exists}, size: ${size})`,
      };
    }

    case "timestamp_freshness": {
      const updatedAt = state?.[cond.state_field];
      const refPath = state?.[cond.reference_field];
      if (!updatedAt || !refPath) return { passed: true, gap: null };
      const artifactPath = path.join(taskDir, refPath);
      if (!fs.existsSync(artifactPath)) return { passed: true, gap: null };
      const artifactMtime = fs.statSync(artifactPath).mtimeMs;
      const updatedMs = new Date(updatedAt).getTime();
      const passed = updatedMs >= artifactMtime;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.description}`,
      };
    }

    case "checker_result_status": {
      let file = null;
      if (checkerIndex && checkerIndex.has(cond.checker_id)) {
        file = checkerIndex.get(cond.checker_id);
      } else {
        const checkerDir = path.join(taskDir, "checkers");
        file =
          fs.existsSync(checkerDir) &&
          fs.readdirSync(checkerDir).find(
            (f) =>
              f.includes(cond.checker_id) && f.endsWith(".yaml") && !f.startsWith("evidence-lock")
          );
      }
      if (!file) {
        return { passed: false, gap: `Condition '${cond.id}': Checker result not found for ${cond.checker_id}` };
      }
      const doc = loadYaml(path.join(taskDir, "checkers", file));
      const status = doc?.status || "";
      const passed = status === cond.expected;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.checker_id} status is '${status}', not '${cond.expected}'`,
      };
    }

    case "mandatory_checkers_all_passed_or_excepted": {
      const routeFile = path.join(taskDir, "route-projection.yaml");
      const route = loadYaml(routeFile);
      const mandatory = route?.[cond.field] || [];
      const checkerDir = path.join(taskDir, "checkers");
      const mgaps = [];
      for (const c of mandatory) {
        const cid = String(c).trim();
        if (!cid) continue;
        let resultFile = null;
        if (checkerIndex && checkerIndex.has(cid)) {
          resultFile = checkerIndex.get(cid);
        } else if (fs.existsSync(checkerDir)) {
          resultFile = fs.readdirSync(checkerDir).find(
            (f) => f.includes(cid) && f.endsWith(".yaml") && !f.startsWith("evidence-lock")
          );
        }
        if (!resultFile) {
          mgaps.push(`Mandatory checker not run: ${cid}`);
          continue;
        }
        const doc = loadYaml(path.join(checkerDir, resultFile));
        const st = doc?.status || "";
        if (st !== "passed" && st !== "excepted") {
          mgaps.push(`Mandatory checker ${st}: ${cid} (${resultFile})`);
        }
      }
      const passed = mgaps.length === 0;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${mgaps.join("; ")}`,
      };
    }

    case "evidence_lock_exists": {
      const phase = state?.phase || "unknown";
      const exempt = cond.exempt_phases || [];
      if (exempt.includes(phase)) return { passed: true, gap: null };
      const checkerDir = path.join(taskDir, "checkers");
      const evLock = path.join(checkerDir, `evidence-lock-${phase}.yaml`);
      const passed = fs.existsSync(evLock);
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': Evidence lock missing: checkers/evidence-lock-${phase}.yaml`,
      };
    }

    default: {
      // M-3 fix: consult unknown_check_type_policy from mcp-capabilities.yaml
      const mcpCap = loadConfig("mcp-capabilities");
      const policy = mcpCap?.behavior?.unknown_check_type_policy;
      if (policy?.do_not_block) {
        const warning = `Condition '${cond.id}': Unknown check_type '${checkType}' — ${policy.fallback_status || "manual_review_required"}.`;
        if (policy.log_warning) {
          console.error("[MCP Policy]", warning);
        }
        return {
          passed: true,
          gap: null,
          warning,
        };
      }
      return {
        passed: false,
        gap: `Condition '${cond.id}': Unknown check_type '${checkType}' — no handler implemented. This is a configuration error.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// check_phase_readiness — 配置驱动
// ---------------------------------------------------------------------------

export async function checkPhaseReadiness(args = {}) {
  loadAllConfigs(); // Batch preload to reduce per-file stat overhead (P-001 fix)
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { ready: false, gaps: ["No active task found."], warnings: [] };
  }

  const taskId = path.basename(taskDir);
  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { ready: false, gaps: ["00-task-state.yaml missing or unreadable."], warnings: [] };
  }

  const phase = state.phase || "unknown";
  const phaseStatus = state.phase_status || "unknown";
  const gaps = [];
  const warnings = [];

  // Phase status check: always report as hard gap if not passed, but still evaluate all conditions
  // so that warnings (including soft blockers) are surfaced even when phase is not passed
  if (phaseStatus !== "passed") {
    gaps.push(`Phase status is '${phaseStatus}', not passed.`);
  }

  // Pre-index checker results to eliminate repeated readdirSync (P-002 fix)
  const checkerDir = path.join(taskDir, "checkers");
  const checkerIndex = new Map();
  if (fs.existsSync(checkerDir)) {
    for (const f of fs.readdirSync(checkerDir)) {
      if (!f.endsWith(".yaml") || f.startsWith("evidence-lock")) continue;
      const base = f.replace(/\.yaml$/, "");
      const dashIdx = base.lastIndexOf("-");
      const cid = dashIdx > 0 ? base.slice(0, dashIdx) : base;
      if (!checkerIndex.has(cid)) checkerIndex.set(cid, f);
    }
  }

  // Load config-driven conditions
  const config = loadConfig("mechanical-conditions");
  const conditions = config?.conditions || [];

  if (conditions.length > 0) {
    for (const cond of conditions) {
      const result = await evaluateCondition(cond, state, taskDir, checkerIndex);
      if (!result.passed) {
        if (cond.blocker_level === "hard") {
          gaps.push(result.gap);
        } else {
          warnings.push(result.gap);
        }
      }
    }
  }

  const auditorRequired = gaps.some((g) => g && g.includes("auditor_verdict_audited"));

  return {
    taskId,
    phase,
    phaseStatus,
    ready: gaps.length === 0,
    gaps,
    warnings,
    auditorRequired,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// run_mandatory_checkers
// ---------------------------------------------------------------------------

function runBashChecker(scriptPath, cwd, checkerRoot) {
  // Security: path traversal guard
  const resolved = path.resolve(scriptPath);
  const resolvedRoot = path.resolve(checkerRoot);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return Promise.resolve({
      output: `[BLOCKED] scriptPath escapes checkerRoot: ${scriptPath}`,
      status: "blocked",
      exitCode: 1,
    });
  }

  // Security: extension whitelist (H-5 + M-2 fix)
  const ext = path.extname(resolved).toLowerCase();
  const allowedExts = [".sh", ".ps1", ".js"];
  if (!allowedExts.includes(ext)) {
    return Promise.resolve({
      output: `[BLOCKED] disallowed script extension: ${ext}`,
      status: "blocked",
      exitCode: 1,
    });
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const timeoutMs = 60000;
    const isWin = process.platform === "win32";
    let shell, shellArgs;
    if (ext === ".ps1" && isWin) {
      shell = "powershell";
      shellArgs = ["-File", scriptPath, cwd];
    } else if (ext === ".js") {
      shell = "node";
      shellArgs = [scriptPath, cwd];
    } else {
      shell = "bash";
      shellArgs = [scriptPath, cwd];
    }
    const child = spawn(shell, shellArgs, { cwd, timeout: timeoutMs });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code, signal) => {
      const output = stdout + stderr;
      if (signal === "SIGTERM" || code === null) {
        resolve({ output: output + "\n[TIMED OUT]", status: "blocked", exitCode: -1 });
        return;
      }
      // §10.1 precise status mapping — prefer structured last line
      const lines = output.trim().split(/\r?\n/);
      const lastLine = lines[lines.length - 1] || "";
      const structuredMatch = lastLine.match(/__STATUS__:(passed|failed|blocked|warning)/i);
      if (structuredMatch) {
        resolve({ output, status: structuredMatch[1].toLowerCase(), exitCode: code });
        return;
      }
      // Fallback to legacy string matching
      if (code !== 0) {
        resolve({ output, status: "blocked", exitCode: code });
        return;
      }
      if (output.includes("FAILED") || output.includes("ERROR")) {
        resolve({ output, status: "failed", exitCode: code });
        return;
      }
      if (output.includes("PASSED")) {
        resolve({ output, status: "passed", exitCode: code });
        return;
      }
      resolve({ output, status: "failed", exitCode: code });
    });
  });
}

export async function runMandatoryCheckers(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { success: false, summary: "No active task found." };
  }

  const taskId = path.basename(taskDir);

  // Dual-source: task-level override first, then registry-derived fallback
  let mandatory = [];
  const routeFile = path.join(taskDir, "route-projection.yaml");
  const route = loadYaml(routeFile);
  if (route?.mandatory_checkers && Array.isArray(route.mandatory_checkers)) {
    mandatory = route.mandatory_checkers;
  }

  // If no task-level projection, try to derive from registry + context
  if (mandatory.length === 0) {
    const stateFile = path.join(taskDir, "00-task-state.yaml");
    const state = loadYaml(stateFile);
    if (state) {
      const activeSet = await getActiveContractSetInternal({
        action_family: state.action_family || "implementation",
        phase: state.phase || "build",
        delivery_mode: state.delivery_mode || "full",
      });
      if (activeSet.success) {
        mandatory = activeSet.mandatory_checkers || [];
      }
    }
  }

  if (mandatory.length === 0) {
    return { success: true, taskId, summary: "No mandatory_checkers defined." };
  }

  const checkerRoot = path.join(PROJECT_ROOT, ".claude", "checkers");
  const taskCheckerDir = path.join(taskDir, "checkers");
  if (!fs.existsSync(taskCheckerDir)) {
    fs.mkdirSync(taskCheckerDir, { recursive: true });
  }

  const filter = args.checkerFilter
    ? args.checkerFilter.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);

  // Pre-index existing checker results to eliminate repeated readdirSync (P-002 fix)
  const existingCheckerFiles = fs.existsSync(taskCheckerDir)
    ? fs.readdirSync(taskCheckerDir).filter((f) => f.endsWith(".yaml") && !f.startsWith("evidence-lock"))
    : [];
  const existingByChecker = new Map();
  for (const f of existingCheckerFiles) {
    // Extract checker_id from filename (format: <checker_id>-<timestamp>.yaml)
    const base = f.replace(/\.yaml$/, "");
    const dashIdx = base.lastIndexOf("-");
    const cid = dashIdx > 0 ? base.slice(0, dashIdx) : base;
    if (!existingByChecker.has(cid)) existingByChecker.set(cid, f);
  }

  const tasks = [];
  for (const c of mandatory) {
    const checkerId = String(c).trim();
    if (!checkerId) continue;
    if (filter && !filter.includes(checkerId)) continue;

    // Skip if already has a result
    const existing = existingByChecker.get(checkerId);
    if (existing) {
      tasks.push(() => Promise.resolve({ checkerId, action: "SKIP", file: existing }));
      continue;
    }

    const runId = `${checkerId}-${runTimestamp}`;
    const resultFile = path.join(taskCheckerDir, `${runId}.yaml`);

    let scriptPath = path.join(checkerRoot, `${checkerId}.sh`);
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(checkerRoot, `${checkerId}.ps1`);
    }

    if (!fs.existsSync(scriptPath)) {
      // Placeholder result
      const doc = {
        checker_run_id: runId,
        checker_id: checkerId,
        task_id: taskId,
        run_at: new Date().toISOString(),
        mode: "manual",
        status: "manual_pending",
        target_ref: taskDir,
        summary: `Checker script not found: ${checkerId}`,
        evidence_ref: "",
        gate_binding: "",
        failure_detail: {
          affected_gate: "",
          severity: "",
          description: "Checker implementation is placeholder. Manual verification required.",
          remediation_hint: `Implement ${checkerId}.sh or provide manual evidence.`,
        },
        manual_evidence: {
          method: "pending",
          result: "",
          evidence_path: "",
          reviewed_by: "",
        },
        legacy_text_output: "",
      };
      fs.writeFileSync(resultFile, yaml.dump(doc));
      tasks.push(() => Promise.resolve({ checkerId, action: "PENDING", file: `${runId}.yaml` }));
      continue;
    }

    // Async checker execution task
    tasks.push(async () => {
      const { output, status } = await runBashChecker(scriptPath, PROJECT_ROOT, checkerRoot);
      const doc = {
        checker_run_id: runId,
        checker_id: checkerId,
        task_id: taskId,
        run_at: new Date().toISOString(),
        mode: "automated",
        status,
        target_ref: taskDir,
        summary: "Auto-run by constraint-enforcer MCP Server",
        evidence_ref: `checkers/${runId}.yaml`,
        gate_binding: "",
        failure_detail: {
          affected_gate: "",
          severity: "",
          description: "",
          remediation_hint: "",
        },
        manual_evidence: {
          method: "",
          result: "",
          evidence_path: "",
          reviewed_by: "",
        },
        legacy_text_output: output,
      };
      fs.writeFileSync(resultFile, yaml.dump(doc));
      return { checkerId, action: status.toUpperCase(), file: `${runId}.yaml` };
    });
  }

  // Bounded concurrency: max 3 parallel checkers (P-003 fix)
  const MAX_CONCURRENCY = 3;
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = { checkerId: "unknown", action: "ERROR", error: err.message };
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return {
    success: true,
    taskId,
    results,
    summary: `Processed ${results.length} checker(s) with max ${MAX_CONCURRENCY} concurrency.`,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// validate_write_permission — 读取 write-permissions.yaml
// ---------------------------------------------------------------------------

function isSensitiveFile(normPath, patterns) {
  for (const p of patterns || []) {
    const re = new RegExp(p.regex);
    if (re.test(normPath)) {
      if (p.exclude && normPath.includes(p.exclude)) continue;
      return { sensitive: true, name: p.name };
    }
  }
  return { sensitive: false };
}

function checkProtectedTransitions(newContent, state, readiness) {
  const wpConfig = loadConfig("write-permissions");
  const protectedTrans = wpConfig?.protected_transitions || [];

  let parsed = null;
  if (newContent) {
    try {
      parsed = yaml.load(newContent);
    } catch {
      parsed = null;
    }
  }

  for (const pt of protectedTrans) {
    const forbidden = pt.forbidden_values || [];
    const actual = parsed?.[pt.target_field];
    if (actual !== undefined && forbidden.includes(actual)) {
      if (pt.requires_readiness && !readiness.ready) {
        return { blocked: true, reason: `BLOCKED: ${pt.reason}` };
      }
    }
  }

  // Fallback regex for unparsed content
  if (!parsed && newContent) {
    for (const pt of protectedTrans) {
      const forbidden = pt.forbidden_values || [];
      for (const fv of forbidden) {
        const regex = new RegExp(`${pt.target_field}\\s*:\\s*${fv}`);
        if (regex.test(newContent)) {
          if (pt.requires_readiness && !readiness.ready) {
            return { blocked: true, reason: `BLOCKED: ${pt.reason}` };
          }
        }
      }
    }
  }

  return { blocked: false };
}

export async function validateWritePermission(args = {}) {
  loadAllConfigs(); // Batch preload (P-001 fix)
  const taskDir = resolveTaskDir(args.taskDir);
  const filePath = args.filePath || "";

  if (!filePath) {
    return { allowed: false, reason: "filePath is required." };
  }

  const normPath = filePath.replace(/\\/g, "/");

  // If no active task, block sensitive operations (fail-closed)
  if (!taskDir) {
    return { allowed: false, reason: "BLOCKED: No active task found; cannot validate permission." };
  }

  // Security: null-byte / control character guard
  if (/[\x00-\x1f]/.test(filePath)) {
    return { allowed: false, reason: "BLOCKED: Path contains control characters." };
  }

  // Security: path traversal guard with symlink resolution (H-4 fix)
  let resolvedFile, resolvedTaskDir;
  try {
    resolvedTaskDir = path.normalize(fs.realpathSync(taskDir));
    const rawResolved = path.normalize(path.resolve(filePath));
    resolvedFile = fs.existsSync(rawResolved) ? path.normalize(fs.realpathSync(rawResolved)) : rawResolved;
  } catch (err) {
    return { allowed: false, reason: "BLOCKED: Cannot resolve file path for security check." };
  }
  const relativeToTask = path.relative(resolvedTaskDir, resolvedFile);
  const isOutsideTask = relativeToTask.startsWith("..") || path.isAbsolute(relativeToTask) || relativeToTask === "";
  if (isOutsideTask) {
    return { allowed: false, reason: "BLOCKED: filePath escapes task directory." };
  }

  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { allowed: false, reason: "BLOCKED: Task state unreadable; cannot validate permission." };
  }

  const phaseStatus = state.phase_status || "unknown";

  // Load write-permissions config
  const wpConfig = loadConfig("write-permissions");

  // Role-based permission check (P1-1 fix)
  const role = args.role || "";
  const roleDef = wpConfig?.roles?.find((r) => r.id === role);
  if (roleDef && roleDef.blocks) {
    for (const block of roleDef.blocks) {
      const regexStr = block.pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");
      const blockRe = new RegExp(regexStr);
      if (blockRe.test(normPath)) {
        return {
          allowed: false,
          reason: `BLOCKED: Role '${role}' cannot write ${normPath} per write-permissions.yaml.`,
        };
      }
    }
  }

  const patterns = wpConfig?.sensitive_patterns || [];
  const sensitivity = isSensitiveFile(normPath, patterns);

  if (!sensitivity.sensitive) {
    return { allowed: true, reason: "Non-sensitive file; operation allowed." };
  }

  // Calculate readiness early for all sensitive checks
  const readiness = await checkPhaseReadiness({ taskDir });

  // State file specific checks with YAML parsing
  if (sensitivity.name === "state_file") {
    const newContent = args.newContent || "";
    if (!newContent) {
      return { allowed: false, reason: "BLOCKED: state file operation requires newContent for tamper detection." };
    }

    const ptResult = checkProtectedTransitions(newContent, state, readiness);
    if (ptResult.blocked) {
      return { allowed: false, reason: ptResult.reason };
    }

    // Allow setting phase_status to passed when readiness is satisfied
    let parsed = null;
    try {
      parsed = yaml.load(newContent);
    } catch {
      parsed = null;
    }
    const newPhaseStatus = parsed?.phase_status || "";
    if (newPhaseStatus === "passed" && readiness.ready) {
      return { allowed: true, reason: "Phase status transition to passed approved; all mechanical conditions satisfied." };
    }
  }

  // For non-state sensitive files, block if not in progress or readiness not ready
  const isInProgress = phaseStatus === "in_progress" || phaseStatus === "in_review";
  if (!isInProgress) {
    return { allowed: false, reason: `BLOCKED: task phase_status is '${phaseStatus}', not in_progress or in_review.` };
  }

  if (!readiness.ready) {
    return {
      allowed: false,
      reason: `BLOCKED: mechanical gaps exist — ${readiness.gaps.join("; ")}. Run run_mandatory_checkers first.`,
    };
  }

  return { allowed: true, reason: "All mechanical conditions satisfied; sensitive operation allowed." };
}

// ---------------------------------------------------------------------------
// Bash redirection detection (P0-2 fix)
// Extracts file targets from Bash redirects (>, >>, 2>, | tee, etc.) and
// validates each target via validateWritePermission.
// ---------------------------------------------------------------------------

function extractBashRedirectionTargets(command) {
  if (!command || typeof command !== "string") return [];
  // Length cap to prevent regex backtracking attacks (P0-2 fix)
  if (command.length > 10000) return [];

  // Strip heredoc bodies to avoid matching > inside heredoc content.
  // Heredoc start: <<EOF, <<'EOF', <<-EOF. We remove everything after the marker
  // on the same line and all subsequent lines until the closing delimiter.
  // This is a best-effort filter for single-line command strings.
  const lines = command.split("\n");
  let inHeredoc = false;
  let heredocDelim = null;
  const filteredLines = [];
  for (const line of lines) {
    if (inHeredoc) {
      if (line.trim() === heredocDelim) {
        inHeredoc = false;
        heredocDelim = null;
      }
      continue;
    }
    const heredocMatch = line.match(/<<\s*[-]?\s*['"]?([A-Za-z_]\w*)['"]?/);
    if (heredocMatch) {
      heredocDelim = heredocMatch[1];
      inHeredoc = true;
      // Keep the heredoc start line so that redirects on the same line (e.g. <<EOF > file)
      // are still processed by the regex below.
      filteredLines.push(line);
      continue;
    }
    filteredLines.push(line);
  }
  const cmd = filteredLines.join("\n");

  const targets = [];
  // Match >file, >> file, 2>file, &>file, etc.
  const redirectRe = /\d*\s*[>][&>]?\s*(\S+)/g;
  let m;
  while ((m = redirectRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  // Match | tee file, | tee -a file
  const teeRe = /\|\s*tee\s+(?:-[a-z]+\s+)?(\S+)/g;
  while ((m = teeRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  // Match process substitution output: >(tee -a file) or >(cat > file)
  const procSubRe = />\s*\(\s*(?:tee\s+(?:-[a-z]+\s+)?|cat\s+(?:-[a-z]+\s+)*[>]?\s*)(\S+)\s*\)/g;
  while ((m = procSubRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  // Filter out safe prefixes and process substitution artifacts
  return targets.filter((t) => !t.startsWith("/dev/") && t !== "-" && !t.startsWith("(") && !t.includes(")"));
}

export async function validateBashCommand(args = {}) {
  const { command, taskDir, role } = args;
  // Input validation (P0-2 fix)
  if (!command || typeof command !== "string") {
    return { allowed: false, reason: "Bash command is missing or not a string." };
  }
  if (command.length === 0) {
    return { allowed: true, reason: "Empty command — no redirection to validate." };
  }
  if (command.length > 10000) {
    return { allowed: false, reason: "Bash command exceeds maximum length (10000 chars)." };
  }

  const targets = extractBashRedirectionTargets(command);
  if (targets.length === 0) {
    return { allowed: true, reason: "No file-writing redirection detected." };
  }
  for (const target of targets) {
    const resolvedTarget = path.isAbsolute(target) ? target : path.join(taskDir || process.cwd(), target);
    const result = await validateWritePermission({
      filePath: resolvedTarget,
      operation: "Write",
      role,
      taskDir,
    });
    if (!result.allowed) {
      return { ...result, reason: `Bash redirect target blocked: ${target} — ${result.reason}` };
    }
  }
  return { allowed: true, reason: "All redirection targets allowed." };
}

// ---------------------------------------------------------------------------
// generate_evidence_lock
// ---------------------------------------------------------------------------

export async function generateEvidenceLock(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { success: false, reason: "No active task found." };
  }

  const taskId = path.basename(taskDir);
  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { success: false, reason: "00-task-state.yaml missing." };
  }

  const phase = state.phase || "unknown";
  const checkerDir = path.join(taskDir, "checkers");

  // Collect checker results
  const checkerResults = [];
  if (fs.existsSync(checkerDir)) {
    const files = fs.readdirSync(checkerDir).filter((f) => f.endsWith(".yaml") && !f.startsWith("evidence-lock"));
    for (const f of files) {
      const fp = path.join(checkerDir, f);
      const doc = loadYaml(fp);
      if (doc) {
        checkerResults.push({
          checker_id: doc.checker_id || f,
          status: doc.status || "unknown",
          run_at: doc.run_at || "",
          file: f,
          hash: hashFile(fp),
        });
      }
    }
  }

  // Collect gate results from state object
  const gateResults = [];
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith("gate_") && value && typeof value === "object") {
      gateResults.push({
        gate: key,
        status: value.status || "unknown",
        reviewer: value.reviewer || "",
        reviewed_at: value.reviewed_at || "",
      });
    }
  }

  // Artifact hash
  const artifactsDir = path.join(taskDir, "artifacts");
  const artifactHash = hashDir(artifactsDir);

  // Build evidence lock document per §4.5 schema
  const primaryArtifact = state.current_primary_artifact || "";
  const primaryArtifactHash = primaryArtifact ? hashFile(path.join(taskDir, primaryArtifact)) : artifactHash;

  const artifactFiles = [];
  if (fs.existsSync(artifactsDir)) {
    const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) artifactFiles.push(e.name);
    }
  }

  // Determine manual gates pending from phase-state-machine config
  const psmConfig = loadConfig("phase-state-machine");
  const phaseDef = psmConfig?.phases?.find((p) => p.id === phase);
  const manualGates = (phaseDef?.gates || []).filter((g) => g === "value"); // value gate is manual-only per mcp-capabilities

  const lockDoc = {
    evidence_lock: {
      task_id: taskId,
      phase,
      locked_at: new Date().toISOString(),
      generator: "constraint-enforcer MCP Server",
      mandatory_checkers: checkerResults.map((c) => {
        const normalizedStatus = c.status === "passed" || c.status === "excepted" ? c.status : "failed";
        return {
          checker_id: c.checker_id,
          result_ref: `checkers/${c.file}`,
          status: normalizedStatus,
          exception_ref: normalizedStatus === "excepted" ? "verification_exception" : "",
        };
      }),
      gate_results: gateResults.map((g) => ({
        gate: g.gate,
        status: g.status,
        receipt_ref: `reviews/receipt-${g.gate}.yaml`,
      })),
      artifact_hash: primaryArtifactHash,
      artifact_files: artifactFiles,
      integrity: {
        checker_count: checkerResults.length,
        gate_count: gateResults.length,
        all_checkers_passed: checkerResults.every((c) => c.status === "passed" || c.status === "excepted"),
      },
      manual_gates_pending: manualGates,
    },
  };

  const lockFile = path.join(checkerDir, `evidence-lock-${phase}.yaml`);
  if (!fs.existsSync(checkerDir)) {
    fs.mkdirSync(checkerDir, { recursive: true });
  }
  fs.writeFileSync(lockFile, yaml.dump(lockDoc));

  return {
    success: true,
    taskId,
    phase,
    lockFile: `checkers/evidence-lock-${phase}.yaml`,
    checkerCount: checkerResults.length,
    gateCount: gateResults.length,
    allPassed: lockDoc.evidence_lock.integrity.all_checkers_passed,
    manualGatesPending: manualGates,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// request_phase_transition — 读取 phase-state-machine.yaml
// ---------------------------------------------------------------------------

export async function requestPhaseTransition(args = {}) {
  loadAllConfigs(); // Batch preload (P-001 fix)
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { success: false, reason: "No active task found." };
  }

  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { success: false, reason: "00-task-state.yaml missing." };
  }

  const phase = state.phase || "unknown";
  const phaseStatus = state.phase_status || "unknown";

  if (phaseStatus !== "passed") {
    return { success: false, reason: `Phase status is '${phaseStatus}', not passed.` };
  }

  // Step 1: Check readiness
  const readiness = await checkPhaseReadiness({ taskDir });
  if (!readiness.ready) {
    return {
      success: false,
      reason: "Mechanical gaps detected.",
      gaps: readiness.gaps,
      auditorRequired: readiness.auditorRequired,
      recommendation: "Run run_mandatory_checkers to auto-fix checker gaps, then retry.",
    };
  }

  // Step 2: Generate evidence lock
  const lockResult = await generateEvidenceLock({ taskDir });
  if (!lockResult.success) {
    return { success: false, reason: `Evidence lock generation failed: ${lockResult.reason}` };
  }

  // Step 3: Determine next phase from config
  const psmConfig = loadConfig("phase-state-machine");
  const phases = psmConfig?.phases || [];
  const phaseDef = phases.find((p) => p.id === phase);

  let nextPhase = args.nextPhase;
  if (!nextPhase) {
    nextPhase = phaseDef?.next || phase;
  }

  const validPhases = phases.map((p) => p.id);
  if (!validPhases.includes(nextPhase)) {
    return { success: false, reason: `Invalid nextPhase: '${nextPhase}'.` };
  }

  // Step 4: Check manual gates
  const capsConfig = loadConfig("mcp-capabilities");
  const manualGatePolicy = capsConfig?.behavior?.manual_gate_pending_policy || {};
  const manualGatesPending = lockResult.manualGatesPending || [];

  if (manualGatesPending.length > 0 && manualGatePolicy.block_transition) {
    return {
      success: false,
      reason: `Manual gates pending: ${manualGatesPending.join(", ")}`,
      recommendation: "Complete manual review for value gate before transition.",
    };
  }

  // Step 5: Auditor verdict check
  const auditorVerdict = state.auditor_verdict || "";
  if (auditorVerdict !== "audited") {
    return {
      success: false,
      reason: auditorVerdict
        ? `Auditor verdict is '${auditorVerdict}', not 'audited'.`
        : "Auditor verdict is missing. Auditor review has not been triggered or completed.",
      auditorRequired: true,
      recommendation: "Trigger Auditor Agent review and ensure verdict='audited' before transition.",
    };
  }

  // Step 6: Update state file (atomic write)
  state.phase = nextPhase;
  state.phase_status = "in_progress";
  state.updated_at = new Date().toISOString();
  state.phase_transition_history = state.phase_transition_history || [];
  state.phase_transition_history.push({
    from: phase,
    to: nextPhase,
    at: new Date().toISOString(),
    evidence_lock: lockResult.lockFile,
    triggered_by: "constraint-enforcer MCP Server",
  });

  if (manualGatesPending.length > 0) {
    state.manual_gates_pending = manualGatesPending;
  }

  // Step 6: Atomic state write with rollback on failure (R-006 fix)
  const tempFile = `${stateFile}.tmp`;
  let originalContent = null;
  let writeError = null;
  try {
    // Snapshot original state for rollback
    if (fs.existsSync(stateFile)) {
      originalContent = fs.readFileSync(stateFile, "utf8");
    }
    fs.writeFileSync(tempFile, yaml.dump(state));
    fs.renameSync(tempFile, stateFile);
  } catch (err) {
    writeError = err;
    // Rollback: restore original content if snapshot exists
    if (originalContent !== null) {
      try {
        fs.writeFileSync(stateFile, originalContent);
      } catch (restoreErr) {
        // If restore also fails, at least tempFile has the new state
        console.error("CRITICAL: State file write failed AND rollback failed:", restoreErr.message);
      }
    }
    // Cleanup temp file
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore cleanup errors
    }
  }

  if (writeError) {
    return {
      success: false,
      reason: `State file atomic write failed: ${writeError.message}. Task state was NOT modified.`,
      recommendation: "Check disk space and file permissions, then retry.",
    };
  }

  return {
    success: true,
    taskId: path.basename(taskDir),
    fromPhase: phase,
    toPhase: nextPhase,
    evidenceLock: lockResult.lockFile,
    checkerCount: lockResult.checkerCount,
    gateCount: lockResult.gateCount,
    manualGatesPending: manualGatesPending.length > 0 ? manualGatesPending : undefined,
    auditorRequired: false,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// get_checker_catalog — 从 registry.yaml 聚合 minimum checkers
// ---------------------------------------------------------------------------

function loadRegistryYaml() {
  const filePath = path.join(PROJECT_ROOT, ".claude", "contracts", "registry.yaml");
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  try {
    return yaml.load(content);
  } catch (err) {
    console.error(`[loadRegistryYaml] Failed to parse registry.yaml: ${err.message}`);
    return null;
  }
}

function getMinimumCheckerIdsFromRegistry() {
  const registry = loadRegistryYaml();
  const ids = new Set();
  for (const [, contract] of Object.entries(registry?.contracts || {})) {
    if (contract.status === "active" && Array.isArray(contract.checker_refs)) {
      contract.checker_refs.forEach((id) => ids.add(id));
    }
  }
  return Array.from(ids);
}

export async function getCheckerCatalog() {
  const indexFile = path.join(PROJECT_ROOT, ".claude", "checkers", "index.yaml");
  const index = loadYaml(indexFile);
  if (!index) {
    return { success: false, reason: "checkers/index.yaml not found or unreadable." };
  }

  const rawCheckers = index.checkers || {};
  const checkers = Array.isArray(rawCheckers)
    ? rawCheckers
    : Object.entries(rawCheckers)
        .filter(([, v]) => v && typeof v === "object")
        .map(([k, v]) => ({ id: k, ...v }));

  const minimumIds = getMinimumCheckerIdsFromRegistry();
  const catalogIds = new Set(checkers.map((c) => c.id));
  const missing = minimumIds.filter((id) => !catalogIds.has(id));

  return {
    success: true,
    count: checkers.length,
    minimum_required: minimumIds.length,
    minimum_met: missing.length === 0,
    missing_minimum: missing,
    checkers: checkers.map((c) => ({
      id: c.id || "",
      name: c.name || "",
      description: c.description || "",
      scope: c.scope || "",
      output_schema: c.output_schema || "",
      structured_output_required: c.structured_output_required || false,
      implementation_status: c.implementation_status || "unknown",
      fallback_manual_evidence: c.fallback_manual_evidence || "",
    })),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// get_active_contract_set — 新增：Registry 感知契约激活
// ---------------------------------------------------------------------------

function evaluateEffectiveScope(scopeList, context) {
  if (!Array.isArray(scopeList)) scopeList = [scopeList];

  for (const expr of scopeList) {
    const str = String(expr).trim();

    // Universal match
    if (str === "all" || str === "all tasks" || str === "all phases" || str === "all files") {
      continue;
    }

    // Numeric comparison: key >= value
    let m = str.match(/^(\w+)\s*>=\s*(\d+)%?$/);
    if (m) {
      const [, key, val] = m;
      const actual = parseFloat(context[key]) || 0;
      if (actual < parseFloat(val)) return false;
      continue;
    }

    // Numeric comparison: key <= value
    m = str.match(/^(\w+)\s*<=\s*(\d+)%?$/);
    if (m) {
      const [, key, val] = m;
      const actual = parseFloat(context[key]) || 0;
      if (actual > parseFloat(val)) return false;
      continue;
    }

    // Equality: key=value or key=A|B
    m = str.match(/^(\w+)\s*=\s*(.+)$/);
    if (m) {
      const [, key, val] = m;
      const actual = context[key];
      const alternatives = val.split("|").map((s) => s.trim());
      if (!alternatives.includes(String(actual))) return false;
      continue;
    }

    // Bare domain strings that act as catch-all for that domain
    // e.g., "all Standard/Complex tasks" — we skip unknown syntax rather than fail
    // Unknown expressions are treated as "must match literally" against context
    const actual = context[str];
    if (actual === undefined || actual === null || actual === false) return false;
  }

  return true;
}

function getActiveContractSetInternal(context) {
  const registry = loadRegistryYaml();
  if (!registry || !registry.contracts) {
    return { success: false, reason: "registry.yaml not found or unreadable." };
  }

  const activeContracts = [];
  const allCheckerRefs = new Set();
  const allChecklistRefs = new Set();
  const dependencyGraph = {};

  for (const [contractId, contract] of Object.entries(registry.contracts)) {
    if (contract.status !== "active") continue;

    const scope = contract.effective_scope || [];
    if (evaluateEffectiveScope(scope, context)) {
      activeContracts.push({
        id: contractId,
        version: contract.version || 1,
        checker_refs: contract.checker_refs || [],
        checklist_refs: contract.checklist_refs || [],
        depends_on: contract.depends_on || [],
        description: contract.description || "",
      });
      (contract.checker_refs || []).forEach((id) => allCheckerRefs.add(id));
      (contract.checklist_refs || []).forEach((id) => allChecklistRefs.add(id));
      dependencyGraph[contractId] = contract.depends_on || [];
    }
  }

  return {
    success: true,
    active_contracts: activeContracts,
    mandatory_checkers: Array.from(allCheckerRefs),
    mandatory_checklists: Array.from(allChecklistRefs),
    dependency_graph: dependencyGraph,
    context,
    timestamp: new Date().toISOString(),
  };
}

export async function getActiveContractSet(args = {}) {
  const context = {
    action_family: args.action_family || "",
    phase: args.phase || "",
    delivery_mode: args.delivery_mode || "",
    context_budget: args.context_budget_percent || 0,
  };
  return getActiveContractSetInternal(context);
}

// ---------------------------------------------------------------------------
// Agent Orchestration Layer (L4-L6)
// ---------------------------------------------------------------------------

function loadAgentOrchestrationRules() {
  return loadConfig("agent-orchestration-rules") || {};
}

function validatePacketAtomicity(packet) {
  const atomicityConfig = loadConfig("atomicity-rules");
  const rules = atomicityConfig?.rules || [];
  const violations = [];

  for (const rule of rules) {
    const {
      check_type,
      target_field,
      max,
      max_lines: ruleMaxLines,
      max_tokens,
      pattern,
      reference_fields,
      exempt_if,
      must_contain_verbs,
      allow_justification_field,
    } = rule;
    const value = packet[target_field];

    // Simple exempt_if handling: "field == value" or "field != value"
    if (exempt_if) {
      const exemptMatch = String(exempt_if).match(/^(\w+)\s*([=!]+)\s*(.+)$/);
      if (exemptMatch) {
        const [, exField, op, exVal] = exemptMatch;
        const actual = packet[exField];
        const expected = exVal.trim();
        if (op === "!=" && String(actual) !== expected) continue;
        if (op === "==" && String(actual) === expected) continue;
      }
    }

    // Allow justification override
    if (allow_justification_field && packet[allow_justification_field]) {
      continue;
    }

    switch (check_type) {
      case "word_count": {
        const words = String(value || "").split(/\s+/).filter((w) => w.length > 0).length;
        if (max && words > max) {
          violations.push(`${rule.id}: ${target_field} exceeds ${max} words (${words})`);
        }
        break;
      }
      case "array_length": {
        const arr = Array.isArray(value) ? value : [];
        if (max && arr.length > max) {
          violations.push(`${rule.id}: ${target_field} exceeds ${max} items (${arr.length})`);
        }
        break;
      }
      case "file_lines": {
        // P1-4 fix: read actual files from code_refs and count lines
        const codeRefs = Array.isArray(value) ? value : value ? [value] : [];
        for (const ref of codeRefs) {
          if (!ref) continue;
          try {
            const filePath = path.resolve(ref);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf8");
              const lines = content.split(/\r?\n/).length;
              if (ruleMaxLines && lines > ruleMaxLines) {
                violations.push(`${rule.id}: ${ref} has ${lines} lines, exceeds ${ruleMaxLines}`);
              }
            }
          } catch {
            // ignore file read errors
          }
        }
        break;
      }
      case "file_count": {
        const files = Array.isArray(value) ? value : value ? [value] : [];
        if (max && files.length > max) {
          violations.push(`${rule.id}: ${target_field} exceeds ${max} files (${files.length})`);
        }
        break;
      }
      case "estimated_tokens": {
        const fields = [value];
        if (reference_fields && Array.isArray(reference_fields)) {
          for (const rf of reference_fields) fields.push(packet[rf]);
        }
        const text = fields.filter(Boolean).join(" ");
        const tokens = estimateTokens(text);
        if (max_tokens && tokens > max_tokens) {
          violations.push(`${rule.id}: estimated tokens exceed ${max_tokens} (${tokens})`);
        }
        break;
      }
      case "regex_match": {
        if (pattern && value && !new RegExp(pattern).test(String(value))) {
          violations.push(`${rule.id}: ${target_field} does not match pattern ${pattern}`);
        }
        break;
      }
      case "single_sentence": {
        const text = String(value || "");
        const sentences = text.split(/[.!?。！？]/).filter((s) => s.trim().length > 0);
        if (sentences.length > 1) {
          violations.push(`${rule.id}: ${target_field} must be a single sentence`);
        } else if (must_contain_verbs && Array.isArray(must_contain_verbs)) {
          // P1-5 fix: check must_contain_verbs
          const hasVerb = must_contain_verbs.some((verb) => text.includes(verb));
          if (!hasVerb) {
            violations.push(`${rule.id}: ${target_field} must contain one of [${must_contain_verbs.join(", ")}]`);
          }
        }
        break;
      }
      default:
        // Unknown check_type in atomicity-rules: skip silently to avoid false blocks
        break;
    }
  }

  return violations;
}

function generateAgentId(role, packetId) {
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return `ag-${role}-${packetId}-${ts}`;
}

export async function agentOrchestrator(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  const manifest = args.manifest || {};
  const packets = manifest.packets || [];

  if (!taskDir) {
    return { allowed: false, reason: "No active task found.", violations: [] };
  }

  if (packets.length === 0) {
    return { allowed: false, reason: "Manifest contains no packets.", violations: [] };
  }

  // Validate orchestration decision
  const validDecisions = ["multi_packet_parallel", "single_packet_direct", "single_thread_exception"];
  const decision = manifest.orchestration_decision || "single_packet_direct";
  if (!validDecisions.includes(decision)) {
    return {
      allowed: false,
      reason: `Invalid orchestration_decision: '${decision}'. Must be one of: ${validDecisions.join(", ")}`,
      violations: [],
    };
  }

  const allViolations = [];
  const agentIds = [];
  const packetAgentMap = new Map(); // packet_id -> worker_agent_id

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    const v = validatePacketAtomicity(pkt);
    if (v.length > 0) {
      allViolations.push({ packet_index: i, packet_id: pkt.packet_id || i, violations: v });
    }
  }

  if (allViolations.length > 0) {
    return {
      allowed: false,
      reason: `Manifest validation failed: ${allViolations.length} packet(s) violated atomicity rules.`,
      violations: allViolations,
      agent_ids: [],
    };
  }

  // Role assignment based on orchestration_decision (P1-3 fix)
  let executionPlanPhase = "";
  switch (decision) {
    case "single_thread_exception": {
      executionPlanPhase = "main_thread_execution";
      // No sub-agents spawned; main thread handles execution
      break;
    }
    case "single_packet_direct": {
      executionPlanPhase = "spawn_worker";
      for (const pkt of packets) {
        const wid = generateAgentId("worker", pkt.packet_id || `pkt-${agentIds.length}`);
        agentIds.push(wid);
        packetAgentMap.set(pkt.packet_id || `pkt-${agentIds.length - 1}`, wid);
      }
      break;
    }
    case "multi_packet_parallel": {
      if (packets.length <= 3) {
        // Small parallel: all workers, no sub-orchestrator needed
        executionPlanPhase = "spawn_workers";
        for (const pkt of packets) {
          const wid = generateAgentId("worker", pkt.packet_id || `pkt-${agentIds.length}`);
          agentIds.push(wid);
          packetAgentMap.set(pkt.packet_id || `pkt-${agentIds.length - 1}`, wid);
        }
      } else {
        // Large parallel: group packets under sub-orchestrators
        executionPlanPhase = "spawn_sub_orchestrator";
        const groupSize = 3;
        let groupIndex = 0;
        for (let i = 0; i < packets.length; i += groupSize) {
          const group = packets.slice(i, i + groupSize);
          const subId = generateAgentId("sub-orchestrator", `group-${groupIndex}`);
          agentIds.push(subId);
          for (const pkt of group) {
            const wid = generateAgentId("worker", pkt.packet_id || `pkt-${agentIds.length}`);
            agentIds.push(wid);
            packetAgentMap.set(pkt.packet_id || `pkt-${agentIds.length - 1}`, wid);
          }
          groupIndex++;
        }
      }
      break;
    }
    default:
      executionPlanPhase = "spawn_worker";
      for (const pkt of packets) {
        agentIds.push(generateAgentId("worker", pkt.packet_id || `pkt-${agentIds.length}`));
      }
  }

  // Write orchestrator plan
  const agentsDir = path.join(taskDir, "agents");
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

  const planFile = path.join(agentsDir, "orchestrator-plan.yaml");
  const planDoc = {
    plan_id: `plan-${Date.now()}`,
    task_id: path.basename(taskDir),
    manifest_id: manifest.manifest_id || "unknown",
    orchestration_decision: decision,
    created_at: new Date().toISOString(),
    agent_ids: agentIds,
    packets: packets.map((p) => ({
      ...p,
      assigned_agent_id: packetAgentMap.get(p.packet_id) || null,
    })),
    status: "approved",
  };
  // M-4 fix: atomic write for plan file
  const planTempFile = `${planFile}.tmp`;
  fs.writeFileSync(planTempFile, yaml.dump(planDoc));
  fs.renameSync(planTempFile, planFile);

  return {
    allowed: true,
    agent_ids: agentIds,
    execution_plan: {
      phase: executionPlanPhase,
      packet_count: packets.length,
      decision,
    },
    validation_report: `All ${packets.length} packet(s) passed atomicity check.`,
    plan_file: planFile,
    timestamp: new Date().toISOString(),
  };
}

export async function agentStatus(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  const operation = args.operation || "query";
  const agentId = args.agent_id || "";

  if (!taskDir) {
    return { success: false, reason: "No active task found." };
  }

  const agentsDir = path.join(taskDir, "agents");
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  if (operation === "list") {
    const files = fs.existsSync(agentsDir)
      ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".yaml") && f.startsWith("ag-"))
      : [];
    const agents = files.map((f) => {
      const doc = loadYaml(path.join(agentsDir, f));
      return { agent_id: doc?.agent_id || f.replace(".yaml", ""), status: doc?.status || "unknown" };
    });
    return { success: true, count: agents.length, agents, timestamp: new Date().toISOString() };
  }

  if (operation === "register" || operation === "update") {
    if (!agentId) {
      return { success: false, reason: "agent_id is required for register/update." };
    }
    const agentFile = path.join(agentsDir, `${agentId}.yaml`);
    const existing = loadYaml(agentFile) || {};
    const doc = {
      ...existing,
      agent_id: agentId,
      role: args.role || existing.role || "worker",
      parent_packet_id: args.parent_packet_id || existing.parent_packet_id || "",
      task_id: path.basename(taskDir),
      status: args.status || existing.status || "pending",
      progress: args.progress || existing.progress || "0%",
      output_ref: args.output_ref || existing.output_ref || "",
      error_log: args.error_log || existing.error_log || "",
      updated_at: new Date().toISOString(),
      started_at: existing.started_at || args.started_at || new Date().toISOString(),
    };
    fs.writeFileSync(agentFile, yaml.dump(doc));
    return { success: true, agent_id: agentId, status: doc.status, timestamp: new Date().toISOString() };
  }

  if (operation === "query") {
    if (!agentId) {
      return { success: false, reason: "agent_id is required for query." };
    }
    const agentFile = path.join(agentsDir, `${agentId}.yaml`);
    const doc = loadYaml(agentFile);
    if (!doc) {
      return { success: false, reason: `Agent '${agentId}' not found.` };
    }
    return { success: true, agent: doc, timestamp: new Date().toISOString() };
  }

  return { success: false, reason: `Unknown operation: '${operation}'.` };
}

export async function checkpointSync(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  const operation = args.operation || "save";
  const checkpointId = args.checkpoint_id || `cp-${Date.now()}`;

  if (!taskDir) {
    return { success: false, reason: "No active task found." };
  }

  const checkpointsDir = path.join(taskDir, "checkpoints");
  if (!fs.existsSync(checkpointsDir)) {
    fs.mkdirSync(checkpointsDir, { recursive: true });
  }

  if (operation === "save") {
    const checkpointFile = path.join(checkpointsDir, `${checkpointId}.yaml`);
    const snapshot = {
      checkpoint_id: checkpointId,
      task_id: path.basename(taskDir),
      saved_at: new Date().toISOString(),
      task_state: loadYaml(path.join(taskDir, "00-task-state.yaml")) || {},
      board: loadYaml(path.join(taskDir, "board.yaml")) || {},
      agents: {},
      checkers: {},
    };

    // Snapshot agent statuses
    const agentsDir = path.join(taskDir, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const f of fs.readdirSync(agentsDir)) {
        if (f.endsWith(".yaml")) {
          const doc = loadYaml(path.join(agentsDir, f));
          if (doc && doc.agent_id) snapshot.agents[doc.agent_id] = doc;
        }
      }
    }

    // Snapshot checker results
    const checkersDir = path.join(taskDir, "checkers");
    if (fs.existsSync(checkersDir)) {
      for (const f of fs.readdirSync(checkersDir)) {
        if (f.endsWith(".yaml") && !f.startsWith("evidence-lock")) {
          const doc = loadYaml(path.join(checkersDir, f));
          if (doc && doc.checker_id) snapshot.checkers[doc.checker_id] = doc;
        }
      }
    }

    fs.writeFileSync(checkpointFile, yaml.dump(snapshot));
    return {
      success: true,
      checkpoint_id: checkpointId,
      checkpoint_file: checkpointFile,
      saved_at: snapshot.saved_at,
    };
  }

  if (operation === "load") {
    const checkpointFile = path.join(checkpointsDir, `${checkpointId}.yaml`);
    if (!fs.existsSync(checkpointFile)) {
      return { success: false, reason: `Checkpoint '${checkpointId}' not found.` };
    }
    const snapshot = loadYaml(checkpointFile);
    return {
      success: true,
      checkpoint_id: checkpointId,
      snapshot,
      restored_at: new Date().toISOString(),
    };
  }

  if (operation === "list") {
    const files = fs.existsSync(checkpointsDir)
      ? fs.readdirSync(checkpointsDir).filter((f) => f.endsWith(".yaml"))
      : [];
    const checkpoints = files.map((f) => {
      const doc = loadYaml(path.join(checkpointsDir, f));
      return {
        checkpoint_id: doc?.checkpoint_id || f.replace(".yaml", ""),
        saved_at: doc?.saved_at || "unknown",
      };
    });
    return { success: true, count: checkpoints.length, checkpoints, timestamp: new Date().toISOString() };
  }

  return { success: false, reason: `Unknown operation: '${operation}'.` };
}
