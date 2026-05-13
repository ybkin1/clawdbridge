#!/usr/bin/env node
// constraint-enforcer MCP Server — JSON-RPC 2.0 over stdio
// Tools: check_phase_readiness, run_mandatory_checkers, validate_write_permission,
//        generate_evidence_lock, request_phase_transition, get_checker_catalog

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { toolDefinitions } from "./tools.js";
import {
  checkPhaseReadiness,
  runMandatoryCheckers,
  validateWritePermission,
  generateEvidenceLock,
  requestPhaseTransition,
  getCheckerCatalog,
  getActiveContractSet,
  agentOrchestrator,
  agentStatus,
  checkpointSync,
} from "./enforcer.js";

const server = new Server(
  { name: "constraint-enforcer", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: toolDefinitions };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "check_phase_readiness":
        result = await checkPhaseReadiness(args);
        break;
      case "run_mandatory_checkers":
        result = await runMandatoryCheckers(args);
        break;
      case "validate_write_permission":
        result = await validateWritePermission(args);
        break;
      case "generate_evidence_lock":
        result = await generateEvidenceLock(args);
        break;
      case "request_phase_transition":
        result = await requestPhaseTransition(args);
        break;
      case "get_checker_catalog":
        result = await getCheckerCatalog();
        break;
      case "get_active_contract_set":
        result = await getActiveContractSet(args);
        break;
      case "agent_orchestrator":
        result = await agentOrchestrator(args);
        break;
      case "agent_status":
        result = await agentStatus(args);
        break;
      case "checkpoint_sync":
        result = await checkpointSync(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: err.message }, null, 2) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Constraint Enforcer MCP Server running on stdio");
