param(
    [string]$OutputDir = (Join-Path $PSScriptRoot "dist"),
    [switch]$SkipDownloads
)

$ErrorActionPreference = "Stop"

$runnerRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $runnerRoot
$runnerScriptsRoot = Join-Path $repoRoot "runner-scripts"
$toolsDir = Join-Path $runnerRoot "tools"
$nodeDir = Join-Path $toolsDir "node"
$ffmpegDir = Join-Path $toolsDir "ffmpeg"
$ytDlpDir = Join-Path $toolsDir "yt-dlp"
$stagingRoot = Join-Path $OutputDir "portable-runner"
$zipPath = Join-Path $OutputDir "local-runner-portable.zip"
$portableServerUrl = "https://automation-api.waqaskhan1437.workers.dev"
$portableFrontendUrl = "https://automation-frontend-woad.vercel.app"

Import-Module (Join-Path $PSScriptRoot "build-helpers.psm1") -Force

function Install-PortableNode {
    $nodeExe = Join-Path $nodeDir "node.exe"
    if (Test-Path -LiteralPath $nodeExe) {
        Write-Host "Portable Node.js already present"
        return
    }

    Ensure-Directory $nodeDir
    $version = "v20.11.0"
    $zipName = "node-$version-win-x64.zip"
    $tempSuffix = [guid]::NewGuid().ToString("N")
    $tempZip = Join-Path $env:TEMP "$tempSuffix-$zipName"
    $tempExtract = Join-Path $env:TEMP "$tempSuffix-portable-node-extract"

    Download-File "https://nodejs.org/dist/$version/$zipName" $tempZip
    Expand-Into $tempZip $tempExtract

    $nodeRoot = Get-ChildItem -LiteralPath $tempExtract | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if (-not $nodeRoot) {
        throw "Portable Node.js archive did not contain an extracted folder."
    }

    Copy-Item -Path (Join-Path $nodeRoot.FullName "*") -Destination $nodeDir -Recurse -Force
}

function Install-PortableFfmpeg {
    $ffmpegExe = Join-Path $ffmpegDir "bin\ffmpeg.exe"
    if (Test-Path -LiteralPath $ffmpegExe) {
        Write-Host "Portable FFmpeg already present"
        return
    }

    Ensure-Directory $ffmpegDir
    $zipName = "ffmpeg-release-essentials.zip"
    $tempSuffix = [guid]::NewGuid().ToString("N")
    $tempZip = Join-Path $env:TEMP "$tempSuffix-$zipName"
    $tempExtract = Join-Path $env:TEMP "$tempSuffix-portable-ffmpeg-extract"

    Download-File "https://www.gyan.dev/ffmpeg/builds/$zipName" $tempZip
    Expand-Into $tempZip $tempExtract

    $ffmpegRoot = Get-ChildItem -LiteralPath $tempExtract | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if (-not $ffmpegRoot) {
        throw "Portable FFmpeg archive did not contain an extracted folder."
    }

    Copy-Item -Path (Join-Path $ffmpegRoot.FullName "*") -Destination $ffmpegDir -Recurse -Force
}

function Install-YtDlp {
    $ytDlpExe = Join-Path $ytDlpDir "yt-dlp.exe"
    if ((Test-Path -LiteralPath $ytDlpExe) -and ((Get-Item -LiteralPath $ytDlpExe).Length -gt 5MB)) {
        Write-Host "Portable yt-dlp already present"
        return
    }

    Ensure-Directory $ytDlpDir
    $repoFallback = Join-Path $repoRoot "UserswaqasDownloadsyt-dlp.exe"
    if (Test-Path -LiteralPath $repoFallback) {
        Write-Host "Using repo-local yt-dlp fallback"
        Copy-Item -LiteralPath $repoFallback -Destination $ytDlpExe -Force
        return
    }

    Download-File "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" $ytDlpExe
}

function Write-PortableConfig {
    $configPath = Join-Path $stagingRoot "config.txt"
    @"
# Lightweight local launcher
SERVER_URL=$portableServerUrl
FRONTEND_URL=$portableFrontendUrl
RUNNER_TOKEN=
ACCESS_TOKEN=
"@ | Set-Content -LiteralPath $configPath -Encoding ASCII
}

function Write-PortableStateFiles {
    @"
{
  "status": "not_started",
  "message": "Runner has not reported status yet.",
  "updatedAt": null,
  "currentJobId": null,
  "processedVideos": 0,
  "lastError": ""
}
"@ | Set-Content -LiteralPath (Join-Path $stagingRoot "runner-state.json") -Encoding ASCII

    @"
{
  "status": "not_started",
  "message": "Background supervisor has not reported status yet.",
  "updatedAt": null,
  "startedAt": null,
  "supervisorPid": null,
  "dashboardPid": null,
  "frontendPid": null,
  "runnerSupervisorPid": null,
  "lastError": ""
}
"@ | Set-Content -LiteralPath (Join-Path $stagingRoot "supervisor-state.json") -Encoding ASCII
}

function Write-OneClickLauncher {
    $launcherPath = Join-Path $stagingRoot "Start-Portable-Runner.bat"
    @"
@echo off
call "%~dp0setup.bat"
"@ | Set-Content -LiteralPath $launcherPath -Encoding ASCII
}

function Copy-PortableRuntime {
    $portableToolsDir = Join-Path $stagingRoot "tools"
    $portableNodeDir = Join-Path $portableToolsDir "node"
    $portableFfmpegDir = Join-Path $portableToolsDir "ffmpeg"
    $portableYtDlpDir = Join-Path $portableToolsDir "yt-dlp"

    Copy-DirectoryContents $nodeDir $portableNodeDir

    Ensure-Directory (Join-Path $portableFfmpegDir "bin")
    foreach ($binary in @("ffmpeg.exe", "ffprobe.exe")) {
        $source = Join-Path $ffmpegDir "bin\$binary"
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Missing FFmpeg binary: $source"
        }
        Copy-Item -LiteralPath $source -Destination (Join-Path $portableFfmpegDir "bin\$binary") -Force
    }

    foreach ($docFile in @("LICENSE", "README.txt")) {
        $source = Join-Path $ffmpegDir $docFile
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $portableFfmpegDir $docFile) -Force
        }
    }

    Ensure-Directory $portableYtDlpDir
    $ytDlpExe = Join-Path $ytDlpDir "yt-dlp.exe"
    if (-not (Test-Path -LiteralPath $ytDlpExe)) {
        throw "Missing yt-dlp executable: $ytDlpExe"
    }
    Copy-Item -LiteralPath $ytDlpExe -Destination (Join-Path $portableYtDlpDir "yt-dlp.exe") -Force
}

function Copy-PortableRunnerScripts {
    if (-not (Test-Path -LiteralPath $runnerScriptsRoot)) {
        throw "runner-scripts folder not found: $runnerScriptsRoot"
    }

    $portableRunnerScriptsDir = Join-Path $stagingRoot "runner-scripts"
    Ensure-Directory $portableRunnerScriptsDir

    foreach ($item in @(
        "image",
        "lib",
        "steps",
        "main.js",
        "package.json",
        "package-lock.json",
        "post-via-postforme.js",
        "process-video.js",
        "update-job-status.js"
    )) {
        $source = Join-Path $runnerScriptsRoot $item
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Missing runner-scripts item: $source"
        }

        $destination = Join-Path $portableRunnerScriptsDir $item
        if ((Get-Item -LiteralPath $source) -is [System.IO.DirectoryInfo]) {
            Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
        } else {
            Copy-Item -LiteralPath $source -Destination $destination -Force
        }
    }

    Ensure-Directory (Join-Path $portableRunnerScriptsDir "output")
    "{}" | Set-Content -LiteralPath (Join-Path $portableRunnerScriptsDir "automation-config.json") -Encoding ASCII
}

Write-Step "Preparing tool directories"
Ensure-Directory $toolsDir
Ensure-Directory $OutputDir

if (-not $SkipDownloads) {
    Write-Step "Ensuring portable runtime dependencies"
    Install-PortableNode
    Install-PortableFfmpeg
    Install-YtDlp
}

Write-Step "Preparing staging folder"
if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
Ensure-Directory $stagingRoot

$itemsToCopy = @(
    "install-tailscale.ps1",
    "install-startup-task.ps1",
    "restart-local-runner.ps1",
    "run-background-supervisor.bat",
    "run-runner.bat",
    "runner.js",
    "server.js",
    "setup.bat",
    "supervisor.js",
    "update-manifest.json",
    "build-helpers.psm1"
)

foreach ($item in $itemsToCopy) {
    $source = Join-Path $runnerRoot $item
    if (-not (Test-Path -LiteralPath $source)) {
        continue
    }

    $destination = Join-Path $stagingRoot $item
    if ((Get-Item -LiteralPath $source) -is [System.IO.DirectoryInfo]) {
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    } else {
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

Write-Step "Copying portable runtime"
Copy-PortableRuntime

Write-Step "Copying runner pipeline"
Copy-PortableRunnerScripts

Write-Step "Writing clean portable defaults"
Write-PortableConfig
Write-PortableStateFiles
Write-OneClickLauncher

foreach ($folderName in @("downloads", "processed")) {
    $folderPath = Join-Path $stagingRoot $folderName
    Ensure-Directory $folderPath
}

Write-Step "Writing portable package instructions"
$readmePath = Join-Path $stagingRoot "README-OFFLINE.txt"
@"
LOCAL RUNNER PORTABLE PACKAGE

1. Extract this zip anywhere on a Windows PC.
2. Open the extracted folder.
3. Double-click Start-Portable-Runner.bat. It calls setup.bat for one-click startup.
4. setup.bat installs the background auto-start launcher and starts the local dashboard plus runner supervisor.
5. setup.bat uses the bundled Node.js, FFmpeg, ffprobe, and yt-dlp first.
6. config.txt is intentionally clean. Add the matching RUNNER_TOKEN and ACCESS_TOKEN, then rerun setup.bat.
7. runner-state.json and supervisor-state.json ship blank so stale machine state is not reused.
8. If you ever need a manual recycle, run restart-local-runner.ps1.

This package is designed to be copied to cloud storage and reused on another machine.
"@ | Set-Content -LiteralPath $readmePath -Encoding ASCII

Write-Step "Creating zip archive"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -Force

Write-Step "Portable package ready"
Write-Host "Zip: $zipPath" -ForegroundColor Green
