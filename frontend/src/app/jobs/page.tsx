"use client";
import { useState, useEffect } from "react";

interface Job {
  id: number;
  automation_id: number;
  status: "queued" | "running" | "success" | "failed";
  github_run_id: number | null;
  github_run_url: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
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

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Jobs</h2>
        <p className="text-[#a1a1aa] mt-1">Track automation execution history</p>
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
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)]">
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">ID</th>
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">Automation</th>
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">Status</th>
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">Created</th>
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">Completed</th>
                <th className="text-left p-4 text-sm text-[#a1a1aa] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.02)]">
                  <td className="p-4 text-sm font-mono">#{job.id}</td>
                  <td className="p-4 text-sm">Automation #{job.automation_id}</td>
                  <td className="p-4">
                    <span className={`badge badge-${job.status}`}>{job.status}</span>
                  </td>
                  <td className="p-4 text-sm text-[#a1a1aa]">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                  <td className="p-4 text-sm text-[#a1a1aa]">
                    {job.completed_at ? new Date(job.completed_at).toLocaleString() : "-"}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedJob(job)} className="glass-button text-xs py-1 px-3">
                        Details
                      </button>
                      {job.status === "failed" && (
                        <button onClick={() => handleRetry(job.id)} className="glass-button text-xs py-1 px-3 text-[#f59e0b]">
                          Retry
                        </button>
                      )}
                      {job.github_run_url && (
                        <a href={job.github_run_url} target="_blank" rel="noopener" className="glass-button text-xs py-1 px-3">
                          GitHub
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedJob(null)}>
          <div className="glass-card p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Job #{selectedJob.id} Details</h3>
              <button onClick={() => setSelectedJob(null)} className="glass-button py-1 px-3">Close</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Status</p>
                  <span className={`badge badge-${selectedJob.status}`}>{selectedJob.status}</span>
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa]">Automation ID</p>
                  <p className="font-medium">#{selectedJob.automation_id}</p>
                </div>
              </div>
              {selectedJob.error_message && (
                <div className="glass-card p-3 border-[rgba(239,68,68,0.3)]">
                  <p className="text-xs text-[#ef4444] mb-1">Error</p>
                  <p className="text-sm">{selectedJob.error_message}</p>
                </div>
              )}
              {selectedJob.github_run_url && (
                <div className="glass-card p-3">
                  <p className="text-xs text-[#a1a1aa] mb-1">GitHub Actions</p>
                  <a href={selectedJob.github_run_url} target="_blank" rel="noopener" className="text-sm text-[#6366f1] hover:underline">
                    {selectedJob.github_run_url}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
