const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadDirect(url, outputFile) {
  console.log(`Downloading: ${url}`);
  const proto = url.startsWith("https") ? https : http;
  const file = outputFile || VIDEO_FILE;

  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadDirect(res.headers.location, file).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(file);
      res.pipe(ws);
      ws.on("finish", () => { ws.close(); resolve(true); });
      ws.on("error", reject);
    }).on("error", reject);
  });
}

function downloadWithYtDlp(url, outputFile) {
  const file = outputFile || VIDEO_FILE;
  console.log(`Downloading with yt-dlp: ${url}`);
  try {
    execSync(
      `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${file}" "${url}"`,
      { stdio: "inherit", timeout: 600000 }
    );
    return true;
  } catch (err) {
    console.error("yt-dlp failed:", err.message);
    return false;
  }
}

async function downloadFromGooglePhotos(url) {
  console.log("Detected Google Photos URL, trying to extract video...");

  // Try to get the direct video URL from Google Photos
  // Google Photos shared links format: https://photos.app.goo.gl/XXXXX
  // They redirect to: https://photos.google.com/share/XXXXX or https://photos.google.com/photo/XXXXX

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      let finalUrl = res.headers.location || url;

      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        // Try to extract video URL from the page
        // Google Photos embeds video URLs in the page source
        const videoUrlMatch = data.match(/https:\/\/video\.googleusercontent\.com\/[^"'\s]+/);
        const lh3Match = data.match(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s]+/);

        if (videoUrlMatch) {
          console.log("Found Google Photos video URL");
          resolve(videoUrlMatch[0]);
        } else if (lh3Match) {
          console.log("Found lh3 URL");
          resolve(lh3Match[0]);
        } else {
          reject(new Error("Could not extract video URL from Google Photos. Please provide a direct video URL."));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const source = process.env.VIDEO_SOURCE || "direct";
  const videoUrl = process.env.VIDEO_URL || "";
  const channelUrl = process.env.CHANNEL_URL || "";
  const multipleUrlsStr = process.env.MULTIPLE_URLS || "[]";
  const videosPerRun = parseInt(process.env.VIDEOS_PER_RUN || "1");

  let multipleUrls = [];
  try {
    multipleUrls = JSON.parse(multipleUrlsStr);
  } catch {
    multipleUrls = multipleUrlsStr.split("\n").map((u) => u.trim()).filter(Boolean);
  }

  console.log(`Source: ${source}`);
  console.log(`Video URL: ${videoUrl}`);
  console.log(`Channel URL: ${channelUrl}`);
  console.log(`Multiple URLs: ${JSON.stringify(multipleUrls)}`);
  console.log(`Videos per run: ${videosPerRun}`);

  let urlsToDownload = [];

  if (videoUrl) urlsToDownload.push(videoUrl);
  if (multipleUrls.length > 0) urlsToDownload.push(...multipleUrls.slice(0, videosPerRun));

  if (urlsToDownload.length === 0 && channelUrl) {
    console.log(`Fetching channel: ${channelUrl}`);
    try {
      const output = execSync(
        `yt-dlp --flat-playlist --playlist-end ${videosPerRun} --print url "${channelUrl}"`,
        { encoding: "utf-8", timeout: 60000 }
      );
      const channelVideos = output.trim().split("\n").filter(Boolean);
      urlsToDownload.push(...channelVideos.slice(0, videosPerRun));
    } catch (err) {
      console.error("Failed to fetch channel videos:", err.message);
    }
  }

  if (urlsToDownload.length === 0) {
    console.error("No URLs to download!");
    process.exit(1);
  }

  console.log(`\nDownloading ${urlsToDownload.length} video(s)...\n`);

  for (let i = 0; i < urlsToDownload.length; i++) {
    const url = urlsToDownload[i];
    const outputFile = i === 0 ? VIDEO_FILE : path.join(OUTPUT_DIR, `input-video-${i}.mp4`);

    console.log(`[${i + 1}/${urlsToDownload.length}] Processing: ${url}`);

    // Check if it's a Google Photos URL
    const isGooglePhotos = url.includes("photos.google.com") || url.includes("photos.app.goo.gl") || url.includes("googleusercontent.com");

    if (isGooglePhotos) {
      console.log("Google Photos detected, trying to download...");
      try {
        // Try to extract direct video URL
        const directUrl = await downloadFromGooglePhotos(url);
        console.log(`Extracted URL: ${directUrl}`);
        await downloadDirect(directUrl, outputFile);
      } catch (err) {
        console.log(`Direct extraction failed: ${err.message}`);
        console.log("Trying yt-dlp...");
        if (!downloadWithYtDlp(url, outputFile)) {
          console.error("Failed to download from Google Photos.");
          console.log("TIP: Open the video in Google Photos, right-click → Copy video address, and use that URL.");
          continue;
        }
      }
    } else if (source === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
      if (!downloadWithYtDlp(url, outputFile)) continue;
    } else {
      // Direct URL
      try {
        await downloadDirect(url, outputFile);
      } catch (err) {
        console.error("Direct download failed:", err.message);
        console.log("Trying yt-dlp...");
        if (!downloadWithYtDlp(url, outputFile)) continue;
      }
    }

    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile);
      console.log(`Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);
    }
  }

  if (!fs.existsSync(VIDEO_FILE)) {
    console.error("No video files downloaded!");
    process.exit(1);
  }

  console.log("Download complete!");
}

main().catch((err) => {
  console.error("Download failed:", err.message);
  process.exit(1);
});
