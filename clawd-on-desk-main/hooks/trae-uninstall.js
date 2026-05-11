// trae-uninstall.js — Stop and remove the Trae IDE external monitor.
//
// Usage: node hooks/trae-uninstall.js

const fs = require("fs");
const path = require("path");

const PID_FILE = path.join(require("os").homedir(), ".clawd", "trae-monitor.pid");

function log(msg) {
  console.log(`[trae-uninstall] ${msg}`);
}

let killed = 0;

// ── Kill by PID file ──
try {
  if (fs.existsSync(PID_FILE)) {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (Number.isFinite(pid) && pid > 1) {
      try {
        process.kill(pid, "SIGTERM");
        log(`Killed monitor PID ${pid}`);
        killed++;
      } catch {
        log(`PID ${pid} no longer running`);
      }
    }
    fs.unlinkSync(PID_FILE);
  }
} catch (e) {
  log(`PID file cleanup: ${e.message}`);
}

// ── Kill stray trae-monitor processes on Windows ──
if (process.platform === "win32") {
  try {
    const { execSync } = require("child_process");
    execSync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq trae-monitor*" 2>nul', { stdio: "ignore" });
    log("Cleaned up stray monitor processes");
  } catch {}
}

if (killed > 0) {
  log("Trae IDE monitor stopped. To re-install: npm run install:trae-monitor");
} else {
  log("No running monitor found.");
}
