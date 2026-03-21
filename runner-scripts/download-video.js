const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

// Find cookies file - look in repo root (parent of runner-scripts)
let cookiesPath = "";
const repoRoot = path.join(process.cwd(), "..");
const possiblePaths = [
  path.join(repoRoot, "cookies (2).txt"),
  path.join(repoRoot, "photos.google.com_cookies.txt"),
  path.join(process.cwd(), "cookies (2).txt"),
  path.join(process.cwd(), "photos.google.com_cookies.txt")
];

console.log("Searching for cookies file...");
console.log("Current dir:", process.cwd());
console.log("Looking in:", possiblePaths);

for (const p of possiblePaths) {
  const exists = fs.existsSync(p);
  console.log("Check:", p, exists ? "FOUND" : "not found");
  if (exists) {
    cookiesPath = p;
    console.log("Using cookies at:", p);
    break;
  }
}

if (!cookiesPath) {
  console.log("WARNING: Cookies file not found!");
} else {
  console.log("SUCCESS: Cookies file found at:", cookiesPath);
}

function downloadWithCurl(url) {
  console.log("curl: " + url.substring(0, 60) + "...");
  
  // Check if cookies file exists
  const cookieFlag = cookiesPath ? ` --cookie "${cookiesPath}"` : "";
  
  try {
    execSync('curl -L -o "' + VIDEO_FILE + '" "' + url + '" --max-time 180' + cookieFlag + ' -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.5"', {
      stdio: "inherit", timeout: 200000
    });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
  } catch { return false; }
}

function downloadWithYtDlp(url) {
  console.log("yt-dlp: " + url);
  
  // Check if it's a Google Photos URL and if cookies exist
  const isGooglePhotos = url.includes("photos.google") || url.includes("photos.app.goo.gl");
  
  try {
    let cmd;
    if (isGooglePhotos && cookiesPath) {
      // For Google Photos with cookies file
      cmd = 'yt-dlp --no-check-certificates --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --cookie "' + cookiesPath + '" -f "best[ext=mp4]/best" -o "' + VIDEO_FILE + '" "' + url + '"';
    } else if (isGooglePhotos) {
      // For Google Photos without cookies
      cmd = 'yt-dlp --no-check-certificates --add-header "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -f "best[ext=mp4]/best" -o "' + VIDEO_FILE + '" "' + url + '"';
    } else {
      cmd = 'yt-dlp --no-check-certificates -f "best[ext=mp4]/best" -o "' + VIDEO_FILE + '" "' + url + '"';
    }
    
    console.log("Running:", cmd.substring(0, 80) + "...");
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
  } catch { 
    console.log("yt-dlp failed, trying alternative method...");
    try {
      const altCmd = 'yt-dlp --no-check-certificates -o "' + VIDEO_FILE + '" --add-header "User-Agent: Mozilla/5.0" "' + url + '"';
      execSync(altCmd, {
        stdio: "inherit", timeout: 600000
      });
      return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
    } catch { return false; }
  }
}

function fetchPage(url, cookies = "") {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cookie": cookies
      }
    };
    
    https.get(url, options, res => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log("Redirect to:", res.headers.location);
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }

      // Collect cookies from response
      let newCookies = "";
      if (res.headers['set-cookie']) {
        const cookieArray = Array.isArray(res.headers['set-cookie'])
          ? res.headers['set-cookie']
          : [res.headers['set-cookie']];
        newCookies = cookieArray.map(c => c.split(';')[0]).join('; ');
        console.log("Got cookies:", newCookies.substring(0, 50));
      }

      // Handle gzip/deflate/br compressed responses
      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      let data = "";
      stream.on("data", c => data += c);
      stream.on("end", () => {
        if (newCookies && !cookies) {
          console.log("Retrying with cookies...");
          fetchPage(url, newCookies).then(resolve).catch(reject);
        } else {
          resolve(data);
        }
      });
      stream.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadGooglePhotos(url) {
  console.log("Google Photos: extracting video...");
  return new Promise((resolve) => {
    fetchPage(url).then(html => {
      console.log("HTML fetched (" + html.length + " chars)");
      
      // Find all potential video URLs
      const allUrls = [];
      
      // Pattern 1: video-downloads.googleusercontent.com
      const v1 = html.match(/https:\/\/video-downloads\.googleusercontent\.com\/[^\"'\s\\?]+/g);
      if (v1) allUrls.push(...v1);
      
      // Pattern 2: lh3.googleusercontent.com with video path (pw/AP...)
      const v2 = html.match(/https:\/\/lh3\.googleusercontent\.com\/pw\/[^\"'\s\\]+/g);
      if (v2) allUrls.push(...v2);
      
      // Pattern 3: Any googlevideo.com URLs
      const v3 = html.match(/https:\/\/[^\"'\s\\]*googlevideo\.com[^\"'\s\\]+/g);
      if (v3) allUrls.push(...v3);
      
      console.log("Found " + allUrls.length + " potential video URLs");
      
      for (const rawUrl of allUrls) {
        const videoUrl = rawUrl.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
        console.log("Trying:", videoUrl.substring(0, 70) + "...");
        
        if (downloadWithCurl(videoUrl)) {
          const size = fs.statSync(VIDEO_FILE).size;
          if (size > 10000) {
            console.log("SUCCESS! Downloaded: " + (size / 1024 / 1024).toFixed(2) + " MB");
            resolve(true);
            return;
          }
        }
      }
      
      console.log("No working video URL found in page");
      resolve(false);
    }).catch(e => {
      console.log("Google Photos fetch failed:", e.message);
      resolve(false);
    });
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let config = { video_source: 'youtube', video_url: '', manual_links: '', youtube_channel_url: '' };
  try {
    const configPath = path.join(process.cwd(), 'automation-config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.log("Could not read config file: " + e.message);
  }

  const videoSource = process.env.VIDEO_SOURCE || config.video_source || "youtube";
  const videoUrl = process.env.VIDEO_URL || config.video_url || "";
  const channelUrl = process.env.YOUTUBE_CHANNEL_URL || config.youtube_channel_url || "";
  const manualLinksRaw = process.env.MANUAL_LINKS || config.manual_links || "";
  const googlePhotosAlbumUrl = process.env.GOOGLE_PHOTOS_ALBUM_URL || config.google_photos_album_url || "";

  // Parse manual links
  let multipleUrls = manualLinksRaw.split("\n").filter(u => u.trim());
  let urls = [];

  if (videoSource === "manual_links" && multipleUrls.length > 0) {
    urls = multipleUrls;
  } else if (videoSource === "google_photos") {
    // Google Photos - use the album URL from config
    if (googlePhotosAlbumUrl) {
      urls.push(googlePhotosAlbumUrl);
      console.log("Google Photos album URL set");
    }
  } else if (videoSource === "bunny") {
    // Bunny CDN - videoUrl contains the bunny library URL
    if (videoUrl) urls.push(videoUrl);
  } else if (videoSource === "ftp") {
    // FTP - handled by separate script
    console.log("FTP source - using FTP download method");
    urls.push("ftp://placeholder"); // Placeholder, actual FTP download handled separately
  } else if (videoSource === "youtube" || videoSource === "youtube_channel") {
    // YouTube - use direct VIDEO_URL if provided, otherwise fetch from channel
    if (videoUrl) {
      urls.push(videoUrl);
    } else if (channelUrl) {
      console.log("Fetching from YouTube channel...");
      try {
        const out = execSync('yt-dlp --flat-playlist --playlist-end 20 --print url --dateafter now-' + videoDays + 'd "' + channelUrl + '"', {
          encoding: "utf-8", timeout: 60000
        });
        urls = out.trim().split("\n").filter(u => u.trim());
        if (urls.length > 0) {
          console.log("Found " + urls.length + " videos from channel");
        }
      } catch (e) {
        console.error("Channel fetch failed: " + e.message);
        process.exit(1);
      }
    }
  }

  if (urls.length === 0) { console.error("No URLs! VIDEO_SOURCE=" + videoSource); process.exit(1); }

  const url = urls[0];
  console.log("URL: " + url);

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isGooglePhotos = url.includes("photos.google") || url.includes("photos.app.goo.gl");
  const isDirectFile = url.match(/\.(mp4|mov|webm|mkv)$/i);

  // Run synchronously
  if (isGooglePhotos) {
    console.log("=== Google Photos Download ===");
    console.log("URL:", url);
    
    // Extract album ID from URL if possible
    const albumMatch = url.match(/AF1Qip[a-zA-Z0-9_-]+/);
    let albumId = albumMatch ? albumMatch[0] : null;
    
    // Try different yt-dlp methods
    let ok = false;
    
    // Method 1: Direct URL with Google Photos specific options
    console.log("Method 1: yt-dlp with direct URL...");
    ok = downloadWithYtDlp(url);
    console.log("Result:", ok ? "SUCCESS" : "FAILED");
    
    // Method 2: If we have album ID, try with photos.google.com/photos/share format
    if (!ok && albumId) {
      console.log("Method 2: Trying with album ID...");
      try {
        const albumUrl = "https://photos.google.com/photos/share/" + albumId;
        console.log("Album URL:", albumUrl);
        ok = downloadWithYtDlp(albumUrl);
      } catch(e) {
        console.log("Album ID method failed:", e.message);
      }
    }
    
    // Method 3: HTML parsing
    if (!ok) {
      console.log("Method 3: HTML parsing...");
      try {
        ok = await downloadGooglePhotos(url);
      } catch(e) {
        console.log("HTML parsing error:", e.message);
      }
    }

    if (!ok) {
      console.log("All Google Photos methods failed!");
    }
    finish(ok);
    return;
  } else if (isYouTube) {
    finish(downloadWithYtDlp(url));
    return;
  } else if (isDirectFile) {
    finish(downloadWithCurl(url));
    return;
  } else {
    let ok = downloadWithCurl(url);
    if (!ok) ok = downloadWithYtDlp(url);
    finish(ok);
    return;
  }
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

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
