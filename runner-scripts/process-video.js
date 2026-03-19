const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function parseResolution(resStr) {
  const parts = resStr.split("x");
  return { width: parseInt(parts[0]), height: parseInt(parts[1]) };
}

function buildFFmpegCommand() {
  const args = ["-i", INPUT_FILE];

  const shortDuration = parseInt(process.env.SHORT_DURATION || "60");
  const playbackSpeed = parseFloat(process.env.PLAYBACK_SPEED || "1");
  const aspectRatio = process.env.ASPECT_RATIO || "9:16";
  const cropMode = process.env.CROP_MODE || "crop";
  const codec = process.env.CODEC || "libx264";
  const outputResolution = process.env.OUTPUT_RESOLUTION || "1080x1920";
  const topTagline = process.env.TOP_TAGLINE || "";
  const bottomTagline = process.env.BOTTOM_TAGLINE || "";

  const { width, height } = parseResolution(outputResolution);

  const videoFilters = [];

  // Trim to short duration
  args.push("-t", String(shortDuration));

  // Playback speed
  if (playbackSpeed !== 1) {
    const speedFilter = `setpts=${1 / playbackSpeed}*PTS`;
    const audioFilter = `atempo=${playbackSpeed}`;
    videoFilters.push(speedFilter);
    args.push("-af", audioFilter);
  }

  // Aspect ratio handling
  if (aspectRatio !== "no-crop") {
    if (cropMode === "crop") {
      // Crop to fill frame
      videoFilters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`);
      videoFilters.push(`crop=${width}:${height}`);
    } else {
      // Fit with black bars (letterbox/pillarbox)
      videoFilters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
      videoFilters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
    }
  }

  // Top tagline overlay
  if (topTagline) {
    const escapedText = topTagline.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    videoFilters.push(
      `drawtext=text='${escapedText}':fontsize=36:fontcolor=white:borderw=3:bordercolor=black:x=(w-tw)/2:y=30`
    );
  }

  // Bottom tagline overlay
  if (bottomTagline) {
    const escapedText = bottomTagline.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    videoFilters.push(
      `drawtext=text='${escapedText}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h-th-30`
    );
  }

  if (videoFilters.length > 0) {
    args.push("-vf", videoFilters.join(","));
  }

  // Codec
  args.push("-c:v", codec);
  args.push("-c:a", "aac");

  // Quality settings
  const quality = process.env.OUTPUT_QUALITY || "high";
  if (quality === "low") {
    args.push("-crf", "28");
  } else if (quality === "medium") {
    args.push("-crf", "23");
  } else {
    args.push("-crf", "18");
  }

  args.push("-y", OUTPUT_FILE);
  return args;
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("Input video not found:", INPUT_FILE);
    process.exit(1);
  }

  console.log("Building FFmpeg command...");
  const ffmpegArgs = buildFFmpegCommand();
  const command = `ffmpeg ${ffmpegArgs.join(" ")}`;

  console.log("Executing:", command);
  console.log("");

  try {
    execSync(command, { stdio: "inherit", timeout: 600000 });
  } catch (err) {
    console.error("FFmpeg processing failed:", err.message);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("Output video not created");
    process.exit(1);
  }

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`\nVideo processed successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main();
