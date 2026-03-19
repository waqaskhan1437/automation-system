import { Env, ApiResponse, GithubSettings, Job } from "./types";
import { handleSettingsRoutes } from "./routes/settings";
import { handleAutomationsRoutes } from "./routes/automations";
import { handleJobsRoutes } from "./routes/jobs";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (path === "/" || path === "/api") {
      return jsonResponse({
        success: true,
        data: { name: "Automation API", version: "1.0.0" },
      });
    }

    if (path.startsWith("/api/settings")) {
      return handleSettingsRoutes(request, env, path);
    }

    if (path.startsWith("/api/automations")) {
      return handleAutomationsRoutes(request, env, path);
    }

    if (path.startsWith("/api/jobs")) {
      return handleJobsRoutes(request, env, path);
    }

    // Serve video/image output files
    if (path.startsWith("/api/output/") && method === "GET") {
      const segments = path.split("/").filter(Boolean);
      const jobId = segments[2] ? parseInt(segments[2]) : null;
      if (!jobId) {
        return jsonResponse({ success: false, error: "Job ID required" }, 400);
      }

      const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<Job>();
      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      if (!githubSettings || !job.github_run_id) {
        return jsonResponse({ success: false, error: "No GitHub run associated" }, 400);
      }

      try {
        // Get artifacts list
        const artRes = await fetch(
          `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
          {
            headers: {
              Authorization: `Bearer ${githubSettings.pat_token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "AutomationSystem/1.0",
            },
          }
        );

        if (!artRes.ok) {
          return jsonResponse({ success: false, error: "Failed to fetch artifacts" }, 500);
        }

        const artData = await artRes.json() as { artifacts?: Array<{ name: string; archive_download_url: string }> };
        const artifacts = artData.artifacts || [];

        if (artifacts.length === 0) {
          return jsonResponse({ success: false, error: "No artifacts found" }, 404);
        }

        // Get the artifact download URL
        const artifact = artifacts[0];
        const downloadUrl = artifact.archive_download_url;

        // Fetch the actual artifact (it's a zip file)
        const fileRes = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
          redirect: "follow",
        });

        if (!fileRes.ok) {
          return jsonResponse({ success: false, error: "Failed to download artifact" }, 500);
        }

        // Return the zip file with proper headers
        return new Response(fileRes.body, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${artifact.name}.zip"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    // Serve video stream (for playing in browser)
    if (path.startsWith("/api/stream/") && method === "GET") {
      const segments = path.split("/").filter(Boolean);
      const jobId = segments[2] ? parseInt(segments[2]) : null;
      if (!jobId) {
        return jsonResponse({ success: false, error: "Job ID required" }, 400);
      }

      const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first<Job>();
      if (!job) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }

      const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      if (!githubSettings || !job.github_run_id) {
        return jsonResponse({ success: false, error: "No GitHub run" }, 400);
      }

      try {
        // Get artifacts
        const artRes = await fetch(
          `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
          {
            headers: {
              Authorization: `Bearer ${githubSettings.pat_token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "AutomationSystem/1.0",
            },
          }
        );

        if (!artRes.ok) {
          return jsonResponse({ success: false, error: "Failed to fetch artifacts" }, 500);
        }

        const artData = await artRes.json() as { artifacts?: Array<{ name: string; archive_download_url: string }> };
        const artifacts = artData.artifacts || [];

        if (artifacts.length === 0) {
          return jsonResponse({ success: false, error: "No artifacts found" }, 404);
        }

        // Download the artifact
        const artifact = artifacts[0];
        const fileRes = await fetch(artifact.archive_download_url, {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
          redirect: "follow",
        });

        if (!fileRes.ok) {
          return jsonResponse({ success: false, error: "Failed to download" }, 500);
        }

        // Return as zip for now (video files inside will need extraction)
        return new Response(fileRes.body, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `inline; filename="${artifact.name}.zip"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return jsonResponse({ success: false, error: errorMsg }, 500);
      }
    }

    if (path === "/api/webhook/github" && method === "POST") {
      const body = await request.json() as Record<string, unknown>;
      const jobId = body.job_id as number;
      const status = body.status as string;
      if (jobId && status) {
        await env.DB.prepare(
          "UPDATE jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(status, jobId).run();
        return jsonResponse({ success: true, message: "Job updated" });
      }
      return jsonResponse({ success: false, error: "Missing job_id or status" }, 400);
    }

    return jsonResponse({ success: false, error: "Not found" }, 404);
  },
};
