# Launch clawd-on-desk with clean environment (no ELECTRON_RUN_AS_NODE)
$env:ELECTRON_RUN_AS_NODE = $null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$clawdDir = "c:\Users\Administrator\Documents\trae_projects\yb\clawd-on-desk-main"
Set-Location $clawdDir

# Remove stale lockfile
Remove-Item -Force "$env:APPDATA\clawd-on-desk\lockfile" -ErrorAction SilentlyContinue

$env:Path = "C:\Program Files\nodejs;" + $env:Path
node launch.js
