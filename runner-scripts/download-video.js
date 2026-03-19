const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

// Simple direct download
function download(url) {
  console.log("Downloading: " + url);
  try {
    execSync('curl -L -o "' + VIDEO_FILE + '" "' + url + '" --max-time 120', {
      stdio: "inherit",
      timeout: 180000
    });
    return true;
  } catch (e) {
    console.log("curl failed: " + e.message);
    return false;
  }
}

// yt-dlp download
function downloadYtDlp(url) {
  console.log("yt-dlp: " + url);
  try {
    execSync('yt-dlp -f "best[ext=mp4]/best" --no-check-certificates -o "' + VIDEO_FILE + '" "' + url + '"', {
      stdio: "inherit",
      timeout: 300000
    });
    return true;
  } catch (e) {
    console.log("yt-dlp failed: " + e.message);
    return false;
  }
}

function main() {
  // Create output dir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get URLs
  const videoUrl = process.env.VIDEO_URL || "";
  const channelUrl = process.env.CHANNEL_URL || "";
  let multipleUrls = [];
  try {
    multipleUrls = JSON.parse(process.env.MULTIPLE_URLS || "[]");
  } catch {
    multipleUrls = (process.env.MULTIPLE_URLS || "").split("\n").filter(u => u.trim());
  }

  // Build URL list
  let urls = [];
  if (videoUrl) urls.push(videoUrl);
  if (multipleUrls.length > 0) urls = urls.concat(multipleUrls);
  if (urls.length === 0 && channelUrl) {
    // Get first video from channel
    try {
      const out = execSync('yt-dlp --flat-playlist --playlist-end 1 --print url "' + channelUrl + '"', {
        encoding: "utf-8", timeout: 30000
      });
      urls = out.trim().split("\n").filter(u => u.trim());
    } catch (e) {
      console.error("Channel fetch failed");
      process.exit(1);
    }
  }

  if (urls.length === 0) {
    console.error("No URLs!");
    process.exit(1);
  }

  // Download first URL only (fastest)
  const url = urls[0];
  console.log("URL: " + url);

  let success = false;
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isGooglePhotos = url.includes("photos.google") || url.includes("photos.app.goo.gl");
  const isDirectUrl = url.endsWith(".mp4") || url.endsWith(".mov") || url.endsWith(".webm");

  if (isDirectUrl) {
    // Direct URL - use curl
    success = download(url);
  } else {
    // YouTube, Google Photos, etc - use yt-dlp
    success = downloadYtDlp(url);
  }

  // Verify
  if (!success || !fs.existsSync(VIDEO_FILE)) {
    console.error("Download FAILED!");
    process.exit(1);
  }

  const size = fs.statSync(VIDEO_FILE).size;
  console.log("Downloaded: " + (size / 1024 / 1024).toFixed(2) + " MB");
  console.log("SUCCESS!");
  
  // Force exit to prevent hanging
  process.exit(0);
}

main();
