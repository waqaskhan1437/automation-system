const https = require("https");
const fs = require("fs");
const path = require("path");
const http = require("http");

const OUTPUT_DIR = path.join(process.cwd(), "output");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomFromArray(arr) {
  if (!arr || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

async function uploadMediaToPostforme(apiKey, filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);
  
  console.log(`Generating upload URL for ${fileName} (${(fileData.length / 1024 / 1024).toFixed(2)} MB)...`);
  
  const createUrlBody = JSON.stringify({
    filename: fileName,
    content_type: filePath.endsWith(".webm") ? "video/webm" : "video/mp4"
  });
  
  const createUrlResponse = await fetch("https://api.postforme.dev/v1/media/create-upload-url", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(createUrlBody)
    },
    body: createUrlBody
  });
  
  if (!createUrlResponse.ok) {
    const errorText = await createUrlResponse.text();
    throw new Error(`Failed to create upload URL: ${errorText}`);
  }
  
  const urlData = await createUrlResponse.json();
  const { upload_url, media_url } = urlData;
  
  console.log(`Uploading to PostForMe storage...`);
  
  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": filePath.endsWith(".webm") ? "video/webm" : "video/mp4"
    },
    body: fileData
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload media: ${uploadResponse.status}`);
  }
  
  console.log(`Media uploaded: ${media_url}`);
  return media_url;
}

async function createSocialPost(apiKey, mediaUrl, caption, socialAccounts, scheduledAt = null) {
  const postBody = {
    caption: caption,
    media: [{ url: mediaUrl }],
    social_accounts: socialAccounts
  };
  
  if (scheduledAt) {
    postBody.scheduled_at = scheduledAt;
    console.log(`Scheduling for: ${scheduledAt}`);
  }
  
  const response = await fetch("https://api.postforme.dev/v1/social-posts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(JSON.stringify(postBody))
    },
    body: JSON.stringify(postBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create post: ${errorText}`);
  }
  
  return await response.json();
}

async function main() {
  console.log("=== PostForMe Posting ===");
  
  const apiKey = process.env.POSTFORME_API_KEY;
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;
  
  if (!apiKey) {
    console.error("POSTFORME_API_KEY is required");
    process.exit(1);
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
  const scheduleTimezone = config.postforme_schedule_timezone || "UTC";
  const staggerEnabled = config.postforme_account_stagger_enabled === true;
  const staggerMin = parseInt(config.postforme_account_stagger_min || "1");
  const staggerMax = parseInt(config.postforme_account_stagger_max || "60");
  
  if (!autoPublish) {
    console.log("Auto-publish is disabled, skipping PostForMe posting");
    fs.writeFileSync(path.join(OUTPUT_DIR, "post_result.json"), JSON.stringify({ skipped: true, reason: "auto_publish_disabled" }));
    if (workerUrl && jobId) {
      await notifyWorker(workerUrl, jobId, "success", { skipped: true, reason: "auto_publish_disabled" });
    }
    process.exit(0);
    return;
  }
  
  if (!socialAccounts || socialAccounts.length === 0) {
    console.log("No social accounts configured for posting");
    fs.writeFileSync(path.join(OUTPUT_DIR, "post_result.json"), JSON.stringify({ skipped: true, reason: "no_accounts" }));
    if (workerUrl && jobId) {
      await notifyWorker(workerUrl, jobId, "success", { skipped: true, reason: "no_accounts" });
    }
    process.exit(0);
    return;
  }
  
  const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
  const videoWebmFile = path.join(OUTPUT_DIR, "processed-video.webm");
  
  let mediaFile;
  if (fs.existsSync(videoFile)) {
    mediaFile = videoFile;
  } else if (fs.existsSync(videoWebmFile)) {
    mediaFile = videoWebmFile;
  } else {
    console.error("No processed video file found");
    process.exit(1);
  }
  
  console.log(`Video file: ${path.basename(mediaFile)}`);
  console.log(`Social accounts: ${socialAccounts.length}`);
  console.log(`Publish mode: ${publishMode}`);
  
  try {
    const mediaUrl = await uploadMediaToPostforme(apiKey, mediaFile);
    
    const topTagline = getRandomFromArray(topTaglines);
    const bottomTagline = getRandomFromArray(bottomTaglines);
    const title = getRandomFromArray(titles);
    const description = getRandomFromArray(descriptions);
    const hashtagsStr = Array.isArray(hashtags) ? hashtags.join(" ") : "";
    
    const caption = [topTagline, title, description, hashtagsStr, bottomTagline]
      .filter(Boolean)
      .join("\n\n");
    
    console.log(`Caption preview: ${caption.substring(0, 100)}...`);
    
    let scheduledAt = null;
    if (publishMode === "scheduled" && scheduleDate && scheduleTime) {
      const dateTimeStr = `${scheduleDate}T${scheduleTime}:00`;
      scheduledAt = new Date(dateTimeStr).toISOString();
    }
    
    const postResult = await createSocialPost(apiKey, mediaUrl, caption, socialAccounts, scheduledAt);
    
    console.log(`Post created successfully!`);
    console.log(`Post ID: ${postResult.id}`);
    console.log(`Status: ${postResult.status || 'posted'}`);
    
    const outputData = {
      success: true,
      post_id: postResult.id,
      post_url: postResult.url || `https://app.postforme.dev/social-posts/${postResult.id}`,
      media_url: mediaUrl,
      platforms: socialAccounts.length,
      scheduled: !!scheduledAt,
      scheduled_at: scheduledAt
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, "post_result.json"), JSON.stringify(outputData));
    console.log("Post result saved to output/post_result.json");
    
    if (workerUrl && jobId) {
      await notifyWorker(workerUrl, jobId, "success", outputData);
    }
    
    console.log("=== SUCCESS ===");
    process.exit(0);
    
  } catch (err) {
    console.error(`PostForMe error: ${err.message}`);
    
    if (workerUrl && jobId) {
      await notifyWorker(workerUrl, jobId, "failed", { error: err.message });
    }
    
    process.exit(1);
  }
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

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
