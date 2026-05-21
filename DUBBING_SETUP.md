# Dubbing Engine — Software Setup Guide

> **TL;DR** — The local-runner's `setup.bat` only installs **Node.js**, **FFmpeg**, and **yt-dlp** automatically. Everything else listed below is **optional but recommended** for real dubbing output. If a package is missing, the pipeline falls back to a placeholder for that stage — the job still finishes, but the output won't be properly translated/voiced.
>
> The dubbing engine auto-detects what is installed and uses it. You do not need to "wire it up" — just install the package and run the job.

---

## 0. What setup.bat already installs (no action needed)

| Software | Why | Auto-installed? |
|---|---|---|
| Node.js 20 LTS | Runs `cli.js` and all `lib/*.js` stages | ✅ Yes |
| FFmpeg (+ffprobe) | Audio/video extract, atempo align, final mux | ✅ Yes |
| yt-dlp | URL-mode source download (Stage 1) | ✅ Yes |

If `setup.bat` finishes successfully these three are guaranteed to be present.

---

## 1. Optional dubbing dependencies (install only what you need)

The pipeline has **8 stages**. Stages 1, 7, 8 use only FFmpeg, so they always work. Stages 2–6 need Python libraries. Install the ones you want; skip the ones you don't.

### 1.1 Python 3.10 / 3.11 / 3.12 (required base for everything below)

The pipeline auto-detects `python3`, `python`, or `py` on PATH, and also probes these locations:
- `C:\Python311\python.exe`, `C:\Python312\python.exe`, `C:\Python313\python.exe`
- `C:\Program Files\Python311\python.exe`, `C:\Program Files\Python312\python.exe`
- `%LOCALAPPDATA%\Programs\Python\Python311\python.exe`, `Python312\python.exe`

**Recommended install (PowerShell):**
```powershell
winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
# OR download the installer from https://www.python.org/downloads/windows/
# IMPORTANT: tick "Add python.exe to PATH" during install
```

Verify:
```powershell
python --version    # should print "Python 3.11.x" or similar
```

---

### 1.2 Stage 2 — Vocal separation (Demucs)

Separates the source audio into `vocals.wav` and `no_vocals.wav` (background music). Without it, the mix stage cannot preserve background music — the dubbed audio will be on a silent bed.

```powershell
pip install --user torch demucs
```

GPU users: install a CUDA torch build first from https://pytorch.org/get-started/locally/ — Demucs picks it up automatically. CPU also works (slower).

---

### 1.3 Stage 3 — Transcription (WhisperX, preferred)

Produces word-level timestamps. Without it the pipeline writes a single placeholder segment and you cannot get usable timing.

```powershell
pip install --user whisperx
# whisperx pulls torch, faster-whisper, pyannote.audio as deps
```

Alternative (lighter, no word-level timestamps):
```powershell
pip install --user openai-whisper
```

The pipeline tries `whisperx` first, then `whisper`, then placeholder.

---

### 1.4 Stage 4 — Speaker diarization (pyannote.audio, optional)

Identifies who spoke when. Skipping it produces single-speaker output (fine for most short videos).

```powershell
pip install --user pyannote.audio
```

**Also required:** a HuggingFace token with access to `pyannote/speaker-diarization-3.1`. Accept the model card at https://huggingface.co/pyannote/speaker-diarization-3.1, then:

```powershell
# Put this in local-runner/config.txt OR set as env var before launching the runner
setx HF_TOKEN "hf_xxxxxxxxxxxxxxxxxxxxxxx"
```

To skip diarization entirely, leave `diarization_enabled: false` on the job (default is true).

---

### 1.5 Stage 5 — Translation

Two paths — install whichever you prefer:

**Option A: NLLB (offline, free, big download ~2.5 GB the first time)**
```powershell
pip install --user transformers sentencepiece torch
```
Set the job's `translation_engine` to `nllb`.

**Option B: LLM (online, fast, costs API tokens)**
```powershell
# No pip install — just set one of these env vars:
setx OPENAI_API_KEY "sk-..."
# OR for local Ollama:
setx OLLAMA_HOST "http://localhost:11434"
```
Set the job's `translation_engine` to `llm` (default).

If neither is available the pipeline copies source text as "translation" — your output will still be in English, only re-voiced.

---

### 1.6 Stage 6 — Voice synthesis (pick ONE)

#### Edge TTS — easiest, free, no GPU, no voice cloning
```powershell
pip install --user edge-tts
```
Set the job's `voice_engine` to `edge`. Supported language voices are hard-coded in `lib/clone.js:168-187` (ur, hi, en, es, fr, ar, bn, tr, de, ja, ko, zh, ru, pt, it). **This is the recommended default for most users** — it works without a GPU and produces natural-sounding voices.

#### Coqui XTTS — voice cloning, 1.5 GB model, needs GPU for speed
```powershell
pip install --user TTS
```
Set the job's `voice_engine` to `xtts`. The pipeline passes the vocals track from Stage 2 as the speaker reference.

#### VoxCPM2 — best voice cloning quality, heaviest
```powershell
pip install --user voxcpm2 speechbrain
```
Set the job's `voice_engine` to `voxcpm2`. The pipeline uses `voice_reference_seconds` (default 18s) from the source vocals.

> **Note:** If you select `voxcpm2` or `xtts` and the library is missing, the pipeline automatically falls back to `edge-tts`. So `edge-tts` is the safety-net — installing only it is enough to get *some* dubbing on every job.

---

## 2. One-shot installer (optional convenience)

A helper script is provided at `local-runner/install-dubbing-deps.ps1` that installs Python (via winget) + the pip packages for the *minimal viable* dubbing setup (whisperx + demucs + edge-tts). It is **not** invoked by `setup.bat` — you must run it manually:

```powershell
cd local-runner
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-dubbing-deps.ps1
```

Add `-Full` to also install pyannote + transformers + TTS. Add `-DryRun` to see what it would do without installing.

---

## 3. Health check ("Dubbing Doctor")

After installing whichever subset you want, verify the pipeline can see them:

```powershell
cd runner-scripts\dubbing-engine
node doctor.js
```

You will get a table like:

```
DUBBING ENGINE — Dependency Doctor
──────────────────────────────────────────
  ffmpeg              [OK]     C:\...\ffmpeg.exe
  ffprobe             [OK]     C:\...\ffprobe.exe
  yt-dlp              [OK]     C:\...\yt-dlp.exe
  python              [OK]     python 3.11.5
  whisperx            [OK]     module importable
  whisper (fallback)  [OK]     module importable
  demucs              [MISS]   pip install --user demucs
  pyannote.audio      [MISS]   optional — diarization will be skipped
  HF_TOKEN            [MISS]   needed only if pyannote is installed
  transformers        [MISS]   pip install --user transformers   (NLLB)
  OPENAI_API_KEY      [MISS]   alternative to NLLB
  edge-tts            [OK]     module importable
  TTS (Coqui XTTS)    [MISS]   pip install --user TTS
  voxcpm2             [MISS]   pip install --user voxcpm2
──────────────────────────────────────────
SUMMARY: 6 OK / 8 MISS — pipeline will run with edge-tts fallback.
```

Stages that show `[OK]` will run the real engine; stages with `[MISS]` will use the placeholder/fallback path.

---

## 4. Quick recipe — "I just want the cheapest working dubbing"

```powershell
winget install -e --id Python.Python.3.11
# reopen PowerShell so PATH refreshes
pip install --user openai-whisper edge-tts
# (NLLB or OpenAI key for translation)
setx OPENAI_API_KEY "sk-..."
```

Then in the dubbing job:
- `translation_engine: llm`
- `voice_engine: edge`
- `diarization_enabled: false`

This skips the heavy Demucs + WhisperX + XTTS downloads and still produces a translated, voiced MP4.

---

## 5. Where files end up

```
runner-scripts/dubbing-engine/output/<timestamp>/
├── source_download.mp4         (Stage 1 — only in URL mode)
├── audio_mono.wav              (Stage 1)
├── audio_stereo.wav            (Stage 1)
├── video_silent.mp4            (Stage 1)
├── frames/frame_*.jpg          (Stage 1)
├── separated/vocals.wav        (Stage 2)
├── separated/no_vocals.wav     (Stage 2)
├── transcription.json          (Stage 3)
├── speakers.json               (Stage 4)
├── translation.json            (Stage 5)
├── cloned/segment_NNNN.wav     (Stage 6)
├── cloned_segments.json        (Stage 6)
├── aligned/aligned_NNNN.wav    (Stage 7)
├── aligned_segments.json       (Stage 7)
├── output/final-dubbed.mp4     (Stage 8 — the deliverable)
├── mix_result.json             (Stage 8)
└── dubbing-report.json         (full pipeline summary)
```

`output/latest/` always contains the most recent `dubbing-report.json` and `manifest.json` for the runner-status page to read.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Final MP4 has no audio at all | All voice engines missing | `pip install --user edge-tts` |
| Final MP4 is in English, not target language | Translation engine missing | Set `OPENAI_API_KEY`, or `pip install --user transformers` and set engine to `nllb` |
| Final MP4 has dubbed voice but no background music | Demucs missing | `pip install --user demucs torch` |
| Voice does not match the original speaker | Using edge-tts (no cloning) | Switch `voice_engine` to `xtts` or `voxcpm2` and install the library |
| All segments are one giant block | WhisperX missing → placeholder transcription | `pip install --user whisperx` |
| Job stuck on Stage 4 forever | pyannote downloading model first run | Wait, or set `diarization_enabled: false` |
| `[CLONE] edge-tts failed for segment N` | Network blocked or rate limit | Retry; edge-tts uses MS Edge's free service |
| Pipeline cannot find Python on Windows | Python not on PATH | Reinstall with "Add to PATH" checked, or put it under `C:\Python311\` |
