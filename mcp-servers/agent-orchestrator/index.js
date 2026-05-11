#!/usr/bin/env node
/**
 * Agent Orchestrator MCP Server
 * 
 * 桥接 Trae IDE 与 Claude Code CLI，实现多 Agent 并行评审。
 * 
 * MCP 协议: JSON-RPC 2.0 over stdio
 * 
 * 规范对齐:
 * - cluster-orchestration.md: Manifest → Fan-Out → Fan-In → Synthesis
 * - review-gates-contract.md: 三级门控 (Value / Professional / Contract)
 * - task-tracking-workflow-spec.md: 评审循环
 */

import { createInterface } from "readline";
import { TOOL_DEFINITIONS } from "./tools.js";
import { parallelReview, parallelResearch, orchestrateReview } from "./orchestrator.js";

// MCP 协议常量
const JSONRPC_VERSION = "2.0";
const SERVER_NAME = "agent-orchestrator-mcp";
const SERVER_VERSION = "1.0.0";

const runningAgents = new Map();

function createResponse(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function createError(id, code, message) {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } };
}

function log(msg) {
  process.stderr.write(`[MCP] ${new Date().toISOString().slice(11, 19)} ${msg}\n`);
}

async function main() {
  const rl = createInterface({ input: process.stdin });
  let initialized = false;

  log("Agent Orchestrator MCP Server starting...");

  for await (const line of rl) {
    if (!line.trim()) continue;

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      log(`Invalid JSON: ${line.slice(0, 100)}`);
      continue;
    }

    const { id, method, params } = request;

    try {
      switch (method) {
        case "initialize":
          initialized = true;
          log("Client initialized");
          process.stdout.write(JSON.stringify(createResponse(id, {
            protocolVersion: "2024-11-05",
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            capabilities: { tools: {} }
          })) + "\n");
          break;

        case "notifications/initialized":
          // 客户端确认初始化完成
          break;

        case "tools/list":
          if (!initialized) {
            process.stdout.write(JSON.stringify(createError(id, -32002, "Not initialized")) + "\n");
            break;
          }
          process.stdout.write(JSON.stringify(createResponse(id, {
            tools: TOOL_DEFINITIONS.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.arguments
            }))
          })) + "\n");
          break;

        case "tools/call": {
          if (!initialized) {
            process.stdout.write(JSON.stringify(createError(id, -32002, "Not initialized")) + "\n");
            break;
          }

          const { name, arguments: args } = params;
          log(`Tools/Call: ${name}`);

          let result;
          switch (name) {
            case "parallel_review": {
              const { file_path, dimensions, context_files, output_path } = args;
              log(`parallel_review: ${dimensions.length} agents for ${file_path}`);

              result = await parallelReview(file_path, dimensions, context_files || [], output_path);
              process.stdout.write(JSON.stringify(createResponse(id, {
                content: [{
                  type: "text",
                  text: `Parallel review completed. ${dimensions.length} agents executed.\n\n${result.slice(0, 2000)}${result.length > 2000 ? `\n\n...(truncated, full report at ${output_path})` : ""}`
                }]
              })) + "\n");
              break;
            }

            case "parallel_research": {
              const { topic, angles, output_path } = args;
              log(`parallel_research: "${topic}" with ${angles.length} angles`);

              result = await parallelResearch(topic, angles, output_path);
              process.stdout.write(JSON.stringify(createResponse(id, {
                content: [{
                  type: "text",
                  text: `Parallel research completed. ${angles.length} agents executed.\n\n${result.slice(0, 2000)}${result.length > 2000 ? `\n\n...(truncated, full report at ${output_path})` : ""}`
                }]
              })) + "\n");
              break;
            }

            case "orchestrate_review": {
              const { file_path, review_type, output_dir } = args;
              log(`orchestrate_review: ${review_type} for ${file_path}`);

              result = await orchestrateReview(file_path, review_type, output_dir);
              process.stdout.write(JSON.stringify(createResponse(id, {
                content: [{
                  type: "text",
                  text: `Orchestrated review completed. See ${output_dir} for manifest.yaml, synthesis-report.md, and receipt.yaml.\n\n${result.slice(0, 1500)}${result.length > 1500 ? "\n\n...(truncated)" : ""}`
                }]
              })) + "\n");
              break;
            }

            case "agent_status": {
              log("agent_status requested");
              const status = [];
              for (const [id, info] of runningAgents) {
                status.push(`${id}: ${info.status} (${info.startTime})`);
              }
              process.stdout.write(JSON.stringify(createResponse(id, {
                content: [{
                  type: "text",
                  text: status.length > 0 ? `Active agents:\n${status.join("\n")}` : "No active agents."
                }]
              })) + "\n");
              break;
            }

            default:
              process.stdout.write(JSON.stringify(createError(id, -32601, `Unknown tool: ${name}`)) + "\n");
          }
          break;
        }

        case "ping":
          process.stdout.write(JSON.stringify(createResponse(id, {})) + "\n");
          break;

        default:
          process.stdout.write(JSON.stringify(createError(id, -32601, `Unknown method: ${method}`)) + "\n");
      }
    } catch (err) {
      log(`Error: ${err.message}`);
      process.stdout.write(JSON.stringify(createError(id, -32000, err.message)) + "\n");
    }
  }
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
