// lib/phase-transition.js — Phase transition with auditor receipt verification

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";
import {
  loadConfig,
  loadAllConfigs,
  loadYaml,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";
import { checkPhaseReadiness } from "./condition-engine.js";
import { generateEvidenceLock } from "./evidence-lock.js";

export async function requestPhaseTransition(args = {}) {
  loadAllConfigs();
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

  const lockResult = await generateEvidenceLock({ taskDir });
  if (!lockResult.success) {
    return { success: false, reason: `Evidence lock generation failed: ${lockResult.reason}` };
  }

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

  // Auditor receipt verification (P0-1 fix)
  const receiptPath = path.join(taskDir, "reviews", "receipt-auditor.yaml");
  const receipt = fs.existsSync(receiptPath) ? loadYaml(receiptPath) : null;
  let tamperDetected = false;

  if (!receipt || receipt.auditor_verdict !== "audited") {
    return {
      success: false,
      reason: receipt
        ? `Auditor receipt verdict is '${receipt.auditor_verdict || "missing"}', not 'audited'.`
        : "Auditor receipt not found at reviews/receipt-auditor.yaml.",
      auditorRequired: true,
      recommendation: "Trigger Auditor Agent review and write receipt-auditor.yaml before transition.",
    };
  }

  if (receipt.evidence_lock_hash) {
    let lockContent = "";
    if (lockResult.lockFile && fs.existsSync(lockResult.lockFile)) {
      lockContent = fs.readFileSync(lockResult.lockFile, "utf8");
    }
    const expectedHash = receipt.evidence_lock_hash;
    const actualHash = crypto.createHash("sha256").update(lockContent).digest("hex");
    if (expectedHash !== actualHash) {
      tamperDetected = true;
    }
  }

  if (state.auditor_verdict && state.auditor_verdict !== receipt.auditor_verdict) {
    tamperDetected = true;
  }

  if (tamperDetected) {
    return {
      success: false,
      reason: "TAMPER DETECTED: Auditor receipt hash mismatch or mutable state auditor_verdict was overwritten. Task blocked.",
      auditorRequired: true,
      tamper_detected: true,
      recommendation: "Investigate state file integrity. A new Auditor must be appointed and a fresh receipt written.",
    };
  }

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

  // Atomic state write with rollback on failure (R-006 fix)
  const tempFile = `${stateFile}.tmp`;
  let originalContent = null;
  let writeError = null;
  try {
    if (fs.existsSync(stateFile)) {
      originalContent = fs.readFileSync(stateFile, "utf8");
    }
    fs.writeFileSync(tempFile, yaml.dump(state));
    fs.renameSync(tempFile, stateFile);
  } catch (err) {
    writeError = err;
    if (originalContent !== null) {
      try {
        fs.writeFileSync(stateFile, originalContent);
      } catch (restoreErr) {
        console.error("CRITICAL: State file write failed AND rollback failed:", restoreErr.message);
      }
    }
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore
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
