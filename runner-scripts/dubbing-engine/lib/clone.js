/**
 * Stage 6 – Clone (Voice synthesis)
 *
 * Generates target-language speech for each translated segment.
 * Supports:
 *   - voxcpm2: Voice Cloning Toolkit (VoxCPM2 / VoxCeleb)
 *   - xtts:    Coqui XTTS (voice cloning)
 *   - edge:    Microsoft Edge TTS (no cloning, but high quality)
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function getPythonScriptPath() {
  return path.resolve(__dirname, '..', 'python', 'clone.py');
}

async function cloneStage(workDir, manifest) {
  const translationFile = path.join(workDir, 'translation.json');
  const vocalsFile      = path.join(workDir, 'separated', 'vocals.wav');
  const outputDir       = path.join(workDir, 'cloned');
  const outputManifest  = path.join(workDir, 'cloned_segments.json');
  const dubbing = manifest.dubbing || {};
  const voiceEngine = dubbing.voice_engine || 'voxcpm2';
  const voiceRefSeconds = dubbing.voice_reference_seconds || 18;

  utils.logStep('CLONE', `Voice engine: ${voiceEngine}  Reference: ${voiceRefSeconds}s`);

  if (!fs.existsSync(translationFile)) {
    throw new Error('[CLONE] Translation not found – did translate stage run?');
  }

  const translation = utils.readJson(translationFile);
  const segments = (translation.segments || []).filter(s => s.translated_text && s.translated_text.trim());

  if (segments.length === 0) {
    console.log('[CLONE] No translated segments to synthesize – writing empty result');
    utils.ensureDir(outputDir);
    utils.writeJson(outputManifest, { engine: voiceEngine, segments: [] });
    return { engine: voiceEngine, segment_count: 0 };
  }

  utils.ensureDir(outputDir);

  // Check voice engine availability
  let engineAvailable = false;
  if (voiceEngine === 'edge') {
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import edge_tts; print("edge_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
      engineAvailable = true;
      console.log('[CLONE] edge-tts detected');
    } catch {
      console.log('[CLONE] edge-tts not installed');
    }
  } else if (voiceEngine === 'xtts') {
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import TTS; print("xtts_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
      engineAvailable = true;
      console.log('[CLONE] Coqui XTTS detected');
    } catch {
      console.log('[CLONE] Coqui XTTS not installed');
    }
  } else {
    // voxcpm2 (VoxCeleb-based voice cloning)
    let hasVoxcpm2 = false;
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import voxcpm2; print("voxcpm2_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
      hasVoxcpm2 = true;
      console.log('[CLONE] VoxCPM2 detected');
    } catch {
      console.log('[CLONE] VoxCPM2 not installed – checking for PyTorch fallback');
    }

    if (hasVoxcpm2) {
      engineAvailable = true;
    } else {
      // Even without VoxCPM2, check if PyTorch is available for other models
      try {
        await utils.runProcess(utils.getPython(), [
          '-c', 'import torch; print("torch_ok")'
        ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
        engineAvailable = true;
        console.log('[CLONE] PyTorch detected – will let Python script try available models');
      } catch {
        console.log('[CLONE] Neither VoxCPM2 nor PyTorch available');
      }
    }
  }

  if (engineAvailable) {
    const pythonScript = getPythonScriptPath();
    await utils.runPython(pythonScript, [
      '--input', translationFile,
      '--output-dir', outputDir,
      '--output-manifest', outputManifest,
      '--voice-engine', voiceEngine,
      '--reference', (voiceEngine !== 'edge' && fs.existsSync(vocalsFile)) ? vocalsFile : '',
      '--ref-seconds', String(voiceRefSeconds),
      '--source-language', dubbing.source_language || 'en',
      '--target-language', dubbing.target_language || 'ur',
    ], { logLabel: 'CLONE', timeoutMs: 600000 });
  }

  // If no engine available or Python script didn't produce output, fallback to direct edge-tts
  if (!engineAvailable || !fs.existsSync(outputManifest)) {
    console.log('[CLONE] ⚠️ Voice engine unavailable – using direct edge-tts fallback');
    await fallbackToEdgeTTS(segments, outputDir, outputManifest, dubbing.target_language || 'ur');
  }

  const result = fs.existsSync(outputManifest) ? utils.readJson(outputManifest) : null;
  if (!result) throw new Error('[CLONE] Failed to produce cloned audio segments');

  // Tag as fallback if engine is a fallback variant
  if (result.engine === 'edge_tts_fallback' || result.engine === 'silent_fallback') {
    result.fallback = true;
  }

  const segCount = result.segments?.length || 0;
  const audioFiles = (result.segments || []).filter(s => s.audio_file).length;
  console.log(`[CLONE] ✅ Done – ${audioFiles}/${segCount} segments with audio (engine: ${result.engine || voiceEngine})${result.fallback ? ' ⚠️ (fallback – ' + result.engine + ')' : ''}`);
  return result;
}

async function fallbackToEdgeTTS(segments, outputDir, outputManifest, targetLang) {
  utils.ensureDir(outputDir);
  const edgeVoice = getEdgeVoice(targetLang);
  const clonedSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segFile = path.join(outputDir, `segment_${String(i).padStart(4, '0')}.wav`);
    const text = seg.translated_text;
    if (!text) {
      clonedSegments.push({ index: i, start: seg.start, end: seg.end, original_text: seg.original_text, translated_text: '', audio_file: null });
      continue;
    }

    console.log(`[CLONE] edge-tts segment ${i}: '${text.substring(0, 50)}...'`);
    try {
      await utils.runProcess(utils.getPython(), [
        '-m', 'edge_tts',
        '--voice', edgeVoice,
        '--text', text,
        '--write-media', segFile,
      ], { logLabel: 'CLONE', timeoutMs: 60000 });
    } catch {
      console.log(`[CLONE] edge-tts failed for segment ${i} – using silent audio`);
      const { execSync } = require('child_process');
      try {
        execSync(
          `${utils.FFMPEG} -y -f lavfi -i anullsrc=r=24000:cl=mono -t 1 ${utils.quote(segFile)}`,
          { stdio: 'ignore', timeout: 30000 }
        );
      } catch {}
    }

    clonedSegments.push({
      index: i, start: seg.start, end: seg.end,
      original_text: seg.original_text, translated_text: text,
      audio_file: fs.existsSync(segFile) ? segFile : null,
    });
  }

  utils.writeJson(outputManifest, { engine: 'edge_tts_fallback', segments: clonedSegments });
}

function getEdgeVoice(lang) {
  const voiceMap = {
    'ur': 'ur-PK-AsadNeural',
    'hi': 'hi-IN-MadhurNeural',
    'en': 'en-US-JennyNeural',
    'es': 'es-ES-AlvaroNeural',
    'fr': 'fr-FR-DeniseNeural',
    'ar': 'ar-SA-HamedNeural',
    'bn': 'bn-BD-PradeepNeural',
    'tr': 'tr-TR-AhmetNeural',
    'de': 'de-DE-KatjaNeural',
    'ja': 'ja-JP-KeitaNeural',
    'ko': 'ko-KR-SunHiNeural',
    'zh': 'zh-CN-XiaoxiaoNeural',
    'ru': 'ru-RU-SvetlanaNeural',
    'pt': 'pt-BR-AntonioNeural',
    'it': 'it-IT-DiegoNeural',
  };
  return voiceMap[lang] || 'en-US-JennyNeural';
}

module.exports = { cloneStage };
