const https = require("https");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const FETCH_TIMEOUT_MS = 60000;

async function timedFetch(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function getRandomFromArray(arr) {
  if (!arr || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeHashtags(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .map((item) => {
      if (!item) return "";
      const normalized = item.replace(/\s+/g, "").replace(/^#+/, "");
      return normalized ? `#${normalized}` : "";
    })
    .filter((item, index, array) => item && array.indexOf(item) === index);
}

async function uploadVideoToFacebook(pageId, accessToken, videoUrl, caption) {
  console.log(`Uploading video to Facebook page ${pageId}...`);

  const body = JSON.stringify({
    file_url: videoUrl,
    description: caption,
    published: true
  });

  const response = await timedFetch(
    `https://graph.facebook.com/v18.0/${pageId}/videos?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: body
    },
    120000
  );

  const result = await response.json();

  if (!response.ok || result.error) {
    const errorMsg = result.error?.message || `HTTP ${response.status}`;
    throw new Error(`Facebook upload failed: ${errorMsg}`);
  }

  console.log(`Video uploaded successfully. Video ID: ${result.id}`);
  return result;
}

async function main() {
  console.log("=== Direct Facebook Posting ===");

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const litterboxUrl = process.env.LITTERBOX_URL;

  if (!pageId || !accessToken) {
    console.log("No FACEBOOK_PAGE_ID or FACEBOOK_ACCESS_TOKEN — skipping direct Facebook post");
    process.exit(0);
  }

  let config = {};
  try {
    const configPath = path.join(process.cwd(), "automation-config.json");
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch (e) {
    console.log("Could not read config file");
  }

  const topTaglines = Array.isArray(config.top_taglines) ? config.top_taglines : [];
  const bottomTaglines = Array.isArray(config.bottom_taglines) ? config.bottom_taglines : [];
  const titles = Array.isArray(config.titles) ? config.titles : [];
  const descriptions = Array.isArray(config.descriptions) ? config.descriptions : [];
  const hashtags = Array.isArray(config.hashtags) ? config.hashtags : [];

  const topTagline = getRandomFromArray(topTaglines);
  const bottomTagline = getRandomFromArray(bottomTaglines);
  const title = getRandomFromArray(titles);
  const description = getRandomFromArray(descriptions);
  const normalizedHashtags = normalizeHashtags(hashtags);
  const hashtagsStr = normalizedHashtags.join(" ");
  const caption = [topTagline, title, description, hashtagsStr, bottomTagline]
    .filter(Boolean)
    .join("\n\n");

  let videoUrl = null;

  if (litterboxUrl && litterboxUrl.startsWith("https://")) {
    console.log(`Using Litterbox URL: ${litterboxUrl}`);
    videoUrl = litterboxUrl;
  } else {
    const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
    if (!fs.existsSync(videoFile)) {
      console.error("No processed video file found");
      process.exit(1);
    }
    console.log("Direct Facebook posting requires a publicly accessible video URL (Litterbox)");
    console.log("Falling back to PostForme API for upload...");
    process.exit(0);
  }

  try {
    const result = await uploadVideoToFacebook(pageId, accessToken, videoUrl, caption);

    const outputData = {
      success: true,
      method: "direct_facebook",
      facebook_video_id: result.id,
      facebook_post_id: result.post_id || null,
      platforms: 1,
      caption: caption,
      post_metadata: {
        title: title || "",
        description: description || "",
        hashtags: normalizedHashtags,
        caption: caption,
        top_tagline: topTagline || "",
        bottom_tagline: bottomTagline || "",
        facebook_page_id: pageId
      }
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "post_result.json"),
      JSON.stringify(outputData)
    );

    console.log("=== SUCCESS ===");
    process.exit(0);
  } catch (err) {
    console.error(`Direct Facebook posting failed: ${err.message}`);

    const outputData = {
      success: false,
      method: "direct_facebook",
      error: err.message,
      caption: caption
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "post_result.json"),
      JSON.stringify(outputData)
    );

    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
