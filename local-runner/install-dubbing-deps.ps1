<#
.SYNOPSIS
    Optional installer for the heavy dubbing-engine dependencies.

.DESCRIPTION
    setup.bat (the standard runner installer) only provisions Node, FFmpeg, and yt-dlp.
    Run THIS script when you also want to run the dubbing pipeline with real models
    instead of placeholder fallbacks.

    What it does, in order:
      1. Ensures Python 3.11 is installed (via winget if missing).
      2. Installs the "minimal viable" pip packages:
            - openai-whisper       (Stage 3 transcribe)
            - edge-tts             (Stage 6 voice synth fallback — most reliable)
      3. With -Full, ALSO installs the heavy / optional packages:
            - whisperx             (Stage 3 — word-level timestamps)
            - demucs torch         (Stage 2 — vocal separation)
            - pyannote.audio       (Stage 4 — speaker diarization)
            - transformers sentencepiece  (Stage 5 — NLLB translation)
            - TTS                  (Stage 6 — Coqui XTTS voice cloning)
            - voxcpm2 speechbrain  (Stage 6 — VoxCPM2 voice cloning)

.PARAMETER Full
    Install every optional package (1–2 GB of downloads, GPU recommended).

.PARAMETER DryRun
    Print what would be installed; do not actually install.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-dubbing-deps.ps1
.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-dubbing-deps.ps1 -Full
#>
param(
    [switch]$Full,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Section($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Test-PythonAvailable {
    foreach ($cmd in @("python", "python3", "py")) {
        try {
            $v = & $cmd --version 2>&1
            if ($LASTEXITCODE -eq 0 -and "$v" -match "Python\s+3\.(10|11|12|13)") {
                return @{ Ok = $true; Cmd = $cmd; Version = "$v".Trim() }
            }
        } catch {}
    }
    return @{ Ok = $false }
}

function Invoke-PipInstall {
    param([string]$Python, [string[]]$Packages)
    foreach ($pkg in $Packages) {
        if ($DryRun) {
            Write-Host "  [DRYRUN] $Python -m pip install --user --upgrade $pkg" -ForegroundColor Yellow
            continue
        }
        Write-Host "  pip install $pkg ..." -ForegroundColor Gray
        & $Python -m pip install --user --upgrade --disable-pip-version-check $pkg
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "  pip install $pkg returned exit code $LASTEXITCODE — continuing"
        }
    }
}

# 1. Python
Write-Section "Step 1/3 — Python 3.11 base"
$py = Test-PythonAvailable
if ($py.Ok) {
    Write-Host "  [OK] Python found: $($py.Version)  (cmd: $($py.Cmd))" -ForegroundColor Green
} else {
    Write-Host "  [MISS] No Python 3.10+ on PATH." -ForegroundColor Yellow
    if ($DryRun) {
        Write-Host "  [DRYRUN] winget install -e --id Python.Python.3.11 --silent --accept-source-agreements --accept-package-agreements" -ForegroundColor Yellow
    } else {
        $hasWinget = $false
        try { & winget --version | Out-Null; $hasWinget = ($LASTEXITCODE -eq 0) } catch {}
        if ($hasWinget) {
            Write-Host "  Installing Python 3.11 via winget..." -ForegroundColor Gray
            & winget install -e --id Python.Python.3.11 --silent --accept-source-agreements --accept-package-agreements
            $env:PATH = "$env:LOCALAPPDATA\Programs\Python\Python311;$env:LOCALAPPDATA\Programs\Python\Python311\Scripts;$env:PATH"
        } else {
            Write-Warning "  winget not available. Install Python 3.11 manually from https://www.python.org/downloads/windows/ then rerun this script."
            exit 1
        }
        $py = Test-PythonAvailable
        if (-not $py.Ok) {
            Write-Warning "  Python still not detected. Open a NEW PowerShell window so PATH refreshes, then rerun."
            exit 1
        }
        Write-Host "  [OK] Python now available: $($py.Version)" -ForegroundColor Green
    }
}

# 2. Minimal-viable packages
Write-Section "Step 2/3 — Minimal-viable packages (transcribe + voice)"
$minimal = @(
    "openai-whisper",
    "edge-tts"
)
Invoke-PipInstall -Python $py.Cmd -Packages $minimal

# 3. Full set
if ($Full) {
    Write-Section "Step 3/3 — Full optional set (heavy downloads)"
    Write-Host "  This will pull ~1.5–3 GB of model code + weights on first use." -ForegroundColor Yellow
    $heavy = @(
        "torch",
        "demucs",
        "whisperx",
        "pyannote.audio",
        "transformers",
        "sentencepiece",
        "TTS",
        "voxcpm2",
        "speechbrain"
    )
    Invoke-PipInstall -Python $py.Cmd -Packages $heavy
} else {
    Write-Section "Step 3/3 — Skipping heavy optional packages"
    Write-Host "  Rerun with -Full to install demucs, whisperx, pyannote, transformers, TTS, voxcpm2." -ForegroundColor Gray
}

Write-Section "Done"
Write-Host "  Next step: run the doctor to verify what the pipeline sees:" -ForegroundColor Green
$doctorPath = Resolve-Path -ErrorAction SilentlyContinue (Join-Path $PSScriptRoot "..\runner-scripts\dubbing-engine\doctor.js")
if ($doctorPath) {
    Write-Host "      node `"$doctorPath`"" -ForegroundColor Gray
} else {
    Write-Host "      cd runner-scripts\dubbing-engine && node doctor.js" -ForegroundColor Gray
}
Write-Host ""
