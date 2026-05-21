/**
 * Stage 4 – Speakers (pyannote speaker diarization)
 *
 * Calls Python script to identify who spoke when.
 * Optional stage – if pyannote is not installed or config says disabled, skip.
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function getPythonScriptPath() {
  return path.resolve(__dirname, '..', 'python', 'speakers.py');
}

async function speakers(workDir, manifest) {
  const inputAudio = path.join(workDir, 'audio_mono.wav');
  const outputFile = path.join(workDir, 'speakers.json');
  const diarizeEnabled = manifest.dubbing?.diarization_enabled !== false;

  utils.logStep('SPEAKERS', `Enabled: ${diarizeEnabled}`);

  if (!diarizeEnabled) {
    console.log('[SPEAKERS] Diarization disabled in config – skipping');
    const placeholder = { skipped: true, speakers: [{ label: 'SPEAKER_00', segments: [] }] };
    utils.writeJson(outputFile, placeholder);
    return placeholder;
  }

  if (!fs.existsSync(inputAudio)) {
    throw new Error('[SPEAKERS] Mono audio not found – did extract stage run?');
  }

  let pyannoteAvailable = false;
  try {
    await utils.runProcess(utils.getPython(), [
      '-c', 'import pyannote.audio; print("pyannote_ok")'
    ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'SPEAKERS' });
    pyannoteAvailable = true;
    console.log('[SPEAKERS] pyannote.audio detected');
  } catch {
    console.log('[SPEAKERS] pyannote.audio not installed – skipping diarization');
  }

  if (pyannoteAvailable) {
    const pythonScript = getPythonScriptPath();
    await utils.runPython(pythonScript, [
      '--input', inputAudio,
      '--output', outputFile,
    ], { logLabel: 'SPEAKERS', timeoutMs: 300000 });
  } else {
    const placeholder = {
      skipped: true,
      reason: 'pyannote.audio not installed',
      speakers: [{ label: 'SPEAKER_00', segments: [{ start: 0, end: utils.getVideoDuration(inputAudio) || 0 }] }],
    };
    utils.writeJson(outputFile, placeholder);
    console.log('[SPEAKERS] ⚠️ Placeholder speaker data written');
  }

  const result = fs.existsSync(outputFile) ? utils.readJson(outputFile) : null;
  if (result && !result.skipped) {
    console.log(`[SPEAKERS] ✅ Done – ${result.speakers?.length || 0} speakers identified`);
  } else {
    // Mark as fallback if it was skipped due to missing pyannote (not user-disabled)
    if (result && diarizeEnabled && result.skipped) {
      result.fallback = true;
    }
    console.log(`[SPEAKERS] ⏭️ Skipped (pyannote not available or disabled)${result?.fallback ? ' ⚠️ (fallback)' : ''}`);
  }
  return result;
}

module.exports = { speakers };
