#!/usr/bin/env node
// hook-enforcer-helper.js — Bridge between PreToolUse Hook and constraint-enforcer logic
// Reads JSON from stdin: { filePath, operation, newContent }
// Writes JSON to stdout: { allowed, reason }

import { validateWritePermission } from "../mcp-servers/constraint-enforcer/enforcer.js";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let args;
  try {
    args = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ allowed: false, reason: "BLOCKED: Unparseable input; blocking operation." }));
    process.exit(1);
  }

  try {
    const result = await validateWritePermission(args);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ allowed: false, reason: `MCP helper error: ${err.message}` }));
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ allowed: false, reason: `Unexpected error: ${e.message}` }));
  process.exit(1);
});
