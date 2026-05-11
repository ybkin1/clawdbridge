# Dump ALL window titles + class names - run while Trae approval is pending
Add-Type -AssemblyName System.Windows.Forms

$sig = @'
[DllImport("user32.dll")]
public static extern bool EnumWindows(IntPtr lpEnumFunc, IntPtr lParam);
[DllImport("user32.dll")]
public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")]
public static extern int GetWindowTextLength(IntPtr hWnd);
[DllImport("user32.dll")]
public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
'@
Add-Type -MemberDefinition $sig -Name Win32 -Namespace Utils

$results = [System.Collections.ArrayList]::new()
$callback = {
    param($hwnd, $lparam)
    $len = [Utils.Win32]::GetWindowTextLength($hwnd)
    $sb = New-Object System.Text.StringBuilder($len + 1)
    [Utils.Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
    $cls = New-Object System.Text.StringBuilder(256)
    [Utils.Win32]::GetClassName($hwnd, $cls, $cls.Capacity) | Out-Null
    $pid = 0
    [Utils.Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
    $title = $sb.ToString()
    if ($title.Length -gt 0) {
        [void]$results.Add(@{ Title=$title; Class=$cls.ToString(); PID=$pid; HWND=$hwnd })
    }
    return $true
}

$delegate = [System.Windows.Forms.MethodInvoker]$callback
$ptr = [System.Runtime.InteropServices.Marshal]::GetFunctionPointerForDelegate($delegate)
[Utils.Win32]::EnumWindows($ptr, [IntPtr]::Zero) | Out-Null

Write-Host "=== ALL visible windows ==="
$results | Where-Object { $_.Title -match "Trae|审批|允许|拒绝|Allow|Deny|permission|approve|Claude|Chat|对话" -or $_.Class -eq "Chrome_WidgetWin_1" } | ForEach-Object {
    Write-Host "  Title='$($_.Title)' Class='$($_.Class)' PID=$($_.PID)"
}

Write-Host ""
Write-Host "=== ALL Chrome_WidgetWin windows (Electron) ==="
$results | Where-Object { $_.Class -eq "Chrome_WidgetWin_1" } | Sort-Object PID | ForEach-Object {
    $t = if ($_.Title.Length -gt 100) { $_.Title.Substring(0,100) + "..." } else { $_.Title }
    Write-Host "  PID=$($_.PID) Title='$t'"
}
