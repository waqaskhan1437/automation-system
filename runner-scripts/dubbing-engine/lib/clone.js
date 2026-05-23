/**
 * Stage 6 – Clone (Voice synthesis)
 *
 * Generates target-language speech for each translated segment.
 * Supports:
 *   - voxcpm2: Voice Cloning Toolkit (VoxCPM2 / VoxCeleb)
 *   - xtts:    Coqui XTTS (voice cloning)
 *   - edge:    Microsoft Edge TTS (no cloning, but high quality)
 *
 * ⚡ Speed Benchmark: For voxcpm2, runs a 1-segment benchmark first.
 *   If > 30s/segment or estimated total > 5 min, auto-falls back to edge-tts.
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
  const voiceMode = dubbing.voice_mode || 'ultimate';
  const voiceStyle = dubbing.voice_style || '';
  const scriptMode = dubbing.script || '';
  const targetLang = dubbing.target_language || 'ur';

  // User-specified reference audio path (e.g. uploaded file or built-in sample)
  const userReferencePath = dubbing.reference_audio_path || '';

  utils.logStep('CLONE', `Voice engine: ${voiceEngine}  Mode: ${voiceMode}  Reference: ${voiceRefSeconds}s`);
  if (userReferencePath && fs.existsSync(userReferencePath)) {
    utils.logStep('CLONE', `User reference audio: ${userReferencePath}`);
  }

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

  // ── 1. Check voice engine availability ────────────────────────────────
  const engineAvailable = await checkEngineAvailability(voiceEngine);
  const pythonScript = getPythonScriptPath();
  const commonArgs = buildCommonArgs(translationFile, outputDir, outputManifest,
    voiceEngine, vocalsFile, userReferencePath, voiceRefSeconds, dubbing, voiceMode, voiceStyle, scriptMode);

  // ── 2. Run engine with pre-flight speed benchmark (for voxcpm2) ───────
  if (engineAvailable && voiceEngine === 'voxcpm2') {
    const benchmark = await runVoxCPM2Benchmark(translationFile, workDir, outputDir,
      vocalsFile, userReferencePath, voiceRefSeconds, dubbing, voiceMode, voiceStyle, scriptMode, segments);

    if (benchmark.tooSlow) {
      console.log(`[CLONE] ⚠️ VoxCPM2 benchmark: ${benchmark.perSegment.toFixed(1)}s/segment → est. ${benchmark.estimatedTotal.toFixed(0)}s total. TOO SLOW!`);
      console.log('[CLONE] ℹ️ Auto-switching to edge-tts for faster results.');
      console.log('[CLONE] 💡 Tip: Install CUDA PyTorch for GPU acceleration (pip install torch --index-url https://download.pytorch.org/whl/cu121)');
      await fallbackToEdgeTTS(segments, outputDir, outputManifest, targetLang);
    } else {
      console.log(`[CLONE] ✅ VoxCPM2 benchmark: ${benchmark.perSegment.toFixed(1)}s/segment → est. ${benchmark.estimatedTotal.toFixed(0)}s total. Proceeding.`);
      await utils.runPython(pythonScript, commonArgs, { logLabel: 'CLONE', timeoutMs: 1800000 });
    }
  } else if (engineAvailable && (voiceEngine === 'xtts' || voiceEngine === 'edge')) {
    // XTTS / edge — no benchmark needed, run directly
    await utils.runPython(pythonScript, commonArgs, { logLabel: 'CLONE', timeoutMs: 1800000 });
  }

  // ── 3. Handle failures / partial output ───────────────────────────────
  if (!fs.existsSync(outputManifest)) {
    const partialFiles = fs.readdirSync(outputDir).filter(f => f.startsWith('segment_') && f.endsWith('.wav'));
    if (partialFiles.length > 0) {
      console.log(`[CLONE] ⚠️ Engine produced ${partialFiles.length}/${segments.length} segments before failing. Using edge-tts for all segments.`);
    } else {
      console.log('[CLONE] ⚠️ Voice engine failed – using edge-tts fallback');
    }
    await fallbackToEdgeTTS(segments, outputDir, outputManifest, targetLang);
  }

  // ── 4. Read and return result ─────────────────────────────────────────
  const result = fs.existsSync(outputManifest) ? utils.readJson(outputManifest) : null;
  if (!result) throw new Error('[CLONE] Failed to produce cloned audio segments');

  // Tag as fallback if engine is a fallback variant
  if (result.engine === 'edge_tts_fallback' || result.engine === 'silent_fallback') {
    result.fallback = true;
  }

  const segCount = result.segments?.length || 0;
  const audioFiles = (result.segments || []).filter(s => s.audio_file).length;
  console.log(`[CLONE] ✅ Done – ${audioFiles}/${segCount} segments with audio (engine: ${result.engine || voiceEngine})${result.fallback ? ' ⚠️ (fallback)' : ''}`);
  return result;
}

/**
 * Check if a voice engine's Python package is importable.
 */
async function checkEngineAvailability(voiceEngine) {
  if (voiceEngine === 'edge') {
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import edge_tts; print("edge_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
      console.log('[CLONE] edge-tts detected');
      return true;
    } catch {
      console.log('[CLONE] edge-tts not installed');
      return false;
    }
  }

  if (voiceEngine === 'xtts') {
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'import TTS; print("xtts_ok")'
      ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
      console.log('[CLONE] Coqui XTTS detected');
      return true;
    } catch {
      console.log('[CLONE] Coqui XTTS not installed');
      return false;
    }
  }

  // voxcpm2
  try {
    await utils.runProcess(utils.getPython(), [
      '-c', 'from voxcpm import VoxCPM; print("voxcpm_ok")'
    ], { stdio: 'pipe', timeoutMs: 15000, logLabel: 'CLONE' });
    console.log('[CLONE] VoxCPM2 detected (voxcpm package)');
    return true;
  } catch {
    console.log('[CLONE] VoxCPM2 not installed – checking for PyTorch fallback');
  }

  // PyTorch available (for XTTS fallback via Python)
  try {
    await utils.runProcess(utils.getPython(), [
      '-c', 'import torch; print("torch_ok")'
    ], { stdio: 'pipe', timeoutMs: 10000, logLabel: 'CLONE' });
    console.log('[CLONE] PyTorch detected – will try XTTS fallback');
    return true;
  } catch {
    console.log('[CLONE] Neither VoxCPM2 nor PyTorch available');
    return false;
  }
}

/**
 * Build common CLI args for clone.py.
 */
function buildCommonArgs(translationFile, outputDir, outputManifest, voiceEngine,
                          vocalsFile, userReferencePath, voiceRefSeconds, dubbing,
                          voiceMode, voiceStyle, scriptMode) {
  return [
    '--input', translationFile,
    '--output-dir', outputDir,
    '--output-manifest', outputManifest,
    '--voice-engine', voiceEngine,
    '--reference', resolveReferenceAudio(vocalsFile, userReferencePath),
    '--ref-seconds', String(voiceRefSeconds),
    '--source-language', dubbing.source_language || 'en',
    '--target-language', dubbing.target_language || 'ur',
    '--voice-mode', voiceMode,
    '--voice-style', voiceStyle,
    '--script', scriptMode,
  ];
}

/**
 * Run one segment as a speed benchmark.
 * Creates a temporary translation file with just 1 segment so the benchmark
 * accurately measures per-segment speed, then cleans up.
 *
 * Returns { perSegment, estimatedTotal, tooSlow }.
 */
async function runVoxCPM2Benchmark(translationFile, workDir, outputDir,
                                    vocalsFile, userReferencePath, voiceRefSeconds,
                                    dubbing, voiceMode, voiceStyle, scriptMode, segments) {
  const result = { perSegment: 0, estimatedTotal: 0, tooSlow: false };
  if (segments.length === 0) return result;

  console.log('[CLONE] 🔬 Running VoxCPM2 speed benchmark (1 segment)...');

  // Create a temp translation file with ONLY the first segment
  const fullTranslation = utils.readJson(translationFile);
  const benchTranslation = {
    ...fullTranslation,
    segments: [segments[0]], // just 1 segment
  };
  const benchTranslationFile = path.join(workDir, '_benchmark_translation_.json');
  utils.writeJson(benchTranslationFile, benchTranslation);

  const benchManifest = path.join(workDir, '_benchmark_.json');
  const benchOutputDir = path.join(workDir, '_benchmark_output_');
  utils.ensureDir(benchOutputDir);

  const benchArgs = [
    '--input', benchTranslationFile,
    '--output-dir', benchOutputDir,
    '--output-manifest', benchManifest,
    '--voice-engine', 'voxcpm2',
    '--reference', resolveReferenceAudio(vocalsFile, userReferencePath),
    '--ref-seconds', String(voiceRefSeconds),
    '--source-language', dubbing.source_language || 'en',
    '--target-language', dubbing.target_language || 'ur',
    '--voice-mode', voiceMode,
    '--voice-style', voiceStyle,
    '--script', scriptMode,
  ];

  const benchStart = Date.now();
  try {
    await utils.runPython(getPythonScriptPath(), benchArgs, { logLabel: 'BENCH', timeoutMs: 300000 });
  } catch {
    // Benchmark itself timed out (>5 min for 1 segment) — definitely too slow
    console.log('[CLONE] ⚠️ VoxCPM2 benchmark timed out (>5 min for 1 segment) — CPU too slow');
    result.tooSlow = true;
    result.perSegment = 300;
    result.estimatedTotal = 300 * segments.length;
    // Cleanup
    cleanupBenchmark(workDir, benchOutputDir);
    return result;
  }

  const benchTime = (Date.now() - benchStart) / 1000;
  const estimatedTotal = benchTime * segments.length;

  // Clean up benchmark artifacts
  cleanupBenchmark(workDir, benchOutputDir);

  result.perSegment = benchTime;
  result.estimatedTotal = estimatedTotal;
  // Consider too slow if >30s/segment or estimated total >5 min
  result.tooSlow = benchTime > 30 || estimatedTotal > 300;
  return result;
}

/** Clean up benchmark temp files. */
function cleanupBenchmark(workDir, benchOutputDir) {
  try { fs.rmSync(path.join(workDir, '_benchmark_translation_.json'), { force: true }); } catch {}
  try { fs.rmSync(path.join(workDir, '_benchmark_.json'), { force: true }); } catch {}
  try { fs.rmSync(path.join(workDir, '_benchmark_output_'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(benchOutputDir, '_benchmark_test_.wav'), { force: true }); } catch {}
}

/**
 * Direct edge-tts fallback — fast, no GPU required, supports 35+ languages.
 */
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

/**
 * Resolve which reference audio to use for cloning.
 * Priority: user-specified path > separated vocals > none
 */
function resolveReferenceAudio(vocalsFile, userReferencePath) {
  // If user uploaded/selected a custom reference, use that
  if (userReferencePath && fs.existsSync(userReferencePath)) {
    console.log(`[CLONE] Using user reference audio: ${userReferencePath}`);
    return userReferencePath;
  }
  // Fall back to separated vocals from Demucs stage
  if (vocalsFile && fs.existsSync(vocalsFile)) {
    console.log(`[CLONE] Using separated vocals reference: ${vocalsFile}`);
    return vocalsFile;
  }
  // No reference available
  console.log('[CLONE] No reference audio available — using voice design / zero-shot mode');
  return '';
}

function getEdgeVoice(lang) {
  const voiceMap = {
    'ur': 'ur-PK-AsadNeural',
    'hi': 'hi-IN-MadhurNeural',
    'en': 'en-US-JennyNeural',
    'ar': 'ar-SA-HamedNeural',
    'bn': 'bn-BD-PradeepNeural',
    'tr': 'tr-TR-AhmetNeural',
    'es': 'es-ES-AlvaroNeural',
    'fr': 'fr-FR-DeniseNeural',
    'de': 'de-DE-KatjaNeural',
    'pt': 'pt-BR-AntonioNeural',
    'it': 'it-IT-DiegoNeural',
    'ru': 'ru-RU-SvetlanaNeural',
    'ja': 'ja-JP-KeitaNeural',
    'ko': 'ko-KR-SunHiNeural',
    'zh': 'zh-CN-XiaoxiaoNeural',
    'id': 'id-ID-ArdiNeural',
    'vi': 'vi-VN-NamMinhNeural',
    'th': 'th-TH-NiwatNeural',
    'nl': 'nl-NL-MaartenNeural',
    'pl': 'pl-PL-MarekNeural',
    'sv': 'sv-SE-MattiasNeural',
    'el': 'el-GR-NestorasNeural',
    'ro': 'ro-RO-EmilNeural',
    'hu': 'hu-HU-TamasNeural',
    'cs': 'cs-CZ-AntoninNeural',
    'uk': 'uk-UA-OstapNeural',
    'fi': 'fi-FI-HarriNeural',
    'da': 'da-DK-JeppeNeural',
    'ms': 'ms-MY-OsmanNeural',
    'no': 'nb-NO-FinnNeural',
    'sw': 'sw-KE-RafikiNeural',
    'tl': 'fil-PH-AngeloNeural',
    'my': 'my-MM-NilarNeural',
    'km': 'km-KH-PisethNeural',
    'lo': 'lo-LA-KeomanyNeural',
    'he': 'he-IL-AvriNeural',
  };
  return voiceMap[lang] || 'en-US-JennyNeural';
}

module.exports = { cloneStage };
