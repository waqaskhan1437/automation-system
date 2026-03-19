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
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Artifact {
  name: string;
  archive_download_url: string;
  size_in_bytes: number;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

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

  const fetchArtifacts = async (job: Job) => {
    setSelectedJob(job);
    setArtifacts([]);
    if (!job.github_run_id) return;

    setLoadingArtifacts(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/artifacts`);
      const data = await res.json();
      if (data.success) {
        setArtifacts(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch artifacts");
    }
    setLoadingArtifacts(false);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Jobs</h2>
        <p className="text-[#a1a1aa] mt-1">Track automation execution history & download shorts</p>
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
          {jobs.map((job) => (
            <div key={job.id} className="glass-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgba(99,102,241,0.15)]">
                    <svg className="w-5 h-5 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Job #{job.id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`badge badge-${job.status}`}>{job.status}</span>
                      <span className="text-xs text-[#a1a1aa]">
                        {new Date(job.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => fetchArtifacts(job)} className="glass-button text-sm py-2 px-4">
                    View Details
                  </button>
                  {job.status === "success" && job.github_run_id && (
                    <button onClick={() => fetchArtifacts(job)} className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  )}
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
          ))}
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelectedJob(null); setArtifacts([]); }}>
          <div className="glass-card p-8 max-w-2xl w-full max-h-[80vh] overflow-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Job #{selectedJob.id}</h3>
              <button onClick={() => { setSelectedJob(null); setArtifacts([]); }} className="glass-button py-1 px-3">Close</button>
            </div>

            <div className="space-y-4">
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

              {/* Artifacts / Download Section */}
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-sm font-medium mb-3">Download Processed Short</p>
                {loadingArtifacts ? (
                  <div className="text-center py-8 text-[#a1a1aa]">
                    <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading artifacts...
                  </div>
                ) : artifacts.length > 0 ? (
                  <div className="space-y-2">
                    {artifacts.map((artifact, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                        <div>
                          <p className="text-sm font-medium">{artifact.name}</p>
                          <p className="text-xs text-[#a1a1aa]">{(artifact.size_in_bytes / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <a
                          href={artifact.archive_download_url}
                          target="_blank"
                          rel="noopener"
                          className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                ) : selectedJob.status === "success" ? (
                  <div className="text-center py-8 text-[#a1a1aa] text-sm">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p>No artifacts found. Check GitHub Actions for details.</p>
                    {selectedJob.github_run_url && (
                      <a href={selectedJob.github_run_url} target="_blank" rel="noopener" className="text-[#6366f1] hover:underline mt-2 inline-block">
                        View on GitHub →
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#a1a1aa] text-sm">
                    Job is still processing or failed.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
