const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const VIDEO_FILE = path.join(OUTPUT_DIR, "input-video.mp4");

async function downloadDirect(url) {
  console.log(`Downloading video from: ${url}`);
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
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadYouTube(url) {
  console.log(`Downloading YouTube video: ${url}`);
  try {
    execSync(`yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${VIDEO_FILE}" "${url}"`, {
      stdio: "inherit",
      timeout: 600000,
    });
  } catch (err) {
    console.error("yt-dlp failed, trying with cookies...");
    const cookies = process.env.YOUTUBE_COOKIES;
    if (cookies) {
      const cookieFile = path.join(OUTPUT_DIR, "cookies.txt");
      fs.writeFileSync(cookieFile, cookies);
      execSync(`yt-dlp --cookies "${cookieFile}" -f "best[ext=mp4]" -o "${VIDEO_FILE}" "${url}"`, {
        stdio: "inherit",
        timeout: 600000,
      });
    } else {
      throw err;
    }
  }
}

async function downloadBunny(url) {
  console.log(`Downloading from Bunny CDN: ${url}`);
  const libraryId = process.env.BUNNY_LIBRARY_ID;
  const apiKey = process.env.BUNNY_API_KEY;

  if (!libraryId || !apiKey) {
    throw new Error("BUNNY_API_KEY and BUNNY_LIBRARY_ID are required");
  }

  const videoId = url.split("/").pop().split("?")[0];
  const bunnyUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;

  const directUrl = `https://vz-${libraryId}.b-cdn.net/${videoId}/play_720p.mp4`;
  console.log(`Fetching from: ${directUrl}`);
  await downloadDirect(directUrl);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const source = process.env.VIDEO_SOURCE;
  const url = process.env.VIDEO_URL;

  if (!source || !url) {
    console.error("VIDEO_SOURCE and VIDEO_URL environment variables are required");
    process.exit(1);
  }

  console.log(`Source: ${source}`);
  console.log(`URL: ${url}`);

  switch (source) {
    case "direct":
      await downloadDirect(url);
      break;
    case "youtube":
      await downloadYouTube(url);
      break;
    case "bunny":
      await downloadBunny(url);
      break;
    default:
      console.error(`Unknown video source: ${source}`);
      process.exit(1);
  }

  if (!fs.existsSync(VIDEO_FILE)) {
    console.error("Video download failed - file not found");
    process.exit(1);
  }

  const stats = fs.statSync(VIDEO_FILE);
  console.log(`Video downloaded successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("Download failed:", err.message);
  process.exit(1);
});
