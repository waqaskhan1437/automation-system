/**
 * Stage 3 – Transcribe (WhisperX)
 *
 * Calls Python script that uses WhisperX to generate:
 *   - segments with word-level timestamps
 *   - JSON with text, start, end, confidence
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function getPythonScriptPath() {
  return path.resolve(__dirname, '..', 'python', 'transcribe.py');
}

async function transcribe(workDir, manifest) {
  const inputAudio = path.join(workDir, 'audio_mono.wav');
  const outputFile = path.join(workDir, 'transcription.json');
  const sourceLang = manifest.dubbing?.source_language || 'en';

  utils.logStep('TRANSCRIBE', `Input: ${inputAudio}  Language: ${sourceLang}`);

  if (!fs.existsSync(inputAudio)) {
    throw new Error('[TRANSCRIBE] Mono audio not found – did extract stage run?');
  }

  // Try WhisperX first, fallback to whisper, then generate placeholder
  let whisperAvailable = false;
  try {
    await utils.runProcess(utils.getPython(), [
      '-c', 'import whisperx; print("whisperx_ok")'
    ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'TRANSCRIBE' });
    whisperAvailable = true;
    console.log('[TRANSCRIBE] WhisperX detected');
  } catch {
    // Fallback: try whisper (base)
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import whisper; print("whisper_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'TRANSCRIBE' });
      whisperAvailable = true;
      console.log('[TRANSCRIBE] Whisper (base) detected – using instead of WhisperX');
    } catch {
      console.log('[TRANSCRIBE] Neither WhisperX nor whisper installed – generating placeholder transcription');
    }
  }

  if (whisperAvailable) {
    const pythonScript = getPythonScriptPath();
    await utils.runPython(pythonScript, [
      '--input', inputAudio,
      '--output', outputFile,
      '--language', sourceLang,
    ], { logLabel: 'TRANSCRIBE', timeoutMs: 600000 });
  } else {
    // Placeholder transcription with estimated duration
    const duration = utils.getVideoDuration(inputAudio) || 0;
    const placeholder = {
      engine: 'placeholder',
      language: sourceLang,
      segments: [
        {
          start: 0,
          end: duration,
          text: `[Transcription unavailable – install whisper or whisperx]`,
          words: [],
        }
      ],
      text: '[Transcription unavailable]',
    };
    utils.writeJson(outputFile, placeholder);
    console.log('[TRANSCRIBE] ⚠️ Placeholder transcription written');
  }

  const result = fs.existsSync(outputFile) ? utils.readJson(outputFile) : null;
  if (!result) throw new Error('[TRANSCRIBE] Failed to produce transcription');
  
  // Tag with fallback info if placeholder was used
  if (result.engine === 'placeholder') {
    result.fallback = true;
  }
  
  console.log(`[TRANSCRIBE] ✅ Done – ${result.segments?.length || 0} segments${result.fallback ? ' ⚠️ (fallback – WhisperX not installed)' : ''}`);
  return result;
}

module.exports = { transcribe };
