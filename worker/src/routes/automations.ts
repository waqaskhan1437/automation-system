import { Env, ApiResponse, Automation, GithubSettings, PostformeSettings } from "../types";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleAutomationsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  // /api/automations/:id/:action
  // segments: ["api", "automations", "id", "action"]
  const id = segments[2] ? parseInt(segments[2]) : null;
  const action = segments[3];

  // POST /api/automations - Create
  if (path === "/api/automations" && method === "POST") {
    const body = await request.json() as Partial<Automation>;
    if (!body.name || !body.type) {
      return jsonResponse({ success: false, error: "name and type are required" }, 400);
    }
    if (!["video", "image"].includes(body.type)) {
      return jsonResponse({ success: false, error: "type must be 'video' or 'image'" }, 400);
    }

    const result = await env.DB.prepare(
      "INSERT INTO automations (name, type, config, schedule) VALUES (?, ?, ?, ?)"
    ).bind(body.name, body.type, body.config || "{}", body.schedule || null).run();

    return jsonResponse({
      success: true,
      data: { id: result.meta.last_row_id },
      message: "Automation created"
    }, 201);
  }

  // GET /api/automations - List all
  if (path === "/api/automations" && method === "GET") {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");

    let query = "SELECT * FROM automations WHERE 1=1";
    const params: (string | number)[] = [];

    if (type) {
      query += " AND type = ?";
      params.push(type);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    const result = await env.DB.prepare(query).bind(...params).all<Automation>();
    return jsonResponse({ success: true, data: result.results });
  }

  // Single automation routes
  if (id && !action) {
    // GET /api/automations/:id
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
      if (!result) {
        return jsonResponse({ success: false, error: "Automation not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }

    // PUT /api/automations/:id
    if (method === "PUT") {
      const body = await request.json() as Partial<Automation>;
      const fields: string[] = [];
      const params: (string | number | null)[] = [];

      if (body.name !== undefined) { fields.push("name = ?"); params.push(body.name); }
      if (body.status !== undefined) { fields.push("status = ?"); params.push(body.status); }
      if (body.config !== undefined) { fields.push("config = ?"); params.push(body.config); }
      if (body.schedule !== undefined) { fields.push("schedule = ?"); params.push(body.schedule); }

      if (fields.length === 0) {
        return jsonResponse({ success: false, error: "No fields to update" }, 400);
      }

      fields.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);

      await env.DB.prepare(`UPDATE automations SET ${fields.join(", ")} WHERE id = ?`).bind(...params).run();
      return jsonResponse({ success: true, message: "Automation updated" });
    }

    // DELETE /api/automations/:id
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM automations WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true, message: "Automation deleted" });
    }
  }

  // POST /api/automations/:id/run
  if (id && action === "run" && method === "POST") {
    const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
    if (!automation) {
      return jsonResponse({ success: false, error: "Automation not found" }, 404);
    }

    // Create job
    const jobResult = await env.DB.prepare(
      "INSERT INTO jobs (automation_id, status, input_data, started_at) VALUES (?, 'queued', ?, CURRENT_TIMESTAMP)"
    ).bind(id, automation.config).run();
    const jobId = jobResult.meta.last_row_id;

    // Get GitHub settings
    const githubSettings = await env.DB.prepare("SELECT * FROM settings_github LIMIT 1").first<GithubSettings>();
    if (!githubSettings) {
      return jsonResponse({ success: false, error: "GitHub settings not configured. Go to Settings → GitHub Runner" }, 400);
    }

    // Get Postforme settings
    const postformeSettings = await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();

    // Parse automation config
    let config;
    try {
      config = JSON.parse(automation.config);
    } catch {
      return jsonResponse({ success: false, error: "Invalid automation config" }, 400);
    }

    // Trigger GitHub workflow dispatch
    try {
      const workflowInputs: Record<string, string> = {
        job_id: String(jobId),
        automation_id: String(id),
        video_source: config.video_source || "direct",
        video_url: config.video_url || "",
        channel_url: config.channel_url || "",
        multiple_urls: JSON.stringify(config.multiple_urls || []),
        videos_per_run: String(config.fetch_config?.videos_per_run || 1),
        short_duration: String(config.short_settings?.max_duration || 60),
        playback_speed: String(config.short_settings?.playback_speed || 1),
        aspect_ratio: config.short_settings?.aspect_ratio || "9:16",
        crop_mode: config.short_settings?.crop_mode || "crop",
        split_enabled: String(config.split?.enabled || false),
        combine_enabled: String(config.combine?.enabled || false),
        codec: config.ffmpeg_config?.codec || "libx264",
        output_format: config.output_format || "mp4",
        output_quality: config.output_quality || "high",
        output_resolution: config.output_resolution || "1080x1920",
        auto_publish: String(config.publish?.auto_publish ?? true),
        platforms: JSON.stringify(config.platforms || []),
        top_tagline: config.taglines?.top_tagline || "",
        bottom_tagline: config.taglines?.bottom_tagline || "",
      };

      if (postformeSettings?.api_key) {
        workflowInputs.postforme_api_key = postformeSettings.api_key;
      }

      const githubResponse = await fetch(
        `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/workflows/video-automation.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubSettings.pat_token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "AutomationSystem/1.0",
          },
          body: JSON.stringify({
            ref: "master",
            inputs: workflowInputs,
          }),
        }
      );

      if (githubResponse.ok) {
        // Wait a moment for the run to be created
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get the latest run to store github_run_id
        let githubRunId = null;
        let githubRunUrl = null;
        try {
          const runsRes = await fetch(
            `https://api.github.com/repos/${githubSettings.repo_owner}/${githubSettings.repo_name}/actions/runs?per_page=1`,
            {
              headers: {
                Authorization: `Bearer ${githubSettings.pat_token}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "AutomationSystem/1.0",
              },
            }
          );
          if (runsRes.ok) {
            const runsData = await runsRes.json() as { workflow_runs?: Array<{ id: number; html_url: string }> };
            if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
              githubRunId = runsData.workflow_runs[0].id;
              githubRunUrl = runsData.workflow_runs[0].html_url;
            }
          }
        } catch {}

        await env.DB.prepare(
          "UPDATE jobs SET status = 'running', github_run_id = ?, github_run_url = ? WHERE id = ?"
        ).bind(githubRunId, githubRunUrl, jobId).run();

        return jsonResponse({
          success: true,
          data: { job_id: jobId, github_run_id: githubRunId },
          message: "Automation triggered! Running on GitHub Actions.",
        });
      } else {
        const errorText = await githubResponse.text();
        await env.DB.prepare(
          "UPDATE jobs SET status = 'failed', error_message = ? WHERE id = ?"
        ).bind(`GitHub API error: ${errorText}`, jobId).run();

        return jsonResponse({
          success: false,
          error: `GitHub workflow dispatch failed: ${errorText}`,
        }, 500);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await env.DB.prepare(
        "UPDATE jobs SET status = 'failed', error_message = ? WHERE id = ?"
      ).bind(errorMsg, jobId).run();

      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  // POST /api/automations/:id/pause
  if (id && action === "pause" && method === "POST") {
    await env.DB.prepare("UPDATE automations SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    return jsonResponse({ success: true, message: "Automation paused" });
  }

  // POST /api/automations/:id/resume
  if (id && action === "resume" && method === "POST") {
    await env.DB.prepare("UPDATE automations SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    return jsonResponse({ success: true, message: "Automation resumed" });
  }

  return jsonResponse({ success: false, error: "Automation route not found" }, 404);
}
