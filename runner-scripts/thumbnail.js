/**
 * Step helper: generate Prankwish-style video thumbnails.
 *
 * Safe-by-design:
 * - Optional via config.thumbnail_enabled (default true)
 * - Falls back to null on failure when used by main.js
 * - Uses only FFmpeg/FFprobe; no new npm dependencies
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { OUTPUT_DIR, CONFIG_PATH } = require('./lib/paths');

const DEFAULT_TAGLINES = [
  'Make Someone Smile Today',
  'Turn Moments Into Smiles',
  'Love, Laugh & Surprise',
  'Your Message, Their Smile',
  'A Gift Full of Smiles',
  'Made to Make You Smile',
  'Send a Sweet Surprise',
];

const DEFAULT_SUBTITLE_VARIANTS = [
  'LOVE • LAUGH • SMILE',
  'LOVE • JOY • SURPRISE',
  'SMILE • LOVE • HAPPINESS',
  'HEARTS • HUGS • SMILES',
  'CARE • LOVE • MAGIC',
  'LAUGHTER • LOVE • JOY',
  'SURPRISE • LOVE • SMILES',
  'HAPPY • SWEET • LOVE',
];

const SUPPORTED_STYLES = new Set(['blue_love', 'pink_love', 'premium_dark', 'clean_white']);

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseResolution(value, fallback = { width: 1080, height: 1920 }) {
  const match = cleanString(value).match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!match) return fallback;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return { width, height };
}

function getVideoDuration(inputFile) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputFile,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const duration = Number.parseFloat(output.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function resolveFrameTime(config, inputFile) {
  const configured = cleanString(config.thumbnail_frame_time);
  const duration = getVideoDuration(inputFile);

  if (configured && configured !== 'auto') {
    const explicit = parsePositiveNumber(configured, null);
    if (explicit !== null) {
      return duration ? Math.max(0, Math.min(explicit, Math.max(0, duration - 0.2))) : explicit;
    }
  }

  if (!duration) return 1;
  if (duration <= 1.2) return 0;
  return Math.max(0.5, Math.min(2, Math.max(0, duration * 0.15), duration - 0.2));
}


function buildFrameTimeCandidates(preferredTime, duration) {
  const candidates = [];
  const add = (value) => {
    const numeric = Number.parseFloat(String(value));
    if (!Number.isFinite(numeric) || numeric < 0) return;
    const clamped = duration ? Math.max(0, Math.min(numeric, Math.max(0, duration - 0.2))) : numeric;
    if (!candidates.some((existing) => Math.abs(existing - clamped) < 0.05)) {
      candidates.push(clamped);
    }
  };

  add(preferredTime);
  add(1);
  add(2);
  add(0.5);
  add(0);
  if (duration) {
    add(duration * 0.15);
    add(duration * 0.30);
    add(duration * 0.50);
  }
  return candidates.length ? candidates : [0];
}

function extractThumbnailFrame(sourceFile, targetFrameFile, preferredFrameTime, config = {}) {
  const duration = getVideoDuration(sourceFile);
  const frameCandidates = buildFrameTimeCandidates(preferredFrameTime, duration);
  const frameSize = Math.max(720, parsePositiveNumber(config.thumbnail_extract_size, 900));

  for (const candidate of frameCandidates) {
    try {
      if (fs.existsSync(targetFrameFile)) fs.unlinkSync(targetFrameFile);
    } catch {}

    const args = [
      '-y',
      '-ss', String(candidate),
      '-i', sourceFile,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-vf', `scale=${frameSize}:${frameSize}:force_original_aspect_ratio=increase,crop=${frameSize}:${frameSize},format=rgb24`,
      '-q:v', '2',
      targetFrameFile,
    ];

    const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    const exists = fs.existsSync(targetFrameFile);
    const size = exists ? fs.statSync(targetFrameFile).size : 0;
    if (result.status === 0 && exists && size > 2048) {
      return { frame_file: targetFrameFile, frame_time: candidate, frame_size_bytes: size };
    }

    const details = (result.stderr || result.stdout || '').split('\n').slice(-4).join(' | ');
    console.warn(`[THUMBNAIL] Frame extract retry @ ${candidate.toFixed(2)}s failed or empty (${size} bytes): ${details}`);
  }

  throw new Error('Could not extract a usable video frame for thumbnail circle');
}

function getFontFile(style = 'bold') {
  const candidates = process.platform === 'win32'
    ? [
        style === 'bold' ? 'C:/Windows/Fonts/arialbd.ttf' : 'C:/Windows/Fonts/arial.ttf',
        style === 'bold' ? 'C:/Windows/Fonts/segoeuib.ttf' : 'C:/Windows/Fonts/segoeui.ttf',
      ]
    : process.platform === 'darwin'
    ? ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
    : [
        style === 'bold' ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        style === 'bold' ? '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf' : '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function escapeFilterPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

function writeTextFile(fileName, content) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, String(content || '').trim(), 'utf8');
  return filePath;
}

function pickTagline(config) {
  const custom = cleanString(config.thumbnail_tagline);
  if (custom) return custom;

  const list = Array.isArray(config.thumbnail_taglines)
    ? config.thumbnail_taglines.map(cleanString).filter(Boolean)
    : [];
  const source = list.length > 0 ? list : DEFAULT_TAGLINES;
  return source[Math.floor(Math.random() * source.length)] || DEFAULT_TAGLINES[0];
}

function pickSubtitle(config) {
  const custom = cleanString(config.thumbnail_subtitle);
  if (custom) return custom;

  const list = Array.isArray(config.thumbnail_subtitles)
    ? config.thumbnail_subtitles.map(cleanString).filter(Boolean)
    : [];
  const source = list.length > 0 ? list : DEFAULT_SUBTITLE_VARIANTS;
  return source[Math.floor(Math.random() * source.length)] || DEFAULT_SUBTITLE_VARIANTS[0];
}

function resolveStyle(config) {
  const requested = cleanString(config.thumbnail_style) || 'blue_love';
  return SUPPORTED_STYLES.has(requested) ? requested : 'blue_love';
}

function getStyleColors(style) {
  switch (style) {
    case 'pink_love':
      return {
        base: '0x4A0630',
        top: '0xEC4899@0.30',
        bottom: '0xF97316@0.18',
        title: '0xFFFFFF',
        subtitle: '0xFCE7F3',
        brand: '0xFDE68A',
      };
    case 'premium_dark':
      return {
        base: '0x070A18',
        top: '0x1E293B@0.42',
        bottom: '0x7C3AED@0.16',
        title: '0xFFFFFF',
        subtitle: '0xCBD5E1',
        brand: '0x93C5FD',
      };
    case 'clean_white':
      return {
        base: '0xEEF6FF',
        top: '0x60A5FA@0.22',
        bottom: '0xF9A8D4@0.18',
        title: '0x0F172A',
        subtitle: '0x1E3A8A',
        brand: '0x2563EB',
      };
    case 'blue_love':
    default:
      return {
        base: '0x071A4A',
        top: '0x0EA5E9@0.28',
        bottom: '0xDB2777@0.16',
        title: '0xFFFFFF',
        subtitle: '0xBFDBFE',
        brand: '0xFDE68A',
      };
  }
}

function buildCircleAlphaExpression() {
  return "if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2)\\,(W/2)*(W/2))\\,255\\,0)";
}

function buildThumbnailFilter({ width, height, circleSize, borderSize, style, taglineFile, subtitleFile, brandFile }) {
  const fontBold = getFontFile('bold');
  const fontRegular = getFontFile('regular') || fontBold;
  if (!fontBold || !fontRegular) {
    throw new Error('No compatible system font found for thumbnail text');
  }

  const colors = getStyleColors(style);
  const circleY = Math.round(height * 0.08);
  const avatarY = circleY + Math.round((borderSize - circleSize) / 2);
  const titleY = circleY + borderSize + Math.round(height * 0.05);
  const subtitleBandY = titleY + Math.round(height * 0.09);
  const subtitleBandHeight = Math.max(110, Math.round(height * 0.085));
  const subtitleY = subtitleBandY + Math.round((subtitleBandHeight - Math.max(42, Math.round(width * 0.055))) / 2);
  const brandY = height - Math.round(height * 0.15);
  const titleSize = Math.max(48, Math.min(72, Math.round(width * 0.058)));
  const subtitleSize = Math.max(42, Math.round(width * 0.055));
  const brandSize = Math.max(34, Math.round(width * 0.043));

  const circleAlpha = buildCircleAlphaExpression();
  const ringAlpha = circleAlpha;
  const escapedFontBold = escapeFilterPath(fontBold);
  const escapedFontRegular = escapeFilterPath(fontRegular);
  const escapedTagline = escapeFilterPath(taglineFile);
  const escapedSubtitle = escapeFilterPath(subtitleFile);
  const escapedBrand = escapeFilterPath(brandFile);

  return [
    `color=c=${colors.base}:s=${width}x${height}:d=1[base]`,
    `[base]drawbox=x=0:y=0:w=${width}:h=${Math.round(height * 0.44)}:color=${colors.top}:t=fill,drawbox=x=0:y=${Math.round(height * 0.58)}:w=${width}:h=${Math.round(height * 0.42)}:color=${colors.bottom}:t=fill[bg]`,
    `color=c=white:s=${borderSize}x${borderSize}:d=1,format=rgba,geq=r='255':g='255':b='255':a='${ringAlpha}'[ring]`,
    `[0:v]scale=${circleSize}:${circleSize}:force_original_aspect_ratio=increase,crop=${circleSize}:${circleSize},format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='${circleAlpha}'[avatar]`,
    `[bg][ring]overlay=x=(W-w)/2:y=${circleY}[tmp1]`,
    `[tmp1][avatar]overlay=x=(W-w)/2:y=${avatarY}[tmp2]`,
    `[tmp2]drawtext=textfile='${escapedTagline}':fontfile='${escapedFontBold}':fontsize=${titleSize}:fontcolor=${colors.title}:x=(w-text_w)/2:y=${titleY}:box=1:boxcolor=black@0.28:boxborderw=24,drawbox=x=0:y=${subtitleBandY}:w=${width}:h=${subtitleBandHeight}:color=black@0.92:t=fill,drawtext=textfile='${escapedSubtitle}':fontfile='${escapedFontBold}':fontsize=${subtitleSize}:fontcolor=white:x=(w-text_w)/2:y=${subtitleY},drawtext=textfile='${escapedBrand}':fontfile='${escapedFontBold}':fontsize=${brandSize}:fontcolor=${colors.brand}:x=(w-text_w)/2:y=${brandY}`,
  ].join(';');
}

function loadConfig(configPath = CONFIG_PATH) {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.warn(`[THUMBNAIL] Could not read config: ${error.message}`);
  }
  return {};
}

function isThumbnailEnabled(config) {
  return config.thumbnail_enabled !== false;
}

function generateThumbnail(inputFile, outputFile, config = {}) {
  if (!isThumbnailEnabled(config)) {
    console.log('[THUMBNAIL] Skipped (thumbnail_enabled=false)');
    return null;
  }

  const sourceFile = path.resolve(inputFile);
  const targetFile = path.resolve(outputFile || path.join(OUTPUT_DIR, 'thumbnail.jpg'));
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Thumbnail source video not found: ${sourceFile}`);
  }
  if (!fs.existsSync(path.dirname(targetFile))) fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  const { width, height } = parseResolution(config.thumbnail_resolution || config.output_resolution, { width: 1080, height: 1920 });
  const shortestSide = Math.min(width, height);
  const circleSize = Math.min(700, Math.max(420, Math.round(shortestSide * 0.60)));
  const borderSize = circleSize + 38;
  const style = resolveStyle(config);
  const preferredFrameTime = resolveFrameTime(config, sourceFile);
  const extractedFrameFile = path.join(path.dirname(targetFile), `_thumbnail_frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`);
  const extractedFrame = extractThumbnailFrame(sourceFile, extractedFrameFile, preferredFrameTime, config);
  const frameTime = extractedFrame.frame_time;
  const tagline = pickTagline(config);
  const subtitle = pickSubtitle(config);
  const brandText = cleanString(config.thumbnail_brand_text) || 'Prankwish.com';

  const taglineFile = writeTextFile('_thumbnail_tagline.txt', tagline);
  const subtitleFile = writeTextFile('_thumbnail_subtitle.txt', subtitle);
  const brandFile = writeTextFile('_thumbnail_brand.txt', brandText);
  const filterComplex = buildThumbnailFilter({ width, height, circleSize, borderSize, style, taglineFile, subtitleFile, brandFile });

  const args = [
    '-y',
    '-i', extractedFrame.frame_file,
    '-filter_complex', filterComplex,
    '-frames:v', '1',
    '-q:v', '3',
    targetFile,
  ];

  console.log(`[THUMBNAIL] Generating ${width}x${height} ${style} thumbnail from extracted frame ${path.basename(extractedFrame.frame_file)} @ ${frameTime.toFixed(2)}s`);
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').split('\n').slice(-12).join('\n');
    throw new Error(`FFmpeg thumbnail generation failed: ${details}`);
  }

  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).size <= 0) {
    throw new Error('Thumbnail output file was not created');
  }

  const metadata = {
    thumbnail_file: targetFile,
    source_file: sourceFile,
    extracted_frame_file: extractedFrame.frame_file,
    extracted_frame_size_bytes: extractedFrame.frame_size_bytes,
    style,
    frame_time: frameTime,
    tagline,
    subtitle,
    brand_text: brandText,
    width,
    height,
    size_bytes: fs.statSync(targetFile).size,
  };
  fs.writeFileSync(path.join(path.dirname(targetFile), 'thumbnail_metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`[THUMBNAIL] OK: ${targetFile} (${(metadata.size_bytes / 1024).toFixed(1)} KB)`);
  return metadata;
}

module.exports = {
  DEFAULT_TAGLINES,
  DEFAULT_SUBTITLE_VARIANTS,
  generateThumbnail,
  getVideoDuration,
  extractThumbnailFrame,
  isThumbnailEnabled,
  loadConfig,
  resolveFrameTime,
  pickSubtitle,
};

if (require.main === module) {
  const inputArgIndex = process.argv.indexOf('--input');
  const outputArgIndex = process.argv.indexOf('--output');
  const config = loadConfig();
  const inputFile = inputArgIndex >= 0 ? process.argv[inputArgIndex + 1] : path.join(OUTPUT_DIR, 'processed-video.mp4');
  const outputFile = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : path.join(OUTPUT_DIR, 'thumbnail.jpg');

  try {
    generateThumbnail(inputFile, outputFile, config);
  } catch (error) {
    console.error('[THUMBNAIL] Failed:', error.message);
    process.exit(1);
  }
}
