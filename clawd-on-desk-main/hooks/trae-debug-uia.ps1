# trae-debug-uia.ps1 — Dump all buttons in Trae windows
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window
)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)

Write-Host "=== Scanning Trae windows ==="
$found = 0

foreach ($win in $windows) {
    $name = $win.Current.Name
    if ($name -notmatch "Trae") { continue }
    $found++
    
    $bounds = $win.Current.BoundingRectangle
    Write-Host ""
    Write-Host "=== Window [$found]: '$name' ==="
    Write-Host "  ClassName: $($win.Current.ClassName)"
    Write-Host "  Bounds: X=$($bounds.X) Y=$($bounds.Y) W=$($bounds.Width) H=$($bounds.Height)"
    
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    
    Write-Host "  --- Buttons ---"
    $btnCount = 0
    foreach ($elem in $all) {
        if ($elem.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
            $btnCount++
            $en = $elem.Current.Name
            $eid = $elem.Current.AutomationId
            $ect = $elem.Current.ControlType.ProgrammaticName
            Write-Host "    [$btnCount] Name='$en' | AutoId='$eid' | Enabled=$($elem.Current.IsEnabled)"
        }
    }
    Write-Host "  Total buttons: $btnCount"
    
    Write-Host "  --- Text elements ---"
    $txtCount = 0
    foreach ($elem in $all) {
        if ($elem.Current.ControlType.ProgrammaticName -eq "ControlType.Text") {
            $txtCount++
            $en = $elem.Current.Name
            if ($en.Length -gt 120) { $en = $en.Substring(0, 120) + "..." }
            Write-Host "    [$txtCount] '$en'"
            if ($txtCount -ge 20) { Write-Host "    (truncated)"; break }
        }
    }
    Write-Host "  Total text: $txtCount (shown: up to 20)"
}

if ($found -eq 0) {
    Write-Host "No Trae windows found via UIA!"
    Write-Host ""
    Write-Host "Top-level windows found:"
    $windows | ForEach-Object { Write-Host "  Name='$($_.Current.Name)' Class='$($_.Current.ClassName)'" }
}
