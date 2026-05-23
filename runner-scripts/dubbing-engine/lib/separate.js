/**
 * Stage 2 – Separate (Demucs vocal separation)
 *
 * Calls a Python script that uses Demucs to split:
 *   - vocals.wav
 *   - no_vocals.wav (drums + bass + other = background)
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function getPythonScriptPath() {
  return path.resolve(__dirname, '..', 'python', 'separate.py');
}

async function separate(workDir, manifest) {
  const inputStereo = path.join(workDir, 'audio_stereo.wav');
  const outputDir   = path.join(workDir, 'separated');

  utils.logStep('SEPARATE', `Input: ${inputStereo}`);

  if (!fs.existsSync(inputStereo)) {
    console.log('[SEPARATE] No stereo audio found – skipping vocal separation');
    return { skipped: true, reason: 'No audio track' };
  }

  // Check if Demucs is available by trying import
  let demucsAvailable = false;
  try {
    await utils.runProcess(utils.getPython(), [
      '-c', 'import demucs; print(demucs.__version__)'
    ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'SEPARATE' });
    demucsAvailable = true;
    console.log('[SEPARATE] Demucs detected – running separation…');
  } catch {
    console.log('[SEPARATE] Demucs not installed – will copy audio as-is');
  }

  utils.ensureDir(outputDir);

  if (demucsAvailable) {
    // Run Demucs
    const pythonScript = getPythonScriptPath();
    await utils.runPython(pythonScript, [
      '--input', inputStereo,
      '--output', outputDir,
    ], { logLabel: 'SEPARATE', timeoutMs: 3600000 });

    // Verify outputs – Demucs may use subdir like "htdemucs"
    const vocals    = path.join(outputDir, 'vocals.wav');
    const noVocals  = path.join(outputDir, 'no_vocals.wav');

    if (!fs.existsSync(vocals)) {
      const subDirs = fs.readdirSync(outputDir).filter(d => fs.statSync(path.join(outputDir, d)).isDirectory());
      for (const sub of subDirs) {
        const subVocals = path.join(outputDir, sub, 'vocals.wav');
        if (fs.existsSync(subVocals)) {
          utils.copyFile(subVocals, vocals);
        }
        const subNoVocals = path.join(outputDir, sub, 'no_vocals.wav');
        if (fs.existsSync(subNoVocals)) {
          utils.copyFile(subNoVocals, noVocals);
        }
        const subDrums = path.join(outputDir, sub, 'drums.wav');
        const subBass = path.join(outputDir, sub, 'bass.wav');
        const subOther = path.join(outputDir, sub, 'other.wav');
        if (!fs.existsSync(subNoVocals) && fs.existsSync(subDrums) && fs.existsSync(subBass) && fs.existsSync(subOther)) {
          const { execSync } = require('child_process');
          execSync(
            `${utils.FFMPEG} -y -i ${utils.quote(subDrums)} -i ${utils.quote(subBass)} -i ${utils.quote(subOther)} ` +
            `-filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=longest" -ac 2 ${utils.quote(noVocals)}`,
            { stdio: 'inherit', timeout: 300000 }
          );
        }
      }
    }
  } else {
    // Demucs not available – copy stereo as "vocals", create silent "no_vocals"
    utils.copyFile(inputStereo, path.join(outputDir, 'vocals.wav'));

    const duration = utils.getVideoDuration(inputStereo) || 0;
    try {
      const { execSync } = require('child_process');
      execSync(
        `${utils.FFMPEG} -y -f lavfi -t ${duration} -i anullsrc=r=44100:cl=stereo -acodec pcm_s16le ${utils.quote(path.join(outputDir, 'no_vocals.wav'))}`,
        { stdio: 'inherit', timeout: 120000 }
      );
    } catch {
      console.log('[SEPARATE] Could not create silent background audio');
    }
  }

  const result = {
    vocals_exist: fs.existsSync(path.join(outputDir, 'vocals.wav')),
    no_vocals_exist: fs.existsSync(path.join(outputDir, 'no_vocals.wav')),
    fallback: !demucsAvailable,
  };
  const flag = !demucsAvailable ? ' ⚠️ (fallback – Demucs not installed)' : '';
  console.log(`[SEPARATE] ✅ Done – Vocals: ${result.vocals_exist}, Background: ${result.no_vocals_exist}${flag}`);
  return result;
}

module.exports = { separate };
