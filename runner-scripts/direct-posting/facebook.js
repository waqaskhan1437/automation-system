const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const FETCH_TIMEOUT_MS = 120000;

async function timedFetch(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function postToFacebook(accessToken, pageId, videoUrl, caption) {
  console.log(`[FACEBOOK] Posting to page ${pageId}...`);

  const body = JSON.stringify({
    file_url: videoUrl,
    description: caption || "Automated video post",
    published: true,
    access_token: accessToken,
  });

  const res = await timedFetch(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }, 300000);

  const result = await res.json();
  if (!res.ok || result.error) {
    throw new Error(`Facebook upload failed: ${result.error?.message || JSON.stringify(result)}`);
  }

  console.log(`[FACEBOOK] Posted successfully. Video ID: ${result.id}`);
  return { platform_post_id: result.id, status: "posted" };
}

async function main() {
  console.log("=== Direct Facebook Posting ===");

  const config = JSON.parse(process.env.DIRECT_POSTING_CONFIG || "{}");
  const litterboxUrl = process.env.LITTERBOX_URL;

  if (!config.facebook?.length) {
    console.log("[FACEBOOK] No Facebook accounts configured, skipping");
    process.exit(0);
  }

  let videoUrl = litterboxUrl || "";
  if (!videoUrl) {
    const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
    if (!fs.existsSync(videoFile)) {
      console.error("[FACEBOOK] No video file found");
      process.exit(1);
    }
    console.log("[FACEBOOK] Direct posting requires a public URL. Use Litterbox upload first.");
    process.exit(0);
  }

  const results = [];
  for (const account of config.facebook) {
    try {
      const result = await postToFacebook(account.access_token, account.page_id, videoUrl, config.caption);
      results.push({ ...account, ...result });
    } catch (err) {
      console.error(`[FACEBOOK] Failed for ${account.page_name || account.page_id}: ${err.message}`);
      results.push({ ...account, error: err.message });
    }
  }

  const outputData = {
    success: results.some(r => !r.error),
    method: "direct_facebook",
    results,
    caption: config.caption,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, "post_result.json"), JSON.stringify(outputData));
  console.log("=== SUCCESS ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
