import { Env, AuthContext } from "../types";
import { jsonResponse, safeRequestJson } from "../utils";

export async function handleYoutubeQueueRoutes(
  request: Request,
  env: Env,
  path: string,
  authContext: AuthContext
): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const queueId = segments[2] ? Number.parseInt(segments[2], 10) : null;
  const action = segments[3];

  // GET /api/youtube-queue — List all queue items for user
  if (method === "GET" && path === "/api/youtube-queue") {
    const items = await env.DB.prepare(
      "SELECT id, url, title, status, job_id, error_message, queue_order, created_at, processed_at FROM youtube_queue WHERE user_id = ? ORDER BY queue_order ASC, id ASC"
    ).bind(authContext.userId).all();

    return jsonResponse({ success: true, data: items.results || [] });
  }

  // POST /api/youtube-queue — Add URL(s) to queue
  if (method === "POST" && path === "/api/youtube-queue") {
    const body = await safeRequestJson<{ urls?: string | string[] }>(request);
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const raw = body.urls;
    if (!raw || (Array.isArray(raw) && raw.length === 0) || (typeof raw === "string" && !raw.trim())) {
      return jsonResponse({ success: false, error: "urls is required (string or array)" }, 400);
    }

    const urls = Array.isArray(raw) ? raw : raw.split("\n").map((l) => l.trim()).filter(Boolean);

    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i;
    const validUrls = urls.filter((u) => youtubeRegex.test(u));
    if (validUrls.length === 0) {
      return jsonResponse({ success: false, error: "No valid YouTube URLs provided" }, 400);
    }

    // Get current max queue_order
    const maxOrder = await env.DB.prepare(
      "SELECT COALESCE(MAX(queue_order), 0) as max_order FROM youtube_queue WHERE user_id = ?"
    ).bind(authContext.userId).first<{ max_order: number }>();

    let order = (maxOrder?.max_order || 0) + 1;
    const added: { url: string; id: number }[] = [];
    const errors: { url: string; error: string }[] = [];

    for (const url of validUrls) {
      try {
        const result = await env.DB.prepare(
          "INSERT INTO youtube_queue (user_id, url, title, queue_order) VALUES (?, ?, ?, ?)"
        ).bind(authContext.userId, url, null, order).run();

        added.push({ url, id: result.meta.last_row_id as number });
        order++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Insert failed";
        errors.push({ url, error: msg });
      }
    }

    if (added.length === 0) {
      return jsonResponse({ success: false, error: "Failed to add any URLs to queue" }, 500);
    }

    const skippedCount = urls.length - validUrls.length;

    return jsonResponse({
      success: true,
      data: { added, errors: errors.length > 0 ? errors : undefined, skipped_count: skippedCount },
      message: `${added.length} URL(s) added to queue${errors.length ? `, ${errors.length} failed` : ""}${skippedCount ? `, ${skippedCount} skipped (not YouTube URLs)` : ""}`,
    }, 201);
  }

  // DELETE /api/youtube-queue/:id — Remove item from queue
  if (method === "DELETE" && queueId && !action) {
    const result = await env.DB.prepare(
      "DELETE FROM youtube_queue WHERE id = ? AND user_id = ? AND status = 'pending'"
    ).bind(queueId, authContext.userId).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ success: false, error: "Item not found or already processed" }, 404);
    }

    return jsonResponse({ success: true, message: "Queue item removed" });
  }

  // PATCH /api/youtube-queue/reorder — Reorder queue
  if (method === "PATCH" && path === "/api/youtube-queue/reorder") {
    const body = await safeRequestJson<{ ids: number[] }>(request);
    if (!body?.ids || !Array.isArray(body.ids)) {
      return jsonResponse({ success: false, error: "ids array is required" }, 400);
    }

    const tx = env.DB.batch(
      body.ids.map((id, index) =>
        env.DB.prepare("UPDATE youtube_queue SET queue_order = ? WHERE id = ? AND user_id = ?")
          .bind(index + 1, id, authContext.userId)
      )
    );

    try {
      await tx;
      return jsonResponse({ success: true, message: "Queue reordered" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reorder failed";
      return jsonResponse({ success: false, error: msg }, 500);
    }
  }

  // DELETE /api/youtube-queue — Clear all pending
  if (method === "DELETE" && path === "/api/youtube-queue") {
    const result = await env.DB.prepare(
      "DELETE FROM youtube_queue WHERE user_id = ? AND status = 'pending'"
    ).bind(authContext.userId).run();

    return jsonResponse({
      success: true,
      message: `${result.meta.changes} pending item(s) cleared`,
    });
  }

  return jsonResponse({ success: false, error: "Not found" }, 404);
}
