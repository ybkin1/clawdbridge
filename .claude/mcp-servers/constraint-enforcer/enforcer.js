// enforcer.js — Barrel file: re-exports all constraint logic from lib/ modules
// Previous monolithic implementation has been split into focused sub-modules.

export {
  loadConfig,
  loadAllConfigs,
  loadYaml,
  invalidateConfigCache,
  estimateTokens,
  getMeta,
  hashFile,
  hashDir,
  loadRegistryYaml,
  loadAgentOrchestrationRules,
  PROJECT_ROOT,
  CONFIG_DIR,
  startupValidationErrors,
  validateConfigs,
} from "./lib/config-loader.js";

export {
  findActiveTask,
  resolveTaskDir,
} from "./lib/task-resolver.js";

export {
  evaluateCondition,
  checkPhaseReadiness,
} from "./lib/condition-engine.js";

export {
  runMandatoryCheckers,
} from "./lib/checker-runner.js";

export {
  validateWritePermission,
  validateBashCommand,
} from "./lib/permission-gate.js";

export {
  getActiveContractSet,
  getActiveContractSetInternal,
  getCheckerCatalog,
} from "./lib/contract-resolver.js";

export {
  generateEvidenceLock,
} from "./lib/evidence-lock.js";

export {
  requestPhaseTransition,
} from "./lib/phase-transition.js";

export {
  agentOrchestrator,
  agentStatus,
} from "./lib/agent-orchestrator.js";

export {
  checkpointSync,
} from "./lib/checkpoint-store.js";
