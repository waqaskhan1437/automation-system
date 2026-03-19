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

  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutputs = async () => {
    try {
      const jobsRes = await fetch("/api/jobs?limit=20");
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
          if (job.status === "success") {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Output</h2>
          <p className="text-[#a1a1aa] mt-1">Processed videos from your automations</p>
        </div>
        <button onClick={fetchOutputs} className="glass-button flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : outputs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <p className="text-[#a1a1aa] mt-1">Run an automation to see processed videos</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">
            Go to Automations
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {outputs.map((item) => (
            <div key={item.job.id} className="glass-card overflow-hidden">
              {/* Video Preview */}
              <div className="relative aspect-[9/16] bg-gradient-to-br from-[#1a1a2e] to-[#0d0d14] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/60">Job #{item.job.id}</p>
                  <span className="badge badge-success mt-2">Processed</span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h4 className="font-semibold">{item.automationName}</h4>
                <p className="text-xs text-[#a1a1aa] mt-1">
                  {new Date(item.job.created_at).toLocaleDateString()} at {new Date(item.job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>

                {/* Artifacts */}
                {item.artifacts.map((artifact, i) => (
                  <div key={i} className="mt-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Processed Video</span>
                      <span className="text-xs text-[#a1a1aa]">{(artifact.size_in_bytes / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <a
                      href={artifact.archive_download_url}
                      target="_blank"
                      rel="noopener"
                      className="glass-button-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Video (ZIP)
                    </a>
                    <p className="text-[10px] text-[#a1a1aa] mt-2 text-center">
                      Extract zip to get the .mp4 video file
                    </p>
                  </div>
                ))}

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
    </div>
  );
}
