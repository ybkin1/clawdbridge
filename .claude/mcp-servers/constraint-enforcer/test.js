#!/usr/bin/env node
// test.js — End-to-end test for constraint-enforcer MCP Server

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import { fileURLToPath } from "url";
import {
  checkPhaseReadiness,
  runMandatoryCheckers,
  validateWritePermission,
  generateEvidenceLock,
  requestPhaseTransition,
  getCheckerCatalog,
  getActiveContractSet,
  invalidateConfigCache,
  agentOrchestrator,
  agentStatus,
  checkpointSync,
} from "./enforcer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_TASK_DIR = path.join(os.tmpdir(), "test-constraint-task");
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    failCount++;
    throw new Error(message);
  }
  console.log(`[PASS] ${message}`);
  passCount++;
}

function setup() {
  if (fs.existsSync(TEST_TASK_DIR)) {
    fs.rmSync(TEST_TASK_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_TASK_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_TASK_DIR, "checkers"), { recursive: true });
  fs.mkdirSync(path.join(TEST_TASK_DIR, "artifacts"), { recursive: true });

  fs.writeFileSync(
    path.join(TEST_TASK_DIR, "artifacts", "design.md"),
    "# Design doc\n"
  );

  fs.writeFileSync(
    path.join(TEST_TASK_DIR, "00-task-state.yaml"),
    yaml.dump({
      task_id: "tk-test-001",
      phase: "build",
      phase_status: "passed",
      closeout_allowed: false,
      last_blocker_report: "",
      current_primary_artifact: "artifacts/design.md",
      updated_at: new Date().toISOString(),
      auditor_verdict: "audited",
    })
  );

  fs.writeFileSync(
    path.join(TEST_TASK_DIR, "route-projection.yaml"),
    yaml.dump({
      mandatory_checkers: ["dangling-reference-check"],
    })
  );

  // Pre-seed dirty-hygiene-closure-check result to satisfy readiness condition 5
  const checkerDir = path.join(TEST_TASK_DIR, "checkers");
  fs.mkdirSync(checkerDir, { recursive: true });
  fs.writeFileSync(
    path.join(checkerDir, "dirty-hygiene-closure-check-20260501T0000.yaml"),
    yaml.dump({
      checker_run_id: "dirty-hygiene-closure-check-20260501T0000",
      checker_id: "dirty-hygiene-closure-check",
      status: "passed",
    })
  );
}

function cleanup() {
  if (fs.existsSync(TEST_TASK_DIR)) {
    fs.rmSync(TEST_TASK_DIR, { recursive: true });
  }
}

async function testCheckPhaseReadiness() {
  console.log("\n--- Test: check_phase_readiness ---");
  const result = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(result.ready === false, "Should not be ready");
  assert(result.gaps.some((g) => g.includes("dangling-reference-check")), "Should detect missing checker");
  assert(result.gaps.some((g) => g.includes("evidence-lock-build.yaml")), "Should detect missing evidence lock");
  assert(result.auditorRequired === false, "auditorRequired should be false when verdict is audited");
}

async function testRunMandatoryCheckers() {
  console.log("\n--- Test: run_mandatory_checkers ---");
  const result = await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should succeed");
  assert(result.results.length === 1, "Should process 1 checker");
}

async function testValidateWritePermission() {
  console.log("\n--- Test: validate_write_permission ---");

  // Non-sensitive file should be allowed
  const r1 = await validateWritePermission({
    taskDir: TEST_TASK_DIR,
    filePath: path.join(TEST_TASK_DIR, "README.md"),
    operation: "Write",
  });
  assert(r1.allowed === true, "README.md should be allowed");

  // Sensitive file with gaps should be blocked
  const r2 = await validateWritePermission({
    taskDir: TEST_TASK_DIR,
    filePath: path.join(TEST_TASK_DIR, "checkers", "evidence-lock-build.yaml"),
    operation: "Write",
  });
  assert(r2.allowed === false, "evidence-lock should be blocked when gaps exist");

  // Path traversal should be blocked
  const r3 = await validateWritePermission({
    taskDir: TEST_TASK_DIR,
    filePath: path.join(TEST_TASK_DIR, "..", "..", "etc", "passwd"),
    operation: "Write",
  });
  assert(r3.allowed === false, "Path traversal should be blocked");
}

async function testGenerateEvidenceLock() {
  console.log("\n--- Test: generate_evidence_lock ---");

  // First run checkers so we have results to lock
  await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });

  const result = await generateEvidenceLock({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should generate evidence lock");
  assert(result.checkerCount >= 1, "Should have at least 1 checker result");

  const lockFile = path.join(TEST_TASK_DIR, "checkers", "evidence-lock-build.yaml");
  assert(fs.existsSync(lockFile), "Lock file should exist");

  const lockDoc = yaml.load(fs.readFileSync(lockFile, "utf8"));
  assert(lockDoc.evidence_lock, "Should have evidence_lock top-level key");
  assert(Array.isArray(lockDoc.evidence_lock.mandatory_checkers), "Should have mandatory_checkers array");
  assert(lockDoc.evidence_lock.mandatory_checkers[0].result_ref, "Should have result_ref");
}

async function testRequestPhaseTransition() {
  console.log("\n--- Test: request_phase_transition ---");

  // Fix dangling-reference-check result to passed so transition can proceed
  const checkerDir = path.join(TEST_TASK_DIR, "checkers");
  const files = fs.readdirSync(checkerDir).filter((f) => f.includes("dangling-reference-check") && f.endsWith(".yaml"));
  for (const f of files) {
    const fp = path.join(checkerDir, f);
    const doc = yaml.load(fs.readFileSync(fp, "utf8"));
    doc.status = "passed";
    fs.writeFileSync(fp, yaml.dump(doc));
  }

  // Update state updated_at to be newer than artifact mtime
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(stateFile, yaml.dump(state));

  // After evidence lock + fixed checker, readiness should pass
  const readiness = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });
  console.log("Readiness before transition:", JSON.stringify(readiness, null, 2));

  const result = await requestPhaseTransition({ taskDir: TEST_TASK_DIR, nextPhase: "verify" });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Phase transition should succeed");
  assert(result.fromPhase === "build", "From phase should be build");
  assert(result.toPhase === "verify", "To phase should be verify");
  assert(result.auditorRequired === false, "Successful transition should have auditorRequired: false");

  const finalState = yaml.load(fs.readFileSync(path.join(TEST_TASK_DIR, "00-task-state.yaml"), "utf8"));
  assert(finalState.phase === "verify", "State phase should be updated");
  assert(finalState.phase_status === "in_progress", "State phase_status should be in_progress");
}

async function testFailedCheckerBlocksTransition() {
  console.log("\n--- Test: failed checker blocks transition ---");
  setup();

  // Run checkers to generate results
  await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });

  // Generate evidence lock
  await generateEvidenceLock({ taskDir: TEST_TASK_DIR });

  // Do NOT fix dangling-reference-check; keep it as failed
  const result = await requestPhaseTransition({ taskDir: TEST_TASK_DIR, nextPhase: "verify" });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === false, "Transition should be blocked when checker failed");
  assert(result.auditorRequired === false, "auditorRequired should be false when only checker fails");
}

async function testAuditorVerdictBlocksTransition() {
  console.log("\n--- Test: auditor verdict blocks transition ---");
  setup();

  // Set auditor_verdict to failed
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.auditor_verdict = "mechanical_gap";
  fs.writeFileSync(stateFile, yaml.dump(state));

  const result = await requestPhaseTransition({ taskDir: TEST_TASK_DIR, nextPhase: "verify" });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === false, "Transition should be blocked when auditor_verdict != audited");
  assert(result.auditorRequired === true, "Should signal auditorRequired when verdict is mechanical_gap");
}

async function testMissingRouteProjection() {
  console.log("\n--- Test: missing route-projection ---");
  setup();

  // Delete route-projection.yaml
  const routeFile = path.join(TEST_TASK_DIR, "route-projection.yaml");
  if (fs.existsSync(routeFile)) fs.unlinkSync(routeFile);

  const result = await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  // When route-projection is missing, MCP derives mandatory checkers from registry.yaml
  assert(result.success === true, "Should succeed even without route-projection");
  assert(result.results.length > 0, "Should derive mandatory checkers from registry");
}

async function testGetActiveContractSet() {
  console.log("\n--- Test: get_active_contract_set ---");
  const result = await getActiveContractSet({
    action_family: "implementation",
    phase: "build",
    delivery_mode: "full",
  });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should return active contract set");
  assert(result.active_contracts.length > 0, "Should have active contracts");
  assert(result.mandatory_checkers.length > 0, "Should derive mandatory checkers from active contracts");
}

async function testRegistryDerivedMinimumCheckers() {
  console.log("\n--- Test: registry-derived minimum checkers ---");
  const result = await getCheckerCatalog();
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should return catalog");
  assert(result.minimum_required > 0, "Minimum required should be derived from registry");
  assert(result.count >= result.minimum_required, "Catalog count should meet or exceed minimum");
}

async function testGetCheckerCatalog() {
  console.log("\n--- Test: get_checker_catalog ---");
  const result = await getCheckerCatalog();
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should return catalog");
  assert(result.count >= 0, "Count should be non-negative");
}

async function testConfigCacheHotReload() {
  console.log("\n--- Test: config cache hot-reload ---");
  const configPath = path.resolve(__dirname, "..", "..", "..", ".claude", "config", "mechanical-conditions.yaml");
  const original = fs.readFileSync(configPath, "utf8");
  const doc = yaml.load(original);

  doc.conditions.push({
    id: "test_hot_reload",
    source: "test",
    description: "Test hot reload",
    check_type: "field_equals",
    target: "00-task-state.yaml",
    field: "hot_reload_test",
    expected: "should_not_match",
    blocker_level: "hard",
  });

  fs.writeFileSync(configPath, yaml.dump(doc));

  const result = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });

  fs.writeFileSync(configPath, original);
  invalidateConfigCache();

  assert(
    result.gaps.some((g) => g.includes("test_hot_reload")),
    "Modified config should be auto-reloaded without manual cache invalidation"
  );
}

async function testAgentOrchestratorValidManifest() {
  console.log("\n--- Test: agent_orchestrator valid manifest ---");
  setup();

  const manifest = {
    manifest_id: "mf-test",
    orchestration_decision: "multi_packet_parallel",
    packets: [
      {
        packet_id: "pkt-auth-login",
        objective: "Implement JWT login handler",
        input_params: ["secret_key", "expiry_hours"],
        max_lines: 50,
        target_file: "src/auth/login.ts",
        acceptance_criteria: ["Unit tests pass"],
      },
      {
        packet_id: "pkt-auth-middleware",
        objective: "Implement auth middleware",
        input_params: ["login_handler_ref"],
        max_lines: 50,
        target_file: "src/auth/middleware.ts",
        acceptance_criteria: ["Type check passes"],
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === true, "Valid manifest should be allowed");
  assert(result.agent_ids.length === 2, "Should assign 2 agent IDs");
  assert(result.execution_plan.phase === "spawn_sub_orchestrator", "Multi-packet should spawn sub-orchestrator");
  assert(fs.existsSync(result.plan_file), "Plan file should be written");
}

async function testAgentOrchestratorInvalidManifest() {
  console.log("\n--- Test: agent_orchestrator invalid manifest ---");
  setup();

  const manifest = {
    manifest_id: "mf-invalid",
    orchestration_decision: "multi_packet_parallel",
    packets: [
      {
        packet_id: "pkt-bad",
        objective: "This is a very long description that definitely exceeds fifteen words limit",
        input_params: ["a", "b", "c", "d", "e", "f"],
        max_lines: 100,
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === false, "Invalid manifest should be blocked");
  assert(result.violations.length > 0, "Should return violations");
}

async function testAgentStatusLifecycle() {
  console.log("\n--- Test: agent_status lifecycle ---");
  setup();

  // Register
  const reg = await agentStatus({
    taskDir: TEST_TASK_DIR,
    operation: "register",
    agent_id: "ag-worker-pkt-001",
    status: "pending",
    role: "worker",
    progress: "0%",
  });
  assert(reg.success === true, "Register should succeed");

  // Update
  const upd = await agentStatus({
    taskDir: TEST_TASK_DIR,
    operation: "update",
    agent_id: "ag-worker-pkt-001",
    status: "running",
    progress: "50%",
    output_ref: "artifacts/pkt-001.ts",
  });
  assert(upd.success === true, "Update should succeed");
  assert(upd.status === "running", "Status should be running");

  // Query
  const qry = await agentStatus({
    taskDir: TEST_TASK_DIR,
    operation: "query",
    agent_id: "ag-worker-pkt-001",
  });
  assert(qry.success === true, "Query should succeed");
  assert(qry.agent.status === "running", "Queried status should be running");
  assert(qry.agent.output_ref === "artifacts/pkt-001.ts", "Output ref should match");

  // List
  const lst = await agentStatus({ taskDir: TEST_TASK_DIR, operation: "list" });
  assert(lst.success === true, "List should succeed");
  assert(lst.count === 1, "Should list 1 agent");
}

async function testCheckpointSync() {
  console.log("\n--- Test: checkpoint_sync ---");
  setup();

  // Save
  const save = await checkpointSync({
    taskDir: TEST_TASK_DIR,
    operation: "save",
    checkpoint_id: "cp-test-001",
  });
  assert(save.success === true, "Save should succeed");
  assert(fs.existsSync(save.checkpoint_file), "Checkpoint file should exist");

  // List
  const lst = await checkpointSync({ taskDir: TEST_TASK_DIR, operation: "list" });
  assert(lst.success === true, "List should succeed");
  assert(lst.count === 1, "Should list 1 checkpoint");

  // Load
  const load = await checkpointSync({
    taskDir: TEST_TASK_DIR,
    operation: "load",
    checkpoint_id: "cp-test-001",
  });
  assert(load.success === true, "Load should succeed");
  assert(load.snapshot.checkpoint_id === "cp-test-001", "Loaded checkpoint ID should match");
  assert(load.snapshot.task_state.task_id === "tk-test-001", "Task state should be captured");
}

async function main() {
  setup();

  await testCheckPhaseReadiness();
  await testRunMandatoryCheckers();
  await testValidateWritePermission();
  await testGenerateEvidenceLock();
  await testRequestPhaseTransition();
  await testFailedCheckerBlocksTransition();
  await testAuditorVerdictBlocksTransition();
  await testMissingRouteProjection();
  await testGetCheckerCatalog();
  await testGetActiveContractSet();
  await testRegistryDerivedMinimumCheckers();
  await testConfigCacheHotReload();
  await testAgentOrchestratorValidManifest();
  await testAgentOrchestratorInvalidManifest();
  await testAgentStatusLifecycle();
  await testCheckpointSync();

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  cleanup();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test failed:", e);
  cleanup();
  process.exit(1);
});
