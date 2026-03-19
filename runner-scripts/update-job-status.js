const https = require("https");

async function main() {
  const workerUrl = process.env.WORKER_WEBHOOK_URL;
  const jobId = process.env.JOB_ID;
  const jobStatus = process.env.JOB_STATUS;

  if (!workerUrl || !jobId) {
    console.error("WORKER_WEBHOOK_URL and JOB_ID are required");
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
          res.on("end", () => {
            console.log(`Response: ${data}`);
            resolve(data);
          });
        }
      );
      req.on("error", reject);
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
