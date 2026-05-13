// lib/checkpoint-store.js — Checkpoint save/query/restore/list

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { loadYaml, PROJECT_ROOT } from "./config-loader.js";
import { resolveTaskDir } from "./task-resolver.js";

export async function checkpointSync(args = {}) {
  const taskDir = resolveTaskDir(args.taskDir);
  const operation = args.operation || "save";
  const checkpointId = args.checkpoint_id || `cp-${Date.now()}`;

  if (!taskDir) {
    return { success: false, reason: "No active task found." };
  }

  const checkpointsDir = path.join(taskDir, "checkpoints");
  if (!fs.existsSync(checkpointsDir)) {
    fs.mkdirSync(checkpointsDir, { recursive: true });
  }

  if (operation === "save") {
    const checkpointFile = path.join(checkpointsDir, `${checkpointId}.yaml`);
    const snapshot = {
      checkpoint_id: checkpointId,
      task_id: path.basename(taskDir),
      saved_at: new Date().toISOString(),
      task_state: loadYaml(path.join(taskDir, "00-task-state.yaml")) || {},
      board: loadYaml(path.join(taskDir, "board.yaml")) || {},
      agents: {},
      checkers: {},
    };

    const agentsDir = path.join(taskDir, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const f of fs.readdirSync(agentsDir)) {
        if (f.endsWith(".yaml")) {
          const doc = loadYaml(path.join(agentsDir, f));
          if (doc && doc.agent_id) snapshot.agents[doc.agent_id] = doc;
        }
      }
    }

    const checkersDir = path.join(taskDir, "checkers");
    if (fs.existsSync(checkersDir)) {
      for (const f of fs.readdirSync(checkersDir)) {
        if (f.endsWith(".yaml") && !f.startsWith("evidence-lock")) {
          const doc = loadYaml(path.join(checkersDir, f));
          if (doc && doc.checker_id) snapshot.checkers[doc.checker_id] = doc;
        }
      }
    }

    fs.writeFileSync(checkpointFile, yaml.dump(snapshot));
    return {
      success: true,
      checkpoint_id: checkpointId,
      checkpoint_file: checkpointFile,
      saved_at: snapshot.saved_at,
    };
  }

  if (operation === "query") {
    const checkpointFile = path.join(checkpointsDir, `${checkpointId}.yaml`);
    if (!fs.existsSync(checkpointFile)) {
      return { success: false, reason: `Checkpoint '${checkpointId}' not found.` };
    }
    const snapshot = loadYaml(checkpointFile);
    return {
      success: true,
      checkpoint_id: checkpointId,
      snapshot,
      queried_at: new Date().toISOString(),
    };
  }

  if (operation === "restore") {
    const checkpointFile = path.join(checkpointsDir, `${checkpointId}.yaml`);
    if (!fs.existsSync(checkpointFile)) {
      return { success: false, reason: `Checkpoint '${checkpointId}' not found.` };
    }
    const snapshot = loadYaml(checkpointFile);
    if (!snapshot || !snapshot.task_state) {
      return { success: false, reason: `Checkpoint '${checkpointId}' is corrupted or empty.` };
    }

    const stateFile = path.join(taskDir, "00-task-state.yaml");
    const tempFile = `${stateFile}.tmp`;
    try {
      fs.writeFileSync(tempFile, yaml.dump(snapshot.task_state));
      fs.renameSync(tempFile, stateFile);
    } catch (err) {
      return { success: false, reason: `Restore failed: ${err.message}` };
    }

    if (snapshot.board && Object.keys(snapshot.board).length > 0) {
      const boardFile = path.join(taskDir, "board.yaml");
      const boardTemp = `${boardFile}.tmp`;
      try {
        fs.writeFileSync(boardTemp, yaml.dump(snapshot.board));
        fs.renameSync(boardTemp, boardFile);
      } catch {
        // Non-critical
      }
    }

    return {
      success: true,
      checkpoint_id: checkpointId,
      restored_at: new Date().toISOString(),
      task_state_restored: true,
    };
  }

  if (operation === "list") {
    const files = fs.existsSync(checkpointsDir)
      ? fs.readdirSync(checkpointsDir).filter((f) => f.endsWith(".yaml"))
      : [];
    const checkpoints = files.map((f) => {
      const doc = loadYaml(path.join(checkpointsDir, f));
      return {
        checkpoint_id: doc?.checkpoint_id || f.replace(".yaml", ""),
        saved_at: doc?.saved_at || "unknown",
      };
    });
    return { success: true, count: checkpoints.length, checkpoints, timestamp: new Date().toISOString() };
  }

  return { success: false, reason: `Unknown operation: '${operation}'.` };
}
