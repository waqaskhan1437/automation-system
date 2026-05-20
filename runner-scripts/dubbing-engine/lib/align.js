/**
 * Stage 7 – Align (Timing alignment)
 *
 * Stretches/speeds each cloned audio segment to match the original
 * segment timing using FFmpeg's atempo filter.
 *
 * Also applies optional speed limits (max_tempo) and produces:
 *   - aligned_segments.json  (with updated start/end times)
 *   - aligned/ directory     (time-corrected WAV files)
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const utils = require('./utils');

async function align(workDir, manifest) {
  const clonedManifest = path.join(workDir, 'cloned_segments.json');
  const alignedDir     = path.join(workDir, 'aligned');
  const outputManifest = path.join(workDir, 'aligned_segments.json');
  const maxTempo = manifest.dubbing?.max_tempo || 1.2;

  utils.logStep('ALIGN', `Max tempo: ${maxTempo}`);

  if (!fs.existsSync(clonedManifest)) {
    throw new Error('[ALIGN] Cloned segments not found – did clone stage run?');
  }

  const clonedData = utils.readJson(clonedManifest);
  const segments = (clonedData.segments || []).filter(s => s.audio_file && fs.existsSync(s.audio_file));

  if (segments.length === 0) {
    console.log('[ALIGN] No cloned audio to align – writing empty result');
    utils.ensureDir(alignedDir);
    utils.writeJson(outputManifest, { segments: [] });
    return { segment_count: 0 };
  }

  utils.ensureDir(alignedDir);
  const alignedSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const originalDuration = (seg.end || 0) - (seg.start || 0);
    if (originalDuration <= 0) {
      console.log(`[ALIGN] Segment ${i}: invalid duration, skipping`);
      continue;
    }

    const segFile = seg.audio_file;
    const alignedFile = path.join(alignedDir, `aligned_${String(i).padStart(4, '0')}.wav`);

    // Get actual duration of cloned audio
    const clonedDuration = utils.getVideoDuration(segFile) || originalDuration;

    // Calculate required speed factor
    let speedFactor = clonedDuration / originalDuration;
    speedFactor = Math.max(0.5, Math.min(maxTempo, speedFactor));

    if (Math.abs(speedFactor - 1.0) > 0.05) {
      // Apply atempo
      console.log(`[ALIGN] Segment ${i}: ${clonedDuration.toFixed(2)}s → ${originalDuration.toFixed(2)}s (${speedFactor.toFixed(3)}x)`);

      // Chain atempo if needed (max 2.0 per filter)
      let atempoFilter = '';
      let remaining = speedFactor;
      while (remaining > 2.0) {
        atempoFilter += 'atempo=2.0,';
        remaining /= 2.0;
      }
      while (remaining < 0.5) {
        atempoFilter += 'atempo=0.5,';
        remaining /= 0.5;
      }
      atempoFilter += `atempo=${Math.min(2.0, Math.max(0.5, remaining)).toFixed(4)}`;

      execSync(
        `${utils.FFMPEG} -y -i ${utils.quote(segFile)} -filter:a "${atempoFilter}" -acodec pcm_s16le -ar 24000 -ac 1 ${utils.quote(alignedFile)}`,
        { stdio: 'inherit', timeout: 120000 }
      );
    } else {
      // Close enough – just copy
      console.log(`[ALIGN] Segment ${i}: speed within tolerance (${speedFactor.toFixed(3)}x) – copying as-is`);
      utils.copyFile(segFile, alignedFile);
    }

    alignedSegments.push({
      index: i,
      start: seg.start,
      end: seg.end,
      original_text: seg.original_text,
      translated_text: seg.translated_text,
      audio_file: alignedFile,
      speed_factor: speedFactor,
    });
  }

  const result = { segments: alignedSegments };
  utils.writeJson(outputManifest, result);
  console.log(`[ALIGN] ✅ Done – ${alignedSegments.length} segment(s) aligned`);
  return result;
}

module.exports = { align };
