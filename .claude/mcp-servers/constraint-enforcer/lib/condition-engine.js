// lib/condition-engine.js — Configuration-driven mechanical condition evaluator

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  loadConfig,
  loadAllConfigs,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";

function loadYamlLocal(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export async function evaluateCondition(cond, state, taskDir, checkerIndex = null) {
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
      if (!fs.existsSync(artifactPath)) return { passed: false, gap: `Condition '${cond.id}': Reference artifact '${refPath}' does not exist.` };
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
      const doc = loadYamlLocal(path.join(taskDir, "checkers", file));
      const status = doc?.status || "";
      const passed = status === cond.expected;
      return {
        passed,
        gap: passed ? null : `Condition '${cond.id}': ${cond.checker_id} status is '${status}', not '${cond.expected}'`,
      };
    }

    case "mandatory_checkers_all_passed_or_excepted": {
      const routeFile = path.join(taskDir, "route-projection.yaml");
      const route = loadYamlLocal(routeFile);
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
        const doc = loadYamlLocal(path.join(checkerDir, resultFile));
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

export async function checkPhaseReadiness(args = {}) {
  loadAllConfigs();
  const taskDir = resolveTaskDir(args.taskDir);
  if (!taskDir) {
    return { ready: false, gaps: ["No active task found."], warnings: [] };
  }

  const taskId = path.basename(taskDir);
  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYamlLocal(stateFile);
  if (!state) {
    return { ready: false, gaps: ["00-task-state.yaml missing or unreadable."], warnings: [] };
  }

  const phase = state.phase || "unknown";
  const phaseStatus = state.phase_status || "unknown";
  const gaps = [];
  const warnings = [];

  if (phaseStatus !== "passed") {
    gaps.push(`Phase status is '${phaseStatus}', not passed.`);
  }

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
