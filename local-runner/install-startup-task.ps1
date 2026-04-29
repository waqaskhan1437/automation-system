param()

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$powershellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$restartScript = Join-Path $scriptDir "restart-local-runner.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupLauncher = Join-Path $startupDir "AutomationLocalRunner.cmd"
$taskName = "AutomationLocalRunner"

if (-not (Test-Path -LiteralPath $restartScript)) {
    throw "Restart script not found: $restartScript"
}

$launcherContent = @"
@echo off
"$powershellExe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$restartScript"
"@

Set-Content -LiteralPath $startupLauncher -Value $launcherContent -Encoding ASCII
$taskRegistered = $false

try {
    Import-Module ScheduledTasks -ErrorAction Stop
    $action = New-ScheduledTaskAction -Execute $powershellExe -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$restartScript`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable

    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts the Automation local runner in the background." -RunLevel Highest -Force | Out-Null
    } catch {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts the Automation local runner in the background." -Force | Out-Null
    }

    Start-ScheduledTask -TaskName $taskName
    $taskRegistered = $true
} catch {
    Write-Warning "Scheduled Task install failed. Falling back to Startup folder launcher. $($_.Exception.Message)"
}

if (-not $taskRegistered) {
    Start-Process -WindowStyle Hidden -FilePath $powershellExe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $restartScript
}

if ($taskRegistered) {
    Write-Output "Scheduled Task '$taskName' installed. Startup fallback kept at '$startupLauncher'."
} else {
    Write-Output "Startup launcher installed at '$startupLauncher' and started."
}
