import { Env, ApiResponse, Job, GithubSettings } from "../types";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleJobsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2]) : null;
  const action = segments[3];

  // GET /api/jobs - List all
  if (path === "/api/jobs" && method === "GET") {
    const url = new URL(request.url);
    const automationId = url.searchParams.get("automation_id");
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    let query = "SELECT * FROM jobs WHERE 1=1";
    const params: (string | number)[] = [];

    if (automationId) {
      query += " AND automation_id = ?";
      params.push(parseInt(automationId));
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all<Job>();
    return jsonResponse({ success: true, data: result.results });
  }

  // Single job routes
  if (id && !action) {
    // GET /api/jobs/:id
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<Job>();
      if (!result) {
        return jsonResponse({ success: false, error: "Job not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }
  }

  // POST /api/jobs/:id/retry
  if (id && action === "retry" && method === "POST") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    await env.DB.prepare(
      "UPDATE jobs SET status = 'queued', error_message = NULL, completed_at = NULL WHERE id = ?"
    ).bind(id).run();

    return jsonResponse({ success: true, message: "Job queued for retry" });
  }

  // GET /api/jobs/:id/artifacts - Get GitHub Actions artifacts
  if (id && action === "artifacts" && method === "GET") {
    const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<Job>();
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
    if (!githubSettings) {
      return jsonResponse({ success: false, error: "GitHub settings not configured" }, 400);
    }

    if (!job.github_run_id) {
      return jsonResponse({ success: false, error: "No GitHub run associated with this job" }, 400);
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs/${job.github_run_id}/artifacts`,
        {
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AutomationSystem/1.0",
          },
        }
      );

      if (res.ok) {
        const data = await res.json() as { artifacts?: Array<{ name: string; archive_download_url: string; size_in_bytes: number }> };
        return jsonResponse({ success: true, data: data.artifacts || [] });
      }
      return jsonResponse({ success: false, error: "Failed to fetch artifacts" });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ success: false, error: errorMsg });
    }
  }

  return jsonResponse({ success: false, error: "Job route not found" }, 404);
}
