/**
 * Step: Download
 *
 * 2026 Robust YouTube Download System:
 * - Multi-layer fallback chain: yt-dlp (cookies) -> yt-dlp (browser) -> yt-dlp (no auth) -> InnerTube API -> Playwright Browser
 * - Rate limiting detection with exponential backoff
 * - User-Agent rotation to avoid fingerprinting
 * - Cookie health checking with expiry validation
 * - Detailed error classification
 *
 * NOTE: --remote-components ejs:github intentionally omitted because it caused
 * crashes on some yt-dlp versions when downloading from GitHub.
 * --js-runtimes node is included because the workflow always installs the
 * latest yt-dlp version, and node is always available on GitHub runners.
 */
const { fs, path } = require('../lib/core');
const { execFileSync, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { OUTPUT_DIR, CONFIG_PATH } = require('../lib/paths');

// Rotating User-Agents to avoid YouTube fingerprinting (2026)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
];

let userAgentIndex = 0;

function getNextUserAgent() {
  const ua = USER_AGENTS[userAgentIndex % USER_AGENTS.length];
  userAgentIndex++;
  return ua;
}

// Rate limiting state
let rateLimitRetryCount = 0;
const MAX_RATE_LIMIT_BACKOFF = 120000; // 2 minutes max

function isRateLimitError(error) {
  const message = String(error && (error.message || error) || '').toLowerCase();
  return /429|too many requests|rate limit|rate_limit/i.test(message);
}

function handleRateLimit() {
  rateLimitRetryCount++;
  // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s, 120s max
  const waitMs = Math.min(
    Math.pow(2, rateLimitRetryCount) * 1000 + Math.floor(Math.random() * 3000),
    MAX_RATE_LIMIT_BACKOFF
  );
  console.log(`[RATE-LIMIT] Backing off for ${(waitMs / 1000).toFixed(1)}s (attempt ${rateLimitRetryCount})...`);
  sleepSync(waitMs);
}

function resetRateLimitState() {
  rateLimitRetryCount = 0;
}

function wrapSyncWithRateLimit(fn) {
  return function (...args) {
    const maxRetries = 3;
    let lastError = null;
    resetRateLimitState();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return fn(...args);
      } catch (error) {
        lastError = error;
        if (isRateLimitError(error) && attempt < maxRetries) {
          handleRateLimit();
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };
}

async function wrapAsyncWithRateLimit(fn) {
  return async function (...args) {
    const maxRetries = 3;
    let lastError = null;
    resetRateLimitState();
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        if (isRateLimitError(error) && attempt < maxRetries) {
          handleRateLimit();
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };
}

// Extended error classification for YouTube download failures
function classifyDownloadError(error) {
  const message = String(error && (error.message || error) || '').toLowerCase();
  if (/429|too many requests/i.test(message)) return 'RATE_LIMIT';
  if (/403|forbidden|signature|player response/i.test(message)) return 'FORBIDDEN';
  if (/401|unauthorized/i.test(message)) return 'UNAUTHORIZED';
  if (/not a bot|confirm.*bot|bot check|captcha|unusual traffic/i.test(message)) return 'BOT_CHALLENGE';
  if (/sign in|login|authentication/i.test(message)) return 'SIGN_IN_REQUIRED';
  if (/cookie|cookies/i.test(message)) return 'COOKIE_ISSUE';
  if (/private video/i.test(message)) return 'PRIVATE_VIDEO';
  if (/age.?restricted|age.restricted|members-only/i.test(message)) return 'AGE_RESTRICTED';
  if (/video unavailable|unavailable/i.test(message)) return 'VIDEO_UNAVAILABLE';
  if (/410|gone|deleted|removed/i.test(message)) return 'VIDEO_DELETED';
  if (/live|upcoming|scheduled/i.test(message)) return 'LIVE_OR_UPCOMING';
  return 'UNKNOWN';
}

function isAuthLikeDownloadError(error) {
  const message = String(error && (error.message || error) || '').toLowerCase();
  return /cookie|cookies|sign in|login|not a bot|confirm.*bot|bot check|private video|age.?restricted|members-only|account|authentication|unauthorized|forbidden|http error 401|http error 403|http error 429/.test(message);
}

function loadRuntimeConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
    }
  } catch (error) {
    console.log(`[DOWNLOAD] Could not read runtime config: ${error.message}`);
  }
  return {};
}

function readBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
    if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  }
  return fallback;
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildYtDlpArgs(ytDlp, outFile, extraFlags) {
  const args = [
    ...ytDlp.baseArgs,
    ...buildJsRuntimesArgs(),
    '--force-overwrites',
    '--no-part',
    '--no-playlist',
    '--no-cache-dir',
    '--socket-timeout', '20',
    '--retries', '3',
    '--fragment-retries', '3',
    '--file-access-retries', '3',
    '--extractor-retries', '3',
    '--merge-output-format',
    'mp4',
    '--no-check-formats',
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b',
    '-o',
    outFile,
  ];
  if (extraFlags) args.push(...extraFlags);
  return args;
}

function buildYouTubeClientArgs(ytDlp, outFile, clientName, cookiesFile) {
  // Build yt-dlp args for a specific YouTube client.
  // clientName: 'android' (default, no PoToken), 'web' (needs PoToken)
  // Unlike buildYtDlpArgs, this does NOT set --user-agent — yt-dlp handles it
  // per client. A mismatched UA causes YouTube to return bot challenges.
  const c = clientName || 'android';
  return [
    ...ytDlp.baseArgs,
    ...buildJsRuntimesArgs(),
    '--force-overwrites', '--no-part', '--no-playlist', '--no-cache-dir',
    '--socket-timeout', '20',
    '--retries', '3', '--fragment-retries', '3',
    '--file-access-retries', '3', '--extractor-retries', '3',
    '--merge-output-format', 'mp4',
    '--no-check-formats',
    '--extractor-args', `youtube:player_client=${c}`,
    ...(cookiesFile ? ['--cookies', cookiesFile] : []),
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b',
    '-o', outFile,
  ];
}

function getBrowserCookieFallbacks() {
  const runtimeConfig = loadRuntimeConfig();
  const configured = String(
    process.env.YOUTUBE_COOKIES_FROM_BROWSER ||
    runtimeConfig.youtube_cookies_from_browser ||
    runtimeConfig.cookies_from_browser ||
    ''
  ).trim();

  if (configured && !/^0|false|off|none$/i.test(configured)) {
    return configured.split(',').map((item) => item.trim()).filter(Boolean);
  }

  /* LOCAL FEATURE (disabled for now)
  if (process.env.RUNNER_EXECUTION_MODE === 'local') {
    return ['firefox', 'chrome', 'edge'];
  }
  */

  return [];
}

function isYouTubeUrl(sourceUrl) {
  return /youtube\.com|youtu\.be/i.test(String(sourceUrl || ''));
}

function buildJsRuntimesArgs() {
  // Add flags to solve YouTube's n-challenge (anti-bot JS challenge).
  // --js-runtimes node: tells yt-dlp to use Node.js as the JavaScript runtime
  // --remote-components ejs:github: downloads EJS solver scripts from GitHub at runtime
  //   (only needed if not bundled via yt-dlp[default] pip package)
  //
  // yt-dlp[default] bundles yt-dlp-ejs which provides EJS offline.
  // --remote-components is only needed as fallback.
  const hasNode = commandExists('node');
  if (!hasNode) {
    console.warn('[DOWNLOAD] Node.js not found — JS runtime unavailable for n-challenge solving');
    return [];
  }
  return ['--js-runtimes', 'node'];
}

function runYtDlpWithArgs(ytDlp, args, outFile) {
  clearDownloadArtifacts(outFile);
  runCommand(ytDlp.command, args, ytDlp.label, 480000);
  validateOutput(outFile);
}

// Rate-limit-aware wrapper for yt-dlp downloads
const runYtDlpDownload = wrapSyncWithRateLimit(function runYtDlpDownloadInner(normalizedSource, outFile) {
  const ytDlp = resolveYtDlpRunner();
  if (!ytDlp) {
    throw new Error('yt-dlp is not installed');
  }

  const cookiesFile = resolveCookiesFile(normalizedSource);

  if (cookiesFile) {
    // Try android client first (no PoToken required).
    // No custom --user-agent — yt-dlp sets the right UA per client.
    console.log('[DOWNLOAD] Using cookie file for YouTube authentication (android client)...');
    try {
      const androidArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android', cookiesFile), normalizedSource];
      runYtDlpWithArgs(ytDlp, androidArgs, outFile);
      return;
    } catch (error) {
      if (isAuthLikeDownloadError(error)) {
        console.log('[DOWNLOAD] Android client auth failed, retrying with web client...');
        const webArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'web', cookiesFile), normalizedSource];
        runYtDlpWithArgs(ytDlp, webArgs, outFile);
        return;
      }
      throw error;
    }
  }

  const browserFallbacks = isYouTubeUrl(normalizedSource) ? getBrowserCookieFallbacks() : [];
  let lastError = null;
  for (const browser of browserFallbacks) {
    try {
      const ytArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android'), '--cookies-from-browser', browser, normalizedSource];
      console.log(`[DOWNLOAD] No server cookie file found; trying local browser cookies from ${browser}`);
      runYtDlpWithArgs(ytDlp, ytArgs, outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] Browser cookie fallback failed for ${browser}: ${error.message}`);
    }
  }

  try {
    const ytArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android'), normalizedSource];
    runYtDlpWithArgs(ytDlp, ytArgs, outFile);
  } catch (error) {
    if (lastError && isAuthLikeDownloadError(lastError)) {
      throw new Error(`${error.message}. Browser cookie fallback also failed: ${lastError.message}`);
    }
    throw error;
  }
});

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

  if (process.platform === 'win32') {
    const dirs = (process.env.PATH || '').split(path.delimiter);
    for (const ext of ['.exe', '.cmd', '.bat', '']) {
      for (const dir of dirs) {
        if (!dir) continue;
        if (/[\\/]WindowsApps([\\/]|$)/i.test(dir)) continue;
        const full = path.join(dir, name + ext);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  return name;
}

function needsShellWrapper(resolvedCommand) {
  if (process.platform !== 'win32') return false;
  return /\.(cmd|bat)$/i.test(String(resolvedCommand || ''));
}

function probeFfprobeBinary(ffprobe) {
  try {
    const versionProbe = spawnSync(ffprobe, ['-version'], {
      encoding: 'utf8',
      shell: needsShellWrapper(ffprobe),
      timeout: 15000,
    });

    if (versionProbe.error) {
      return { ok: false, error: versionProbe.error };
    }
    if (typeof versionProbe.status === 'number' && versionProbe.status !== 0) {
      return {
        ok: false,
        error: new Error((versionProbe.stderr || '').trim() || `ffprobe -version exited ${versionProbe.status}`),
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function isLikelyCorruptBinaryError(error) {
  const msg = String(error && (error.message || error.code) || '').toLowerCase();
  return /unknown|corrupted|corrupt|exec format|einval|access is denied|not a valid win32/i.test(msg);
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
        shell: needsShellWrapper(ffprobe),
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
    if (isLikelyCorruptBinaryError(error)) {
      const sanity = probeFfprobeBinary(ffprobe);
      if (!sanity.ok) {
        throw new Error(
          `Bundled ffprobe is unusable at ${ffprobe} (${(sanity.error && sanity.error.message) || sanity.error}). ` +
            `Re-extract the local-runner portable package or delete tools\\ffmpeg and re-run setup.bat to redownload it. ` +
            `Original probe failure: ${error.message}`,
        );
      }
    }

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
        throw new Error(`[DOWNLOAD] Source link expired or deleted (${host} returned 404)`);
      }

      throw new Error(`[DOWNLOAD] Source URL returned 404: ${sourceUrl}`);
    }

    if (response.status === 403) {
      throw new Error(`[DOWNLOAD] Source URL returned 403 (forbidden): ${sourceUrl}`);
    }
  } catch (error) {
    if (error instanceof Error && /404|403|expired|forbidden/i.test(error.message)) {
      throw error;
    }
  }
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function sleepSync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeFileWithRetries(filePath, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 12;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 250;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch (error) {
      if (!error || error.code === 'ENOENT') {
        return;
      }

      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === retries) {
        break;
      }

      sleepSync(delayMs);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function resolveExistingLocalPath(sourcePath) {
  const absolutePath = path.resolve(String(sourcePath || "").trim());
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  const normalizedWhitespacePath = absolutePath.replace(/\s+\.(mp4|mov|m4v|webm|avi|mkv)$/i, '.$1');
  if (normalizedWhitespacePath !== absolutePath && fs.existsSync(normalizedWhitespacePath)) {
    return normalizedWhitespacePath;
  }

  return absolutePath;
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

    const resolvedCandidate = resolveCommand(candidate);
    const probe = spawnSync(resolvedCandidate, ['-m', 'yt_dlp', '--version'], {
      shell: needsShellWrapper(resolvedCandidate),
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

// ──────────────────────────────────────────────
// Google Photos Browser Download
// ──────────────────────────────────────────────

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

  const runtimeConfig = loadRuntimeConfig();
  const maxAttempts = readPositiveInt(process.env.GOOGLE_PHOTOS_DOWNLOAD_ATTEMPTS || runtimeConfig.google_photos_download_attempts, 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

      // Inject server cookies for auth
      await injectServerCookiesToBrowser(context, sourceUrl);

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
        '-H', `User-Agent: ${getNextUserAgent()}`,
        '-H', 'Referer: https://photos.google.com/',
        '-H', 'Accept: */*',
        '-H', 'Accept-Encoding: identity',
        downloadUrl,
      ], 'curl', 320000);

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
        console.log(`[DOWNLOAD] Google Photos download successful (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
        return;
      }

      throw new Error(`Downloaded file too small: ${fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1024).toFixed(1) + ' KB' : 'missing'}`);
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] Google Photos browser attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
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

// Known YouTube InnerTube API keys for different clients.
// These are PUBLIC keys hardcoded in the YouTube apps — not secrets.
const INNERTUBE_API_KEYS = {
  ANDROID: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
  ANDROID_VR: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
  TVHTML5_SIMPLY_EMBEDDED_PLAYER: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
  WEB_CREATOR: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
  IOS: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
};

// ──────────────────────────────────────────────
// YouTube InnerTube API Download (4 client variants)
// ──────────────────────────────────────────────

async function downloadYouTubeViaInnerTube(sourceUrl, outFile) {
  console.log('[DOWNLOAD] Downloading YouTube video via InnerTube API...');

  const videoIdMatch = sourceUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!videoIdMatch) {
    throw new Error('Could not extract YouTube video ID');
  }
  const videoId = videoIdMatch[1];
  console.log(`[DOWNLOAD] Video ID: ${videoId}`);

  // Build cookie header once for all client attempts
  const cookieText = readServerCookieFile(sourceUrl);
  let cookieHeader = '';
  if (cookieText) {
    const cookieLines = cookieText.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
    const cookiePairs = [];
    for (const line of cookieLines) {
      const parts = line.split('\t');
      if (parts.length >= 7) cookiePairs.push(`${parts[5]}=${parts.slice(6).join('\t')}`);
    }
    cookieHeader = cookiePairs.join('; ');
  }

  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      androidSdkVersion: 31,
      userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 12; en_US)',
    },
    {
      clientName: 'ANDROID_VR',
      clientVersion: '1.60.19',
      androidSdkVersion: 32,
      userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1)',
    },
    {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      userAgent: 'Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) Safari/538.1',
    },
    {
      clientName: 'IOS',
      clientVersion: '19.44.38',
      userAgent: 'com.google.ios.youtube/19.44.38 (iPhone; U; CPU iOS 17_5 like Mac OS X)',
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
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            ...(client.androidSdkVersion ? { androidSdkVersion: client.androidSdkVersion } : {}),
          }
        }
      };

      const apiKey = INNERTUBE_API_KEYS[client.clientName] || INNERTUBE_API_KEYS.WEB_CREATOR;

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'Accept': '*/*',
      };

      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
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

      // Helper: extract URL from format, handling cipher/signatureCipher if needed
      function resolveFormatUrl(fmt) {
        if (fmt.url) return fmt.url;
        // Try to extract URL from cipher
        const cipherText = fmt.signatureCipher || fmt.cipher;
        if (!cipherText) return null;
        const params = new URLSearchParams(cipherText);
        const urlParam = params.get('url');
        const sParam = params.get('s');
        if (urlParam && sParam) {
          // For properly signed URLs we'd need to decrypt the signature
          // yt-dlp handles this internally; for our raw curl approach we skip ciphered
          console.log(`[DOWNLOAD] Format has signatureCipher (itag=${fmt.itag}) — skipping, will fall back to yt-dlp`);
        }
        return urlParam || null;
      }

      if (sd.formats && sd.formats.length > 0) {
        const combined = sd.formats.filter(f => resolveFormatUrl(f) && f.mimeType?.includes('video/mp4'));
        if (combined.length > 0) {
          bestFormat = combined.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          bestFormat.url = resolveFormatUrl(bestFormat);
          console.log(`[DOWNLOAD] Found combined format: itag=${bestFormat.itag} ${bestFormat.qualityLabel || bestFormat.mimeType}`);
        }
      }

      if (!bestFormat && sd.adaptiveFormats && sd.adaptiveFormats.length > 0) {
        const videoOnly = sd.adaptiveFormats.filter(f => resolveFormatUrl(f) && f.mimeType?.includes('video/mp4'));
        if (videoOnly.length > 0) {
          bestFormat = videoOnly.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
          console.log(`[DOWNLOAD] Found adaptive video format: itag=${bestFormat.itag} ${bestFormat.qualityLabel || bestFormat.mimeType}`);

          const audioFormat = sd.adaptiveFormats.find(f => resolveFormatUrl(f) && f.mimeType?.includes('audio/mp4'));
          if (audioFormat) {
            audioFormat.url = resolveFormatUrl(audioFormat);
            console.log(`[DOWNLOAD] Found audio format: itag=${audioFormat.itag}`);
            const audioFile = outFile.replace('.mp4', '-audio.m4a');
            runCommand('curl', [
              '-L', '-o', audioFile,
              '--max-time', '300',
              '--connect-timeout', '30',
              '-H', `User-Agent: ${getNextUserAgent()}`,
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
            '-H', `User-Agent: ${getNextUserAgent()}`,
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
          '-H', `User-Agent: ${getNextUserAgent()}`,
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

// ──────────────────────────────────────────────
// YouTube Browser Download (Ultimate Fallback via Playwright)
// ──────────────────────────────────────────────

async function downloadYouTubeViaBrowser(sourceUrl, outFile) {
  console.log('[DOWNLOAD] Attempting YouTube download via Playwright browser (ultimate fallback)...');
  const executablePath = resolveBrowserExecutable();
  let lastError = null;

  const runtimeConfig = loadRuntimeConfig();
  const maxAttempts = readPositiveInt(process.env.YOUTUBE_BROWSER_DOWNLOAD_ATTEMPTS || runtimeConfig.youtube_browser_download_attempts, 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: getNextUserAgent(),
        locale: 'en-US',
      });

      // Remove automation traces
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // Inject server cookies into browser so we're authenticated
      await injectServerCookiesToBrowser(context, sourceUrl);

      // Navigate to YouTube video page — wait for full page + player JS to load
      console.log(`[DOWNLOAD] Navigating to YouTube video...`);
      const response = await page.goto(sourceUrl, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });

      if (!response || !response.ok()) {
        throw new Error(`YouTube returned HTTP ${response ? response.status() : 'no response'} — may be blocked`);
      }

      // Wait for the video player element to appear (up to 15s)
      try {
        await page.waitForSelector('video', { timeout: 15000 });
        console.log('[DOWNLOAD] Video player element detected');
      } catch {
        console.log('[DOWNLOAD] Video player element not found within timeout, continuing...');
      }

      // Extra settle time for JS player to initialize
      await page.waitForTimeout(2000);

      // Try to extract video URL from page using multiple methods
      let videoUrl = null;
      let extractedVia = null;

      // Method 1: video element src
      videoUrl = await page.evaluate(() => document.querySelector('video')?.src || null);
      if (videoUrl) extractedVia = 'video.src';

      // Method 2: ytplayer config
      if (!videoUrl) {
        videoUrl = await page.evaluate(() => {
          try {
            const config = JSON.parse(document.querySelector('yt-player')?.getAttribute('config') || '{}');
            return config?.args?.url || null;
          } catch { return null; }
        });
        if (videoUrl) extractedVia = 'ytplayer config';
      }

      // Method 3: ytInitialPlayerResponse (most reliable for YouTube)
      if (!videoUrl) {
        const ytResult = await page.evaluate(() => {
          try {
            const text = document.querySelector('script#player-response')?.textContent || '';
            const ytData = JSON.parse(text);
            const all = [
              ...(ytData?.streamingData?.formats || []),
              ...(ytData?.streamingData?.adaptiveFormats || []),
            ];
            // Prefer formats with direct URL
            const withUrl = all.filter(f => f.url);
            if (withUrl.length > 0) {
              return { url: withUrl.sort((a, b) => (b.height || 0) - (a.height || 0))[0].url, method: 'direct' };
            }
            // Try signatureCipher / cipher (need to decrypt)
            const ciphered = all.filter(f => f.signatureCipher || f.cipher);
            if (ciphered.length > 0) return { url: null, method: 'ciphered' };
            return { url: null, method: 'none' };
          } catch { return { url: null, method: 'error' }; }
        });
        if (ytResult.url) {
          videoUrl = ytResult.url;
          extractedVia = 'ytInitialPlayerResponse';
        }
        if (!ytResult.url && ytResult.method === 'ciphered') {
          console.log('[DOWNLOAD] Found cipher-protected URLs — trying yt-dlp with browser cookies as fallback');
        }
      }

      if (videoUrl && videoUrl.startsWith('http')) {
        console.log(`[DOWNLOAD] Found video URL via ${extractedVia}, downloading with curl...`);
        const cookies = await context.cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        runCommand('curl', [
          '-L', '-o', outFile,
          '--max-time', '300',
          '--connect-timeout', '30',
          '-H', `Cookie: ${cookieHeader}`,
          '-H', `User-Agent: ${getNextUserAgent()}`,
          '-H', 'Referer: https://www.youtube.com/',
          '-H', 'Accept: */*',
          videoUrl,
        ], 'curl', 320000);

        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50000) {
          console.log(`[DOWNLOAD] YouTube browser download successful (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
          return;
        }
        console.log(`[DOWNLOAD] Curl download produced small file, trying yt-dlp as fallback...`);
      }

      // Fallback: export cookies from browser and use yt-dlp with them
      // This handles cipher-protected URLs and cases where direct URL extraction fails
      console.log(`[DOWNLOAD] Exporting browser cookies and trying yt-dlp...`);
      const browserCookies = await context.cookies();
      const netscapeLines = browserCookies.map(c => {
        const domain = c.domain.startsWith('.') ? c.domain : `.${c.domain}`;
        const expiry = c.expires ? Math.floor(new Date(c.expires).getTime() / 1000) : 0;
        const includeSub = 'TRUE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const httpOnly = c.httpOnly ? 'TRUE' : 'FALSE';
        return `${domain}\t${includeSub}\t${c.path}\t${secure}\t${expiry}\t${httpOnly}\t${c.name}\t${c.value}`;
      }).join('\n');
      const browserCookieFile = path.join(path.dirname(outFile) || OUTPUT_DIR, 'browser-cookies.txt');
      const header = '# Netscape HTTP Cookie File\n# Exported from browser\n';
      fs.writeFileSync(browserCookieFile, `${header}${netscapeLines}\n`, 'utf8');
      console.log(`[DOWNLOAD] Wrote ${browserCookies.length} browser cookies to ${browserCookieFile}`);

      const ytDlp = resolveYtDlpRunner();
      if (ytDlp) {
        // Try android client first (no PoToken required)
        clearDownloadArtifacts(outFile);
        const androidArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android', browserCookieFile), sourceUrl];
        console.log('[DOWNLOAD] Running yt-dlp with browser-exported cookies (android client)...');
        try {
          runCommand(ytDlp.command, androidArgs, ytDlp.label, 480000);
          validateOutput(outFile);
          console.log(`[DOWNLOAD] YouTube download successful via yt-dlp with browser cookies`);
          try { fs.unlinkSync(browserCookieFile); } catch {}
          return;
        } catch (error) {
          if (isAuthLikeDownloadError(error)) {
            console.log('[DOWNLOAD] Android client failed, retrying with web client...');
            const webArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'web', browserCookieFile), sourceUrl];
            clearDownloadArtifacts(outFile);
            runCommand(ytDlp.command, webArgs, ytDlp.label, 480000);
            validateOutput(outFile);
            console.log(`[DOWNLOAD] YouTube download successful via yt-dlp with browser cookies (web client)`);
            try { fs.unlinkSync(browserCookieFile); } catch {}
            return;
          }
          throw error;
        }
      }

      throw new Error('Could not extract video URL from browser page and no yt-dlp available as fallback');
    } catch (error) {
      lastError = error;
      console.log(`[DOWNLOAD] YouTube browser attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      try {
        if (fs.existsSync(outFile)) {
          fs.unlinkSync(outFile);
        }
      } catch {}
    } finally {
      await browser.close();
    }
  }

  throw lastError || new Error('YouTube browser download failed');
}

// ──────────────────────────────────────────────
// Cookie Management
// ──────────────────────────────────────────────

/**
 * Read server-managed cookie file for a given source URL and return as Netscape text,
 * or null if no cookie file is found/valid.
 */
function readServerCookieFile(sourceUrl) {
  const cookieFile = resolveCookiesFile(sourceUrl);
  if (!cookieFile) return null;
  try {
    const rawText = fs.readFileSync(cookieFile, 'utf8');
    if (looksLikeNetscapeCookieFile(rawText)) return rawText;
  } catch {}
  return null;
}

const HTTPONLY_COOKIE_NAMES = new Set(['HSID', 'SSID', 'SID', 'SAPISID', 'APISID', 'LOGIN_INFO', 'PREF', 'YSC', 'VISITOR_INFO1_LIVE']);

/**
 * Parse Netscape cookie file and return an array of Playwright-compatible cookie objects.
 */
function parseNetscapeCookiesForPlaywright(rawText) {
  const lines = String(rawText || '').split(/\r?\n/g).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const cookies = [];
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields.length < 7) continue;
    const [domainRaw, , pathRaw, , expiresRaw, name, ...valueParts] = fields;
    const domain = domainRaw.trim();
    const path = pathRaw.trim();
    const expires = Number.parseInt(expiresRaw.trim(), 10);
    const value = valueParts.join('\t').trim();
    if (!domain || !path || !name) continue;
    const isAuthDomain = /google\.com|youtube\.com/i.test(domain);
    const cookie = {
      name,
      value,
      domain: domain.startsWith('.') ? domain.slice(1) : domain,
      path,
      secure: isAuthDomain,
      httpOnly: HTTPONLY_COOKIE_NAMES.has(name),
      sameSite: isAuthDomain ? 'None' : 'Lax',
    };
    if (Number.isFinite(expires) && expires > 0) {
      cookie.expires = expires;
    }
    cookies.push(cookie);
  }
  return cookies;
}

/**
 * Inject server-managed cookies into an existing Playwright browser context
 * so the browser session is authenticated.
 */
async function injectServerCookiesToBrowser(context, sourceUrl) {
  const cookieText = readServerCookieFile(sourceUrl);
  if (!cookieText) {
    console.log('[COOKIES] No server cookie file to inject into browser');
    return;
  }
  const cookies = parseNetscapeCookiesForPlaywright(cookieText);
  if (cookies.length === 0) {
    console.log('[COOKIES] No valid cookies parsed from server cookie file');
    return;
  }
  await context.addCookies(cookies);
  console.log(`[COOKIES] Injected ${cookies.length} server cookies into browser context`);
}

function analyzeCookieFile(rawText, label) {
  const lines = String(rawText || '').split(/\r?\n/g).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const names = new Set();
  let expired = 0;
  let persistent = 0;
  for (const line of lines) {
    const fields = line.split('\t');
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
  return { count: lines.length, missing, allPersistentExpired: persistent > 0 && expired === persistent };
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
    if (diagnostics.count <= 0 || diagnostics.allPersistentExpired === true) {
      console.log(`[DOWNLOAD] Ignoring expired/empty ${label} cookie file: ${candidate}`);
      continue;
    }
    console.log(`[DOWNLOAD] Using managed ${label} cookie file: ${candidate} (${(size / 1024).toFixed(1)} KB, ${diagnostics.count} records, mtime=${new Date(fs.statSync(candidate).mtimeMs).toISOString()})`);
    return candidate;
  }

  if (isYouTubeSource) console.log('[DOWNLOAD] No managed YouTube cookie file found - sign-in protected videos may fail');
  else if (isGooglePhotosSource) console.log('[DOWNLOAD] No managed Google Photos cookie file found - private Google Photos links may fail');
  return null;
}

function runCommand(command, args, label, timeout) {
  const resolved = resolveCommand(command);
  const result = spawnSync(resolved, args, {
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
    timeout,
    shell: needsShellWrapper(resolved),
  });

  // Print captured stderr after command finishes (preserves logs while also capturing for errors)
  const stderr = (result.stderr || '').trim();
  if (stderr) {
    process.stderr.write(stderr.replace(/^/gm, `[${label}] `) + '\n');
  }

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const tail = stderr.split('\n').slice(-3).join(' | ');
    const msg = tail
      ? `${label} exited with code ${result.status}: ${tail}`
      : `${label} exited with code ${result.status}`;
    throw new Error(msg);
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

  const runtimeConfig = loadRuntimeConfig();
  const maxAttempts = readPositiveInt(process.env.DIRECT_DOWNLOAD_ATTEMPTS || runtimeConfig.direct_download_attempts, 2);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      clearDownloadArtifacts(outFile);
      console.log(`[DOWNLOAD] Direct media attempt ${attempt}/${maxAttempts}`);
      runCommand('curl', [
        '-L',
        '--fail',
        '--retry', '1',
        '--retry-all-errors',
        '--connect-timeout', '10',
        '--max-time', '30',
        '--parallel',
        '--parallel-max', '3',
        '-H', `User-Agent: ${getNextUserAgent()}`,
        '-o', outFile,
        sourceUrl,
      ], 'curl', 50000);
      validateOutput(outFile);
      return;
    } catch (error) {
      lastError = error;
      const errMsg = String(error && (error.message || error) || '');
      if (/404|expired/i.test(errMsg)) {
        console.log('[DOWNLOAD] Link expired — skipping remaining retries');
        throw new Error('[DOWNLOAD] Source link expired or deleted (404)');
      }
      if (/403|forbidden/i.test(errMsg)) {
        console.log('[DOWNLOAD] Access denied — skipping remaining retries');
        throw new Error('[DOWNLOAD] Source URL returned 403 (forbidden)');
      }
      console.log(`[DOWNLOAD] Direct media attempt ${attempt} failed: ${error.message}`);
    }
  }

  throw lastError || new Error('[DOWNLOAD] Direct media download failed');
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

// ──────────────────────────────────────────────
// Main Download Function - Multi-Layer Fallback Chain
// ──────────────────────────────────────────────

/**
 * YouTube Download Strategy (2026 Robust):
 *
 * yt-dlp gets bot-blocked at the HTML page level on datacenter IPs.
 * InnerTube API bypasses the HTML challenge entirely (like ytmp4 sites).
 *
 * Layer 1: InnerTube API (direct API call — android → ios → tv → web)
 * Layer 2: yt-dlp with server cookies (Netscape format from GitHub Secrets)
 * Layer 3: yt-dlp with browser cookies (Chrome/Firefox/Edge extraction)
 * Layer 4: yt-dlp without auth (last resort yt-dlp attempt)
 * Layer 5: Playwright browser (ultimate fallback - full browser simulation)
 *
 * Each layer has rate-limit detection and exponential backoff
 */

async function downloadYouTubeWithFullChain(sourceUrl, outFile) {
  const normalizedSource = String(sourceUrl || '').trim();
  const errorLog = [];
  let lastError = null;

  // LAYER 1: InnerTube API (bypasses HTML bot challenge, used by ytmp4 sites)
  try {
    console.log('[DOWNLOAD] [LAYER 1/5] InnerTube API (direct, bypasses bot challenge)...');
    await downloadYouTubeViaInnerTube(normalizedSource, outFile);
    validateOutput(outFile);
    console.log('[DOWNLOAD] [LAYER 1] SUCCESS');
    return;
  } catch (error) {
    const category = classifyDownloadError(error);
    lastError = error;
    errorLog.push(`Layer1(InnerTube): ${category} - ${error.message}`);
    console.log(`[DOWNLOAD] [LAYER 1] FAILED: ${category} - ${error.message}`);
  }

  // LAYER 2: yt-dlp with server cookies
  try {
    console.log('[DOWNLOAD] [LAYER 2/5] yt-dlp with server cookies...');
    runYtDlpDownload(normalizedSource, outFile);
    console.log('[DOWNLOAD] [LAYER 2] SUCCESS');
    return;
  } catch (error) {
    const category = classifyDownloadError(error);
    lastError = error;
    errorLog.push(`Layer2(yt-dlp+cookies): ${category} - ${error.message}`);
    console.log(`[DOWNLOAD] [LAYER 2] FAILED: ${category} - ${error.message}`);
  }

  // LAYER 3: yt-dlp with browser cookies (for local runners with browser profiles)
  const browserFallbacks = getBrowserCookieFallbacks();
  if (browserFallbacks.length > 0) {
    const ytDlp = resolveYtDlpRunner();
    if (ytDlp) {
      for (const browser of browserFallbacks) {
        try {
          console.log(`[DOWNLOAD] [LAYER 3/5] yt-dlp with browser cookies (${browser})...`);
          clearDownloadArtifacts(outFile);
          const ytArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android'), '--cookies-from-browser', browser, normalizedSource];
          runCommand(ytDlp.command, ytArgs, ytDlp.label, 480000);
          validateOutput(outFile);
          console.log(`[DOWNLOAD] [LAYER 3] SUCCESS via ${browser}`);
          return;
        } catch (error) {
          const category = classifyDownloadError(error);
          errorLog.push(`Layer3(yt-dlp+${browser}): ${category} - ${error.message}`);
          console.log(`[DOWNLOAD] [LAYER 3] ${browser} FAILED: ${category} - ${error.message}`);
        }
      }
    }
  }

  // LAYER 4: yt-dlp without any auth (public videos only)
  try {
    console.log('[DOWNLOAD] [LAYER 4/5] yt-dlp without auth...');
    const ytDlp = resolveYtDlpRunner();
    if (ytDlp) {
      clearDownloadArtifacts(outFile);
      const ytArgs = [...buildYouTubeClientArgs(ytDlp, outFile, 'android'), normalizedSource];
      runCommand(ytDlp.command, ytArgs, ytDlp.label, 480000);
      validateOutput(outFile);
      console.log('[DOWNLOAD] [LAYER 4] SUCCESS');
      return;
    }
  } catch (error) {
    const category = classifyDownloadError(error);
    errorLog.push(`Layer4(yt-dlp+noauth): ${category} - ${error.message}`);
    console.log(`[DOWNLOAD] [LAYER 4] FAILED: ${category} - ${error.message}`);
  }

  // LAYER 5: Playwright Browser (ultimate fallback)
  try {
    console.log('[DOWNLOAD] [LAYER 5/5] Playwright browser (ultimate fallback)...');
    await downloadYouTubeViaBrowser(normalizedSource, outFile);
    validateOutput(outFile);
    console.log('[DOWNLOAD] [LAYER 5] SUCCESS');
    return;
  } catch (error) {
    const category = classifyDownloadError(error);
    errorLog.push(`Layer5(Browser): ${category} - ${error.message}`);
    console.log(`[DOWNLOAD] [LAYER 5] FAILED: ${category} - ${error.message}`);
  }

  // ALL LAYERS FAILED - build comprehensive error message
  const summary = errorLog.join(' | ');
  const fallbackAdvice = isAuthLikeDownloadError(lastError)
    ? 'YouTube authentication failed. Refresh YouTube cookies in Settings (export from browser in Netscape format) and retry.'
    : 'All 5 download layers failed. Check that the video is public and accessible.';
  throw new Error(`YouTube download failed after all 5 layers. ${fallbackAdvice} Errors: ${summary}`);
}

// ──────────────────────────────────────────────
// Exported Download Function
// ──────────────────────────────────────────────

module.exports = async function download(videoUrl) {
  console.log('[DOWNLOAD] Starting...');
  const outFile = path.join(OUTPUT_DIR, 'input-video.mp4');

  if (fs.existsSync(outFile)) {
    removeFileWithRetries(outFile);
  }

  const normalizedSource = String(videoUrl || "").trim();
  if (!normalizedSource) {
    throw new Error('Missing video source');
  }

  /* LOCAL FEATURE (disabled for now)
  if (!isRemoteUrl(normalizedSource)) {
    const localPath = resolveExistingLocalPath(normalizedSource);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local source not found: ${localPath}`);
    }

    fs.copyFileSync(localPath, outFile);
    console.log(`[DOWNLOAD] Copied local file: ${localPath}`);
    validateOutput(outFile);
    return;
  }
  */

  // Check for pre-extracted download URL in runtime config (YouTube Queue mode)
  const runtimeCfg = loadRuntimeConfig();
  const preExtractedUrl = runtimeCfg && runtimeCfg.yt_download_url;
  if (preExtractedUrl && typeof preExtractedUrl === 'string' && preExtractedUrl.startsWith('http')) {
    console.log(`[DOWNLOAD] Found pre-extracted download URL in config — bypassing YouTube chain`);
    try {
      downloadDirectFile(preExtractedUrl, outFile);
      console.log('[DOWNLOAD] Pre-extracted download SUCCESS');
      return;
    } catch (error) {
      console.log(`[DOWNLOAD] Pre-extracted download failed: ${error.message} — falling through to regular chain`);
    }
  }

  let lastError = null;

  // Google Photos → browser download
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

  // YouTube → full 5-layer fallback chain
  if (isLikelyYtDlpSource(normalizedSource) && /youtube\.com|youtu\.be/i.test(normalizedSource)) {
    await downloadYouTubeWithFullChain(normalizedSource, outFile);
    return;
  }

  // Direct media URL
  if (!isLikelyYtDlpSource(normalizedSource)) {
    if (isDirectMediaUrl(normalizedSource)) {
      await preflightDirectMediaUrl(normalizedSource);
    }

    try {
      downloadDirectFile(normalizedSource, outFile);
      return;
    } catch (error) {
      lastError = error;
      console.log('[DOWNLOAD] Direct download failed, checking other fallbacks...');
    }

    if (isDirectMediaUrl(normalizedSource)) {
      try {
        downloadDirectFileViaFfmpeg(normalizedSource, outFile);
        return;
      } catch (error) {
        lastError = error;
        console.log('[DOWNLOAD] FFmpeg direct download fallback failed');
      }
    }
  }

  // Other yt-dlp sources (Google Photos links etc.)
  if (isLikelyYtDlpSource(normalizedSource)) {
    try {
      runYtDlpDownload(normalizedSource, outFile);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('[DOWNLOAD] Failed:', lastError ? lastError.message : 'Unknown download error');
  throw lastError || new Error('Download failed');
};
