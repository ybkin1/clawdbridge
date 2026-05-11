# checker-reminder.ps1 — PreToolUse hook: mechanical gap reminder
# Purpose: Check active task state before Write/Edit tool use.
# Non-blocking: outputs text to agent context only.
# Compatible with PowerShell 5.1+

param()

# Consume stdin (do NOT block the Claude Code hook pipeline)
$null = $input | Out-String

# Resolve task directory
$tasksDir = Join-Path $PWD ".claude/tasks"
if (-not (Test-Path $tasksDir)) { exit 0 }

# Find the most recently modified active task
$activeTask = Get-ChildItem -Path $tasksDir -Directory | ForEach-Object {
    $sf = Join-Path $_.FullName "00-task-state.yaml"
    if (Test-Path $sf) {
        $mtime = (Get-Item $sf).LastWriteTime
        [PSCustomObject]@{ Dir=$_.FullName; Name=$_.Name; StateFile=$sf; MTime=$mtime }
    }
} | Sort-Object MTime -Descending | Select-Object -First 1

if (-not $activeTask) { exit 0 }

# Read state file
$stateRaw = Get-Content $activeTask.StateFile -Raw -ErrorAction SilentlyContinue
if (-not $stateRaw) { exit 0 }

# Extract key fields with simple regex (sufficient for our flat YAML)
function Get-YamlValue($content, $key) {
    if ($content -match "(?m)^$key\s*:\s*(.+?)$") {
        return $Matches[1].Trim()
    }
    return $null
}

$phase       = Get-YamlValue $stateRaw "phase"
$phaseStatus = Get-YamlValue $stateRaw "phase_status"
$closeout    = Get-YamlValue $stateRaw "closeout_allowed"

# Only remind when task is actively in progress
if ($phaseStatus -notin @("in_progress","in_review")) { exit 0 }
if ($closeout -eq "true") { exit 0 }

# Build gap list
$gaps = @()

# 1. Check for unresolved blockers
$blocker = Get-YamlValue $stateRaw "last_blocker_report"
if ($blocker -and $blocker -ne '""' -and $blocker -ne "null") {
    $gaps += "Unresolved blocker report exists"
}

# 2. Check gate results for failures
if ($stateRaw -match "(?m)status:\s*failed") {
    $gaps += "Gate result contains FAILED status"
}

# 3. Check mandatory checkers via route-projection
$routeFile = Join-Path $activeTask.Dir "route-projection.yaml"
if (Test-Path $routeFile) {
    $routeRaw = Get-Content $routeFile -Raw -ErrorAction SilentlyContinue
    $mcMatch = [regex]::Match($routeRaw, "(?m)^mandatory_checkers:\s*\[(.*?)\]")
    if ($mcMatch.Success) {
        $checkerList = $mcMatch.Groups[1].Value
        $checkers = $checkerList -split "," | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ }
        $checkerDir = Join-Path $activeTask.Dir "checkers"
        foreach ($c in $checkers) {
            $hasResult = $false
            if (Test-Path $checkerDir) {
                $hasResult = @(Get-ChildItem -Path $checkerDir -Name -Filter "*$c*").Count -gt 0
            }
            if (-not $hasResult) {
                $gaps += "Mandatory checker not run: $c"
            }
        }
    }
}

# 4. Check evidence lock
$evLock = Join-Path $activeTask.Dir "checkers/evidence-lock-$phase.yaml"
if (-not (Test-Path $evLock) -and $phase -ne "clarify") {
    $gaps += "Evidence lock missing: checkers/evidence-lock-$phase.yaml"
}

# Output reminder if gaps found
if ($gaps.Count -gt 0) {
    Write-Output ""
    Write-Output "!!! MECHANICAL GAP DETECTED - Task $($activeTask.Name) !!!"
    Write-Output "Phase: $phase | Status: $phaseStatus"
    Write-Output "----------------------------------------"
    foreach ($g in $gaps) {
        Write-Output "  [GAP] $g"
    }
    Write-Output "----------------------------------------"
    Write-Output "Phase transition is BLOCKED until all gaps resolved."
    Write-Output "See task-tracking-workflow-spec.md section 4.2 and 4.5."
    Write-Output "!!!"
    Write-Output ""
}

exit 0
