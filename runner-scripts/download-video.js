const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadDirect(url) {
  console.log("Downloading: " + url);
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadDirect(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      const file = fs.createWriteStream(VIDEO_FILE);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(true); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

function downloadWithYtDlp(url, output) {
  const outFile = output || VIDEO_FILE;
  console.log("yt-dlp: " + url);
  try {
    execSync('yt-dlp --no-check-certificates -f "best" -o "' + outFile + '" "' + url + '"', {
      stdio: "inherit", timeout: 600000
    });
    return true;
  } catch (e) { return false; }
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
      } 
    }, (res) => {
      let data = "";
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function extractVideoFromGooglePhotos(url) {
  console.log("Extracting video from Google Photos...");
  
  try {
    const html = await fetchPage(url);
    
    // Look for video URLs in the page
    const videoPatterns = [
      /https:\/\/video\.googleusercontent\.com\/[^"'\s\\]+/g,
      /https:\/\/lh3\.googleusercontent\.com\/[^"'\s\\]+=dv/g,
      /https:\/\/[^"'\s\\]*\.googleusercontent\.com\/[^"'\s\\]*video[^"'\s\\]*/g,
      /https:\/\/[^"'\s\\]*fife[^"'\s\\]*\.google\.com\/[^"'\s\\]*/g,
    ];
    
    for (const pattern of videoPatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          const cleanUrl = match.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
          console.log("Found URL: " + cleanUrl);
          try {
            await downloadDirect(cleanUrl);
            if (fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 10000) {
              console.log("Success!");
              return true;
            }
          } catch (e) {
            console.log("Failed: " + e.message);
          }
        }
      }
    }
    
    // Try to find JSON data with video URLs
    const jsonPattern = /\[[\s\S]*?"(https:\/\/[^"]*video[^"]*)"/g;
    let match;
    while ((match = jsonPattern.exec(html)) !== null) {
      const videoUrl = match[1].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
      console.log("Trying JSON URL: " + videoUrl);
      try {
        await downloadDirect(videoUrl);
        if (fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 10000) {
          console.log("Success!");
          return true;
        }
      } catch (e) {}
    }
    
  } catch (e) {
    console.log("Page fetch failed: " + e.message);
  }
  
  return false;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const videoUrl = process.env.VIDEO_URL || "";
  const channelUrl = process.env.CHANNEL_URL || "";
  const multipleUrlsStr = process.env.MULTIPLE_URLS || "[]";

  let multipleUrls = [];
  try { multipleUrls = JSON.parse(multipleUrlsStr); } catch {
    multipleUrls = multipleUrlsStr.split("\n").map(u => u.trim()).filter(Boolean);
  }

  let urls = [];
  if (videoUrl) urls.push(videoUrl);
  if (multipleUrls.length > 0) urls = urls.concat(multipleUrls);

  if (urls.length === 0 && channelUrl) {
    try {
      const out = execSync('yt-dlp --flat-playlist --playlist-end 1 --print url "' + channelUrl + '"', { encoding: "utf-8", timeout: 60000 });
      urls = out.trim().split("\n").filter(Boolean);
    } catch (e) {}
  }

  if (urls.length === 0) { console.error("No URLs!"); process.exit(1); }

  console.log("Processing " + urls.length + " URL(s)...\n");

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const outFile = i === 0 ? VIDEO_FILE : path.join(OUTPUT_DIR, "video-" + i + ".mp4");
    console.log("[" + (i + 1) + "] " + url);

    const isGP = url.includes("photos.google.com") || url.includes("photos.app.goo.gl");
    const isYT = url.includes("youtube.com") || url.includes("youtu.be");

    let success = false;

    if (isGP) {
      console.log("Google Photos detected");
      if (i === 0) {
        success = await extractVideoFromGooglePhotos(url);
      }
      if (!success) {
        console.log("Trying yt-dlp...");
        success = downloadWithYtDlp(url, outFile);
      }
    } else if (isYT) {
      success = downloadWithYtDlp(url, outFile);
    } else {
      try { await downloadDirect(url); success = true; } catch {
        success = downloadWithYtDlp(url, outFile);
      }
    }

    if (fs.existsSync(i === 0 ? VIDEO_FILE : outFile)) {
      const stats = fs.statSync(i === 0 ? VIDEO_FILE : outFile);
      console.log("Downloaded: " + (stats.size / 1024 / 1024).toFixed(2) + " MB\n");
    } else if (!success) {
      console.error("Failed to download!\n");
    }
  }

  if (!fs.existsSync(VIDEO_FILE)) { console.error("No video!"); process.exit(1); }
  console.log("Done!");
}

main().catch(e => { console.error(e.message); process.exit(1); });
