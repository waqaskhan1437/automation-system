param()

$scriptDir = $PSScriptRoot

$targets = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*$scriptDir*server.js*") -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*$scriptDir*runner.js*") -or
    ($_.Name -eq "node.exe" -and $_.CommandLine -like "*$scriptDir*supervisor.js*") -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine -like "*$scriptDir*run-runner.bat*") -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine -like "*$scriptDir*run-background-supervisor.bat*")
} | Select-Object ProcessId, Name, CommandLine

$targets | Format-Table -AutoSize
