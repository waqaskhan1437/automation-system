const { fs, path, execSync } = require('../lib/core');
const { OUTPUT_DIR, CONFIG_PATH } = require('../lib/paths');

const CAPTION_AUDIO = path.join(OUTPUT_DIR, 'caption-audio.wav');
const TRANSCRIPTION_JSON = path.join(OUTPUT_DIR, 'transcription.json');
const SRT_FILE = path.join(OUTPUT_DIR, 'captions.srt');
const CAPTIONED_FILE = path.join(OUTPUT_DIR, 'captioned-video.mp4');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
    }
  } catch {}
  return {};
}

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.round((s % 1) * 1000);
  const secs = Math.floor(s);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(cs).padStart(3, '0')}`;
}

function whisperJsonToSrt(transcription) {
  if (!transcription?.segments?.length) {
    throw new Error('No segments in transcription');
  }
  return transcription.segments
    .map((seg, i) => {
      const text = (seg.text || '').trim();
      if (!text) return '';
      const dur = seg.end - seg.start;
      if (dur <= 0) return '';
      return `${i + 1}\n${fmtTime(seg.start)} --> ${fmtTime(seg.end)}\n${text}\n\n`;
    })
    .filter(Boolean)
    .join('');
}

function buildSubtitleStyle(config) {
  const sizes = { small: 14, medium: 18, large: 24 };
  const fontSize = sizes[config.caption_font_size] || 18;
  const textColor = (config.caption_text_color || '#FFFFFF').replace('#', '');
  const bgOpacity = parseFloat(config.caption_bg_opacity || '0.5');
  const marginV = config.caption_position === 'top' ? 30 : 60;

  const alpha = Math.round(Math.min(Math.max(bgOpacity, 0), 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  const fontName = 'DejaVu Sans';
  return `FontName=${fontName},FontSize=${fontSize},PrimaryColour=&H00${textColor}&,BackColour=&H${alpha}000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=${marginV},Alignment=2`;
}

module.exports = async function caption() {
  const config = loadConfig();
  if (config.whisper_enabled !== true) {
    console.log('[CAPTION] Skipped (disabled)');
    return;
  }

  const inputVideo = path.join(OUTPUT_DIR, 'processed-video.mp4');
  if (!fs.existsSync(inputVideo) || fs.statSync(inputVideo).size < 50000) {
    console.log('[CAPTION] No processed video found — skipping');
    return;
  }

  console.log('[CAPTION] Starting captions...');

  // 1. Extract audio (16kHz mono PCM WAV)
  console.log('[CAPTION] Extracting audio...');
  try {
    fs.unlinkSync(CAPTION_AUDIO);
  } catch {}
  execSync(
    `ffmpeg -y -i "${inputVideo}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${CAPTION_AUDIO}"`,
    { stdio: 'inherit', timeout: 120000 }
  );
  if (!fs.existsSync(CAPTION_AUDIO) || fs.statSync(CAPTION_AUDIO).size < 1000) {
    throw new Error('Audio extraction failed — output too small');
  }
  console.log('[CAPTION] Audio extracted');

  // 2. Transcribe via whisper Python
  const transcribeScript = path.resolve(__dirname, '..', 'dubbing-engine', 'python', 'transcribe.py');
  const language = config.whisper_language || 'en';

  console.log(`[CAPTION] Transcribing (language: ${language})...`);
  try {
    fs.unlinkSync(TRANSCRIPTION_JSON);
  } catch {}

  const whisperResult = execSync(
    `python3 "${transcribeScript}" --input "${CAPTION_AUDIO}" --output "${TRANSCRIPTION_JSON}" --language "${language}"`,
    { stdio: 'inherit', timeout: 600000 }
  );

  if (!fs.existsSync(TRANSCRIPTION_JSON)) {
    throw new Error('Transcription failed — no output file');
  }

  const transcription = JSON.parse(fs.readFileSync(TRANSCRIPTION_JSON, 'utf8'));
  console.log(`[CAPTION] Transcribed: ${transcription.segments?.length || 0} segments (engine: ${transcription.engine || 'unknown'})`);

  if (transcription.engine === 'placeholder') {
    console.log('[CAPTION] WARNING: Whisper not installed — using placeholder text. Captions will show fallback message.');
  }

  // 3. Generate SRT
  const srtContent = whisperJsonToSrt(transcription);
  fs.writeFileSync(SRT_FILE, srtContent, 'utf8');
  const srtLines = srtContent.trim().split('\n').filter(l => l.includes('-->')).length;
  console.log(`[CAPTION] SRT generated: ${srtLines} subtitle entries`);

  if (srtLines === 0) {
    console.log('[CAPTION] No valid captions to burn — skipping burn step');
    return;
  }

  // 4. Burn subtitles into video
  const style = buildSubtitleStyle(config);
  console.log(`[CAPTION] Burning subtitles (style: ${config.caption_font_size || 'medium'}, color: ${config.caption_text_color || '#FFFFFF'})...`);
  try {
    fs.unlinkSync(CAPTIONED_FILE);
  } catch {}

  execSync(
    `ffmpeg -y -i "${inputVideo}" -vf "subtitles='${SRT_FILE}':force_style='${style}'" -c:a copy "${CAPTIONED_FILE}"`,
    { stdio: 'inherit', timeout: 300000 }
  );

  if (!fs.existsSync(CAPTIONED_FILE) || fs.statSync(CAPTIONED_FILE).size < 50000) {
    throw new Error('Caption burn failed — output too small');
  }

  // 5. Replace original processed video
  fs.copyFileSync(CAPTIONED_FILE, inputVideo);
  try { fs.unlinkSync(CAPTIONED_FILE); } catch {}
  try { fs.unlinkSync(CAPTION_AUDIO); } catch {}
  try { fs.unlinkSync(TRANSCRIPTION_JSON); } catch {}
  try { fs.unlinkSync(SRT_FILE); } catch {}

  const sizeMB = (fs.statSync(inputVideo).size / 1024 / 1024).toFixed(1);
  console.log(`[CAPTION] Done — captioned video: ${sizeMB} MB`);
};
