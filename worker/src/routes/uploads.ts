import { Env, ApiResponse, VideoUpload, PostformeSettings } from "../types";

function jsonResponse<T>(data: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function handleUploadsRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;
  const segments = path.split("/").filter(Boolean);
  const id = segments[2] ? parseInt(segments[2]) : null;
  const action = segments[3];

  const getPostformeSettings = async () => {
    return await env.DB.prepare("SELECT * FROM settings_postforme LIMIT 1").first<PostformeSettings>();
  };

  const postformeUpload = async (apiKey: string, videoUrl: string, platforms: string[]) => {
    const response = await fetch("https://api.postforme.com/v1/media/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: videoUrl,
        platforms: platforms,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Postforme upload failed: ${errorText}`);
    }
    
    return await response.json();
  };

  const postformePost = async (apiKey: string, mediaId: string, scheduledAt?: string) => {
    const body: Record<string, unknown> = {
      media_id: mediaId,
    };
    
    if (scheduledAt) {
      body.scheduled_at = scheduledAt;
    }
    
    const response = await fetch("https://api.postforme.com/v1/media/publish", {
      method: "POST",
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
    
    let query = "SELECT * FROM video_uploads WHERE 1=1";
    const params: (string | number)[] = [];
    
    if (jobId) {
      query += " AND job_id = ?";
      params.push(parseInt(jobId));
    }
    
    query += " ORDER BY created_at DESC";
    
    const result = await env.DB.prepare(query).bind(...params).all<VideoUpload>();
    return jsonResponse({ success: true, data: result.results });
  }

  if (path === "/api/uploads" && method === "POST") {
    const body = await request.json() as Partial<VideoUpload>;
    
    if (!body.job_id) {
      return jsonResponse({ success: false, error: "job_id is required" }, 400);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API key not configured" }, 400);
    }

    try {
      const platforms = body.platforms ? JSON.parse(body.platforms as string) : [];
      
      let uploadResult;
      if (body.media_url) {
        uploadResult = await postformeUpload(postformeSettings.api_key, body.media_url, platforms);
      } else {
        return jsonResponse({ success: false, error: "media_url is required" }, 400);
      }

      const result = await env.DB.prepare(
        `INSERT INTO video_uploads (job_id, postforme_id, media_url, upload_status, post_status, platforms, aspect_ratio, duration, file_size)
         VALUES (?, ?, ?, 'uploaded', 'pending', ?, ?, ?, ?)`
      ).bind(
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
        "INSERT INTO video_uploads (job_id, media_url, upload_status, post_status, error_message) VALUES (?, ?, 'failed', 'pending', ?)"
      ).bind(body.job_id, body.media_url, errorMsg).run();

      return jsonResponse({ success: false, error: errorMsg }, 500);
    }
  }

  if (id && !action) {
    if (method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ?").bind(id).first<VideoUpload>();
      if (!result) {
        return jsonResponse({ success: false, error: "Upload not found" }, 404);
      }
      return jsonResponse({ success: true, data: result });
    }
  }

  if (id && action === "post" && method === "POST") {
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ?").bind(id).first<VideoUpload>();
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
    const body = await request.json() as { scheduled_at: string };
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ?").bind(id).first<VideoUpload>();
    
    if (!upload) {
      return jsonResponse({ success: false, error: "Upload not found" }, 404);
    }

    const postformeSettings = await getPostformeSettings();
    if (!postformeSettings?.api_key) {
      return jsonResponse({ success: false, error: "Postforme API key not configured" }, 400);
    }

    try {
      const result = await postformePost(postformeSettings.api_key, upload.postforme_id || "", body.scheduled_at);
      
      await env.DB.prepare(
        "UPDATE video_uploads SET post_status = 'scheduled', scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(body.scheduled_at, id).run();

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
    const upload = await env.DB.prepare("SELECT * FROM video_uploads WHERE id = ?").bind(id).first<VideoUpload>();
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
      const statusRes = await fetch(`https://api.postforme.com/v1/media/${upload.postforme_id}/status`, {
        headers: {
          "Authorization": `Bearer ${postformeSettings.api_key}`,
        },
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        return jsonResponse({
          success: true,
          data: {
            ...upload,
            postforme_status: statusData,
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

  return jsonResponse({ success: false, error: "Upload route not found" }, 404);
}