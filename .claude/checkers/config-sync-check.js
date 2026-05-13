#!/usr/bin/env node
// Checker: config-sync-check
// Mode: automated
// Scope: .claude/config/*.yaml, registry.yaml, checkers/index.yaml
// Purpose: 验证 5 个核心配置维度的一致性（mechanical-conditions, phase-state-machine, registry, checkers/index, write-permissions, mcp-capabilities），防止规范与配置漂移

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require(path.join(__dirname, "..", "mcp-servers", "constraint-enforcer", "node_modules", "js-yaml", "index.js"));

const PROJECT_ROOT = process.argv[2] || ".";

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

function extractYamlFromMarkdown(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/```yaml\s*\n([\s\S]*?)\n```/);
  if (match) {
    try {
      return yaml.load(match[1]);
    } catch {}
  }
  try {
    return yaml.load(content);
  } catch {}
  return null;
}

const errors = [];

// ---------------------------------------------------------------------------
// Check 1: mechanical-conditions.yaml 必须包含 task-tracking-workflow-spec.md
//          §4.2.1 中定义的 8 项核心机械条件
// ---------------------------------------------------------------------------
const mcFile = path.join(PROJECT_ROOT, ".claude", "config", "mechanical-conditions.yaml");
const mc = loadYaml(mcFile);
if (!mc) {
  errors.push("mechanical-conditions.yaml missing or unreadable");
} else {
  const coreIds = [
    "phase_status_passed",
    "gates_all_passed",
    "primary_artifact_exists_nonempty",
    "no_unresolved_blocker",
    "dirty_hygiene_passed",
    "state_freshness",
    "mandatory_checkers_passed_or_excepted",
    "auditor_verdict_audited",
  ];
  const actualIds = (mc.conditions || []).map((c) => c.id);
  for (const id of coreIds) {
    if (!actualIds.includes(id)) {
      errors.push(`mechanical-conditions.yaml missing core condition: ${id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: phase-state-machine.yaml 的 gates 映射必须与
//          task-tracking-workflow-spec.md §4.3 一致
// ---------------------------------------------------------------------------
const psmFile = path.join(PROJECT_ROOT, ".claude", "config", "phase-state-machine.yaml");
const psm = loadYaml(psmFile);
if (!psm) {
  errors.push("phase-state-machine.yaml missing or unreadable");
} else {
  const expected = {
    clarify: [],
    research: ["professional"],
    "architecture-decomposition": ["professional", "contract"],
    spec: ["value", "professional", "contract"],
    design: ["professional", "contract"],
    plan: ["professional"],
    build: ["professional", "contract"],
    verify: ["professional", "contract"],
    acceptance: ["value", "professional", "contract"],
    "release-ready": ["contract"],
  };
  for (const [phase, expectedGates] of Object.entries(expected)) {
    const pdef = psm.phases?.find((p) => p.id === phase);
    if (!pdef) {
      errors.push(`phase-state-machine.yaml missing phase: ${phase}`);
      continue;
    }
    const actualGates = pdef.gates || [];
    const missing = expectedGates.filter((g) => !actualGates.includes(g));
    const extra = actualGates.filter((g) => !expectedGates.includes(g));
    if (missing.length > 0) {
      errors.push(`phase '${phase}' missing gates: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      errors.push(`phase '${phase}' unexpected gates: ${extra.join(", ")}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: registry.yaml 中所有 active contract 的 checker_refs 必须在
//          checkers/index.yaml 中有定义
// ---------------------------------------------------------------------------
const registry = extractYamlFromMarkdown(
  path.join(PROJECT_ROOT, ".claude", "contracts", "registry.yaml")
);
const index = loadYaml(path.join(PROJECT_ROOT, ".claude", "checkers", "index.yaml"));

if (!registry) {
  errors.push("registry.yaml missing or unreadable");
}
if (!index) {
  errors.push("checkers/index.yaml missing or unreadable");
}

if (registry && index) {
  const indexIds = new Set(Object.keys(index.checkers || {}));
  for (const [cid, contract] of Object.entries(registry.contracts || {})) {
    if (contract.status !== "active") continue;
    const refs = contract.checker_refs || [];
    for (const ref of refs) {
      if (!indexIds.has(ref)) {
        errors.push(`registry contract '${cid}' references unknown checker: ${ref}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: write-permissions.yaml 必须包含所有关键敏感文件模式
// ---------------------------------------------------------------------------
const wpFile = path.join(PROJECT_ROOT, ".claude", "config", "write-permissions.yaml");
const wp = loadYaml(wpFile);
if (!wp) {
  errors.push("write-permissions.yaml missing or unreadable");
} else {
  const requiredPatterns = ["state_file", "evidence_lock", "checker_result", "receipt"];
  const actualNames = (wp.sensitive_patterns || []).map((p) => p.name);
  for (const name of requiredPatterns) {
    if (!actualNames.includes(name)) {
      errors.push(`write-permissions.yaml missing sensitive_pattern: ${name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5: mcp-capabilities.yaml 必须声明 manual_gate_pending_policy
// ---------------------------------------------------------------------------
const capsFile = path.join(PROJECT_ROOT, ".claude", "config", "mcp-capabilities.yaml");
const caps = loadYaml(capsFile);
if (!caps) {
  errors.push("mcp-capabilities.yaml missing or unreadable");
} else {
  if (!caps.behavior?.manual_gate_pending_policy) {
    errors.push("mcp-capabilities.yaml missing behavior.manual_gate_pending_policy");
  }
}

// ---------------------------------------------------------------------------
// Check 6: mcp-capabilities.automatable check_types must be known
// ---------------------------------------------------------------------------
const KNOWN_CHECK_TYPES = new Set([
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

if (caps) {
  const automatable = caps.automatable || [];
  for (const item of automatable) {
    if (typeof item === "string" && !KNOWN_CHECK_TYPES.has(item)) {
      errors.push(`mcp-capabilities.automatable contains unknown check_type: ${item}`);
    } else if (typeof item === "object" && item.check_type && !KNOWN_CHECK_TYPES.has(item.check_type)) {
      errors.push(`mcp-capabilities.automatable contains unknown check_type: ${item.check_type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7: phase-state-machine next-linkage consistency (no dangling, no cycles)
// ---------------------------------------------------------------------------
if (psm) {
  const phaseIds = new Set((psm.phases || []).map((p) => p.id));
  const adj = new Map();
  for (const p of psm.phases || []) {
    if (p.next && !phaseIds.has(p.next)) {
      errors.push(`phase-state-machine: phase '${p.id}' has dangling next='${p.next}'`);
    }
    if (p.next) {
      adj.set(p.id, p.next);
    }
  }
  // Cycle detection (Floyd or DFS)
  for (const start of phaseIds) {
    const visited = new Set();
    let cur = start;
    while (cur && adj.has(cur)) {
      if (visited.has(cur)) {
        errors.push(`phase-state-machine: cycle detected involving phase '${cur}'`);
        break;
      }
      visited.add(cur);
      cur = adj.get(cur);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 8: registry.yaml active contracts must have version field
// ---------------------------------------------------------------------------
if (registry) {
  for (const [cid, contract] of Object.entries(registry.contracts || {})) {
    if (contract.status === "active" && contract.version === undefined) {
      errors.push(`registry contract '${cid}' is active but missing 'version' field`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 9: all config files must have version field
// ---------------------------------------------------------------------------
const allConfigs = [
  { name: "mechanical-conditions", doc: mc },
  { name: "phase-state-machine", doc: psm },
  { name: "write-permissions", doc: wp },
  { name: "mcp-capabilities", doc: caps },
];
for (const { name, doc } of allConfigs) {
  if (doc && doc.version === undefined) {
    errors.push(`config '${name}.yaml' missing 'version' field`);
  }
}

// ---------------------------------------------------------------------------
// Check 10: write-permissions.roles structure integrity
// ---------------------------------------------------------------------------
if (wp) {
  const roles = wp.roles || [];
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    if (!role.id) {
      errors.push(`write-permissions.yaml roles[${i}] missing 'id'`);
    }
    if (!Array.isArray(role.allows)) {
      errors.push(`write-permissions.yaml role '${role.id || i}' missing or invalid 'allows'`);
    }
    if (!Array.isArray(role.blocks)) {
      errors.push(`write-permissions.yaml role '${role.id || i}' missing or invalid 'blocks'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 11: mechanical-conditions check_type values must be in declared check_types list
// ---------------------------------------------------------------------------
if (mc) {
  const declaredTypes = new Set(mc.check_types || []);
  for (const cond of mc.conditions || []) {
    if (cond.check_type && !declaredTypes.has(cond.check_type)) {
      errors.push(`mechanical-conditions condition '${cond.id}' uses undeclared check_type '${cond.check_type}' (not in check_types list)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 12: atomicity-rules check_type values must be known
// ---------------------------------------------------------------------------
const atomicityFile = path.join(PROJECT_ROOT, ".claude", "config", "atomicity-rules.yaml");
const atomicity = loadYaml(atomicityFile);
const KNOWN_ATOMICITY_CHECK_TYPES = new Set([
  "word_count", "array_length", "file_lines", "file_count",
  "estimated_tokens", "regex_match", "single_sentence",
]);
if (atomicity) {
  for (const rule of atomicity.rules || []) {
    if (rule.check_type && !KNOWN_ATOMICITY_CHECK_TYPES.has(rule.check_type)) {
      errors.push(`atomicity-rules rule '${rule.id}' uses unknown check_type '${rule.check_type}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 13: registry.yaml checklist_refs must point to existing checklist files
// ---------------------------------------------------------------------------
if (registry) {
  const checklistsDir = path.join(PROJECT_ROOT, ".claude", "checklists");
  for (const [cid, contract] of Object.entries(registry.contracts || {})) {
    if (contract.status !== "active") continue;
    const refs = contract.checklist_refs || [];
    for (const ref of refs) {
      const checklistPath = path.join(checklistsDir, `${ref}.md`);
      const checklistYamlPath = path.join(checklistsDir, `${ref}.yaml`);
      if (!fs.existsSync(checklistPath) && !fs.existsSync(checklistYamlPath)) {
        errors.push(`registry contract '${cid}' references missing checklist: ${ref} (neither .md nor .yaml found in checklists/)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 14: checkers/index.yaml gate_bindings must match phase-state-machine gates
// ---------------------------------------------------------------------------
if (index && psm) {
  const validGates = new Set();
  for (const p of psm.phases || []) {
    for (const g of p.gates || []) {
      validGates.add(g);
    }
  }
  for (const [cid, checker] of Object.entries(index.checkers || {})) {
    const gateBinding = String(checker.gate_binding || "");
    if (gateBinding) {
      const boundGates = gateBinding.split(",").map((g) => g.trim()).filter(Boolean);
      for (const bg of boundGates) {
        if (!validGates.has(bg)) {
          errors.push(`checker '${cid}' has gate_binding '${bg}' (from '${gateBinding}') not found in any phase`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 15: config-meta.yaml must exist and have required sections
// ---------------------------------------------------------------------------
const metaFile = path.join(PROJECT_ROOT, ".claude", "config", "config-meta.yaml");
const meta = loadYaml(metaFile);
if (!meta) {
  errors.push("config-meta.yaml missing or unreadable");
} else {
  const requiredSections = ["config_loader", "schema", "checker_runner", "agent_orchestrator"];
  for (const section of requiredSections) {
    if (!meta[section]) {
      errors.push(`config-meta.yaml missing required section: ${section}`);
    }
  }
}

// Output
if (errors.length > 0) {
  console.log("FAILED: config-sync-check");
  for (const e of errors) {
    console.log(`  ERROR: ${e}`);
  }
  process.exit(1);
}

console.log("PASSED: config-sync-check — all config sources are consistent");
process.exit(0);
