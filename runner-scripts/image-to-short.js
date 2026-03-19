const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const IMAGE_FILE = path.join(OUTPUT_DIR, "input-image.jpg");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function downloadImage(url) {
  console.log(`Downloading image: ${url}`);
  const proto = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(IMAGE_FILE);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
      file.on("error", reject);
    }).on("error", reject);
  });
}

function downloadFromGooglePhotos(url) {
  // Try to extract direct image URL from Google Photos
  // This won't work for private albums but let's try
  const idMatch = url.match(/photo/([A-Za-z0-9_-]+)/);
  if (idMatch) {
    const photoId = idMatch[1];
    const directUrl = `https://lh3.googleusercontent.com/${photoId}=w1920-h1080`;
    console.log(`Trying direct URL: ${directUrl}`);
    return downloadImage(directUrl);
  }
  throw new Error("Cannot extract direct URL from Google Photos. Please provide a direct image URL.");
}

function createShortFromImage(inputImage, outputVideo) {
  const duration = parseInt(process.env.VIDEO_DURATION || "10");
  const aspectRatio = process.env.ASPECT_RATIO || "9:16";
  const topTagline = process.env.TOP_TAGLINE || "";
  const bottomTagline = process.env.BOTTOM_TAGLINE || "";
  const bgColor = process.env.BG_COLOR || "black";
  const animation = process.env.ANIMATION || "zoom";
  const fontSize = parseInt(process.env.FONT_SIZE || "36");

  let width, height;
  if (aspectRatio === "9:16") {
    width = 1080; height = 1920;
  } else if (aspectRatio === "16:9") {
    width = 1920; height = 1080;
  } else if (aspectRatio === "1:1") {
    width = 1080; height = 1080;
  } else {
    width = 1080; height = 1920;
  }

  let videoFilters = [];

  // Scale image to fit and add animation
  if (animation === "zoom") {
    // Slow zoom in effect
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else if (animation === "pan") {
    // Pan effect
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='1':x='(iw-iw/zoom)*on/${duration * 25}':y='0':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else if (animation === "kenburns") {
    // Ken Burns effect
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='if(eq(on,1),1,zoom+0.001)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else {
    // Static with fade
    videoFilters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${bgColor}`
    );
  }

  // Top tagline
  if (topTagline) {
    const escapedText = topTagline.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    videoFilters.push(
      `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=(w-tw)/2:y=50:enable='between(t,0,${duration})'`
    );
  }

  // Bottom tagline
  if (bottomTagline) {
    const escapedText = bottomTagline.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    videoFilters.push(
      `drawtext=text='${escapedText}':fontsize=${fontSize - 8}:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h-th-50:enable='between(t,0,${duration})'`
    );
  }

  // Fade in/out
  videoFilters.push(
    `fade=t=in:st=0:d=0.5`,
    `fade=t=out:st=${duration - 0.5}:d=0.5`
  );

  const filterString = videoFilters.join(",");
  const command = `ffmpeg -loop 1 -i "${inputImage}" -vf "${filterString}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -r 25 -y "${outputVideo}"`;

  console.log("Executing:", command);
  console.log("");

  try {
    execSync(command, { stdio: "inherit", timeout: 120000 });
  } catch (err) {
    console.error("FFmpeg failed:", err.message);
    process.exit(1);
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const imageUrl = process.env.IMAGE_URL || "";
  const googlePhotosUrl = process.env.GOOGLE_PHOTOS_URL || "";
  const localImagePath = process.env.LOCAL_IMAGE_PATH || "";

  let imageSource = imageUrl || googlePhotosUrl || localImagePath;

  if (!imageSource) {
    console.error("No image source provided! Set IMAGE_URL, GOOGLE_PHOTOS_URL, or LOCAL_IMAGE_PATH");
    process.exit(1);
  }

  console.log(`Image source: ${imageSource}`);

  // Download image
  if (googlePhotosUrl) {
    try {
      await downloadFromGooglePhotos(googlePhotosUrl);
    } catch (err) {
      console.error("Google Photos download failed:", err.message);
      console.log("Trying as regular URL...");
      await downloadImage(googlePhotosUrl);
    }
  } else if (imageUrl) {
    await downloadImage(imageUrl);
  } else if (localImagePath) {
    if (fs.existsSync(localImagePath)) {
      fs.copyFileSync(localImagePath, IMAGE_FILE);
    } else {
      console.error("Local image not found:", localImagePath);
      process.exit(1);
    }
  }

  if (!fs.existsSync(IMAGE_FILE)) {
    console.error("Image download failed!");
    process.exit(1);
  }

  const stats = fs.statSync(IMAGE_FILE);
  console.log(`Image downloaded: ${(stats.size / 1024).toFixed(2)} KB`);

  // Create short from image
  console.log("\nCreating short from image...");
  createShortFromImage(IMAGE_FILE, OUTPUT_FILE);

  if (fs.existsSync(OUTPUT_FILE)) {
    const outStats = fs.statSync(OUTPUT_FILE);
    console.log(`\nShort created: ${(outStats.size / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
