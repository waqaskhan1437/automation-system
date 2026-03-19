const https = require("https");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "output");

function postToPostforme(apiKey, platform, filePath) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = "----FormBoundary" + Date.now();

    const platformEndpoints = {
      instagram: "/api/v1/post/instagram",
      youtube: "/api/v1/post/youtube",
      tiktok: "/api/v1/post/tiktok",
      facebook: "/api/v1/post/facebook",
      x: "/api/v1/post/twitter",
      twitter: "/api/v1/post/twitter",
    };

    const endpoint = platformEndpoints[platform.toLowerCase()];
    if (!endpoint) {
      return reject(new Error(`Unknown platform: ${platform}`));
    }

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`),
      Buffer.from(`Content-Type: video/mp4\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const options = {
      hostname: "api.postforme.io",
      port: 443,
      path: endpoint,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(`Postforme API error (${res.statusCode}): ${data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const apiKey = process.env.POSTFORME_API_KEY;
  const platformsJson = process.env.PLATFORMS;
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;

  if (!apiKey) {
    console.error("POSTFORME_API_KEY environment variable is required");
    process.exit(1);
  }

  if (!platformsJson) {
    console.error("PLATFORMS environment variable is required");
    process.exit(1);
  }

  let platforms;
  try {
    platforms = JSON.parse(platformsJson);
  } catch (err) {
    console.error("Invalid PLATFORMS JSON:", err.message);
    process.exit(1);
  }

  const videoFile = path.join(OUTPUT_DIR, "processed-video.mp4");
  const imageFile = path.join(OUTPUT_DIR, "processed-image.png");

  let mediaFile;
  if (fs.existsSync(videoFile)) {
    mediaFile = videoFile;
  } else if (fs.existsSync(imageFile)) {
    mediaFile = imageFile;
  } else {
    console.error("No processed media file found");
    process.exit(1);
  }

  console.log(`Posting ${path.basename(mediaFile)} to: ${platforms.join(", ")}`);

  const results = [];

  for (const platform of platforms) {
    console.log(`\nPosting to ${platform}...`);
    try {
      const result = await postToPostforme(apiKey, platform, mediaFile);
      console.log(`  Success: ${JSON.stringify(result)}`);
      results.push({ platform, status: "success", result });
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      results.push({ platform, status: "failed", error: err.message });
    }
  }

  const allFailed = results.every((r) => r.status === "failed");
  const status = allFailed ? "failed" : "success";

  if (workerUrl && jobId) {
    try {
      const webhookBody = JSON.stringify({
        job_id: parseInt(jobId),
        status: status,
        output_data: JSON.stringify(results),
      });

      await new Promise((resolve, reject) => {
        const url = new URL(workerUrl);
        const req = https.request(
          {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(webhookBody),
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", resolve);
          }
        );
        req.on("error", reject);
        req.write(webhookBody);
        req.end();
      });
      console.log("\nWorker webhook notified");
    } catch (err) {
      console.error("Failed to notify worker:", err.message);
    }
  }

  console.log(`\nPosting complete. Status: ${status}`);
  if (status === "failed") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Posting failed:", err.message);
  process.exit(1);
});
