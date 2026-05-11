// Trae IDE agent configuration
// Monitored externally via trae-monitor.py (UIA) — no native hook support.
//
// Trae is a closed Electron IDE; we poll its permission dialogs through
// Windows UI Automation and bridge the events into clawd's /state and
// /permission HTTP endpoints.  See docs/plans/trae-ide-integration-design.md.

module.exports = {
  id: "trae-ide",
  name: "Trae IDE",
  processNames: {
    win: ["Trae CN.exe"],
    mac: [],
    linux: [],
  },
  eventSource: "external-monitor",
  eventMap: {
    SessionStart: "idle",
    SessionEnd: "sleeping",
    PreToolUse: "working",
    PostToolUse: "working",
    Stop: "attention",
    PermissionRequest: "notification",
  },
  capabilities: {
    httpHook: false,
    permissionApproval: true,
    notificationHook: false,
    sessionEnd: true,
    subagent: false,
    externalMonitor: true,
  },
  // Trae-specific settings consumed by trae-monitor.py at startup
  monitorConfig: {
    port: 23338,
    pollIntervalMs: 500,
    pollIntervalIdleMs: 2000,
    windowTitlePattern: "Trae",
    approveButtonText: ["允许", "Allow"],
    denyButtonText: ["拒绝", "Deny"],
  },
};
