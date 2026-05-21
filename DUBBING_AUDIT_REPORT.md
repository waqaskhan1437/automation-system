# Dubbing Feature — Complete Audit Report

**Date:** 2026-05-20
**Scope:** Full audit of the dubbing automation feature, local-runner setup, and software dependency strategy.

---

## 1. Executive Summary

| Layer | Status | Notes |
|---|---|---|
| Frontend UI (`/dubbing`) | ✅ Implemented | 559-line Next.js page exists |
| Worker API (Cloudflare) | ✅ Implemented | `"dubbing"` accepted as automation type |
| Local-runner job dispatch | ✅ Implemented | `runDubbingRunnerScriptsJob()` in `local-runner/runner.js:1147` |
| Manifest builder | ✅ Implemented | `buildDubbingManifest()` validates target lang, voice engine, max_tempo |
| Pipeline CLI | ✅ Implemented | `runner-scripts/dubbing-engine/cli.js` (self-test, dry-run, resume, stages) |
| 8 pipeline stages (JS) | ✅ Implemented | extract / separate / transcribe / speakers / translate / clone / align / mix |
| 5 Python workers | ✅ Implemented | separate.py, transcribe.py, speakers.py, translate.py, clone.py |
| Graceful fallbacks | ✅ Implemented | Every stage probes `import X` and falls back to placeholder / edge-tts |
| **Auto-install of heavy deps** | ❌ **Not implemented** | `setup.bat` installs only Node/FFmpeg/yt-dlp |
| Python runtime install | ❌ **Not implemented** | Setup never installs Python; pipeline only *detects* it |
| Bundled Python venv | ❌ Not present | No `tools/python` directory |
| Diagnostic / health-check CLI | ⚠️ Partial | `cli.js --self-test` only validates manifest, not engines |

**Bottom line:** The dubbing feature is ~85% implemented end-to-end. The remaining 15% is **environment provisioning** — Python and the ML libraries (WhisperX, Demucs, edge-tts/VoxCPM2/XTTS) are *expected to exist* but never installed by setup. The pipeline detects what is present and uses it; what is missing degrades into placeholders (identity-translation, silent audio, etc.) so the run "succeeds" but produces a non-dubbed output.

---

## 2. What is already working

### 2.1 Frontend → Worker → Runner plumbing
- `frontend/src/app/dubbing/page.tsx` — full UI for creating a dubbing automation.
- `worker/src/routes/automations.ts:177` — accepts `type: "dubbing"`.
- `local-runner/runner.js:1147` — when a job's `workflow === "dubbing"`, dispatch goes to the dubbing pipeline instead of the regular video pipeline.
- `local-runner/runner.js:1043-1083` — builds a normalized manifest from job config: source mode/value, target language (ur/hi), translation_engine (llm/nllb), voice_engine (voxcpm2/xtts/edge), max_tempo (1.05–1.35), diarization, mix mode.

### 2.2 8-stage pipeline (already coded)

| # | Stage | File | What it does | Hard dep | Fallback |
|---|---|---|---|---|---|
| 1 | extract | `lib/extract.js` | yt-dlp download (URL mode) + ffmpeg extract: mono 16k WAV, stereo WAV, silent video, 0.5fps key-frames | ffmpeg, yt-dlp | None — required |
| 2 | separate | `lib/separate.js` + `python/separate.py` | Demucs `--two-stems vocals` | Python+demucs | Copies stereo as "vocals", silent "no_vocals" |
| 3 | transcribe | `lib/transcribe.js` + `python/transcribe.py` | WhisperX (or whisper) word-level timestamps | Python+whisperx | Placeholder segment spanning full duration |
| 4 | speakers | `lib/speakers.js` + `python/speakers.py` | pyannote diarization | Python+pyannote+HF token | Single-speaker placeholder |
| 5 | translate | `lib/translate.js` + `python/translate.py` | NLLB (transformers) or LLM (OpenAI/Ollama) | transformers OR `OPENAI_API_KEY`/`OLLAMA_HOST` | Identity copy (no translation) |
| 6 | clone | `lib/clone.js` + `python/clone.py` | VoxCPM2 / XTTS / edge-tts per segment | Python + selected engine | Direct edge-tts fallback baked in (`fallbackToEdgeTTS`) |
| 7 | align | `lib/align.js` | ffmpeg atempo to fit each cloned segment into original timing window, chained for >2x | ffmpeg only | None needed |
| 8 | mix | `lib/mix.js` | ffmpeg concat aligned audio + optional `no_vocals.wav` background, mux with silent video | ffmpeg only | If no aligned audio, copies silent video as final |

### 2.3 Tool auto-detection (already in code)
- `lib/utils.js:9-29` — `resolveTool()` checks `local-runner/tools/ffmpeg/bin/`, then `runner-scripts/tools/ffmpeg/bin/`, then PATH (skipping `WindowsApps`).
- `lib/utils.js:42-64` — `resolvePython()` probes `python3`/`python`/`py` then common Windows install paths (`C:\Python311..313`, `LOCALAPPDATA\Programs\Python\...`).
- Each stage file probes its Python lib via `python -c "import X"` before invoking the heavy script.

**Translation: the system already does "use-if-present, fall back gracefully" auto-detect.** What is missing is an opt-in *installer* for the heavy software.

---

## 3. What is missing / partial

### 3.1 setup.bat installs only the light triad
`local-runner/setup.bat` provisions:
1. Node.js (LTS, portable fallback)
2. FFmpeg (winget or portable)
3. yt-dlp (winget / pip / portable)

It does **not** install:
- Python
- pip packages: `whisperx`, `demucs`, `edge-tts`, `pyannote.audio`, `transformers`, `torch`, `TTS` (XTTS), `voxcpm2`
- HuggingFace token for pyannote (`HF_TOKEN`)

Consequence: a fresh runner runs the pipeline but every stage downgrades to placeholder. The final MP4 contains the original silent video with placeholder edge-tts narration *only if* edge-tts happens to be installed; otherwise it is the source video unchanged.

### 3.2 No single "dubbing doctor" command
`cli.js --self-test` only validates the sample manifest JSON; it does not probe whether `whisperx`/`demucs`/`edge-tts` are importable. There is no one-shot CLI that prints a green/red table per engine.

### 3.3 Frontend does not surface engine availability
The `/dubbing` UI lets the user pick `voxcpm2 / xtts / edge`, but the runner has no health endpoint the UI can call to grey-out unavailable engines.

### 3.4 Pipeline outputs a "successful" report on full degradation
If every Python stage falls back to placeholder, `dubbing-report.json` still has `ok: true` because each stage writes its placeholder JSON. The report should set a `degraded: true` flag and list which stages used placeholders. (Minor enhancement — not blocking.)

---

## 4. Recommended Path Forward

You asked for two behaviours which the system **already partially supports**:

1. **If heavy software is already installed → use it automatically.** ✅ Already true.
2. **If not installed → tell the user via an MD file how to install it.** ⚠️ Need to add — covered by the new `DUBBING_SETUP.md` (sibling of this file).

Additional small additions that close the loop:

- A `runner-scripts/dubbing-engine/doctor.js` that prints a status table for each dependency. *(Added in this audit pass.)*
- An optional `install-dubbing-deps.ps1` that, when the user explicitly runs it, sets up Python + the pip packages without forcing anyone to. *(Added in this audit pass.)*
- A `dubbing/doctor` route the frontend can poll. *(Not added — out of scope.)*

---

## 5. Files Inspected

```
runner-scripts/dubbing-engine/cli.js                 (230 lines)
runner-scripts/dubbing-engine/lib/index.js           (105 lines)
runner-scripts/dubbing-engine/lib/extract.js         (123 lines)
runner-scripts/dubbing-engine/lib/separate.js        (101 lines)
runner-scripts/dubbing-engine/lib/transcribe.js      ( 81 lines)
runner-scripts/dubbing-engine/lib/speakers.js        ( 69 lines)
runner-scripts/dubbing-engine/lib/translate.js       (101 lines)
runner-scripts/dubbing-engine/lib/clone.js           (189 lines)
runner-scripts/dubbing-engine/lib/align.js           (103 lines)
runner-scripts/dubbing-engine/lib/mix.js             (136 lines)
runner-scripts/dubbing-engine/lib/utils.js           (195 lines)
runner-scripts/dubbing-engine/python/separate.py     (115 lines)
runner-scripts/dubbing-engine/python/transcribe.py   (171 lines)
runner-scripts/dubbing-engine/python/speakers.py     (103 lines)
runner-scripts/dubbing-engine/python/translate.py    (210 lines)
runner-scripts/dubbing-engine/python/clone.py        (308 lines)
local-runner/setup.bat                               (264 lines)
local-runner/bootstrap.ps1                           (328 lines)
local-runner/runner.js                               (dubbing block lines 1022-1742)
worker/src/routes/automations.ts                     (type validation line 177)
frontend/src/app/dubbing/page.tsx                    (559 lines, UI)
```

---

## 6. New Files Added by This Audit

1. `DUBBING_AUDIT_REPORT.md` (this file)
2. `DUBBING_SETUP.md` — manual install steps for heavy software
3. `runner-scripts/dubbing-engine/doctor.js` — `node doctor.js` prints engine availability table
4. `local-runner/install-dubbing-deps.ps1` — optional one-shot installer (Python + pip packages)
