"use client";
import { useState, useEffect, useCallback } from "react";
import AutomationModal from "@/components/automations/AutomationModal";
import { Automation } from "@/components/automations/types";

interface StepInfo { name: string; status: string; conclusion: string | null }
interface RunningJob { jobId: number; status: string; githubRunUrl: string | null; steps: StepInfo[]; error: string | null; progress: number }
interface AutomationPostStats { scheduled: number; posted: number }
interface LinkQueueStatus { totalLinks: number; processedLinks: number; currentIndex: number; remainingLinks: number; allCompleted: boolean }

function parseAutomationDate(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"video" | "image">("video");
  const [editData, setEditData] = useState<Automation | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<number, RunningJob>>({});
  const [automationStats, setAutomationStats] = useState<Record<number, AutomationPostStats>>({});
  const [showLogs, setShowLogs] = useState<{ autoId: number; job: RunningJob } | null>(null);
  const [linkQueues, setLinkQueues] = useState<Record<number, LinkQueueStatus>>({});
  const [now, setNow] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    try {
      const autoRes = await fetch("/api/automations");
      const autoData = await autoRes.json();
      if (autoData.success) {
        setAutomations(autoData.data || []);
        // Fetch link queue status for each automation
        const queues: Record<number, LinkQueueStatus> = {};
        await Promise.all((autoData.data || []).map(async (auto: Automation) => {
          try {
            const lqRes = await fetch(`/api/automations/${auto.id}/link-status`);
            const lqData = await lqRes.json();
            if (lqData.success && lqData.data.totalLinks > 1) {
              queues[auto.id] = lqData.data;
            }
          } catch {}
        }));
        setLinkQueues(queues);
      }

      const jobsRes = await fetch("/api/jobs?limit=10");
      const jobsData = await jobsRes.json();
      const jobsForStatsRes = await fetch("/api/jobs?limit=500");
      const jobsForStatsData = await jobsForStatsRes.json();
      const uploadsRes = await fetch("/api/uploads?limit=500");
      const uploadsData = await uploadsRes.json();

      if (jobsForStatsData.success && uploadsData.success) {
        const jobAutomationMap = new Map<number, number>();
        for (const job of jobsForStatsData.data || []) {
          jobAutomationMap.set(job.id, job.automation_id);
        }

        const nextStats: Record<number, AutomationPostStats> = {};
        for (const upload of uploadsData.data || []) {
          const automationId = jobAutomationMap.get(upload.job_id);
          if (!automationId) continue;

          if (!nextStats[automationId]) {
            nextStats[automationId] = { scheduled: 0, posted: 0 };
          }

          if (upload.post_status === "scheduled") {
            nextStats[automationId].scheduled += 1;
          }
          if (upload.post_status === "posted") {
            nextStats[automationId].posted += 1;
          }
        }

        setAutomationStats(nextStats);
      }

      if (jobsData.success && jobsData.data) {
        const running: Record<number, RunningJob> = {};
        const latest: Record<number, { id: number; automation_id: number; status: string; github_run_id: number | null; github_run_url: string | null; error_message: string | null }> = {};
        for (const job of jobsData.data) {
          if (!latest[job.automation_id] || job.id > latest[job.automation_id].id) latest[job.automation_id] = job;
        }
        for (const autoId of Object.keys(latest)) {
          const job = latest[parseInt(autoId)];
          if (job.status === "running" || job.status === "queued") {
            try {
              const res = await fetch(`/api/jobs/${job.id}/logs?t=${Date.now()}`);
              const d = await res.json();
              if (d.success) {
                const steps: StepInfo[] = d.data.steps || [];
                const done = steps.filter((s) => s.conclusion === "success").length;
                const total = steps.length || 1;
                const dlOk = steps.find((s) => s.name.includes("Download"))?.conclusion === "success";
                const ffOk = steps.find((s) => s.name.includes("Process"))?.conclusion === "success";
                let status = d.data.run_status || "running";
                if (status === "completed") status = (dlOk && ffOk) || d.data.run_conclusion === "success" ? "success" : "failed";
                running[job.automation_id] = { jobId: job.id, status, githubRunUrl: d.data.run_url, steps, error: job.error_message, progress: Math.round((done / total) * 100) };
              }
            } catch {}
          }
        }
        setRunningJobs(running);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, [loadData]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const handleRun = async (autoId: number) => {
    setRunningJobs(prev => ({ ...prev, [autoId]: { jobId: 0, status: "queued", githubRunUrl: null, steps: [], error: null, progress: 0 } }));
    try {
      const res = await fetch(`/api/automations/${autoId}/run`, { method: "POST" });
      const data = await res.json();
      if (data.success) { setTimeout(loadData, 3000); }
      else setRunningJobs(prev => ({ ...prev, [autoId]: { ...prev[autoId], status: "failed", error: data.error } }));
    } catch { setRunningJobs(prev => ({ ...prev, [autoId]: { ...prev[autoId], status: "failed", error: "Request failed" } })); }
  };

  const handleAction = async (id: number, action: string) => {
    if (action === "run") { handleRun(id); return; }
    try {
      if (action === "delete") await fetch(`/api/automations/${id}`, { method: "DELETE" });
      else await fetch(`/api/automations/${id}/${action}`, { method: "POST" });
      loadData();
    } catch {}
  };

  const openCreate = (type: "video" | "image") => { setEditData(null); setModalType(type); setShowModal(true); };
  const openEdit = (auto: Automation) => { setEditData(auto); setModalType(auto.type as "video" | "image"); setShowModal(true); };

  const sc = (s: string) => s === "success" ? "#10b981" : s === "failed" ? "#ef4444" : s === "running" || s === "in_progress" ? "#6366f1" : "#f59e0b";
  const si = (s: StepInfo) => s.conclusion === "success" ? "\u2713" : s.conclusion === "failure" ? "\u2717" : s.status === "in_progress" ? "\u27F3" : "\u25CB";
  const filtered = filter === "all" ? automations : automations.filter(a => a.type === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div><h2 className="text-3xl font-bold">Automations</h2><p className="text-[#a1a1aa] mt-1">Manage your automation pipelines</p></div>
        <div className="flex gap-3">
          <button onClick={() => openCreate("video")} className="glass-button-primary">+ Video</button>
          <button onClick={() => openCreate("image")} className="glass-button-primary">+ Image</button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {["all", "video", "image"].map(f => <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filter === f ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>{f === "all" ? "All" : f}</button>)}
      </div>

      {loading ? <div className="text-center py-16 text-[#a1a1aa]">Loading...</div> : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-lg font-medium">No automations yet</p><p className="text-[#a1a1aa] mt-1">Create your first automation</p></div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(auto => {
            const r = runningJobs[auto.id];
            const stats = automationStats[auto.id] || { scheduled: 0, posted: 0 };
            const lq = linkQueues[auto.id];
            const nextRunTs = parseAutomationDate(auto.next_run);
            const countdownLabel = nextRunTs ? (nextRunTs <= now ? "Running soon" : `Next in ${formatCountdown(nextRunTs - now)}`) : null;
            const nextRunTitle = nextRunTs ? `Next run ${new Date(nextRunTs).toLocaleString()}` : undefined;
            return (
              <div key={auto.id} className="glass-card overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${auto.type === "video" ? "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]" : "bg-[rgba(236,72,153,0.15)] text-[#ec4899]"}`}>{auto.type === "video" ? "\u25B6" : "\uD83D\uDDBC"}</div>
                    <div>
                      <h4 className="font-semibold text-lg">{auto.name}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`badge ${auto.type === "video" ? "badge-video" : "badge-image"}`}>{auto.type}</span>
                        <span className={`badge badge-${auto.status}`}>{auto.status}</span>
                        <span className="text-[11px] px-2 py-1 rounded-lg bg-[rgba(245,158,11,0.12)] text-amber-300">
                          Scheduled {stats.scheduled}
                        </span>
                        <span className="text-[11px] px-2 py-1 rounded-lg bg-[rgba(16,185,129,0.12)] text-emerald-300">
                          Posted {stats.posted}
                        </span>
                        {lq && (
                          <span className={`text-[11px] px-2 py-1 rounded-lg ${lq.allCompleted ? "bg-[rgba(16,185,129,0.15)] text-emerald-300" : "bg-[rgba(139,92,246,0.15)] text-[#a78bfa]"}`}>
                            {lq.allCompleted ? `All ${lq.totalLinks} links done` : `Link ${lq.processedLinks + 1}/${lq.totalLinks}`}
                          </span>
                        )}
                        {countdownLabel && !r && (
                          <span className="text-[11px] px-2 py-1 rounded-lg bg-[rgba(6,182,212,0.14)] text-cyan-300" title={nextRunTitle}>
                            {countdownLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(auto)} className="glass-button text-sm py-2 px-4">Edit</button>
                    {r ? (
                      <button onClick={() => setShowLogs({ autoId: auto.id, job: r })} className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        {r.progress}% {r.status}
                      </button>
                    ) : auto.status === "active" && <button onClick={() => handleRun(auto.id)} className="glass-button-primary text-sm py-2 px-4">Run Now</button>}
                    {auto.status === "active" && !r && <button onClick={() => handleAction(auto.id, "pause")} className="glass-button text-sm py-2 px-4">Pause</button>}
                    {auto.status !== "active" && !r && <button onClick={() => handleAction(auto.id, "resume")} className="glass-button text-sm py-2 px-4">Resume</button>}
                    <button onClick={() => handleAction(auto.id, "delete")} className="glass-button text-sm py-2 px-4 text-[#ef4444]">Delete</button>
                  </div>
                </div>
                {lq && !lq.allCompleted && (
                  <div className="px-5 pb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#a1a1aa]">Link Queue Progress</span>
                      <span className="text-xs font-medium text-[#8b5cf6]">{lq.processedLinks}/{lq.totalLinks} processed</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] transition-all duration-700" style={{ width: `${Math.round((lq.processedLinks / lq.totalLinks) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {lq && lq.allCompleted && (
                  <div className="px-5 pb-3">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(16,185,129,0.08)]">
                      <span className="text-emerald-400 text-sm">&#10003;</span>
                      <span className="text-xs text-emerald-300">Saray {lq.totalLinks} links process ho chuke hain! Automation complete.</span>
                    </div>
                  </div>
                )}
                {r && (
                  <div className="px-5 pb-5">
                    <div className="h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden mb-3"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.progress}%`, backgroundColor: sc(r.status) }} /></div>
                    <div className="flex flex-wrap gap-2">{r.steps.slice(0, 6).map((step, i) => <span key={i} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: `${sc(step.conclusion || step.status)}15`, color: sc(step.conclusion || step.status) }}>{si(step)} {step.name.substring(0, 18)}</span>)}</div>
                    <button onClick={() => setShowLogs({ autoId: auto.id, job: r })} className="text-xs text-[#6366f1] hover:underline mt-2">View Full Logs</button>
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
          <div className="glass-card max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex justify-between">
              <div><h3 className="text-lg font-bold">Runner Logs</h3><p className="text-xs text-[#a1a1aa]">Job #{showLogs.job.jobId}</p></div>
              <button onClick={() => setShowLogs(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 scrollbar-thin space-y-4">
              <span className="badge" style={{ backgroundColor: `${sc(showLogs.job.status)}20`, color: sc(showLogs.job.status) }}>{showLogs.job.status}</span>
              <div className="h-3 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${showLogs.job.progress}%`, backgroundColor: sc(showLogs.job.status) }} /></div>
              <div className="space-y-2">{showLogs.job.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-[rgba(255,255,255,0.03)]">
                  <span style={{ color: sc(step.conclusion || step.status) }}>{si(step)}</span>
                  <span className="text-sm flex-1">{step.name}</span>
                  <span className="text-xs" style={{ color: sc(step.conclusion || step.status) }}>{step.conclusion === "success" ? "Done" : step.conclusion === "failure" ? "Failed" : "Running"}</span>
                </div>
              ))}</div>
              {showLogs.job.error && <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)]"><p className="text-xs text-[#ef4444]">{showLogs.job.error}</p></div>}
              <div className="flex gap-3">
                {showLogs.job.githubRunUrl && <a href={showLogs.job.githubRunUrl} target="_blank" rel="noopener" className="glass-button-primary text-sm py-2 px-4">GitHub</a>}
                <button onClick={() => setShowLogs(null)} className="glass-button text-sm py-2 px-4">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && <AutomationModal type={modalType} editData={editData} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); loadData(); }} />}
    </div>
  );
}
