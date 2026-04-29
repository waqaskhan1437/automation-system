const https = require("https");
const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { read_error: error.message };
  }
}

function readTextTail(filePath, maxChars = 4000) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const text = fs.readFileSync(filePath, "utf8");
    return text.length > maxChars ? text.slice(-maxChars) : text;
  } catch (error) {
    return `Could not read ${path.basename(filePath)}: ${error.message}`;
  }
}

function buildErrorMessage(failureReport, errorLogTail) {
  const reportError = failureReport && typeof failureReport === "object"
    ? (failureReport.last_error || failureReport.error || failureReport.message)
    : null;
  if (typeof reportError === "string" && reportError.trim()) {
    return reportError.trim().slice(0, 1000);
  }
  if (errorLogTail && errorLogTail.trim()) {
    return (errorLogTail.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || errorLogTail.trim()).slice(0, 1000);
  }
  return "GitHub Actions workflow failed before the runner returned a detailed error.";
}

async function main() {
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;
  const jobStatus = process.env.JOB_STATUS;
  const postformeOutput = process.env.POSTFORME_OUTPUT;
  const rawUrl = process.env.RAW_URL;

  if (!workerUrl || !jobId) {
    console.error("WORKER_WEBHOOK_URL and JOB_ID are required");
    console.log("WORKER_WEBHOOK_URL:", workerUrl);
    console.log("JOB_ID:", jobId);
    process.exit(1);
  }

  const status = jobStatus === "success" ? "success" : "failed";
  console.log(`Updating job ${jobId} to status: ${status}`);
  console.log(`Video URL: ${rawUrl}`);

  let outputData = null;
  if (postformeOutput) {
    try {
      outputData = JSON.parse(postformeOutput);
      console.log("PostForMe output found:", JSON.stringify(outputData));
    } catch (e) {
      console.log("Could not parse POSTFORME_OUTPUT");
    }
  }

  const outputDir = path.join(__dirname, "output");
  if (!outputData) {
    const postResultFile = path.join(outputDir, "post_result.json");
    if (fs.existsSync(postResultFile)) {
      try {
        outputData = JSON.parse(fs.readFileSync(postResultFile, "utf8"));
        console.log("PostForMe output loaded from file:", JSON.stringify(outputData));
      } catch (e) {
        console.log("Could not read post_result.json");
      }
    }
  }

  const failureReport = readJson(path.join(outputDir, "failure-report.json"));
  const errorLogTail = readTextTail(path.join(outputDir, "error.log"));
  const errorMessage = status === "failed" ? buildErrorMessage(failureReport, errorLogTail) : null;

  const mergedOutputData = {
    ...(outputData || {}),
    ...(failureReport ? { runner_failure: failureReport } : {}),
    ...(errorLogTail ? { error_log_tail: errorLogTail } : {}),
  };

  const webhookBody = JSON.stringify({
    job_id: parseInt(jobId, 10),
    status,
    error_message: errorMessage,
    output_data: Object.keys(mergedOutputData).length > 0 ? JSON.stringify(mergedOutputData) : undefined,
    video_url: rawUrl || null,
  });

  try {
    await new Promise((resolve, reject) => {
      const url = new URL(workerUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(webhookBody),
        },
      };

      console.log("Sending to:", options.hostname + options.path);

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`Response (${res.statusCode}): ${data}`);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Webhook returned ${res.statusCode}: ${data}`));
            return;
          }
          resolve(data);
        });
      });
      req.on("error", (err) => {
        console.error("Request error:", err.message);
        reject(err);
      });
      req.write(webhookBody);
      req.end();
    });
    console.log("Job status updated successfully");
  } catch (err) {
    console.error("Failed to update job status:", err.message);
    process.exit(1);
  }
}

main();
