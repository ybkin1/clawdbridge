// lib/contract-resolver.js — Registry-aware contract activation and checker catalog

import fs from "fs";
import path from "path";
import {
  loadRegistryYaml,
  loadYaml,
  PROJECT_ROOT,
} from "./config-loader.js";

function evaluateEffectiveScope(scopeList, context) {
  if (!Array.isArray(scopeList)) scopeList = [scopeList];

  for (const expr of scopeList) {
    const str = String(expr).trim();

    if (str === "all" || str === "all tasks" || str === "all phases" || str === "all files") {
      continue;
    }

    let m = str.match(/^(\w+)\s*>=\s*(\d+)%?$/);
    if (m) {
      const [, key, val] = m;
      const actual = parseFloat(context[key]) || 0;
      if (actual < parseFloat(val)) return false;
      continue;
    }

    m = str.match(/^(\w+)\s*<=\s*(\d+)%?$/);
    if (m) {
      const [, key, val] = m;
      const actual = parseFloat(context[key]) || 0;
      if (actual > parseFloat(val)) return false;
      continue;
    }

    m = str.match(/^(\w+)\s*=\s*(.+)$/);
    if (m) {
      const [, key, val] = m;
      const actual = context[key];
      const alternatives = val.split("|").map((s) => s.trim());
      if (!alternatives.includes(String(actual))) return false;
      continue;
    }

    const actual = context[str];
    if (actual === undefined || actual === null || actual === false) return false;
  }

  return true;
}

export function getActiveContractSetInternal(context) {
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

  const visiting = new Set();
  const visited = new Set();
  const cyclePath = [];

  function dfs(node, path) {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      cyclePath.push(...path.slice(cycleStart));
      return true;
    }
    if (visited.has(node)) return false;
    visiting.add(node);
    path.push(node);
    for (const dep of dependencyGraph[node] || []) {
      if (dfs(dep, path)) return true;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of Object.keys(dependencyGraph)) {
    if (!visited.has(node)) {
      if (dfs(node, [])) {
        return {
          success: false,
          reason: `Circular dependency detected in registry.yaml: ${cyclePath.join(" -> ")} -> ${cyclePath[0]}`,
          dependency_graph: dependencyGraph,
        };
      }
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
