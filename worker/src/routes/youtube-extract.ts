import { Env, AuthContext } from "../types";
import { jsonResponse } from "../utils";
import { requireAuth } from "../services/auth";
import { extractYoutubeDownloadUrl } from "../services/ytdown-proxy";

export async function handleYoutubeExtractRoutes(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;

  if (method !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const youtubeUrl = url.searchParams.get("url") || "";

  if (!youtubeUrl.trim()) {
    return jsonResponse({ success: false, error: "Missing required query parameter: url" }, 400);
  }

  try {
    const result = await extractYoutubeDownloadUrl(youtubeUrl);

    let expiresIn: number | null = null;
    if (result.expiresAt) {
      expiresIn = Math.max(0, result.expiresAt - Math.floor(Date.now() / 1000));
    }

    return jsonResponse({
      success: true,
      data: {
        download_url: result.downloadUrl,
        file_name: result.fileName,
        file_size: result.fileSize,
        file_size_bytes: result.fileSizeBytes,
        title: result.title,
        quality: result.quality,
        resolution: result.resolution,
        expires_at: result.expiresAt,
        expires_in_seconds: expiresIn,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to extract download URL";
    console.error("YouTube extract error:", message);
    return jsonResponse({ success: false, error: message }, 502);
  }
}
