"use client";
import { useState, useEffect } from "react";
import VideoPlayer from "@/components/ui/VideoPlayer";
import { getVideoUrl, getAllVideoUrls, getVideoUrls, getFetchStats, getLocalVideoPath, toLocalMediaUrl } from "@/lib/video-utils";

interface Job {
  id: number;
  automation_id: number;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  github_run_id: number | null;
  github_run_url: string | null;
  error_message: string | null;
  input_data: string | null;
  output_data: string | null;
  video_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null);

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

  const handleDeleteAllJobs = async () => {
    try {
      await fetch("/api/jobs", { method: "DELETE" });
      fetchJobs();
      setShowDeleteAllConfirm(false);
    } catch (err) {
      console.error("Delete all jobs failed");
    }
  };

  const handleDeleteJob = async (id: number) => {
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      fetchJobs();
      setDeleteJobId(null);
    } catch (err) {
      console.error("Delete job failed");
    }
  };

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Jobs</h2>
          <p className="text-[#a1a1aa] mt-1">Track automation execution history & preview shorts</p>
        </div>
        <button
          onClick={() => setShowDeleteAllConfirm(true)}
          className="glass-button text-sm py-2 px-4 text-[#ef4444]"
        >
          Delete All Jobs
        </button>
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
            const localVideoPath = getLocalVideoPath(job);
            const localVideoUrl = toLocalMediaUrl(localVideoPath);
            const allVideoUrls = getAllVideoUrls(job);
            const hasLocalPreview = Boolean(localVideoUrl || (videoUrl && /\/api\/local-media\?/i.test(videoUrl)));
            const previewUrls = localVideoUrl
              ? [localVideoUrl, ...allVideoUrls.filter((url) => url !== localVideoUrl)]
              : allVideoUrls;
            const fetchStats = getFetchStats(job);
            const videoUrls = getVideoUrls(job);
            return (
              <div key={job.id} className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgba(99,102,241,0.15)]">
                      {videoUrl || localVideoUrl ? (
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
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`badge badge-${job.status}`}>{job.status}</span>
                        {job.status === "running" && !job.github_run_id && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[rgba(245,158,11,0.15)] text-[#f59e0b]">
                            Local runner processing on this PC
                          </span>
                        )}
                        {job.status === "queued" && !job.github_run_id && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[rgba(99,102,241,0.15)] text-[#818cf8]">
                            Waiting for local runner
                          </span>
                        )}
                        {(videoUrl || localVideoUrl) && (
                          <span className="text-xs text-[#22c55e]">
                            {hasLocalPreview ? "Local video ready" : (previewUrls.length > 1 ? previewUrls.length + " videos" : "Video ready")}
                          </span>
                        )}
                        {fetchStats && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[rgba(99,102,241,0.15)] text-[#818cf8]">
                            {fetchStats.total} fetched / {fetchStats.unprocessed} new / {fetchStats.to_process} processing
                          </span>
                        )}
                        {videoUrls.length > 0 && !fetchStats && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[rgba(99,102,241,0.15)] text-[#818cf8]">
                            {videoUrls.length} URLs
                          </span>
                        )}
                        <span className="text-xs text-[#a1a1aa]">
                          {new Date(job.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => setDeleteJobId(job.id)}
                      className="glass-button text-sm py-2 px-4 text-[#ef4444]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                {/* Inline Video Players */}
                {localVideoPath && (
                  <div className="mt-3 p-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)]">
                    <p className="text-xs text-[#22c55e] break-all">Local output: {localVideoPath}</p>
                  </div>
                )}

                {previewUrls.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-4 justify-center">
                    {previewUrls.map((url, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <span className="text-xs text-[#a1a1aa] mb-1">Video {idx + 1}</span>
                        <VideoPlayer videoUrl={url} />
                      </div>
                    ))}
                  </div>
                )}
                
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

      {/* Delete All Jobs Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowDeleteAllConfirm(false)}
        >
          <div
            className="glass-card p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4">Delete All Jobs?</h3>
            <p className="text-[#a1a1aa] mb-6">
              Are you sure you want to delete all jobs? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="glass-button py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllJobs}
                className="glass-button py-2 px-4 text-[#ef4444]"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Job Confirmation Modal */}
      {deleteJobId !== null && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteJobId(null)}
        >
          <div
            className="glass-card p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-4">Delete Job #{deleteJobId}?</h3>
            <p className="text-[#a1a1aa] mb-6">
              Are you sure you want to delete this job? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteJobId(null)}
                className="glass-button py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteJob(deleteJobId)}
                className="glass-button py-2 px-4 text-[#ef4444]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
