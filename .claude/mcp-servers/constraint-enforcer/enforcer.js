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
  } catch {
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
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function hashDir(dirPath) {
  if (!fs.existsSync(dirPath)) return "";
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  const hashes = files
    .filter((f) => f.isFile())
    .map((f) => hashFile(path.join(dirPath, f.name)))
    .sort();
  return crypto.createHash("sha256").update(hashes.join("")).digest("hex").slice(0, 16);
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

  // Only evaluate when actively in progress
  if (phaseStatus !== "in_progress" && phaseStatus !== "in_review") {
    return {
      taskId,
      phase,
      phaseStatus,
      ready: false,
      gaps: [`Phase status is '${phaseStatus}', not in_progress or in_review.`],
    };
  }

  if (state.closeout_allowed === true) {
    return { taskId, phase, phaseStatus, ready: false, gaps: ["closeout_allowed is already true."] };
  }

  // 1. Unresolved blockers
  const blocker = state.last_blocker_report;
  if (blocker && blocker !== '""' && blocker !== "null" && blocker !== "") {
    gaps.push(`Unresolved blocker report exists: ${blocker}`);
  }

  // 2. Failed gate results in state file
  const stateText = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : "";
  if (stateText.includes("status: failed")) {
    gaps.push("Gate result contains FAILED status in 00-task-state.yaml.");
  }

  // 3. Mandatory checkers via route-projection
  const routeFile = path.join(taskDir, "route-projection.yaml");
  const route = loadYaml(routeFile);
  const mandatory = route?.mandatory_checkers || [];
  const checkerDir = path.join(taskDir, "checkers");

  for (const c of mandatory) {
    const cid = String(c).trim();
    if (!cid) continue;
    const exists =
      fs.existsSync(checkerDir) &&
      fs.readdirSync(checkerDir).some((f) => f.includes(cid));
    if (!exists) {
      gaps.push(`Mandatory checker not run: ${cid}`);
    }
  }

  // 4. Evidence lock
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

function runBashChecker(scriptPath, cwd) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("bash", [scriptPath, cwd], { cwd });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      const output = stdout + stderr;
      const status = output.includes("PASSED") ? "passed" : "failed";
      resolve({ output, status, exitCode: code });
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
    const { output, status } = await runBashChecker(scriptPath, PROJECT_ROOT);

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
  const operation = args.operation || "";

  if (!filePath) {
    return { allowed: false, reason: "filePath is required." };
  }

  const normPath = filePath.replace(/\\/g, "/");

  // If no active task, allow non-sensitive operations
  if (!taskDir) {
    return { allowed: true, reason: "No active task; operation allowed." };
  }

  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { allowed: true, reason: "Task state unreadable; allowing operation." };
  }

  const phaseStatus = state.phase_status || "unknown";

  // If task is not in progress, block sensitive files
  const isInProgress = phaseStatus === "in_progress" || phaseStatus === "in_review";

  // Determine sensitivity
  const isStateFile = normPath.endsWith("00-task-state.yaml");
  const isEvidenceLock = /evidence-lock-.*\.yaml$/.test(normPath);
  const isCheckerResult = /checkers\/[^/]+\.yaml$/.test(normPath) && !/evidence-lock/.test(normPath);
  const isReceipt = /reviews\/receipt-.*\.yaml$/.test(normPath);

  const isSensitive = isStateFile || isEvidenceLock || isCheckerResult || isReceipt;

  if (!isSensitive) {
    return { allowed: true, reason: "Non-sensitive file; operation allowed." };
  }

  // State file specific checks
  if (isStateFile) {
    const newContent = args.newContent || "";
    if (/phase_status\s*:\s*(passed|archived)/.test(newContent)) {
      return { allowed: false, reason: "BLOCKED: phase_transition attempt without evidence lock. Use request_phase_transition." };
    }
    if (/closeout_allowed\s*:\s*true/.test(newContent)) {
      return { allowed: false, reason: "BLOCKED: closeout attempt without passing all gates." };
    }
  }

  if (!isInProgress) {
    return { allowed: false, reason: `BLOCKED: task phase_status is '${phaseStatus}', not in_progress or in_review.` };
  }

  // Check mechanical gaps for sensitive files
  const readiness = await checkPhaseReadiness({ taskDir });
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

  // Collect gate results from state file
  const gateResults = [];
  const stateText = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : "";
  const gateMatches = stateText.matchAll(/gate_\w+:\s*\n\s+status:\s*(\w+)/g);
  for (const m of gateMatches) {
    // Simple parsing; full YAML parsing already done above
  }
  // Better: extract from state object directly
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

  // Build evidence lock document
  const lockDoc = {
    evidence_lock_id: `evidence-lock-${phase}`,
    task_id: taskId,
    phase,
    generated_at: new Date().toISOString(),
    generator: "constraint-enforcer MCP Server",
    checker_results: checkerResults,
    gate_results: gateResults,
    artifact_hash: artifactHash,
    artifact_files: fs.existsSync(artifactsDir)
      ? fs.readdirSync(artifactsDir).filter((f) => f.isFile ? true : false)
      : [],
    integrity: {
      checker_count: checkerResults.length,
      gate_count: gateResults.length,
      all_checkers_passed: checkerResults.every((c) => c.status === "passed" || c.status === "manual_pending"),
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
    allPassed: lockDoc.integrity.all_checkers_passed,
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

  if (phaseStatus !== "in_progress" && phaseStatus !== "in_review") {
    return { success: false, reason: `Phase status is '${phaseStatus}', not in_progress or in_review.` };
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

  // Step 3: Determine next phase
  const phaseOrder = ["clarify", "research", "design", "plan", "build", "verify", "closeout"];
  const nextPhase = args.nextPhase || (() => {
    const idx = phaseOrder.indexOf(phase);
    return idx >= 0 && idx < phaseOrder.length - 1 ? phaseOrder[idx + 1] : phase;
  })();

  // Step 4: Update state file
  state.phase = nextPhase;
  state.phase_status = "in_progress";
  state.phase_transition_history = state.phase_transition_history || [];
  state.phase_transition_history.push({
    from: phase,
    to: nextPhase,
    at: new Date().toISOString(),
    evidence_lock: lockResult.lockFile,
    triggered_by: "constraint-enforcer MCP Server",
  });

  fs.writeFileSync(stateFile, yaml.dump(state));

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
        .filter(([k, v]) => v && typeof v === "object")
        .map(([k, v]) => ({ id: k, ...v }));

  return {
    success: true,
    count: checkers.length,
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
