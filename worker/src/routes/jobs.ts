import { Env, ApiResponse, Job } from "../types";

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

  return jsonResponse({ success: false, error: "Job route not found" }, 404);
}
