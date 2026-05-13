#!/usr/bin/env node
// json-parse-helper.js — P3-6 fix: pure Node JSON fallback for Hook when python3 is unavailable
let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  try {
    const o = JSON.parse(data);
    const ti = o.tool_input || {};
    const out = {
      tool_name: o.tool_name || "",
      file_path: ti.file_path || "",
      content: ti.content || ti.new_string || "",
      command: ti.command || "",
    };
    process.stdout.write(JSON.stringify(out));
  } catch {
    process.stdout.write("{}");
  }
});
