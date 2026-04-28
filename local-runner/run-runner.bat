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
call "%NODE_CMD%" runner.js
timeout /t 5 /nobreak >nul
goto loop
