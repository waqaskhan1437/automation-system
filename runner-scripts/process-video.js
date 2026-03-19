const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function buildFFmpegCommand(config) {
  const args = ["-i", INPUT_FILE];

  if (config.trim_start) {
    args.push("-ss", config.trim_start);
  }
  if (config.trim_end) {
    args.push("-to", config.trim_end);
  }

  const videoFilters = [];

  if (config.resize) {
    videoFilters.push(`scale=${config.resize}`);
  }

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
    videoFilters.push(`drawtext=text='${config.watermark_text}':fontsize=24:fontcolor=white@0.7:${positionFilter}`);
  }

  if (config.overlay_text) {
    const pos = config.overlay_position || "center";
    const positions = {
      topleft: "x=50:y=50",
      topright: "x=w-tw-50:y=50",
      bottomleft: "x=50:y=h-th-50",
      bottomright: "x=w-tw-50:y=h-th-50",
      center: "x=(w-tw)/2:y=(h-th)/2",
    };
    const positionFilter = positions[pos] || positions.center;
    videoFilters.push(`drawtext=text='${config.overlay_text}':fontsize=48:fontcolor=white:borderw=3:bordercolor=black:${positionFilter}`);
  }

  if (config.fps) {
    videoFilters.push(`fps=${config.fps}`);
  }

  if (videoFilters.length > 0) {
    args.push("-vf", videoFilters.join(","));
  }

  if (config.codec) {
    args.push("-c:v", config.codec);
  } else {
    args.push("-c:v", "libx264");
  }

  if (config.audio_codec) {
    args.push("-c:a", config.audio_codec);
  }

  if (config.custom_args) {
    args.push(...config.custom_args.split(" ").filter(Boolean));
  }

  args.push("-y", OUTPUT_FILE);
  return args;
}

function main() {
  const configJson = process.env.FFMPEG_CONFIG;

  if (!configJson) {
    console.error("FFMPEG_CONFIG environment variable is required");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error("Input video not found:", INPUT_FILE);
    process.exit(1);
  }

  let config;
  try {
    const parsed = JSON.parse(configJson);
    config = parsed.ffmpeg_config || parsed;
  } catch (err) {
    console.error("Invalid FFMPEG_CONFIG JSON:", err.message);
    process.exit(1);
  }

  console.log("FFmpeg Config:", JSON.stringify(config, null, 2));

  const ffmpegArgs = buildFFmpegCommand(config);
  const command = `ffmpeg ${ffmpegArgs.join(" ")}`;

  console.log("Executing:", command);

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
  console.log(`Video processed successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main();
