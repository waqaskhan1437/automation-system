"use client";
import { useState, useEffect } from "react";
import { VideoUpload } from "../../lib/types";

interface PostForMeResult {
  success: boolean;
  post_id?: string;
  post_url?: string;
  platforms?: number;
  scheduled?: boolean;
  scheduled_at?: string;
  error?: string;
  skipped?: boolean;
}

interface Job {
  id: number;
  automation_id: number;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  output_data: string | null;
  created_at: string;
}

interface OutputItem {
  job: Job;
  postResult: PostForMeResult | null;
  automationName: string;
  upload?: VideoUpload;
}

export default function OutputPage() {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [uploads, setUploads] = useState<VideoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDelete = async (uploadId: number) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    setDeleting(uploadId);
    try {
      await fetch(`/api/uploads/${uploadId}`, { method: "DELETE" });
      fetchOutputs();
    } catch {}
    setDeleting(null);
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL videos? This cannot be undone.")) return;
    setDeleting(-1);
    try {
      const res = await fetch("/api/uploads", { method: "DELETE" });
      if (res.ok) fetchOutputs();
    } catch {}
    setDeleting(null);
  };

  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutputs = async () => {
    try {
      const jobsRes = await fetch("/api/jobs?limit=50");
      const jobsData = await jobsRes.json();
      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      const uploadsRes = await fetch("/api/uploads?limit=50");
      const uploadsData = await uploadsRes.json();
      
      const videoUploads: VideoUpload[] = uploadsData.success ? uploadsData.data : [];
      setUploads(videoUploads);
      const automations = autoData.success ? autoData.data : [];

      if (jobsData.success && jobsData.data) {
        const items: OutputItem[] = jobsData.data.map((job: Job) => {
          let postResult: PostForMeResult | null = null;
          if (job.output_data) {
            try { postResult = JSON.parse(job.output_data); } catch {}
          }
          const upload = videoUploads.find(u => u.job_id === job.id);
          const automation = automations.find((a: any) => a.id === job.automation_id);
          return { job, postResult, automationName: automation?.name || `Automation #${job.automation_id}`, upload };
        });
        setOutputs(items.sort((a, b) => new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime()));
      }
    } catch {}
    setLoading(false);
  };

  const getStatusBadge = (item: OutputItem) => {
    const { job, postResult, upload } = item;
    if (upload?.post_status === "posted") return <span className="badge badge-success">Posted</span>;
    if (upload?.post_status === "scheduled") return <span className="badge badge-warning">Scheduled</span>;
    if (upload?.upload_status === "uploaded") return <span className="badge badge-info">Just Uploaded</span>;
    if (job.status === "success") {
      if (postResult?.success) return <span className="badge badge-success">Posted</span>;
      if (postResult?.scheduled) return <span className="badge badge-warning">Scheduled</span>;
      return <span className="badge badge-success">Success</span>;
    }
    if (job.status === "failed") return <span className="badge badge-error">Failed</span>;
    return <span className="badge badge-info">Running</span>;
  };

  const handleUpload = async (jobId: number) => {
    await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, media_url: `https://automation-api.waqaskhan1437.workers.dev/api/output/${jobId}`, platforms: JSON.stringify(["instagram", "tiktok"]), aspect_ratio: "9:16" }),
    });
    fetchOutputs();
  };

  const handlePost = async (uploadId: number) => {
    await fetch(`/api/uploads/${uploadId}/post`, { method: "POST" });
    fetchOutputs();
  };

  const getActions = (item: OutputItem) => {
    const { job, upload } = item;
    if (job.status !== "success") return null;
    if (!upload) {
      return <button onClick={() => handleUpload(job.id)} className="glass-button text-sm">Upload to Postforme</button>;
    }
    if (upload.post_status === "pending") {
      return (
        <div className="flex gap-2">
          <button onClick={() => handlePost(upload.id)} className="glass-button-primary text-sm">Post Now</button>
          <button onClick={() => { const d = prompt("Date (YYYY-MM-DD):"); const t = prompt("Time (HH:MM):"); if (d && t) { fetch(`/api/uploads/${upload.id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduled_at: new Date(`${d}T${t}`).toISOString() }) }).then(() => fetchOutputs()); } }} className="glass-button text-sm">Schedule</button>
        </div>
      );
    }
    if (upload.post_status === "posted") return <span className="text-green-400 text-sm">Posted</span>;
    if (upload.post_status === "scheduled") return <span className="text-amber-400 text-sm">Scheduled</span>;
    return null;
  };

  return (
    <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Output</h2>
            <p className="text-[#a1a1aa] mt-1">Review processed videos and manage posting</p>
          </div>
          <div className="flex gap-2">
            {outputs.length > 0 && (
              <button onClick={handleDeleteAll} className="glass-button text-red-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete All
              </button>
            )}
            <button onClick={fetchOutputs} className="glass-button flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
        </div>

      {loading ? <div className="text-center py-16 text-[#a1a1aa]">Loading...</div> : outputs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">Go to Automations</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {outputs.map((item) => (
            <div key={item.job.id} className="glass-card p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#a1a1aa]">Job #{item.job.id}</span>
                {getStatusBadge(item)}
              </div>
              <h3 className="text-sm font-bold mb-2 truncate">{item.automationName}</h3>
              {item.upload?.media_url ? (
                <div className="flex-1 min-h-0">
                  <video 
                    controls 
                    className="w-full aspect-[9/16] rounded-lg bg-black object-contain"
                    src={item.upload.media_url}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              ) : (
                <div className="flex-1 bg-black/30 rounded-lg flex items-center justify-center min-h-[200px]">
                  <span className="text-xs text-[#a1a1aa]">{item.job.status === "running" ? "Processing..." : "No video"}</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {item.job.github_run_url && <a href={item.job.github_run_url} target="_blank" rel="noopener" className="glass-button text-xs py-1 px-2">GitHub</a>}
                {getActions(item)}
                {item.upload && (
                  <button 
                    onClick={() => handleDelete(item.upload!.id)} 
                    disabled={deleting === item.upload.id}
                    className="glass-button text-xs py-1 px-2 text-red-400"
                  >
                    {deleting === item.upload.id ? "..." : "Delete"}
                  </button>
                )}
              </div>
              {item.upload && (
                <div className="mt-2 text-xs text-indigo-300">
                  {item.upload.upload_status === "uploaded" ? "Just Uploaded" : item.upload.upload_status}
                  {item.upload.post_status === "posted" && " | Posted"}
                  {item.upload.post_status === "scheduled" && " | Scheduled"}
                </div>
              )}
              <div className="mt-1 text-xs text-[#a1a1aa]">{new Date(item.job.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}