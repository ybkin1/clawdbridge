// trae-install.js — Install the Trae IDE external monitor.
//
// Starts trae-monitor.ps1 as a hidden background PowerShell process.
// Zero external dependencies — PowerShell + .NET UIA are built into Windows.
//
// Usage: node hooks/trae-install.js

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const MONITOR_SCRIPT = path.join(__dirname, "trae-monitor.ps1");
const PID_FILE = path.join(require("os").homedir(), ".clawd", "trae-monitor.pid");

function log(msg) {
  console.log(`[trae-install] ${msg}`);
}

// ── Kill existing monitor ──
function killExisting() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (Number.isFinite(pid) && pid > 1) {
        try { process.kill(pid, "SIGTERM"); log(`Killed existing monitor PID ${pid}`); }
        catch { log("No existing monitor process found"); }
      }
      fs.unlinkSync(PID_FILE);
    }
  } catch {}
  if (process.platform === "win32") {
    try {
      execSync('taskkill /F /FI "WINDOWTITLE eq trae-monitor*" 2>nul', { stdio: "ignore" });
    } catch {}
  }
}

// ── Main ──
log("Trae IDE monitor installer (PowerShell)");

killExisting();

log(`Starting trae-monitor.ps1...`);
const pidDir = path.dirname(PID_FILE);
if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });

const child = spawn("powershell.exe", [
  "-NoProfile",
  "-WindowStyle", "Hidden",
  "-ExecutionPolicy", "Bypass",
  "-File", MONITOR_SCRIPT
], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});

child.unref();
fs.writeFileSync(PID_FILE, `${child.pid}\n`);

log(`Monitor started (PID: ${child.pid})`);
log("Trae IDE permission bubbles will appear in clawd-on-desk when Trae shows approval dialogs.");
