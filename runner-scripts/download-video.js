const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadWithCurl(url) {
  console.log("curl: " + url);
  try {
    execSync('curl -L -o "' + VIDEO_FILE + '" "' + url + '" --max-time 180 -A "Mozilla/5.0"', {
      stdio: "inherit", timeout: 200000
    });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 1000;
  } catch { return false; }
}

function downloadWithYtDlp(url) {
  console.log("yt-dlp: " + url);
  try {
    execSync('yt-dlp -f "best[ext=mp4]/best" --no-check-certificates -o "' + VIDEO_FILE + '" "' + url + '"', {
      stdio: "inherit", timeout: 300000
    });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 1000;
  } catch { return false; }
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    }, res => {
      let data = "";
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

async function downloadGooglePhotos(url) {
  console.log("Google Photos: extracting video URL...");
  try {
    const html = await fetchPage(url);
    
    // Look for video URLs in page
    const patterns = [
      /https:\/\/video\.googleusercontent\.com\/[^"'\s\\]+/g,
      /https:\/\/lh3\.googleusercontent\.com\/[^"'\s\\]+=[^"'\s\\]*/g,
    ];
    
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleanUrl = match.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
          console.log("Trying: " + cleanUrl);
          if (downloadWithCurl(cleanUrl)) {
            console.log("Downloaded from Google Photos!");
            return true;
          }
        }
      }
    }
  } catch (e) {
    console.log("Google Photos extraction failed: " + e.message);
  }
  return false;
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const videoUrl = process.env.VIDEO_URL || "";
  const channelUrl = process.env.CHANNEL_URL || "";
  let multipleUrls = [];
  try { multipleUrls = JSON.parse(process.env.MULTIPLE_URLS || "[]"); } catch {
    multipleUrls = (process.env.MULTIPLE_URLS || "").split("\n").filter(u => u.trim());
  }

  let urls = [];
  if (videoUrl) urls.push(videoUrl);
  if (multipleUrls.length > 0) urls = urls.concat(multipleUrls);
  
  if (urls.length === 0 && channelUrl) {
    try {
      const out = execSync('yt-dlp --flat-playlist --playlist-end 1 --print url "' + channelUrl + '"', {
        encoding: "utf-8", timeout: 30000
      });
      urls = out.trim().split("\n").filter(u => u.trim());
    } catch { console.error("Channel fetch failed"); process.exit(1); }
  }

  if (urls.length === 0) { console.error("No URLs!"); process.exit(1); }

  const url = urls[0];
  console.log("URL: " + url);

  let success = false;
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isGooglePhotos = url.includes("photos.google") || url.includes("photos.app.goo.gl");
  const isDirectFile = url.match(/\.(mp4|mov|webm|mkv)$/i);

  if (isGooglePhotos) {
    // Google Photos - try extraction first, then yt-dlp fallback
    downloadGooglePhotos(url).then(ok => {
      if (!ok) {
        console.log("Trying yt-dlp for Google Photos...");
        success = downloadWithYtDlp(url);
      } else {
        success = true;
      }
      finish(success);
    });
    return; // Async, exit later
  } else if (isYouTube) {
    success = downloadWithYtDlp(url);
  } else if (isDirectFile) {
    success = downloadWithCurl(url);
  } else {
    // Unknown - try curl first, then yt-dlp
    success = downloadWithCurl(url);
    if (!success) success = downloadWithYtDlp(url);
  }

  finish(success);
}

function finish(success) {
  if (!success || !fs.existsSync(VIDEO_FILE)) {
    console.error("Download FAILED!");
    process.exit(1);
  }
  const size = fs.statSync(VIDEO_FILE).size;
  console.log("Downloaded: " + (size / 1024 / 1024).toFixed(2) + " MB");
  console.log("Done!");
  process.exit(0);
}

main();
