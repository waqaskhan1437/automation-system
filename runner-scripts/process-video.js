const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function parseTaglines(envVar) {
  if (!envVar) return [];
  try {
    const parsed = JSON.parse(envVar);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return envVar ? [envVar] : [];
  }
}

function getRandomTagline(taglines) {
  if (!taglines || taglines.length === 0) return null;
  return taglines[Math.floor(Math.random() * taglines.length)];
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("Input video not found at: " + INPUT_FILE);
    process.exit(1);
  }

  const inputSize = fs.statSync(INPUT_FILE).size;
  console.log("Input: " + (inputSize / 1024 / 1024).toFixed(2) + " MB");

  let config = {};
  try {
    const configPath = path.join(process.cwd(), "automation-config.json");
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (e) {
    console.log("Could not read config: " + e.message);
  }

  const duration = parseInt(config.short_duration || config.shortDuration || process.env.SHORT_DURATION || "60");
  const aspectRatio = config.aspect_ratio || config.aspectRatio || "9:16";
  const playbackSpeed = parseFloat(config.playback_speed || config.playbackSpeed || process.env.PLAYBACK_SPEED || "1.0");
  const watermarkText = config.watermark_text || "";
  const watermarkPosition = config.watermark_position || "bottomright";
  const brandingTop = config.branding_text_top || "";
  const brandingBottom = config.branding_text_bottom || "";
  const topTaglines = parseTaglines(Array.isArray(config.top_taglines) ? config.top_taglines : process.env.TOP_TAGLINES);
  const bottomTaglines = parseTaglines(Array.isArray(config.bottom_taglines) ? config.bottom_taglines : process.env.BOTTOM_TAGLINES);
  const outputFormat = config.output_format || "mp4";
  const outputQuality = config.output_quality || "high";

  let width = 1080, height = 1920;
  if (aspectRatio === "16:9") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1") { width = 1080; height = 1080; }
  else if (aspectRatio === "16:9-fit") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1-fit") { width = 1080; height = 1080; }
  else if (aspectRatio === "9:16-fit") { width = 1080; height = 1920; }

  const isFitMode = aspectRatio.includes("fit");

  let filterComplex = "";
  let filters = [];

  // Speed adjustment
  if (playbackSpeed !== 1.0) {
    const pts = 1.0 / playbackSpeed;
    filters.push(`setpts=${pts.toFixed(2)}*PTS`);
  }

  // Scale and pad
  if (isFitMode) {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
  } else {
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`);
    filters.push(`crop=${width}:${height}`);
  }

  // Top tagline text overlay
  const topTagline = getRandomTagline(topTaglines);
  if (topTagline) {
    filters.push(`drawtext=text='${topTagline.replace(/'/g, "\\'")}':fontsize=36:fontcolor=white:fontfile=${FONT_PATH}:x=(w-text_w)/2:y=40:shadowcolor=black:shadowx=2:shadowy=2`);
  }

  // Branding top
  if (brandingTop) {
    const fontSize = 28;
    filters.push(`drawtext=text='${brandingTop.replace(/'/g, "\\'")}':fontsize=${fontSize}:fontcolor=white:fontfile=${FONT_PATH}:x=(w-text_w)/2:y=5:shadowcolor=black:shadowx=2:shadowy=2`);
  }

  // Branding bottom
  if (brandingBottom) {
    const fontSize = 28;
    filters.push(`drawtext=text='${brandingBottom.replace(/'/g, "\\'")}':fontsize=${fontSize}:fontcolor=white:fontfile=${FONT_PATH}:x=(w-text_w)/2:y=h-${fontSize * 2}:shadowcolor=black:shadowx=2:shadowy=2`);
  }

  // Bottom tagline text overlay
  const btmTagline = getRandomTagline(bottomTaglines);
  if (btmTagline) {
    const yPos = height - 100;
    filters.push(`drawtext=text='${btmTagline.replace(/'/g, "\\'")}':fontsize=36:fontcolor=white:fontfile=${FONT_PATH}:x=(w-text_w)/2:y=${yPos}:shadowcolor=black:shadowx=2:shadowy=2`);
  }

  // Watermark
  if (watermarkText) {
    let wx = "(w-text_w-20)", wy = "(h-text_h-20)";
    if (watermarkPosition === "topleft") { wx = "20"; wy = "20"; }
    else if (watermarkPosition === "topright") { wx = "(w-text_w-20)"; wy = "20"; }
    else if (watermarkPosition === "bottomleft") { wx = "20"; wy = "(h-text_h-20)"; }
    else if (watermarkPosition === "bottomright") { wx = "(w-text_w-20)"; wy = "(h-text_h-20)"; }
    const wmSize = 20;
    filters.push(`drawtext=text='${watermarkText.replace(/'/g, "\\'")}':fontsize=${wmSize}:fontcolor=white@0.7:fontfile=${FONT_PATH}:${wx}:${wy}:shadowcolor=black:shadowx=1:shadowy=1`);
  }

  // Fade in/out
  filters.push(`fade=t=in:st=0:d=0.5`);
  filters.push(`fade=t=out:st=${duration - 0.5}:d=0.5`);

  filterComplex = filters.join(",");

  // Quality settings
  let crf = "23";
  let preset = "fast";
  if (outputQuality === "high") { crf = "18"; preset = "medium"; }
  else if (outputQuality === "low") { crf = "28"; preset = "ultrafast"; }

  const outputExt = outputFormat === "webm" ? "webm" : "mp4";
  const outputFile = OUTPUT_FILE.replace(".mp4", `.${outputExt}`);
  const videoCodec = outputFormat === "webm" ? "libvpx-vp9" : "libx264";
  const audioCodec = outputFormat === "webm" ? "libopus" : "aac";

  let cmd = `ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -vf "${filterComplex}" -c:v ${videoCodec} -preset ${preset} -crf ${crf} -c:a ${audioCodec} -pix_fmt yuv420p "${outputFile}"`;

  console.log("Processing video...");
  console.log(`Duration: ${duration}s, Aspect: ${aspectRatio}, Quality: ${outputQuality}`);
  if (topTagline) console.log(`Top tagline: ${topTagline}`);
  if (btmTagline) console.log(`Bottom tagline: ${btmTagline}`);
  if (watermarkText) console.log(`Watermark: ${watermarkText}`);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
  } catch (e) {
    console.error("FFmpeg failed, trying fallback...");
    try {
      execSync(`ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -c copy "${outputFile}"`, {
        stdio: "inherit", timeout: 300000
      });
    } catch (e2) {
      console.error("Fallback also failed: " + e2.message);
      process.exit(1);
    }
  }

  if (!fs.existsSync(outputFile)) {
    console.error("Output not created!");
    process.exit(1);
  }

  const outputSize = fs.statSync(outputFile).size;
  console.log("Output: " + (outputSize / 1024 / 1024).toFixed(2) + " MB");
  console.log("SUCCESS!");
  process.exit(0);
}

main();
