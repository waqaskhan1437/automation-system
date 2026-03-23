import { Env, Automation } from "../types";
import { jsonResponse } from "../utils";
import { backfillScheduledAutomations, getSchedulePersistenceValues, triggerAutomationRun, getLinkQueueStatus } from "../services/automation-scheduler";

export async function handleAutomationsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2], 10) : null;
  const action = segments[3];

  if (path === "/api/automations" && method === "POST") {
    const body = await request.json() as Partial<Automation>;
    if (!body.name || !body.type) {
      return jsonResponse({ success: false, error: "name and type are required" }, 400);
    }
    if (!["video", "image"].includes(body.type)) {
      return jsonResponse({ success: false, error: "type must be 'video' or 'image'" }, 400);
    }

    const status = body.status || "active";
    const config = body.config || "{}";

    let scheduleValues;
    try {
      scheduleValues = await getSchedulePersistenceValues(env, config, status, null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Invalid automation config";
      return jsonResponse({ success: false, error: errorMsg }, 400);
    }

    const result = await env.DB.prepare(
      "INSERT INTO automations (name, type, status, config, schedule, next_run) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(body.name, body.type, status, config, scheduleValues.schedule, scheduleValues.nextRun).run();

    return jsonResponse({
      success: true,
      data: { id: result.meta.last_row_id },
      message: "Automation created",
    }, 201);
  }

  if (path === "/api/automations" && method === "GET") {
    await backfillScheduledAutomations(env);

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

  if (id && !action) {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
      if (!result) {
        return jsonResponse({ success: false, error: "Automation not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }

    if (method === "PUT") {
      const body = await request.json() as Partial<Automation>;
      const existing = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
      if (!existing) {
        return jsonResponse({ success: false, error: "Automation not found" }, 404);
      }

      if (
        body.name === undefined &&
        body.status === undefined &&
        body.config === undefined &&
        body.schedule === undefined
      ) {
        return jsonResponse({ success: false, error: "No fields to update" }, 400);
      }

      const nextName = body.name ?? existing.name;
      const nextStatus = body.status ?? existing.status;
      const nextConfig = body.config ?? existing.config;

      let scheduleValues;
      try {
        scheduleValues = await getSchedulePersistenceValues(env, nextConfig, nextStatus, existing.last_run, existing.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Invalid automation config";
        return jsonResponse({ success: false, error: errorMsg }, 400);
      }

      await env.DB.prepare(
        "UPDATE automations SET name = ?, status = ?, config = ?, schedule = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(nextName, nextStatus, nextConfig, scheduleValues.schedule, scheduleValues.nextRun, id).run();

      return jsonResponse({ success: true, message: "Automation updated" });
    }

    if (method === "DELETE") {
      const jobIdsResult = await env.DB.prepare("SELECT id FROM jobs WHERE automation_id = ?").bind(id).all<{ id: number }>();
      const jobIds = (jobIdsResult.results || []).map((job) => job.id);

      for (const jobId of jobIds) {
        await env.DB.prepare("DELETE FROM video_uploads WHERE job_id = ?").bind(jobId).run();
      }

      await env.DB.prepare("DELETE FROM jobs WHERE automation_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM automations WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true, message: "Automation deleted" });
    }
  }

  if (id && action === "link-status" && method === "GET") {
    const status = await getLinkQueueStatus(env, id);
    return jsonResponse({ success: true, data: status });
  }

  if (id && action === "run" && method === "POST") {
    const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
    if (!automation) {
      return jsonResponse({ success: false, error: "Automation not found" }, 404);
    }

    const runResult = await triggerAutomationRun(env, automation);
    if (!runResult.success) {
      return jsonResponse(
        { success: false, error: runResult.error || "Failed to trigger automation" },
        runResult.inProgress ? 409 : 500
      );
    }

    return jsonResponse({
      success: true,
      data: { job_id: runResult.jobId, github_run_id: runResult.githubRunId ?? null },
      message: "Automation triggered! Running on GitHub Actions.",
    });
  }

  if (id && action === "pause" && method === "POST") {
    await env.DB.prepare(
      "UPDATE automations SET status = 'paused', next_run = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run();
    return jsonResponse({ success: true, message: "Automation paused" });
  }

  if (id && action === "resume" && method === "POST") {
    const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first<Automation>();
    if (!automation) {
      return jsonResponse({ success: false, error: "Automation not found" }, 404);
    }

    let scheduleValues;
    try {
      scheduleValues = await getSchedulePersistenceValues(env, automation.config, "active", automation.last_run, automation.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Invalid automation config";
      return jsonResponse({ success: false, error: errorMsg }, 400);
    }

    await env.DB.prepare(
      "UPDATE automations SET status = 'active', schedule = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(scheduleValues.schedule, scheduleValues.nextRun, id).run();
    return jsonResponse({ success: true, message: "Automation resumed" });
  }

  return jsonResponse({ success: false, error: "Automation route not found" }, 404);
}
