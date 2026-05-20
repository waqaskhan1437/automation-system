/**
 * Stage 8 – Mix (Final audio mixing)
 *
 * Combines aligned cloned audio with the original video.
 *
 * Mix modes:
 *   - bed: Replace original audio with dubbed vocals + background
 *   - overlay: Dubbed audio overlaid on top of original
 *   - replace: Full replacement (no background)
 *
 * Produces final-*.mp4 in workDir/output/
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const utils = require('./utils');

async function mix(workDir, manifest) {
  const alignedManifest   = path.join(workDir, 'aligned_segments.json');
  const silentVideo       = path.join(workDir, 'video_silent.mp4');
  const separatedDir      = path.join(workDir, 'separated');
  const outputDir         = path.join(workDir, 'output');
  const finalVideo        = path.join(outputDir, 'final-dubbed.mp4');
  const dubbing = manifest.dubbing || {};
  const mixMode = dubbing.mix_mode || 'bed';
  const preserveBg = dubbing.preserve_background !== false;

  utils.logStep('MIX', `Mode: ${mixMode}  Preserve background: ${preserveBg}`);

  utils.ensureDir(outputDir);

  if (!fs.existsSync(silentVideo)) {
    throw new Error('[MIX] Silent video not found – did extract stage run?');
  }

  let alignedSegments = [];
  if (fs.existsSync(alignedManifest)) {
    const data = utils.readJson(alignedManifest);
    alignedSegments = (data.segments || []).filter(s => s.audio_file && fs.existsSync(s.audio_file));
  }

  if (alignedSegments.length === 0) {
    console.log('[MIX] No aligned audio segments – copying original video as-is');
    utils.copyFile(silentVideo, finalVideo);
    const duration = utils.getVideoDuration(silentVideo);
    const result = {
      final_video: finalVideo,
      duration,
      mix_mode: mixMode,
      segments_used: 0,
    };
    utils.writeJson(path.join(workDir, 'mix_result.json'), result);
    console.log(`[MIX] ⚠️ No dubbed audio – original silent video copied`);
    return result;
  }

  // Build audio concat filter from aligned segments
  const concatInputs = [];
  const segmentFiles = [];

  for (let i = 0; i < alignedSegments.length; i++) {
    const seg = alignedSegments[i];
    const segFile = seg.audio_file;
    if (!fs.existsSync(segFile)) continue;

    segmentFiles.push(segFile);
    concatInputs.push(`-i ${utils.quote(segFile)}`);
  }

  if (segmentFiles.length === 0) {
    throw new Error('[MIX] No valid audio files to mix');
  }

  // Build a concat filter to join all segments in order
  // Then mix with background if available
  const n = segmentFiles.length;

  if (n === 1) {
    // Single segment – just use it as audio track
    console.log('[MIX] Single segment – using as full audio track');
    execSync(
      `${utils.FFMPEG} -y -i ${utils.quote(silentVideo)} -i ${utils.quote(segmentFiles[0])} ` +
      `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 96k -shortest -movflags +faststart ${utils.quote(finalVideo)}`,
      { stdio: 'inherit', timeout: 300000 }
    );
  } else {
    // Multiple segments – concat them
    const filterGraph = `[0:a]${alignedSegments.map((_, i) => `[${i + 1}:a]`).join('')}concat=n=${n}:v=0:a=1[outa]`;

    if (preserveBg && fs.existsSync(path.join(separatedDir, 'no_vocals.wav'))) {
      // Mix with background music
      const bgAudio = path.join(separatedDir, 'no_vocals.wav');
      console.log(`[MIX] Mixing dubbed audio with background track`);

      execSync(
        `${utils.FFMPEG} -y -i ${utils.quote(silentVideo)} ${concatInputs.join(' ')} -i ${utils.quote(bgAudio)} ` +
        `-filter_complex ` +
        `"${alignedSegments.map((_, i) => `[${i + 1}:a]`).join('')}concat=n=${n}:v=0:a=1[dubbed]; ` +
        `[dubbed][${n + 1}:a]amix=inputs=2:duration=longest:dropout_transition=2[outa]" ` +
        `-map 0:v -map "[outa]" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 96k -shortest -movflags +faststart ${utils.quote(finalVideo)}`,
        { stdio: 'inherit', timeout: 300000 }
      );
    } else {
      // Just dubbed audio, no background
      console.log(`[MIX] Mixing ${n} dubbed segments without background`);

      execSync(
        `${utils.FFMPEG} -y -i ${utils.quote(silentVideo)} ${concatInputs.join(' ')} ` +
        `-filter_complex ` +
        `"${alignedSegments.map((_, i) => `[${i + 1}:a]`).join('')}concat=n=${n}:v=0:a=1[outa]" ` +
        `-map 0:v -map "[outa]" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 96k -shortest -movflags +faststart ${utils.quote(finalVideo)}`,
        { stdio: 'inherit', timeout: 300000 }
      );
    }
  }

  if (!fs.existsSync(finalVideo)) {
    throw new Error('[MIX] Final video was not created');
  }

  const duration = utils.getVideoDuration(finalVideo);
  const result = {
    final_video: finalVideo,
    duration,
    mix_mode: mixMode,
    segments_used: n,
    background_preserved: preserveBg && fs.existsSync(path.join(separatedDir, 'no_vocals.wav')),
  };
  utils.writeJson(path.join(workDir, 'mix_result.json'), result);

  const sizeMb = (fs.statSync(finalVideo).size / 1024 / 1024).toFixed(2);
  console.log(`[MIX] ✅ Done – ${n} segment(s) mixed → ${finalVideo} (${sizeMb} MB, ${(duration || 0).toFixed(1)}s)`);
  return result;
}

module.exports = { mix };
