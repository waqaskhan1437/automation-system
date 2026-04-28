param()

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$powershellExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$restartScript = Join-Path $scriptDir "restart-local-runner.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupLauncher = Join-Path $startupDir "AutomationLocalRunner.cmd"

if (-not (Test-Path -LiteralPath $restartScript)) {
    throw "Restart script not found: $restartScript"
}

$launcherContent = @"
@echo off
"$powershellExe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$restartScript"
"@

Set-Content -LiteralPath $startupLauncher -Value $launcherContent -Encoding ASCII
Start-Process -WindowStyle Hidden -FilePath $powershellExe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $restartScript

Write-Output "Startup launcher installed at '$startupLauncher' and started."
