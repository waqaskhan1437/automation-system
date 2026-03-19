"use client";
import { useState, useEffect, useRef } from "react";

interface Job {
  id: number;
  automation_id: number;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  created_at: string;
  completed_at: string | null;
  input_data: string | null;
}

interface Artifact {
  name: string;
  archive_download_url: string;
  size_in_bytes: number;
}

interface OutputItem {
  job: Job;
  artifacts: Artifact[];
  automationName: string;
}

export default function OutputPage() {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingJob, setPlayingJob] = useState<OutputItem | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetchOutputs();
  }, []);

  const fetchOutputs = async () => {
    try {
      const jobsRes = await fetch("/api/jobs?limit=50");
      const jobsData = await jobsRes.json();

      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      const autoMap: Record<number, string> = {};
      if (autoData.success && autoData.data) {
        autoData.data.forEach((a: { id: number; name: string }) => {
          autoMap[a.id] = a.name;
        });
      }

      if (jobsData.success && jobsData.data) {
        const items: OutputItem[] = [];
        for (const job of jobsData.data) {
          if (job.status === "success" || job.status === "running") {
            try {
              const artRes = await fetch(`/api/jobs/${job.id}/artifacts`);
              const artData = await artRes.json();
              if (artData.success && artData.data && artData.data.length > 0) {
                items.push({
                  job,
                  artifacts: artData.data,
                  automationName: autoMap[job.automation_id] || `Automation #${job.automation_id}`,
                });
              }
            } catch {}
          }
        }
        setOutputs(items);
      }
    } catch {}
    setLoading(false);
  };

  const openPlayer = async (item: OutputItem) => {
    setPlayingJob(item);
    setLoadingVideo(true);
    setVideoUrl(null);

    try {
      // Download the artifact and create a blob URL
      const res = await fetch(`/api/output/${item.job.id}`);
      if (res.ok) {
        const blob = await res.blob();
        // Try to extract video from zip
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
      }
    } catch (err) {
      console.error("Failed to load video");
    }
    setLoadingVideo(false);
  };

  const closePlayer = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setPlayingJob(null);
    setVideoUrl(null);
  };

  const getAutomationType = (inputData: string | null): string => {
    if (!inputData) return "video";
    try {
      const data = JSON.parse(inputData);
      return data.video_source ? "video" : "image";
    } catch {
      return "video";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Output</h2>
          <p className="text-[#a1a1aa] mt-1">Processed videos and images from your automations</p>
        </div>
        <button onClick={fetchOutputs} className="glass-button flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading outputs...</div>
      ) : outputs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <p className="text-[#a1a1aa] mt-1">Run an automation to see processed videos here</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">
            Go to Automations
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {outputs.map((item) => {
            const isVideo = getAutomationType(item.job.input_data) === "video";
            return (
              <div key={item.job.id} className="glass-card overflow-hidden group">
                {/* Thumbnail / Preview Area */}
                <div
                  className="relative aspect-[9/16] bg-gradient-to-br from-[#1a1a2e] to-[#0d0d14] flex items-center justify-center cursor-pointer"
                  onClick={() => openPlayer(item)}
                >
                  {/* Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/20 transition-all group-hover:scale-110">
                      <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Type Icon */}
                  <div className="absolute top-3 left-3">
                    <span className={`badge ${isVideo ? "badge-video" : "badge-image"}`}>
                      {isVideo ? "Video" : "Image"}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    <span className={`badge ${item.job.status === "success" ? "badge-success" : "badge-running"}`}>
                      {item.job.status}
                    </span>
                  </div>

                  {/* Job ID */}
                  <div className="absolute bottom-3 left-3">
                    <span className="text-xs text-white/50">#{item.job.id}</span>
                  </div>

                  {/* Duration / Size */}
                  <div className="absolute bottom-3 right-3">
                    {item.artifacts[0] && (
                      <span className="text-xs text-white/50">
                        {(item.artifacts[0].size_in_bytes / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>

                {/* Info Section */}
                <div className="p-4">
                  <h4 className="font-semibold text-sm truncate">{item.automationName}</h4>
                  <p className="text-xs text-[#a1a1aa] mt-1">
                    {new Date(item.job.created_at).toLocaleDateString()} at {new Date(item.job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openPlayer(item)}
                      className="flex-1 glass-button-primary text-xs py-2 flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Play
                    </button>
                    {item.artifacts[0] && (
                      <a
                        href={item.artifacts[0].archive_download_url}
                        target="_blank"
                        rel="noopener"
                        className="glass-button text-xs py-2 px-3 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Modal */}
      {playingJob && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closePlayer}>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{playingJob.automationName}</h3>
                <p className="text-xs text-white/50">Job #{playingJob.job.id}</p>
              </div>
              <button onClick={closePlayer} className="glass-button py-2 px-4 text-sm">Close</button>
            </div>

            {/* Video Player */}
            <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16] max-h-[70vh] mx-auto" style={{ maxWidth: "400px" }}>
              {loadingVideo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-3 animate-spin text-[#6366f1]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-white/50 text-sm">Loading video...</p>
                  </div>
                </div>
              ) : videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  onError={() => {
                    console.log("Video format not supported for preview. Please download the zip file.");
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-6">
                    <svg className="w-16 h-16 mx-auto mb-3 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-white/50 text-sm mb-3">Video preview not available</p>
                    <p className="text-white/30 text-xs mb-4">Download the zip file to view the processed video</p>
                    {playingJob.artifacts[0] && (
                      <a
                        href={playingJob.artifacts[0].archive_download_url}
                        target="_blank"
                        rel="noopener"
                        className="glass-button-primary inline-flex items-center gap-2 text-sm py-2 px-4"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Video
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-3">
                {playingJob.artifacts[0] && (
                  <span className="text-xs text-white/50">
                    {playingJob.artifacts[0].name} - {(playingJob.artifacts[0].size_in_bytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {playingJob.artifacts[0] && (
                  <a
                    href={playingJob.artifacts[0].archive_download_url}
                    target="_blank"
                    rel="noopener"
                    className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </a>
                )}
                {playingJob.job.github_run_url && (
                  <a
                    href={playingJob.job.github_run_url}
                    target="_blank"
                    rel="noopener"
                    className="glass-button text-sm py-2 px-4"
                  >
                    GitHub
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
