// enforcer.js — Core constraint logic for constraint-enforcer MCP Server

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[loadYaml] Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

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
// check_phase_readiness
// ---------------------------------------------------------------------------

export async function checkPhaseReadiness(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { ready: false, gaps: ["No active task found."] };
  }

  const taskId = path.basename(taskDir);
  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { ready: false, gaps: ["00-task-state.yaml missing or unreadable."] };
  }

  const phase = state.phase || "unknown";
  const phaseStatus = state.phase_status || "unknown";
  const gaps = [];

  // 1. Current phase status must be passed
  if (phaseStatus !== "passed") {
    return {
      taskId,
      phase,
      phaseStatus,
      ready: false,
      gaps: [`Phase status is '${phaseStatus}', not passed.`],
    };
  }

  if (state.closeout_allowed === true) {
    return { taskId, phase, phaseStatus, ready: false, gaps: ["closeout_allowed is already true."] };
  }

  // 2. Unresolved blockers
  const blocker = state.last_blocker_report;
  if (blocker && blocker !== '""' && blocker !== "null" && blocker !== "") {
    gaps.push(`Unresolved blocker report exists: ${blocker}`);
  }

  // 3. All gate results must be passed
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith("gate_") && value && typeof value === "object") {
      if (value.status !== "passed") {
        gaps.push(`Gate ${key} is not passed (status: ${value.status}).`);
      }
    }
  }

  // 4. Primary artifact existence and non-empty
  const primaryArtifact = state.current_primary_artifact || "";
  if (primaryArtifact) {
    const artifactPath = path.join(taskDir, primaryArtifact);
    if (!fs.existsSync(artifactPath)) {
      gaps.push(`Primary artifact missing: ${primaryArtifact}`);
    } else {
      const stat = fs.statSync(artifactPath);
      if (stat.size === 0) {
        gaps.push(`Primary artifact is empty: ${primaryArtifact}`);
      }
    }
  }

  // 5. Timestamp freshness (updated_at vs artifact mtime)
  const updatedAt = state.updated_at;
  if (updatedAt && primaryArtifact) {
    const artifactPath = path.join(taskDir, primaryArtifact);
    if (fs.existsSync(artifactPath)) {
      const artifactMtime = fs.statSync(artifactPath).mtimeMs;
      const updatedMs = new Date(updatedAt).getTime();
      if (updatedMs < artifactMtime) {
        gaps.push("Task state updated_at is older than primary artifact modification time.");
      }
    }
  }

  // 6. Dirty-hygiene-closure-check passed
  const checkerDir = path.join(taskDir, "checkers");
  let dirtyHygienePassed = false;
  if (fs.existsSync(checkerDir)) {
    const dhFile = fs.readdirSync(checkerDir).find(
      (f) => f.includes("dirty-hygiene-closure-check") && f.endsWith(".yaml") && !f.startsWith("evidence-lock")
    );
    if (dhFile) {
      const dhDoc = loadYaml(path.join(checkerDir, dhFile));
      if (dhDoc?.status === "passed") {
        dirtyHygienePassed = true;
      }
    }
  }
  if (!dirtyHygienePassed) {
    gaps.push("Dirty-hygiene-closure-check is not passed.");
  }

  // 7. Mandatory checkers via route-projection
  const routeFile = path.join(taskDir, "route-projection.yaml");
  const route = loadYaml(routeFile);
  const mandatory = route?.mandatory_checkers || [];

  for (const c of mandatory) {
    const cid = String(c).trim();
    if (!cid) continue;
    const resultFile =
      fs.existsSync(checkerDir) &&
      fs.readdirSync(checkerDir).find((f) => f.includes(cid) && f.endsWith(".yaml") && !f.startsWith("evidence-lock"));
    if (!resultFile) {
      gaps.push(`Mandatory checker not run: ${cid}`);
      continue;
    }
    const resultDoc = loadYaml(path.join(checkerDir, resultFile));
    const st = resultDoc?.status || "";
    if (st !== "passed" && st !== "excepted") {
      gaps.push(`Mandatory checker ${st}: ${cid} (${resultFile})`);
    }
  }

  // 8. Auditor verdict
  const auditorVerdict = state.auditor_verdict || "";
  if (auditorVerdict !== "audited") {
    gaps.push(`Auditor verdict is '${auditorVerdict}', not 'audited'.`);
  }

  // 9. Evidence lock (additional mechanical safeguard)
  if (phase !== "clarify") {
    const evLock = path.join(checkerDir, `evidence-lock-${phase}.yaml`);
    if (!fs.existsSync(evLock)) {
      gaps.push(`Evidence lock missing: checkers/evidence-lock-${phase}.yaml`);
    }
  }

  return {
    taskId,
    phase,
    phaseStatus,
    ready: gaps.length === 0,
    gaps,
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

  // Security: extension whitelist
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".sh" && ext !== ".ps1") {
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
    const shell = ext === ".ps1" && isWin ? "powershell" : "bash";
    const shellArgs = ext === ".ps1" && isWin ? ["-File", scriptPath, cwd] : [scriptPath, cwd];
    const child = spawn(shell, shellArgs, { cwd, timeout: timeoutMs });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code, signal) => {
      const output = stdout + stderr;
      if (signal === "SIGTERM" || code === null) {
        resolve({ output: output + "\n[TIMED OUT]", status: "blocked", exitCode: -1 });
        return;
      }
      // §10.1 precise status mapping
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
  const routeFile = path.join(taskDir, "route-projection.yaml");
  const route = loadYaml(routeFile);
  const mandatory = route?.mandatory_checkers || [];

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
  const results = [];

  for (const c of mandatory) {
    const checkerId = String(c).trim();
    if (!checkerId) continue;
    if (filter && !filter.includes(checkerId)) continue;

    // Skip if already has a result
    const existing =
      fs.existsSync(taskCheckerDir) &&
      fs.readdirSync(taskCheckerDir).find((f) => f.includes(checkerId));
    if (existing) {
      results.push({ checkerId, action: "SKIP", file: existing });
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
      results.push({ checkerId, action: "PENDING", file: `${runId}.yaml` });
      continue;
    }

    // Run checker
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
    results.push({ checkerId, action: status.toUpperCase(), file: `${runId}.yaml` });
  }

  return {
    success: true,
    taskId,
    results,
    summary: `Processed ${results.length} checker(s).`,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// validate_write_permission
// ---------------------------------------------------------------------------

export async function validateWritePermission(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  const filePath = args.filePath || "";

  if (!filePath) {
    return { allowed: false, reason: "filePath is required." };
  }

  const normPath = filePath.replace(/\\/g, "/");

  // If no active task, allow non-sensitive operations
  if (!taskDir) {
    return { allowed: true, reason: "No active task; operation allowed." };
  }

  // Security: path traversal guard
  const resolvedFile = path.resolve(filePath);
  const relativeToTask = path.relative(taskDir, resolvedFile);
  if (relativeToTask.startsWith("..") || path.isAbsolute(relativeToTask)) {
    return { allowed: false, reason: "BLOCKED: filePath escapes task directory." };
  }

  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { allowed: true, reason: "Task state unreadable; allowing operation." };
  }

  const phaseStatus = state.phase_status || "unknown";

  // Determine sensitivity
  const isStateFile = normPath.endsWith("00-task-state.yaml");
  const isEvidenceLock = /evidence-lock-.*\.yaml$/.test(normPath);
  const isCheckerResult = /checkers\/[^/]+\.yaml$/.test(normPath) && !/evidence-lock/.test(normPath);
  const isReceipt = /reviews\/receipt-.*\.yaml$/.test(normPath);

  const isSensitive = isStateFile || isEvidenceLock || isCheckerResult || isReceipt;

  if (!isSensitive) {
    return { allowed: true, reason: "Non-sensitive file; operation allowed." };
  }

  // Calculate readiness early for all sensitive checks
  const readiness = await checkPhaseReadiness({ taskDir });

  // State file specific checks with YAML parsing
  if (isStateFile) {
    const newContent = args.newContent || "";
    if (!newContent) {
      return { allowed: false, reason: "BLOCKED: state file operation requires newContent for tamper detection." };
    }
    let parsed = null;
    try {
      parsed = yaml.load(newContent);
    } catch {
      parsed = null;
    }

    // Block phase_status to passed/archived if readiness not ready
    const newPhaseStatus = parsed?.phase_status || "";
    if ((newPhaseStatus === "passed" || newPhaseStatus === "archived") && !readiness.ready) {
      return { allowed: false, reason: "BLOCKED: phase_transition attempt without evidence lock. Use request_phase_transition." };
    }

    // Block closeout_allowed: true
    if (parsed?.closeout_allowed === true) {
      return { allowed: false, reason: "BLOCKED: closeout attempt without passing all gates." };
    }

    // Allow setting phase_status to passed when readiness is satisfied
    if (newPhaseStatus === "passed" && readiness.ready) {
      return { allowed: true, reason: "Phase status transition to passed approved; all mechanical conditions satisfied." };
    }

    // Fallback regex for unparsed content
    if (!parsed && newContent) {
      if (/phase_status\s*:\s*(passed|archived)/.test(newContent)) {
        return { allowed: false, reason: "BLOCKED: phase_transition attempt without evidence lock. Use request_phase_transition." };
      }
      if (/closeout_allowed\s*:\s*true/.test(newContent)) {
        return { allowed: false, reason: "BLOCKED: closeout attempt without passing all gates." };
      }
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

  // Validate all checkers passed or excepted before generating lock
  const allPassed = checkerResults.every((c) => c.status === "passed" || c.status === "excepted");
  if (!allPassed) {
    return { success: false, reason: "Cannot generate evidence lock: not all checkers passed or excepted." };
  }

  // Validate primary artifact is set
  const primaryArtifact = state.current_primary_artifact || "";
  if (!primaryArtifact) {
    return { success: false, reason: "Cannot generate evidence lock: current_primary_artifact is not set." };
  }

  // Artifact hash
  const artifactsDir = path.join(taskDir, "artifacts");
  const primaryArtifactHash = hashFile(path.join(taskDir, primaryArtifact));

  const artifactFiles = [];
  if (fs.existsSync(artifactsDir)) {
    const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) artifactFiles.push(e.name);
    }
  }

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
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// request_phase_transition
// ---------------------------------------------------------------------------

export async function requestPhaseTransition(args = {}) {
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
      recommendation: "Run run_mandatory_checkers to auto-fix checker gaps, then retry.",
    };
  }

  // Step 2: Generate evidence lock
  const lockResult = await generateEvidenceLock({ taskDir });
  if (!lockResult.success) {
    return { success: false, reason: `Evidence lock generation failed: ${lockResult.reason}` };
  }

  // Step 3: Auditor verdict check (condition 8)
  const auditorVerdict = state.auditor_verdict || "";
  if (auditorVerdict && auditorVerdict !== "audited") {
    return {
      success: false,
      reason: `Auditor verdict is '${auditorVerdict}', not 'audited'.`,
      recommendation: "Trigger Auditor Agent review and ensure verdict='audited' before transition.",
    };
  }

  // Step 4: Determine next phase
  const phaseOrder = ["clarify", "research", "design", "plan", "build", "verify", "closeout"];
  const nextPhase = args.nextPhase || (() => {
    const idx = phaseOrder.indexOf(phase);
    return idx >= 0 && idx < phaseOrder.length - 1 ? phaseOrder[idx + 1] : phase;
  })();

  if (!phaseOrder.includes(nextPhase)) {
    return { success: false, reason: `Invalid nextPhase: '${nextPhase}'.` };
  }

  // Step 5: Update state file (atomic write)
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

  const tempFile = `${stateFile}.tmp`;
  fs.writeFileSync(tempFile, yaml.dump(state));
  fs.renameSync(tempFile, stateFile);

  return {
    success: true,
    taskId: path.basename(taskDir),
    fromPhase: phase,
    toPhase: nextPhase,
    evidenceLock: lockResult.lockFile,
    checkerCount: lockResult.checkerCount,
    gateCount: lockResult.gateCount,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// get_checker_catalog
// ---------------------------------------------------------------------------

// Minimum checker catalog per verification-checker.md §5
const MINIMUM_CHECKER_IDS = [
  "route-output-closure-check",
  "state-projection-alignment-check",
  "review-consistency-check",
  "dirty-chain-prevention-check",
  "dirty-hygiene-closure-check",
  "dangling-reference-check",
  "stale-projection-cleanup-check",
  "subagent-orchestration-check",
  "context-budget-delegation-check",
  "compaction-trigger-closure-check",
  "architecture-decomposition-check",
];

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

  const catalogIds = new Set(checkers.map((c) => c.id));
  const missing = MINIMUM_CHECKER_IDS.filter((id) => !catalogIds.has(id));

  return {
    success: true,
    count: checkers.length,
    minimum_required: MINIMUM_CHECKER_IDS.length,
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
