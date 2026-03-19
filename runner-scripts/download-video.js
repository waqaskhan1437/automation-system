const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

function downloadWithYtDlp(url) {
  console.log(`Downloading: ${url}`);
  try {
    execSync(
      `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${VIDEO_FILE}" "${url}"`,
      { stdio: "inherit", timeout: 600000 }
    );
    return true;
  } catch (err) {
    console.error("yt-dlp failed, trying simpler format...");
    try {
      execSync(
        `yt-dlp -f "best" -o "${VIDEO_FILE}" "${url}"`,
        { stdio: "inherit", timeout: 600000 }
      );
      return true;
    } catch (err2) {
      console.error("Download failed:", err2.message);
      return false;
    }
  }
}

function downloadDirect(url) {
  console.log(`Downloading direct: ${url}`);
  const https = require("https");
  const http = require("http");
  const proto = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadDirect(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(VIDEO_FILE);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
      file.on("error", reject);
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

  if (videoUrl) {
    urlsToDownload.push(videoUrl);
  }

  if (channelUrl) {
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

  if (multipleUrls.length > 0) {
    urlsToDownload.push(...multipleUrls.slice(0, videosPerRun));
  }

  if (urlsToDownload.length === 0) {
    console.error("No URLs to download!");
    process.exit(1);
  }

  console.log(`\nDownloading ${urlsToDownload.length} video(s)...`);

  for (let i = 0; i < urlsToDownload.length; i++) {
    const url = urlsToDownload[i];
    const outputFile = i === 0 ? VIDEO_FILE : path.join(OUTPUT_DIR, `input-video-${i}.mp4`);

    console.log(`\n[${i + 1}/${urlsToDownload.length}] ${url}`);

    if (source === "direct") {
      try {
        await downloadDirect(url);
      } catch (err) {
        console.error("Direct download failed:", err.message);
        continue;
      }
    } else {
      if (i > 0) {
        const origFile = VIDEO_FILE;
        const tempFile = outputFile;
        try {
          execSync(
            `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${tempFile}" "${url}"`,
            { stdio: "inherit", timeout: 600000 }
          );
        } catch (err) {
          console.error("Download failed:", err.message);
          continue;
        }
      } else {
        if (!downloadWithYtDlp(url)) {
          continue;
        }
      }
    }

    if (fs.existsSync(i === 0 ? VIDEO_FILE : outputFile)) {
      const stats = fs.statSync(i === 0 ? VIDEO_FILE : outputFile);
      console.log(`Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  if (!fs.existsSync(VIDEO_FILE)) {
    console.error("No video files downloaded!");
    process.exit(1);
  }

  console.log("\nDownload complete!");
}

main().catch((err) => {
  console.error("Download failed:", err.message);
  process.exit(1);
});
