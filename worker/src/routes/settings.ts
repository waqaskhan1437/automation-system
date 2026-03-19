import { Env, ApiResponse, PostformeSettings, GithubSettings, VideoSourceSettings } from "../types";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleSettingsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;

  // POSTFORME SETTINGS
  if (path === "/api/settings/postforme") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<PostformeSettings>;
      if (!body.api_key) {
        return jsonResponse({ success: false, error: "api_key is required" }, 400);
      }

      const existing = await env.DB.prepare("SELECT id FROM settings_postforme LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_postforme SET api_key = ?, platforms = ?, default_schedule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.api_key, body.platforms || "[]", body.default_schedule || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_postforme (api_key, platforms, default_schedule) VALUES (?, ?, ?)"
        ).bind(body.api_key, body.platforms || "[]", body.default_schedule || null).run();
      }
      return jsonResponse({ success: true, message: "Postforme settings saved" });
    }
  }

  // GITHUB SETTINGS
  if (path === "/api/settings/github") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<GithubSettings>;
      if (!body.pat_token || !body.repo_owner || !body.repo_name) {
        return jsonResponse({ success: false, error: "pat_token, repo_owner, and repo_name are required" }, 400);
      }

      const existing = await env.DB.prepare("SELECT id FROM settings_github LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_github SET pat_token = ?, repo_owner = ?, repo_name = ?, runner_labels = ?, workflow_dispatch_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(body.pat_token, body.repo_owner, body.repo_name, body.runner_labels || "self-hosted", body.workflow_dispatch_url || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_github (pat_token, repo_owner, repo_name, runner_labels, workflow_dispatch_url) VALUES (?, ?, ?, ?, ?)"
        ).bind(body.pat_token, body.repo_owner, body.repo_name, body.runner_labels || "self-hosted", body.workflow_dispatch_url || null).run();
      }
      return jsonResponse({ success: true, message: "GitHub settings saved" });
    }
  }

  // VIDEO SOURCE SETTINGS
  if (path === "/api/settings/video-sources") {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM settings_video_sources LIMIT 1").first<VideoSourceSettings>();
      return jsonResponse({ success: true, data: result || null });
    }

    if (method === "POST") {
      const body = await request.json() as Partial<VideoSourceSettings>;

      const existing = await env.DB.prepare("SELECT id FROM settings_video_sources LIMIT 1").first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE settings_video_sources SET bunny_api_key = ?, bunny_library_id = ?, youtube_cookies = ? WHERE id = ?"
        ).bind(body.bunny_api_key || null, body.bunny_library_id || null, body.youtube_cookies || null, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO settings_video_sources (bunny_api_key, bunny_library_id, youtube_cookies) VALUES (?, ?, ?)"
        ).bind(body.bunny_api_key || null, body.bunny_library_id || null, body.youtube_cookies || null).run();
      }
      return jsonResponse({ success: true, message: "Video source settings saved" });
    }
  }

  return jsonResponse({ success: false, error: "Settings route not found" }, 404);
}
