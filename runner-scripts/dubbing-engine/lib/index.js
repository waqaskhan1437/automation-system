/**
 * Dubbing Engine – Stage Orchestrator
 *
 * Runs all 8 stages sequentially:
 *   1. extract    – FFmpeg audio + frame extraction
 *   2. separate   – Demucs vocal separation
 *   3. transcribe – WhisperX transcription
 *   4. speakers   – pyannote speaker diarization (optional)
 *   5. translate  – LLM/NLLB translation
 *   6. clone      – Voice synthesis (VoxCPM2/XTTS/Edge TTS)
 *   7. align      – Timing/speed alignment
 *   8. mix        – Final audio mix
 */
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

async function runPipeline(manifest, options = {}) {
  const stages = manifest.dubbing?.stages || utils.DEFAULT_STAGES;
  const workDir = options.workDir || path.join(__dirname, '..', 'output', String(Date.now()));

  utils.ensureDir(workDir);

  const stageResults = {};
  const stageDurations = {};
  let ok = true;
  let lastError = null;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  DUBBING PIPELINE — ${manifest.name || 'Untitled'}`);
  console.log(`  Work dir: ${workDir}`);
  console.log(`  Stages: ${stages.join(' → ')}`);
  console.log(`${'='.repeat(60)}\n`);

  for (const stageName of stages) {
    if (!ok) {
      console.log(`\n[SCHEDULER] Skipping "${stageName}" due to previous failure`);
      stageResults[stageName] = { skipped: true, reason: 'Previous stage failed' };
      continue;
    }

    console.log(`\n${'▶'.repeat(50)}`);
    console.log(`  STAGE ${stages.indexOf(stageName) + 1}/${stages.length}: ${stageName}`);
    console.log(`${'▶'.repeat(50)}\n`);

    const startTime = Date.now();
    try {
      const stageModule = getStageModule(stageName);
      if (!stageModule) {
        throw new Error(`Unknown stage: ${stageName}`);
      }
      stageResults[stageName] = await stageModule(workDir, manifest);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      stageDurations[stageName] = elapsed;
      console.log(`\n✅ STAGE ${stageName} completed in ${elapsed}s\n`);
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      stageDurations[stageName] = elapsed;
      lastError = err.message || String(err);
      console.error(`\n❌ STAGE ${stageName} FAILED after ${elapsed}s: ${lastError}\n`);
      stageResults[stageName] = { error: lastError };
      ok = false;
    }
  }

  // Build final report
  const stageEntries = stages.map((name, i) => ({
    index: i + 1,
    stage: name,
    status: stageResults[name]?.error ? 'failed' : stageResults[name]?.skipped ? 'skipped' : 'completed',
    duration_seconds: stageDurations[name] || null,
    error: stageResults[name]?.error || null,
    fallback: stageResults[name]?.fallback === true || false,
  }));

  // Detect degraded mode — any stage that used a fallback or was skipped due to missing dependency
  const fallbackStages = stageEntries
    .filter(s => s.fallback)
    .map(s => s.stage);

  const report = {
    ok,
    degraded: fallbackStages.length > 0,
    fallback_stages: fallbackStages,
    created_at: new Date().toISOString(),
    name: manifest.name,
    source_mode: manifest.source_mode,
    target_language: manifest.dubbing?.target_language,
    voice_engine: manifest.dubbing?.voice_engine,
    work_dir: workDir,
    stages: stageEntries,
    final_video: stageResults.mix?.final_video || null,
    last_error: lastError,
  };

  if (report.degraded) {
    console.log(`\n⚠️  PIPELINE DEGRADED — ${fallbackStages.length} stage(s) used fallback: ${fallbackStages.join(', ')}`);
    console.log(`   Install the recommended packages to avoid degraded output.`);
  }

  return report;
}

function getStageModule(stageName) {
  const stages = {
    extract:    () => require('./extract').extract,
    separate:   () => require('./separate').separate,
    transcribe: () => require('./transcribe').transcribe,
    speakers:   () => require('./speakers').speakers,
    translate:  () => require('./translate').translateStage,
    clone:      () => require('./clone').cloneStage,
    align:      () => require('./align').align,
    mix:       () => require('./mix').mix,
  };

  const loader = stages[stageName];
  return loader ? loader() : null;
}

module.exports = { runPipeline, getStageModule };
