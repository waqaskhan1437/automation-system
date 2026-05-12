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
const { generateThumbnail, isThumbnailEnabled } = require('./thumbnail');
const { attachIntroSafe } = require('./intro');
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


async function generateAndUploadThumbnail(config, sourceVideoFile, processedVideoFile, uploadFn = upload) {
  if (!isThumbnailEnabled(config || {})) {
    return null;
  }

  try {
    const preferredSource = config?.thumbnail_source === 'processed' ? processedVideoFile : sourceVideoFile;
    const fallbackSource = preferredSource && fs.existsSync(preferredSource)
      ? preferredSource
      : (processedVideoFile && fs.existsSync(processedVideoFile) ? processedVideoFile : sourceVideoFile);
    if (!fallbackSource || !fs.existsSync(fallbackSource)) {
      console.warn('[THUMBNAIL] Skipped - source video file missing');
      return null;
    }

    const thumbnailFile = path.join(OUTPUT_DIR, `thumbnail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    const metadata = generateThumbnail(fallbackSource, thumbnailFile, config || {});
    if (!metadata || !metadata.thumbnail_file || !fs.existsSync(metadata.thumbnail_file)) {
      return null;
    }

    if (config?.skip_upload === true) {
      const localPath = saveLocalFinalMedia(config, '-thumbnail.jpg', metadata.thumbnail_file);
      return { ...metadata, thumbnail_url: localPath, upload_mode: 'local' };
    }

    const thumbnailUrl = await uploadFn(metadata.thumbnail_file);
    if (!thumbnailUrl) {
      return { ...metadata, thumbnail_url: null, upload_error: 'Thumbnail upload returned empty URL' };
    }

    return { ...metadata, thumbnail_url: thumbnailUrl, upload_mode: 'remote' };
  } catch (error) {
    console.warn('[THUMBNAIL] Non-blocking failure:', error.message);
    appendErrorLog(`[THUMBNAIL] Non-blocking failure: ${error.message}`);
    return null;
  }
}


function boolish(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function getIntroConfigSummary(config = {}) {
  const keys = Object.keys(config || {}).filter((key) => key.startsWith('intro_') || key === 'intro_urls').sort();
  const urlKeys = keys.filter((key) => {
    if (key === 'intro_urls') return config.intro_urls && typeof config.intro_urls === 'object' && Object.keys(config.intro_urls).length > 0;
    return typeof config[key] === 'string' && config[key].trim();
  });
  return {
    intro_enabled: config.intro_enabled,
    intro_disabled: config.intro_disabled,
    intro_required: config.intro_required,
    intro_duration_limit: config.intro_duration_limit,
    intro_keys: keys,
    intro_url_keys_with_values: urlKeys,
  };
}

function copyIntroOutputToStableArtifacts(sourceFile, originalProcessedFile, label = 'video') {
  if (!sourceFile || !fs.existsSync(sourceFile)) return;
  try {
    const stableFinal = path.join(OUTPUT_DIR, 'final-video-with-intro.mp4');
    fs.copyFileSync(sourceFile, stableFinal);
    console.log(`[INTRO] Stable final artifact for ${label}: ${stableFinal}`);
  } catch (error) {
    console.warn(`[INTRO] Could not write stable final artifact: ${error.message}`);
  }

  // Important: many dashboards/artifacts preview runner-scripts/output/processed-video.mp4.
  // Keep that file in sync with the exact final upload file after intro is attached,
  // so users never see the no-intro intermediate file by mistake.
  try {
    if (originalProcessedFile && fs.existsSync(originalProcessedFile) && path.resolve(sourceFile) !== path.resolve(originalProcessedFile)) {
      fs.copyFileSync(sourceFile, originalProcessedFile);
      console.log(`[INTRO] Synced ${path.basename(originalProcessedFile)} with intro-applied final video for ${label}`);
    }
  } catch (error) {
    console.warn(`[INTRO] Could not sync processed artifact: ${error.message}`);
  }
}

async function attachIntroToProcessedVideo(config, processedFile, label = 'video') {
  console.log(`[INTRO] Config summary for ${label}: ${JSON.stringify(getIntroConfigSummary(config || {}))}`);
  const requestedOutput = path.join(OUTPUT_DIR, `final-with-intro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  const introResult = await attachIntroSafe(config || {}, processedFile, requestedOutput);
  if (introResult && introResult.intro_applied && introResult.video_file && fs.existsSync(introResult.video_file)) {
    console.log(`[INTRO] Applied to ${label}: ${introResult.video_file}`);
    copyIntroOutputToStableArtifacts(introResult.video_file, processedFile, label);
    return introResult.video_file;
  }
  if (introResult && introResult.reason) {
    console.log(`[INTRO] Skipped for ${label}: ${introResult.reason}`);
  }
  if (introResult && introResult.error) {
    console.log(`[INTRO] Failed for ${label}: ${introResult.error}`);
  }
  if (boolish(config?.intro_required)) {
    throw new Error(`Intro was required but not applied: ${introResult?.reason || introResult?.error || 'unknown reason'}`);
  }
  return processedFile;
}

function getVideoDuration(inputFile) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`, { encoding: "utf8" });
    return parseFloat(output.trim()) || null;
  } catch {
    return null;
  }
}

function hasAudioTrack(inputFile) {
  try {
    const output = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${inputFile}"`, { encoding: 'utf8' });
    return String(output || '').toLowerCase().includes('audio');
  } catch {
    return false;
  }
}

function normalizeAspectRatioForRunner(value) {
  const raw = String(value || '9:16').trim().toLowerCase().replace(/\s+/g, '');
  const aliases = {
    vertical: '9:16', short: '9:16', shorts: '9:16', reels: '9:16', tiktok: '9:16', '9_16': '9:16',
    'vertical-fit': '9:16-fit', vertical_nocrop: '9:16-fit', 'vertical-no-crop': '9:16-fit',
    'short-fit': '9:16-fit', short_nocrop: '9:16-fit', 'short-no-crop': '9:16-fit',
    'shorts-fit': '9:16-fit', shorts_nocrop: '9:16-fit', 'shorts-no-crop': '9:16-fit',
    'nocrop-short-vertical': '9:16-fit', 'no-crop-short-vertical': '9:16-fit', '9:16-nocrop': '9:16-fit', '9_16-fit': '9:16-fit',
    square: '1:1', '1_1': '1:1', 'square-fit': '1:1-fit', square_nocrop: '1:1-fit', '1_1-fit': '1:1-fit',
    landscape: '16:9', horizontal: '16:9', wide: '16:9', '16_9': '16:9', 'landscape-fit': '16:9-fit', landscape_nocrop: '16:9-fit', '16_9-fit': '16:9-fit',
    portrait: '4:5', '4_5': '4:5', 'portrait-fit': '4:5-fit', portrait_nocrop: '4:5-fit', '4_5-fit': '4:5-fit',
    original: 'original'
  };
  return aliases[raw] || raw || '9:16';
}

function getOutputDimensionsForConfig(config = {}) {
  const outputResolutionMode = String(config.output_resolution_mode || 'auto_by_aspect').trim();
  const resolution = String(config.output_resolution || '').trim().match(/^(\d{3,5})x(\d{3,5})$/i);
  if (resolution && (outputResolutionMode === 'custom' || config.lock_output_resolution === true || config.force_output_resolution === true)) {
    return { width: parseInt(resolution[1], 10), height: parseInt(resolution[2], 10) };
  }
  const aspect = normalizeAspectRatioForRunner(config.aspect_ratio || config.video_format || config.output_aspect_ratio || '9:16').replace('-fit', '');
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  if (aspect === '4:5') return { width: 1080, height: 1350 };
  if (aspect === '21:9') return { width: 1920, height: 823 };
  return { width: 1080, height: 1920 };
}

function isCoverFrameEnabled(config = {}) {
  if (config.social_cover_frame_enabled === false || String(config.social_cover_frame_enabled).toLowerCase() === 'false') return false;
  if (config.thumbnail_as_first_frame === false || String(config.thumbnail_as_first_frame).toLowerCase() === 'false') return false;
  // Default ON because YouTube Shorts/Facebook Reels commonly use a video frame,
  // not the external thumbnail_url, for the visible thumbnail.
  return config.thumbnail_enabled !== false;
}

function ensureAudioForConcat(inputFile, outputFile) {
  if (hasAudioTrack(inputFile)) return inputFile;
  console.log('[COVER] Final video has no audio; adding silent audio for concat');
  execSync(`ffmpeg -y -i "${inputFile}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -shortest -c:v copy -c:a aac -movflags +faststart "${outputFile}"`, {
    stdio: 'inherit',
    timeout: 300000,
  });
  return outputFile;
}

function prependThumbnailCoverFrameSafe(config = {}, videoFile, thumbnailInfo = null, label = 'video') {
  try {
    if (!isCoverFrameEnabled(config)) {
      console.log(`[COVER] Skipped for ${label}: disabled`);
      return videoFile;
    }
    const thumbnailFile = thumbnailInfo?.thumbnail_file;
    if (!thumbnailFile || !fs.existsSync(thumbnailFile)) {
      console.log(`[COVER] Skipped for ${label}: thumbnail file missing`);
      return videoFile;
    }
    if (!videoFile || !fs.existsSync(videoFile)) {
      console.log(`[COVER] Skipped for ${label}: video file missing`);
      return videoFile;
    }

    const { width, height } = getOutputDimensionsForConfig(config);
    const duration = Math.max(0.3, Math.min(2.0, Number(config.social_cover_frame_duration || config.cover_frame_duration || 0.8) || 0.8));
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const coverVideo = path.join(OUTPUT_DIR, `cover-frame-${stamp}.mp4`);
    const normalizedVideo = path.join(OUTPUT_DIR, `cover-source-${stamp}.mp4`);
    const outputFile = path.join(OUTPUT_DIR, `final-with-cover-${stamp}.mp4`);
    const finalForConcat = ensureAudioForConcat(videoFile, normalizedVideo);
    const coverFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`;

    console.log(`[COVER] Prepending thumbnail cover frame for ${label}: ${duration}s @ ${width}x${height}`);
    execSync(`ffmpeg -y -loop 1 -t ${duration} -i "${thumbnailFile}" -f lavfi -t ${duration} -i anullsrc=channel_layout=stereo:sample_rate=44100 -vf "${coverFilter}" -c:v libx264 -preset veryfast -crf 23 -c:a aac -shortest -movflags +faststart "${coverVideo}"`, {
      stdio: 'inherit',
      timeout: 300000,
    });

    execSync(`ffmpeg -y -i "${coverVideo}" -i "${finalForConcat}" -filter_complex "[0:v]setsar=1[v0];[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[v1];[0:a]aresample=44100[a0];[1:a]aresample=44100[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 24 -c:a aac -movflags +faststart "${outputFile}"`, {
      stdio: 'inherit',
      timeout: 600000,
    });

    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
      console.warn(`[COVER] Output not created for ${label}; using original final video`);
      return videoFile;
    }

    try {
      const stable = path.join(OUTPUT_DIR, 'final-video-with-cover.mp4');
      fs.copyFileSync(outputFile, stable);
      fs.copyFileSync(outputFile, path.join(OUTPUT_DIR, 'processed-video.mp4'));
    } catch (copyError) {
      console.warn(`[COVER] Could not write stable cover artifacts: ${copyError.message}`);
    }

    console.log(`[COVER] Applied for ${label}: ${outputFile}`);
    return outputFile;
  } catch (error) {
    console.warn(`[COVER] Non-blocking failure for ${label}: ${error.message}`);
    appendErrorLog(`[COVER] Non-blocking failure for ${label}: ${error.message}`);
    return videoFile;
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

function buildProcessedVideoRecord({ videoUrl, originalUrl, aspectRatio, segment = null, postResult = null, merged = false, segmentCount = null, thumbnail = null }) {
  const record = {
    video_url: videoUrl,
    original_url: originalUrl,
    aspect_ratio: aspectRatio || '9:16',
  };

  const thumbnailUrl = thumbnail?.thumbnail_url || postResult?.thumbnail_url || null;
  if (thumbnailUrl) {
    record.thumbnail_url = thumbnailUrl;
  }
  if (thumbnail && typeof thumbnail === 'object') {
    record.thumbnail_metadata = {
      style: thumbnail.style || '',
      frame_time: Number.isFinite(Number(thumbnail.frame_time)) ? Number(thumbnail.frame_time) : null,
      tagline: thumbnail.tagline || '',
      subtitle: thumbnail.subtitle || '',
      brand_text: thumbnail.brand_text || '',
      width: Number.isFinite(Number(thumbnail.width)) ? Number(thumbnail.width) : null,
      height: Number.isFinite(Number(thumbnail.height)) ? Number(thumbnail.height) : null,
      upload_mode: thumbnail.upload_mode || '',
    };
  }

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
  console.log('[MAIN] intro_config_summary:', JSON.stringify(getIntroConfigSummary(config)));

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
          let thumbnailInfo = null;
          if (!shouldMergeSegments) {
            thumbnailInfo = await generateAndUploadThumbnail(segmentConfig, segOutputFile, processedSegmentFile);
          }
          const introSegmentFile = shouldMergeSegments
            ? processedSegmentFile
            : await attachIntroToProcessedVideo(segmentConfig, processedSegmentFile, `segment ${seg.index + 1}`);
          const finalSegmentFile = shouldMergeSegments
            ? introSegmentFile
            : prependThumbnailCoverFrameSafe(segmentConfig, introSegmentFile, thumbnailInfo, `segment ${seg.index + 1}`);
          segmentOutputFiles.push(finalSegmentFile);

          if (shouldMergeSegments) {
            continue;
          }

          let uploadUrl = null;
          if (config.skip_upload === true) {
            const localPath = saveLocalFinalMedia(segmentConfig, `-seg${seg.index}.mp4`, finalSegmentFile);
            lastUrl = localPath;
            allProcessedVideos.push(buildProcessedVideoRecord({
              videoUrl: localPath,
              originalUrl: url,
              aspectRatio,
              segment: seg,
              thumbnail: thumbnailInfo,
            }));
            successCount++;
          } else {
            uploadUrl = await upload(finalSegmentFile);
          }

          if (uploadUrl) {
            writeConfig(segmentConfig);
            await post(uploadUrl, thumbnailInfo?.thumbnail_url || null);
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
              thumbnail: thumbnailInfo,
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

          const thumbnailInfo = await generateAndUploadThumbnail(config, inputFile, builtMergedFile);
          const introMergedFile = await attachIntroToProcessedVideo(config, builtMergedFile, 'merged video');
          const finalMergedFile = prependThumbnailCoverFrameSafe(config, introMergedFile, thumbnailInfo, 'merged video');
          let mergedUrl = null;
          if (config.skip_upload === true) {
            mergedUrl = saveLocalFinalMedia(config, '-merged.mp4', finalMergedFile);
          } else {
            writeConfig(config);
            mergedUrl = await upload(finalMergedFile);
            await post(mergedUrl, thumbnailInfo?.thumbnail_url || null);
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
              thumbnail: thumbnailInfo,
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
        const processedFile = path.join(OUTPUT_DIR, 'processed-video.mp4');
        const thumbnailInfo = await generateAndUploadThumbnail(
          config,
          path.join(OUTPUT_DIR, 'input-video.mp4'),
          processedFile
        );
        const introProcessedFile = await attachIntroToProcessedVideo(config, processedFile, 'video');
        const finalProcessedFile = prependThumbnailCoverFrameSafe(config, introProcessedFile, thumbnailInfo, 'video');
        
        let uploadUrl = null;
        if (config.skip_upload === true) {
          const localPath = saveLocalFinalMedia(config, '.mp4', finalProcessedFile);
          lastUrl = localPath;
          allProcessedVideos.push({ video_url: localPath, original_url: url, thumbnail_url: thumbnailInfo?.thumbnail_url || null });
        } else {
          uploadUrl = await upload(finalProcessedFile);
        }

        if (uploadUrl) {
          await post(uploadUrl, thumbnailInfo?.thumbnail_url || null);
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
            thumbnail: thumbnailInfo,
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
