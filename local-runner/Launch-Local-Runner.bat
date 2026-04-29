@echo off
setlocal

set "BOOTSTRAP_URL=https://raw.githubusercontent.com/waqaskhan1437/automation-system/master/local-runner/bootstrap.ps1"
set "INSTALL_ROOT=%LOCALAPPDATA%\AutomationLocalRunner"
set "SOURCE_DIR=%~dp0"
set "LOCAL_BOOTSTRAP=%~dp0bootstrap.ps1"

echo ========================================
echo   Automation Local Runner
echo   Downloading latest launcher...
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $tmp = Join-Path $env:TEMP 'automation-local-runner-bootstrap.ps1'; $headers = @{ 'Cache-Control' = 'no-cache'; 'Pragma' = 'no-cache' }; try { Invoke-WebRequest -Uri '%BOOTSTRAP_URL%' -Headers $headers -OutFile $tmp -UseBasicParsing; $bootstrapPath = $tmp } catch { if (Test-Path -LiteralPath '%LOCAL_BOOTSTRAP%') { $bootstrapPath = '%LOCAL_BOOTSTRAP%' } else { throw } }; & $bootstrapPath -InstallRoot '%INSTALL_ROOT%' -SourceDir '%SOURCE_DIR%'"

if errorlevel 1 (
  echo.
  echo [ERROR] Local runner bootstrap failed.
  pause
  exit /b 1
)

exit /b 0
