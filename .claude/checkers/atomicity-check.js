#!/usr/bin/env node
// Checker: atomicity-check
// Mode: automated
// Scope: task work packets, board.yaml, work-packets.yaml
// Purpose: Validate work packet decomposition meets atomicity criteria
// Failure: gate failed (professional gate)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require(path.join(__dirname, "..", "mcp-servers", "constraint-enforcer", "node_modules", "js-yaml", "index.js"));

const PROJECT_ROOT = process.argv[2] || ".";
const ATOMICITY_RULES_PATH = path.join(PROJECT_ROOT, ".claude", "config", "atomicity-rules.yaml");

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

function countWords(str) {
  if (!str) return 0;
  // Handle mixed EN/CN: CN characters count as words, EN split by whitespace
  const cnChars = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  const enTokens = str.split(/\s+/).filter((w) => w.length > 0 && !/[\u4e00-\u9fff]/.test(w)).length;
  return cnChars + enTokens;
}

function countSentences(str) {
  if (!str) return 0;
  return str.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0).length;
}

function estimateTokens(text) {
  const words = countWords(text);
  return Math.ceil(words * 1.3);
}

const errors = [];
const warnings = [];

// ---------------------------------------------------------------------------
// Step 1: Validate atomicity-rules.yaml schema
// ---------------------------------------------------------------------------
const rulesDoc = loadYaml(ATOMICITY_RULES_PATH);
if (!rulesDoc) {
  errors.push("atomicity-rules.yaml missing or unreadable");
} else {
  if (!rulesDoc.version) warnings.push("atomicity-rules.yaml missing version field");
  if (!Array.isArray(rulesDoc.rules) || rulesDoc.rules.length === 0) {
    errors.push("atomicity-rules.yaml has no rules array");
  } else {
    const requiredFields = ["id", "name", "check_type", "target_field"];
    for (const rule of rulesDoc.rules) {
      for (const f of requiredFields) {
        if (!rule[f]) {
          errors.push(`Rule '${rule.id || "?"}' missing required field: ${f}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: Discover work packets
// ---------------------------------------------------------------------------
const tasksDir = path.join(PROJECT_ROOT, ".claude", "tasks");
let packetsChecked = 0;
let packetsFound = false;

function findWorkPackets() {
  const packets = [];
  if (!fs.existsSync(tasksDir)) return packets;

  const taskDirs = fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("tk-"))
    .map((d) => path.join(tasksDir, d.name));

  for (const taskDir of taskDirs) {
    // Priority 1: work-packets.yaml
    const wpFile = path.join(taskDir, "artifacts", "work-packets.yaml");
    if (fs.existsSync(wpFile)) {
      const wp = loadYaml(wpFile);
      if (wp && Array.isArray(wp.packets)) {
        packetsFound = true;
        for (const pkt of wp.packets) {
          packets.push({ ...pkt, source: wpFile });
        }
      }
      continue;
    }

    // Priority 2: board.yaml work_items with atomicity fields
    const boardFile = path.join(taskDir, "board.yaml");
    if (fs.existsSync(boardFile)) {
      const board = loadYaml(boardFile);
      if (board && Array.isArray(board.work_items)) {
        for (const wi of board.work_items) {
          // Only check work items that have atomicity metadata
          if (wi.description || wi.input_params || wi.code_refs || wi.design_ref || wi.acceptance_criteria) {
            packetsFound = true;
            packets.push({
              id: wi.id,
              name: wi.title || wi.name,
              description: wi.description,
              input_params: wi.input_params,
              code_refs: wi.code_refs,
              design_ref: wi.design_ref,
              acceptance_criteria: wi.acceptance_criteria,
              packet_level: wi.packet_level,
              oversized_justified: wi.oversized_justified,
              multi_file_justified: wi.multi_file_justified,
              source: boardFile,
            });
          }
        }
      }
    }
  }
  return packets;
}

const packets = findWorkPackets();

// ---------------------------------------------------------------------------
// Step 3: Validate each packet against rules
// ---------------------------------------------------------------------------
if (rulesDoc && Array.isArray(rulesDoc.rules)) {
  for (const packet of packets) {
    packetsChecked++;
    const pId = packet.id || packet.name || "unknown";

    for (const rule of rulesDoc.rules) {
      const val = packet[rule.target_field];

      switch (rule.check_type) {
        case "word_count": {
          const words = countWords(val);
          if (words > rule.max) {
            const msg = `Packet '${pId}': ${rule.name} (${words} words > ${rule.max})`;
            if (rule.blocker_level === "hard") errors.push(msg);
            else warnings.push(msg);
          }
          break;
        }

        case "array_length": {
          const arr = Array.isArray(val) ? val : [];
          if (arr.length > rule.max) {
            const msg = `Packet '${pId}': ${rule.name} (${arr.length} params > ${rule.max})`;
            if (rule.blocker_level === "hard") errors.push(msg);
            else warnings.push(msg);
          }
          break;
        }

        case "file_lines": {
          const refs = Array.isArray(val) ? val : [];
          for (const ref of refs) {
            const filePath = typeof ref === "string" ? ref : ref?.file;
            const declaredLines = ref?.lines;
            if (!filePath) continue;

            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
            let actualLines = declaredLines;
            if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, "utf8");
              actualLines = content.split(/\r?\n/).length;
            }

            if (actualLines && actualLines > rule.max_lines) {
              const justified = packet[rule.allow_justification_field];
              if (!justified) {
                const msg = `Packet '${pId}': ${rule.name} (${actualLines} lines > ${rule.max_lines}) in ${filePath}`;
                if (rule.blocker_level === "hard") errors.push(msg);
                else warnings.push(msg);
              }
            }
          }
          break;
        }

        case "file_count": {
          const refs = Array.isArray(val) ? val : [];
          if (refs.length > rule.max) {
            const justified = packet[rule.allow_justification_field];
            if (!justified) {
              const msg = `Packet '${pId}': ${rule.name} (${refs.length} files > ${rule.max})`;
              if (rule.blocker_level === "hard") errors.push(msg);
              else warnings.push(msg);
            }
          }
          break;
        }

        case "estimated_tokens": {
          let text = typeof val === "string" ? val : "";
          if (rule.reference_fields) {
            for (const f of rule.reference_fields) {
              const refVal = packet[f];
              if (typeof refVal === "string") text += " " + refVal;
              else if (Array.isArray(refVal)) text += " " + refVal.join(" ");
            }
          }
          const tokens = estimateTokens(text);
          if (tokens > rule.max_tokens) {
            const msg = `Packet '${pId}': ${rule.name} (~${tokens} tokens > ${rule.max_tokens})`;
            if (rule.blocker_level === "hard") errors.push(msg);
            else warnings.push(msg);
          }
          break;
        }

        case "regex_match": {
          const str = typeof val === "string" ? val : "";
          const exemptCondition = rule.exempt_if;
          if (exemptCondition) {
            const [exemptField, exemptVal] = exemptCondition.split("!=").map((s) => s.trim());
            const actualVal = packet[exemptField];
            if (actualVal === exemptVal) break; // exempt
          }
          if (str && rule.pattern) {
            const regex = new RegExp(rule.pattern);
            if (!regex.test(str)) {
              const msg = `Packet '${pId}': ${rule.name} ('${str}' does not match /${rule.pattern}/)`;
              if (rule.blocker_level === "hard") errors.push(msg);
              else warnings.push(msg);
            }
          }
          break;
        }

        case "single_sentence": {
          const str = typeof val === "string" ? val : "";
          const sentences = countSentences(str);
          if (sentences > 1) {
            const msg = `Packet '${pId}': ${rule.name} (${sentences} sentences, expected 1)`;
            if (rule.blocker_level === "hard") errors.push(msg);
            else warnings.push(msg);
          }
          if (rule.must_contain_verbs && str) {
            const hasVerb = rule.must_contain_verbs.some((v) => str.includes(v));
            if (!hasVerb) {
              const msg = `Packet '${pId}': ${rule.name} (missing verifiable verb like →/returns/equals)`;
              if (rule.blocker_level === "hard") errors.push(msg);
              else warnings.push(msg);
            }
          }
          break;
        }

        default:
          warnings.push(`Unknown check_type '${rule.check_type}' in rule '${rule.id}'`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (warnings.length > 0) {
  console.log("WARNINGS: atomicity-check");
  for (const w of warnings) {
    console.log(`  WARNING: ${w}`);
  }
}

if (errors.length > 0) {
  console.log("FAILED: atomicity-check");
  for (const e of errors) {
    console.log(`  ERROR: ${e}`);
  }
  process.exit(1);
}

if (!packetsFound) {
  console.log("PASSED: atomicity-check — no work packets with atomicity metadata found (no packets to validate)");
} else {
  console.log(`PASSED: atomicity-check — ${packetsChecked} packets validated, all atomicity rules satisfied`);
}
process.exit(0);
