/**
 * Step: Download
 */
const { fs, path } = require('../lib/core');
const { execFileSync, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { OUTPUT_DIR } = require('../lib/paths');

function getCommandCandidates(name) {
  const candidates = [];
  const isWin = process.platform === 'win32';
  const extension = isWin ? '.exe' : '';

  candidates.push(path.resolve(__dirname, '..', '..', 'local-runner', 'tools', 'ffmpeg', 'bin', `${name}${extension}`));
  candidates.push(path.resolve(__dirname, '..', '..', 'local-runner', 'tools', 'yt-dlp', `${name}${extension}`));
  candidates.push(path.resolve(__dirname, '..', `${name}${extension}`));
  candidates.push(path.resolve(process.cwd(), `${name}${extension}`));

  return candidates.filter(Boolean);
}

function resolveCommand(name) {
  for (const candidate of getCommandCandidates(name)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // On Windows, spawnSync with shell:false can't find .exe via PATH
  if (process.platform === 'win32') {
    const dirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of dirs) {
      for (const ext of ['.exe', '.cmd', '.bat', '']) {
        const full = path.join(dir, name + ext);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  return name;
}

function validateOutput(outFile) {
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 50000) {
    throw new Error('Download failed or file too small');
  }

  const ffprobe = resolveCommand('ffprobe');
  if (ffprobe === 'ffprobe' && process.platform === 'win32') {
    const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
    console.log(`[DOWNLOAD] OK (${size} MB) - ffprobe not available, skipping validation`);
    return;
  }

  try {
    const probe = spawnSync(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        outFile,
      ],
      {
        encoding: 'utf8',
        shell: false,
        timeout: 45000,
      }
    );

    if (probe.error) {
      throw probe.error;
    }

    if (typeof probe.status === 'number' && probe.status !== 0) {
      throw new Error((probe.stderr || '').trim() || `ffprobe exited with code ${probe.status}`);
    }

    if (!/\bvideo\b/i.test(probe.stdout || '')) {
      throw new Error('ffprobe did not detect a video stream');
    }
  } catch (error) {
    let header = '';
    try {
      header = fs.readFileSync(outFile).subarray(0, 512).toString('utf8');
    } catch {}

    if (/<html|<!doctype/i.test(header)) {
      throw new Error('Downloaded HTML page instead of a video file');
    }

    throw new Error(`Downloaded file is not a valid video: ${error.message}`);
  }

  const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`[DOWNLOAD] OK (${size} MB)`);
}

function isDirectMediaUrl(value) {
  return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i.test(String(value || ''));
}

async function preflightDirectMediaUrl(sourceUrl) {
  try {
    const response = await fetch(sourceUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });

    if (response.status === 404) {
      const host = (() => {
        try {
          return new URL(sourceUrl).hostname;
        } catch {
          return '';
        }
      })();

      if (/catbox\.moe/i.test(host)) {
        throw new Error(`Source link expired or deleted (${host} returned 404)`);
      }

      throw new Error(`Source URL returned 404: ${sourceUrl}`);
    }
  } catch (error) {
    if (error instanceof Error && /404|expired or deleted/i.test(error.message)) {
      throw error;
    }
  }
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function isLikelyYtDlpSource(value) {
  return /youtube\.com|youtu\.be|photos\.google\.com|photos\.app\.goo\.gl/i.test(String(value || ""));
}

function isGooglePhotosSource(value) {
  return /photos\.google\.com|photos\.app\.goo\.gl/i.test(String(value || ""));
}

function isGooglePhotosMediaUrl(value) {
  return /videoplayback|googleusercontent\.com|photos\.fife\.usercontent\.google\.com/i.test(String(value || ""));
}

function looksLikeNetscapeCookieFile(value) {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('# Netscape HTTP Cookie File') || normalized.startsWith('# HTTP Cookie File')) {
    return true;
  }

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .some((line) => line.split('\t').length >= 7);
}

function resolveBrowserExecutable() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  try {
    const bundled = chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) {
      return bundled;
    }
  } catch {}

  const candidates = [
    process.platform === 'win32' ? path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.platform === 'win32' ? path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
    process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform !== 'win32') {
    for (const command of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
      try {
        const resolved = execFileSync('which', [command], { encoding: 'utf8' }).trim();
        if (resolved && fs.existsSync(resolved)) {
          return resolved;
        }
      } catch {}
    }
  }

  throw new Error('Chromium/Chrome executable not found');
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], {
    shell: false,
    stdio: 'ignore',
    timeout: 10000,
  });
  return !result.error && result.status === 0;
}

function resolveYtDlpRunner() {
  if (commandExists('yt-dlp')) {
    return {
      command: 'yt-dlp',
      baseArgs: [],
      label: 'yt-dlp',
    };
  }

  for (const candidate of ['python', 'py']) {
    if (!commandExists(candidate)) {
      continue;
    }

    const probe = spawnSync(candidate, ['-m', 'yt_dlp', '--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: 15000,
    });

    if (!probe.error && probe.status === 0) {
      return {
        command: candidate,
        baseArgs: ['-m', 'yt_dlp'],
        label: `${candidate} -m yt_dlp`,
      };
    }
  }

  return null;
}

async function openGooglePhotosVideo(page) {
  if (!/\/photo\//.test(page.url())) {
    const videoTile = page.locator('a[aria-label^="Video"]').first();
    if (await videoTile.count()) {
      await Promise.allSettled([
        page.waitForURL(/\/photo\//, { timeout: 15000 }),
        videoTile.click(),
      ]);
    }
  }

  await page.waitForTimeout(3000);
}

async function triggerGooglePhotosDownload(page) {
  const moreOptions = page.locator('button[aria-label="More options"]').last();
  if (await moreOptions.count()) {
    await page.mouse.move(1000, 120);
    await page.waitForTimeout(500);
    await moreOptions.click();

    const downloadItem = page.locator('[role="menuitem"][aria-label^="Download"], [role="menuitem"]:has-text("Download")').first();
    if (await downloadItem.count()) {
      const menuDownload = page.waitForEvent('download', { timeout: 60000 });
      await downloadItem.click();
      return menuDownload;
    }
  }

  const shortcutDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.keyboard.press('Shift+D');
  return shortcutDownload;
}

async function downloadGooglePhotosViaBrowser(sourceUrl, outFile) {
  console.log('[DOWNLOAD] Downloading Google Photos video in browser...');
  const executablePath = resolveBrowserExecutable();
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        acceptDownloads: true,
      });
      const page = await context.newPage();

      await page.goto(sourceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(4000);

      await openGooglePhotosVideo(page);
      await page.waitForTimeout(3000);

      const moreBtn = page.locator('button[aria-label="More options"]').last();
      if (await moreBtn.count()) {
        await moreBtn.click();
        await page.waitForTimeout(2000);
      }

      const downloadItem = page.locator('[role="menuitem"][aria-label^="Download"], [role="menuitem"]:has-text("Download")').first();
      if (await downloadItem.count()) {
        await downloadItem.click();
      } else {
        await page.keyboard.press('Shift+D');
      }

      const download = await page.waitForEvent('download', { timeout: 30000 });
      const downloadUrl = download.url();
      console.log(`[DOWNLOAD] Download event URL: ${downloadUrl.substring(0, 150)}...`);

      const cookies = await context.cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      runCommand('curl', [
        '-L', '-o', outFile,
        '--max-time', '300',
        '--connect-timeout', '30',
        '-H', `Cookie: ${cookieHeader}`,
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-H', 'Referer: https://photos.google.com/',
        '-H', 'Accept: */*',
        '-H', 'Accept-Encoding: identity',
        downloadUrl,
      ], 'curl', 320000);

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
        console.log(`[DOWNLOAD] Google Photos download successful via download.url() (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
        return;
      }

      throw new Error(`Downloaded file too small: ${fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(1) + ' KB' : 'missing'}`);
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] Google Photos browser attempt ${attempt} failed: ${error.message}`);
      try {
        if (fs.existsSync(outFile)) {
          fs.unlinkSync(outFile);
        }
      } catch {}
    } finally {
      await browser.close();
    }
  }

  throw lastError || new Error('Google Photos browser download failed');
}

async function downloadYouTubeViaInnerTube(sourceUrl, outFile) {
  console.log('[DOWNLOAD] Downloading YouTube video via InnerTube API...');

  const videoIdMatch = sourceUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) {
    throw new Error('Could not extract YouTube video ID');
  }
  const videoId = videoIdMatch[1];
  console.log(`[DOWNLOAD] Video ID: ${videoId}`);

  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      androidSdkVersion: 31,
      userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 12) gzip',
    },
    {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
      clientName: 'WEB_CREATOR',
      clientVersion: '1.20260321.00.00',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
      clientName: 'ANDROID_VR',
      clientVersion: '1.60.19',
      androidSdkVersion: 32,
      userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    },
  ];

  let lastError = null;

  for (const client of clients) {
    try {
      const payload = {
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            ...client,
          }
        }
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      };

      if (client.androidSdkVersion) {
        headers['X-Goog-Visitor-Id'] = '';
      }

      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`InnerTube API returned ${res.status}`);
      }

      const json = await res.json();

      if (json.error) {
        throw new Error(`InnerTube error: ${json.error.message}`);
      }

      if (json.playabilityStatus?.status === 'UNPLAYABLE') {
        throw new Error(`Video unplayable: ${json.playabilityStatus.reason || 'Unknown reason'}`);
      }

      if (!json.streamingData) {
        throw new Error(`No streaming data in response (playability: ${json.playabilityStatus?.status || 'unknown'})`);
      }

      const sd = json.streamingData;
      let bestFormat = null;

      if (sd.formats && sd.formats.length > 0) {
        const combined = sd.formats.filter(f => f.url && f.mimeType?.includes('video/mp4'));
        if (combined.length > 0) {
          bestFormat = combined.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          console.log(`[DOWNLOAD] Found combined format: itag=${bestFormat.itag} ${bestFormat.qualityLabel || bestFormat.mimeType}`);
        }
      }

      if (!bestFormat && sd.adaptiveFormats && sd.adaptiveFormats.length > 0) {
        const videoOnly = sd.adaptiveFormats.filter(f => f.url && f.mimeType?.includes('video/mp4'));
        if (videoOnly.length > 0) {
          bestFormat = videoOnly.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          console.log(`[DOWNLOAD] Found adaptive video format: itag=${bestFormat.itag} ${bestFormat.qualityLabel || bestFormat.mimeType}`);

          const audioFormat = sd.adaptiveFormats.find(f => f.url && f.mimeType?.includes('audio/mp4'));
          if (audioFormat) {
            console.log(`[DOWNLOAD] Found audio format: itag=${audioFormat.itag}`);
            const audioFile = outFile.replace('.mp4', '-audio.m4a');
            runCommand('curl', [
              '-L', '-o', audioFile,
              '--max-time', '300',
              '--connect-timeout', '30',
              '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              '-H', 'Referer: https://www.youtube.com/',
              audioFormat.url,
            ], 'curl', 320000);

            if (fs.existsSync(audioFile) && fs.statSync(audioFile).size > 1000) {
              const mergedFile = outFile.replace('.mp4', '-merged.mp4');
              runCommand('ffmpeg', [
                '-y', '-i', bestFormat.url, '-i', audioFile,
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
                mergedFile,
              ], 'ffmpeg', 120000);

              if (fs.existsSync(mergedFile) && fs.statSync(mergedFile).size > 50000) {
                fs.copyFileSync(mergedFile, outFile);
                try { fs.unlinkSync(mergedFile); } catch {}
                try { fs.unlinkSync(audioFile); } catch {}
                console.log(`[DOWNLOAD] YouTube download successful via InnerTube + FFmpeg merge (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
                return;
              }
            }
          }

          console.log(`[DOWNLOAD] Downloading video-only stream...`);
          runCommand('curl', [
            '-L', '-o', outFile,
            '--max-time', '300',
            '--connect-timeout', '30',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-H', 'Referer: https://www.youtube.com/',
            bestFormat.url,
          ], 'curl', 320000);

          if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
            console.log(`[DOWNLOAD] YouTube download successful via InnerTube (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
            return;
          }
        }
      }

      if (bestFormat) {
        console.log(`[DOWNLOAD] Downloading via InnerTube URL...`);
        runCommand('curl', [
          '-L', '-o', outFile,
          '--max-time', '300',
          '--connect-timeout', '30',
          '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          '-H', 'Referer: https://www.youtube.com/',
          bestFormat.url,
        ], 'curl', 320000);

        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
          console.log(`[DOWNLOAD] YouTube download successful via InnerTube (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
          return;
        }
      }

      throw new Error('No suitable format found');
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] InnerTube client ${client.clientName} failed: ${error.message}`);
      try {
        if (fs.existsSync(outFile)) {
          fs.unlinkSync(outFile);
        }
      } catch {}
    }
  }

  throw lastError || new Error('YouTube InnerTube download failed');
}

function analyzeCookieFile(rawText, label) {
  const lines = String(rawText || '').split(/\r?\n/g).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const names = new Set();
  let expired = 0;
  let persistent = 0;
  for (const line of lines) {
    const fields = line.split('	');
    if (fields.length < 7) continue;
    const expires = Number.parseInt(fields[4], 10);
    const name = fields[5];
    if (name) names.add(name);
    if (Number.isFinite(expires) && expires > 0) {
      persistent += 1;
      if (expires <= nowSeconds) expired += 1;
    }
  }
  const recommended = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'LOGIN_INFO'];
  const missing = label === 'YouTube' ? recommended.filter((name) => !names.has(name)) : [];
  if (persistent > 0 && expired === persistent) console.log(`[DOWNLOAD] ${label} cookie warning: all persistent cookies appear expired.`);
  if (missing.length > 0) console.log(`[DOWNLOAD] ${label} cookie warning: missing recommended auth cookies: ${missing.join(', ')}`);
  return { count: lines.length, missing };
}

function resolveCookiesFile(sourceUrl) {
  const stepsDir = path.resolve(__dirname);
  const runnerScriptsDir = path.resolve(stepsDir, '..');
  const normalizedSource = String(sourceUrl || '').toLowerCase();
  const isYouTubeSource = /youtube\.com|youtu\.be/.test(normalizedSource);
  const isGooglePhotosSource = /photos\.google\.com|photos\.app\.goo\.gl/.test(normalizedSource);
  const label = isYouTubeSource ? 'YouTube' : isGooglePhotosSource ? 'Google Photos' : 'source';
  const candidates = isYouTubeSource
    ? [process.env.YOUTUBE_COOKIES_FILE || '', path.join(runnerScriptsDir, 'cookies.youtube.txt')]
    : isGooglePhotosSource
      ? [process.env.GOOGLE_PHOTOS_COOKIES_FILE || '', path.join(runnerScriptsDir, 'cookies.google-photos.txt')]
      : [];

  const existingCandidates = Array.from(new Set(candidates.filter(Boolean)))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  for (const candidate of existingCandidates) {
    let rawText = '';
    try { rawText = fs.readFileSync(candidate, 'utf8'); } catch {}
    if (!looksLikeNetscapeCookieFile(rawText)) {
      console.log(`[DOWNLOAD] Ignoring invalid cookie file: ${candidate}`);
      continue;
    }
    const size = fs.statSync(candidate).size;
    const diagnostics = analyzeCookieFile(rawText, label);
    console.log(`[DOWNLOAD] Using managed ${label} cookie file: ${candidate} (${(size / 1024).toFixed(1)} KB, ${diagnostics.count} records, mtime=${new Date(fs.statSync(candidate).mtimeMs).toISOString()})`);
    return candidate;
  }

  if (isYouTubeSource) console.log('[DOWNLOAD] No managed YouTube cookie file found - sign-in protected videos may fail');
  else if (isGooglePhotosSource) console.log('[DOWNLOAD] No managed Google Photos cookie file found - private Google Photos links may fail');
  return null;
}

function runCommand(command, args, label, timeout) {
  const result = spawnSync(resolveCommand(command), args, {
    stdio: 'inherit',
    timeout,
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status}`);
  }
}

function clearDownloadArtifacts(targetFile) {
  const targetDir = path.dirname(targetFile);
  const targetBase = path.basename(targetFile);

  try {
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }
  } catch {}

  try {
    for (const entry of fs.readdirSync(targetDir)) {
      if (entry === targetBase) {
        continue;
      }

      if (entry.startsWith(`${targetBase}.`) || entry.startsWith(`${targetBase}.f`)) {
        try {
          fs.unlinkSync(path.join(targetDir, entry));
        } catch {}
      }
    }
  } catch {}
}

function downloadDirectFile(sourceUrl, outFile) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      clearDownloadArtifacts(outFile);
      console.log(`[DOWNLOAD] Direct media attempt ${attempt}/3`);
      runCommand('curl', [
        '-L',
        '--fail',
        '--retry', '2',
        '--retry-all-errors',
        '--connect-timeout', '15',
        '--max-time', '120',
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-o', outFile,
        sourceUrl,
      ], 'curl', 150000);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] Direct media attempt ${attempt} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('Direct media download failed');
}

function downloadDirectFileViaFfmpeg(sourceUrl, outFile) {
  clearDownloadArtifacts(outFile);
  console.log('[DOWNLOAD] Falling back to FFmpeg direct fetch...');
  runCommand('ffmpeg', [
    '-y',
    '-rw_timeout', '15000000',
    '-i', sourceUrl,
    '-c', 'copy',
    '-movflags', '+faststart',
    outFile,
  ], 'ffmpeg', 180000);
  validateOutput(outFile);
}

module.exports = async function download(videoUrl) {
  console.log('[DOWNLOAD] Starting...');
  const outFile = path.join(OUTPUT_DIR, 'input-video.mp4');

  if (fs.existsSync(outFile)) {
    fs.unlinkSync(outFile);
  }

  const normalizedSource = String(videoUrl || "").trim();
  if (!normalizedSource) {
    throw new Error('Missing video source');
  }

  if (!isRemoteUrl(normalizedSource)) {
    const localPath = path.resolve(normalizedSource);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local source not found: ${localPath}`);
    }

    fs.copyFileSync(localPath, outFile);
    console.log(`[DOWNLOAD] Copied local file: ${localPath}`);
    validateOutput(outFile);
    return;
  }

  let lastError = null;
  let downloadSource = normalizedSource;

  if (isGooglePhotosSource(normalizedSource)) {
    try {
      await downloadGooglePhotosViaBrowser(normalizedSource, outFile);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log('[DOWNLOAD] Google Photos browser download failed, checking other fallbacks...');
    }
  }

  if (!isLikelyYtDlpSource(normalizedSource)) {
    if (isDirectMediaUrl(normalizedSource)) {
      await preflightDirectMediaUrl(downloadSource);
    }

    try {
      downloadDirectFile(downloadSource, outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log('[DOWNLOAD] Direct download failed, checking other fallbacks...');
    }

    if (isDirectMediaUrl(normalizedSource)) {
      try {
        downloadDirectFileViaFfmpeg(downloadSource, outFile);
        return;
      } catch (error) {
        lastError = error;
        console.log('[DOWNLOAD] FFmpeg direct download fallback failed');
      }
    }
  }

  if (isLikelyYtDlpSource(normalizedSource) && /youtube\.com|youtu\.be/i.test(normalizedSource)) {
    try {
      await downloadYouTubeViaInnerTube(normalizedSource, outFile);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log('[DOWNLOAD] YouTube InnerTube failed, falling back to yt-dlp...');
    }

    try {
      const ytDlp = resolveYtDlpRunner();
      if (!ytDlp) {
        throw new Error('yt-dlp is not installed');
      }

      const cookiesFile = resolveCookiesFile(normalizedSource);
      const ytArgs = [
        ...ytDlp.baseArgs,
        '--force-overwrites',
        '--no-part',
        '--no-playlist',
        '--merge-output-format',
        'mp4',
        '--remote-components',
        'ejs:github',
        '--js-runtimes',
        'node',
        '-f',
        'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b',
        '-o',
        outFile,
      ];

      if (cookiesFile) {
        ytArgs.push('--cookies', cookiesFile);
        console.log('[DOWNLOAD] Using cookie file for YouTube authentication');
      }

      ytArgs.push(normalizedSource);

      clearDownloadArtifacts(outFile);
      runCommand(ytDlp.command, ytArgs, ytDlp.label, 600000);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log('[DOWNLOAD] yt-dlp fallback also failed');
    }
  }

  if (isLikelyYtDlpSource(normalizedSource)) {
    try {
      const ytDlp = resolveYtDlpRunner();
      if (!ytDlp) {
        throw new Error('yt-dlp is not installed');
      }

      const cookiesFile = resolveCookiesFile(normalizedSource);
      const ytArgs = [
        ...ytDlp.baseArgs,
        '--force-overwrites',
        '--no-part',
        '--no-playlist',
        '--merge-output-format',
        'mp4',
        '--remote-components',
        'ejs:github',
        '--js-runtimes',
        'node',
        '-f',
        'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b',
        '-o',
        outFile,
      ];

      if (cookiesFile) {
        ytArgs.push('--cookies', cookiesFile);
        console.log('[DOWNLOAD] Using cookie file for YouTube authentication');
      }

      ytArgs.push(normalizedSource);

      clearDownloadArtifacts(outFile);
      runCommand(ytDlp.command, ytArgs, ytDlp.label, 600000);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('[DOWNLOAD] Failed:', lastError ? lastError.message : 'Unknown download error');
  throw lastError || new Error('Download failed');
};
