/**
 * Stage 5 – Translate
 *
 * Translates transcribed segments from source_language to target_language.
 * Supports:
 *   - LLM mode: Uses a lightweight local LLM or remote API
 *   - NLLB mode: Uses Meta's NLLB model via transformers
 * Falls back to placeholder if neither is available.
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function getPythonScriptPath() {
  return path.resolve(__dirname, '..', 'python', 'translate.py');
}

async function translateStage(workDir, manifest) {
  const transcriptionFile = path.join(workDir, 'transcription.json');
  const outputFile         = path.join(workDir, 'translation.json');
  const dubbing = manifest.dubbing || {};
  const sourceLang = dubbing.source_language || 'en';
  const targetLang = dubbing.target_language || 'ur';
  const engine = dubbing.translation_engine || 'llm';

  utils.logStep('TRANSLATE', `Source: ${sourceLang} → Target: ${targetLang}  Engine: ${engine}`);

  if (!fs.existsSync(transcriptionFile)) {
    throw new Error('[TRANSLATE] Transcription not found – did transcribe stage run?');
  }

  const transcription = utils.readJson(transcriptionFile);
  const segments = transcription.segments || [];
  const fullText = segments.map(s => s.text).filter(Boolean).join(' ');

  if (!fullText.trim()) {
    console.log('[TRANSLATE] No text to translate – writing empty result');
    const empty = { engine, source_language: sourceLang, target_language: targetLang, segments: [], text: '' };
    utils.writeJson(outputFile, empty);
    return empty;
  }

  let translationEngineAvailable = false;

  if (engine === 'nllb') {
    try {
      await utils.runProcess(utils.getPython(), [
        '-c', 'from transformers import AutoModelForSeq2SeqLM, AutoTokenizer; print("nllb_ok")'
      ], { stdio: 'pipe', timeoutMs: 15000, logLabel: 'TRANSLATE' });
      translationEngineAvailable = true;
      console.log('[TRANSLATE] NLLB (transformers) detected');
    } catch {
      console.log('[TRANSLATE] NLLB/transformers not available');
    }
  } else {
    // LLM mode – try calling OpenAI-compatible API or Ollama
    console.log('[TRANSLATE] LLM translation engine selected');
    translationEngineAvailable = !!(process.env.OPENAI_API_KEY || process.env.OLLAMA_HOST);
  }

  if (translationEngineAvailable) {
    const pythonScript = getPythonScriptPath();
    await utils.runPython(pythonScript, [
      '--input', transcriptionFile,
      '--output', outputFile,
      '--source-lang', sourceLang,
      '--target-lang', targetLang,
      '--engine', engine,
    ], { logLabel: 'TRANSLATE', timeoutMs: 600000 });
  } else {
    // Placeholder: copy source text as "translation" (identity)
    console.log('[TRANSLATE] ⚠️ Translation engine unavailable – copying source text as placeholder');
    const orderedSegments = segments.map((seg, i) => ({
      index: i,
      start: seg.start,
      end: seg.end,
      original_text: seg.text || '',
      translated_text: seg.text || '',
      speaker: seg.speaker || 'SPEAKER_00',
    }));
    const result = {
      engine: 'identity_placeholder',
      source_language: sourceLang,
      target_language: targetLang,
      segments: orderedSegments,
      text: fullText,
      note: `Translation engine (${engine}) not available – source text used as-is`,
    };
    utils.writeJson(outputFile, result);
    console.log(`[TRANSLATE] ⚠️ ${orderedSegments.length} segments copied as placeholder`);
  }

  const result = fs.existsSync(outputFile) ? utils.readJson(outputFile) : null;
  if (!result) throw new Error('[TRANSLATE] Failed to produce translation');

  // Mark as fallback if identity placeholder was used
  if (result.engine === 'identity_placeholder') {
    result.fallback = true;
  }

  const segCount = result.segments?.length || 0;
  console.log(`[TRANSLATE] ✅ Done – ${segCount} segment(s) translated${result.fallback ? ' ⚠️ (fallback – translation engine unavailable)' : ''}`);
  return result;
}

module.exports = { translateStage };
