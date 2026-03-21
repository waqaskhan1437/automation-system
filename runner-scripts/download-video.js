const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadWithCurl(url) {
  console.log("curl: " + url.substring(0, 60) + "...");
  try {
    execSync('curl -L -o "' + VIDEO_FILE + '" "' + url + '" --max-time 180 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.5"', {
      stdio: "inherit", timeout: 200000
    });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
  } catch { return false; }
}

function downloadWithYtDlp(url) {
  console.log("yt-dlp: " + url);
  try {
    execSync('yt-dlp --extractor-args "googlephotos:download=true" -f "best[ext=mp4]/best" --no-check-certificates -o "' + VIDEO_FILE + '" "' + url + '"', {
      stdio: "inherit", timeout: 600000
    });
    return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
  } catch { 
    console.log("yt-dlp failed, trying alternative method...");
    try {
      execSync('yt-dlp --no-check-certificates -o "' + VIDEO_FILE + '" --add-header "User-Agent: Mozilla/5.0" "' + url + '"', {
        stdio: "inherit", timeout: 600000
      });
      return fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 50000;
    } catch { return false; }
  }
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
  console.log("Google Photos: extracting video...");
  return new Promise((resolve) => {
    // First try to fetch the page and look for video download URLs
    fetchPage(url).then(html => {
      console.log("HTML fetched, looking for video URLs...");
      
      // Look for video-downloads.googleusercontent.com URLs
      const videoDownloadMatches = html.match(/https:\/\/video-downloads\.googleusercontent\.com\/[^\"'\s\\]+/g);
      if (videoDownloadMatches && videoDownloadMatches.length > 0) {
        console.log("Found video-downloads URL!");
        const videoUrl = videoDownloadMatches[0].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
        console.log("Download URL:", videoUrl.substring(0, 80) + "...");
        if (downloadWithCurl(videoUrl)) {
          resolve(true);
          return;
        }
      }
      
      // Look for lh3 URLs (alternative)
      const allMatches = html.match(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s\\]+/g) || [];
      console.log("Found " + allMatches.length + " lh3 URLs");
      
      for (const match of allMatches) {
        const cleanUrl = match.replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
        // Skip thumbnails
        if (cleanUrl.match(/=w\d+-h\d+/)) continue;
        if (cleanUrl.match(/=s\d+/)) continue;
        
        console.log("Trying:", cleanUrl.substring(0, 60) + "...");
        if (downloadWithCurl(cleanUrl)) {
          const size = fs.statSync(VIDEO_FILE).size;
          if (size > 50000) {
            console.log("Downloaded: " + (size / 1024 / 1024).toFixed(2) + " MB");
            resolve(true);
            return;
          }
        }
      }
      
      console.log("Google Photos extraction failed");
      resolve(false);
    }).catch(e => {
      console.log("Google Photos fetch failed:", e.message);
      resolve(false);
    });
  });
}

function main() {
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
    
    // Step 1: Try HTML parsing to extract video-downloads.googleusercontent.com URL
    console.log("Step 1: Extracting video URL from Google Photos page...");
    let ok = false;
    try {
      ok = await downloadGooglePhotos(url);
    } catch(e) {
      console.log("HTML parsing error:", e.message);
    }
    console.log("HTML parsing result:", ok ? "SUCCESS" : "FAILED");
    
    if (!ok) {
      // Step 2: Try yt-dlp as fallback
      console.log("Step 2: Trying yt-dlp...");
      ok = downloadWithYtDlp(url);
      console.log("yt-dlp result:", ok ? "SUCCESS" : "FAILED");
    }
    
    if (!ok) {
      console.log("All Google Photos methods failed!");
      finish(false);
      return;
    }
      return;
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

main();
