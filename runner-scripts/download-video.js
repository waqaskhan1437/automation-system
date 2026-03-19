const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadDirect(url) {
  console.log("Downloading: " + url);
  const proto = url.startsWith("https") ? https : require("http");
  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
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
  console.log("Trying yt-dlp: " + url);
  try {
    execSync('yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "' + outFile + '" "' + url + '"', {
      stdio: "inherit",
      timeout: 600000
    });
    return true;
  } catch (e) {
    console.log("yt-dlp failed: " + e.message);
    return false;
  }
}

async function downloadFromGooglePhotos(url) {
  console.log("Google Photos detected: " + url);
  
  // Extract album/photo key from URL
  const keyMatch = url.match(/key=([A-Za-z0-9_-]+)/);
  const photoMatch = url.match(/photo\/([A-Za-z0-9_-]+)/);
  const albumMatch = url.match(/share\/([A-Za-z0-9_-]+)/);
  
  const mediaId = (keyMatch && keyMatch[1]) || (photoMatch && photoMatch[1]) || (albumMatch && albumMatch[1]);
  
  if (mediaId) {
    console.log("Media ID: " + mediaId);
    
    // Try direct Google content URL formats
    const directUrls = [
      "https://lh3.googleusercontent.com/" + mediaId + "=dv",
      "https://lh3.googleusercontent.com/" + mediaId + "=w1920-h1080",
      "https://photos.fife.usercontent.google.com/" + mediaId,
    ];
    
    for (const dUrl of directUrls) {
      console.log("Trying: " + dUrl);
      try {
        await downloadDirect(dUrl);
        if (fs.existsSync(VIDEO_FILE) && fs.statSync(VIDEO_FILE).size > 1000) {
          console.log("Downloaded from direct URL!");
          return true;
        }
      } catch (e) {
        console.log("Failed: " + e.message);
      }
    }
  }
  
  // Try yt-dlp as fallback
  console.log("Trying yt-dlp for Google Photos...");
  return downloadWithYtDlp(url);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const videoUrl = process.env.VIDEO_URL || "";
  const channelUrl = process.env.CHANNEL_URL || "";
  const multipleUrlsStr = process.env.MULTIPLE_URLS || "[]";
  const videosPerRun = parseInt(process.env.VIDEOS_PER_RUN || "1");

  let multipleUrls = [];
  try { multipleUrls = JSON.parse(multipleUrlsStr); } catch { 
    multipleUrls = multipleUrlsStr.split("\n").map(u => u.trim()).filter(Boolean); 
  }

  let urlsToDownload = [];
  if (videoUrl) urlsToDownload.push(videoUrl);
  if (multipleUrls.length > 0) urlsToDownload = urlsToDownload.concat(multipleUrls.slice(0, videosPerRun));
  
  if (urlsToDownload.length === 0 && channelUrl) {
    console.log("Fetching channel: " + channelUrl);
    try {
      const output = execSync('yt-dlp --flat-playlist --playlist-end ' + videosPerRun + ' --print url "' + channelUrl + '"', {
        encoding: "utf-8", timeout: 60000
      });
      urlsToDownload = output.trim().split("\n").filter(Boolean).slice(0, videosPerRun);
    } catch (e) {
      console.error("Channel fetch failed: " + e.message);
    }
  }

  if (urlsToDownload.length === 0) {
    console.error("No URLs to download!");
    process.exit(1);
  }

  console.log("Downloading " + urlsToDownload.length + " video(s)...\n");

  for (let i = 0; i < urlsToDownload.length; i++) {
    const url = urlsToDownload[i];
    const outputFile = i === 0 ? VIDEO_FILE : path.join(OUTPUT_DIR, "input-video-" + i + ".mp4");
    
    console.log("[" + (i + 1) + "/" + urlsToDownload.length + "] " + url);

    const isGooglePhotos = url.includes("photos.google.com") || url.includes("photos.app.goo.gl");
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

    if (isGooglePhotos) {
      if (i === 0) {
        await downloadFromGooglePhotos(url);
      } else {
        downloadWithYtDlp(url, outputFile);
      }
    } else if (isYouTube) {
      downloadWithYtDlp(url, outputFile);
    } else {
      try {
        console.log("Direct download...");
        await downloadDirect(url);
      } catch (e) {
        console.log("Direct failed, trying yt-dlp...");
        downloadWithYtDlp(url, outputFile);
      }
    }

    if (fs.existsSync(i === 0 ? VIDEO_FILE : outputFile)) {
      const stats = fs.statSync(i === 0 ? VIDEO_FILE : outputFile);
      console.log("Downloaded: " + (stats.size / 1024 / 1024).toFixed(2) + " MB\n");
    }
  }

  if (!fs.existsSync(VIDEO_FILE)) {
    console.error("No video downloaded!");
    process.exit(1);
  }

  console.log("Download complete!");
}

main().catch(err => {
  console.error("Failed: " + err.message);
  process.exit(1);
});
