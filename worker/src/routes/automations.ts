import { AuthContext, Env, Automation } from "../types";
import { parseStoredPostMetadata } from "../services/post-metadata";
import { syncScheduledUploads } from "../services/postforme-sync";
import { jsonResponse, safeRequestJson } from "../utils";
import { backfillScheduledAutomations, getSchedulePersistenceValues, getLinkQueueStatus, parseAutomationConfig, triggerAutomationRun } from "../services/automation-scheduler";

interface AutomationJobStatsRow {
  automation_id: number | null;
  total_jobs: number;
  success_jobs: number;
  failed_jobs: number;
  running_jobs: number;
  queued_jobs: number;
  other_jobs: number;
}

interface AutomationUploadStatsRow {
  automation_id: number | null;
  post_status: string;
  post_metadata: string | null;
}

interface AutomationActiveJobRow {
  id: number;
  automation_id: number | null;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  error_message: string | null;
}

async function runDeleteIfTableExists(
  env: Env,
  query: string,
  bindings: Array<string | number>
): Promise<void> {
  try {
    await env.DB.prepare(query).bind(...bindings).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(message)) {
      console.warn("[automations.delete] Skipping delete for missing table:", query, message);
      return;
    }
    throw error;
  }
}

async function ensureRotationResetColumn(env: Env): Promise<void> {
  try {
    await env.DB.prepare("ALTER TABLE automations ADD COLUMN rotation_reset_at DATETIME").run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column name|already exists|no such column/i.test(message)) {
      throw error;
    }
  }
}

function getScheduledAccountCount(postMetadata: string | null | undefined): number {
  const parsed = parseStoredPostMetadata(postMetadata);
  return parsed?.scheduled_accounts.length || 1;
}

function normalizeConfigText(config: unknown): string {
  if (typeof config === "string") {
    return config;
  }
  return JSON.stringify(config || {});
}

function validateExecutionModeRules(configText: string, auth: AuthContext): string | null {
  let config: Record<string, unknown>;
  try {
    config = parseAutomationConfig(configText);
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid automation config";
  }

  const isAdmin = auth.isAdmin || auth.user.role === "admin";
  if (isAdmin && config.video_source === "local_folder") {
    return "Admin automations cannot use Local Folder. Create this under a user token so it runs on the local runner.";
  }

  return null;
}

export async function handleAutomationsRoutes(
  request: Request,
  env: Env,
  path: string,
  auth: AuthContext
): Promise<Response> {
  const method = request.method;
  const userId = auth.userId;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2], 10) : null;
  const action = segments[3];

  if (path === "/api/automations" && method === "POST") {
    const body = await safeRequestJson<Partial<Automation>>(request);
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    if (!body.name || !body.type) {
      return jsonResponse({ success: false, error: "name and type are required" }, 400);
    }
    if (!["video", "image"].includes(body.type)) {
      return jsonResponse({ success: false, error: "type must be 'video' or 'image'" }, 400);
    }

    const status = body.status || "active";
    const config = normalizeConfigText(body.config);
    const executionModeError = validateExecutionModeRules(config, auth);
    if (executionModeError) {
      return jsonResponse({ success: false, error: executionModeError }, 400);
    }

    let scheduleValues;
    try {
      scheduleValues = await getSchedulePersistenceValues(env, config, status, null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Invalid automation config";
      return jsonResponse({ success: false, error: errorMsg }, 400);
    }

    const result = await env.DB.prepare(
      "INSERT INTO automations (user_id, name, type, status, config, schedule, next_run) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(userId, body.name, body.type, status, config, scheduleValues.schedule, scheduleValues.nextRun).run();

    return jsonResponse({
      success: true,
      data: { id: result.meta.last_row_id },
      message: "Automation created",
    }, 201);
  }

  if (path === "/api/automations/dashboard" && method === "GET") {
    await backfillScheduledAutomations(env, userId);

    const url = new URL(request.url);
    const syncScheduled = url.searchParams.get("sync_scheduled") === "1";

    if (syncScheduled) {
      await syncScheduledUploads(env, {
        userId,
        limit: 50,
        onlyDue: false,
      });
    }

    const automationsResult = await env.DB.prepare(
      "SELECT * FROM automations WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(userId).all<Automation>();
    const automations = automationsResult.results || [];

    const jobStatsResult = await env.DB.prepare(
      `SELECT
         automation_id,
         COUNT(*) AS total_jobs,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_jobs,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs,
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_jobs,
         SUM(CASE WHEN status IN ('queued', 'pending') THEN 1 ELSE 0 END) AS queued_jobs,
         SUM(CASE WHEN status NOT IN ('success', 'failed', 'running', 'queued', 'pending') THEN 1 ELSE 0 END) AS other_jobs
       FROM jobs
       WHERE user_id = ?
       GROUP BY automation_id`
    ).bind(userId).all<AutomationJobStatsRow>();

    const uploadStatsResult = await env.DB.prepare(
      `SELECT
         j.automation_id,
         vu.post_status,
         vu.post_metadata
       FROM video_uploads vu
       INNER JOIN jobs j ON j.id = vu.job_id
       WHERE vu.user_id = ?
         AND j.automation_id IS NOT NULL
         AND vu.post_status IN ('scheduled', 'posted')`
    ).bind(userId).all<AutomationUploadStatsRow>();

    const activeJobsResult = await env.DB.prepare(
      `SELECT
         id,
         automation_id,
         status,
         github_run_id,
         github_run_url,
         error_message
       FROM jobs
       WHERE user_id = ?
         AND status IN ('queued', 'pending', 'running')
       ORDER BY automation_id ASC, id DESC`
    ).bind(userId).all<AutomationActiveJobRow>();

    const summaries: Record<number, {
      job_stats: {
        totalJobs: number;
        successJobs: number;
        failedJobs: number;
        runningJobs: number;
        queuedJobs: number;
        otherJobs: number;
      };
      post_stats: {
        scheduled: number;
        posted: number;
      };
      scheduled_summary: {
        posts: number;
        accounts: number;
      };
      latest_active_job: {
        jobId: number;
        status: string;
        githubRunId: number | null;
        githubRunUrl: string | null;
        error: string | null;
      } | null;
      link_queue: Awaited<ReturnType<typeof getLinkQueueStatus>>;
    }> = {};

    const ensureSummary = async (automation: Automation) => {
      if (!automation.id) {
        return null;
      }

      if (!summaries[automation.id]) {
        summaries[automation.id] = {
          job_stats: {
            totalJobs: 0,
            successJobs: 0,
            failedJobs: 0,
            runningJobs: 0,
            queuedJobs: 0,
            otherJobs: 0,
          },
          post_stats: {
            scheduled: 0,
            posted: 0,
          },
          scheduled_summary: {
            posts: 0,
            accounts: 0,
          },
          latest_active_job: null,
          link_queue: await getLinkQueueStatus(env, automation.id, userId),
        };
      }

      return summaries[automation.id];
    };

    await Promise.all(automations.map((automation) => ensureSummary(automation)));

    for (const row of jobStatsResult.results || []) {
      if (!row.automation_id || !summaries[row.automation_id]) {
        continue;
      }

      summaries[row.automation_id].job_stats = {
        totalJobs: Number(row.total_jobs || 0),
        successJobs: Number(row.success_jobs || 0),
        failedJobs: Number(row.failed_jobs || 0),
        runningJobs: Number(row.running_jobs || 0),
        queuedJobs: Number(row.queued_jobs || 0),
        otherJobs: Number(row.other_jobs || 0),
      };
    }

    for (const row of uploadStatsResult.results || []) {
      if (!row.automation_id || !summaries[row.automation_id]) {
        continue;
      }

      if (row.post_status === "scheduled") {
        summaries[row.automation_id].post_stats.scheduled += 1;
        summaries[row.automation_id].scheduled_summary.posts += 1;
        summaries[row.automation_id].scheduled_summary.accounts += getScheduledAccountCount(row.post_metadata);
      } else if (row.post_status === "posted") {
        summaries[row.automation_id].post_stats.posted += 1;
      }
    }

    for (const row of activeJobsResult.results || []) {
      if (!row.automation_id || !summaries[row.automation_id] || summaries[row.automation_id].latest_active_job) {
        continue;
      }

      summaries[row.automation_id].latest_active_job = {
        jobId: row.id,
        status: row.status,
        githubRunId: row.github_run_id,
        githubRunUrl: row.github_run_url,
        error: row.error_message,
      };
    }

    return jsonResponse({
      success: true,
      data: {
        automations,
        summaries,
      },
    });
  }

  if (path === "/api/automations" && method === "GET") {
    await backfillScheduledAutomations(env, userId);

    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");

    let query = "SELECT * FROM automations WHERE user_id = ?";
    const params: (string | number)[] = [userId];

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
      const result = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).first<Automation>();
      if (!result) {
        return jsonResponse({ success: false, error: "Automation not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }

    if (method === "PUT") {
      const body = await safeRequestJson<Partial<Automation>>(request);
      if (!body) {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }
      const existing = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).first<Automation>();
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
      // Ensure config is always a string
      const nextConfig = body.config !== undefined ? normalizeConfigText(body.config) : existing.config;
      const executionModeError = validateExecutionModeRules(nextConfig, auth);
      if (executionModeError) {
        return jsonResponse({ success: false, error: executionModeError }, 400);
      }

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
      const jobIdsResult = await env.DB.prepare("SELECT id FROM jobs WHERE automation_id = ? AND user_id = ?").bind(id, userId).all<{ id: number }>();
      const jobIds = (jobIdsResult.results || []).map((job) => job.id);

      for (const jobId of jobIds) {
        await env.DB.prepare("DELETE FROM video_uploads WHERE job_id = ? AND user_id = ?").bind(jobId, userId).run();
        await runDeleteIfTableExists(env, "DELETE FROM video_queue WHERE job_id = ?", [jobId]);
      }

      await runDeleteIfTableExists(env, "DELETE FROM processed_videos WHERE automation_id = ? AND user_id = ?", [id, userId]);
      await env.DB.prepare("DELETE FROM jobs WHERE automation_id = ? AND user_id = ?").bind(id, userId).run();
      await env.DB.prepare("DELETE FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).run();
      return jsonResponse({ success: true, message: "Automation deleted" });
    }
  }

  if (id && action === "link-status" && method === "GET") {
    const status = await getLinkQueueStatus(env, id, userId);
    // Also get raw automation to debug
    const auto = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).first<Automation>();
    let parsedConfig: Record<string, unknown> = {};
    try {
      if (auto?.config) parsedConfig = JSON.parse(auto.config);
    } catch {}
    const debugInfo = {
      video_source: parsedConfig.video_source,
      video_url: parsedConfig.video_url,
      manual_links: parsedConfig.manual_links,
      youtube_channel_url: parsedConfig.youtube_channel_url,
      google_photos_album_url: parsedConfig.google_photos_album_url,
      source_shorts_mode: parsedConfig.source_shorts_mode,
      source_shorts_max_count: parsedConfig.source_shorts_max_count,
      short_duration: parsedConfig.short_duration,
      videos_per_run: parsedConfig.videos_per_run,
    };
    return new Response(JSON.stringify({ success: true, data: status, debug: debugInfo }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // GET /api/automations/:id/processed-videos — Get list of processed video URLs
  if (id && action === "processed-videos" && method === "GET") {
    try {
      const result = await env.DB.prepare(
        "SELECT video_url FROM processed_videos WHERE automation_id = ? AND user_id = ? ORDER BY processed_at DESC"
      ).bind(id, userId).all<{ video_url: string }>();
      const urls = result.results?.map(r => r.video_url) || [];
      return jsonResponse({ success: true, data: urls });
    } catch (err) {
      console.error("Error fetching processed videos:", err);
      return jsonResponse({ success: false, error: "Database error" }, 500);
    }
  }

  // POST /api/automations/:id/processed-videos — Mark a video as processed
  if (id && action === "processed-videos" && method === "POST") {
    const body = await safeRequestJson<Record<string, unknown>>(request);
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    const videoUrl = body.video_url as string;
    const videoId = body.video_id as string | undefined;
    const videoTitle = body.video_title as string | undefined;
    const jobId = body.job_id as number | undefined;

    if (!videoUrl) {
      return jsonResponse({ success: false, error: "video_url required" }, 400);
    }

    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO processed_videos (user_id, automation_id, video_url, video_id, video_title, job_id, processed_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
      ).bind(userId, id, videoUrl, videoId || null, videoTitle || null, jobId || null).run();
      return jsonResponse({ success: true, message: "Video marked as processed" });
    } catch (err) {
      console.error("Error marking video as processed:", err);
      return jsonResponse({ success: false, error: "Database error" }, 500);
    }
  }

  // DELETE /api/automations/:id/processed-videos — Reset/Clear all processed videos
  if (id && action === "processed-videos" && method === "DELETE") {
    try {
      await ensureRotationResetColumn(env);
      const result = await env.DB.prepare(
        "UPDATE automations SET rotation_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
      ).bind(id, userId).run();
      await env.DB.prepare(
        "DELETE FROM processed_videos WHERE automation_id = ? AND user_id = ?"
      ).bind(id, userId).run();
      return jsonResponse({ success: true, message: `Rotation reset saved (${result.meta.changes} automation rows updated)` });
    } catch (err) {
      console.error("Error clearing processed videos:", err);
      return jsonResponse({ success: false, error: "Database error" }, 500);
    }
  }

  if (id && action === "run" && method === "POST") {
    const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).first<Automation>();
    if (!automation) {
      return jsonResponse({ success: false, error: "Automation not found" }, 404);
    }

    const runResult = await triggerAutomationRun(env, automation, userId, {
      replaceExistingLocalRun: true,
    });
    if (!runResult.success) {
      return jsonResponse(
        { success: false, error: runResult.error || "Failed to trigger automation" },
        runResult.inProgress ? 409 : 500
      );
    }

    return jsonResponse({
      success: true,
      data: { job_id: runResult.jobId, github_run_id: runResult.githubRunId ?? null },
      message: runResult.message || (
        runResult.executionMode === "local"
          ? "Automation triggered. Replacing any previous local run and waiting for your local runner."
          : "Automation triggered! Running on GitHub Actions."
      ),
    });
  }

  if (id && action === "pause" && method === "POST") {
    await env.DB.prepare(
      "UPDATE automations SET status = 'paused', next_run = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(id, userId).run();
    return jsonResponse({ success: true, message: "Automation paused" });
  }

  if (id && action === "resume" && method === "POST") {
    const automation = await env.DB.prepare("SELECT * FROM automations WHERE id = ? AND user_id = ?").bind(id, userId).first<Automation>();
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
      "UPDATE automations SET status = 'active', schedule = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(scheduleValues.schedule, scheduleValues.nextRun, id, userId).run();
    return jsonResponse({ success: true, message: "Automation resumed" });
  }

  return jsonResponse({ success: false, error: "Automation route not found" }, 404);
}
