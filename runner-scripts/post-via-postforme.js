const https = require("https");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const FETCH_TIMEOUT_MS = 30000;

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

async function fetchSelectedPostformeAccounts(apiKey, accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("limit", String(Math.max(accountIds.length, 50)));
  for (const accountId of accountIds) {
    params.append("id", accountId);
  }

  const response = await timedFetch(`https://api.postforme.dev/v1/social-accounts?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch social accounts: ${errorText}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function buildPlatformConfigurations(selectedAccounts, title) {
  if (!title) {
    return {};
  }

  const platforms = Array.from(new Set(
    (Array.isArray(selectedAccounts) ? selectedAccounts : [])
      .map((account) => typeof account?.platform === "string" ? account.platform.trim() : "")
      .filter(Boolean)
  ));

  return platforms.reduce((accumulator, platform) => {
    if (platform === "youtube" || platform === "tiktok" || platform === "tiktok_business") {
      accumulator[platform] = { title };
      if (platform === "tiktok") {
        accumulator.tiktok_business = { title };
      }
    }
    return accumulator;
  }, {});
}

async function uploadMediaToPostforme(apiKey, filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);
  console.log(`Uploading ${fileName} to PostForMe (${(fileData.length / 1024 / 1024).toFixed(2)} MB)...`);

  const createUrlBody = JSON.stringify({
    filename: fileName,
    content_type: "video/mp4"
  });

  const createUrlResponse = await timedFetch("https://api.postforme.dev/v1/media/create-upload-url", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: createUrlBody
  });

  if (!createUrlResponse.ok) {
    const errorText = await createUrlResponse.text();
    throw new Error(`Failed to create upload URL: ${errorText}`);
  }

  const urlData = await createUrlResponse.json();
  const { upload_url, media_url } = urlData;

  const uploadResponse = await timedFetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: fileData
  }, 120000);

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload media: ${uploadResponse.status}`);
  }

  console.log(`Media uploaded to PostForMe: ${media_url}`);
  return media_url;
}

async function createPostformePost(apiKey, mediaUrl, caption, socialAccounts, scheduledAt, isDraft, platformConfigurations) {
  const postBody = {
    caption: caption,
    media: [{ url: mediaUrl }],
    social_accounts: socialAccounts,
    isDraft: isDraft
  };

  if (scheduledAt && !isDraft) {
    postBody.scheduled_at = scheduledAt;
  }
  if (platformConfigurations && Object.keys(platformConfigurations).length > 0 && socialAccounts.length > 0) {
    postBody.platform_configurations = platformConfigurations;
  }

  const response = await timedFetch("https://api.postforme.dev/v1/social-posts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create post: ${errorText}`);
  }

  return await response.json();
}

async function notifyWorker(workerUrl, jobId, status, outputData) {
  try {
    const webhookBody = JSON.stringify({
      job_id: parseInt(jobId),
      status: status,
      output_data: JSON.stringify(outputData)
    });

    const url = new URL(workerUrl);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(webhookBody)
        }
      }, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          console.log(`Worker notified: ${res.statusCode}`);
          resolve();
        });
      });
      req.setTimeout(FETCH_TIMEOUT_MS, () => {
        req.destroy(new Error(`Worker notify timeout after ${FETCH_TIMEOUT_MS}ms`));
      });
      req.on("error", reject);
      req.write(webhookBody);
      req.end();
    });
  } catch (err) {
    console.error(`Failed to notify worker: ${err.message}`);
  }
}

async function main() {
  console.log("=== PostForMe Posting ===");

  const apiKey = process.env.POSTFORME_API_KEY;
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;
  // Litterbox URL passed from workflow env
  const litterboxUrl = process.env.LITTERBOX_URL;

  if (!apiKey) {
    console.log("No POSTFORME_API_KEY — skipping PostForMe");
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

  const autoPublish = config.auto_publish || false;
  const publishMode = config.publish_mode || "immediate";
  const socialAccounts = config.postforme_account_ids || [];
  const topTaglines = Array.isArray(config.top_taglines) ? config.top_taglines : [];
  const bottomTaglines = Array.isArray(config.bottom_taglines) ? config.bottom_taglines : [];
  const titles = Array.isArray(config.titles) ? config.titles : [];
  const descriptions = Array.isArray(config.descriptions) ? config.descriptions : [];
  const hashtags = Array.isArray(config.hashtags) ? config.hashtags : [];
  const scheduleDate = config.schedule_date || "";
  const scheduleTime = config.schedule_time || "";
  let selectedAccountDetails = [];

  if (autoPublish && socialAccounts.length > 0) {
    try {
      selectedAccountDetails = await fetchSelectedPostformeAccounts(apiKey, socialAccounts);
    } catch (err) {
      console.warn(`Could not preload selected account details: ${err.message}`);
    }
  }

  // Build caption
  const topTagline = getRandomFromArray(topTaglines);
  const bottomTagline = getRandomFromArray(bottomTaglines);
  const title = getRandomFromArray(titles);
  const description = getRandomFromArray(descriptions);
  const normalizedHashtags = normalizeHashtags(hashtags);
  const hashtagsStr = normalizedHashtags.join(" ");
  const caption = [topTagline, title, description, hashtagsStr, bottomTagline]
    .filter(Boolean)
    .join("\n\n");
  const platformConfigurations = buildPlatformConfigurations(selectedAccountDetails, title || "");

  // Get media URL — prefer Litterbox, fallback to PostForMe upload
  let mediaUrl = null;

  if (litterboxUrl && litterboxUrl.startsWith("https://")) {
    console.log(`Using Litterbox URL: ${litterboxUrl}`);
    mediaUrl = litterboxUrl;
  } else {
    console.log("No Litterbox URL, uploading to PostForMe storage...");
    const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
    if (!fs.existsSync(videoFile)) {
      console.error("No processed video file found");
      process.exit(1);
    }
    mediaUrl = await uploadMediaToPostforme(apiKey, videoFile);
  }

  let livePostId = null;
  let draftPostId = null;
  let scheduledAt = null;

  try {
    // STEP A: Publish to selected accounts (if auto_publish enabled)
    if (autoPublish && socialAccounts.length > 0) {
      console.log(`Publishing to ${socialAccounts.length} accounts...`);

      if (publishMode === "scheduled" && scheduleDate && scheduleTime) {
        scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      } else if (publishMode === "offset") {
        // offset: post 1-6 hours from now
        const offsetHours = Math.floor(Math.random() * 5) + 1;
        const offsetDate = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
        scheduledAt = offsetDate.toISOString();
      }

      const livePost = await createPostformePost(
        apiKey, mediaUrl, caption, socialAccounts, scheduledAt, false, platformConfigurations
      );
      livePostId = livePost?.id || livePost?.data?.id;
      console.log(`Live post created: ${livePostId}`);
    } else {
      console.log("Auto-publish disabled or no accounts selected — skipping live post");
    }

    // STEP B: Always create a draft (for review queue — no accounts, isDraft: true)
    console.log("Creating draft post for review queue...");
    const draftPost = await createPostformePost(
      apiKey, mediaUrl, caption, [], null, true
    );
    draftPostId = draftPost?.id || draftPost?.data?.id;
    console.log(`Draft post created: ${draftPostId}`);

  } catch (err) {
    console.error(`PostForMe error: ${err.message}`);
    // Don't exit — still save what we have
  }

  const outputData = {
    success: true,
    media_url: mediaUrl,
    live_post_id: livePostId,
    draft_post_id: draftPostId,
    platforms: socialAccounts.length,
    caption: caption,
    post_metadata: {
      title: title || "",
      description: description || "",
      hashtags: normalizedHashtags,
      caption: caption,
      top_tagline: topTagline || "",
      bottom_tagline: bottomTagline || "",
      schedule_mode: publishMode,
      scheduled_accounts: socialAccounts.map((accountId) => {
        const account = selectedAccountDetails.find((item) => item && item.id === accountId) || null;
        return {
          id: accountId,
          platform: account?.platform || "",
          username: account?.username || accountId,
          scheduled_at: scheduledAt || null,
          postforme_id: livePostId || null
        };
      }),
      platform_configurations: Object.entries(platformConfigurations).map(([platform, configuration]) => ({
        platform,
        title: configuration?.title || "",
        caption
      }))
    }
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "post_result.json"),
    JSON.stringify(outputData)
  );

  // notifyWorker removed — webhook.final() in main.js handles the single webhook call
  // post_result.json (written above) is read by main.js and forwarded via webhook.final()

  console.log("=== SUCCESS ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
