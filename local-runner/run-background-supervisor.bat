@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "TOOLS_DIR=%SCRIPT_DIR%tools"
set "NODE_DIR=%TOOLS_DIR%\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "FFMPEG_DIR=%TOOLS_DIR%\ffmpeg"
set "YTDLP_DIR=%TOOLS_DIR%\yt-dlp"
set "PATH=%NODE_DIR%;%FFMPEG_DIR%\bin;%YTDLP_DIR%;%PATH%"
set "NODE_CMD=node"

if exist "%NODE_EXE%" (
    set "NODE_CMD=%NODE_EXE%"
)

:loop
echo ========================================
echo   Local Background Supervisor
echo   Starting supervisor.js
echo ========================================
call "%NODE_CMD%" supervisor.js
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="10" (
    echo [INFO] Background supervisor is already running. Exiting wrapper.
    exit /b 0
)
echo.
echo [WARN] supervisor.js exited. Restarting in 5 seconds...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5" >nul
goto loop
