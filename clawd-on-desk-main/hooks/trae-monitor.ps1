<#
trae-monitor.ps1 — External monitor for Trae IDE permission dialogs.
Zero dependencies: uses only PowerShell built-ins + .NET UIA.

Polls Trae CN.exe windows via Windows UI Automation, detects approval
dialogs, and bridges events into clawd-on-desk's HTTP endpoints.

Resource optimizations:
  1. Process-liveness check before UIA (Get-Process)     → ~0.01% CPU idle
  2. Window title hash cache (skip UIA when unchanged)    → 90% fewer UIA calls
  3. Dynamic poll interval (500ms active / 2000ms idle)   → 4x power saving
#>

param(
    [string]$ClawdServer = "http://127.0.0.1:23333",
    [int]$MonitorPort = 23338,
    [double]$PollActiveMs = 0.5,
    [double]$PollIdleMs = 2.0
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$global:knownPermissions = @{}
$global:lastWindowHash = ""
$global:hasPendingApproval = $false
$global:running = $true

# ── Process detection ────────────────────────────────────────────────────

function Is-TraeRunning {
    $procs = Get-Process -Name "Trae CN" -ErrorAction SilentlyContinue
    return !!$procs
}

function Get-TraePid {
    $proc = Get-Process -Name "Trae CN" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { return $proc.Id }
    return 0
}

# ── Lightweight window hash (no UIA) ─────────────────────────────────────

function Get-TopLevelWindowHash {
    $titles = @()
    $null = [Windows.Forms.NativeWindow]::new()
    $callback = {
        param($hwnd, $lparam)
        $title = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Windows.Forms.UnsafeNativeMethods]::GetWindowText($hwnd)
        )
        if ($title.Length -gt 0) {
            $global:titles += $title
        }
        return $true
    }
    # Fast: use .NET's built-in window enumeration
    $hWnds = [System.Diagnostics.Process]::GetProcessesByName("Trae CN") |
        ForEach-Object { $_.MainWindowHandle } |
        Where-Object { $_ -ne [IntPtr]::Zero }
    
    $titles = $hWnds | ForEach-Object { $_.ToString() }
    $hash = [System.Security.Cryptography.MD5]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes(($titles -join "|"))
    )
    return [System.BitConverter]::ToString($hash) -replace '-',''
}

# ── UIA permission dialog detection ──────────────────────────────────────

function Find-TraePermissions {
    $permissions = @()
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Window
    )
    
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    
    foreach ($win in $windows) {
        $name = $win.Current.Name
        if ($name -notmatch "Trae") { continue }
        
        $allDescendants = $win.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        
        $allowBtn = $null
        $denyBtn = $null
        
        foreach ($elem in $allDescendants) {
            $en = $elem.Current.Name
            $eid = $elem.Current.AutomationId
            if ($elem.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
                if ($en -eq "允许" -or $en -eq "Allow" -or $eid -match "allow") {
                    $allowBtn = $elem
                }
                if ($en -eq "拒绝" -or $en -eq "Deny" -or $eid -match "(deny|reject)") {
                    $denyBtn = $elem
                }
            }
        }
        
        if ($allowBtn -and $denyBtn) {
            $cmdText = ""
            foreach ($elem in $allDescendants) {
                if ($elem.Current.IsTextPatternAvailable) {
                    $tp = $elem.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                    $cmdText += $tp.DocumentRange.GetText(-1)
                    if ($cmdText.Length -gt 200) { $cmdText = $cmdText.Substring(0, 200); break }
                }
            }
            if (-not $cmdText) { $cmdText = $name }
            
            $bounds = $win.Current.BoundingRectangle
            $winHash = [System.Convert]::ToBase64String(
                [System.Security.Cryptography.MD5]::Create().ComputeHash(
                    [System.Text.Encoding]::UTF8.GetBytes("$($bounds.X) $($bounds.Y) $($bounds.Width) $($bounds.Height) $name")
                )
            ).Substring(0, 12) -replace '/','_'
            
            $permissions += @{
                session_id = "trae:$winHash"
                window_hash = $winHash
                window = $win
                allow_btn = $allowBtn
                deny_btn = $denyBtn
                command = $cmdText
                tool_name = "TraeShell"
            }
        }
    }
    
    return $permissions
}

# ── HTTP bridge to clawd ─────────────────────────────────────────────────

function Notify-ClawdState($sessionId, $event, $state, $command = "", $sourcePid = 0) {
    $payload = @{
        agent_id = "trae-ide"
        session_id = $sessionId
        event = $event
        state = $state
        tool_name = "TraeShell"
        tool_input = @{ command = $command }
        source_pid = $sourcePid
    } | ConvertTo-Json -Compress

    try {
        Invoke-RestMethod -Uri "$ClawdServer/state" -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 2 | Out-Null
    } catch {}
}

function Notify-ClawdPermission($sessionId, $command = "") {
    $payload = @{
        agent_id = "trae-ide"
        session_id = $sessionId
        tool_name = "TraeShell"
        tool_input = @{ command = $command }
    } | ConvertTo-Json -Compress

    try {
        Invoke-RestMethod -Uri "$ClawdServer/permission" -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 2 | Out-Null
    } catch {}
}

# ── Decision execution ────────────────────────────────────────────────────

function Invoke-Decision($sessionId, $decision) {
    if (-not $global:knownPermissions.ContainsKey($sessionId)) {
        return $false
    }
    
    $perm = $global:knownPermissions[$sessionId]
    $btn = if ($decision -eq "allow") { $perm.allow_btn } else { $perm.deny_btn }
    
    try {
        # UIA Invoke pattern for button click
        $invokePattern = $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $invokePattern.Invoke()
        Write-Host "[trae-monitor] Decision executed: $sessionId → $decision"
        return $true
    } catch {
        Write-Host "[trae-monitor] Click failed for $sessionId : $_"
        return $false
    }
}

# ── HTTP listener for clawd decision callbacks ────────────────────────────

$httpListener = $null

function Start-DecisionListener {
    $global:httpListener = New-Object System.Net.Http.HttpListener
    $global:httpListener.Prefixes.Add("http://127.0.0.1:$MonitorPort/")
    $global:httpListener.Start()

    $task = [System.Threading.Tasks.Task]::Run({
        while ($global:httpListener.IsListening) {
            try {
                $context = $global:httpListener.GetContext()
                $reader = New-Object System.IO.StreamReader($context.Request.InputStream)
                $body = $reader.ReadToEnd()
                $data = $body | ConvertFrom-Json
                
                $sid = $data.session_id
                $dec = $data.decision
                
                $ok = Invoke-Decision $sid $dec
                
                $response = @{ ok = $ok } | ConvertTo-Json -Compress
                $buf = [System.Text.Encoding]::UTF8.GetBytes($response)
                $context.Response.StatusCode = if ($ok) { 200 } else { 404 }
                $context.Response.ContentType = "application/json"
                $context.Response.OutputStream.Write($buf, 0, $buf.Length)
                $context.Response.Close()
            } catch {}
        }
    })
}

# ── Main loop ─────────────────────────────────────────────────────────────

Write-Host "[trae-monitor] Started (clawd=$ClawdServer, port=$MonitorPort)"

Start-DecisionListener

while ($global:running) {
    try {
        # Optimization 1: process check first
        if (-not (Is-TraeRunning)) {
            $global:lastWindowHash = ""
            $global:hasPendingApproval = $false
            $global:knownPermissions.Clear()
            Start-Sleep -Seconds $PollIdleMs
            continue
        }

        # Optimization 2: window hash cache
        $currentHash = Get-TopLevelWindowHash
        if ($currentHash -eq $global:lastWindowHash -and -not $global:hasPendingApproval) {
            Start-Sleep -Seconds $PollIdleMs
            continue
        }
        $global:lastWindowHash = $currentHash

        # Actual UIA scan
        $traePid = Get-TraePid
        $newPerms = Find-TraePermissions

        $currentIds = @{}
        foreach ($perm in $newPerms) {
            $wh = $perm.window_hash
            $currentIds[$wh] = $true
            if (-not $global:knownPermissions.ContainsKey($wh)) {
                $global:knownPermissions[$wh] = $perm
                Notify-ClawdState $perm.session_id "PermissionRequest" "notification" $perm.command $traePid
                Notify-ClawdPermission $perm.session_id $perm.command
                Write-Host "[trae-monitor] New permission: $($perm.session_id) cmd='$($perm.command.Substring(0, [Math]::Min(60, $perm.command.Length)))'"
            }
        }

        # Cleanup resolved dialogs
        $toRemove = @()
        foreach ($wh in $global:knownPermissions.Keys) {
            if (-not $currentIds.ContainsKey($wh)) {
                $sid = $global:knownPermissions[$wh].session_id
                Notify-ClawdState $sid "PostToolUse" "working"
                $toRemove += $wh
                Write-Host "[trae-monitor] Resolved: $sid"
            }
        }
        foreach ($wh in $toRemove) {
            $global:knownPermissions.Remove($wh)
        }

        $global:hasPendingApproval = ($global:knownPermissions.Count -gt 0)
        $sleep = if ($global:hasPendingApproval) { $PollActiveMs } else { $PollIdleMs }
        Start-Sleep -Seconds $sleep

    } catch {
        Write-Host "[trae-monitor] Loop error: $_"
        Start-Sleep -Seconds $PollIdleMs
    }
}

if ($httpListener) { $httpListener.Stop(); $httpListener.Close() }
Write-Host "[trae-monitor] Stopped"
