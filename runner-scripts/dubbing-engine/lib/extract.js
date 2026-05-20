/**
 * Stage 1 – Extract
 *
 * Extracts:
 *   - Full audio as 16 kHz mono WAV   (for WhisperX / diarization)
 *   - High-quality stereo WAV          (for Demucs separation)
 *   - Key-frame PNGs every ~2 seconds  (for context / future lip-sync)
 *   - Original video stream (no audio) (for final mix)
 *
 * Resolves FFmpeg/yt-dlp via shared utility (supports bundled tools).
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const utils = require('./utils');

function resolveYtDlp() {
  const isWin = process.platform === 'win32';
  const ext = isWin ? '.exe' : '';
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'local-runner', 'tools', 'yt-dlp', `yt-dlp${ext}`),
    path.resolve(__dirname, '..', '..', 'tools', 'yt-dlp', `yt-dlp${ext}`),
    path.resolve(process.cwd(), `yt-dlp${ext}`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  if (isWin) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      if (!dir || /[\\/]WindowsApps([\\/]|$)/i.test(dir)) continue;
      const full = path.join(dir, 'yt-dlp.exe');
      if (fs.existsSync(full)) return full;
    }
  }
  return 'yt-dlp';
}

async function extract(workDir, manifest) {
  let sourceFile = manifest.source_value;
  const sourceMode = manifest.source_mode;

  if (sourceMode !== 'local' && sourceMode !== 'upload') {
    // URL mode – download first using yt-dlp
    const ytDlp = resolveYtDlp();
    console.log(`[EXTRACT] Source is a URL, downloading via ${ytDlp}...`);
    const downloaded = path.join(workDir, 'source_download.mp4');
    utils.ensureDir(workDir);
    try {
      execSync(
        `${utils.quote(ytDlp)} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o ${utils.quote(downloaded)} ${utils.quote(sourceFile)}`,
        { stdio: 'inherit', timeout: 600000 }
      );
      sourceFile = downloaded;
    } catch (err) {
      throw new Error(`[EXTRACT] Failed to download source video: ${err.message}`);
    }
  }

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`[EXTRACT] Source file not found: ${sourceFile}`);
  }

  const extAudioMono     = path.join(workDir, 'audio_mono.wav');
  const extAudioStereo   = path.join(workDir, 'audio_stereo.wav');
  const extVideoNoAudio  = path.join(workDir, 'video_silent.mp4');
  const framesDir        = path.join(workDir, 'frames');
  const manifestCopy     = path.join(workDir, 'source_info.json');

  const duration = utils.getVideoDuration(sourceFile);
  const hasAudio = utils.hasAudioTrack(sourceFile);

  utils.logStep('EXTRACT', `Source: ${sourceFile}  Duration: ${duration ?? 'unknown'}s  Has audio: ${hasAudio}`);

  // 1. Mono audio for transcription (16 kHz, mono, 16-bit PCM)
  utils.logStep('EXTRACT', 'Extracting 16 kHz mono WAV…');
  execSync(
    `${utils.FFMPEG} -y -i ${utils.quote(sourceFile)} -vn -acodec pcm_s16le -ar 16000 -ac 1 ${utils.quote(extAudioMono)}`,
    { stdio: 'inherit', timeout: 300000 }
  );

  // 2. Stereo audio for Demucs separation
  if (hasAudio) {
    utils.logStep('EXTRACT', 'Extracting stereo WAV for separation…');
    execSync(
      `${utils.FFMPEG} -y -i ${utils.quote(sourceFile)} -vn -acodec pcm_s16le -ac 2 ${utils.quote(extAudioStereo)}`,
      { stdio: 'inherit', timeout: 300000 }
    );
  } else {
    console.log('[EXTRACT] No audio track – stereo extraction skipped');
  }

  // 3. Video stream without audio
  utils.logStep('EXTRACT', 'Extracting silent video…');
  execSync(
    `${utils.FFMPEG} -y -i ${utils.quote(sourceFile)} -an -c:v copy ${utils.quote(extVideoNoAudio)}`,
    { stdio: 'inherit', timeout: 300000 }
  );

  // 4. Key frames at ~1 frame every 2 seconds
  utils.logStep('EXTRACT', 'Extracting key frames…');
  utils.ensureDir(framesDir);
  execSync(
    `${utils.FFMPEG} -y -i ${utils.quote(sourceFile)} -vf "fps=1/2,scale=360:640:force_original_aspect_ratio=decrease" -frame_pts 1 ${utils.quote(path.join(framesDir, 'frame_%04d.jpg'))}`,
    { stdio: 'inherit', timeout: 300000 }
  );

  // 5. Write source metadata
  const frameCount = fs.readdirSync(framesDir).length;
  const sourceInfo = {
    source_file: sourceFile,
    duration_seconds: duration,
    has_audio: hasAudio,
    frame_count: frameCount,
    sample_rate: hasAudio ? utils.getAudioSampleRate(sourceFile) : 0,
    extracted_at: new Date().toISOString(),
  };
  utils.writeJson(manifestCopy, sourceInfo);

  console.log(`[EXTRACT] ✅ Done – Audio (mono + stereo), ${frameCount} frames, silent video extracted`);
  return sourceInfo;
}

module.exports = { extract };
