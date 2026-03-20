const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");
const TEMP_FILE = path.join(OUTPUT_DIR, "temp-noaudio.mp4");

function getVideoDuration(inputFile) {
  try {
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`, { encoding: "utf8" });
    return parseFloat(output.trim());
  } catch (e) {
    return null;
  }
}

function hasAudioTrack(inputFile) {
  try {
    const output = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_name "${inputFile}"`, { encoding: "utf8" });
    return output.includes("codec_name");
  } catch (e) {
    return false;
  }
}

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
  const muteAudio = config.mute_audio === true || config.mute_audio === "true";
  const audioFadeDuration = parseInt(config.audio_fade_duration || "3");
  
  console.log("Duration:", duration);
  console.log("Aspect:", aspectRatio);
  console.log("Mute Audio:", muteAudio);
  console.log("Audio Fade:", audioFadeDuration + "s");

  let width = 1080, height = 1920;
  if (aspectRatio === "16:9") { width = 1920; height = 1080; }
  else if (aspectRatio === "1:1") { width = 1080; height = 1080; }

  const isVertical = aspectRatio === "9:16";
  
  let filters = [];
  
  if (isVertical) {
    filters.push(`scale=${width}:-1:force_original_aspect_ratio=increase`);
    filters.push(`crop=${width}:${height}`);
  }

  const filterStr = filters.length > 0 ? filters.join(",") : "null";

  console.log("Running FFmpeg...");
  let cmd = `ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -vf "${filterStr}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -pix_fmt yuv420p "${TEMP_FILE}"`;
  
  console.log("CMD:", cmd);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
  } catch (e) {
    console.error("FFmpeg error:", e.message);
    console.log("Trying copy fallback...");
    try {
      execSync(`ffmpeg -y -i "${INPUT_FILE}" -t ${duration} -c copy "${TEMP_FILE}"`, {
        stdio: "inherit", timeout: 300000
      });
    } catch (e2) {
      console.error("Fallback failed:", e2.message);
      process.exit(1);
    }
  }

  if (!fs.existsSync(TEMP_FILE)) {
    console.error("Output file not created!");
    process.exit(1);
  }

  // Process audio - mute or fade out
  if (muteAudio) {
    console.log("=== Processing Audio ===");
    
    if (hasAudioTrack(TEMP_FILE)) {
      console.log("Audio track detected, processing...");
      
      const videoDuration = getVideoDuration(TEMP_FILE);
      let fadeStart = 0;
      
      if (videoDuration && videoDuration > audioFadeDuration) {
        fadeStart = videoDuration - audioFadeDuration;
        console.log(`Fading out audio from ${fadeStart}s for ${audioFadeDuration}s`);
        
        // Fade out audio at the end
        const fadeCmd = `ffmpeg -y -i "${TEMP_FILE}" -af "afade=t=out:st=${fadeStart}:d=${audioFadeDuration}" -c:v copy -c:a aac "${OUTPUT_FILE}"`;
        console.log("Fade CMD:", fadeCmd);
        
        try {
          execSync(fadeCmd, { stdio: "inherit", timeout: 300000 });
          console.log("Audio fade out applied!");
        } catch (e) {
          console.error("Fade failed, removing audio completely:", e.message);
          // Fallback: remove audio completely
          execSync(`ffmpeg -y -i "${TEMP_FILE}" -c:v copy -an "${OUTPUT_FILE}"`, {
            stdio: "inherit", timeout: 300000
          });
        }
      } else {
        console.log("Video too short for fade, removing audio completely...");
        execSync(`ffmpeg -y -i "${TEMP_FILE}" -c:v copy -an "${OUTPUT_FILE}"`, {
          stdio: "inherit", timeout: 300000
        });
      }
    } else {
      console.log("No audio track found, copying as-is...");
      fs.copyFileSync(TEMP_FILE, OUTPUT_FILE);
    }
    
    // Clean up temp file
    try { fs.unlinkSync(TEMP_FILE); } catch (e) {}
  } else {
    // No audio processing, just rename temp to output
    fs.renameSync(TEMP_FILE, OUTPUT_FILE);
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("Output file not created!");
    process.exit(1);
  }

  const outputSize = fs.statSync(OUTPUT_FILE).size;
  console.log("Output: " + (outputSize / 1024 / 1024).toFixed(2) + " MB");
  console.log("Audio Processing:", muteAudio ? "Muted/Faded" : "Original");
  console.log("SUCCESS!");
  process.exit(0);
}

main();
