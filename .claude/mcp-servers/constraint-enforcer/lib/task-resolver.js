// lib/task-resolver.js — Task directory resolution helpers

import fs from "fs";
import path from "path";
import { PROJECT_ROOT } from "./config-loader.js";

export function findActiveTask(tasksDir) {
  if (!fs.existsSync(tasksDir)) return null;
  const dirs = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("tk-"))
    .map((d) => {
      const sf = path.join(tasksDir, d.name, "00-task-state.yaml");
      if (!fs.existsSync(sf)) return null;
      const stat = fs.statSync(sf);
      return { dir: path.join(tasksDir, d.name), mtime: stat.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  return dirs.length > 0 ? dirs[0].dir : null;
}

export function resolveTaskDir(provided) {
  if (provided) return provided;
  const tasksDir = path.join(PROJECT_ROOT, ".claude", "tasks");
  return findActiveTask(tasksDir);
}
