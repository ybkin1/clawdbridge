# pre-tool-use-orchestrator.ps1
# Phase 1: Precise blocking (sensitive-file-level)
# Phase 2+ simplified: outputs MCP tool suggestions instead of auto-running checkers
#
# Blocking policy:
#   - Write/Edit to 00-task-state.yaml with phase_status: passed/archived  -> BLOCK
#   - Write/Edit to 00-task-state.yaml with closeout_allowed: true         -> BLOCK
#   - Write to evidence-lock-*.yaml                                         -> BLOCK
#   - Write to checkers/*.yaml (checker results)                            -> BLOCK
#   - Write to reviews/receipt-*.yaml                                       -> BLOCK
#   - All other operations (Read, Grep, Glob, code edits)                   -> PASS
#
# On block: outputs MCP tool fix suggestions, then exits 1.
# Does NOT modify any clawd-on-desk files.

param()

$ErrorActionPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# 1. Capture stdin for downstream scripts
# ---------------------------------------------------------------------------
$stdin = $input | Out-String

# ---------------------------------------------------------------------------
# 2. clawd-on-desk state update (always run first, never block)
# ---------------------------------------------------------------------------
$stdin | powershell -NoProfile -File "C:\Users\Administrator\Documents\trae_projects\yb\clawd-on-desk-main\hooks\clawd-node-wrapper.ps1" PreToolUse

# ---------------------------------------------------------------------------
# 3. Parse PreToolUse payload to determine tool and target
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
    # Unparseable payload - cannot determine sensitivity, pass through safely
    exit 0
}

# ---------------------------------------------------------------------------
# 4. Determine if this is a blocking-sensitive operation
# ---------------------------------------------------------------------------
$isWriteOrEdit = $toolName -in @("Write", "Edit")
$shouldBlock   = $false
$blockReason   = ""

if ($isWriteOrEdit -and $targetPath) {
    $normPath = $targetPath -replace "\\", "/"

    # 4a. Phase transition: attempting to mark phase as passed/archived or closeout
    if ($normPath -match "00-task-state\.yaml") {
        if ($newContent -match "phase_status\s*:\s*(passed|archived)") {
            $shouldBlock = $true
            $blockReason = "phase_transition"
        }
        if ($newContent -match "closeout_allowed\s*:\s*true") {
            $shouldBlock = $true
            $blockReason = "closeout"
        }
    }

    # 4b. Evidence lock write
    if ($normPath -match "evidence-lock-.*\.yaml") {
        $shouldBlock = $true
        $blockReason = "evidence_lock"
    }

    # 4c. Checker result write (exclude evidence-lock files, handled in 4b)
    if ($normPath -match "checkers/[^/]+\.yaml$" -and -not ($normPath -match "evidence-lock")) {
        $shouldBlock = $true
        $blockReason = "checker_result"
    }

    # 4d. Receipt write
    if ($normPath -match "reviews/receipt-.*\.yaml") {
        $shouldBlock = $true
        $blockReason = "receipt"
    }
}

# If not a blocking operation, exit cleanly immediately
if (-not $shouldBlock) {
    exit 0
}

# ---------------------------------------------------------------------------
# 5. Sensitive operation detected: run checker reminder + output MCP suggestions
# ---------------------------------------------------------------------------
Write-Output ""
Write-Output "!!! PRE-TOOL BLOCKING CHECK TRIGGERED !!!"
Write-Output "Operation: $toolName -> $targetPath"
Write-Output "Block reason: $blockReason"
Write-Output "-------------------------------------------"

# 5a. Run checker reminder to identify gaps
$reminderOutput = $stdin | powershell -NoProfile -File "C:\Users\Administrator\Documents\trae_projects\yb\.claude\hooks\checker-reminder.ps1" | Out-String

if (-not ($reminderOutput -match "MECHANICAL GAP DETECTED")) {
    Write-Output "[PASS] No mechanical gaps detected. Proceeding."
    Write-Output "!!!"
    Write-Output ""
    exit 0
}

Write-Output $reminderOutput

# 5b. Output MCP tool suggestions
Write-Output ""
Write-Output "[MCP FIX SUGGESTION] You can resolve gaps by calling the constraint-enforcer MCP tools:"
Write-Output "  1. check_phase_readiness    - identify all mechanical gaps"
Write-Output "  2. run_mandatory_checkers   - auto-run missing checkers"
Write-Output "  3. generate_evidence_lock   - lock evidence for current phase"
Write-Output "  4. request_phase_transition - validate and perform phase transition"
Write-Output "-------------------------------------------"

Write-Output ""
Write-Output "[BLOCKED] Operation blocked due to unresolved mechanical gaps."
Write-Output "Fix remaining issues (via MCP tools above) and retry the $toolName operation."
Write-Output "!!!"
Write-Output ""

exit 1
