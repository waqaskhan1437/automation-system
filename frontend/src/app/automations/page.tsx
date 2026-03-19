"use client";
import { useState, useEffect, useCallback } from "react";

interface Automation {
  id: number;
  name: string;
  type: "video" | "image";
  status: "active" | "paused" | "completed" | "failed";
  schedule: string | null;
  last_run: string | null;
  created_at: string;
  config: string;
}

interface RunningJob {
  automationId: number;
  jobId: number;
  status: string;
  githubRunUrl: string | null;
  steps: Array<{ name: string; status: string; conclusion: string | null }>;
  error: string | null;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [editData, setEditData] = useState<Automation | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<number, RunningJob>>({});
  const [showLogs, setShowLogs] = useState<RunningJob | null>(null);

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      if (data.success) setAutomations(data.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const handleRun = async (autoId: number) => {
    setRunningJobs(prev => ({ ...prev, [autoId]: { automationId: autoId, jobId: 0, status: "queued", githubRunUrl: null, steps: [], error: null } }));
    try {
      const res = await fetch("/api/automations/" + autoId + "/run", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRunningJobs(prev => ({ ...prev, [autoId]: { ...prev[autoId], jobId: data.data.job_id, status: "running" } }));
      } else {
        setRunningJobs(prev => ({ ...prev, [autoId]: { ...prev[autoId], status: "failed", error: data.error } }));
      }
    } catch {
      setRunningJobs(prev => ({ ...prev, [autoId]: { ...prev[autoId], status: "failed", error: "Request failed" } }));
    }
  };

  const handleAction = async (id: number, action: string) => {
    if (action === "run") { handleRun(id); return; }
    try {
      if (action === "delete") await fetch("/api/automations/" + id, { method: "DELETE" });
      else await fetch("/api/automations/" + id + "/" + action, { method: "POST" });
      fetchAutomations();
    } catch {}
  };

  const filtered = filter === "all" ? automations : automations.filter((a) => a.type === filter);

  const getStatusBadge = (status: string) => {
    const cls = status === "success" ? "badge-success" : status === "failed" ? "badge-failed" : status === "running" ? "badge-running" : "badge-queued";
    return <span className={"badge " + cls}>{status}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Automations</h2>
          <p className="text-[#a1a1aa] mt-1">Manage your automation pipelines</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setEditData(null); setShowVideoModal(true); }} className="glass-button-primary">+ Video</button>
          <button onClick={() => { setEditData(null); setShowImageModal(true); }} className="glass-button-primary">+ Image</button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {["all", "video", "image"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={"px-4 py-2 rounded-xl text-sm font-medium capitalize " + (filter === f ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button")}>
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
          {filtered.map((auto) => {
            const running = runningJobs[auto.id];
            return (
              <div key={auto.id} className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={"w-10 h-10 rounded-xl flex items-center justify-center " + (auto.type === "video" ? "bg-[rgba(139,92,246,0.15)]" : "bg-[rgba(236,72,153,0.15)]")}>
                      <span className={"text-lg " + (auto.type === "video" ? "text-[#8b5cf6]" : "text-[#ec4899]")}>{auto.type === "video" ? "\u25B6" : "\uD83D\uDDBC"}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">{auto.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={"badge " + (auto.type === "video" ? "badge-video" : "badge-image")}>{auto.type}</span>
                        <span className={"badge badge-" + auto.status}>{auto.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditData(auto); setShowVideoModal(auto.type === "video"); setShowImageModal(auto.type === "image"); }} className="glass-button text-sm py-2 px-4">Edit</button>
                    {running ? (
                      <button onClick={() => setShowLogs(running)} className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        {running.status}
                      </button>
                    ) : auto.status === "active" && (
                      <button onClick={() => handleRun(auto.id)} className="glass-button-primary text-sm py-2 px-4">Run Now</button>
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
                {running && (
                  <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                        <div className={"h-full rounded-full transition-all duration-500 " + (running.status === "success" ? "bg-[#10b981] w-full" : running.status === "failed" ? "bg-[#ef4444] w-full" : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] animate-pulse w-1/2")} />
                      </div>
                      <button onClick={() => setShowLogs(running)} className="text-xs text-[#6366f1] hover:underline">View Logs</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowLogs(null)}>
          <div className="glass-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Runner Status</h3>
              <button onClick={() => setShowLogs(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">{getStatusBadge(showLogs.status)}</div>
              <div className="h-3 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                <div className={"h-full rounded-full transition-all " + (showLogs.status === "success" ? "bg-[#10b981] w-full" : showLogs.status === "failed" ? "bg-[#ef4444] w-full" : "bg-[#6366f1] w-1/2 animate-pulse")} />
              </div>
              {showLogs.steps.length > 0 && (
                <div className="space-y-2">
                  {showLogs.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.03)]">
                      <span className={step.conclusion === "success" ? "text-[#10b981]" : step.conclusion === "failure" ? "text-[#ef4444]" : "text-[#a1a1aa]"}>
                        {step.conclusion === "success" ? "\u2713" : step.conclusion === "failure" ? "\u2717" : "\u25CB"}
                      </span>
                      <span className="text-sm">{step.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {showLogs.error && (
                <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)]"><p className="text-xs text-[#ef4444]">{showLogs.error}</p></div>
              )}
              <div className="flex gap-3">
                {showLogs.githubRunUrl && (
                  <a href={showLogs.githubRunUrl} target="_blank" rel="noopener" className="glass-button-primary text-sm py-2 px-4">View on GitHub</a>
                )}
                <button onClick={() => setShowLogs(null)} className="glass-button text-sm py-2 px-4">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Modal Placeholder */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowVideoModal(false)}>
          <div className="glass-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editData ? "Edit" : "Create"} Video Automation</h3>
              <button onClick={() => setShowVideoModal(false)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <VideoForm editData={editData} onClose={() => setShowVideoModal(false)} onSaved={fetchAutomations} />
          </div>
        </div>
      )}

      {/* Image Modal Placeholder */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowImageModal(false)}>
          <div className="glass-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editData ? "Edit" : "Create"} Image Automation</h3>
              <button onClick={() => setShowImageModal(false)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <ImageForm editData={editData} onClose={() => setShowImageModal(false)} onSaved={fetchAutomations} />
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
  const [schedule, setSchedule] = useState(editData?.schedule || "once");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData?.config) {
      try {
        const cfg = JSON.parse(editData.config);
        if (cfg.video_source) setVideoSource(cfg.video_source);
        if (cfg.video_url) setVideoUrl(cfg.video_url);
        if (cfg.channel_url) setChannelUrl(cfg.channel_url);
      } catch {}
    }
  }, [editData]);

  const handleSave = async () => {
    setSaving(true);
    const config = { video_source: videoSource, video_url: videoUrl, channel_url: channelUrl };
    try {
      const url = editData ? "/api/automations/" + editData.id : "/api/automations";
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
        <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Video Automation" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Video Source</label>
        <select className="glass-select" value={videoSource} onChange={(e) => setVideoSource(e.target.value)}>
          <option value="youtube">YouTube</option>
          <option value="direct">Direct URL</option>
          <option value="bunny">Bunny CDN</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Channel URL</label>
        <input className="glass-input" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="https://youtube.com/@channel" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Video URL</label>
        <input className="glass-input" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
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
      try {
        const cfg = JSON.parse(editData.config);
        if (cfg.image_url) setImageUrl(cfg.image_url);
      } catch {}
    }
  }, [editData]);

  const handleSave = async () => {
    setSaving(true);
    const config = { image_source: "url", image_url: imageUrl };
    try {
      const url = editData ? "/api/automations/" + editData.id : "/api/automations";
      const method = editData ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "image", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
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
        <input className="glass-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Image Automation" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Image URL</label>
        <input className="glass-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
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
