import { spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_EXE = join(
  process.env.APPDATA,
  "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
);
const PROJECT_ROOT = join(__dirname, "..", "..");

const ALL_DIMENSIONS = ["security", "architecture", "performance", "correctness", "completeness", "code_style"];
const ALL_ANGLES = ["competitive", "technical", "papers", "ecosystem", "risks"];

const DIMENSION_PROMPTS = {
  security: `你是安全评审专家。请对以下文件做安全评审：
- 认证/授权：是否有未授权访问风险？Token/密钥是否硬编码？
- 输入过滤：是否存在注入风险（SQL/OS/路径注入）？
- 路径安全：文件操作路径是否可控？
- 加密：敏感数据是否加密传输/存储？
- 权限控制：操作是否有适当的权限检查？

输出格式 (Markdown):
## 安全评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Critical 问题
- 问题描述 | 位置 | 修复建议
### Major 问题
- 问题描述 | 位置 | 修复建议
### 安全评分: [0-10]`,

  architecture: `你是架构评审专家。请对以下文件做架构评审：
- 模块拆分：职责是否单一？边界是否清晰？
- 技术选型：当前选型是否合理？有无更优替代？
- 接口设计：输入/输出定义是否完整？版本化策略？
- 耦合度：模块间依赖是否可接受？循环依赖？
- 可扩展性：扩展点是否预留？是否有硬编码限制？

输出格式 (Markdown):
## 架构评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Critical 问题
### Major 问题
### 架构评分: [0-10]`,

  performance: `你是性能评审专家。请对以下文件做性能评审：
- 时间复杂度：关键路径的算法复杂度？
- 内存使用：是否有内存泄漏风险？大对象是否需要池化？
- IO 操作：是否存在不必要的同步 IO？数据库查询是否 N+1？
- 并发处理：是否有线程安全/竞态条件风险？
- 资源释放：文件句柄/连接是否可靠关闭？

输出格式 (Markdown):
## 性能评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Critical 问题
### Major 问题
### 性能评分: [0-10]`,

  correctness: `你是正确性评审专家。请对以下文件做正确性评审：
- 逻辑错误：是否存在逻辑漏洞？条件判断是否完整？
- 边界条件：空输入/极大值/特殊字符的处理？
- 错误处理：异常是否被正确捕获和处理？
- 数据完整性：数据变更是否保证一致性？
- 幂等性：重复操作是否安全？

输出格式 (Markdown):
## 正确性评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Critical 问题
### Major 问题
### 正确性评分: [0-10]`,

  completeness: `你是完整性评审专家。请对以下文件做完整性评审：
- 需求覆盖：是否所有需求点都有对应实现？
- 文档完整：接口/配置/部署文档是否齐全？
- 测试覆盖：单元/集成/E2E 测试是否充分？
- 边界场景：正常/异常/边界/并发场景是否覆盖？
- 监控/日志：关键路径是否有足够的可观测性？

输出格式 (Markdown):
## 完整性评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Critical 问题
### Major 问题
### 完整性评分: [0-10]`,

  code_style: `你是代码风格评审专家。请对以下文件做风格评审：
- 命名规范：变量/函数/类命名是否清晰、一致？
- 代码结构：函数长度是否合理？嵌套深度？
- 注释质量：是否有必要的文档注释？注释是否与代码一致？
- 一致性：与项目中其他文件的风格是否一致？
- 最佳实践：是否遵循语言/框架的惯用写法？

输出格式 (Markdown):
## 代码风格评审报告
### 总体结论: [Pass / Conditional Pass / Fail]
### Major 问题
### 风格评分: [0-10]`
};

const ANGLE_PROMPTS = {
  competitive: `对"{topic}"做竞品分析。搜索 3-5 个竞品/参考项目，输出对比表（项目名/技术栈/优势/劣势/GitHub Stars/活跃度）。`,
  technical: `对"{topic}"做技术方案调研。分析主流技术路线、框架选型、架构模式，输出技术对比表和推荐方案。`,
  papers: `搜索"{topic}"相关的学术论文、前沿文章、行业报告。总结关键发现和技术趋势。`,
  ecosystem: `调研"{topic}"相关的生态工具、社区活跃度、第三方集成方案。输出生态地图。`,
  risks: `调研"{topic}"相关的已知风险、常见陷阱、生产环境问题、安全漏洞。输出风险矩阵。`
};

function buildClaudeArgs(prompt, taskId) {
  return [
    "-p", prompt,
    "--dangerously-skip-permissions",
    "--max-turns", "12"
  ];
}

function cleanOutput(stdout, stderr) {
  // 过滤 clawd-on-desk SessionEnd Hook 噪音
  const cleaned = stderr.split("\n")
    .filter(l => !l.includes("SessionEnd hook") && !l.includes("Hook cancelled"))
    .join("\n");
  if (cleaned.trim()) {
    process.stderr.write(`[agent-stderr] ${cleaned.slice(-200)}\n`);
  }
  return stdout.trim();
}

/**
 * 启动单个 Claude Code Agent，返回其 stdout 输出
 */
function runClaudeAgent(prompt, taskId) {
  return new Promise((resolve, reject) => {
    const args = buildClaudeArgs(prompt, taskId);
    const proc = spawn(CLAUDE_EXE, args, {
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Agent[${taskId}] timeout after 600s`));
    }, 600000);

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      const output = cleanOutput(stdout, stderr);
      if (code === 0) resolve({ taskId, stdout: output, stderr });
      else reject(new Error(`Agent[${taskId}] exit=${code}: ${stderr.slice(-200)}`));
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Agent[${taskId}] spawn failed: ${err.message}`));
    });
  });
}

/**
 * Fan-Out: 并行启动多个 Agent
 */
async function fanOut(dimensions, taskFn) {
  const tasks = dimensions.map((dim, i) => {
    const prompt = taskFn(dim);
    return runClaudeAgent(prompt, `${dim}-${i + 1}`);
  });
  return Promise.allSettled(tasks);
}

/**
 * Fan-In: 汇总多个 Agent 的输出
 */
function fanIn(results, dimensions, filePath, outputPath) {
  const report = [];
  report.push(`# Multi-Agent Review Synthesis Report\n`);
  report.push(`> Generated: ${new Date().toISOString()}`);
  report.push(`> Target: ${filePath}`);
  report.push(`> Agents: ${results.length} (${dimensions.join(", ")})`);
  report.push("");
  report.push("---\n");

  report.push("## Executive Summary\n");
  const verdicts = [];
  const scores = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { taskId, stdout } = result.value;
      const scoreMatch = stdout.match(/评分:\s*\[?(\d+)\/?10?\]?/i);
      const verdictMatch = stdout.match(/总体结论:\s*\[?(Pass|Conditional Pass|Fail)\]?/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      const verdict = verdictMatch ? verdictMatch[1] : "Unknown";
      verdicts.push(verdict);
      if (score) scores.push(score);
      report.push(`- **${taskId}**: ${verdict}${score ? ` (${score}/10)` : ""}`);
    } else {
      report.push(`- **${result.reason || "Unknown agent"}**: FAILED -- ${result.reason}`);
    }
  }
  report.push(`- **Overall**: ${verdicts.includes("Fail") ? "FAIL" : verdicts.includes("Conditional Pass") ? "CONDITIONAL PASS" : "PASS"}`);
  if (scores.length > 0) {
    report.push(`- **Average Score**: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}/10`);
  }
  report.push("");

  report.push("---\n");
  report.push("## Individual Agent Reports\n");

  for (const result of results) {
    if (result.status === "fulfilled") {
      report.push(`---\n`);
      report.push(result.value.stdout);
      report.push("");
    } else {
      report.push(`### Agent FAILED\n`);
      report.push(`Error: ${result.reason}\n`);
    }
  }

  report.push("---\n");
  report.push("## Fan-In Conflict Resolution\n");
  report.push("No automated conflicts detected. Manual review recommended for disagreements among agents.\n");

  const fullReport = report.join("\n");
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, fullReport, "utf-8");
  }
  return fullReport;
}

export async function parallelReview(filePath, dimensions, contextFiles, outputPath) {
  if (dimensions.includes("all")) {
    dimensions = ALL_DIMENSIONS;
  }

  const content = existsSync(filePath) ? readFileSync(filePath, "utf-8") : `(File not found: ${filePath})`;
  const contextBlock = contextFiles && contextFiles.length > 0
    ? `\n\n参考以下上下文材料:\n${contextFiles.map(f => `- ${f}`).join("\n")}\n`
    : "";

  const results = await fanOut(dimensions, (dim) => {
    const basePrompt = DIMENSION_PROMPTS[dim];
    return `${basePrompt}\n\n评审文件: ${filePath}\n\n文件内容:\n\`\`\`\n${content.slice(0, 50000)}\n\`\`\`${contextBlock}`;
  });

  return fanIn(results, dimensions, filePath, outputPath);
}

export async function parallelResearch(topic, angles, outputPath) {
  if (angles.includes("all")) {
    angles = ALL_ANGLES;
  }

  const results = await fanOut(angles, (angle) => {
    return ANGLE_PROMPTS[angle].replace("{topic}", topic);
  });

  const report = [];
  report.push(`# Multi-Agent Research Report: ${topic}\n`);
  report.push(`> Generated: ${new Date().toISOString()}`);
  report.push(`> Research Angles: ${angles.join(", ")}\n`);
  report.push("---\n");

  for (const result of results) {
    if (result.status === "fulfilled") {
      report.push(`---\n`);
      report.push(result.value.stdout);
      report.push("");
    } else {
      report.push(`### Research Angle FAILED: ${result.reason}\n`);
    }
  }

  const fullReport = report.join("\n");
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, fullReport, "utf-8");
  }
  return fullReport;
}

export async function orchestrateReview(filePath, reviewType, outputDir) {
  const REVIEW_DIMENSIONS = {
    code: ["security", "correctness", "performance", "code_style"],
    design: ["architecture", "completeness", "correctness"],
    prd: ["completeness", "correctness"],
    architecture: ["architecture", "completeness", "performance"],
    contract: ["completeness", "correctness", "code_style"]
  };

  const dimensions = REVIEW_DIMENSIONS[reviewType] || ["completeness", "correctness"];
  mkdirSync(outputDir, { recursive: true });

  const manifestPath = join(outputDir, "manifest.yaml");
  const manifestYaml = `manifest_id: review-${Date.now()}\ntask_id: orchestrate-review\ntype: ${reviewType}\ntarget: ${filePath}\ndimensions: [${dimensions.join(", ")}]\ntimestamp: ${new Date().toISOString()}\n`;
  writeFileSync(manifestPath, manifestYaml, "utf-8");

  const synthesisPath = join(outputDir, "synthesis-report.md");
  const results = await parallelReview(filePath, dimensions, [], synthesisPath);

  const receiptPath = join(outputDir, "receipt.yaml");
  const receiptYaml = `review_id: review-${Date.now()}\ntype: ${reviewType}\nverdict: completed\nreviewers: ${dimensions.length}\ntimestamp: ${new Date().toISOString()}\nmanifest: ${manifestPath}\nreport: ${synthesisPath}\n`;
  writeFileSync(receiptPath, receiptYaml, "utf-8");

  return results;
}
