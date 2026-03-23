"use client";
import { useState, useEffect } from "react";

interface Job {
  id: number;
  automation_id: number;
  status: "queued" | "running" | "success" | "failed";
  github_run_id: number | null;
  github_run_url: string | null;
  error_message: string | null;
  output_data: string | null;
  video_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  return (
    <div style={{ borderRadius: "12px", overflow: "hidden", background: "#000", marginTop: "12px" }}>
      <video
        src={videoUrl}
        controls
        playsInline
        style={{
          width: "100%",
          maxHeight: "400px",
          display: "block",
        }}
      />
      <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#a1a1aa" }}>
          ⏳ Preview valid ~72 hours
        </span>
        <a
          href={videoUrl}
          download
          target="_blank"
          rel="noopener"
          style={{
            fontSize: "12px",
            color: "#6366f1",
            textDecoration: "none",
            padding: "4px 10px",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "6px",
          }}
        >
          ↓ Download
        </a>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.success) {
        setJobs(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch jobs");
    }
    setLoading(false);
  };

  const handleRetry = async (id: number) => {
    try {
      await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
      fetchJobs();
    } catch (err) {
      console.error("Retry failed");
    }
  };

  const getVideoUrl = (job: Job): string | null => {
    // First check direct video_url (Litterbox)
    if (job.video_url && job.video_url.startsWith("https://")) {
      return job.video_url;
    }
    // Check output_data for media_url
    if (job.output_data) {
      try {
        const output = JSON.parse(job.output_data);
        if (output.media_url && output.media_url.startsWith("https://")) {
          return output.media_url;
        }
        if (output.video_url && output.video_url.startsWith("https://")) {
          return output.video_url;
        }
      } catch {}
    }
    return null;
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Jobs</h2>
        <p className="text-[#a1a1aa] mt-1">Track automation execution history & preview shorts</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium">No jobs yet</p>
          <p className="text-[#a1a1aa] mt-1">Run an automation to see jobs here</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const videoUrl = getVideoUrl(job);
            return (
              <div key={job.id} className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgba(99,102,241,0.15)]">
                      {videoUrl ? (
                        <svg className="w-5 h-5 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.88v6.24a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">Job #{job.id}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`badge badge-${job.status}`}>{job.status}</span>
                        {videoUrl && (
                          <span className="text-xs text-[#22c55e]">● Video ready</span>
                        )}
                        <span className="text-xs text-[#a1a1aa]">
                          {new Date(job.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="glass-button text-sm py-2 px-4"
                    >
                      {videoUrl ? "▶ Preview" : "View Details"}
                    </button>
                    {job.status === "failed" && (
                      <button onClick={() => handleRetry(job.id)} className="glass-button text-sm py-2 px-4 text-[#f59e0b]">
                        Retry
                      </button>
                    )}
                    {job.github_run_url && (
                      <a href={job.github_run_url} target="_blank" rel="noopener" className="glass-button text-sm py-2 px-4">
                        GitHub
                      </a>
                    )}
                  </div>
                </div>
                {job.error_message && (
                  <div className="mt-3 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
                    <p className="text-xs text-[#ef4444]">{job.error_message}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedJob && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Job #{selectedJob.id}</h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="glass-button py-1 px-3"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              {/* Video Player */}
              {(() => {
                const videoUrl = getVideoUrl(selectedJob);
                if (videoUrl) {
                  return (
                    <div>
                      <p className="text-sm font-medium mb-2">📹 Video Preview</p>
                      <VideoPlayer videoUrl={videoUrl} />
                    </div>
                  );
                }
                if (selectedJob.status === "success") {
                  return (
                    <div className="glass-card p-4 text-center text-[#a1a1aa] text-sm">
                      <p>No video URL available — may have expired or processing failed.</p>
                      {selectedJob.github_run_url && (
                        <a href={selectedJob.github_run_url} target="_blank" rel="noopener" className="text-[#6366f1] hover:underline mt-2 inline-block">
                          Check GitHub Actions →
                        </a>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Job Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Status</p>
                  <span className={`badge badge-${selectedJob.status}`}>{selectedJob.status}</span>
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Automation</p>
                  <p className="font-medium">#{selectedJob.automation_id}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Created</p>
                  <p className="text-sm">{new Date(selectedJob.created_at).toLocaleString()}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Completed</p>
                  <p className="text-sm">{selectedJob.completed_at ? new Date(selectedJob.completed_at).toLocaleString() : "-"}</p>
                </div>
              </div>

              {selectedJob.github_run_url && (
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa] mb-1">GitHub Actions</p>
                  <a href={selectedJob.github_run_url} target="_blank" rel="noopener" className="text-sm text-[#6366f1] hover:underline break-all">
                    {selectedJob.github_run_url}
                  </a>
                </div>
              )}

              {selectedJob.error_message && (
                <div className="glass-card p-3 border-[rgba(239,68,68,0.3)]">
                  <p className="text-xs text-[#ef4444] mb-1">Error</p>
                  <p className="text-sm">{selectedJob.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
