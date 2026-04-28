interface Job {
  video_url?: string | null;
  output_data?: string | null;
  input_data?: string | null;
}

interface OutputData {
  media_url?: string;
  video_url?: string;
  local_output_media?: string;
  processed_videos?: Array<{ video_url: string }>;
}

interface InputData {
  video_urls?: string[];
  fetch_stats?: {
    total: number;
    unprocessed: number;
    to_process: number;
    processed_already: number;
  };
}

function isHttpMediaUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isWindowsFilePath(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]:\\/.test(value.trim());
}

function isLocalMediaProxyUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.startsWith("/api/local-media?")
    || /\/api\/local-media\?/i.test(trimmed);
}

function isPlayableVideoUrl(value: unknown): value is string {
  return isHttpMediaUrl(value) || isLocalMediaProxyUrl(value);
}

export function getVideoUrl(job: Job): string | null {
  if (isPlayableVideoUrl(job.video_url)) {
    return job.video_url.trim();
  }
  if (job.output_data) {
    try {
      const output: OutputData = JSON.parse(job.output_data);
      if (isPlayableVideoUrl(output.media_url)) {
        return output.media_url.trim();
      }
      if (isPlayableVideoUrl(output.video_url)) {
        return output.video_url.trim();
      }
      if (isPlayableVideoUrl(output.local_output_media)) {
        return output.local_output_media.trim();
      }
    } catch {}
  }
  return null;
}

export function getLocalVideoPath(job: Job): string | null {
  if (isWindowsFilePath(job.video_url)) {
    return job.video_url.trim();
  }

  if (job.output_data) {
    try {
      const output: OutputData = JSON.parse(job.output_data);
      if (isWindowsFilePath(output.local_output_media)) {
        return output.local_output_media.trim();
      }
      if (isWindowsFilePath(output.media_url)) {
        return output.media_url.trim();
      }
      if (isWindowsFilePath(output.video_url)) {
        return output.video_url.trim();
      }
    } catch {}
  }

  return null;
}

export function toLocalMediaUrl(filePath: string | null | undefined): string | null {
  const trimmed = typeof filePath === "string" ? filePath.trim() : "";
  if (!trimmed) {
    return null;
  }

  if (isLocalMediaProxyUrl(trimmed)) {
    return trimmed;
  }

  if (isHttpMediaUrl(trimmed)) {
    return trimmed;
  }

  return `/api/local-media?path=${encodeURIComponent(trimmed)}`;
}

export function getAllVideoUrls(job: Job): string[] {
  const urls: string[] = [];
  if (job.output_data) {
    try {
      const output: OutputData = JSON.parse(job.output_data);
      if (output.processed_videos && Array.isArray(output.processed_videos)) {
        for (const v of output.processed_videos) {
          if (isPlayableVideoUrl(v.video_url)) {
            urls.push(v.video_url.trim());
          }
        }
      }
    } catch {}
  }
  const singleUrl = getVideoUrl(job);
  if (singleUrl && !urls.includes(singleUrl)) {
    urls.unshift(singleUrl);
  }
  return urls;
}

export function getVideoUrls(job: Job): string[] {
  if (!job.input_data) return [];
  try {
    const input: InputData = JSON.parse(job.input_data);
    return input.video_urls || [];
  } catch {}
  return [];
}

export function getFetchStats(job: Job): InputData["fetch_stats"] | null {
  if (!job.input_data) return null;
  try {
    const input: InputData = JSON.parse(job.input_data);
    if (input.fetch_stats) return input.fetch_stats;
  } catch {}
  return null;
}

export function hasVideoUrl(job: Job): boolean {
  if (isPlayableVideoUrl(job.video_url)) return true;
  if (isWindowsFilePath(job.video_url)) return true;
  if (job.output_data) {
    try {
      const output: OutputData = JSON.parse(job.output_data);
      return (
        isPlayableVideoUrl(output.media_url)
        || isPlayableVideoUrl(output.video_url)
        || isPlayableVideoUrl(output.local_output_media)
        || isWindowsFilePath(output.local_output_media)
      ) ?? false;
    } catch { return false; }
  }
  return false;
}
