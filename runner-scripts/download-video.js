const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

// ── Load config ───────────────────────────────────────────────────────────────
let config = {};
try {
  const configPath = path.join(process.cwd(), "automation-config.json");
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("Config loaded:", JSON.stringify(config).substring(0, 300));
  }
} catch (e) {
  console.log("Could not read config:", e.message);
}

const videoSource      = config.video_source        || "youtube";
const videoUrl         = config.video_url           || "";
const channelUrl       = config.youtube_channel_url || "";
const manualLinksRaw   = config.manual_links        || "";
const videoDays        = parseInt(config.video_days || "30");
const videosPerRun     = parseInt(config.videos_per_run || "1");

// ── Cookie paths ──────────────────────────────────────────────────────────────
const repoRoot = path.join(process.cwd(), "..");

// YouTube cookies - "cookies (2).txt" has YouTube session cookies
let youtubeCookiesPath = "";
for (const p of [
  path.join(repoRoot, "cookies (2).txt"),
  path.join(process.cwd(), "cookies (2).txt"),
]) {
  if (fs.existsSync(p)) { youtubeCookiesPath = p; break; }
}

// Google Photos cookies - photos.google.com_cookies.txt
let googlePhotosCookiesPath = "";
for (const p of [
  path.join(repoRoot, "photos.google.com_cookies.txt"),
  path.join(process.cwd(), "photos.google.com_cookies.txt"),
  youtubeCookiesPath, // fallback to same file
]) {
  if (p && fs.existsSync(p)) { googlePhotosCookiesPath = p; break; }
}

// Default cookiesPath = YouTube cookies (for backward compat)
let cookiesPath = youtubeCookiesPath;
console.log("YouTube cookies:", youtubeCookiesPath || "NOT FOUND");
console.log("Google Photos cookies:", googlePhotosCookiesPath || "NOT FOUND");

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidVideo(file) {
  return fs.existsSync(file) && fs.statSync(file).size > 100000;
}

function ytdlp(url, extraArgs = "") {
  // Optimization: use aria2c for much faster downloads
  // YouTube fix: use ios extractor to bypass bot detection when no cookies available
  const commonArgs = [
    '--no-check-certificates',
    '--downloader aria2c',
    '--downloader-args aria2c:"-x 16 -s 16 -k 1M"',
    '--extractor-args "youtube:player-client=ios,web,android"',
  ].join(' ');

  const strategies = [
    // Strategy 1: Let yt-dlp use config (node runtime + ejs:github) - best quality
    `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`,
    // Strategy 2: Simple best format
    `-f "best[ext=mp4]/best"`,
    // Strategy 3: No format filter at all
    ``,
  ];

  for (let i = 0; i < strategies.length; i++) {
    const cmd = `yt-dlp ${commonArgs} ${strategies[i]} ${extraArgs} -o "${VIDEO_FILE}" "${url}"`;
    console.log(`Strategy ${i+1}/${strategies.length}:`, cmd.substring(0, 150) + "...");
    try {
      execSync(cmd, { stdio: "inherit", timeout: 300000 });
      if (isValidVideo(VIDEO_FILE)) {
        console.log(`✅ Strategy ${i+1} SUCCESS`);
        return true;
      }
    } catch (e) {
      console.log(`Strategy ${i+1} failed:`, e.message.substring(0, 80));
    }
  }
  return false;
}


function curlDownload(url, customCookies = "") {
  const cookiePath = customCookies || googlePhotosCookiesPath || "";
  const cookie = cookiePath ? `--cookie "${cookiePath}"` : "";
  const cmd = `curl -L -o "${VIDEO_FILE}" "${url}" --max-time 180 ${cookie} -A "Mozilla/5.0" -H "Accept: video/*,*/*"`;
  try {
    execSync(cmd, { stdio: "inherit", timeout: 200000 });
    return isValidVideo(VIDEO_FILE);
  } catch { return false; }
}

// ── Google Photos ─────────────────────────────────────────────────────────────
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,*/*",
        "Accept-Encoding": "gzip, deflate, br",
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let stream = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip")    stream = res.pipe(zlib.createGunzip());
      if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      if (enc === "br")      stream = res.pipe(zlib.createBrotliDecompress());
      let data = "";
      stream.on("data", c => data += c);
      stream.on("end", () => resolve(data));
      stream.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadGooglePhotos(url) {
  console.log("Google Photos HTML parsing...");
  try {
    const html = await fetchPage(url);
    const found = [];
    const p1 = html.match(/https:\/\/video-downloads\.googleusercontent\.com\/[^"'\s\\?]+/g);
    const p2 = html.match(/https:\/\/lh3\.googleusercontent\.com\/pw\/[^"'\s\\]+/g);
    const p3 = html.match(/https:\/\/[^"'\s\\]*googlevideo\.com[^"'\s\\]+/g);
    if (p1) found.push(...p1);
    if (p2) found.push(...p2);
    if (p3) found.push(...p3);
    console.log("Found", found.length, "potential URLs");
    for (const raw of found) {
      const u = raw.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
      if (curlDownload(u)) {
        console.log("Google Photos download SUCCESS");
        return true;
      }
    }
  } catch (e) { console.log("HTML parse error:", e.message); }
  return false;
}

// ── YouTube channel: get video URLs ──────────────────────────────────────────
function getChannelUrls(channel) {
  console.log(`Fetching channel videos (last ${videoDays} days)...`);
  // yt-dlp needs YYYYMMDD format for --dateafter
  const d = new Date();
  d.setDate(d.getDate() - videoDays);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  console.log(`Date filter: after ${dateStr}`);
  try {
    const out = execSync(
      `yt-dlp --flat-playlist --playlist-end 50 --print url` +
      ` --dateafter ${dateStr} "${channel}"`,
      { encoding: "utf-8", timeout: 90000 }
    );
    const urls = out.trim().split("\n").filter(u => u.trim() && u.startsWith("http"));
    console.log(`Found ${urls.length} videos from channel`);
    if (urls.length > 0) return urls;
    throw new Error("No videos found with date filter");
  } catch (e) {
    console.error("Channel fetch failed:", e.message.substring(0, 150));
    // Fallback: no date filter, get latest 10
    try {
      console.log("Retrying without date filter...");
      const out2 = execSync(
        `yt-dlp --flat-playlist --playlist-end 10 --print url "${channel}"`,
        { encoding: "utf-8", timeout: 90000 }
      );
      const urls2 = out2.trim().split("\n").filter(u => u.trim() && u.startsWith("http"));
      console.log(`Found ${urls2.length} videos (no date filter)`);
      return urls2;
    } catch (e2) {
      console.error("Fallback failed:", e2.message.substring(0, 100));
      return [];
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let urls = [];

  console.log(`\n=== Video Source: ${videoSource} ===`);

  if ((videoSource === "youtube" || videoSource === "single") && videoUrl) {
    // Single YouTube URL
    urls = [videoUrl.trim()];

  } else if (videoSource === "youtube_channel") {
    // If channelUrl is actually a video URL, just use it directly
    const isVideoUrl = channelUrl && (channelUrl.includes("watch?v=") || channelUrl.includes("youtu.be/") || channelUrl.includes("/shorts/"));
    if (isVideoUrl) {
      console.log("Channel URL looks like a video URL — using directly");
      urls = [channelUrl.trim()];
    } else if (channelUrl) {
      urls = getChannelUrls(channelUrl);
    } else if (videoUrl) {
      urls = [videoUrl.trim()];
    }

  } else if (videoSource === "manual_links" && manualLinksRaw) {
    // Manual links — one per line, supports YouTube + Google Photos + direct
    urls = manualLinksRaw
      .split("\n")
      .map(u => u.trim())
      .filter(u => u && u.startsWith("http"));

  } else if (videoUrl) {
    // Fallback: use whatever URL is given
    urls = [videoUrl.trim()];
  }

  if (urls.length === 0) {
    console.error(`No URLs found! source=${videoSource} url=${videoUrl} channel=${channelUrl}`);
    process.exit(1);
  }

  // Pick first N urls (videos_per_run) — use first for now
  const url = urls[0];
  console.log(`\nDownloading: ${url}`);
  console.log(`Source type: ${videoSource} | Total URLs: ${urls.length}`);

  const isYouTube     = url.includes("youtube.com") || url.includes("youtu.be");
  const isGooglePhoto = url.includes("photos.google") || url.includes("photos.app.goo.gl");
  const isDirectFile  = /\.(mp4|mov|webm|mkv)(\?|$)/i.test(url);

  let success = false;

  if (isYouTube) {
    console.log("=== YouTube Download ===");
    // Try with cookies first, then without
    success = ytdlp(url);
    if (!success) {
      console.log("Retrying without format filter...");
      success = ytdlp(url, '--format "best"');
    }

  } else if (isGooglePhoto) {
    console.log("=== Google Photos Download ===");
    success = ytdlp(url);
    if (!success) success = await downloadGooglePhotos(url);

  } else if (isDirectFile) {
    console.log("=== Direct File Download ===");
    success = curlDownload(url);
    if (!success) success = ytdlp(url);

  } else {
    console.log("=== Generic Download ===");
    success = ytdlp(url);
    if (!success) success = curlDownload(url);
  }

  if (!success || !fs.existsSync(VIDEO_FILE)) {
    console.error("❌ Download FAILED for:", url);
    process.exit(1);
  }

  const sizeMB = (fs.statSync(VIDEO_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Downloaded: ${sizeMB} MB → ${VIDEO_FILE}`);
  process.exit(0);
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
