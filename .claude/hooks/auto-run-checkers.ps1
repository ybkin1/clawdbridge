# auto-run-checkers.ps1 — Phase 2: Auto-run missing mandatory checkers
# Automatically detects missing checker results and runs/generates them.
# Generates standard checker_result.yaml per verification-checker.md schema.

param(
    [string]$TaskDir = "",
    [string]$CheckerFilter = ""   # Comma-separated list of specific checkers to run
)

# Resolve task directory
if (-not $TaskDir) {
    $tasksDir = Join-Path $PWD ".claude/tasks"
    if (-not (Test-Path $tasksDir)) {
        Write-Output "[AUTO-CHECKER] No .claude/tasks directory found."
        exit 0
    }

    $taskObj = Get-ChildItem -Path $tasksDir -Directory | ForEach-Object {
        $sf = Join-Path $_.FullName "00-task-state.yaml"
        if (Test-Path $sf) {
            $mtime = (Get-Item $sf).LastWriteTime
            [PSCustomObject]@{ Dir=$_.FullName; Name=$_.Name; MTime=$mtime }
        }
    } | Sort-Object MTime -Descending | Select-Object -First 1

    if (-not $taskObj) {
        Write-Output "[AUTO-CHECKER] No active task found."
        exit 0
    }
    $TaskDir = $taskObj.Dir
}

$taskId = Split-Path $TaskDir -Leaf
$routeFile = Join-Path $TaskDir "route-projection.yaml"

if (-not (Test-Path $routeFile)) {
    Write-Output "[AUTO-CHECKER] No route-projection.yaml found for task $taskId. Skipping."
    exit 0
}

# Extract mandatory_checkers from route-projection
$routeRaw = Get-Content $routeFile -Raw -ErrorAction SilentlyContinue
$mcMatch = [regex]::Match($routeRaw, "(?m)^mandatory_checkers:\s*\[(.*?)\]")
if (-not $mcMatch.Success) {
    Write-Output "[AUTO-CHECKER] No mandatory_checkers defined for task $taskId. Skipping."
    exit 0
}

$checkerList = $mcMatch.Groups[1].Value
$allCheckers = $checkerList -split "," | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ }

# Apply filter if specified
$checkers = $allCheckers
if ($CheckerFilter) {
    $filterSet = $CheckerFilter -split "," | ForEach-Object { $_.Trim() }
    $checkers = $allCheckers | Where-Object { $filterSet -contains $_ }
}

$checkerRoot = Join-Path $PWD ".claude/checkers"
$taskCheckerDir = Join-Path $TaskDir "checkers"
if (-not (Test-Path $taskCheckerDir)) {
    New-Item -ItemType Directory -Path $taskCheckerDir -Force | Out-Null
}

$runTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$results = @()

foreach ($checkerId in $checkers) {
    # Skip if already has a result file
    $existing = Get-ChildItem -Path $taskCheckerDir -Filter "*$checkerId*" -ErrorAction SilentlyContinue
    if ($existing -and $existing.Count -gt 0) {
        $results += "[SKIP] $checkerId - already has result: $($existing[0].Name)"
        continue
    }

    # Locate checker script
    $scriptPath = Join-Path $checkerRoot "$checkerId.sh"
    if (-not (Test-Path $scriptPath)) {
        $altPath = Join-Path $checkerRoot "$checkerId.ps1"
        if (Test-Path $altPath) { $scriptPath = $altPath }
    }

    $runId = "$checkerId-$runTimestamp"
    $resultFile = Join-Path $taskCheckerDir "$runId.yaml"

    if (-not (Test-Path $scriptPath)) {
        # Placeholder checker: generate manual_pending result
        @"
checker_run_id: "$runId"
checker_id: "$checkerId"
task_id: "$taskId"
run_at: "$(Get-Date -Format "o")"
mode: manual
status: manual_pending
target_ref: "$TaskDir"
summary: "Checker script not found: $checkerId"
evidence_ref: ""
gate_binding: ""
failure_detail:
  affected_gate: ""
  severity: ""
  description: "Checker implementation is placeholder. Manual verification required."
  remediation_hint: "Implement $checkerId.sh or provide manual evidence."
manual_evidence:
  method: "pending"
  result: ""
  evidence_path: ""
  reviewed_by: ""
legacy_text_output: ""
"@ | Out-File -FilePath $resultFile -Encoding UTF8

        $results += "[PENDING] $checkerId - script not found, manual_pending result created at checkers/$runId.yaml"
        continue
    }

    # Run checker
    Write-Output "[RUN] Executing $checkerId ..."
    try {
        $outputLines = & bash $scriptPath $PWD 2>&1
        $exitCode = $LASTEXITCODE

        $status = if ($outputLines -match "PASSED") { "passed" } else { "failed" }
        $outputText = $outputLines -join "`n"

        @"
checker_run_id: "$runId"
checker_id: "$checkerId"
task_id: "$taskId"
run_at: "$(Get-Date -Format "o")"
mode: automated
status: $status
target_ref: "$TaskDir"
summary: "Auto-run by pre-tool-use-orchestrator"
evidence_ref: "checkers/$runId.yaml"
gate_binding: ""
failure_detail:
  affected_gate: ""
  severity: ""
  description: ""
  remediation_hint: ""
manual_evidence:
  method: ""
  result: ""
  evidence_path: ""
  reviewed_by: ""
legacy_text_output: |
  $outputText
"@ | Out-File -FilePath $resultFile -Encoding UTF8

        $results += "[$status] $checkerId - result written to checkers/$runId.yaml"
    } catch {
        $results += "[ERROR] $checkerId - execution failed: $_"
    }
}

Write-Output ""
Write-Output "========== Auto-Checker Summary =========="
if ($results.Count -eq 0) {
    Write-Output "No checkers needed to run."
} else {
    $results | ForEach-Object { Write-Output $_ }
}
Write-Output "=========================================="

exit 0
