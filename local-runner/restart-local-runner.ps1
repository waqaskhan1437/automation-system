param()

$ErrorActionPreference = "SilentlyContinue"

$scriptDir = $PSScriptRoot
$installRoot = Join-Path $env:LOCALAPPDATA "AutomationLocalRunner"
$bootstrapScript = Join-Path $scriptDir "bootstrap.ps1"
$nodeExe = Join-Path $scriptDir "tools\node\node.exe"
if (-not (Test-Path -LiteralPath $nodeExe)) {
    $nodeExe = "node"
}

if (
    (Test-Path -LiteralPath $bootstrapScript) -and
    ([System.IO.Path]::GetFullPath($scriptDir).TrimEnd('\') -eq [System.IO.Path]::GetFullPath($installRoot).TrimEnd('\'))
) {
    try {
        & $bootstrapScript -InstallRoot $scriptDir -SourceDir $scriptDir -RefreshOnly -Quiet
    } catch {
        Write-Output ("[WARN] Bootstrap refresh skipped: " + $_.Exception.Message)
    }
}

$targets = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*supervisor.js*") -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*server.js*") -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*frontend*next\\dist\\bin\\next*start -p 3001*") -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*runner.js*") -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine -like "*run-runner.bat*") -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine -like "*run-background-supervisor.bat*")
}

foreach ($process in $targets) {
    Stop-Process -Id $process.ProcessId -Force
}

Start-Sleep -Seconds 1

Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c", "call run-background-supervisor.bat" -WorkingDirectory $scriptDir
