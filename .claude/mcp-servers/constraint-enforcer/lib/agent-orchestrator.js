// lib/agent-orchestrator.js — Work packet manifest validation and agent orchestration

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  loadConfig,
  estimateTokens,
  getMeta,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";

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
      aggregate,
    } = rule;
    const value = packet[target_field];

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
        const codeRefs = Array.isArray(value) ? value : value ? [value] : [];
        let totalLines = 0;
        let anyExists = false;
        for (const ref of codeRefs) {
          if (!ref) continue;
          try {
            const filePath = path.resolve(ref);
            if (fs.existsSync(filePath)) {
              anyExists = true;
              const content = fs.readFileSync(filePath, "utf8");
              const lines = content.split(/\r?\n/).length;
              if (!aggregate) {
                if (ruleMaxLines && lines > ruleMaxLines) {
                  violations.push(`${rule.id}: ${ref} has ${lines} lines, exceeds ${ruleMaxLines}`);
                }
              }
              totalLines += lines;
            }
          } catch {
            // ignore file read errors
          }
        }
        // P2-2 fix: when aggregate=true, enforce limit on total lines across all files
        if (aggregate && anyExists && ruleMaxLines && totalLines > ruleMaxLines) {
          violations.push(`${rule.id}: aggregate lines ${totalLines} exceed ${ruleMaxLines} (${codeRefs.length} file(s))`);
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
          const hasVerb = must_contain_verbs.some((verb) => text.includes(verb));
          if (!hasVerb) {
            violations.push(`${rule.id}: ${target_field} must contain one of [${must_contain_verbs.join(", ")}]`);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return violations;
}

function generateAgentId(role, packetId) {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  return `ag-${role}-${packetId}-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Review agent sizing — implements cluster-orchestration.md §6.4
// ---------------------------------------------------------------------------

function calculateReviewAgentCount(manifest, reviewSizingConfig) {
  if (!reviewSizingConfig) return null;
  const rc = manifest.review_context || {};

  // Gather inputs
  const dimensions = Array.isArray(rc.dimensions) ? rc.dimensions.length : 0;
  const subsystems = Array.isArray(rc.subsystems) ? rc.subsystems.length : 0;
  const files = typeof rc.files === "number" ? rc.files : 0;
  const lines = typeof rc.lines === "number" ? rc.lines : 0;

  const D = reviewSizingConfig.dimension_multiplier ?? 1.0;
  const S = reviewSizingConfig.subsystem_multiplier ?? 1.0;
  const F = reviewSizingConfig.files_per_agent ?? 30;
  const L = reviewSizingConfig.lines_per_agent ?? 500;
  const MIN = reviewSizingConfig.min_agents ?? 2;
  const MAX = reviewSizingConfig.max_agents ?? 10;

  // Skip calculation if no review context provided
  if (dimensions === 0 && subsystems === 0 && files === 0 && lines === 0) {
    return null;
  }

  const raw = dimensions * D + subsystems * S + (F > 0 ? files / F : 0) + (L > 0 ? lines / L : 0);
  const recommended = Math.max(MIN, Math.min(MAX, Math.ceil(raw)));

  return {
    recommended_agent_count: recommended,
    formula_inputs: {
      dimensions,
      subsystems,
      files,
      lines,
    },
    formula_params: { D, S, F, L, MIN, MAX },
    raw_value: raw,
    rationale: `dimensions(${dimensions})*${D} + subsystems(${subsystems})*${S} + files(${files})/${F} + lines(${lines})/${L} = ${raw.toFixed(2)} → clamp(${MIN}, ${MAX}) = ${recommended}`,
    // Per-dimension allocation guidance
    dimension_allocation:
      dimensions > 0
        ? {
            max_dimensions_per_agent: 2,
            suggested_lanes: rc.dimensions || [],
          }
        : null,
    // Subsystem boundary guidance
    subsystem_allocation:
      subsystems > 0
        ? {
            min_agents_for_subsystems: subsystems,
            suggested_subsystem_lanes: rc.subsystems || [],
          }
        : null,
  };
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

  const validDecisions = getMeta("agent_orchestrator.valid_decisions", [
    "multi_packet_parallel",
    "single_packet_direct",
    "single_thread_exception",
  ]);
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
  const packetAgentMap = new Map();

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

  let executionPlanPhase = "";
  const groupSize = getMeta("agent_orchestrator.worker_group_size", 3);

  switch (decision) {
    case "single_thread_exception": {
      executionPlanPhase = "main_thread_execution";
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
      if (packets.length <= groupSize) {
        executionPlanPhase = "spawn_workers";
        for (const pkt of packets) {
          const wid = generateAgentId("worker", pkt.packet_id || `pkt-${agentIds.length}`);
          agentIds.push(wid);
          packetAgentMap.set(pkt.packet_id || `pkt-${agentIds.length - 1}`, wid);
        }
      } else {
        executionPlanPhase = "spawn_sub_orchestrator";
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

  const agentsDir = path.join(taskDir, "agents");
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

  // Compute review agent sizing recommendation when review context is present
  const reviewSizingConfig = getMeta("agent_orchestrator.review_sizing", null);
  const reviewSizingRecommendation = calculateReviewAgentCount(manifest, reviewSizingConfig);

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
    review_sizing_recommendation: reviewSizingRecommendation,
  };
  const planTempFile = `${planFile}.tmp`;
  fs.writeFileSync(planTempFile, yaml.dump(planDoc));
  fs.renameSync(planTempFile, planFile);

  const result = {
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

  if (reviewSizingRecommendation) {
    result.review_sizing_recommendation = reviewSizingRecommendation;
  }

  return result;
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

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
