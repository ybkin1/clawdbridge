/**
 * 测试脚本：验证 Agent Orchestrator MCP Server 的基础功能
 * 运行: node test.js
 */
import { parallelReview, parallelResearch, orchestrateReview } from "./orchestrator.js";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, "test-output");
mkdirSync(testDir, { recursive: true });

console.log("=== Agent Orchestrator MCP — 功能测试 ===\n");

// 测试 1: parallel_review
console.log("[Test 1] parallel_review with 2 dimensions...");
try {
  const testFile = join(__dirname, "tools.js");
  const result = await parallelReview(
    testFile,
    ["code_style", "correctness"],
    [],
    join(testDir, "test-review-report.md")
  );
  console.log(`  ✅ done. Report: ${testDir}/test-review-report.md`);
  console.log(`  Preview: ${result.slice(0, 200)}...\n`);
} catch (err) {
  console.log(`  ❌ Failed: ${err.message}\n`);
}

// 测试 2: parallel_research
console.log("[Test 2] parallel_research with 2 angles...");
try {
  const result = await parallelResearch(
    "Node.js MCP server implementation best practices",
    ["technical", "risks"],
    join(testDir, "test-research-report.md")
  );
  console.log(`  ✅ done. Report: ${testDir}/test-research-report.md`);
  console.log(`  Preview: ${result.slice(0, 200)}...\n`);
} catch (err) {
  console.log(`  ❌ Failed: ${err.message}\n`);
}

// 测试 3: orchestrate_review
console.log("[Test 3] orchestrate_review for code...");
try {
  const result = await orchestrateReview(
    join(__dirname, "orchestrator.js"),
    "code",
    join(testDir, "orchestrate-test")
  );
  console.log(`  ✅ done. Output: ${testDir}/orchestrate-test/`);
  console.log(`  Preview: ${result.slice(0, 200)}...\n`);
} catch (err) {
  console.log(`  ❌ Failed: ${err.message}\n`);
}

console.log("=== All tests completed ===");
