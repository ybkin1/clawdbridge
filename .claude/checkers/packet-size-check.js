#!/usr/bin/env node
// Checker: packet-size-check
// Mode: automated
// Scope: code files with @packet annotations
// Purpose: Aggregate effective lines per packet_id across files and enforce ≤50 lines
// P2-2 fix: operates on packet_id aggregates instead of file-level line counts

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require(path.join(__dirname, "..", "mcp-servers", "constraint-enforcer", "node_modules", "js-yaml", "index.js"));

const PROJECT_ROOT = process.argv[2] || ".";
const DEFAULT_MAX_LINES = 50;
const PACKET_ANNOTATION_RE = /@packet\s+([A-Za-z0-9_\-]+)/i;
const OVERSIZED_ANNOTATION_RE = /@oversized\s+(true|yes|1)/i;
const OVERSIZED_REASON_RE = /@oversized_reason\s+(.+)/i;

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

function getLanguagePatterns(ext) {
  const extLower = ext.toLowerCase();
  switch (extLower) {
    case ".js":
    case ".ts":
    case ".jsx":
    case ".tsx":
    case ".java":
    case ".c":
    case ".cpp":
    case ".cs":
    case ".go":
    case ".swift":
    case ".kt":
    case ".kts":
      return {
        singleLineComment: /^\s*\/\//,
        multiLineCommentStart: /^\s*\/\*/,
        multiLineCommentEnd: /\*\/\s*$/,
        importLine: /^\s*import\s+/,
      };
    case ".py":
      return {
        singleLineComment: /^\s*#/,
        multiLineCommentStart: /^\s*"""/,
        multiLineCommentEnd: /"""\s*$/,
        importLine: /^\s*(import\s+|from\s+.+\s+import\s+)/,
      };
    case ".sh":
    case ".bash":
      return {
        singleLineComment: /^\s*#/,
        multiLineCommentStart: null,
        multiLineCommentEnd: null,
        importLine: /^\s*(source\s+|\.\s+)/,
      };
    case ".rs":
      return {
        singleLineComment: /^\s*\/\//,
        multiLineCommentStart: /^\s*\/\*/,
        multiLineCommentEnd: /\*\/\s*$/,
        importLine: /^\s*(use\s+|extern\s+crate\s+)/,
      };
    case ".rb":
      return {
        singleLineComment: /^\s*#/,
        multiLineCommentStart: /^\s*=begin/,
        multiLineCommentEnd: /=end\s*$/,
        importLine: /^\s*require\s+/,
      };
    default:
      return {
        singleLineComment: /^\s*#/,
        multiLineCommentStart: null,
        multiLineCommentEnd: null,
        importLine: null,
      };
  }
}

function extractPacketAnnotation(first20Lines) {
  for (const line of first20Lines) {
    const m = line.match(PACKET_ANNOTATION_RE);
    if (m) return m[1];
  }
  return null;
}

function extractOversizedAnnotation(first20Lines) {
  let oversized = false;
  let reason = null;
  for (const line of first20Lines) {
    const om = line.match(OVERSIZED_ANNOTATION_RE);
    if (om) oversized = true;
    const rm = line.match(OVERSIZED_REASON_RE);
    if (rm) reason = rm[1].trim();
  }
  return { oversized, reason };
}

function countEffectiveLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const ext = path.extname(filePath);
  const patterns = getLanguagePatterns(ext);

  let effective = 0;
  let inMultiLineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (trimmed.length === 0) continue;

    // Multi-line comment handling
    if (inMultiLineComment) {
      if (patterns.multiLineCommentEnd && patterns.multiLineCommentEnd.test(trimmed)) {
        inMultiLineComment = false;
      }
      continue;
    }
    if (patterns.multiLineCommentStart && patterns.multiLineCommentStart.test(trimmed)) {
      if (!patterns.multiLineCommentEnd || !patterns.multiLineCommentEnd.test(trimmed)) {
        inMultiLineComment = true;
      }
      continue;
    }

    // Single-line comment
    if (patterns.singleLineComment && patterns.singleLineComment.test(trimmed)) continue;

    // Import/require line
    if (patterns.importLine && patterns.importLine.test(trimmed)) continue;

    effective++;
  }

  return effective;
}

function findSourceFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip common non-source directories
      if (["node_modules", ".git", "dist", "build", "out", "coverage", ".claude", "vendor"].includes(e.name)) {
        continue;
      }
      findSourceFiles(full, results);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if ([".js", ".ts", ".jsx", ".tsx", ".py", ".sh", ".java", ".c", ".cpp", ".cs", ".go", ".rs", ".rb", ".swift", ".kt", ".kts"].includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

const errors = [];
const warnings = [];

// ---------------------------------------------------------------------------
// Step 1: Discover all source files with @packet annotations
// ---------------------------------------------------------------------------
const packetFiles = new Map(); // packet_id -> [{file, lines, oversized, reason}]
const unannotatedFiles = [];

const scanDirs = [path.join(PROJECT_ROOT, ".claude", "tasks")];
// Also scan any src/ directories under tasks
for (const scanDir of scanDirs) {
  if (!fs.existsSync(scanDir)) continue;
  const taskDirs = fs.readdirSync(scanDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("tk-"))
    .map((d) => path.join(scanDir, d.name));

  for (const taskDir of taskDirs) {
    const srcDir = path.join(taskDir, "src");
    const files = findSourceFiles(srcDir);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split(/\r?\n/);
      const first20 = lines.slice(0, 20);
      const packetId = extractPacketAnnotation(first20);
      if (packetId) {
        const effectiveLines = countEffectiveLines(file);
        const { oversized, reason } = extractOversizedAnnotation(first20);
        if (!packetFiles.has(packetId)) {
          packetFiles.set(packetId, []);
        }
        packetFiles.get(packetId).push({ file, lines: effectiveLines, oversized, reason });
      } else {
        unannotatedFiles.push(file);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: Load per-packet thresholds from work-packets.yaml
// ---------------------------------------------------------------------------
const packetThresholds = new Map(); // packet_id -> {max_lines, oversized_justified}
const tasksDir = path.join(PROJECT_ROOT, ".claude", "tasks");
if (fs.existsSync(tasksDir)) {
  const taskDirs = fs.readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("tk-"))
    .map((d) => path.join(tasksDir, d.name));

  for (const taskDir of taskDirs) {
    const wpFile = path.join(taskDir, "artifacts", "work-packets.yaml");
    if (fs.existsSync(wpFile)) {
      const wp = loadYaml(wpFile);
      if (wp && Array.isArray(wp.packets)) {
        for (const pkt of wp.packets) {
          const pid = pkt.id || pkt.packet_id;
          if (pid) {
            packetThresholds.set(pid, {
              max_lines: pkt.max_lines || pkt.estimated_lines || DEFAULT_MAX_LINES,
              oversized_justified: pkt.oversized_justified || false,
            });
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: Aggregate and validate
// ---------------------------------------------------------------------------
if (packetFiles.size === 0 && unannotatedFiles.length === 0) {
  console.log("PASSED: packet-size-check — no @packet annotated source files found");
  process.exit(0);
}

for (const [packetId, files] of packetFiles.entries()) {
  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  const threshold = packetThresholds.has(packetId)
    ? packetThresholds.get(packetId).max_lines
    : DEFAULT_MAX_LINES;

  // Check if any file declares @oversized
  const anyOversizedAnnotated = files.some((f) => f.oversized);
  const anyOversizedReason = files.some((f) => f.reason);
  const wpJustified = packetThresholds.has(packetId)
    ? packetThresholds.get(packetId).oversized_justified
    : false;

  if (totalLines > threshold) {
    if (!anyOversizedAnnotated && !wpJustified) {
      const fileList = files.map((f) => `${path.relative(PROJECT_ROOT, f.file)}(${f.lines})`).join(", ");
      errors.push(
        `Packet '${packetId}': total effective lines ${totalLines} > threshold ${threshold} across ${files.length} file(s): ${fileList}`
      );
    } else if (anyOversizedAnnotated && !anyOversizedReason) {
      warnings.push(
        `Packet '${packetId}': @oversized declared but @oversized_reason missing in annotation`
      );
    }
  }
}

// Warn about unannotated files in task src/ directories
if (unannotatedFiles.length > 0) {
  warnings.push(
    `Found ${unannotatedFiles.length} source file(s) without @packet annotation in task src/ directories`
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (warnings.length > 0) {
  console.log("WARNINGS: packet-size-check");
  for (const w of warnings) {
    console.log(`  WARNING: ${w}`);
  }
}

if (errors.length > 0) {
  console.log("FAILED: packet-size-check");
  for (const e of errors) {
    console.log(`  ERROR: ${e}`);
  }
  process.exit(1);
}

console.log(`PASSED: packet-size-check — ${packetFiles.size} packet(s) validated, all within size limits or justified`);
process.exit(0);
