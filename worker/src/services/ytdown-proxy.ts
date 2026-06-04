const YTDOWN_BASE = "https://app.ytdown.to";
const YTDOWN_PROXY = `${YTDOWN_BASE}/proxy.php`;

const YTDOWN_INIT_TIMEOUT_MS = 30000;
const YTDOWN_POLL_MAX = 30;
const YTDOWN_POLL_INTERVAL_MS = 2000;
const YTDOWN_INIT_RETRIES = 2;

const VERIFY_HEAD_TIMEOUT_MS = 15000;
const VERIFY_EXPIRY_BUFFER_SEC = 0;

export interface YtdownMediaItem {
  type: string;
  name: string;
  mediaId: number | string;
  mediaUrl: string;
  mediaPreviewUrl: string;
  mediaThumbnail: string;
  mediaRes: string | false;
  mediaQuality: string;
  mediaDuration: string;
  mediaExtension: string;
  mediaFileSize: string;
  mediaTask: string;
}

export interface YtdownInitResponse {
  api: {
    status: string;
    service?: string;
    title?: string;
    description?: string;
    id?: string;
    imagePreviewUrl?: string;
    mediaItems?: YtdownMediaItem[];
    message?: string;
  };
}

function extractExpiryFromToken(fileUrl: string): number | null {
  try {
    const url = new URL(fileUrl);
    const token = url.searchParams.get("token");
    if (token) {
      const parts = token.split("_");
      const ts = Number.parseInt(parts[0], 10);
      if (Number.isFinite(ts)) {
        return ts;
      }
    }
  } catch {}
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchYtdownMediaList(youtubeUrl: string): Promise<{
  title: string;
  mediaItems: YtdownMediaItem[];
}> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= YTDOWN_INIT_RETRIES; attempt++) {
    try {
      const initRes = await fetchWithTimeout(YTDOWN_PROXY, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url: youtubeUrl }),
      }, YTDOWN_INIT_TIMEOUT_MS);

      if (!initRes.ok) {
        throw new Error(`HTTP ${initRes.status}`);
      }

      const data = (await initRes.json()) as YtdownInitResponse;

      if (data.api?.status !== "ok" || !data.api.mediaItems?.length) {
        throw new Error(data.api?.message || "No media items returned");
      }

      return {
        title: data.api.title || "Untitled",
        mediaItems: data.api.mediaItems,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < YTDOWN_INIT_RETRIES) {
        console.log(`[ytdown.to] Init attempt ${attempt}/${YTDOWN_INIT_RETRIES} failed: ${lastError.message} — retrying...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw new Error(`ytdown.to init failed after ${YTDOWN_INIT_RETRIES} attempts: ${lastError?.message}`);
}

interface FlatPollResponse {
  status: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: string;
  fileSizeBytes?: number;
  progress?: string;
  percent?: string;
  message?: string;
  code?: number;
}

export async function fetchYtdownDownloadUrl(mediaUrl: string): Promise<{
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  expiresAt: number | null;
}> {
  for (let attempt = 1; attempt <= YTDOWN_POLL_MAX; attempt++) {
    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(mediaUrl, { method: "GET" }, YTDOWN_POLL_INTERVAL_MS + 3000);
    } catch (err) {
      if (attempt < YTDOWN_POLL_MAX) {
        console.log(`[ytdown.to] Poll attempt ${attempt}/${YTDOWN_POLL_MAX} network error — retrying...`);
        await new Promise((r) => setTimeout(r, YTDOWN_POLL_INTERVAL_MS));
        continue;
      }
      throw new Error(`ytdown.to poll failed after ${YTDOWN_POLL_MAX} attempts: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!pollRes.ok) {
      if (attempt < YTDOWN_POLL_MAX) {
        console.log(`[ytdown.to] Poll attempt ${attempt}/${YTDOWN_POLL_MAX} HTTP ${pollRes.status} — retrying...`);
        await new Promise((r) => setTimeout(r, YTDOWN_POLL_INTERVAL_MS));
        continue;
      }
      throw new Error(`ytdown.to poll failed: HTTP ${pollRes.status}`);
    }

    const data: FlatPollResponse = await pollRes.json();

    if (data.status === "error") {
      throw new Error(data.message || `ytdown.to error (code ${data.code || "unknown"})`);
    }

    if (data.status === "completed") {
      if (!data.fileUrl) {
        throw new Error("ytdown.to completed but no fileUrl returned");
      }

      const expiresAt = extractExpiryFromToken(data.fileUrl);

      return {
        downloadUrl: data.fileUrl,
        fileName: data.fileName || `video-${Date.now()}.mp4`,
        fileSize: data.fileSize || "unknown",
        fileSizeBytes: data.fileSizeBytes || 0,
        expiresAt,
      };
    }

    if (attempt < YTDOWN_POLL_MAX) {
      console.log(`[ytdown.to] Status "${data.status}" — polling (${attempt}/${YTDOWN_POLL_MAX})...`);
      await new Promise((r) => setTimeout(r, YTDOWN_POLL_INTERVAL_MS));
    } else {
      throw new Error(
        `ytdown.to did not return "completed" after ${YTDOWN_POLL_MAX} polls (last status: "${data.status}")`
      );
    }
  }

  throw new Error("ytdown.to poll exited loop unexpectedly");
}

export interface VerifiedDownloadResult {
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  title: string;
  quality: string;
  resolution: string;
  expiresAt: number | null;
  verified: boolean;
}

export async function extractYoutubeDownloadUrl(youtubeUrl: string): Promise<VerifiedDownloadResult> {
  const { title, mediaItems } = await fetchYtdownMediaList(youtubeUrl);

  const qualityRank: Record<string, number> = {
    "FHD": 5, "1080p": 5, "1080": 5,
    "HD": 4, "720p": 4, "720": 4,
    "480p": 3, "480": 3,
    "360p": 2, "360": 2,
    "240p": 1, "240": 1,
    "144p": 0, "144": 0,
  };
  let selected = mediaItems
    .filter((item) => item.type === "Video")
    .sort((a, b) => (qualityRank[b.mediaQuality] ?? -1) - (qualityRank[a.mediaQuality] ?? -1))[0];
  if (!selected) {
    selected = mediaItems.find((item) => item.type === "Video");
  }
  if (!selected) {
    throw new Error("No video media items found");
  }

  const { downloadUrl, fileName, fileSize, fileSizeBytes, expiresAt } =
    await fetchYtdownDownloadUrl(selected.mediaUrl);

  const verified = await verifyDownloadLink(downloadUrl, expiresAt);

  return {
    downloadUrl,
    fileName,
    fileSize,
    fileSizeBytes,
    title,
    quality: selected.mediaQuality,
    resolution: typeof selected.mediaRes === "string" ? selected.mediaRes : "unknown",
    expiresAt,
    verified,
  };
}

export async function verifyDownloadLink(
  fileUrl: string,
  expiresAt: number | null
): Promise<boolean> {
  if (expiresAt) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - nowSec;
    if (remaining < VERIFY_EXPIRY_BUFFER_SEC) {
      console.log(`[ytdown.to] Link expires in ${remaining}s (< ${VERIFY_EXPIRY_BUFFER_SEC}s buffer) — treating as expired`);
      return false;
    }
    console.log(`[ytdown.to] Link expires in ${Math.floor(remaining / 60)}m — OK`);
  }

  async function checkUrl(method: string, range?: string): Promise<{ ok: boolean; status: number; ct: string; cl: string } | null> {
    try {
      const headers: Record<string, string> = {};
      if (range) headers["Range"] = range;
      const res = await fetchWithTimeout(fileUrl, { method, headers, redirect: "follow" }, VERIFY_HEAD_TIMEOUT_MS);
      const ct = res.headers.get("content-type") || "";
      const cl = res.headers.get("content-length") || "";
      return { ok: res.ok, status: res.status, ct, cl };
    } catch {
      return null;
    }
  }

  // Try HEAD first, then GET with Range, then simple GET
  let result = await checkUrl("HEAD");
  if (!result) {
    result = await checkUrl("GET", "bytes=0-0");
  }
  if (!result) {
    result = await checkUrl("GET");
  }

  if (!result) {
    console.log(`[ytdown.to] Verification: All probe methods failed — link unreachable`);
    return false;
  }

  if (result.status === 404) {
    console.log(`[ytdown.to] Verification: HTTP 404 — link dead`);
    return false;
  }
  if (result.status === 403) {
    console.log(`[ytdown.to] Verification: HTTP 403 — access denied`);
    return false;
  }

  const ct = result.ct;
  if (ct && !/^video\//i.test(ct) && !/^application\/octet-stream/i.test(ct) && !/^application\/x-www-form-urlencoded/i.test(ct) && !/^text\//i.test(ct)) {
    console.log(`[ytdown.to] Verification: Unexpected Content-Type "${ct}" — not a video stream`);
    return false;
  }

  if (result.cl) {
    const bytes = Number.parseInt(result.cl, 10);
    if (Number.isFinite(bytes) && bytes === 0) {
      console.log(`[ytdown.to] Verification: Content-Length is 0 — empty file`);
      return false;
    }
  }

  console.log(`[ytdown.to] Verification: OK (${result.status}, ${ct || "unknown type"})`);
  return true;
}
