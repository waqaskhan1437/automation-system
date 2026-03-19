const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("Input not found: " + INPUT_FILE);
    process.exit(1);
  }

  const stats = fs.statSync(INPUT_FILE);
  console.log("Input: " + (stats.size / 1024 / 1024).toFixed(2) + " MB");

  const duration = parseInt(process.env.SHORT_DURATION || "60");
  const speed = parseFloat(process.env.PLAYBACK_SPEED || "1");
  const aspectRatio = process.env.ASPECT_RATIO || "9:16";
  const cropMode = process.env.CROP_MODE || "crop";
  const codec = process.env.CODEC || "libx264";

  let width = 1080, height = 1920;
  if (aspectRatio === "16:9") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1") { width = 1080; height = 1080; }

  const filters = [];

  // Scale
  if (cropMode === "crop") {
    filters.push("scale=" + width + ":" + height + ":force_original_aspect_ratio=increase");
    filters.push("crop=" + width + ":" + height);
  } else {
    filters.push("scale=" + width + ":" + height + ":force_original_aspect_ratio=decrease");
    filters.push("pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2:black");
  }

  // Speed
  if (speed !== 1) {
    filters.push("setpts=" + (1 / speed) + "*PTS");
  }

  // Fade
  if (duration > 1) {
    filters.push("fade=t=in:st=0:d=0.5");
    filters.push("fade=t=out:st=" + (duration - 0.5) + ":d=0.5");
  }

  const vf = filters.join(",");

  let cmd = 'ffmpeg -y -i "' + INPUT_FILE + '"';
  if (vf) cmd += ' -vf "' + vf + '"';
  cmd += ' -t ' + duration;
  if (speed !== 1) cmd += ' -af atempo=' + speed;
  cmd += ' -c:v ' + codec + ' -c:a aac -crf 23 -pix_fmt yuv420p';
  cmd += ' "' + OUTPUT_FILE + '"';

  console.log("Running: " + cmd);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 300000 });
  } catch (e) {
    console.error("FFmpeg failed: " + e.message);
    
    // Try simpler command
    console.log("Trying simpler command...");
    try {
      execSync('ffmpeg -y -i "' + INPUT_FILE + '" -t ' + duration + ' -c copy "' + OUTPUT_FILE + '"', {
        stdio: "inherit", timeout: 120000
      });
    } catch (e2) {
      console.error("Simple FFmpeg also failed: " + e2.message);
      process.exit(1);
    }
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    const outStats = fs.statSync(OUTPUT_FILE);
    console.log("Output: " + (outStats.size / 1024 / 1024).toFixed(2) + " MB");
  } else {
    console.error("Output not created!");
    process.exit(1);
  }
}

main();
