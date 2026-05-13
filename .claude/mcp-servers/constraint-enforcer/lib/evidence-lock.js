// lib/evidence-lock.js — Evidence lock generation

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  loadConfig,
  loadYaml,
  hashFile,
  hashDir,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";

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

  const artifactsDir = path.join(taskDir, "artifacts");
  const artifactHash = hashDir(artifactsDir);

  const primaryArtifact = state.current_primary_artifact || "";
  const primaryArtifactHash = primaryArtifact ? hashFile(path.join(taskDir, primaryArtifact)) : artifactHash;

  const artifactFiles = [];
  if (fs.existsSync(artifactsDir)) {
    const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) artifactFiles.push(e.name);
    }
  }

  const psmConfig = loadConfig("phase-state-machine");
  const phaseDef = psmConfig?.phases?.find((p) => p.id === phase);
  const manualGates = (phaseDef?.gates || []).filter((g) => g === "value");

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
