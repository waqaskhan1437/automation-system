/**
 * Robust helper: attach a format-based intro before processed videos.
 *
 * Designed for GitHub Actions and local runners:
 * - Optional via config.intro_enabled (or any intro URL present)
 * - Non-blocking through attachIntroSafe()
 * - Reads many intro URL key aliases so UI/config name mismatches do not skip intro
 * - Uses curl fallback + fetch/HTTP fallback for archive/CDN URLs
 * - Writes intro_metadata.json for applied, skipped, and failed states
 * - Normalizes intro + processed video before concatenating
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync, execFileSync } = require('child_process');
const { OUTPUT_DIR } = require('./lib/paths');

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const MIN_DOWNLOAD_BYTES = 10 * 1024;

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseResolution(value, fallback = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }) {
  const match = cleanString(value).match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!match) return fallback;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return { width, height };
}

function normalizeAspect(value) {
  const raw = cleanString(value).toLowerCase().replace(/\s+/g, '').replace('x', ':');
  if (!raw) return '';
  if (/^(9:16|9_16|vertical|portrait-video|shorts|reels|tiktok)$/.test(raw)) return '9:16';
  if (/^(16:9|16_9|landscape|youtube|facebook|horizontal)$/.test(raw)) return '16:9';
  if (/^(1:1|1_1|square)$/.test(raw)) return '1:1';
  if (/^(4:5|4_5|portrait)$/.test(raw)) return '4:5';
  if (/^(21:9|21_9|cinematic)$/.test(raw)) return '21:9';
  return raw.includes(':') ? raw : '';
}

function ratioKeyFromResolution(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '9:16';
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.06) return '9:16';
  if (Math.abs(ratio - 16 / 9) < 0.08) return '16:9';
  if (Math.abs(ratio - 1) < 0.06) return '1:1';
  if (Math.abs(ratio - 4 / 5) < 0.06) return '4:5';
  return width >= height ? '16:9' : '9:16';
}

function resolveOutputResolution(config, processedFile) {
  const configured = parseResolution(config?.output_resolution, null);
  if (configured) return configured;

  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      processedFile,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const probed = parseResolution(output, null);
    if (probed) return probed;
  } catch {}

  const aspect = normalizeAspect(config?.aspect_ratio) || '9:16';
  switch (aspect) {
    case '16:9': return { width: 1920, height: 1080 };
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    case '21:9': return { width: 1920, height: 823 };
    case '9:16':
    default: return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function getIntroUrlMap(config = {}) {
  const raw = config.intro_urls;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

function pushCandidate(candidates, key, value) {
  const cleaned = cleanString(value);
  if (cleaned) candidates.push({ key, value: cleaned });
}

function resolveIntroSourceDetailed(config = {}, resolution = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, verbose = true) {
  const resolutionAspect = ratioKeyFromResolution(resolution.width, resolution.height);
  const configuredAspect = normalizeAspect(config.aspect_ratio);
  const aspect = configuredAspect || resolutionAspect;
  const normalizedAspect = aspect.replace(':', '_');
  const map = getIntroUrlMap(config);
  const candidates = [];

  // Nested object aliases: intro_urls: { vertical_9_16: "..." }
  pushCandidate(candidates, `intro_urls.${aspect}`, map[aspect]);
  pushCandidate(candidates, `intro_urls.${normalizedAspect}`, map[normalizedAspect]);

  if (aspect === '9:16') {
    ['vertical_9_16', 'vertical', 'shorts_9_16', 'shorts', 'reels_9_16', 'reels', 'tiktok_9_16', 'tiktok'].forEach((key) => pushCandidate(candidates, `intro_urls.${key}`, map[key]));
    ['intro_url_vertical', 'intro_vertical_url', 'vertical_intro_url', 'intro_9_16_url', 'intro_url_9_16', 'intro_shorts_url', 'intro_url_shorts', 'shorts_intro_url', 'intro_reels_url', 'intro_url_reels', 'reels_intro_url', 'intro_tiktok_url', 'intro_url_tiktok'].forEach((key) => pushCandidate(candidates, key, config[key]));
  }

  if (aspect === '16:9') {
    ['landscape_16_9', 'landscape', 'youtube_16_9', 'youtube', 'facebook_16_9', 'facebook'].forEach((key) => pushCandidate(candidates, `intro_urls.${key}`, map[key]));
    ['intro_url_landscape', 'intro_landscape_url', 'landscape_intro_url', 'intro_16_9_url', 'intro_url_16_9', 'intro_youtube_url', 'intro_url_youtube', 'youtube_intro_url', 'intro_facebook_url', 'intro_url_facebook', 'facebook_intro_url'].forEach((key) => pushCandidate(candidates, key, config[key]));
  }

  if (aspect === '1:1') {
    ['square_1_1', 'square'].forEach((key) => pushCandidate(candidates, `intro_urls.${key}`, map[key]));
    ['intro_url_square', 'intro_square_url', 'square_intro_url', 'intro_1_1_url', 'intro_url_1_1'].forEach((key) => pushCandidate(candidates, key, config[key]));
  }

  if (aspect === '4:5') {
    ['portrait_4_5', 'portrait', 'feed_4_5'].forEach((key) => pushCandidate(candidates, `intro_urls.${key}`, map[key]));
    ['intro_url_4_5', 'intro_4_5_url', 'intro_url_portrait', 'intro_portrait_url', 'portrait_intro_url'].forEach((key) => pushCandidate(candidates, key, config[key]));
  }

  // General fallbacks must always be checked last.
  ['intro_url', 'intro_video_url', 'intro_video', 'video_intro_url', 'fallback_intro_url', 'intro_url_fallback', 'intro_fallback_url', 'default_intro_url'].forEach((key) => pushCandidate(candidates, key, config[key]));
  ['fallback', 'default', 'default_intro', 'intro'].forEach((key) => pushCandidate(candidates, `intro_urls.${key}`, map[key]));

  const selected = candidates.find((item) => item.value) || null;
  if (!selected && verbose) {
    console.log(`[INTRO] No intro URL found. aspect=${aspect} resolution=${resolution.width}x${resolution.height}`);
  }

  return {
    source: selected?.value || '',
    key: selected?.key || '',
    aspect,
    resolution_aspect: resolutionAspect,
    configured_aspect: configuredAspect || null,
    checked_keys: candidates.map((item) => item.key),
  };
}

function resolveIntroSource(config = {}, resolution = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, verbose = true) {
  return resolveIntroSourceDetailed(config, resolution, verbose).source;
}

function hasAnyIntroSource(config = {}) {
  return Boolean(resolveIntroSourceDetailed(config, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, false).source);
}

function isIntroEnabled(config = {}) {
  if (config.intro_disabled === true || String(config.intro_disabled).toLowerCase() === 'true') return false;
  if (config.intro_enabled === false || String(config.intro_enabled).toLowerCase() === 'false') return false;
  if (config.intro_enabled === true || String(config.intro_enabled).toLowerCase() === 'true') return true;
  return hasAnyIntroSource(config);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function normalizeRemoteUrl(value) {
  const raw = cleanString(value);
  if (!raw) return raw;
  try {
    return new URL(raw).toString();
  } catch {
    // Common user issue: direct URLs with spaces. Keep existing % encodings intact.
    return raw.replace(/ /g, '%20');
  }
}

function extensionFromUrl(value) {
  try {
    const pathname = isHttpUrl(value) ? new URL(normalizeRemoteUrl(value)).pathname : value;
    const ext = path.extname(pathname || '').toLowerCase();
    return ext && ext.length <= 8 ? ext : '.mp4';
  } catch {
    return '.mp4';
  }
}

function validateDownloadedFile(outputFile, label = 'intro download') {
  if (!fs.existsSync(outputFile)) throw new Error(`${label} did not create a file`);
  const size = fs.statSync(outputFile).size;
  if (size < MIN_DOWNLOAD_BYTES) throw new Error(`${label} too small (${size} bytes)`);
  const duration = getDuration(outputFile);
  if (!duration) throw new Error(`${label} is not a readable video file`);
  return { size, duration };
}

function tryCurlDownload(source, outputFile) {
  const url = normalizeRemoteUrl(source);
  const args = [
    '-L', '--fail', '--silent', '--show-error',
    '--retry', '2', '--retry-delay', '2',
    '--connect-timeout', '25', '--max-time', '180',
    '-A', 'Mozilla/5.0 (compatible; PrankwishRunner/1.0)',
    '-o', outputFile,
    url,
  ];
  const result = spawnSync('curl', args, { encoding: 'utf8', timeout: 200000 });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr || result.stdout || `exit ${result.status}`);
    return { ok: false, detail: String(detail).trim() };
  }
  try {
    const info = validateDownloadedFile(outputFile, 'curl intro download');
    return { ok: true, info };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function fetchDownload(source, outputFile) {
  if (typeof fetch !== 'function') throw new Error('global fetch is not available in this Node.js runtime');
  const url = normalizeRemoteUrl(source);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PrankwishRunner/1.0)' },
  });
  if (!response.ok) throw new Error(`fetch intro download failed: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputFile, buffer);
  return validateDownloadedFile(outputFile, 'fetch intro download');
}

function httpStreamDownload(source, outputFile, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects while downloading intro'));
    const url = normalizeRemoteUrl(source);
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PrankwishRunner/1.0)' },
      timeout: 180000,
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        return resolve(httpStreamDownload(nextUrl, outputFile, redirectCount + 1));
      }
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
        response.resume();
        return reject(new Error(`HTTP intro download failed: HTTP ${response.statusCode}`));
      }
      const file = fs.createWriteStream(outputFile);
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            resolve(validateDownloadedFile(outputFile, 'HTTP intro download'));
          } catch (error) {
            reject(error);
          }
        });
      });
      file.on('error', reject);
    });
    request.on('timeout', () => {
      request.destroy(new Error('HTTP intro download timed out'));
    });
    request.on('error', reject);
  });
}

async function downloadIntroSource(source, outputFile) {
  const localSource = cleanString(source);
  const resolvedLocal = path.resolve(localSource);
  if (!isHttpUrl(localSource) && fs.existsSync(resolvedLocal)) {
    fs.copyFileSync(resolvedLocal, outputFile);
    return validateDownloadedFile(outputFile, 'local intro copy');
  }

  if (!isHttpUrl(localSource)) {
    throw new Error(`Intro source is not a valid URL or local file: ${localSource}`);
  }

  const curl = tryCurlDownload(localSource, outputFile);
  if (curl.ok) {
    console.log(`[INTRO] Download OK via curl (${(curl.info.size / 1024 / 1024).toFixed(2)} MB, ${curl.info.duration.toFixed(2)}s)`);
    return outputFile;
  }
  console.warn(`[INTRO] curl download failed, trying fetch: ${curl.detail}`);

  try {
    const info = await fetchDownload(localSource, outputFile);
    console.log(`[INTRO] Download OK via fetch (${(info.size / 1024 / 1024).toFixed(2)} MB, ${info.duration.toFixed(2)}s)`);
    return outputFile;
  } catch (fetchError) {
    console.warn(`[INTRO] fetch download failed, trying HTTP fallback: ${fetchError.message}`);
  }

  const info = await httpStreamDownload(localSource, outputFile);
  console.log(`[INTRO] Download OK via HTTP fallback (${(info.size / 1024 / 1024).toFixed(2)} MB, ${info.duration.toFixed(2)}s)`);
  return outputFile;
}

function getDuration(file) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const duration = Number.parseFloat(output.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function hasAudioStream(file) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /audio/i.test(output);
  } catch {
    return false;
  }
}

function runFfmpeg(args, label, timeout = 900000) {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').split('\n').slice(-18).join('\n');
    throw new Error(`${label} failed: ${details}`);
  }
}

function normalizeClip(inputFile, outputFile, resolution, options = {}) {
  const width = resolution.width;
  const height = resolution.height;
  const durationLimit = parsePositiveNumber(options.durationLimit, null);
  const audio = hasAudioStream(inputFile);
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,format=yuv420p`;
  const args = ['-y', '-i', inputFile];

  if (!audio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  }

  if (durationLimit) {
    args.push('-t', String(durationLimit));
  }

  args.push('-map', '0:v:0');
  args.push('-map', audio ? '0:a:0?' : '1:a:0');
  args.push('-vf', vf);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
  args.push('-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', '128k');
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (!audio) args.push('-shortest');
  args.push(outputFile);

  runFfmpeg(args, `Normalize clip ${path.basename(inputFile)}`);

  if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
    throw new Error(`Normalized clip was not created: ${outputFile}`);
  }
  return outputFile;
}

function concatClips(inputFiles, outputFile) {
  const listFile = path.join(OUTPUT_DIR, `intro-concat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  fs.writeFileSync(
    listFile,
    inputFiles.map((file) => `file '${String(file).replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8'
  );

  try {
    runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', outputFile], 'Intro concat copy');
  } catch (copyError) {
    console.warn(`[INTRO] Concat copy failed, retrying with re-encode: ${copyError.message}`);
    runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', '128k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputFile,
    ], 'Intro concat re-encode');
  } finally {
    try { fs.unlinkSync(listFile); } catch {}
  }

  if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size <= 0) {
    throw new Error('Final intro video output was not created');
  }
  return outputFile;
}

function writeIntroMetadata(payload) {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'intro_metadata.json'), JSON.stringify({
      written_at: new Date().toISOString(),
      ...payload,
    }, null, 2), 'utf8');
  } catch (error) {
    console.warn(`[INTRO] Could not write intro_metadata.json: ${error.message}`);
  }
}

async function attachIntro(config = {}, processedVideoFile, outputFile = null) {
  const sourceFile = path.resolve(processedVideoFile);
  const resolution = fs.existsSync(sourceFile)
    ? resolveOutputResolution(config, sourceFile)
    : resolveOutputResolution(config, '');
  const selection = resolveIntroSourceDetailed(config, resolution, true);

  if (!isIntroEnabled(config)) {
    const meta = { video_file: sourceFile, intro_applied: false, status: 'skipped', reason: 'disabled', selection };
    writeIntroMetadata(meta);
    return meta;
  }

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Processed video not found for intro: ${sourceFile}`);
  }

  if (!selection.source) {
    const meta = { video_file: sourceFile, intro_applied: false, status: 'skipped', reason: 'missing_intro_url', selection };
    writeIntroMetadata(meta);
    return meta;
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const introRaw = path.join(OUTPUT_DIR, `intro-raw-${token}${extensionFromUrl(selection.source)}`);
  const introNormalized = path.join(OUTPUT_DIR, `intro-normalized-${token}.mp4`);
  const videoNormalized = path.join(OUTPUT_DIR, `video-normalized-${token}.mp4`);
  const finalOutput = path.resolve(outputFile || path.join(OUTPUT_DIR, `processed-with-intro-${token}.mp4`));
  const durationLimit = Math.min(parsePositiveNumber(config.intro_duration_limit, 8) || 8, 30);

  console.log(`[INTRO] Selected ${selection.key || 'unknown'} for aspect=${selection.aspect} resolution=${resolution.width}x${resolution.height}`);
  console.log(`[INTRO] Source URL/file: ${selection.source}`);

  await downloadIntroSource(selection.source, introRaw);

  const introDuration = getDuration(introRaw);
  if (!introDuration) throw new Error('Downloaded intro has no readable duration');
  const usedDurationLimit = introDuration && introDuration < durationLimit ? introDuration : durationLimit;
  console.log(`[INTRO] Normalizing intro (${usedDurationLimit.toFixed(2)}s max) and processed video...`);
  normalizeClip(introRaw, introNormalized, resolution, { durationLimit: usedDurationLimit });
  normalizeClip(sourceFile, videoNormalized, resolution, {});

  concatClips([introNormalized, videoNormalized], finalOutput);

  const finalDuration = getDuration(finalOutput);
  const originalDuration = getDuration(sourceFile);
  if (originalDuration && finalDuration && finalDuration < originalDuration + Math.max(0.3, usedDurationLimit * 0.5)) {
    throw new Error(`Intro output duration check failed: final=${finalDuration.toFixed(2)}s original=${originalDuration.toFixed(2)}s expected intro≈${usedDurationLimit.toFixed(2)}s`);
  }
  const meta = {
    video_file: finalOutput,
    intro_applied: true,
    status: 'applied',
    intro_source: selection.source,
    intro_source_key: selection.key,
    selection,
    intro_duration_detected: introDuration,
    intro_duration_limit: usedDurationLimit,
    original_duration: originalDuration,
    final_duration: finalDuration,
    width: resolution.width,
    height: resolution.height,
    size_bytes: fs.statSync(finalOutput).size,
  };
  writeIntroMetadata(meta);
  console.log(`[INTRO] OK: ${finalOutput} (${(meta.size_bytes / 1024 / 1024).toFixed(2)} MB, duration=${finalDuration ? finalDuration.toFixed(2) : 'unknown'}s)`);
  return meta;
}

async function attachIntroSafe(config = {}, processedVideoFile, outputFile = null) {
  try {
    return await attachIntro(config, processedVideoFile, outputFile);
  } catch (error) {
    const sourceFile = path.resolve(processedVideoFile || '');
    const meta = { video_file: sourceFile, intro_applied: false, status: 'failed', error: error.message };
    writeIntroMetadata(meta);
    console.warn(`[INTRO] Non-blocking failure: ${error.message}`);
    if (config.intro_required === true || String(config.intro_required).toLowerCase() === 'true') {
      throw error;
    }
    return meta;
  }
}

module.exports = {
  attachIntro,
  attachIntroSafe,
  downloadIntroSource,
  hasAnyIntroSource,
  isIntroEnabled,
  resolveIntroSource,
  resolveIntroSourceDetailed,
  resolveOutputResolution,
};
