param()

$ErrorActionPreference = "SilentlyContinue"

$scriptDir = $PSScriptRoot
$nodeExe = Join-Path $scriptDir "tools\node\node.exe"
if (-not (Test-Path -LiteralPath $nodeExe)) {
    $nodeExe = "node"
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
