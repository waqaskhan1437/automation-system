const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

function main() {
  console.log("=== Process Video ===");
  console.log("Working dir:", process.cwd());
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log("Creating output dir...");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(INPUT_FILE)) {
    console.error("ERROR: Input video not found at: " + INPUT_FILE);
    console.log("Files in output dir:", fs.readdirSync(OUTPUT_DIR));
    process.exit(1);
  }

  const inputSize = fs.statSync(INPUT_FILE).size;
  console.log("Input: " + (inputSize / 1024 / 1024).toFixed(2) + " MB");

  let config = {};
  try {
    const configPath = path.join(process.cwd(), "automation-config.json");
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log("Config loaded:", JSON.stringify(config).substring(0, 200));
    }
  } catch (e) {
    console.log("Could not read config: " + e.message);
  }

  const duration = parseInt(config.short_duration || "60");
  const aspectRatio = config.aspect_ratio || "9:16";
  
  console.log("Duration:", duration);
  console.log("Aspect:", aspectRatio);

  let width = 1080, height = 1920;
  if (aspectRatio === "16:9") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1") { width = 1080; height = 1080; }

  const isVertical = aspectRatio === "9:16";
  
  let filters = [];
  
  // Scale and crop for vertical video
  if (isVertical) {
    filters.push(`scale=${width}:-1:force_original_aspect_ratio=increase`);
    filters.push(`crop=${width}:${height}`);
  }

  const filterStr = filters.length > 0 ? filters.join(",") : "null";

  console.log("Running FFmpeg...");
  let cmd = `ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -vf "${filterStr}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -pix_fmt yuv420p "${OUTPUT_FILE}"`;
  
  console.log("CMD:", cmd);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
  } catch (e) {
    console.error("FFmpeg error:", e.message);
    // Fallback - just copy
    console.log("Trying copy fallback...");
    try {
      execSync(`ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -c copy "${OUTPUT_FILE}"`, {
        stdio: "inherit", timeout: 300000
      });
    } catch (e2) {
      console.error("Fallback failed:", e2.message);
      process.exit(1);
    }
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("Output file not created!");
    process.exit(1);
  }

  const outputSize = fs.statSync(OUTPUT_FILE).size;
  console.log("Output: " + (outputSize / 1024 / 1024).toFixed(2) + " MB");
  console.log("SUCCESS!");
  process.exit(0);
}

main();
