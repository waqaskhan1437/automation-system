const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-image.png");

async function downloadImage(url) {
  console.log(`Downloading image from: ${url}`);
  const proto = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(OUTPUT_FILE);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

function generatePlaceholderImage(config) {
  console.log("Generating placeholder image with FFmpeg...");

  const width = config.width || 1080;
  const height = config.height || 1080;
  const bgColor = config.background_color || "black";
  const text = config.placeholder_text || "Automation";
  const textColor = config.text_color || "white";
  const textSize = config.text_size || 48;

  const filters = [];

  filters.push(`color=${bgColor}:${width}x${height}:d=1`);
  filters.push(`drawtext=text='${text}':fontsize=${textSize}:fontcolor=${textColor}:x=(w-tw)/2:y=(h-th)/2`);

  if (config.watermark_text) {
    const pos = config.watermark_position || "bottomright";
    const positions = {
      topleft: "x=10:y=10",
      topright: "x=w-tw-10:y=10",
      bottomleft: "x=10:y=h-th-10",
      bottomright: "x=w-tw-10:y=h-th-10",
      center: "x=(w-tw)/2:y=(h-th)/2",
    };
    const positionFilter = positions[pos] || positions.bottomright;
    filters.push(`drawtext=text='${config.watermark_text}':fontsize=16:fontcolor=gray@0.5:${positionFilter}`);
  }

  const filterString = filters.join(",");

  const command = `ffmpeg -f lavfi -i "${filterString}" -frames:v 1 -y "${OUTPUT_FILE}"`;

  console.log("Executing:", command);

  try {
    execSync(command, { stdio: "inherit", timeout: 30000 });
  } catch (err) {
    console.error("Image generation failed:", err.message);
    process.exit(1);
  }
}

async function processImage(config) {
  if (config.width || config.height || config.filters) {
    const resizeArgs = [];

    if (config.width && config.height) {
      resizeArgs.push(`scale=${config.width}:${config.height}`);
    }

    if (config.filters) {
      resizeArgs.push(config.filters);
    }

    if (resizeArgs.length > 0) {
      const tempFile = OUTPUT_FILE + ".tmp";
      fs.renameSync(OUTPUT_FILE, tempFile);

      const command = `ffmpeg -i "${tempFile}" -vf "${resizeArgs.join(",")}" -y "${OUTPUT_FILE}"`;

      try {
        execSync(command, { stdio: "inherit", timeout: 30000 });
        fs.unlinkSync(tempFile);
      } catch (err) {
        fs.renameSync(tempFile, OUTPUT_FILE);
        console.error("Image processing failed:", err.message);
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const source = process.env.IMAGE_SOURCE;
  const imageUrl = process.env.IMAGE_URL;
  const placeholderText = process.env.PLACEHOLDER_TEXT;
  const configJson = process.env.IMAGE_CONFIG;

  if (!source) {
    console.error("IMAGE_SOURCE environment variable is required");
    process.exit(1);
  }

  let config = {};
  if (configJson) {
    try {
      const parsed = JSON.parse(configJson);
      config = parsed.image_config || parsed;
    } catch (err) {
      console.error("Invalid IMAGE_CONFIG JSON:", err.message);
    }
  }

  if (placeholderText && !config.placeholder_text) {
    config.placeholder_text = placeholderText;
  }

  console.log(`Source: ${source}`);
  console.log("Config:", JSON.stringify(config, null, 2));

  switch (source) {
    case "url":
      if (!imageUrl) {
        console.error("IMAGE_URL is required for url source");
        process.exit(1);
      }
      await downloadImage(imageUrl);
      break;
    case "placeholder":
      generatePlaceholderImage(config);
      break;
    default:
      console.error(`Unknown image source: ${source}`);
      process.exit(1);
  }

  await processImage(config);

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("Image processing failed - file not found");
    process.exit(1);
  }

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`Image ready: ${(stats.size / 1024).toFixed(2)} KB`);
}

main().catch((err) => {
  console.error("Image generation failed:", err.message);
  process.exit(1);
});
