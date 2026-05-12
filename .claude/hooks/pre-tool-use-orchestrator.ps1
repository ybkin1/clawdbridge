# pre-tool-use-orchestrator.ps1
# Phase 4: Config-driven thin hook. Delegates sensitivity checks to MCP enforcer helper.
# Falls back to legacy hardcoded logic if helper is unavailable.
#
# Architecture: Hook reads .claude/config/write-permissions.yaml (via Node helper)
#               → shares config with MCP constraint-enforcer → no redundant rules.

param()

$ErrorActionPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# 1. Capture stdin for downstream scripts
# ---------------------------------------------------------------------------
$stdin = $input | Out-String

# ---------------------------------------------------------------------------
# 2. clawd-on-desk state update (always run first, never block)
# ---------------------------------------------------------------------------
$clawdPath = Join-Path $PSScriptRoot "..\..\clawd-on-desk-main\hooks\clawd-node-wrapper.ps1"
if (Test-Path $clawdPath) {
    $stdin | powershell -NoProfile -File $clawdPath PreToolUse
}

# ---------------------------------------------------------------------------
# 3. Parse PreToolUse payload
# ---------------------------------------------------------------------------
$toolName    = ""
$targetPath  = ""
$newContent  = ""

try {
    $payload = $stdin | ConvertFrom-Json
    $toolName = $payload.tool_name

    if ($payload.tool_input) {
        if ($payload.tool_input.file_path) { $targetPath = $payload.tool_input.file_path }
        if ($payload.tool_input.content)   { $newContent = $payload.tool_input.content }
        if ($payload.tool_input.new_string){ $newContent = $payload.tool_input.new_string }
    }
} catch {
    Write-Output ""
    Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
    Write-Output "Operation: $toolName -> $targetPath"
    Write-Output "Block reason: Failed to parse PreToolUse payload."
    Write-Output "[BLOCKED] Operation blocked."
    exit 1
}

# Only intercept Write/Edit operations
$isWriteOrEdit = $toolName -in @("Write", "Edit")
if (-not $isWriteOrEdit -or -not $targetPath) {
    exit 0
}

# ---------------------------------------------------------------------------
# 4. Primary: Call MCP enforcer helper (config-driven)
# ---------------------------------------------------------------------------
$helperPath = Join-Path $PSScriptRoot "hook-enforcer-helper.js"
$mcpResult = $null

if (Test-Path $helperPath) {
    try {
        $helperInput = @{
            filePath   = $targetPath
            operation  = $toolName
            newContent = $newContent
        } | ConvertTo-Json -Compress

        $helperOutput = $helperInput | & node $helperPath 2>$null | Out-String
        $mcpResult = $helperOutput | ConvertFrom-Json
    } catch {
        $mcpResult = $null
    }
}

if ($mcpResult -ne $null) {
    if (-not $mcpResult.allowed) {
        Write-Output ""
        Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        Write-Output "Operation: $toolName -> $targetPath"
        Write-Output "Block reason: $($mcpResult.reason)"
        Write-Output "[BLOCKED] Operation blocked."
        Write-Output "!!!"
        Write-Output ""
        exit 1
    }
    # MCP allowed: proceed
    exit 0
}

# ---------------------------------------------------------------------------
# 5. Fallback: MCP helper unavailable — block all Write/Edit
# ---------------------------------------------------------------------------
Write-Output ""
Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
Write-Output "Operation: $toolName -> $targetPath"
Write-Output "Block reason: MCP enforcer helper unavailable or returned no result."
Write-Output "[BLOCKED] All Write/Edit operations require MCP constraint enforcement."
Write-Output "!!!"
Write-Output ""
exit 1
