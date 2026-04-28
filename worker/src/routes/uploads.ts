import { AuthContext, Env, VideoUpload, PostformeSettings } from "../types";
import {
  buildStoredPostMetadata,
  inferStoredPostMetadata,
  parseStoredPostMetadata,
  type StoredPostMetadata,
} from "../services/post-metadata";
import {
  fetchPostformePostSnapshot,
  mapPostformeStatusToLocalStatus,
  syncScheduledUploads,
} from "../services/postforme-sync";
import { jsonResponse, safeRequestJson } from "../utils";
import { getScopedSettings } from "../services/user-settings";

async function deleteCompletedJob(env: Env, jobId: number, userId: number): Promise<void> {
  const job = await env.DB.prepare("SELECT id, status FROM jobs WHERE id = ? AND user_id = ?").bind(jobId, userId).first<{ id: number; status: string }>();
  if (!job || (job.status !== "success" && job.status !== "failed")) {
    return;
  }

  await env.DB.prepare("DELETE FROM video_uploads WHERE job_id = ? AND user_id = ?").bind(jobId, userId).run();
  await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND user_id = ?").bind(jobId, userId).run();
}

interface UploadListRow extends VideoUpload {
  id: number;
  user_id: number;
  automation_id?: number | null;
  automation_name?: string | null;
  automation_config?: string | null;
  job_output_data?: string | null;
}

interface UploadSummaryRow {
  post_metadata: string | null;
  scheduled_at: string | null;
}

function buildUploadSummary(rows: UploadSummaryRow[]) {
  let scheduledAccounts = 0;
  let nextScheduledAt: string | null = null;
  let nextScheduledAtMs: number | null = null;

  for (const row of rows) {
    const metadata = parseStoredPostMetadata(row.post_metadata);
    scheduledAccounts += metadata?.scheduled_accounts.length || 1;

    if (!row.scheduled_at) {
      continue;
    }

    const scheduledAtMs = Date.parse(row.scheduled_at);
    if (Number.isNaN(scheduledAtMs)) {
      continue;
    }

    if (nextScheduledAtMs === null || scheduledAtMs < nextScheduledAtMs) {
      nextScheduledAt = row.scheduled_at;
      nextScheduledAtMs = scheduledAtMs;
    }
  }

  return {
    count: rows.length,
    scheduled_accounts: scheduledAccounts,
    next_scheduled_at: nextScheduledAt,
  };
}

function decorateUploadRecord(
  upload: UploadListRow,
  savedAccountsRaw: string | null | undefined,
  postDetailsOverride?: StoredPostMetadata | null
) {
  const postDetails = postDetailsOverride || inferStoredPostMetadata({
    rawMetadata: upload.post_metadata,
    config: upload.automation_config,
    outputData: upload.job_output_data,
    savedAccountsRaw,
    scheduledAt: upload.scheduled_at,
    postformeId: upload.postforme_id,
  });

  const scheduledAccountCount = postDetails?.scheduled_accounts.length || (upload.post_status === "scheduled" ? 1 : 0);

  return {
    ...upload,
    post_details: postDetails,
    scheduled_account_count: scheduledAccountCount,
  };
}

export async function handleUploadsRoutes(
  request: Request,
  env: Env,
  path: string,
  auth?: AuthContext
): Promise<Response> {
  if (!auth) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  const method = request.method;
  const userId = auth.userId;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2]) : null;
  const action = segments[3];

  const getPostformeSettings = async () => {
    return await getScopedSettings<PostformeSettings>(env.DB, "postforme", userId);
  };

  const postformeUpload = async (apiKey: string, videoUrl: string, platforms: string[]) => {
    const accountRes = await fetch("https://api.postforme.dev/v1/social-accounts", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    
    if (!accountRes.ok) {
      throw new Error("Failed to get social accounts");
    }
    
    const accountData = await accountRes.json() as { data?: Array<{ id: string; platform: string }> };
    const accounts = accountData.data || [];
    const platformMap: Record<string, string> = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube", facebook: "facebook", x: "x" };
    const selectedAccounts = accounts.filter((a: any) => platforms.some((p: string) => a.platform === platformMap[p])).map((a: any) => a.id);
    
    if (selectedAccounts.length === 0) {
      throw new Error("No matching social accounts found");
    }
    
    const postRes = await fetch("https://api.postforme.dev/v1/social-posts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media: [{ url: videoUrl }],
        social_accounts: selectedAccounts,
        caption: "Automated video post",
      }),
    });
    
    if (!postRes.ok) {
      const errorText = await postRes.text();
      throw new Error(`Postforme upload failed: ${errorText}`);
    }
    
    return await postRes.json() as { id?: string; media_id?: string };
  };

  const postformePost = async (apiKey: string, postId: string, scheduledAt?: string) => {
    const body: Record<string, unknown> = {};
    
    if (scheduledAt) {
      body.scheduled_at = scheduledAt;
    }
    
    const response = await fetch(`https://api.postforme.dev/v1/social-posts/${postId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Postforme post failed: ${errorText}`);
    }
    
    return await response.json();
  };

  if (path === "/api/uploads" && method === "GET") {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("job_id");
    const statusFilter = url.searchParams.get("status");
    const automationId = url.searchParams.get("automation_id");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const includeDetails = url.searchParams.get("details") === "1";
    const summaryOnly = url.searchParams.get("summary") === "1";
    const syncLive = url.searchParams.get("sync") === "1";

    const postformeSettings = await getPostformeSettings();

    if (summaryOnly) {
      if (statusFilter === "scheduled" && postformeSettings?.api_key && syncLive) {
        await syncScheduledUploads(env, {
          userId,
          limit: 100,
          onlyDue: true,
        });
      }

      let summaryQuery = `
        SELECT
          vu.post_metadata,
          vu.scheduled_at
        FROM video_uploads vu
        INNER JOIN jobs j ON j.id = vu.job_id
        WHERE vu.user_id = ?
      `;
      const summaryParams: Array<string | number> = [userId];

      if (jobId) {
        summaryQuery += " AND vu.job_id = ?";
        summaryParams.push(parseInt(jobId));
      }

      if (automationId) {
        summaryQuery += " AND j.automation_id = ?";
        summaryParams.push(parseInt(automationId));
      }

      if (statusFilter === "scheduled") {
        summaryQuery += " AND vu.post_status = 'scheduled'";
      } else if (statusFilter === "posted") {
        summaryQuery += " AND vu.post_status = 'posted'";
      } else if (statusFilter === "failed") {
        summaryQuery += " AND vu.post_status = 'failed'";
      } else if (statusFilter === "pending") {
        summaryQuery += " AND vu.post_status = 'pending'";
      }

      const summaryResult = await env.DB.prepare(summaryQuery).bind(...summaryParams).all<UploadSummaryRow>();
      return jsonResponse({ success: true, data: buildUploadSummary(summaryResult.results || []) });
    }
    
    let query = `
      SELECT
        vu.*,
        j.automation_id,
        a.name AS automation_name,
        a.config AS automation_config,
        j.output_data AS job_output_data
      FROM video_uploads vu
      INNER JOIN jobs j ON j.id = vu.job_id
      LEFT JOIN automations a ON a.id = j.automation_id
      WHERE vu.user_id = ?
    `;
    const params: Array<string | number> = [userId];
    
    if (jobId) {
      query += " AND vu.job_id = ?";
      params.push(parseInt(jobId));
    }

    if (automationId) {
      query += " AND j.automation_id = ?";
      params.push(parseInt(automationId));
    }

    if (statusFilter === "scheduled") {
      query += " AND vu.post_status = 'scheduled'";
    } else if (statusFilter === "posted") {
      query += " AND vu.post_status = 'posted'";
    } else if (statusFilter === "failed") {
      query += " AND vu.post_status = 'failed'";
    } else if (statusFilter === "pending") {
      query += " AND vu.post_status = 'pending'";
    }
    
    if (statusFilter === "scheduled") {
      query += " ORDER BY COALESCE(vu.scheduled_at, vu.created_at) ASC, vu.created_at DESC LIMIT ?";
    } else {
      query += " ORDER BY vu.created_at DESC LIMIT ?";
    }
    params.push(limit);
    
    const result = await env.DB.prepare(query).bind(...params).all<UploadListRow>();
    if (!includeDetails) {
      return jsonResponse({ success: true, data: result.results || [] });
    }

    const shouldSyncScheduled = statusFilter === "scheduled" && Boolean(postformeSettings?.api_key) && syncLive;

    const uploads = shouldSyncScheduled
      ? (await syncScheduledUploads<UploadListRow>(env, { uploads: result.results || [] }))
          .filter((entry) => entry.localStatus === "scheduled")
          .map((entry) => decorateUploadRecord(entry.upload, postformeSettings?.saved_accounts, entry.postDetails))
      : (result.results || []).map((upload) => decorateUploadRecord(upload, postformeSettings?.saved_accounts));

    return jsonResponse({ success: true, data: uploads });
  }

  if (path === "/api/uploads" && method === "POST") {
    const body = await safeRequestJson<Partial<VideoUpload>>(request);
    
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    
    if (!body.job_id) {
      return jsonResponse({ success: false, error: "job_id is required" }, 400);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API key not configured" }, 400);
    }

    try {
      const platforms = body.platforms ? JSON.parse(body.platforms as string) : [];
      
      let uploadResult: { id?: string; media_id?: string };
      if (body.media_url) {
        uploadResult = await postformeUpload(postformeSettings.api_key, body.media_url, platforms);
      } else {
        return jsonResponse({ success: false, error: "media_url is required" }, 400);
      }

      const result = await env.DB.prepare(
        `INSERT INTO video_uploads (user_id, job_id, postforme_id, media_url, upload_status, post_status, platforms, aspect_ratio, duration, file_size)
         VALUES (?, ?, ?, ?, 'uploaded', 'pending', ?, ?, ?, ?)`
      ).bind(
        userId,
        body.job_id,
        uploadResult.id || uploadResult.media_id || null,
        body.media_url,
        body.platforms || "[]",
        body.aspect_ratio || "9:16",
        body.duration || null,
        body.file_size || null
      ).run();

      return jsonResponse({
        success: true,
        data: { id: result.meta.last_row_id, postforme_id: uploadResult.id },
        message: "Video uploaded to Postforme"
      }, 201);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      
      await env.DB.prepare(
        "INSERT INTO video_uploads (user_id, job_id, media_url, upload_status, post_status, error_message) VALUES (?, ?, ?, 'failed', 'pending', ?)"
      ).bind(userId, body.job_id, body.media_url, errorMsg).run();

      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (path === "/api/uploads" && method === "DELETE") {
    const completedJobs = await env.DB.prepare(
      "SELECT id FROM jobs WHERE user_id = ? AND status IN ('success', 'failed')"
    ).bind(userId).all<{ id: number }>();

    await env.DB.prepare("DELETE FROM video_uploads WHERE user_id = ?").bind(userId).run();
    for (const job of completedJobs.results || []) {
      await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND user_id = ?").bind(job.id, userId).run();
    }
    return jsonResponse({ success: true, message: "All uploads deleted" });
  }

  if (id && !action) {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<VideoUpload>();
      if (!result) {
        return jsonResponse({ success: false, error: "Upload not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }
    if (method === "DELETE") {
      const upload = await env.DB.prepare("SELECT job_id FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<{ job_id: number }>();
      await env.DB.prepare("DELETE FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).run();
      if (upload?.job_id) {
        await deleteCompletedJob(env, upload.job_id, userId);
      }
      return jsonResponse({ success: true, message: "Upload deleted" });
    }
  }

  if (id && action === "post" && method === "POST") {
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<VideoUpload>();
    if (!upload) {
      return jsonResponse({ success: false, error: "Upload not found" }, 404);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API key not configured" }, 400);
    }

    try {
      const result = await postformePost(postformeSettings.api_key, upload.postforme_id || "");
      
      await env.DB.prepare(
        "UPDATE video_uploads SET post_status = 'posted', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(id).run();

      return jsonResponse({
        success: true,
        data: result,
        message: "Video posted successfully"
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (id && action === "schedule" && method === "POST") {
    const body = await safeRequestJson<{ scheduled_at: string }>(request);
    
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<VideoUpload>();
    
    if (!upload) {
      return jsonResponse({ success: false, error: "Upload not found" }, 404);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API key not configured" }, 400);
    }

    try {
      const result = await postformePost(postformeSettings.api_key, upload.postforme_id || "", body.scheduled_at);
      const existingMetadata = parseStoredPostMetadata(upload.post_metadata);
      const updatedMetadata = existingMetadata
        ? JSON.stringify(buildStoredPostMetadata({
            ...existingMetadata,
            scheduled_accounts: existingMetadata.scheduled_accounts.map((account) => ({
              ...account,
              scheduled_at: body.scheduled_at,
              postforme_id: upload.postforme_id || account.postforme_id,
            })),
          }))
        : null;
      
      await env.DB.prepare(
        "UPDATE video_uploads SET post_status = 'scheduled', scheduled_at = ?, post_metadata = COALESCE(?, post_metadata), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(body.scheduled_at, updatedMetadata, id).run();

      return jsonResponse({
        success: true,
        data: result,
        message: "Video scheduled successfully"
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (id && action === "status" && method === "GET") {
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<VideoUpload>();
    if (!upload) {
      return jsonResponse({ success: false, error: "Upload not found" }, 404);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key || !upload.postforme_id) {
      return jsonResponse({
        success: true,
        data: {
          upload_status: upload.upload_status,
          post_status: upload.post_status,
          scheduled_at: upload.scheduled_at,
          posted_at: upload.posted_at,
        }
      });
    }

    try {
      const liveSnapshot = await fetchPostformePostSnapshot(
        postformeSettings.api_key,
        upload.postforme_id || "",
        postformeSettings.saved_accounts
      );

      if (liveSnapshot) {
        const localStatus = mapPostformeStatusToLocalStatus(liveSnapshot.status, upload.post_status);
        return jsonResponse({
          success: true,
          data: {
            ...upload,
            post_status: localStatus,
            scheduled_at: localStatus === "scheduled" ? (liveSnapshot.scheduled_at || upload.scheduled_at) : null,
            posted_at: localStatus === "posted" ? (liveSnapshot.posted_at || upload.posted_at) : upload.posted_at,
            postforme_status: liveSnapshot.status,
          }
        });
      }
    } catch {}

    return jsonResponse({
      success: true,
      data: {
        upload_status: upload.upload_status,
        post_status: upload.post_status,
        scheduled_at: upload.scheduled_at,
        posted_at: upload.posted_at,
      }
    });
  }

  // DELETE scheduled post
  if (path.match(/^\/api\/upload(s)?\/[0-9]+\/schedule$/) && method === "DELETE") {
    if (!id) return jsonResponse({ success: false, error: "Upload ID required" }, 400);
    
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ? AND user_id = ?").bind(id, userId).first<VideoUpload>();
    if (!upload) return jsonResponse({ success: false, error: "Upload not found" }, 404);
    
    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API not configured" }, 400);
    }
    
    const postIdsToDelete: string[] = [];
    if (upload.postforme_id) {
      postIdsToDelete.push(upload.postforme_id);
    }
    
    // Also extract staggered post IDs from metadata
    let metadata: StoredPostMetadata | null = null;
    if (upload.post_metadata) {
      try {
        metadata = parseStoredPostMetadata(upload.post_metadata);
        if (metadata && metadata.scheduled_accounts) {
          for (const acc of metadata.scheduled_accounts) {
            if (acc.postforme_id && !postIdsToDelete.includes(acc.postforme_id)) {
              postIdsToDelete.push(acc.postforme_id);
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    
    let apiDeleteFailed = false;
    const deleteErrors: string[] = [];
    
    for (const postId of postIdsToDelete) {
      try {
        const res = await fetch(`https://api.postforme.dev/v1/social-posts/${postId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${postformeSettings.api_key}` },
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(`[POSTFORME] Delete failed ${res.status} for ${postId}: ${errBody}`);
          // If 404, post already gone — treat as success
          if (res.status === 404) {
            console.log(`[POSTFORME] Post ${postId} already deleted (404), continuing`);
          } else {
            apiDeleteFailed = true;
            deleteErrors.push(`Post ${postId}: ${res.status} ${errBody}`);
          }
        } else {
          console.log(`[POSTFORME] Post ${postId} deleted successfully`);
        }
      } catch (err) {
        console.error(`[POSTFORME] Delete request failed for ${postId}:`, err);
        apiDeleteFailed = true;
        deleteErrors.push(`Post ${postId}: network error`);
      }
    }
    
    if (apiDeleteFailed && postIdsToDelete.length > 0) {
      return jsonResponse({
        success: false,
        error: `Failed to delete from Postforme: ${deleteErrors.join("; ")}`,
      }, 502);
    }
    
    await env.DB.prepare(
      "UPDATE video_uploads SET post_status = 'failed', error_message = 'Cancelled by user', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run();
    
    return jsonResponse({ success: true, message: "Scheduled post cancelled" });
  }

  // DELETE all scheduled posts
  if (path === "/api/uploads/schedule/all" && method === "DELETE") {
    const scheduledUploads = await env.DB.prepare(
      "SELECT id, postforme_id, post_metadata FROM video_uploads WHERE user_id = ? AND post_status = 'scheduled'"
    ).bind(userId).all<{ id: number; postforme_id: string; post_metadata: string | null }>();
    
    const postformeSettings = await getPostformeSettings();
    let cancelled = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const upload of scheduledUploads.results || []) {
      const postIdsToDelete: string[] = [];
      if (upload.postforme_id) {
        postIdsToDelete.push(upload.postforme_id);
      }
      
      // Extract staggered post IDs from metadata
      if (upload.post_metadata) {
        try {
          const meta = parseStoredPostMetadata(upload.post_metadata);
          if (meta && meta.scheduled_accounts) {
            for (const acc of meta.scheduled_accounts) {
              if (acc.postforme_id && !postIdsToDelete.includes(acc.postforme_id)) {
                postIdsToDelete.push(acc.postforme_id);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
      
      let uploadDeleteFailed = false;
      for (const postId of postIdsToDelete) {
        if (postformeSettings?.api_key) {
          try {
            const res = await fetch(`https://api.postforme.dev/v1/social-posts/${postId}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${postformeSettings.api_key}` },
            });
            if (!res.ok) {
              const errBody = await res.text().catch(() => "");
              console.error(`[POSTFORME] Delete failed ${res.status} for ${postId}: ${errBody}`);
              if (res.status !== 404) {
                uploadDeleteFailed = true;
                errors.push(`Upload ${upload.id}, Post ${postId}: ${res.status}`);
              }
            } else {
              console.log(`[POSTFORME] Post ${postId} deleted successfully`);
            }
          } catch (err) {
            console.error(`[POSTFORME] Delete request failed for ${postId}:`, err);
            uploadDeleteFailed = true;
            errors.push(`Upload ${upload.id}, Post ${postId}: network error`);
          }
        }
      }
      
      if (uploadDeleteFailed) {
        failed++;
      } else {
        await env.DB.prepare(
          "UPDATE video_uploads SET post_status = 'failed', error_message = 'Cancelled by user', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(upload.id).run();
        cancelled++;
      }
    }
    
    const response: { success: boolean; cancelled: number; failed: number; errors?: string[] } = {
      success: failed === 0,
      cancelled,
      failed,
    };
    if (errors.length > 0) {
      response.errors = errors;
    }
    
    return jsonResponse(response, failed > 0 ? 502 : 200);
  }

  return jsonResponse({ success: false, error: "Upload route not found" }, 404);
}
