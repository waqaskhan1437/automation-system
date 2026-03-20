const https = require("https");

async function main() {
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;
  const jobStatus = process.env.JOB_STATUS;

  if (!workerUrl || !jobId) {
    console.error("WORKER_WEBHOOK_URL and JOB_ID are required");
    console.log("WORKER_WEBHOOK_URL:", workerUrl);
    console.log("JOB_ID:", jobId);
    process.exit(1);
  }

  const status = jobStatus === "success" ? "success" : "failed";

  console.log(`Updating job ${jobId} to status: ${status}`);

  const webhookBody = JSON.stringify({
    job_id: parseInt(jobId),
    status: status,
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
