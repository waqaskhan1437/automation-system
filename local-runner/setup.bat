@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Automation Launcher - Quick Setup
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "TOOLS_DIR=%SCRIPT_DIR%tools"
set "NODE_DIR=%TOOLS_DIR%\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "FFMPEG_DIR=%TOOLS_DIR%\ffmpeg"
set "FFMPEG_EXE=%FFMPEG_DIR%\bin\ffmpeg.exe"
set "YTDLP_DIR=%TOOLS_DIR%\yt-dlp"
set "YTDLP_EXE=%YTDLP_DIR%\yt-dlp.exe"
if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%" >nul 2>nul

set "PATH=%NODE_DIR%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%USERPROFILE%\AppData\Roaming\npm;%USERPROFILE%\AppData\Local\Microsoft\WinGet\Links;%LOCALAPPDATA%\Microsoft\WindowsApps;%FFMPEG_DIR%\bin;%YTDLP_DIR%;%PATH%"
set "NODE_CMD=node"

if exist "%NODE_EXE%" (
    set "NODE_CMD=%NODE_EXE%"
)

echo [1/9] Checking Node.js...
call :check_node
if %errorlevel% neq 0 (
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo Installing Node.js with winget...
        winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    ) else (
        echo Installing portable Node.js locally...
        if not exist "%NODE_DIR%" mkdir "%NODE_DIR%" >nul 2>nul
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$zipPath = Join-Path $env:TEMP 'node-v20.11.0-win-x64.zip'; $extractPath = Join-Path $env:TEMP 'node-portable'; Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip' -OutFile $zipPath; Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force; $nodeRoot = Get-ChildItem $extractPath | Where-Object { $_.PSIsContainer } | Select-Object -First 1; if ($nodeRoot) { Copy-Item -Path (Join-Path $nodeRoot.FullName '*') -Destination '%NODE_DIR%' -Recurse -Force }"
        del "%TEMP%\node-v20.11.0-win-x64.zip" >nul 2>nul
    )
    set "PATH=%NODE_DIR%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
    if exist "%NODE_EXE%" (
        set "NODE_CMD=%NODE_EXE%"
    )
)
call :check_node
if %errorlevel% neq 0 (
    echo [ERROR] Node.js install failed. Please install Node.js manually and run setup again.
    exit /b 1
)
echo [OK] Node.js ready

echo [2/9] Checking FFmpeg...
call :check_ffmpeg
if %errorlevel% neq 0 (
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo Installing FFmpeg with winget...
        winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent
    ) else (
        echo Installing portable FFmpeg locally...
        if not exist "%FFMPEG_DIR%" mkdir "%FFMPEG_DIR%" >nul 2>nul
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile '%TEMP%\\ffmpeg-release-essentials.zip'; Expand-Archive -LiteralPath '%TEMP%\\ffmpeg-release-essentials.zip' -DestinationPath '%TEMP%\\ffmpeg-portable' -Force; $ffmpegRoot = Get-ChildItem '%TEMP%\\ffmpeg-portable' | Where-Object { $_.PSIsContainer } | Select-Object -First 1; if ($ffmpegRoot) { Copy-Item -Path ($ffmpegRoot.FullName + '\\*') -Destination '%FFMPEG_DIR%' -Recurse -Force }"
        del "%TEMP%\ffmpeg-release-essentials.zip" >nul 2>nul
    )
)
call :check_ffmpeg
if %errorlevel% neq 0 (
    echo [WARN] FFmpeg still not available in PATH. Local video processing may fail until it is installed.
) else (
    echo [OK] FFmpeg ready
)

echo [3/9] Checking yt-dlp...
call :check_ytdlp
if %errorlevel% neq 0 (
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo Installing yt-dlp with winget...
        winget install -e --id yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements --silent
    ) else (
        where python >nul 2>nul
        if %errorlevel% equ 0 (
            echo Installing yt-dlp with pip...
            python -m pip install --user -U yt-dlp >nul 2>nul
        ) else (
            echo Installing portable yt-dlp locally...
            if not exist "%YTDLP_DIR%" mkdir "%YTDLP_DIR%" >nul 2>nul
            powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '%YTDLP_DIR%\\yt-dlp.exe'"
        )
    )
)
set "PATH=%PATH%;%USERPROFILE%\AppData\Roaming\Python\Python313\Scripts;%USERPROFILE%\AppData\Roaming\Python\Python312\Scripts;%USERPROFILE%\AppData\Roaming\Python\Python311\Scripts"
call :check_ytdlp
if %errorlevel% neq 0 (
    echo [WARN] yt-dlp still not available in PATH. Download-based sources may fail until it is installed.
) else (
    echo [OK] yt-dlp ready
)

echo [4/9] Installing Node modules...
set "HAS_DEPENDENCIES="
if exist "package.json" (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$pkg = Get-Content 'package.json' | ConvertFrom-Json; if ($pkg.dependencies -and $pkg.dependencies.PSObject.Properties.Count -gt 0) { 'yes' }"`) do set "HAS_DEPENDENCIES=%%i"
)
if /I "!HAS_DEPENDENCIES!"=="yes" (
    if not exist "node_modules" (
        call npm install --no-fund --no-audit
    )
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        exit /b 1
    )
    echo [OK] Dependencies ready
) else (
    echo [OK] No npm dependencies to install
)

echo [5/9] Checking portable pipeline files...
if not exist "runner-scripts\\main.js" (
    echo [ERROR] runner-scripts package is missing. Rebuild the portable zip and extract it again.
    exit /b 1
)
if not exist "tools\\ffmpeg\\bin\\ffprobe.exe" (
    echo [ERROR] ffprobe.exe is missing from the portable package. Rebuild the portable zip and extract it again.
    exit /b 1
)
echo [OK] Portable runner-scripts ready

echo [6/9] Checking Configuration...
if not exist "config.txt" (
    (
        echo # Lightweight local launcher
        echo SERVER_URL=https://automation-api.waqaskhan1437.workers.dev
        echo FRONTEND_URL=https://automation-frontend-woad.vercel.app
        echo RUNNER_TOKEN=
        echo ACCESS_TOKEN=
    ) > config.txt
)
echo [OK] Configuration file ready

echo [7/9] Checking Tailscale + SSH...
powershell -NoProfile -ExecutionPolicy Bypass -File "install-tailscale.ps1"
if %errorlevel% neq 0 (
    echo [WARN] Tailscale/OpenSSH bootstrap failed. Remote access will stay disabled until setup succeeds.
) else (
    echo [OK] Remote access bootstrap checked
)

echo [8/9] Installing auto-start task...
powershell -NoProfile -ExecutionPolicy Bypass -File "install-startup-task.ps1"
if %errorlevel% neq 0 (
    echo [WARN] Startup task install failed. You can still use restart-local-runner.ps1 manually.
) else (
    echo [OK] Startup task installed
)

echo [9/9] Starting background services...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*supervisor.js*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*runner.js*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*run-runner.bat*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*run-background-supervisor.bat*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c','call run-background-supervisor.bat' -WorkingDirectory '%SCRIPT_DIR%'"

timeout /t 2 /nobreak >nul
start "" http://localhost:3000

echo.
echo ========================================
echo   Ready
echo   Background runner started
echo   Browser opening on localhost:3000
echo ========================================
echo.
exit /b 0

:check_node
if exist "%NODE_EXE%" exit /b 0
where node >nul 2>nul
exit /b %errorlevel%

:check_ffmpeg
if exist "%FFMPEG_EXE%" exit /b 0
where ffmpeg >nul 2>nul
exit /b %errorlevel%

:check_ytdlp
if exist "%YTDLP_EXE%" exit /b 0
where yt-dlp >nul 2>nul
exit /b %errorlevel%
