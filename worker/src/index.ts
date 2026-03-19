import { Env, ApiResponse } from "./types";
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
