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
$bashCommand = ""

$payload = $null
try {
    $payload = $stdin | ConvertFrom-Json
    $toolName = $payload.tool_name

    if ($payload.tool_input) {
        if ($payload.tool_input.file_path) { $targetPath = $payload.tool_input.file_path }
        if ($payload.tool_input.content)   { $newContent = $payload.tool_input.content }
        if ($payload.tool_input.new_string){ $newContent = $payload.tool_input.new_string }
        if ($payload.tool_input.command)   { $bashCommand = $payload.tool_input.command }
    }
} catch {
    Write-Output ""
    Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
    Write-Output "Operation: $toolName -> $targetPath"
    Write-Output "Block reason: Failed to parse PreToolUse payload."
    Write-Output "[BLOCKED] Operation blocked."
    exit 1
}

# ---------------------------------------------------------------------------
# Helper function: call MCP enforcer helper
# ---------------------------------------------------------------------------
$helperPath = Join-Path $PSScriptRoot "hook-enforcer-helper.js"

function Call-McpHelper($filePath, $operation, $content, $role) {
    if (-not (Test-Path $helperPath)) { return @{ status = "unavailable"; reason = "helper not found" } }
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) { return @{ status = "unavailable"; reason = "node not found" } }

    try {
        $helperInput = @{
            filePath   = $filePath
            operation  = $operation
            newContent = $content
            role       = $role
        } | ConvertTo-Json -Compress

        $helperOutput = $helperInput | & $nodePath.Source $helperPath 2>$null | Out-String
        $result = $helperOutput | ConvertFrom-Json
        if (-not $result.allowed) {
            return @{ status = "blocked"; reason = $result.reason }
        }
        return @{ status = "allowed" }
    } catch {
        return @{ status = "unavailable"; reason = "Helper error: $($_.Exception.Message)" }
    }
}

$role = $env:AGENT_ROLE

# ---------------------------------------------------------------------------
# 4. Write/Edit interception
# ---------------------------------------------------------------------------
$isWriteOrEdit = $toolName -in @("Write", "Edit")
if ($isWriteOrEdit -and $targetPath) {
    $result = Call-McpHelper $targetPath $toolName $newContent $role
    if ($result.status -eq "unavailable") {
        Write-Output ""
        Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        Write-Output "Operation: $toolName -> $targetPath"
        Write-Output "Block reason: MCP enforcer helper unavailable or returned no result."
        Write-Output "[BLOCKED] All Write/Edit operations require MCP constraint enforcement."
        Write-Output "!!!"
        Write-Output ""
        exit 1
    }
    if ($result.status -eq "blocked") {
        Write-Output ""
        Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
        Write-Output "Operation: $toolName -> $targetPath"
        Write-Output "Block reason: $($result.reason)"
        Write-Output "[BLOCKED] Operation blocked."
        Write-Output "!!!"
        Write-Output ""
        exit 1
    }
    exit 0
}

# ---------------------------------------------------------------------------
# 5. Bash redirection detection (P0-2 fix)
# ---------------------------------------------------------------------------
if ($toolName -eq "Bash" -and $bashCommand) {
    $targets = @()
    # Match >file, >> file, 2>file, &>file, etc.
    $targets += [regex]::Matches($bashCommand, "\d*\s*[\u003e][\u0026\u003e]?\s*(\S+)") | ForEach-Object { $_.Groups[1].Value }
    # Match | tee file, | tee -a file
    $targets += [regex]::Matches($bashCommand, "\|\s*tee\s+(?:-[a-z]+\s+)?(\S+)") | ForEach-Object { $_.Groups[1].Value }

    $safePrefixes = @("/dev/", "-")
    foreach ($target in $targets) {
        $isSafe = $false
        foreach ($prefix in $safePrefixes) {
            if ($target.StartsWith($prefix)) { $isSafe = $true; break }
        }
        if ($isSafe) { continue }

        $result = Call-McpHelper $target "Write" "" $role
        if ($result.status -eq "unavailable") {
            Write-Output ""
            Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
            Write-Output "Operation: Bash -> $bashCommand"
            Write-Output "Redirect target: $target"
            Write-Output "Block reason: MCP enforcer helper unavailable."
            Write-Output "[BLOCKED] Bash redirect blocked."
            Write-Output "!!!"
            Write-Output ""
            exit 1
        }
        if ($result.status -eq "blocked") {
            Write-Output ""
            Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
            Write-Output "Operation: Bash -> $bashCommand"
            Write-Output "Redirect target: $target"
            Write-Output "Block reason: $($result.reason)"
            Write-Output "[BLOCKED] Bash redirect blocked."
            Write-Output "!!!"
            Write-Output ""
            exit 1
        }
    }
}

# All other tools: allow
exit 0
