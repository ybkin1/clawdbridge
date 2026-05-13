// lib/checker-runner.js — Mandatory checker execution with bounded concurrency
// P1-3 fix: supports both spawn-based and in-process JS checker execution

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { spawn } from "child_process";
import {
  loadConfig,
  loadYaml,
  getMeta,
  PROJECT_ROOT,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";

// ---------------------------------------------------------------------------
// In-process JS checker cache (P1-3)
// ---------------------------------------------------------------------------
const jsCheckerCache = new Map();

async function runInProcessJsChecker(scriptPath, cwd, checkerRoot) {
  const resolved = path.resolve(scriptPath);
  try {
    let checkerModule = jsCheckerCache.get(resolved);
    if (!checkerModule) {
      // Dynamic import with cache busting via query string not needed for local files
      checkerModule = await import("file://" + resolved.replace(/\\/g, "/"));
      jsCheckerCache.set(resolved, checkerModule);
    }
    const runFn = checkerModule.default || checkerModule.run;
    if (typeof runFn !== "function") {
      return {
        output: `[IN-PROCESS ERROR] JS checker ${path.basename(resolved)} does not export a default function or named 'run' export.`,
        status: "blocked",
        exitCode: 1,
      };
    }
    const result = await runFn(cwd, checkerRoot);
    // Normalize result shape
    const output = result.output || JSON.stringify(result);
    const status = result.status || (result.success ? "passed" : "failed");
    return { output, status, exitCode: result.exitCode ?? (status === "passed" ? 0 : 1) };
  } catch (err) {
    return {
      output: `[IN-PROCESS ERROR] ${err.message}`,
      status: "blocked",
      exitCode: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Spawn-based checker runner (legacy, still used for .sh and .ps1)
// ---------------------------------------------------------------------------
function runBashChecker(scriptPath, cwd, checkerRoot) {
  const resolved = path.resolve(scriptPath);
  const resolvedRoot = path.resolve(checkerRoot);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return Promise.resolve({
      output: `[BLOCKED] scriptPath escapes checkerRoot: ${scriptPath}`,
      status: "blocked",
      exitCode: 1,
    });
  }

  const ext = path.extname(resolved).toLowerCase();
  const allowedExts = getMeta("checker_runner.allowed_extensions", [".sh", ".ps1", ".js"]);
  if (!allowedExts.includes(ext)) {
    return Promise.resolve({
      output: `[BLOCKED] disallowed script extension: ${ext}`,
      status: "blocked",
      exitCode: 1,
    });
  }

  // P1-3: Use in-process execution for .js checkers
  if (ext === ".js") {
    return runInProcessJsChecker(scriptPath, cwd, checkerRoot);
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const timeoutMs = getMeta("checker_runner.timeout_ms", 60000);
    const isWin = process.platform === "win32";
    let shell, shellArgs;
    if (ext === ".ps1" && isWin) {
      shell = "powershell";
      shellArgs = ["-File", scriptPath, cwd];
    } else {
      shell = "bash";
      shellArgs = [scriptPath, cwd];
    }
    const child = spawn(shell, shellArgs, { cwd, timeout: timeoutMs });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs + getMeta("checker_runner.kill_grace_ms", 5000));

    child.on("close", (code, signal) => {
      clearTimeout(killTimer);
      const output = stdout + stderr;
      if (signal === "SIGTERM" || signal === "SIGKILL" || code === null) {
        resolve({ output: output + "\n[TIMED OUT]", status: "blocked", exitCode: -1 });
        return;
      }
      const lines = output.trim().split(/\r?\n/);
      const lastLine = lines[lines.length - 1] || "";
      const structuredMatch = lastLine.match(/__STATUS__:(passed|failed|blocked|warning)/i);
      if (structuredMatch) {
        resolve({ output, status: structuredMatch[1].toLowerCase(), exitCode: code });
        return;
      }
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

  let mandatory = [];
  const routeFile = path.join(taskDir, "route-projection.yaml");
  const route = loadYaml(routeFile);
  if (route?.mandatory_checkers && Array.isArray(route.mandatory_checkers)) {
    mandatory = route.mandatory_checkers;
  }

  if (mandatory.length === 0) {
    const stateFile = path.join(taskDir, "00-task-state.yaml");
    const state = loadYaml(stateFile);
    if (state) {
      const { getActiveContractSetInternal } = await import("./contract-resolver.js");
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

  const existingCheckerFiles = fs.existsSync(taskCheckerDir)
    ? fs.readdirSync(taskCheckerDir).filter((f) => f.endsWith(".yaml") && !f.startsWith("evidence-lock"))
    : [];
  const existingByChecker = new Map();
  for (const f of existingCheckerFiles) {
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
      scriptPath = path.join(checkerRoot, `${checkerId}.js`);
    }

    if (!fs.existsSync(scriptPath)) {
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

  const MAX_CONCURRENCY = getMeta("checker_runner.max_concurrency", 3);
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
