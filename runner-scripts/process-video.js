const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("Input not found!");
    process.exit(1);
  }

  const inputSize = fs.statSync(INPUT_FILE).size;
  console.log("Input: " + (inputSize / 1024 / 1024).toFixed(2) + " MB");

  const duration = parseInt(process.env.SHORT_DURATION || "60");
  const aspectRatio = process.env.ASPECT_RATIO || "9:16";

  let width = 1080, height = 1920;
  if (aspectRatio === "16:9") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1") { width = 1080; height = 1080; }

  // Simple fast command
  const cmd = 'ffmpeg -y -i "' + INPUT_FILE + '" -t ' + duration + ' -vf "scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2:black,fade=t=in:st=0:d=0.5,fade=t=out:st=' + (duration - 0.5) + ':d=0.5" -c:v libx264 -preset fast -crf 23 -c:a aac -pix_fmt yuv420p "' + OUTPUT_FILE + '"';

  console.log("Processing...");
  try {
    execSync(cmd, { stdio: "inherit", timeout: 300000 });
  } catch (e) {
    console.error("FFmpeg failed: " + e.message);
    // Try simple copy as fallback
    try {
      execSync('ffmpeg -y -i "' + INPUT_FILE + '" -t ' + duration + ' -c copy "' + OUTPUT_FILE + '"', {
        stdio: "inherit", timeout: 60000
      });
    } catch (e2) {
      process.exit(1);
    }
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("Output not created!");
    process.exit(1);
  }

  const outputSize = fs.statSync(OUTPUT_FILE).size;
  console.log("Output: " + (outputSize / 1024 / 1024).toFixed(2) + " MB");
  console.log("SUCCESS!");
  process.exit(0);
}

main();
