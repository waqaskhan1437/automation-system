/**
 * Main Orchestrator - Video processing pipeline with segment support
 */
const { fs, path, execSync } = require('./lib/core');
const crypto = require('crypto');
const { OUTPUT_DIR, CONFIG_PATH } = require('./lib/paths');

const download = require('./steps/download');
const processVideo = require('./steps/process');
const upload = require('./steps/upload');
const post = require('./steps/post');
const webhook = require('./steps/webhook');
const tracker = require('./steps/tracker');

const FAILURE_REPORT_PATH = path.join(OUTPUT_DIR, 'failure-report.json');
const ERROR_LOG_PATH = path.join(OUTPUT_DIR, 'error.log');

function writeFailureReport(payload) {
  try {
    fs.writeFileSync(FAILURE_REPORT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.error('[FAILURE-REPORT] Could not write report:', error.message);
  }
}

function clearFailureReport() {
  try {
    if (fs.existsSync(FAILURE_REPORT_PATH)) {
      fs.unlinkSync(FAILURE_REPORT_PATH);
    }
    if (fs.existsSync(ERROR_LOG_PATH)) {
      fs.unlinkSync(ERROR_LOG_PATH);
    }
  } catch {}
}

function appendErrorLog(message) {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.appendFileSync(ERROR_LOG_PATH, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (error) {
    console.error('[ERROR-LOG] Could not write error log:', error.message);
  }
}

function isBlockingDownloadFailure(error) {
  const message = String(error && (error.message || error) || '').toLowerCase();
  return /youtube authentication|cookies?|sign in|login|not a bot|confirm.*bot|bot check|private video|age.?restricted|members-only|google photos.*download|forbidden|unauthorized|http error 401|http error 403/.test(message);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid automation config at ${CONFIG_PATH}: ${error.message}`);
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config || {}, null, 2), 'utf8');
}

function normalizeCookieText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  return value.replace(/\r\n/g, '\n').trim();
}

function removeFileIfExists(filePath, label) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[COOKIES] Removed stale ${label} cookie file: ${filePath}`);
    }
  } catch (error) {
    console.log(`[COOKIES] Could not remove stale ${label} cookie file ${filePath}: ${error.message}`);
  }
}

function syncManagedCookieFile(targetFile, rawCookieText, label) {
  const normalized = normalizeCookieText(rawCookieText);
  if (normalized === null || !normalized) {
    removeFileIfExists(targetFile, label);
    return null;
  }
  const fingerprint = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  fs.writeFileSync(targetFile, `${normalized}
`, 'utf8');
  console.log(`[COOKIES] Materialized ${label} cookie file: ${targetFile} fingerprint=${fingerprint} bytes=${Buffer.byteLength(normalized, 'utf8')}`);
  return targetFile;
}

function materializeManagedCookieFiles(config) {
  const runnerRoot = __dirname;
  const youtubeFile = syncManagedCookieFile(path.join(runnerRoot, 'cookies.youtube.txt'), config?.youtube_cookies, 'YouTube');
  const googlePhotosFile = syncManagedCookieFile(path.join(runnerRoot, 'cookies.google-photos.txt'), config?.google_photos_cookies, 'Google Photos');
  if (youtubeFile) process.env.YOUTUBE_COOKIES_FILE = youtubeFile;
  else delete process.env.YOUTUBE_COOKIES_FILE;
  if (googlePhotosFile) process.env.GOOGLE_PHOTOS_COOKIES_FILE = googlePhotosFile;
  else delete process.env.GOOGLE_PHOTOS_COOKIES_FILE;
}

function resolveFinalOutputDir(config) {
  const configuredPath = typeof process.env.LOCAL_OUTPUT_DIR === 'string' && process.env.LOCAL_OUTPUT_DIR.trim()
    ? process.env.LOCAL_OUTPUT_DIR.trim()
    : (typeof config?.local_output_dir === 'string' ? config.local_output_dir.trim() : '');

  const targetDir = configuredPath ? path.resolve(configuredPath) : OUTPUT_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

function saveLocalFinalMedia(config, extensionSuffix = '.mp4', sourceFile = path.join(OUTPUT_DIR, 'processed-video.mp4')) {
  const finalOutputDir = resolveFinalOutputDir(config);
  const fileName = `final-${Date.now()}${extensionSuffix}`;
  const localPath = path.join(finalOutputDir, fileName);
  fs.copyFileSync(sourceFile, localPath);
  console.log(`[LOCAL] Saved locally: ${localPath}`);
  return localPath;
}

function getVideoDuration(inputFile) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`, { encoding: "utf8" });
    return parseFloat(output.trim()) || null;
  } catch {
    return null;
  }
}

function splitVideoIntoSegments(inputFile, segmentCount, segmentDuration) {
  const segments = [];
  const videoDuration = getVideoDuration(inputFile);

  if (!videoDuration) {
    console.log('[SPLIT] Could not determine duration, returning single segment');
    return [{ start: 0, end: null, index: 0 }];
  }

  const maxSegmentsFromDuration = Math.ceil(videoDuration / segmentDuration);
  const actualSegmentCount = Math.min(segmentCount, maxSegmentsFromDuration);
  const actualSegmentLength = videoDuration / actualSegmentCount;

  console.log(`[SPLIT] Video: ${videoDuration.toFixed(1)}s → ${actualSegmentCount} segments of ${actualSegmentLength.toFixed(1)}s`);

  for (let i = 0; i < actualSegmentCount; i++) {
    segments.push({
      start: i * actualSegmentLength,
      end: (i + 1) * actualSegmentLength,
      index: i,
      duration: actualSegmentLength
    });
  }

  return segments;
}

function parsePositiveInteger(value, fallback) {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function deriveSegmentInfo(config) {
  if (config && typeof config.segment_info === 'object' && config.segment_info) {
    return config.segment_info;
  }

  const shortsMode = String(config?.source_shorts_mode || 'single');
  const targetDuration = parsePositiveInteger(config?.short_duration, 60);

  if (shortsMode === 'fixed_count') {
    const segmentCount = parsePositiveInteger(config?.source_shorts_max_count, 1);
    return segmentCount > 1
      ? { mode: 'fixed_count', segmentCount, segmentDuration: targetDuration }
      : null;
  }

  if (shortsMode === 'duration_based') {
    const segmentCount = Math.min(Math.max(1, Math.ceil(targetDuration / 10)), 20);
    return { mode: 'duration_based', segmentCount, segmentDuration: targetDuration };
  }

  return null;
}

function getExplicitSegments(segmentInfo) {
  if (!segmentInfo || typeof segmentInfo !== 'object' || !Array.isArray(segmentInfo.segments)) {
    return [];
  }

  return segmentInfo.segments
    .map((segment, index) => {
      const start = Number(segment?.start);
      const end = Number(segment?.end);
      const duration = Number(segment?.duration);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }

      return {
        index: Number.isFinite(Number(segment?.index)) ? Number(segment.index) : index,
        start,
        end,
        duration: Number.isFinite(duration) && duration > 0 ? duration : end - start,
        hook: typeof segment?.hook === 'string' ? segment.hook.trim() : '',
        title: typeof segment?.title === 'string' ? segment.title.trim() : '',
        caption: typeof segment?.caption === 'string' ? segment.caption.trim() : '',
        hashtags: Array.isArray(segment?.hashtags)
          ? segment.hashtags.filter((item) => typeof item === 'string' && item.trim())
          : [],
      };
    })
    .filter(Boolean);
}

function normalizeSegmentForVideo(segment, videoDuration) {
  const start = Math.max(0, Number(segment.start) || 0);
  const rawEnd = Number(segment.end);
  const end = Number.isFinite(videoDuration)
    ? Math.min(rawEnd, videoDuration)
    : rawEnd;

  if (!Number.isFinite(end) || end <= start) {
    return null;
  }

  return {
    ...segment,
    start,
    end,
    duration: Math.max(1, end - start),
  };
}

function buildSegmentRuntimeConfig(baseConfig, segment) {
  const nextConfig = { ...baseConfig };
  const hook = typeof segment?.hook === 'string' ? segment.hook.trim() : '';
  const title = typeof segment?.title === 'string' ? segment.title.trim() : '';
  const caption = typeof segment?.caption === 'string' ? segment.caption.trim() : '';
  const hashtags = Array.isArray(segment?.hashtags)
    ? segment.hashtags.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const duration = Math.max(1, Math.round(Number(segment?.duration) || Number(baseConfig.short_duration) || 60));

  if (hook) {
    nextConfig.top_taglines = [hook];
  }
  if (title) {
    nextConfig.titles = [title];
  }
  if (caption) {
    nextConfig.descriptions = [caption];
  }
  if (hashtags.length > 0) {
    nextConfig.hashtags = hashtags;
  }

  nextConfig.short_duration = String(duration);
  nextConfig.prompt_active_segment = {
    index: Number(segment?.index) || 0,
    start_seconds: Number(segment?.start) || 0,
    end_seconds: Number(segment?.end) || 0,
    duration_seconds: duration,
    hook,
    title,
    caption,
    hashtags,
  };
  return nextConfig;
}

function readPostResult() {
  try {
    const postResultPath = path.join(OUTPUT_DIR, 'post_result.json');
    if (!fs.existsSync(postResultPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(postResultPath, 'utf8'));
  } catch {
    return null;
  }
}

function buildProcessedVideoRecord({ videoUrl, originalUrl, aspectRatio, segment = null, postResult = null, merged = false, segmentCount = null }) {
  const record = {
    video_url: videoUrl,
    original_url: originalUrl,
    aspect_ratio: aspectRatio || '9:16',
  };

  if (segment) {
    record.segment_index = Number(segment.index) || 0;
    record.segment_start = Number(segment.start) || 0;
    record.segment_end = Number(segment.end) || 0;
    record.title = segment.title || '';
    record.caption = segment.caption || '';
    record.hook = segment.hook || '';
    record.hashtags = Array.isArray(segment.hashtags) ? segment.hashtags : [];
  }

  if (merged) {
    record.merged = true;
    record.segment_count = Number(segmentCount) || 1;
  }

  if (postResult && typeof postResult === 'object') {
    if (postResult.live_post_id) {
      record.live_post_id = postResult.live_post_id;
    }
    if (postResult.draft_post_id) {
      record.draft_post_id = postResult.draft_post_id;
    }
    if (postResult.post_metadata) {
      record.post_metadata = postResult.post_metadata;
    }
  }

  return record;
}

function mergeVideoFiles(inputFiles, outputFile) {
  if (!Array.isArray(inputFiles) || inputFiles.length < 2) {
    return null;
  }

  const listFile = path.join(OUTPUT_DIR, `merge-list-${Date.now()}.txt`);
  fs.writeFileSync(
    listFile,
    inputFiles.map((file) => `file '${String(file).replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8'
  );

  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`, {
      stdio: 'inherit',
      timeout: 600000,
    });
  } catch {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -c:a aac -movflags +faststart "${outputFile}"`, {
      stdio: 'inherit',
      timeout: 600000,
    });
  } finally {
    try { fs.unlinkSync(listFile); } catch {}
  }

  return fs.existsSync(outputFile) ? outputFile : null;
}

function extractSegment(inputFile, outputFile, start, end) {
  const duration = end - start;
  console.log(`[SEGMENT] Extracting: ${start.toFixed(1)}s → ${end.toFixed(1)}s (${duration.toFixed(1)}s)`);

  let cmd = `ffmpeg -y -ss ${start} -i "${inputFile}" -t ${duration} -c copy "${outputFile}"`;
  try {
    execSync(cmd, { stdio: "inherit", timeout: 60000 });
  } catch {
    cmd = `ffmpeg -y -ss ${start} -i "${inputFile}" -t ${duration} -c copy -avoid_negative_ts make_zero "${outputFile}"`;
    execSync(cmd, { stdio: "inherit", timeout: 60000 });
  }

  if (fs.existsSync(outputFile)) {
    const stats = fs.statSync(outputFile);
    console.log(`[SEGMENT] Created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    throw new Error(`Segment file not created: ${outputFile}`);
  }
}

function processSegmentDirect(segmentFile, duration, aspectRatio, config, segmentIndex) {
  const outputFile = path.join(OUTPUT_DIR, 'processed-video.mp4');
  console.log(`[SEGMENT-PROCESS] Running processor for segment ${segmentIndex + 1} (${duration}s @ ${aspectRatio})...`);

  execSync('node process-video.js', {
    cwd: __dirname,
    stdio: 'inherit',
    timeout: 600000,
    env: {
      ...process.env,
      INPUT_FILE_PATH: segmentFile,
      OUTPUT_FILE_PATH: outputFile,
      TEMP_FILE_PATH: path.join(OUTPUT_DIR, `segment-temp-${segmentIndex}.mp4`),
      SPEED_FILE_PATH: path.join(OUTPUT_DIR, `segment-speed-${segmentIndex}.mp4`),
      OUTPUT_DIR,
    }
  });

  if (!fs.existsSync(outputFile)) {
    throw new Error('Processed file not created');
  }

  const stats = fs.statSync(outputFile);
  console.log(`[SEGMENT-PROCESS] Created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

async function main() {
  console.log('[MAIN] Starting...');
  const config = loadConfig();
  materializeManagedCookieFiles(config);
  writeConfig(config);
  clearFailureReport();

  console.log('[MAIN] source_shorts_mode:', config.source_shorts_mode);
  console.log('[MAIN] segment_info:', JSON.stringify(config.segment_info));
  console.log('[MAIN] video_urls:', config.video_urls?.length);

  const videos = config.video_urls || [];
  const perRun = parseInt(config.videos_per_run || '1', 10);
  const segmentInfo = deriveSegmentInfo(config);
  const explicitSegments = getExplicitSegments(segmentInfo);

  console.log(`[MAIN] URLs: ${videos.length} | Per run: ${perRun}`);
  if (segmentInfo) {
    const segmentCount = Number(segmentInfo.segmentCount)
      || (Array.isArray(segmentInfo.segments) ? segmentInfo.segments.length : 0);
    console.log(`[MAIN] SEGMENT MODE: ${segmentInfo.mode} (${segmentCount} segments)`);
  }

  if (videos.length === 0) {
    console.log('[MAIN] No URLs');
    await webhook.final(0, 0, false, null, []);
    globalThis.process.exit(0);
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const toProcess = videos.slice(0, perRun);
  let successCount = 0;
  let lastUrl = null;
  let lastPostResult = null;
  const allProcessedVideos = [];
  const failures = [];

  for (let i = 0; i < toProcess.length; i++) {
    const url = toProcess[i];
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[VIDEO ${i + 1}/${toProcess.length}] ${url}`);
    console.log('='.repeat(50));

    try {
      await download(url);

      if (explicitSegments.length > 0 || (segmentInfo && segmentInfo.segmentCount > 1)) {
        const inputFile = path.join(OUTPUT_DIR, 'input-video.mp4');
        const videoDuration = getVideoDuration(inputFile);
        const segments = explicitSegments.length > 0
          ? explicitSegments
              .map((segment) => normalizeSegmentForVideo(segment, videoDuration))
              .filter(Boolean)
          : splitVideoIntoSegments(inputFile, segmentInfo.segmentCount, segmentInfo.segmentDuration);
        const segmentOutputFiles = [];
        const shouldMergeSegments = segmentInfo && segmentInfo.mergeSegments === true && segments.length > 1;

        console.log(`[VIDEO ${i + 1}] Splitting into ${segments.length} segments`);

        for (const seg of segments) {
          console.log(`\n${'-'.repeat(40)}`);
          console.log(`[SEGMENT ${seg.index + 1}/${segments.length}] ${seg.start.toFixed(1)}s → ${seg.end.toFixed(1)}s`);
          console.log('-'.repeat(40));

          const segOutputFile = path.join(OUTPUT_DIR, `segment-${i}-${seg.index}.mp4`);
          extractSegment(inputFile, segOutputFile, seg.start, seg.end);

          const segmentConfig = buildSegmentRuntimeConfig(config, seg);
          writeConfig(segmentConfig);

          const duration = Math.max(1, Math.round(Number(seg.duration) || parseInt(segmentConfig.short_duration || "60", 10) || 60));
          const aspectRatio = segmentConfig.aspect_ratio || "9:16";
          processSegmentDirect(segOutputFile, duration, aspectRatio, segmentConfig, seg.index);
          const processedSegmentFile = path.join(OUTPUT_DIR, `processed-segment-${i}-${seg.index}.mp4`);
          fs.copyFileSync(path.join(OUTPUT_DIR, 'processed-video.mp4'), processedSegmentFile);
          segmentOutputFiles.push(processedSegmentFile);

          if (shouldMergeSegments) {
            continue;
          }

          let uploadUrl = null;
          if (config.skip_upload === true) {
            const localPath = saveLocalFinalMedia(segmentConfig, `-seg${seg.index}.mp4`, processedSegmentFile);
            lastUrl = localPath;
            allProcessedVideos.push(buildProcessedVideoRecord({
              videoUrl: localPath,
              originalUrl: url,
              aspectRatio,
              segment: seg,
            }));
            successCount++;
          } else {
            uploadUrl = await upload(processedSegmentFile);
          }

          if (uploadUrl) {
            writeConfig(segmentConfig);
            await post(uploadUrl);
            const postResult = readPostResult();
            if (postResult) {
              lastPostResult = postResult;
            }

            lastUrl = uploadUrl;
            const processedVideoRecord = buildProcessedVideoRecord({
              videoUrl: uploadUrl,
              originalUrl: url,
              aspectRatio,
              segment: seg,
              postResult,
            });
            allProcessedVideos.push(processedVideoRecord);

            await tracker.markVideoProcessed(url);
            await tracker.sendProgressUpdate(processedVideoRecord);
            successCount++;
            console.log(`[SEGMENT ${seg.index + 1}] DONE`);
          }
        }

        if (shouldMergeSegments) {
          const mergeInputFiles = segmentOutputFiles.filter((filePath) => typeof filePath === 'string' && fs.existsSync(filePath));
          if (mergeInputFiles.length <= 1) {
            throw new Error('Merge mode requested but processed segment files were not available');
          }

          const mergedFile = path.join(OUTPUT_DIR, `merged-${Date.now()}.mp4`);
          const builtMergedFile = mergeVideoFiles(mergeInputFiles, mergedFile);
          if (!builtMergedFile) {
            throw new Error('Merged video file could not be created');
          }

          let mergedUrl = null;
          if (config.skip_upload === true) {
            mergedUrl = saveLocalFinalMedia(config, '-merged.mp4', builtMergedFile);
          } else {
            writeConfig(config);
            mergedUrl = await upload(builtMergedFile);
            await post(mergedUrl);
            const mergedPostResult = readPostResult();
            if (mergedPostResult) {
              lastPostResult = mergedPostResult;
            }
          }

          if (mergedUrl) {
            lastUrl = mergedUrl;
            const mergedRecord = buildProcessedVideoRecord({
              videoUrl: mergedUrl,
              originalUrl: url,
              aspectRatio: config.aspect_ratio || '9:16',
              postResult: lastPostResult,
              merged: true,
              segmentCount: segments.length,
            });
            allProcessedVideos.push(mergedRecord);
            await tracker.markVideoProcessed(url);
            await tracker.sendProgressUpdate(mergedRecord);
            successCount++;
          }
        }

        writeConfig(config);
        console.log(`[VIDEO ${i + 1}] All ${segments.length} segments processed`);
      } else {
        writeConfig(config);
        await processVideo();
        
        let uploadUrl = null;
        if (config.skip_upload === true) {
          const localPath = saveLocalFinalMedia(config);
          lastUrl = localPath;
          allProcessedVideos.push({ video_url: localPath, original_url: url });
        } else {
          uploadUrl = await upload();
        }

        if (uploadUrl) {
          await post(uploadUrl);
          const postResult = readPostResult();
          if (postResult) {
            lastPostResult = postResult;
          }

          lastUrl = uploadUrl;
          const processedVideoRecord = buildProcessedVideoRecord({
            videoUrl: uploadUrl,
            originalUrl: url,
            aspectRatio: config.aspect_ratio || '9:16',
            postResult,
          });
          allProcessedVideos.push(processedVideoRecord);

          await tracker.markVideoProcessed(url);
          await tracker.sendProgressUpdate(processedVideoRecord);
          successCount++;
          console.log(`[VIDEO ${i + 1}] DONE`);
        } else if (config.skip_upload) {
          successCount++;
        }
      }
    } catch (e) {
      console.error(`[VIDEO ${i + 1}] FAILED:`, e.message);
      appendErrorLog(`[VIDEO ${i + 1}/${toProcess.length}] ${url} FAILED: ${e.message}`);
      failures.push({
        source_url: url,
        error: e.message,
        failed_at: new Date().toISOString(),
      });
      if (isBlockingDownloadFailure(e)) {
        appendErrorLog(`[FAIL-FAST] Blocking auth/download failure detected; stopping remaining source downloads for this job.`);
        break;
      }
    }
  }

  console.log(`\n[SUMMARY] ${successCount} shorts processed`);
  if (successCount === 0 && failures.length > 0) {
    writeFailureReport({
      ok: false,
      type: 'video_pipeline_failed',
      failures,
      last_error: failures[failures.length - 1]?.error || 'Unknown pipeline error',
    });
  }
  writeConfig(config);
  await webhook.final(successCount, successCount, successCount > 0, lastUrl, allProcessedVideos, lastPostResult);
  console.log(`\n[DONE] ${successCount} shorts from ${toProcess.length} source videos`);
  globalThis.process.exit(successCount > 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('[MAIN] FATAL:', e.message);
  appendErrorLog(`[FATAL] ${e.message}`);
  writeFailureReport({
    ok: false,
    type: 'fatal',
    last_error: e.message || 'Unknown fatal error',
    failed_at: new Date().toISOString(),
  });
  await webhook.final(0, 0, false, null, []);
  globalThis.process.exit(1);
});
