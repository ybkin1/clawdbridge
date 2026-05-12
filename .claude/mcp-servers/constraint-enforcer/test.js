#!/usr/bin/env node
// test.js — End-to-end test for constraint-enforcer MCP Server

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import {
  checkPhaseReadiness,
  runMandatoryCheckers,
  validateWritePermission,
  generateEvidenceLock,
  requestPhaseTransition,
  getCheckerCatalog,
} from "./enforcer.js";

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

  // Fix dangling-reference-check to passed so evidence lock can be generated
  const checkerDir = path.join(TEST_TASK_DIR, "checkers");
  const files = fs.readdirSync(checkerDir).filter((f) => f.includes("dangling-reference-check") && f.endsWith(".yaml"));
  for (const f of files) {
    const fp = path.join(checkerDir, f);
    const doc = yaml.load(fs.readFileSync(fp, "utf8"));
    doc.status = "passed";
    fs.writeFileSync(fp, yaml.dump(doc));
  }

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
}

async function testMissingRouteProjection() {
  console.log("\n--- Test: missing route-projection ---");
  setup();

  // Delete route-projection.yaml
  const routeFile = path.join(TEST_TASK_DIR, "route-projection.yaml");
  if (fs.existsSync(routeFile)) fs.unlinkSync(routeFile);

  const result = await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(result.summary.includes("No mandatory_checkers"), "Should report no mandatory checkers");
}

async function testGetCheckerCatalog() {
  console.log("\n--- Test: get_checker_catalog ---");
  const result = await getCheckerCatalog();
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should return catalog");
  assert(result.count >= 0, "Count should be non-negative");
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

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  cleanup();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test failed:", e);
  cleanup();
  process.exit(1);
});
