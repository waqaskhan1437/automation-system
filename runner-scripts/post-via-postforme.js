const https = require("https");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), "output");

function getRandomFromArray(arr) {
  if (!arr || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

async function uploadMediaToPostforme(apiKey, filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);
  console.log(`Uploading ${fileName} to PostForMe (${(fileData.length / 1024 / 1024).toFixed(2)} MB)...`);

  const createUrlBody = JSON.stringify({
    filename: fileName,
    content_type: "video/mp4"
  });

  const createUrlResponse = await fetch("https://api.postforme.dev/v1/media/create-upload-url", {
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

  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: fileData
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload media: ${uploadResponse.status}`);
  }

  console.log(`Media uploaded to PostForMe: ${media_url}`);
  return media_url;
}

async function createPostformePost(apiKey, mediaUrl, caption, socialAccounts, scheduledAt, isDraft) {
  const postBody = {
    caption: caption,
    media: [{ url: mediaUrl }],
    social_accounts: socialAccounts,
    isDraft: isDraft
  };

  if (scheduledAt && !isDraft) {
    postBody.scheduled_at = scheduledAt;
  }

  const response = await fetch("https://api.postforme.dev/v1/social-posts", {
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

  // Build caption
  const topTagline = getRandomFromArray(topTaglines);
  const bottomTagline = getRandomFromArray(bottomTaglines);
  const title = getRandomFromArray(titles);
  const description = getRandomFromArray(descriptions);
  const hashtagsStr = Array.isArray(hashtags) ? hashtags.join(" ") : "";
  const caption = [topTagline, title, description, hashtagsStr, bottomTagline]
    .filter(Boolean)
    .join("\n\n");

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

  try {
    // STEP A: Publish to selected accounts (if auto_publish enabled)
    if (autoPublish && socialAccounts.length > 0) {
      console.log(`Publishing to ${socialAccounts.length} accounts...`);

      let scheduledAt = null;
      if (publishMode === "scheduled" && scheduleDate && scheduleTime) {
        scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      } else if (publishMode === "offset") {
        // offset: post 1-6 hours from now
        const offsetHours = Math.floor(Math.random() * 5) + 1;
        const offsetDate = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
        scheduledAt = offsetDate.toISOString();
      }

      const livePost = await createPostformePost(
        apiKey, mediaUrl, caption, socialAccounts, scheduledAt, false
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
    caption: caption
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "post_result.json"),
    JSON.stringify(outputData)
  );

  if (workerUrl && jobId) {
    await notifyWorker(workerUrl, jobId, "success", outputData);
  }

  console.log("=== SUCCESS ===");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
