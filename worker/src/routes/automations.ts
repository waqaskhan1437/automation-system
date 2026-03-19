import { Env, ApiResponse, Automation } from "../types";

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
  const id = segments[3] ? parseInt(segments[3]) : null;
  const action = segments[4];

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

    const jobResult = await env.DB.prepare(
      "INSERT INTO jobs (automation_id, status, input_data) VALUES (?, 'queued', ?)"
    ).bind(id, automation.config).run();

    return jsonResponse({
      success: true,
      data: { job_id: jobResult.meta.last_row_id },
      message: "Job queued. Trigger GitHub workflow to execute."
    });
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
