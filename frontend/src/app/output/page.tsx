"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import VideoPlayer from "@/components/ui/VideoPlayer";
import ScheduledPostsModal, { type ScheduledUploadsSummary } from "@/components/ui/ScheduledPostsModal";

interface OutputMediaItem {
  id: string;
  kind: "video" | "image";
  primaryUrl: string;
  urls: string[];
  date: string;
  mode: string;
  resolution: string;
  aspectRatio: string;
}

interface ScheduledSummary {
  count: number;
  scheduledAccounts: number;
  nextScheduledAt: string | null;
}

const EMPTY_SCHEDULED_SUMMARY: ScheduledSummary = {
  count: 0,
  scheduledAccounts: 0,
  nextScheduledAt: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanMediaUrls(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const item of items) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    const isRemoteUrl = trimmed.startsWith("https://") || trimmed.startsWith("http://");
    const isLocalMediaUrl = trimmed.startsWith("/api/local-media?") || /\/api\/local-media\?/i.test(trimmed);
    if (!isRemoteUrl && !isLocalMediaUrl) {
      continue;
    }

    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    urls.push(trimmed);
  }

  return urls;
}

function localMediaUrlFromPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/api/local-media?") || /\/api\/local-media\?/i.test(trimmed)) {
    return trimmed;
  }

  if (!/^[A-Za-z]:\\/.test(trimmed)) {
    return null;
  }

  return `/api/local-media?path=${encodeURIComponent(trimmed)}`;
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(url);
}

function parseOutputData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

function extractOutputItems(jobs: Array<Record<string, unknown>>): OutputMediaItem[] {
  const items: OutputMediaItem[] = [];

  for (const job of jobs) {
    const date = new Date(String(job.completed_at || job.created_at || Date.now())).toLocaleDateString();
    const output = parseOutputData(typeof job.output_data === "string" ? job.output_data : null);
    const primaryOutputUrl = typeof output.media_url === "string"
      ? output.media_url
      : (typeof output.video_url === "string" ? output.video_url : "");
    const fallbackJobUrl = typeof job.video_url === "string" ? job.video_url : "";
    const localOutputUrl = localMediaUrlFromPath(output.local_output_media)
      || localMediaUrlFromPath(output.media_url)
      || localMediaUrlFromPath(output.video_url)
      || localMediaUrlFromPath(job.video_url);
    const outputMode = typeof output.render_mode === "string"
      ? output.render_mode
      : (typeof output.mode === "string" ? output.mode : "standard");
    const resolution = typeof output.resolution === "string" ? output.resolution : "auto";
    const aspectRatio = typeof output.aspect_ratio === "string" ? output.aspect_ratio : "unknown";

    const imageUrls = cleanMediaUrls(output.media_urls);
    const imagePrimaryUrl = imageUrls[0] || primaryOutputUrl || fallbackJobUrl || localOutputUrl || "";
    const isImageOutput =
      output.media_kind === "image"
      || outputMode === "source_url"
      || outputMode === "html_banner"
      || imageUrls.length > 1
      || (imagePrimaryUrl ? isLikelyImageUrl(imagePrimaryUrl) : false);

    if (isImageOutput) {
      const urls = imageUrls.length > 0
        ? imageUrls
        : cleanMediaUrls([primaryOutputUrl, fallbackJobUrl, localOutputUrl]);

      if (urls.length > 0) {
        items.push({
          id: `image-${job.id || items.length}`,
          kind: "image",
          primaryUrl: urls[0],
          urls,
          date,
          mode: outputMode,
          resolution,
          aspectRatio,
        });
      }
      continue;
    }

    const processedVideos = Array.isArray(output.processed_videos) ? output.processed_videos : [];
    if (processedVideos.length > 0) {
      for (let index = 0; index < processedVideos.length; index += 1) {
        const record = asRecord(processedVideos[index]);
        const videoUrl = typeof record.video_url === "string" ? record.video_url : "";
        if (
          !videoUrl.startsWith("https://")
          && !videoUrl.startsWith("http://")
          && !videoUrl.startsWith("/api/local-media?")
        ) {
          continue;
        }

        items.push({
          id: `video-${job.id || items.length}-${index}`,
          kind: "video",
          primaryUrl: videoUrl,
          urls: [videoUrl],
          date,
          mode: "video",
          resolution,
          aspectRatio,
        });
      }
      continue;
    }

    const singleVideoUrl = primaryOutputUrl || fallbackJobUrl || localOutputUrl || "";
    if (singleVideoUrl.startsWith("https://") || singleVideoUrl.startsWith("http://") || singleVideoUrl.startsWith("/api/local-media?")) {
      items.push({
        id: `video-${job.id || items.length}`,
        kind: "video",
        primaryUrl: singleVideoUrl,
        urls: [singleVideoUrl],
        date,
        mode: "video",
        resolution,
        aspectRatio,
      });
    }
  }

  return items;
}

function formatScheduleLabel(value: string | null | undefined): string {
  if (!value) {
    return "Pending sync";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Pending sync";
  }

  return parsed.toLocaleString();
}

function normalizeScheduledSummary(value: unknown): ScheduledSummary {
  if (!value || typeof value !== "object") {
    return EMPTY_SCHEDULED_SUMMARY;
  }

  const summary = value as Record<string, unknown>;
  return {
    count: Number(summary.count || 0),
    scheduledAccounts: Number(summary.scheduled_accounts || 0),
    nextScheduledAt: typeof summary.next_scheduled_at === "string" ? summary.next_scheduled_at : null,
  };
}

function normalizeModalSummary(summary: ScheduledUploadsSummary): ScheduledSummary {
  return {
    count: summary.count,
    scheduledAccounts: summary.accounts,
    nextScheduledAt: summary.nextScheduledAt,
  };
}

export default function OutputPage() {
  const { jobs, loading, error } = useJobs(100);
  const outputItems = extractOutputItems(jobs as unknown as Array<Record<string, unknown>>);
  const imageItems = outputItems.filter((item) => item.kind === "image");
  const videoItems = outputItems.filter((item) => item.kind === "video");
  const [scheduledSummary, setScheduledSummary] = useState<ScheduledSummary>(EMPTY_SCHEDULED_SUMMARY);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const lastScheduledSummaryRefreshRef = useRef(0);

  const loadScheduledSummary = useCallback(async (syncLive: boolean = false) => {
    try {
      const params = new URLSearchParams({
        status: "scheduled",
        summary: "1",
      });

      if (syncLive) {
        params.set("sync", "1");
      }

      const response = await fetch(`/api/uploads?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setScheduledSummary(normalizeScheduledSummary(data.data));
        lastScheduledSummaryRefreshRef.current = Date.now();
      }
    } catch {}
  }, []);

  const handleScheduledSummaryChange = useCallback((summary: ScheduledUploadsSummary) => {
    setScheduledSummary(normalizeModalSummary(summary));
    lastScheduledSummaryRefreshRef.current = Date.now();
  }, []);

  useEffect(() => {
    void loadScheduledSummary(true);
  }, [loadScheduledSummary]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (Date.now() - lastScheduledSummaryRefreshRef.current < 60000) {
        return;
      }

      void loadScheduledSummary(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadScheduledSummary]);

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Output Media</h2>
          <p className="text-[#a1a1aa] mt-1">
            {outputItems.length} outputs total, {imageItems.length} image post{imageItems.length === 1 ? "" : "s"}, {videoItems.length} video{videoItems.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 min-w-[280px]">
          <div className="rounded-2xl border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#fcd34d]">Image Posts</div>
            <div className="text-2xl font-semibold text-white mt-1">{imageItems.length}</div>
          </div>
          <div className="rounded-2xl border border-[rgba(99,102,241,0.18)] bg-[rgba(99,102,241,0.08)] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-indigo-300">Videos</div>
            <div className="text-2xl font-semibold text-white mt-1">{videoItems.length}</div>
          </div>
        </div>
      </div>

      {scheduledSummary.count > 0 && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-yellow-400">
                {scheduledSummary.count} posts scheduled
                {scheduledSummary.scheduledAccounts > scheduledSummary.count ? ` across ${scheduledSummary.scheduledAccounts} accounts` : ""}
              </p>
              <p className="text-xs text-yellow-200/70 mt-1">
                Next publish: {formatScheduleLabel(scheduledSummary.nextScheduledAt)}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowScheduledModal(true)}
            className="px-4 py-2 bg-yellow-500/20 text-yellow-400 text-sm rounded-lg hover:bg-yellow-500/30 transition-colors"
          >
            View Scheduled
          </button>
        </div>
      )}

      <ScheduledPostsModal
        isOpen={showScheduledModal}
        onClose={() => setShowScheduledModal(false)}
        title="All Scheduled Posts"
        onSummaryChange={handleScheduledSummaryChange}
      />

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-[#a1a1aa]">Loading media...</p>
        </div>
      )}

      {error && (
        <div className="glass-card p-6 text-center">
          <p className="text-[#ef4444]">{error}</p>
        </div>
      )}

      {!loading && outputItems.length === 0 && (
        <div className="glass-card p-8 text-center">
          <p className="text-[#a1a1aa] text-lg">No media available yet.</p>
          <p className="text-sm text-[#71717a] mt-2">Image posts and videos will appear here after automation jobs complete successfully.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {outputItems.map((item) => (
          item.kind === "image" ? (
            <div key={item.id} className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] overflow-hidden">
              <div className="aspect-[4/5] bg-[#111827] relative">
                <img src={item.primaryUrl} alt="Generated output" className="w-full h-full object-cover" />
                {item.urls.length > 1 && (
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 text-xs font-semibold text-white">
                    {item.urls.length} images
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#71717a]">{item.date}</div>
                    <div className="text-lg font-semibold text-white mt-1">
                      {item.mode === "source_url" ? "Source image post" : "HTML banner output"}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.16)] text-amber-300">
                    image
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.06)] text-[#cbd5e1]">
                    {item.resolution}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(16,185,129,0.16)] text-emerald-300">
                    {item.aspectRatio}
                  </span>
                </div>

                {item.urls.length > 1 && (
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {item.urls.slice(0, 4).map((url, index) => (
                      <div key={`${item.id}-${url}-${index}`} className="rounded-xl overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[#111827]">
                        <div className="aspect-square">
                          <img src={url} alt={`Output preview ${index + 1}`} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={item.id}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs text-[#71717a]">{item.date}</div>
                <span className="text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 rounded-full bg-[rgba(99,102,241,0.16)] text-indigo-300">
                  video
                </span>
              </div>
              <VideoPlayer videoUrl={item.primaryUrl} />
            </div>
          )
        ))}
      </div>
    </div>
  );
}
