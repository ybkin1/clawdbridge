#!/usr/bin/env node
// test.js — End-to-end test for constraint-enforcer MCP Server

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  checkPhaseReadiness,
  runMandatoryCheckers,
  validateWritePermission,
  generateEvidenceLock,
  requestPhaseTransition,
  getCheckerCatalog,
} from "./enforcer.js";

const TEST_TASK_DIR = "/tmp/test-constraint-task";
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
      phase_status: "in_progress",
      closeout_allowed: false,
      last_blocker_report: "",
    })
  );

  fs.writeFileSync(
    path.join(TEST_TASK_DIR, "route-projection.yaml"),
    yaml.dump({
      mandatory_checkers: ["dangling-reference-check", "nonexistent-checker"],
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
  assert(result.results.length === 2, "Should process 2 checkers");
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
}

async function testGenerateEvidenceLock() {
  console.log("\n--- Test: generate_evidence_lock ---");

  // First run checkers so we have results to lock
  await runMandatoryCheckers({ taskDir: TEST_TASK_DIR });

  const result = await generateEvidenceLock({ taskDir: TEST_TASK_DIR });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Should generate evidence lock");
  assert(result.checkerCount >= 2, "Should have at least 2 checker results");

  const lockFile = path.join(TEST_TASK_DIR, "checkers", "evidence-lock-build.yaml");
  assert(fs.existsSync(lockFile), "Lock file should exist");
}

async function testRequestPhaseTransition() {
  console.log("\n--- Test: request_phase_transition ---");

  // After evidence lock, readiness should pass
  const readiness = await checkPhaseReadiness({ taskDir: TEST_TASK_DIR });
  console.log("Readiness before transition:", JSON.stringify(readiness, null, 2));

  const result = await requestPhaseTransition({ taskDir: TEST_TASK_DIR, nextPhase: "verify" });
  console.log(JSON.stringify(result, null, 2));
  assert(result.success === true, "Phase transition should succeed");
  assert(result.fromPhase === "build", "From phase should be build");
  assert(result.toPhase === "verify", "To phase should be verify");

  const state = yaml.load(fs.readFileSync(path.join(TEST_TASK_DIR, "00-task-state.yaml"), "utf8"));
  assert(state.phase === "verify", "State phase should be updated");
  assert(state.phase_status === "in_progress", "State phase_status should be in_progress");
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
