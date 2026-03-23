/**
 * ============================================================================
 * AUTOMATION SYSTEM - Video Processing Script
 * ============================================================================
 * Project: automation-system
 * GitHub: https://github.com/waqaskhan1437/automation-system
 * GitHub Actions: Video Processing Runner
 * 
 * This script processes videos for automation with features:
 * - Advanced audio muting (full_mute, fade_out, mute_last, mute_range)
 * - Video cropping/scaling
 * - Tagline overlays
 * - Split/combine modes
 * 
 * Deployed via: GitHub Actions self-hosted runners
 * ============================================================================
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_FILE = path.join(OUTPUT_DIR, "input-video.mp4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");
const TEMP_FILE = path.join(OUTPUT_DIR, "temp-noaudio.mp4");
const SPEED_FILE = path.join(OUTPUT_DIR, "temp-speed.mp4");

const FONT_DIR = "/usr/share/fonts/truetype";

const FONT_MAP = {
  ubuntu: {
    normal: "ubuntu/Ubuntu-R.ttf",
    medium: "ubuntu/Ubuntu-M.ttf",
    bold: "ubuntu/Ubuntu-B.ttf",
    italic: "ubuntu/Ubuntu-RI.ttf",
    medium_italic: "ubuntu/Ubuntu-MI.ttf",
    bold_italic: "ubuntu/Ubuntu-BI.ttf"
  },
  dejavu: {
    normal: "dejavu/DejaVuSans.ttf",
    medium: "dejavu/DejaVuSans.ttf",
    bold: "dejavu/DejaVuSans-Bold.ttf",
    italic: "dejavu/DejaVuSans-Oblique.ttf",
    medium_italic: "dejavu/DejaVuSans-Oblique.ttf",
    bold_italic: "dejavu/DejaVuSans-BoldOblique.ttf"
  },
  liberation: {
    normal: "liberation/LiberationSans-Regular.ttf",
    medium: "liberation/LiberationSans-Regular.ttf",
    bold: "liberation/LiberationSans-Bold.ttf",
    italic: "liberation/LiberationSans-Italic.ttf",
    medium_italic: "liberation/LiberationSans-Italic.ttf",
    bold_italic: "liberation/LiberationSans-BoldItalic.ttf"
  },
  noto: {
    normal: "noto/NotoSans-Regular.ttf",
    medium: "noto/NotoSans-Medium.ttf",
    bold: "noto/NotoSans-Bold.ttf",
    italic: "noto/NotoSans-Italic.ttf",
    medium_italic: "noto/NotoSans-MediumItalic.ttf",
    bold_italic: "noto/NotoSans-BoldItalic.ttf"
  },
  nimbus: {
    normal: "nimbus/NimbusSans-Regular.ttf",
    medium: "nimbus/NimbusSans-Regular.ttf",
    bold: "nimbus/NimbusSans-Bold.ttf",
    italic: "nimbus/NimbusSans-Italic.ttf",
    medium_italic: "nimbus/NimbusSans-Italic.ttf",
    bold_italic: "nimbus/NimbusSans-Bold-Italic.ttf"
  },
  lato: {
    normal: "lato/Lato-Regular.ttf",
    medium: "lato/Lato-Medium.ttf",
    bold: "lato/Lato-Bold.ttf",
    italic: "lato/Lato-Italic.ttf",
    medium_italic: "lato/Lato-MediumItalic.ttf",
    bold_italic: "lato/Lato-BoldItalic.ttf"
  }
};

const FONT_SIZES = {
  xs: 24,
  sm: 32,
  md: 42,
  lg: 56,
  xl: 72
};

const FONT_COLORS = [
  "#FFFFFF", "#000000", "#FFEB3B", "#EF4444", "#3B82F6",
  "#22C55E", "#A855F7", "#F97316", "#06B6D4", "#EC4899", "#84CC16"
];

const BG_COLORS = [
  "#000000", "#FFFFFF", "#EF4444", "#3B82F6",
  "#22C55E", "#A855F7", "#F97316", "#06B6D4"
];

const FORMAT_MAX_CHARS = {
  "9:16": { default: 20, vertical: 20, horizontal: 25 },
  "16:9": { default: 45, vertical: 40, horizontal: 45 },
  "1:1": { default: 32, vertical: 30, horizontal: 35 },
  "4:5": { default: 35, vertical: 32, horizontal: 38 },
  "21:9": { default: 50, vertical: 45, horizontal: 50 }
};

function getFontFile(fontFamily, fontStyle) {
  const family = FONT_MAP[fontFamily] || FONT_MAP.ubuntu;
  const styleMap = {
    normal: family.normal,
    bold: family.bold,
    italic: family.italic,
    bold_italic: family.bold_italic,
    medium: family.medium,
    medium_italic: family.medium_italic
  };
  return styleMap[fontStyle] || family.bold;
}

function wrapText(text, maxCharsPerLine, format) {
  const formatChars = FORMAT_MAX_CHARS[format] || FORMAT_MAX_CHARS["9:16"];
  const maxChars = maxCharsPerLine || formatChars.default;

  if (!text || text.length <= maxChars) {
    return text;
  }

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.substring(0, maxChars));
          remaining = remaining.substring(maxChars);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.join("\\n");
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function buildTaglineDrawtext(tagline, config, position, format) {
  if (!tagline) return null;

  const fontFamily = config.tagline_font_family || "ubuntu";
  const fontStyle = config.tagline_font_style || "bold";
  const fontSize = config.tagline_font_size || "md";
  const fontColor = config.tagline_random_font_color
    ? getRandomItem(FONT_COLORS)
    : (config.tagline_font_color || "#FFFFFF");
  const bgType = config.tagline_background_type || "none";
  const bgColor = config.tagline_random_background
    ? getRandomItem(BG_COLORS)
    : (config.tagline_background_color || "#000000");
  const bgOpacity = (config.tagline_background_opacity ?? 100) / 100;
  const charLimit = config.tagline_char_limit || 0;
  const wrapEnabled = config.tagline_wrap_enabled !== false;
  const wrapMaxChars = config.tagline_wrap_max_chars || 0;

  const topMargin = parseInt(config.tagline_top_margin || "80");
  const bottomMargin = parseInt(config.tagline_bottom_margin || "80");

  let text = tagline;

  if (charLimit > 0 && text.length > charLimit) {
    text = text.substring(0, charLimit - 3) + "...";
  }

  if (wrapEnabled) {
    text = wrapText(text, wrapMaxChars, format);
  }

  const fontFile = getFontFile(fontFamily, fontStyle);
  const fontPath = `${FONT_DIR}/${fontFile}`;
  const size = FONT_SIZES[fontSize] || FONT_SIZES.md;

  const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, "\\:");

  let filter = `drawtext=text='${escapedText}':fontfile=${fontPath}:fontsize=${size}:fontcolor=${fontColor}`;

  if (bgType === "box" || bgType === "rounded_box") {
    filter += `:box=1:boxcolor=${bgColor}@${bgOpacity}:boxborderw=10`;
  }

  filter += `:borderw=2:bordercolor=black@0.5`;

  if (position === "top") {
    filter += `:x=(w-text_w)/2:y=${topMargin}`;
  } else {
    filter += `:x=(w-text_w)/2:y=h-text_h-${bottomMargin}`;
  }

  console.log(`Tagline filter: ${filter}`);
  return filter;
}

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

function remuxWithFaststart(inputFile, outputFile, codecArgs) {
  const cmd = `ffmpeg -y -i "${inputFile}" ${codecArgs} -movflags +faststart "${outputFile}"`;
  console.log("Finalize CMD:", cmd);
  execSync(cmd, { stdio: "inherit", timeout: 300000 });
}

/**
 * Speed Control Functions using FFmpeg
 * Supports multiple speed modes:
 * - none: No speed change
 * - first_last: Speed up first N and last N seconds
 * - segments: Custom segments with different speeds
 */
function applySpeedControl(inputFile, tempFile, config) {
  const speedMode = config.speed_mode || "none";
  
  console.log("=== SPEED CONTROL ===");
  console.log("Speed Mode:", speedMode);
  
  if (speedMode === "none" || !speedMode) {
    console.log("Speed: No change, copying file...");
    execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
    return;
  }
  
  const videoDuration = getVideoDuration(inputFile);
  console.log("Video Duration:", videoDuration);
  
  if (!videoDuration) {
    console.log("Could not determine duration, skipping speed control...");
    execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
    return;
  }
  
  // WHOLE VIDEO MODE — single speed for entire video
  if (speedMode === "whole") {
    const speed = parseFloat(config.speed_whole_value || "2.0");
    console.log(`Whole video speed: ${speed}x`);
    applySpeedSegments(inputFile, tempFile, config, videoDuration, [
      { start: 0, end: videoDuration, speed: speed }
    ]);
    return;
  }

  if (speedMode === "first_last") {
    const firstSeconds = parseFloat(config.speed_first_seconds || "5");
    const firstSpeed = parseFloat(config.speed_first_value || "2.0");
    const lastSeconds = parseFloat(config.speed_last_seconds || "5");
    const lastSpeed = parseFloat(config.speed_last_value || "2.0");
    const middleSpeed = 1.0;
    
    console.log(`First ${firstSeconds}s: ${firstSpeed}x speed`);
    console.log(`Middle: ${middleSpeed}x (normal)`);
    console.log(`Last ${lastSeconds}s: ${lastSpeed}x speed`);
    
    applySpeedSegments(inputFile, tempFile, config, videoDuration, [
      { start: 0, end: Math.min(firstSeconds, videoDuration), speed: firstSpeed },
      { start: firstSeconds, end: Math.max(firstSeconds, videoDuration - lastSeconds), speed: middleSpeed },
      { start: Math.max(firstSeconds, videoDuration - lastSeconds), end: videoDuration, speed: lastSpeed }
    ]);
    return;
  }
  
  if (speedMode === "segments") {
    let segments = [];
    try {
      if (typeof config.speed_segments === "string") {
        segments = JSON.parse(config.speed_segments);
      } else if (Array.isArray(config.speed_segments)) {
        segments = config.speed_segments;
      }
    } catch (e) {
      console.log("Could not parse speed_segments:", e.message);
    }
    
    if (segments.length === 0) {
      console.log("No segments defined, skipping speed control...");
      execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
      return;
    }
    
    console.log("Custom segments:", JSON.stringify(segments));
    applySpeedSegments(inputFile, tempFile, config, videoDuration, segments);
    return;
  }
  
  // Unknown mode, just copy
  console.log("Unknown speed mode, copying as-is...");
  execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
}

function buildAtempoChain(speed) {
  // atempo only supports 0.5 to 2.0 per filter — chain multiple for other speeds
  if (speed <= 0) return "atempo=1.0";
  const filters = [];
  let remaining = speed;
  // For slow speeds (< 0.5), chain downward
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  // For fast speeds (> 2.0), chain upward
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  // Final remainder
  const clamped = Math.min(2.0, Math.max(0.5, remaining));
  filters.push(`atempo=${clamped.toFixed(4)}`);
  return filters.join(",");
}

function applySpeedSegments(inputFile, tempFile, config, videoDuration, segments) {
  // Filter and sort valid segments
  const validSegments = segments
    .filter(s => s && s.speed > 0 && s.end > s.start)
    .map(s => ({
      start: Math.max(0, s.start),
      end: Math.min(videoDuration, s.end),
      speed: s.speed
    }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  if (validSegments.length === 0) {
    console.log("No valid segments, copying as-is...");
    execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
    return;
  }

  const hasAudio = hasAudioTrack(inputFile);

  // Build a complete timeline: fill gaps with 1x speed
  // Gap before first segment, between segments, after last segment
  const timeline = [];

  // Gap at start (0 to first segment)
  if (validSegments[0].start > 0) {
    timeline.push({ start: 0, end: validSegments[0].start, speed: 1.0 });
  }

  validSegments.forEach((seg, i) => {
    timeline.push(seg);
    // Gap between this segment and next
    if (i < validSegments.length - 1) {
      const gapStart = seg.end;
      const gapEnd = validSegments[i + 1].start;
      if (gapEnd > gapStart) {
        timeline.push({ start: gapStart, end: gapEnd, speed: 1.0 });
      }
    }
  });

  // Gap at end (last segment to video end)
  const lastSeg = validSegments[validSegments.length - 1];
  if (lastSeg.end < videoDuration) {
    timeline.push({ start: lastSeg.end, end: videoDuration, speed: 1.0 });
  }

  console.log("Timeline:", JSON.stringify(timeline));

  const videoFilters = [];
  const audioFilters = [];
  const concatParts = [];

  timeline.forEach((seg, i) => {
    const ptsValue = (1 / seg.speed).toFixed(6);

    // KEY FIX: setpts=PTS-STARTPTS resets timestamps to 0 after trim
    // then multiply by speed factor
    videoFilters.push(
      `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,setpts=${ptsValue}*PTS[v${i}]`
    );

    if (hasAudio) {
      const atempoChain = buildAtempoChain(seg.speed);
      audioFilters.push(
        `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS,${atempoChain}[a${i}]`
      );
    }

    concatParts.push(`[v${i}]`);
    if (hasAudio) concatParts.push(`[a${i}]`);
  });

  const n = timeline.length;
  const concatAudio = hasAudio ? `:a=1` : "";
  const allFilters = [...videoFilters, ...audioFilters].join("; ");
  const complexFilter = `${allFilters}; ${concatParts.join("")}concat=n=${n}:v=1${concatAudio}[out]`;

  const audioMap = hasAudio ? `-map "[out]" ` : `-map "[out]" -an `;
  const cmd = `ffmpeg -y -i "${inputFile}" -filter_complex "${complexFilter}" -map "[out]" ${hasAudio ? "" : "-an "}-c:v libx264 -preset fast -crf 26 ${hasAudio ? "-c:a aac -b:a 96k " : ""}-pix_fmt yuv420p -movflags +faststart "${tempFile}"`;

  console.log("Speed CMD:", cmd.substring(0, 300) + "...");

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
    console.log("✅ Speed control applied successfully!");
  } catch (e) {
    console.error("Speed control failed:", e.message);
    console.log("Falling back to original file...");
    execSync(`cp "${inputFile}" "${tempFile}"`, { stdio: "inherit" });
  }
}

/**
 * Advanced Audio Muting Functions using FFmpeg
 * Supports multiple mute modes:
 * - full_mute: Remove entire audio track
 * - fade_out: Fade out audio in last N seconds
 * - mute_last: Mute/cut audio in last N seconds
 * - mute_range: Mute audio between start and end times
 * - mute_between: Mute audio between two time points
 */
function applyAdvancedAudioMuting(tempFile, outputFile, config) {
  const muteMode = config.mute_mode || "fade_out";
  const audioFadeDuration = parseInt(config.audio_fade_duration || "5");
  console.log("=== APPLY AUDIO MUTING FUNCTION ===");
  console.log("config.mute_mode:", config.mute_mode);
  console.log("muteMode used:", muteMode);
  console.log("audioFadeDuration used:", audioFadeDuration);
  const muteLastSeconds = parseFloat(config.mute_last_seconds || "5");
  const muteRangeStart = parseFloat(config.mute_range_start || "0");
  const muteRangeEnd = parseFloat(config.mute_range_end || "0");
  
  const videoDuration = getVideoDuration(tempFile);
  console.log("=== Advanced Audio Muting ===");
  console.log("Mute Mode:", muteMode);
  console.log("Video Duration:", videoDuration);

  if (!hasAudioTrack(tempFile)) {
    console.log("No audio track found, remuxing as-is...");
    remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
    return;
  }

  switch (muteMode) {
    case "full_mute":
      console.log("Mode: Full Mute (removing entire audio track)");
      remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -an -pix_fmt yuv420p");
      break;

    case "fade_out":
      console.log(`Mode: Fade Out (last ${audioFadeDuration}s)`);
      if (videoDuration && videoDuration > audioFadeDuration) {
        const fadeStart = videoDuration - audioFadeDuration;
        const cmd = `ffmpeg -y -i "${tempFile}" -af "afade=t=out:st=${fadeStart}:d=${audioFadeDuration}" -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputFile}"`;
        console.log("Fade CMD:", cmd);
        execSync(cmd, { stdio: "inherit", timeout: 300000 });
      } else {
        console.log("Could not determine video duration or video too short, keeping original audio...");
        remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
      }
      break;

    case "mute_last":
      console.log(`Mode: Mute Last (${muteLastSeconds}s)`);
      if (videoDuration && videoDuration > muteLastSeconds) {
        const keepEnd = videoDuration - muteLastSeconds;
        const cmd = `ffmpeg -y -i "${tempFile}" -af "volume=enable='between(t,${keepEnd},${videoDuration})':volume=0" -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputFile}"`;
        console.log("Mute Last CMD:", cmd);
        execSync(cmd, { stdio: "inherit", timeout: 300000 });
      } else {
        console.log("Could not determine video duration or video too short, keeping original audio...");
        remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
      }
      break;

    case "mute_range":
      console.log(`Mode: Mute Range (${muteRangeStart}s to ${muteRangeEnd}s)`);
      if (videoDuration && muteRangeEnd > muteRangeStart && muteRangeStart >= 0) {
        const actualEnd = Math.min(muteRangeEnd, videoDuration);
        // Mute audio between start and end using volume filter with enable expression
        const cmd = `ffmpeg -y -i "${tempFile}" -af "volume=enable='between(t,${muteRangeStart},${actualEnd})':volume=0" -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputFile}"`;
        console.log("Mute Range CMD:", cmd);
        execSync(cmd, { stdio: "inherit", timeout: 300000 });
      } else {
        console.log("Invalid range, keeping original audio...");
        remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
      }
      break;

    case "mute_between":
      console.log(`Mode: Mute Between (${muteRangeStart}s to ${muteRangeEnd}s)`);
      if (videoDuration && muteRangeEnd > muteRangeStart && muteRangeStart >= 0) {
        const actualEnd = Math.min(muteRangeEnd, videoDuration);
        // Same as mute_range but semantically different (could be extended)
        const cmd = `ffmpeg -y -i "${tempFile}" -af "volume=enable='between(t,${muteRangeStart},${actualEnd})':volume=0" -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${outputFile}"`;
        console.log("Mute Between CMD:", cmd);
        execSync(cmd, { stdio: "inherit", timeout: 300000 });
      } else {
        console.log("Invalid range, keeping original audio...");
        remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
      }
      break;

    default:
      console.log("Unknown mute mode, keeping original audio...");
      remuxWithFaststart(tempFile, outputFile, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
      break;
  }
}

function main() {
  console.log("=== Process Video ===");
  console.log("Working dir:", process.cwd());
  console.log("Font dir:", FONT_DIR);

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
      console.log("Config loaded successfully");
      console.log("Config keys:", Object.keys(config).join(", "));
      console.log("Config preview:", JSON.stringify(config).substring(0, 500));
    } else {
      console.log("WARNING: Config file not found at:", configPath);
      console.log("Current dir:", process.cwd());
      console.log("Files in cwd:", fs.readdirSync(process.cwd()));
    }
  } catch (e) {
    console.log("Could not read config: " + e.message);
    console.log("Config path:", path.join(process.cwd(), "automation-config.json"));
  }

  const duration = parseInt(config.short_duration || "60");
  const aspectRatio = config.aspect_ratio || "9:16";
  
  // Legacy support: mute_audio boolean
  const legacyMuteAudio = config.mute_audio === true || config.mute_audio === "true";
  
  // New advanced mute settings
  // Default to fade_out instead of full_mute for backward compatibility
  const muteMode = config.mute_mode || (legacyMuteAudio ? "fade_out" : "none");
  const audioFadeDuration = parseInt(config.audio_fade_duration || "5");

  console.log("Duration:", duration);
  console.log("Aspect:", aspectRatio);
  console.log("=== AUDIO CONFIG DEBUG ===");
  console.log("mute_audio:", config.mute_audio, "(type:", typeof config.mute_audio, ")");
  console.log("mute_mode:", config.mute_mode, "(type:", typeof config.mute_mode, ")");
  console.log("audio_fade_duration:", config.audio_fade_duration, "(type:", typeof config.audio_fade_duration, ")");
  console.log("mute_last_seconds:", config.mute_last_seconds);
  console.log("mute_range_start:", config.mute_range_start);
  console.log("mute_range_end:", config.mute_range_end);
  console.log("legacyMuteAudio:", legacyMuteAudio);
  console.log("Final muteMode:", muteMode);
  console.log("Final audioFadeDuration:", audioFadeDuration + "s");
  console.log("=== END AUDIO CONFIG ===");
  
  // === SPEED CONTROL (Applied first) ===
  const speedMode = config.speed_mode || "none";
  if (speedMode !== "none") {
    console.log("=== APPLYING SPEED CONTROL ===");
    applySpeedControl(INPUT_FILE, SPEED_FILE, config);
    
    // Use speed-controlled file for further processing
    if (fs.existsSync(SPEED_FILE)) {
      console.log("Using speed-controlled file for further processing...");
    } else {
      console.log("Speed control file not created, using original input...");
      execSync(`cp "${INPUT_FILE}" "${SPEED_FILE}"`, { stdio: "inherit" });
    }
  } else {
    console.log("Speed control: DISABLED");
    execSync(`cp "${INPUT_FILE}" "${SPEED_FILE}"`, { stdio: "inherit" });
  }
  // === END SPEED CONTROL ===

  const isFit = aspectRatio.endsWith("-fit");
  const isOriginal = aspectRatio === "original";
  const baseRatio = aspectRatio.replace("-fit", "");

  let width = 1080, height = 1920;
  if (baseRatio === "16:9") { width = 1920; height = 1080; }
  else if (baseRatio === "1:1") { width = 1080; height = 1080; }
  else if (baseRatio === "4:5") { width = 1080; height = 1350; }
  else if (baseRatio === "21:9") { width = 1920; height = 823; }

  let filters = [];

  if (isOriginal) {
    console.log("Mode: Original (no resize)");
  } else if (isFit) {
    console.log("Mode: Fit (no crop, black bars)");
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
  } else {
    console.log("Mode: Crop (fill and cut)");
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`);
    filters.push(`crop=${width}:${height}`);
  }

  const topTaglines = Array.isArray(config.top_taglines) ? config.top_taglines : [];
  const bottomTaglines = Array.isArray(config.bottom_taglines) ? config.bottom_taglines : [];

  if (topTaglines.length > 0) {
    const tagline = topTaglines[Math.floor(Math.random() * topTaglines.length)];
    console.log("Adding top tagline:", tagline);
    const taglineFilter = buildTaglineDrawtext(tagline, config, "top", baseRatio);
    if (taglineFilter) {
      filters.push(taglineFilter);
    }
  }

  if (bottomTaglines.length > 0) {
    const tagline = bottomTaglines[Math.floor(Math.random() * bottomTaglines.length)];
    console.log("Adding bottom tagline:", tagline);
    const taglineFilter = buildTaglineDrawtext(tagline, config, "bottom", baseRatio);
    if (taglineFilter) {
      filters.push(taglineFilter);
    }
  }

  const splitMode = config.split_mode || "chunk";
  const splitEnabled = config.split_enabled === true || config.split_enabled === "true";
  let splitSelectExpr = null;

  if (splitEnabled && splitMode === "advanced") {
    let splitRules = [];
    try {
      splitRules = typeof config.split_rules === "string" ? JSON.parse(config.split_rules) : (config.split_rules || []);
    } catch (e) { console.log("Could not parse split_rules:", e.message); }

    if (splitRules.length > 0) {
      const videoDuration = getVideoDuration(SPEED_FILE) || duration;
      console.log("Video duration for split calc:", videoDuration);

      const ruleExprs = splitRules.map(rule => {
        let start = 0, end = videoDuration;
        if (rule.region === "first") { end = Math.min(rule.region_value, videoDuration); }
        else if (rule.region === "last") { start = Math.max(0, videoDuration - rule.region_value); }
        else if (rule.region === "custom") { start = rule.region_start || 0; end = rule.region_end || videoDuration; }

        const interval = rule.interval || 1;
        const keep = interval - (rule.remove_duration || 0.1);
        return `if(lt(t,${start}),1,if(gt(t,${end}),1,if(lt(mod(t-${start},${interval}),${keep}),1,0)))`;
      });

      splitSelectExpr = ruleExprs.length === 1 ? ruleExprs[0] : ruleExprs.reduce((a, b) => `if(${a},${b},0)`);
      console.log("Split select expr:", splitSelectExpr);
    }
  }

  let useComplexFilter = !!splitSelectExpr;

  const filterStr = filters.length > 0 ? filters.join(",") : "null";

  console.log("Running FFmpeg...");
  let cmd;

  if (useComplexFilter) {
    const vfChain = filterStr === "null" ? "" : filterStr + ",";
    const hasAudio = hasAudioTrack(SPEED_FILE);
    let complexFilter, mapArgs;
    if (hasAudio) {
      complexFilter = `[0:v]${vfChain}select='${splitSelectExpr}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${splitSelectExpr}',asetpts=N/SR/TB[a]`;
      mapArgs = `-map "[v]" -map "[a]"`;
    } else {
      complexFilter = `[0:v]${vfChain}select='${splitSelectExpr}',setpts=N/FRAME_RATE/TB[v]`;
      mapArgs = `-map "[v]"`;
    }
    cmd = `ffmpeg -y -i "${SPEED_FILE}" -t ${duration} -filter_complex "${complexFilter}" ${mapArgs} -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${TEMP_FILE}"`;
  } else {
    cmd = `ffmpeg -y -i "${SPEED_FILE}" -t ${duration} -vf "${filterStr}" -c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p -movflags +faststart "${TEMP_FILE}"`;
  }

  console.log("CMD:", cmd);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600000 });
  } catch (e) {
    console.error("FFmpeg error:", e.message);
    console.log("Trying copy fallback...");
    try {
      execSync(`ffmpeg -y -i "${SPEED_FILE}" -t ${duration} -c copy "${TEMP_FILE}"`, {
        stdio: "inherit", timeout: 300000
      });
    } catch (e2) {
      console.error("Fallback failed:", e2.message);
      process.exit(1);
    }
  }

  if (!fs.existsSync(TEMP_FILE)) {
    console.error("ERROR: TEMP_FILE not created!");
    console.log("Expected:", TEMP_FILE);
    process.exit(1);
  }
  console.log("TEMP_FILE created successfully:", TEMP_FILE);

  // Apply advanced audio muting
  if (muteMode !== "none") {
    console.log("Applying audio muting...");
    applyAdvancedAudioMuting(TEMP_FILE, OUTPUT_FILE, config);
  } else {
    console.log("Audio Processing: Original (no muting)");
    remuxWithFaststart(TEMP_FILE, OUTPUT_FILE, "-c:v libx264 -preset fast -crf 26 -c:a aac -b:a 96k -pix_fmt yuv420p");
  }

  try { fs.unlinkSync(TEMP_FILE); } catch (e) {}
  try { fs.unlinkSync(SPEED_FILE); } catch (e) {}

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error("ERROR: OUTPUT_FILE not created!");
    console.log("Expected:", OUTPUT_FILE);
    process.exit(1);
  }
  console.log("OUTPUT_FILE created successfully:", OUTPUT_FILE);

  const outputSize = fs.statSync(OUTPUT_FILE).size;
  console.log("Output: " + (outputSize / 1024 / 1024).toFixed(2) + " MB");
  console.log("Audio Processing:", muteMode !== "none" ? `Muted (${muteMode})` : "Original");
  console.log("Speed Processing:", speedMode !== "none" ? `Enabled (${speedMode})` : "Disabled");
  console.log("SUCCESS!");
  process.exit(0);
}

main();
