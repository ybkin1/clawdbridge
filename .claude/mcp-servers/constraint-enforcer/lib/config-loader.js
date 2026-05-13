// lib/config-loader.js — Configuration loading, caching, validation, and utilities
// Zero hard-coded business rules; all tunables read from config-meta.yaml

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir) {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, ".claude", "checkers")) ||
      fs.existsSync(path.join(current, ".claude", "contracts"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

export const PROJECT_ROOT = process.env.PROJECT_ROOT || findProjectRoot(__dirname);
export const CONFIG_DIR = path.join(PROJECT_ROOT, ".claude", "config");

// ---------------------------------------------------------------------------
// Meta-config (loaded synchronously once; contains all former hard-coded constants)
// ---------------------------------------------------------------------------
let _metaConfig = null;
export function getMetaConfig() {
  if (_metaConfig) return _metaConfig;
  const fp = path.join(CONFIG_DIR, "config-meta.yaml");
  if (fs.existsSync(fp)) {
    try {
      _metaConfig = yaml.load(fs.readFileSync(fp, "utf8"));
    } catch (err) {
      console.error(`[config-loader] Failed to load config-meta.yaml: ${err.message}`);
      _metaConfig = {};
    }
  } else {
    console.error("[config-loader] config-meta.yaml missing; using fallback constants.");
    _metaConfig = {};
  }
  return _metaConfig;
}

export const META = new Proxy(
  {},
  {
    get(_, key) {
      return getMetaConfig()?.[key];
    },
  }
);

// Convenience accessors for nested meta fields
function metaPath(pathStr, fallback) {
  const parts = pathStr.split(".");
  let node = getMetaConfig();
  for (const p of parts) {
    if (node && typeof node === "object" && p in node) {
      node = node[p];
    } else {
      return fallback;
    }
  }
  return node !== undefined ? node : fallback;
}

export function getMeta(pathStr, fallback) {
  return metaPath(pathStr, fallback);
}

// ---------------------------------------------------------------------------
// Config cache (loaded once per process, can be invalidated)
// ---------------------------------------------------------------------------
let configCache = {};
let configMtimes = {};
let configLastLoaded = {};

export const CONFIG_CACHE_MAX_AGE_MS = getMeta("config_loader.cache_max_age_ms", 5000);
export const ALL_CONFIG_NAMES = getMeta("config_loader.all_config_names", [
  "mechanical-conditions",
  "phase-state-machine",
  "write-permissions",
  "mcp-capabilities",
  "atomicity-rules",
  "agent-orchestration-rules",
]);

export function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[loadYaml] Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

export function loadConfig(configName) {
  const filePath = path.join(CONFIG_DIR, `${configName}.yaml`);
  if (!fs.existsSync(filePath)) return null;

  const mtime = fs.statSync(filePath).mtimeMs;
  const now = Date.now();
  const lastLoaded = configLastLoaded[configName] || 0;
  const age = now - lastLoaded;

  if (configCache[configName] && configMtimes[configName] === mtime && age < CONFIG_CACHE_MAX_AGE_MS) {
    return configCache[configName];
  }

  const config = loadYaml(filePath);
  if (config) {
    configCache[configName] = config;
    configMtimes[configName] = mtime;
    configLastLoaded[configName] = now;
  }
  return config;
}

// Directory-level batch loading: 1 readdir + N stats instead of N separate calls (P-001 fix)
let allConfigsCacheTime = 0;

export function loadAllConfigs() {
  try {
    const dirStat = fs.statSync(CONFIG_DIR);
    const dirMtime = dirStat.mtimeMs;
    if (allConfigsCacheTime === dirMtime) {
      return;
    }
    for (const name of ALL_CONFIG_NAMES) {
      loadConfig(name);
    }
    allConfigsCacheTime = dirMtime;
  } catch (err) {
    // CONFIG_DIR may not exist; fall back to individual loads
  }
}

export function invalidateConfigCache() {
  configCache = {};
  configMtimes = {};
  allConfigsCacheTime = 0;
}

// ---------------------------------------------------------------------------
// Token estimation utility (F-004 fix + P3-4 safety margin)
// ---------------------------------------------------------------------------
export function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  const enWords = str.split(/\s+/).filter((w) => w.length > 0 && !/[\u4e00-\u9fff]/.test(w)).length;
  const cnChars = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  const raw = enWords / getMeta("token_estimation.en_word_divisor", 0.75) + cnChars * getMeta("token_estimation.cn_char_multiplier", 1.0);
  return Math.ceil(raw * getMeta("token_estimation.safety_margin", 1.3));
}

// ---------------------------------------------------------------------------
// Startup config validation
// ---------------------------------------------------------------------------
export const SUPPORTED_CONFIG_VERSION_MIN = getMeta("schema.supported_version_min", 1);
export const SUPPORTED_CONFIG_VERSION_MAX = getMeta("schema.supported_version_max", 1);

export function getKnownCheckTypes() {
  const mc = loadConfig("mechanical-conditions");
  if (mc?.check_types && Array.isArray(mc.check_types) && mc.check_types.length > 0) {
    return new Set(mc.check_types);
  }
  return new Set([
    "field_equals",
    "field_not_equals",
    "field_empty_or_null",
    "gate_results_all_passed",
    "file_exists_and_size_gt_0",
    "timestamp_freshness",
    "checker_result_status",
    "mandatory_checkers_all_passed_or_excepted",
    "evidence_lock_exists",
  ]);
}

export function validateSchemaFields(name, cfg, schema) {
  const errors = [];
  if (!schema || !schema.required || !Array.isArray(schema.required)) return errors;
  for (const field of schema.required) {
    if (cfg[field] === undefined) {
      errors.push(`Config '${name}.yaml' missing required field: ${field}`);
    }
  }
  return errors;
}

export function validateConfigs() {
  const errors = [];
  const configsToValidate = [
    { name: "mechanical-conditions", required: true },
    { name: "phase-state-machine", required: true },
    { name: "write-permissions", required: true },
    { name: "mcp-capabilities", required: true },
  ];

  for (const { name, required } of configsToValidate) {
    const cfg = loadConfig(name);
    if (!cfg) {
      if (required) errors.push(`Required config '${name}.yaml' is missing or unreadable.`);
      continue;
    }
    if (cfg.version !== undefined) {
      const v = Number(cfg.version);
      if (Number.isNaN(v) || v < SUPPORTED_CONFIG_VERSION_MIN || v > SUPPORTED_CONFIG_VERSION_MAX) {
        errors.push(
          `Config '${name}.yaml' version ${cfg.version} is not supported (supported: ${SUPPORTED_CONFIG_VERSION_MIN}-${SUPPORTED_CONFIG_VERSION_MAX}).`
        );
      }
    }
    const schemaPath = path.join(CONFIG_DIR, "schemas", `${name}.schema.json`);
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
        errors.push(...validateSchemaFields(name, cfg, schema));
      } catch (e) {
        errors.push(`Failed to parse schema '${name}.schema.json': ${e.message}`);
      }
    }
  }

  const mc = loadConfig("mechanical-conditions");
  const knownTypes = getKnownCheckTypes();
  if (mc?.conditions) {
    for (const cond of mc.conditions) {
      if (cond.check_type && !knownTypes.has(cond.check_type)) {
        errors.push(
          `mechanical-conditions.yaml contains unknown check_type '${cond.check_type}' in condition '${cond.id}'. ` +
            `Known types: ${Array.from(knownTypes).join(", ")}. `
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error("[constraint-enforcer] CONFIG VALIDATION FAILED:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error("[constraint-enforcer] MCP tools may return errors until configs are fixed.");
  }
  return errors;
}

export const startupValidationErrors = validateConfigs();

// ---------------------------------------------------------------------------
// File hashing utilities
// ---------------------------------------------------------------------------
export function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hashDir(dirPath) {
  if (!fs.existsSync(dirPath)) return "";
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  const hashes = files
    .filter((f) => f.isFile())
    .map((f) => hashFile(path.join(dirPath, f.name)))
    .sort();
  return crypto.createHash("sha256").update(hashes.join("")).digest("hex");
}

// ---------------------------------------------------------------------------
// Registry loader
// ---------------------------------------------------------------------------
export function loadRegistryYaml() {
  const filePath = path.join(PROJECT_ROOT, ".claude", "contracts", "registry.yaml");
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  try {
    return yaml.load(content);
  } catch (err) {
    console.error(`[loadRegistryYaml] Failed to parse registry.yaml: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agent orchestration rules loader
// ---------------------------------------------------------------------------
export function loadAgentOrchestrationRules() {
  return loadConfig("agent-orchestration-rules") || {};
}
