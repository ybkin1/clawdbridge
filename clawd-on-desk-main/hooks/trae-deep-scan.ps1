# trae-deep-scan.ps1 — Full UIA dump of ALL element types in Trae windows
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window
)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)

foreach ($win in $windows) {
    $name = $win.Current.Name
    if ($name -notmatch "Trae") { continue }
    
    Write-Host "=== '$name' ==="
    Write-Host "  Class: $($win.Current.ClassName) | ProcessId: $($win.Current.ProcessId)"
    
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    
    # Deep: walk ALL elements, categorize by ControlType
    $typeCount = @{}
    $interesting = @()
    foreach ($elem in $all) {
        $ct = $elem.Current.ControlType.ProgrammaticName -replace "ControlType\.",""
        $typeCount[$ct] = ($typeCount[$ct] ?? 0) + 1
        $en = $elem.Current.Name
        $eid = $elem.Current.AutomationId
        if ($en -match "允许|拒绝|Allow|Deny|approve|reject|运行|Run|执行|Execute" -or 
            $eid -match "allow|deny|approve|reject|run|exec") {
            $interesting += "  *** '$en' [autoId=$eid] type=$ct"
        }
    }
    
    Write-Host "  ControlType counts:"
    $typeCount.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { Write-Host "    $($_.Key): $($_.Value)" }
    
    if ($interesting.Count -gt 0) {
        Write-Host "  INTERESTING MATCHES:"
        $interesting | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "  *** NO approval-related elements found in UIA tree ***"
    }
    Write-Host ""
}
