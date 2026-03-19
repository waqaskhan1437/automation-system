"use client";
import { useState, useEffect, useCallback } from "react";

interface Automation {
  id: number;
  name: string;
  type: "video" | "image";
  status: string;
  schedule: string | null;
  last_run: string | null;
  created_at: string;
  config: string;
}

interface Job {
  id: number;
  automation_id: number;
  status: string;
  github_run_id: number | null;
  github_run_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface StepInfo {
  name: string;
  status: string;
  conclusion: string | null;
}

interface RunningJob {
  jobId: number;
  status: string;
  githubRunId: number | null;
  githubRunUrl: string | null;
  steps: StepInfo[];
  error: string | null;
  progress: number;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState<"video" | "image" | null>(null);
  const [editData, setEditData] = useState<Automation | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<number, RunningJob>>({});
  const [showLogs, setShowLogs] = useState<{ autoId: number; job: RunningJob } | null>(null);

  // Load automations and check for running jobs
  const loadData = useCallback(async () => {
    try {
      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      if (autoData.success) setAutomations(autoData.data || []);

      // Get all recent jobs (last 10)
      const jobsRes = await fetch("/api/jobs?limit=10");
      const jobsData = await jobsRes.json();
      if (jobsData.success && jobsData.data) {
        const running: Record<number, RunningJob> = {};

        // Group by automation_id, keep only latest
        const latestJobs: Record<number, Job> = {};
        for (const job of jobsData.data) {
          if (!latestJobs[job.automation_id] || job.id > latestJobs[job.automation_id].id) {
            latestJobs[job.automation_id] = job;
          }
        }

        // Check status of latest jobs
        for (const autoId of Object.keys(latestJobs)) {
          const job = latestJobs[parseInt(autoId)];
          if (job.status === "running" || job.status === "queued") {
            try {
              const statusRes = await fetch(`/api/jobs/${job.id}/logs`);
              const statusData = await statusRes.json();
              if (statusData.success) {
                const steps: StepInfo[] = statusData.data.steps || [];
                const completedSteps = steps.filter((s: StepInfo) => s.conclusion === "success").length || 0;
                const totalSteps = steps.length || 1;

                const downloadStep = steps.find((s: StepInfo) => s.name.includes("Download"));
                const processStep = steps.find((s: StepInfo) => s.name.includes("Process") || s.name.includes("FFmpeg"));
                const coreSuccess = downloadStep?.conclusion === "success" && (processStep?.conclusion === "success" || !processStep);

                let actualStatus = statusData.data.run_status || "running";
                if (statusData.data.run_status === "completed") {
                  if (coreSuccess) {
                    actualStatus = "success";
                  } else if (statusData.data.run_conclusion === "success") {
                    actualStatus = "success";
                  } else {
                    actualStatus = "failed";
                  }
                }

                running[job.automation_id] = {
                  jobId: job.id,
                  status: actualStatus,
                  githubRunId: statusData.data.run_id,
                  githubRunUrl: statusData.data.run_url,
                  steps: steps,
                  error: job.error_message,
                  progress: Math.round((completedSteps / totalSteps) * 100),
                };
              }
            } catch {}
          }
        }
        setRunningJobs(running);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Poll every 5 seconds for updates
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRun = async (autoId: number) => {
    // Optimistic update
    setRunningJobs(prev => ({
      ...prev,
      [autoId]: {
        jobId: 0,
        status: "queued",
        githubRunId: null,
        githubRunUrl: null,
        steps: [{ name: "Starting...", status: "in_progress", conclusion: null }],
        error: null,
        progress: 0,
      }
    }));

    try {
      const res = await fetch(`/api/automations/${autoId}/run`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRunningJobs(prev => ({
          ...prev,
          [autoId]: {
            ...prev[autoId],
            jobId: data.data.job_id,
            status: "running",
            githubRunId: data.data.github_run_id,
            steps: [{ name: "Workflow triggered", status: "completed", conclusion: "success" }],
            progress: 5,
          }
        }));
        // Immediate poll
        setTimeout(loadData, 3000);
      } else {
        setRunningJobs(prev => ({
          ...prev,
          [autoId]: {
            ...prev[autoId],
            status: "failed",
            error: data.error,
            progress: 0,
          }
        }));
      }
    } catch (err) {
      setRunningJobs(prev => ({
        ...prev,
        [autoId]: {
          ...prev[autoId],
          status: "failed",
          error: "Request failed",
          progress: 0,
        }
      }));
    }
  };

  const handleAction = async (id: number, action: string) => {
    if (action === "run") { handleRun(id); return; }
    try {
      if (action === "delete") await fetch(`/api/automations/${id}`, { method: "DELETE" });
      else await fetch(`/api/automations/${id}/${action}`, { method: "POST" });
      loadData();
    } catch {}
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success": return "#10b981";
      case "failed": return "#ef4444";
      case "running": case "in_progress": return "#6366f1";
      case "queued": return "#f59e0b";
      default: return "#a1a1aa";
    }
  };

  const getStepIcon = (step: StepInfo) => {
    if (step.conclusion === "success") return "\u2713";
    if (step.conclusion === "failure") return "\u2717";
    if (step.status === "in_progress") return "\u27F3";
    return "\u25CB";
  };

  const filtered = filter === "all" ? automations : automations.filter(a => a.type === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Automations</h2>
          <p className="text-[#a1a1aa] mt-1">Manage your automation pipelines</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setEditData(null); setShowForm("video"); }} className="glass-button-primary">+ Video</button>
          <button onClick={() => { setEditData(null); setShowForm("image"); }} className="glass-button-primary">+ Image</button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {["all", "video", "image"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filter === f ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-lg font-medium">No automations yet</p>
          <p className="text-[#a1a1aa] mt-1">Create your first automation to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(auto => {
            const running = runningJobs[auto.id];
            const isRunning = running && running.status !== "success" && running.status !== "failed";

            return (
              <div key={auto.id} className="glass-card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${auto.type === "video" ? "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]" : "bg-[rgba(236,72,153,0.15)] text-[#ec4899]"}`}>
                        {auto.type === "video" ? "\u25B6" : "\uD83D\uDDBC"}
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg">{auto.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge ${auto.type === "video" ? "badge-video" : "badge-image"}`}>{auto.type}</span>
                          <span className={`badge badge-${auto.status}`}>{auto.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditData(auto); setShowForm(auto.type as "video" | "image"); }} className="glass-button text-sm py-2 px-4">
                        Edit
                      </button>

                      {isRunning ? (
                        <button onClick={() => setShowLogs({ autoId: auto.id, job: running! })} className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {running.progress}% Running
                        </button>
                      ) : running && (running.status === "success" || running.status === "failed") ? (
                        <button onClick={() => setShowLogs({ autoId: auto.id, job: running })} className={`text-sm py-2 px-4 flex items-center gap-2 ${running.status === "success" ? "bg-[rgba(16,185,129,0.15)] text-[#10b981] rounded-xl" : "bg-[rgba(239,68,68,0.15)] text-[#ef4444] rounded-xl"}`}>
                          {running.status === "success" ? "\u2713 Done" : "\u2717 Failed"}
                        </button>
                      ) : auto.status === "active" && (
                        <button onClick={() => handleRun(auto.id)} className="glass-button-primary text-sm py-2 px-4">
                          Run Now
                        </button>
                      )}

                      {auto.status === "active" && !running && (
                        <button onClick={() => handleAction(auto.id, "pause")} className="glass-button text-sm py-2 px-4">Pause</button>
                      )}
                      {auto.status !== "active" && !running && (
                        <button onClick={() => handleAction(auto.id, "resume")} className="glass-button text-sm py-2 px-4">Resume</button>
                      )}
                      <button onClick={() => handleAction(auto.id, "delete")} className="glass-button text-sm py-2 px-4 text-[#ef4444]">Delete</button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Steps */}
                {running && (
                  <div className="px-5 pb-5">
                    <div className="h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${running.progress}%`,
                          backgroundColor: getStatusColor(running.status),
                        }}
                      />
                    </div>

                    {/* Steps */}
                    {running.steps.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {running.steps.slice(0, 8).map((step, i) => (
                          <span
                            key={i}
                            className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{
                              backgroundColor: `${getStatusColor(step.conclusion || step.status)}15`,
                              color: getStatusColor(step.conclusion || step.status),
                            }}
                          >
                            {getStepIcon(step)} {step.name.length > 20 ? step.name.substring(0, 20) + "..." : step.name}
                          </span>
                        ))}
                        {running.steps.length > 8 && (
                          <span className="text-[11px] px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.05)] text-[#a1a1aa]">
                            +{running.steps.length - 8} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {running.error && (
                      <div className="mt-2 p-2 rounded-lg bg-[rgba(239,68,68,0.1)] text-xs text-[#ef4444]">
                        {running.error}
                      </div>
                    )}

                    {/* View Full Logs */}
                    <button onClick={() => setShowLogs({ autoId: auto.id, job: running })} className="text-xs text-[#6366f1] hover:underline mt-2">
                      View Full Logs {"\u2192"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowLogs(null)}>
          <div className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Workflow Logs</h3>
                <p className="text-xs text-[#a1a1aa]">Automation #{showLogs.autoId} / Job #{showLogs.job.jobId}</p>
              </div>
              <button onClick={() => setShowLogs(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1 scrollbar-thin space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className="badge" style={{ backgroundColor: `${getStatusColor(showLogs.job.status)}20`, color: getStatusColor(showLogs.job.status) }}>
                  {showLogs.job.status}
                </span>
                {showLogs.job.githubRunUrl && (
                  <a href={showLogs.job.githubRunUrl} target="_blank" rel="noopener" className="text-xs text-[#6366f1] hover:underline">
                    Open in GitHub {"\u2192"}
                  </a>
                )}
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Progress</span>
                  <span>{showLogs.job.progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${showLogs.job.progress}%`, backgroundColor: getStatusColor(showLogs.job.status) }} />
                </div>
              </div>

              {/* Steps */}
              <div>
                <p className="text-sm font-medium mb-3">Workflow Steps</p>
                <div className="space-y-2">
                  {showLogs.job.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: `${getStatusColor(step.conclusion || step.status)}20`, color: getStatusColor(step.conclusion || step.status) }}>
                        {getStepIcon(step)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{step.name}</p>
                        <p className="text-xs text-[#a1a1aa]">{step.status.replace(/_/g, " ")}</p>
                      </div>
                      <span className="text-xs" style={{ color: getStatusColor(step.conclusion || step.status) }}>
                        {step.conclusion === "success" ? "Completed" : step.conclusion === "failure" ? "Failed" : step.status === "in_progress" ? "Running" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Console Output */}
              <div>
                <p className="text-sm font-medium mb-2">Runner Output</p>
                <div className="bg-[#0d0d14] rounded-xl p-4 font-mono text-xs overflow-auto max-h-48 scrollbar-thin">
                  <p className="text-[#10b981]">$ github-actions-runner started</p>
                  {showLogs.job.steps.map((step, i) => (
                    <p key={i} style={{ color: getStatusColor(step.conclusion || step.status) }} className="mt-1">
                      {getStepIcon(step)} [{i + 1}/{showLogs.job.steps.length}] {step.name}
                      {step.conclusion === "success" && <span className="text-[#a1a1aa] ml-2">- done</span>}
                      {step.conclusion === "failure" && <span className="text-[#ef4444] ml-2">- FAILED</span>}
                    </p>
                  ))}
                  {showLogs.job.status === "success" && <p className="text-[#10b981] mt-2">$ All tasks completed successfully!</p>}
                  {showLogs.job.status === "failed" && <p className="text-[#ef4444] mt-2">$ Workflow failed. Check step details above.</p>}
                </div>
              </div>

              {/* Error */}
              {showLogs.job.error && (
                <div className="p-4 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
                  <p className="text-xs font-medium text-[#ef4444] mb-1">Error Details</p>
                  <p className="text-sm text-[#ef4444]">{showLogs.job.error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {showLogs.job.githubRunUrl && (
                  <a href={showLogs.job.githubRunUrl} target="_blank" rel="noopener" className="glass-button-primary text-sm py-2 px-4">
                    View on GitHub
                  </a>
                )}
                {showLogs.job.status === "success" && (
                  <a href="/output" className="glass-button text-sm py-2 px-4">
                    View Output
                  </a>
                )}
                <button onClick={() => setShowLogs(null)} className="glass-button text-sm py-2 px-4">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Form Modal */}
      {showForm === "video" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(null)}>
          <div className="glass-card max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editData ? "Edit" : "Create"} Video Automation</h3>
              <button onClick={() => setShowForm(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <VideoForm editData={editData} onClose={() => setShowForm(null)} onSaved={loadData} />
          </div>
        </div>
      )}

      {/* Image Form Modal */}
      {showForm === "image" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(null)}>
          <div className="glass-card max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editData ? "Edit" : "Create"} Image Automation</h3>
              <button onClick={() => setShowForm(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <ImageForm editData={editData} onClose={() => setShowForm(null)} onSaved={loadData} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== VIDEO FORM ========== */
function VideoForm({ editData, onClose, onSaved }: { editData: Automation | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editData?.name || "");
  const [videoSource, setVideoSource] = useState("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [multipleUrls, setMultipleUrls] = useState("");
  const [schedule, setSchedule] = useState(editData?.schedule || "once");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData?.config) {
      try {
        const cfg = JSON.parse(editData.config);
        if (cfg.video_source) setVideoSource(cfg.video_source);
        if (cfg.video_url) setVideoUrl(cfg.video_url);
        if (cfg.channel_url) setChannelUrl(cfg.channel_url);
        if (cfg.multiple_urls) setMultipleUrls(cfg.multiple_urls.join("\n"));
      } catch {}
    }
  }, [editData]);

  const handleSave = async () => {
    setSaving(true);
    const config = {
      video_source: videoSource,
      video_url: videoUrl,
      channel_url: channelUrl,
      multiple_urls: multipleUrls.split("\n").map(u => u.trim()).filter(Boolean),
    };
    try {
      const url = editData ? `/api/automations/${editData.id}` : "/api/automations";
      const method = editData ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "video", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) { onSaved(); onClose(); }
      else alert("Failed: " + data.error);
    } catch { alert("Failed to save"); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="My Video Automation" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Source</label>
        <select className="glass-select" value={videoSource} onChange={e => setVideoSource(e.target.value)}>
          <option value="youtube">YouTube</option>
          <option value="direct">Direct URL</option>
          <option value="bunny">Bunny CDN</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Channel URL</label>
        <input className="glass-input" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://youtube.com/@channel" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Video URL</label>
        <input className="glass-input" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Multiple URLs (one per line)</label>
        <textarea className="glass-input min-h-[60px]" value={multipleUrls} onChange={e => setMultipleUrls(e.target.value)} placeholder={"https://photos.app.goo.gl/...\nhttps://youtube.com/watch?v=..."} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={schedule} onChange={e => setSchedule(e.target.value)}>
          <option value="once">Manual</option>
          <option value="0 * * * *">Hourly</option>
          <option value="0 0 * * *">Daily</option>
          <option value="0 0 * * 0">Weekly</option>
        </select>
      </div>
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || !name} className="glass-button-primary flex-1">{saving ? "Saving..." : editData ? "Update" : "Create"}</button>
        <button onClick={onClose} className="glass-button">Cancel</button>
      </div>
    </div>
  );
}

/* ========== IMAGE FORM ========== */
function ImageForm({ editData, onClose, onSaved }: { editData: Automation | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editData?.name || "");
  const [imageUrl, setImageUrl] = useState("");
  const [schedule, setSchedule] = useState(editData?.schedule || "once");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData?.config) {
      try { const cfg = JSON.parse(editData.config); if (cfg.image_url) setImageUrl(cfg.image_url); } catch {}
    }
  }, [editData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editData ? `/api/automations/${editData.id}` : "/api/automations";
      const method = editData ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "image", config: JSON.stringify({ image_url: imageUrl }), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) { onSaved(); onClose(); }
      else alert("Failed: " + data.error);
    } catch { alert("Failed to save"); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="My Image Automation" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Image URL</label>
        <input className="glass-input" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
      </div>
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || !name} className="glass-button-primary flex-1">{saving ? "Saving..." : editData ? "Update" : "Create"}</button>
        <button onClick={onClose} className="glass-button">Cancel</button>
      </div>
    </div>
  );
}
