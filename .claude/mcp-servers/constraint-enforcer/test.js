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
  validateBashCommand,
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

  // Update state updated_at to be newer than artifact mtime, and seed gate results
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.updated_at = new Date().toISOString();
  state.gate_professional = { status: "passed" };
  state.gate_contract = { status: "passed" };
  fs.writeFileSync(stateFile, yaml.dump(state));

  // Create Auditor receipt (P0-1 fix requires receipt file)
  const reviewsDir = path.join(TEST_TASK_DIR, "reviews");
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewsDir, "receipt-auditor.yaml"),
    yaml.dump({
      auditor_verdict: "audited",
      evidence_lock_hash: "",
      reviewed_at: new Date().toISOString(),
    })
  );

  // After evidence lock + fixed checker + auditor receipt, readiness should pass
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

  // Seed gate results so readiness fails only due to checker, not missing gates
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.gate_professional = { status: "passed" };
  state.gate_contract = { status: "passed" };
  fs.writeFileSync(stateFile, yaml.dump(state));

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

  // Seed gate results so readiness is not blocked by missing gates
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.gate_professional = { status: "passed" };
  state.gate_contract = { status: "passed" };
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
        acceptance_criteria: ["→ Returns JWT token on valid credentials"],
      },
      {
        packet_id: "pkt-auth-middleware",
        objective: "Implement auth middleware",
        input_params: ["login_handler_ref"],
        max_lines: 50,
        target_file: "src/auth/middleware.ts",
        acceptance_criteria: ["→ Throws 401 on invalid token"],
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === true, "Valid manifest should be allowed");
  assert(result.agent_ids.length === 2, "Should assign 2 agent IDs");
  assert(result.execution_plan.phase === "spawn_workers", "≤3 packets should spawn workers directly");
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

  // Query (read without restore)
  const qry = await checkpointSync({
    taskDir: TEST_TASK_DIR,
    operation: "query",
    checkpoint_id: "cp-test-001",
  });
  assert(qry.success === true, "Query should succeed");
  assert(qry.snapshot.checkpoint_id === "cp-test-001", "Queried checkpoint ID should match");
  assert(qry.snapshot.task_state.task_id === "tk-test-001", "Task state should be captured");
}

// ---------------------------------------------------------------------------
// Round 2 fix test coverage (P0/P1)
// ---------------------------------------------------------------------------

async function testSoftBlockerWarnings() {
  console.log("\n--- Test: soft blocker warnings (P0-4) ---");
  setup();

  // Set closeout_allowed = true to trigger the soft blocker closeout_not_already_allowed
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.closeout_allowed = true;
  fs.writeFileSync(stateFile, yaml.dump(state));

  const result = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(
    result.warnings.some((w) => w && w.includes("closeout_not_already_allowed")),
    "Should surface soft blocker in warnings"
  );
  // Note: ready is false here due to other hard blockers (gates, checkers, evidence lock),
  // not because of the soft blocker. The soft blocker alone would allow ready=true.
}

async function testRoleBasedWritePermission() {
  console.log("\n--- Test: role-based write permission (P1-1) ---");
  setup();

  // Worker role should be blocked from writing state file
  const r1 = await validateWritePermission({
    taskDir: TEST_TASK_DIR,
    filePath: path.join(TEST_TASK_DIR, "00-task-state.yaml"),
    operation: "Write",
    role: "worker",
    newContent: yaml.dump({ phase_status: "passed" }),
  });
  assert(r1.allowed === false, "Worker should be blocked from writing state file");
  assert(r1.reason.includes("worker"), "Reason should mention worker role");

  // Orchestrator role should not be blocked by role (but may be blocked by readiness)
  const r2 = await validateWritePermission({
    taskDir: TEST_TASK_DIR,
    filePath: path.join(TEST_TASK_DIR, "00-task-state.yaml"),
    operation: "Write",
    role: "orchestrator",
    newContent: yaml.dump({ phase_status: "passed" }),
  });
  assert(!r2.reason.includes("orchestrator"), "Orchestrator should not be blocked by role policy");
}

async function testMissingGatesDetection() {
  console.log("\n--- Test: missing gates detection (P1-2) ---");
  setup();

  // Build phase has gates [professional, contract]; omit them from state
  const stateFile = path.join(TEST_TASK_DIR, "00-task-state.yaml");
  const state = yaml.load(fs.readFileSync(stateFile, "utf8"));
  state.phase = "build";
  delete state.gate_professional;
  delete state.gate_contract;
  fs.writeFileSync(stateFile, yaml.dump(state));

  const result = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(
    result.gaps.some((g) => g && g.includes("Missing gate results")),
    "Should detect missing expected gates"
  );
  assert(
    result.gaps.some((g) => g && g.includes("gate_professional")),
    "Gap should mention gate_professional"
  );
}

async function testFileLinesAtomicity() {
  console.log("\n--- Test: file_lines atomicity reads actual files (P1-4) ---");
  setup();

  // Create a 60-line file (>50 limit)
  const bigFile = path.join(TEST_TASK_DIR, "big-file.ts");
  fs.writeFileSync(bigFile, Array(60).fill("line").join("\n"));

  const manifest = {
    manifest_id: "mf-lines",
    orchestration_decision: "single_packet_direct",
    packets: [
      {
        packet_id: "pkt-big",
        objective: "Implement big module",
        code_refs: [bigFile],
        acceptance_criteria: ["Compiles"],
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === false, "Oversized file should be blocked");
  assert(
    result.violations.some((v) => v.violations.some((vv) => vv.includes("code_line_limit"))),
    "Should report code_line_limit violation"
  );
}

async function testMustContainVerbs() {
  console.log("\n--- Test: single_sentence must_contain_verbs (P1-5) ---");
  setup();

  const manifest = {
    manifest_id: "mf-verbs",
    orchestration_decision: "single_packet_direct",
    packets: [
      {
        packet_id: "pkt-verb",
        objective: "Implement handler",
        acceptance_criteria: "This is good.",
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === false, "Missing verb should be blocked");
  assert(
    result.violations.some((v) => v.violations.some((vv) => vv.includes("acceptance_criteria_single_sentence"))),
    "Should report acceptance_criteria_single_sentence violation"
  );
}

async function testL4NamePrecision() {
  console.log("\n--- Test: l4_name_precision allows standalone function names (P1-6) ---");
  setup();

  const manifest = {
    manifest_id: "mf-l4",
    orchestration_decision: "single_packet_direct",
    packets: [
      {
        packet_id: "pkt-l4",
        name: "validatePacket",
        objective: "Validate packet",
        acceptance_criteria: ["→ returns true"],
      },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === true, "Standalone function name should be allowed");
}

async function testSubOrchestratorAssignment() {
  console.log("\n--- Test: sub-orchestrator assignment for >3 packets (P1-3) ---");
  setup();

  const manifest = {
    manifest_id: "mf-sub",
    orchestration_decision: "multi_packet_parallel",
    packets: [
      { packet_id: "pkt-a", objective: "A", acceptance_criteria: ["→ returns A"] },
      { packet_id: "pkt-b", objective: "B", acceptance_criteria: ["→ returns B"] },
      { packet_id: "pkt-c", objective: "C", acceptance_criteria: ["→ returns C"] },
      { packet_id: "pkt-d", objective: "D", acceptance_criteria: ["→ returns D"] },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === true, "Valid multi-packet manifest should be allowed");
  assert(
    result.agent_ids.some((id) => id.includes("sub-orchestrator")),
    "Should assign sub-orchestrator agent(s)"
  );
  assert(
    result.execution_plan.phase === "spawn_sub_orchestrator",
    "Execution plan should be spawn_sub_orchestrator"
  );
}

async function testSingleThreadException() {
  console.log("\n--- Test: single_thread_exception assigns no agents (P1-3) ---");
  setup();

  const manifest = {
    manifest_id: "mf-st",
    orchestration_decision: "single_thread_exception",
    packets: [
      { packet_id: "pkt-st", objective: "Quick fix", acceptance_criteria: ["→ returns fixed"] },
    ],
  };

  const result = await agentOrchestrator({ taskDir: TEST_TASK_DIR, manifest });
  console.log(JSON.stringify(result, null, 2));
  assert(result.allowed === true, "Single thread exception should be allowed");
  assert(result.agent_ids.length === 0, "Should assign zero agents");
  assert(
    result.execution_plan.phase === "main_thread_execution",
    "Execution plan should be main_thread_execution"
  );
}

async function testContextBudgetMapping() {
  console.log("\n--- Test: context_budget_percent maps to context_budget (P1-8) ---");
  // context-compaction effective_scope: [all tasks, context_budget >= 55%]
  const result = await getActiveContractSet({
    action_family: "implementation",
    phase: "build",
    delivery_mode: "full",
    context_budget_percent: 80,
  });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should return active contract set");
  assert(
    result.active_contracts.some((c) => c.id === "context-compaction"),
    "context-compaction should be active when context_budget_percent=80"
  );

  // Below threshold should still match "all tasks" but not the budget condition
  // Actually "all tasks" is in the same list, so it should still match because
  // evaluateEffectiveScope uses AND across list items. Wait — "all tasks" is
  // in the same list as "context_budget >= 55%". "all tasks" is not a key=value
  // pattern; the current code tries to parse it and falls through to the literal
  // check: actual = context["all tasks"], which is undefined, so it returns false.
  // Hmm, but the test in test.js currently passes for getActiveContractSet.
  // Let me check: "all tasks" in evaluateEffectiveScope falls to the default
  // case: `const actual = context[str];` which is context["all tasks"] = undefined.
  // This returns false! So context-compaction should NOT be active even with
  // context_budget_percent=80.
  //
  // BUT "all tasks" is supposed to mean universal match. In the registry comment
  // it says "裸字符串（如 all tasks、all phases）为领域限定符，表示匹配该领域下的所有值".
  // The current code does NOT handle this correctly — it falls through to literal check.
  // However, the previous fix P1-7 only handled "all" exactly, not "all tasks".
  //
  // Wait, looking at evaluateEffectiveScope:
  // `if (str === "all" || str === "all tasks" || str === "all phases" || str === "all files") { continue; }`
  // YES! P1-7 fix added exact string matching for "all tasks" etc.
  // So "all tasks" will match (continue), then "context_budget >= 55%" will be evaluated.
  // If context_budget >= 55, the whole scope matches.
  //
  // So with context_budget_percent=80, context-compaction SHOULD be active.
}

async function testLoadRegistryYamlDirectParse() {
  console.log("\n--- Test: loadRegistryYaml direct parse (P0-3) ---");
  // This is tested indirectly: getActiveContractSet relies on loadRegistryYaml.
  // If it works without markdown fallback, contracts are returned.
  const result = await getActiveContractSet({ action_family: "implementation", phase: "build", delivery_mode: "full" });
  assert(result.success === true, "Registry should load via direct YAML parse");
  assert(result.active_contracts.length > 0, "Should have active contracts from direct parse");
}

async function testBashRedirectionDetection() {
  console.log("\n--- Test: Bash redirection detection (P0-2) ---");
  setup();

  // Should block redirect to state file
  const r1 = await validateBashCommand({
    taskDir: TEST_TASK_DIR,
    command: "echo 'tamper' > 00-task-state.yaml",
    role: "worker",
  });
  assert(r1.allowed === false, "Bash redirect to state file should be blocked");
  assert(r1.reason.includes("00-task-state.yaml"), "Reason should mention target file");

  // Should allow redirect to /dev/null
  const r2 = await validateBashCommand({
    taskDir: TEST_TASK_DIR,
    command: "echo 'safe' > /dev/null",
    role: "worker",
  });
  assert(r2.allowed === true, "Bash redirect to /dev/null should be allowed");

  // Should block tee to state file
  const r3 = await validateBashCommand({
    taskDir: TEST_TASK_DIR,
    command: "echo 'tamper' | tee 00-task-state.yaml",
    role: "worker",
  });
  assert(r3.allowed === false, "Bash tee to state file should be blocked");

  // Should block append redirect to sensitive file
  const r4 = await validateBashCommand({
    taskDir: TEST_TASK_DIR,
    command: "echo 'more' >> artifacts/design.md",
    role: "worker",
  });
  assert(r4.allowed === true, "Bash append to non-sensitive artifact should be allowed");
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

  // Round 2 fix coverage
  await testSoftBlockerWarnings();
  await testRoleBasedWritePermission();
  await testMissingGatesDetection();
  await testFileLinesAtomicity();
  await testMustContainVerbs();
  await testL4NamePrecision();
  await testSubOrchestratorAssignment();
  await testSingleThreadException();
  await testContextBudgetMapping();
  await testLoadRegistryYamlDirectParse();

  // Round 3 re-review fix coverage
  await testBashRedirectionDetection();

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  cleanup();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test failed:", e);
  cleanup();
  process.exit(1);
});
