// lib/permission-gate.js — Write permission validation and bash command interception

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  loadConfig,
  loadAllConfigs,
  loadYaml,
  getMeta,
} from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";
import { checkPhaseReadiness } from "./condition-engine.js";

function isSensitiveFile(normPath, patterns) {
  for (const p of patterns || []) {
    const re = new RegExp(p.regex);
    if (re.test(normPath)) {
      if (p.exclude && normPath.includes(p.exclude)) continue;
      return { sensitive: true, name: p.name };
    }
  }
  return { sensitive: false };
}

function checkProtectedTransitions(newContent, state, readiness) {
  const wpConfig = loadConfig("write-permissions");
  const protectedTrans = wpConfig?.protected_transitions || [];

  let parsed = null;
  if (newContent) {
    try {
      parsed = yaml.load(newContent);
    } catch {
      parsed = null;
    }
  }

  for (const pt of protectedTrans) {
    const forbidden = pt.forbidden_values || [];
    const actual = parsed?.[pt.target_field];
    if (actual !== undefined && forbidden.includes(actual)) {
      if (pt.requires_readiness && !readiness.ready) {
        return { blocked: true, reason: `BLOCKED: ${pt.reason}` };
      }
    }
  }

  if (!parsed && newContent) {
    for (const pt of protectedTrans) {
      const forbidden = pt.forbidden_values || [];
      for (const fv of forbidden) {
        const regex = new RegExp(`${pt.target_field}\\s*:\\s*${fv}`);
        if (regex.test(newContent)) {
          if (pt.requires_readiness && !readiness.ready) {
            return { blocked: true, reason: `BLOCKED: ${pt.reason}` };
          }
        }
      }
    }
  }

  return { blocked: false };
}

export async function validateWritePermission(args = {}) {
  loadAllConfigs();
  const taskDir = resolveTaskDir(args.taskDir);
  const filePath = args.filePath || "";

  if (!filePath) {
    return { allowed: false, reason: "filePath is required." };
  }

  const normPath = filePath.replace(/\\/g, "/");

  if (!taskDir) {
    return { allowed: false, reason: "BLOCKED: No active task found; cannot validate permission." };
  }

  if (/[\x00-\x1f]/.test(filePath)) {
    return { allowed: false, reason: "BLOCKED: Path contains control characters." };
  }

  let resolvedFile, resolvedTaskDir;
  try {
    resolvedTaskDir = path.normalize(fs.realpathSync(taskDir));
    const rawResolved = path.normalize(path.resolve(filePath));
    resolvedFile = fs.existsSync(rawResolved) ? path.normalize(fs.realpathSync(rawResolved)) : rawResolved;
  } catch (err) {
    return { allowed: false, reason: "BLOCKED: Cannot resolve file path for security check." };
  }
  const relativeToTask = path.relative(resolvedTaskDir, resolvedFile);
  const isOutsideTask = relativeToTask.startsWith("..") || path.isAbsolute(relativeToTask) || relativeToTask === "";
  if (isOutsideTask) {
    return { allowed: false, reason: "BLOCKED: filePath escapes task directory." };
  }

  const stateFile = path.join(taskDir, "00-task-state.yaml");
  const state = loadYaml(stateFile);
  if (!state) {
    return { allowed: false, reason: "BLOCKED: Task state unreadable; cannot validate permission." };
  }

  const phaseStatus = state.phase_status || "unknown";

  const wpConfig = loadConfig("write-permissions");
  if (!wpConfig || !Array.isArray(wpConfig.sensitive_patterns) || wpConfig.sensitive_patterns.length === 0) {
    return {
      allowed: false,
      reason: "BLOCKED: write-permissions.yaml missing, unreadable, or has no sensitive_patterns; cannot validate file sensitivity (fail-closed).",
    };
  }

  const role = args.role || "";
  const roleDef = wpConfig?.roles?.find((r) => r.id === role);
  if (roleDef && roleDef.blocks) {
    for (const block of roleDef.blocks) {
      const regexStr = block.pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");
      const blockRe = new RegExp(regexStr);
      if (blockRe.test(normPath)) {
        return {
          allowed: false,
          reason: `BLOCKED: Role '${role}' cannot write ${normPath} per write-permissions.yaml.`,
        };
      }
    }
  }

  const patterns = wpConfig.sensitive_patterns;
  const sensitivity = isSensitiveFile(normPath, patterns);

  if (!sensitivity.sensitive) {
    return { allowed: true, reason: "Non-sensitive file; operation allowed." };
  }

  const readiness = await checkPhaseReadiness({ taskDir });

  if (sensitivity.name === "state_file") {
    const newContent = args.newContent || "";
    if (!newContent) {
      return { allowed: false, reason: "BLOCKED: state file operation requires newContent for tamper detection." };
    }

    if (/auditor_verdict\s*:/.test(newContent)) {
      return {
        allowed: false,
        reason: "BLOCKED: auditor_verdict cannot be modified directly. It must be set via Auditor receipt in reviews/receipt-auditor.yaml.",
      };
    }

    const ptResult = checkProtectedTransitions(newContent, state, readiness);
    if (ptResult.blocked) {
      return { allowed: false, reason: ptResult.reason };
    }

    let parsed = null;
    try {
      parsed = yaml.load(newContent);
    } catch {
      parsed = null;
    }
    const newPhaseStatus = parsed?.phase_status || "";
    if (newPhaseStatus === "passed" && readiness.ready) {
      return { allowed: true, reason: "Phase status transition to passed approved; all mechanical conditions satisfied." };
    }
  }

  const isInProgress = phaseStatus === "in_progress" || phaseStatus === "in_review";
  if (!isInProgress) {
    return { allowed: false, reason: `BLOCKED: task phase_status is '${phaseStatus}', not in_progress or in_review.` };
  }

  if (!readiness.ready) {
    return {
      allowed: false,
      reason: `BLOCKED: mechanical gaps exist — ${readiness.gaps.join("; ")}. Run run_mandatory_checkers first.`,
    };
  }

  return { allowed: true, reason: "All mechanical conditions satisfied; sensitive operation allowed." };
}

function extractBashRedirectionTargets(command) {
  if (!command || typeof command !== "string") return [];
  if (command.length > getMeta("bash_validation.max_command_length", 10000)) return [];

  const lines = command.split("\n");
  let inHeredoc = false;
  let heredocDelim = null;
  const filteredLines = [];
  for (const line of lines) {
    if (inHeredoc) {
      if (line.trim() === heredocDelim) {
        inHeredoc = false;
        heredocDelim = null;
      }
      continue;
    }
    const heredocMatch = line.match(/<<\s*[-]?\s*['"]?([A-Za-z_]\w*)['"]?/);
    if (heredocMatch) {
      heredocDelim = heredocMatch[1];
      inHeredoc = true;
      filteredLines.push(line);
      continue;
    }
    filteredLines.push(line);
  }
  const cmd = filteredLines.join("\n");

  const targets = [];
  const redirectRe = /\d*\s*[>][&>]?\s*(\S+)/g;
  let m;
  while ((m = redirectRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  const teeRe = /\|\s*tee\s+(?:-[a-z]+\s+)?(\S+)/g;
  while ((m = teeRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  const procSubRe = />\s*\(\s*(?:tee\s+(?:-[a-z]+\s+)?|cat\s+(?:-[a-z]+\s+)*[>]?\s*)(\S+)\s*\)/g;
  while ((m = procSubRe.exec(cmd)) !== null) {
    targets.push(m[1]);
  }
  return targets.filter((t) => !t.startsWith("/dev/") && t !== "-" && !t.startsWith("(") && !t.includes(")"));
}

function extractDiskWriteCommandTargets(command) {
  if (!command || typeof command !== "string") return [];
  if (command.length > getMeta("bash_validation.max_command_length", 10000)) return [];
  const targets = [];

  const cpMvRe = /(?:^|[;|&]|\$\()\s*(cp|mv)(?:\s+-[a-zA-Z]+)*((?:\s+\S+)+)/g;
  let m;
  while ((m = cpMvRe.exec(command)) !== null) {
    const tokens = m[2].trim().split(/\s+/).filter((t) => t && !t.startsWith("-"));
    if (tokens.length >= 2) {
      targets.push(tokens[tokens.length - 1]);
    }
  }

  const touchRmMkdirRe = /(?:^|[;|&]|\$\()\s*(touch|rm|mkdir)(?:\s+-[a-zA-Z]+)*((?:\s+\S+)+)/g;
  while ((m = touchRmMkdirRe.exec(command)) !== null) {
    const tokens = m[2].trim().split(/\s+/).filter((t) => t && !t.startsWith("-"));
    targets.push(...tokens);
  }

  return targets.filter((t) => !t.startsWith("/dev/") && t !== "-");
}

export async function validateBashCommand(args = {}) {
  const { command, taskDir, role } = args;
  if (!command || typeof command !== "string") {
    return { allowed: false, reason: "Bash command is missing or not a string." };
  }
  if (command.length === 0) {
    return { allowed: true, reason: "Empty command — no redirection to validate." };
  }
  if (command.length > getMeta("bash_validation.max_command_length", 10000)) {
    return { allowed: false, reason: "Bash command exceeds maximum length (10000 chars)." };
  }

  const redirectTargets = extractBashRedirectionTargets(command);
  for (const target of redirectTargets) {
    const resolvedTarget = path.isAbsolute(target) ? target : path.join(taskDir || process.cwd(), target);
    const result = await validateWritePermission({
      filePath: resolvedTarget,
      operation: "Write",
      role,
      taskDir,
    });
    if (!result.allowed) {
      return { ...result, reason: `Bash redirect target blocked: ${target} — ${result.reason}` };
    }
  }

  const cmdTargets = extractDiskWriteCommandTargets(command);
  for (const target of cmdTargets) {
    const resolvedTarget = path.isAbsolute(target) ? target : path.join(taskDir || process.cwd(), target);
    const result = await validateWritePermission({
      filePath: resolvedTarget,
      operation: "Write",
      role,
      taskDir,
    });
    if (!result.allowed) {
      return { ...result, reason: `Bash disk-write command target blocked: ${target} — ${result.reason}` };
    }
  }

  if (redirectTargets.length === 0 && cmdTargets.length === 0) {
    return { allowed: true, reason: "No file-writing redirection or disk-write command detected." };
  }
  return { allowed: true, reason: "All redirection and disk-write command targets allowed." };
}
