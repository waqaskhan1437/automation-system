"use client";
import { useState, useEffect } from "react";

interface Job {
  id: number;
  automation_id: number;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  created_at: string;
  completed_at: string | null;
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
  const [filter, setFilter] = useState("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchOutputs();
  }, []);

  const fetchOutputs = async () => {
    try {
      // Get all jobs
      const jobsRes = await fetch("/api/jobs?limit=50");
      const jobsData = await jobsRes.json();

      // Get all automations for names
      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      const autoMap: Record<number, string> = {};
      if (autoData.success && autoData.data) {
        autoData.data.forEach((a: { id: number; name: string }) => {
          autoMap[a.id] = a.name;
        });
      }

      if (jobsData.success && jobsData.data) {
        const successfulJobs = jobsData.data.filter(
          (j: Job) => j.status === "success" || j.status === "running"
        );

        const items: OutputItem[] = [];
        for (const job of successfulJobs) {
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
        setOutputs(items);
      }
    } catch (err) {
      console.error("Failed to fetch outputs");
    }
    setLoading(false);
  };

  const filtered = filter === "all" ? outputs : outputs.filter((o) => {
    const name = o.automationName.toLowerCase();
    return name.includes(filter.toLowerCase());
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Output</h2>
          <p className="text-[#a1a1aa] mt-1">All processed videos and images from your automations</p>
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
          <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <p className="text-[#a1a1aa] mt-1">Run an automation to see processed videos here</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">
            Go to Automations
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.job.id} className="glass-card overflow-hidden">
              {/* Video Preview Placeholder */}
              <div className="relative aspect-[9/16] bg-[#1a1a2e] flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-2 text-[rgba(255,255,255,0.15)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-[#a1a1aa]">Job #{item.job.id}</p>
                </div>

                {/* Status Badge */}
                <div className="absolute top-3 right-3">
                  <span className={`badge ${item.job.status === "success" ? "badge-success" : item.job.status === "running" ? "badge-running" : "badge-queued"}`}>
                    {item.job.status}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h4 className="font-semibold text-sm">{item.automationName}</h4>
                <p className="text-xs text-[#a1a1aa] mt-1">
                  {new Date(item.job.created_at).toLocaleDateString()} {new Date(item.job.created_at).toLocaleTimeString()}
                </p>

                {/* Artifacts */}
                <div className="mt-3 space-y-2">
                  {item.artifacts.map((artifact, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.03)]">
                      <div>
                        <p className="text-xs font-medium">{artifact.name}</p>
                        <p className="text-[10px] text-[#a1a1aa]">{(artifact.size_in_bytes / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <a
                        href={artifact.archive_download_url}
                        target="_blank"
                        rel="noopener"
                        className="glass-button-primary text-xs py-1.5 px-3 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                    </div>
                  ))}
                </div>

                {/* GitHub Link */}
                {item.job.github_run_url && (
                  <a
                    href={item.job.github_run_url}
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-[#6366f1] hover:underline mt-3 inline-block"
                  >
                    View on GitHub {"\u2192"}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <video src={previewUrl} controls autoPlay className="w-full rounded-xl" />
            <button onClick={() => setPreviewUrl(null)} className="glass-button mt-4 mx-auto block">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
