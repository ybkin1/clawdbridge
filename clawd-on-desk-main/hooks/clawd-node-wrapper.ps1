# clawd-node-wrapper.ps1 — Wraps clawd-hook.js with full Node.js path
# Used by Claude Code hooks in Trae IDE where node is not in PATH
$nodeExe = "C:\Program Files\nodejs\node.exe"
$hookJs  = "C:\Users\Administrator\Documents\trae_projects\yb\clawd-on-desk-main\hooks\clawd-hook.js"
$eventName = $args[0]

$stdin = $input | Out-String
$stdin | & $nodeExe $hookJs $eventName
