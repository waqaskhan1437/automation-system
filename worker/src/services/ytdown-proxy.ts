const YTDOWN_BASE = "https://app.ytdown.to";
const YTDOWN_PROXY = `${YTDOWN_BASE}/proxy.php`;

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

export interface YtdownDownloadResponse {
  api: {
    status: "completed" | "queued" | "processing" | "error";
    fileName?: string;
    fileUrl?: string;
    fileSize?: string;
    fileSizeBytes?: number;
    progress?: string;
    percent?: string;
    message?: string;
    code?: number;
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

export async function fetchYtdownMediaList(youtubeUrl: string): Promise<{
  title: string;
  mediaItems: YtdownMediaItem[];
}> {
  const initRes = await fetch(YTDOWN_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: youtubeUrl }),
  });

  if (!initRes.ok) {
    throw new Error(`ytdown.to init failed: HTTP ${initRes.status}`);
  }

  const data = (await initRes.json()) as YtdownInitResponse;

  if (data.api?.status !== "ok" || !data.api.mediaItems?.length) {
    throw new Error(data.api?.message || "ytdown.to returned no media items");
  }

  return {
    title: data.api.title || "Untitled",
    mediaItems: data.api.mediaItems,
  };
}

export async function fetchYtdownDownloadUrl(mediaUrl: string): Promise<{
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  expiresAt: number | null;
}> {
  const pollRes = await fetch(YTDOWN_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: mediaUrl }),
  });

  if (!pollRes.ok) {
    throw new Error(`ytdown.to poll failed: HTTP ${pollRes.status}`);
  }

  const data = (await pollRes.json()) as YtdownDownloadResponse;

  if (data.api?.status === "error") {
    throw new Error(data.api.message || `ytdown.to error (code ${data.api.code || "unknown"})`);
  }

  if (data.api?.status !== "completed") {
    throw new Error(`ytdown.to returned status "${data.api?.status}" — expected "completed"`);
  }

  if (!data.api.fileUrl) {
    throw new Error("ytdown.to completed but no fileUrl returned");
  }

  const expiresAt = extractExpiryFromToken(data.api.fileUrl);

  return {
    downloadUrl: data.api.fileUrl,
    fileName: data.api.fileName || `video-${Date.now()}.mp4`,
    fileSize: data.api.fileSize || "unknown",
    fileSizeBytes: data.api.fileSizeBytes || 0,
    expiresAt,
  };
}

export async function extractYoutubeDownloadUrl(youtubeUrl: string): Promise<{
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes: number;
  title: string;
  quality: string;
  resolution: string;
  expiresAt: number | null;
}> {
  const { title, mediaItems } = await fetchYtdownMediaList(youtubeUrl);

  const preferredOrder = ["1080p", "720p", "480p", "360p"];
  let selected = mediaItems.find(
    (item) => item.type === "Video" && preferredOrder.includes(item.mediaQuality)
  );
  if (!selected) {
    selected = mediaItems.find((item) => item.type === "Video");
  }
  if (!selected) {
    throw new Error("No video media items found");
  }

  const { downloadUrl, fileName, fileSize, fileSizeBytes, expiresAt } =
    await fetchYtdownDownloadUrl(selected.mediaUrl);

  return {
    downloadUrl,
    fileName,
    fileSize,
    fileSizeBytes,
    title,
    quality: selected.mediaQuality,
    resolution: typeof selected.mediaRes === "string" ? selected.mediaRes : "unknown",
    expiresAt,
  };
}
