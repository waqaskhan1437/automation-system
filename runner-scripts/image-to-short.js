const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const IMAGE_FILE = path.join(OUTPUT_DIR, "input-image.jpg");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-video.mp4");

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
  "4:5": { default: 35, vertical: 32, horizontal: 38 }
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

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}/${g}/${b}`;
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
  
  if (bgType === "box") {
    const rgba = hexToRGBA(bgColor, bgOpacity);
    filter += `:box=1:boxcolor=${rgba}@${bgOpacity}:boxborderw=15`;
  } else if (bgType === "rounded_box") {
    const rgba = hexToRGBA(bgColor, bgOpacity);
    filter += `:box=1:boxcolor=${rgba}@${bgOpacity}:boxborderw=15`;
  }
  
  filter += `:borderw=2:bordercolor=black@0.5`;
  
  if (position === "top") {
    filter += `:x=(w-text_w)/2:y=60`;
  } else {
    filter += `:x=(w-text_w)/2:y=h-text_h-60`;
  }
  
  return filter;
}

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
  const idMatch = url.match(/photo\/([A-Za-z0-9_-]+)/);
  if (idMatch) {
    const photoId = idMatch[1];
    const directUrl = `https://lh3.googleusercontent.com/${photoId}=w1920-h1080`;
    console.log(`Trying direct URL: ${directUrl}`);
    return downloadImage(directUrl);
  }
  throw new Error("Cannot extract direct URL from Google Photos.");
}

function createShortFromImage(inputImage, outputVideo) {
  const duration = parseInt(process.env.VIDEO_DURATION || "10");
  const aspectRatio = process.env.ASPECT_RATIO || "9:16";
  const bgColor = process.env.BG_COLOR || "black";
  const animation = process.env.ANIMATION || "zoom";
  
  const taglineConfig = {
    tagline_font_family: process.env.TAGLINE_FONT_FAMILY || "ubuntu",
    tagline_font_style: process.env.TAGLINE_FONT_STYLE || "bold",
    tagline_font_size: process.env.TAGLINE_FONT_SIZE || "md",
    tagline_font_color: process.env.TAGLINE_FONT_COLOR || "#FFFFFF",
    tagline_random_font_color: process.env.TAGLINE_RANDOM_FONT_COLOR === "true",
    tagline_background_type: process.env.TAGLINE_BACKGROUND_TYPE || "none",
    tagline_background_color: process.env.TAGLINE_BACKGROUND_COLOR || "#000000",
    tagline_random_background: process.env.TAGLINE_RANDOM_BACKGROUND === "true",
    tagline_background_opacity: parseInt(process.env.TAGLINE_BACKGROUND_OPACITY || "100"),
    tagline_char_limit: parseInt(process.env.TAGLINE_CHAR_LIMIT || "0"),
    tagline_wrap_enabled: process.env.TAGLINE_WRAP_ENABLED !== "false",
    tagline_wrap_max_chars: parseInt(process.env.TAGLINE_WRAP_MAX_CHARS || "0")
  };
  
  const topTagline = process.env.TOP_TAGLINE || "";
  const bottomTagline = process.env.BOTTOM_TAGLINE || "";

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

  if (animation === "zoom") {
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else if (animation === "pan") {
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='1':x='(iw-iw/zoom)*on/${duration * 25}':y='0':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else if (animation === "kenburns") {
    videoFilters.push(
      `scale=${width * 2}:${height * 2}`,
      `zoompan=z='if(eq(on,1),1,zoom+0.001)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 25}:s=${width}x${height}:fps=25`
    );
  } else {
    videoFilters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${bgColor}`
    );
  }

  if (topTagline) {
    const taglineFilter = buildTaglineDrawtext(topTagline, taglineConfig, "top", aspectRatio);
    if (taglineFilter) {
      videoFilters.push(`${taglineFilter}:enable='between(t,0,${duration})'`);
    }
  }

  if (bottomTagline) {
    const taglineFilter = buildTaglineDrawtext(bottomTagline, taglineConfig, "bottom", aspectRatio);
    if (taglineFilter) {
      videoFilters.push(`${taglineFilter}:enable='between(t,0,${duration})'`);
    }
  }

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
    console.error("No image source provided!");
    process.exit(1);
  }

  console.log(`Image source: ${imageSource}`);

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
  console.log("Font dir:", FONT_DIR);

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
