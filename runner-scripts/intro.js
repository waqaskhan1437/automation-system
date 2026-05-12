/**
 * Step helper: attach a format-based intro before processed videos.
 *
 * Safe-by-design:
 * - Optional via config.intro_enabled (or any intro URL present)
 * - Non-blocking when used from main.js
 * - Supports per-format intro URLs and local file paths
 * - Normalizes intro + processed video before concatenating to avoid FFmpeg concat failures
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { OUTPUT_DIR } = require('./lib/paths');

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

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

  const aspect = cleanString(config?.aspect_ratio) || '9:16';
  switch (aspect) {
    case '16:9': return { width: 1920, height: 1080 };
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    case '21:9': return { width: 1920, height: 823 };
    case '9:16':
    default: return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function hasAnyIntroSource(config = {}) {
  return Boolean(resolveIntroSource(config, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, false));
}

function isIntroEnabled(config = {}) {
  if (config.intro_enabled === false) return false;
  if (config.intro_enabled === true) return true;
  return hasAnyIntroSource(config);
}

function getIntroUrlMap(config = {}) {
  const raw = config.intro_urls;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

function resolveIntroSource(config = {}, resolution = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, verbose = true) {
  const aspect = cleanString(config.aspect_ratio) || ratioKeyFromResolution(resolution.width, resolution.height);
  const normalizedAspect = aspect.replace(':', '_');
  const map = getIntroUrlMap(config);

  const candidates = [
    map[aspect],
    map[normalizedAspect],
    aspect === '9:16' ? map.vertical_9_16 : null,
    aspect === '9:16' ? map.shorts_9_16 : null,
    aspect === '9:16' ? map.reels_9_16 : null,
    aspect === '9:16' ? map.tiktok_9_16 : null,
    aspect === '16:9' ? map.landscape_16_9 : null,
    aspect === '16:9' ? map.youtube_16_9 : null,
    aspect === '16:9' ? map.facebook_16_9 : null,
    aspect === '1:1' ? map.square_1_1 : null,
    aspect === '4:5' ? map.portrait_4_5 : null,
    config[`intro_url_${normalizedAspect}`],
    aspect === '9:16' ? config.intro_url_vertical : null,
    aspect === '9:16' ? config.intro_url_shorts : null,
    aspect === '9:16' ? config.intro_url_reels : null,
    aspect === '16:9' ? config.intro_url_landscape : null,
    aspect === '1:1' ? config.intro_url_square : null,
    aspect === '4:5' ? config.intro_url_4_5 : null,
    config.intro_url,
  ];

  const source = candidates.map(cleanString).find(Boolean) || '';
  if (!source && verbose) {
    console.log(`[INTRO] No intro URL found for aspect ${aspect}`);
  }
  return source;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function extensionFromUrl(value) {
  try {
    const pathname = isHttpUrl(value) ? new URL(value).pathname : value;
    const ext = path.extname(pathname || '').toLowerCase();
    return ext && ext.length <= 8 ? ext : '.mp4';
  } catch {
    return '.mp4';
  }
}

async function downloadIntroSource(source, outputFile) {
  const resolvedLocal = path.resolve(source);
  if (!isHttpUrl(source) && fs.existsSync(resolvedLocal)) {
    fs.copyFileSync(resolvedLocal, outputFile);
    return outputFile;
  }

  if (!isHttpUrl(source)) {
    throw new Error(`Intro source is not a valid URL or local file: ${source}`);
  }

  const response = await fetch(source, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Intro download failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 50000) {
    throw new Error(`Intro download too small (${buffer.length} bytes)`);
  }
  fs.writeFileSync(outputFile, buffer);
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

function runFfmpeg(args, label, timeout = 600000) {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').split('\n').slice(-14).join('\n');
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
  args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest', outputFile);

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
    runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputFile], 'Intro concat copy');
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

async function attachIntro(config = {}, processedVideoFile, outputFile = null) {
  if (!isIntroEnabled(config)) {
    return { video_file: processedVideoFile, intro_applied: false, reason: 'disabled' };
  }

  const sourceFile = path.resolve(processedVideoFile);
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Processed video not found for intro: ${sourceFile}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const resolution = resolveOutputResolution(config, sourceFile);
  const introSource = resolveIntroSource(config, resolution, true);
  if (!introSource) {
    return { video_file: sourceFile, intro_applied: false, reason: 'missing_intro_url' };
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const introRaw = path.join(OUTPUT_DIR, `intro-raw-${token}${extensionFromUrl(introSource)}`);
  const introNormalized = path.join(OUTPUT_DIR, `intro-normalized-${token}.mp4`);
  const videoNormalized = path.join(OUTPUT_DIR, `video-normalized-${token}.mp4`);
  const finalOutput = path.resolve(outputFile || path.join(OUTPUT_DIR, `processed-with-intro-${token}.mp4`));
  const durationLimit = Math.min(parsePositiveNumber(config.intro_duration_limit, 8) || 8, 30);

  console.log(`[INTRO] Downloading intro for ${resolution.width}x${resolution.height}: ${introSource}`);
  await downloadIntroSource(introSource, introRaw);

  const introDuration = getDuration(introRaw);
  const usedDurationLimit = introDuration && introDuration < durationLimit ? introDuration : durationLimit;
  console.log(`[INTRO] Normalizing intro (${usedDurationLimit.toFixed(1)}s max) and processed video...`);
  normalizeClip(introRaw, introNormalized, resolution, { durationLimit: usedDurationLimit });
  normalizeClip(sourceFile, videoNormalized, resolution, {});

  concatClips([introNormalized, videoNormalized], finalOutput);

  const meta = {
    video_file: finalOutput,
    intro_applied: true,
    intro_source: introSource,
    intro_duration_limit: usedDurationLimit,
    width: resolution.width,
    height: resolution.height,
    size_bytes: fs.statSync(finalOutput).size,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'intro_metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
  console.log(`[INTRO] OK: ${finalOutput} (${(meta.size_bytes / 1024 / 1024).toFixed(2)} MB)`);
  return meta;
}

async function attachIntroSafe(config = {}, processedVideoFile, outputFile = null) {
  try {
    return await attachIntro(config, processedVideoFile, outputFile);
  } catch (error) {
    console.warn(`[INTRO] Non-blocking failure: ${error.message}`);
    return { video_file: processedVideoFile, intro_applied: false, error: error.message };
  }
}

module.exports = {
  attachIntro,
  attachIntroSafe,
  hasAnyIntroSource,
  isIntroEnabled,
  resolveIntroSource,
  resolveOutputResolution,
};
