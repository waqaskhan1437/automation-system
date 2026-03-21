@echo off
title Puter CLI - Claude AI
color 0A
echo.
echo ================================================
echo    PUTER CLI - Free Claude via Puter.js
echo ================================================
echo.

node "%~dp0puter-cli.js" %*

if errorlevel 1 (
    echo.
    echo Press any key to exit...
    pause >nul
)
