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

  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutputs = async () => {
    try {
      const jobsRes = await fetch("/api/jobs?limit=20");
      const jobsData = await jobsRes.json();
      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      const uploadsRes = await fetch("/api/uploads");
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
        <button onClick={fetchOutputs} className="glass-button flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {loading ? <div className="text-center py-16 text-[#a1a1aa]">Loading...</div> : outputs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          <p className="text-lg font-medium">No outputs yet</p>
          <a href="/automations" className="glass-button-primary inline-block mt-4 px-6 py-2">Go to Automations</a>
        </div>
      ) : (
        <div className="space-y-6">
          {outputs.map((item) => (
            <div key={item.job.id} className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold">{item.automationName}</h3>
                  <p className="text-sm text-[#a1a1aa]">Job #{item.job.id} - {new Date(item.job.created_at).toLocaleString()}</p>
                </div>
                {getStatusBadge(item)}
              </div>
              {item.upload?.media_url && (
                <div className="mb-4">
                  <div className="mb-2 text-sm text-[#a1a1aa]">Video Preview:</div>
                  <video 
                    controls 
                    className="w-full max-w-md rounded-lg bg-black"
                    src={item.upload.media_url}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}
              {item.upload && (
                <div className="mb-4 p-3 rounded-xl bg-indigo-500/10 text-sm text-indigo-300">
                  Postforme: {item.upload.upload_status === "uploaded" ? "Just Uploaded" : item.upload.upload_status}
                  {item.upload.aspect_ratio && ` | ${item.upload.aspect_ratio}`}
                  {item.upload.postforme_id && ` | ID: ${item.upload.postforme_id}`}
                </div>
              )}
              <div className="flex gap-3">
                {item.job.github_run_url && <a href={item.job.github_run_url} target="_blank" rel="noopener" className="glass-button text-sm">GitHub</a>}
                {getActions(item)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}