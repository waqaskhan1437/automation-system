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
}

interface FFmpegConfig {
  trim_start: string;
  trim_end: string;
  resize: string;
  watermark_text: string;
  watermark_position: string;
  overlay_text: string;
  overlay_position: string;
  fps: string;
  codec: string;
  audio_codec: string;
  custom_args: string;
}

interface RunningJob {
  automationId: number;
  jobId: number;
  status: "queued" | "running" | "success" | "failed";
  githubRunId: number | null;
  githubRunUrl: string | null;
  steps: Array<{ name: string; status: string; conclusion: string | null }>;
  error: string | null;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [modalType, setModalType] = useState<"video" | "image" | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<number, RunningJob>>({});
  const [logsModal, setLogsModal] = useState<RunningJob | null>(null);

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      if (data.success) {
        setAutomations(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch automations");
    }
    setLoading(false);
  };

  const pollJobStatus = useCallback(async (automationId: number, jobId: number) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      const data = await res.json();
      if (data.success) {
        const statusData = data.data;
        setRunningJobs(prev => ({
          ...prev,
          [automationId]: {
            ...prev[automationId],
            status: statusData.status,
            githubRunUrl: statusData.run_url,
            error: statusData.error,
          }
        }));

        // Fetch steps/logs
        const logsRes = await fetch(`/api/jobs/${jobId}/logs`);
        const logsData = await logsRes.json();
        if (logsData.success) {
          setRunningJobs(prev => ({
            ...prev,
            [automationId]: {
              ...prev[automationId],
              steps: logsData.data.steps || [],
              githubRunId: logsData.data.run_id,
              githubRunUrl: logsData.data.run_url,
            }
          }));
        }

        if (statusData.status === "success" || statusData.status === "failed") {
          setTimeout(() => {
            setRunningJobs(prev => {
              const newJobs = { ...prev };
              delete newJobs[automationId];
              return newJobs;
            });
            fetchAutomations();
          }, 5000);
          return false;
        }
        return true;
      }
    } catch {}
    return true;
  }, []);

  useEffect(() => {
    const runningAutomationIds = Object.keys(runningJobs).map(Number);
    if (runningAutomationIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const autoId of runningAutomationIds) {
        const job = runningJobs[autoId];
        if (job && job.status !== "success" && job.status !== "failed") {
          await pollJobStatus(autoId, job.jobId);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runningJobs, pollJobStatus]);

  const handleAction = async (id: number, action: "run" | "pause" | "resume" | "delete") => {
    try {
      if (action === "run") {
        setRunningJobs(prev => ({
          ...prev,
          [id]: {
            automationId: id,
            jobId: 0,
            status: "queued",
            githubRunId: null,
            githubRunUrl: null,
            steps: [],
            error: null,
          }
        }));

        const res = await fetch(`/api/automations/${id}/run`, { method: "POST" });
        const data = await res.json();
        if (data.success) {
          setRunningJobs(prev => ({
            ...prev,
            [id]: {
              ...prev[id],
              jobId: data.data.job_id,
              status: "running",
              githubRunId: data.data.github_run_id,
            }
          }));
          pollJobStatus(id, data.data.job_id);
        } else {
          setRunningJobs(prev => ({
            ...prev,
            [id]: {
              ...prev[id],
              status: "failed",
              error: data.error,
            }
          }));
        }
      } else if (action === "delete") {
        await fetch(`/api/automations/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/automations/${id}/${action}`, { method: "POST" });
      }
      fetchAutomations();
    } catch (err) {
      if (action === "run") {
        setRunningJobs(prev => ({
          ...prev,
          [id]: {
            ...prev[id],
            status: "failed",
            error: "Action failed",
          }
        }));
      }
    }
  };
  };

  const filtered = filter === "all" ? automations : automations.filter((a) => a.type === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Automations</h2>
          <p className="text-[#a1a1aa] mt-1">Manage your automation pipelines</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setModalType("video")} className="glass-button-primary">
            + Video
          </button>
          <button onClick={() => setModalType("image")} className="glass-button-primary">
            + Image
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "video", "image"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
              filter === f ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
            }`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#a1a1aa]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-lg font-medium">No automations yet</p>
          <p className="text-[#a1a1aa] mt-1">Create your first automation to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((auto) => (
            <div key={auto.id} className="glass-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${auto.type === "video" ? "bg-[rgba(139,92,246,0.15)]" : "bg-[rgba(236,72,153,0.15)]"}`}>
                  {auto.type === "video" ? (
                    <svg className="w-5 h-5 text-[#8b5cf6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#ec4899]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold">{auto.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge ${auto.type === "video" ? "badge-video" : "badge-image"}`}>{auto.type}</span>
                    <span className={`badge badge-${auto.status}`}>{auto.status}</span>
                    {auto.schedule && <span className="text-xs text-[#a1a1aa]">{auto.schedule}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingAutomation(auto);
                    setModalType(auto.type);
                  }}
                  className="glass-button text-sm py-2 px-4"
                >
                  Edit
                </button>
                {runningJobs[auto.id] ? (
                  <button
                    onClick={() => setLogsModal(runningJobs[auto.id])}
                    className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {runningJobs[auto.id].status === "queued" ? "Queued..." : runningJobs[auto.id].status === "running" ? "Running..." : runningJobs[auto.id].status === "success" ? "Done!" : "Failed"}
                  </button>
                ) : auto.status === "active" ? (
                  <button onClick={() => handleAction(auto.id, "run")} className="glass-button-primary text-sm py-2 px-4">
                    Run Now
                  </button>
                ) : null}
                {auto.status === "active" && !runningJobs[auto.id] ? (
                  <button onClick={() => handleAction(auto.id, "pause")} className="glass-button text-sm py-2 px-4">
                    Pause
                  </button>
                ) : auto.status !== "active" && !runningJobs[auto.id] ? (
                  <button onClick={() => handleAction(auto.id, "resume")} className="glass-button text-sm py-2 px-4">
                    Resume
                  </button>
                ) : null}
                <button onClick={() => handleAction(auto.id, "delete")} className="glass-button text-sm py-2 px-4 text-[#ef4444]">
                  Delete
                </button>
              </div>
              {/* Progress Bar */}
              {runningJobs[auto.id] && (
                <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          runningJobs[auto.id].status === "success" ? "bg-[#10b981] w-full" :
                          runningJobs[auto.id].status === "failed" ? "bg-[#ef4444] w-full" :
                          runningJobs[auto.id].status === "running" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] w-2/3 animate-pulse" :
                          "bg-[#6366f1] w-1/4"
                        }`}
                      />
                    </div>
                    <button
                      onClick={() => setLogsModal(runningJobs[auto.id])}
                      className="text-xs text-[#6366f1] hover:underline whitespace-nowrap"
                    >
                      View Logs
                    </button>
                  </div>
                  {runningJobs[auto.id].steps.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {runningJobs[auto.id].steps.map((step, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            step.conclusion === "success" ? "bg-[rgba(16,185,129,0.15)] text-[#10b981]" :
                            step.conclusion === "failure" ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444]" :
                            step.status === "in_progress" ? "bg-[rgba(99,102,241,0.15)] text-[#6366f1]" :
                            "bg-[rgba(255,255,255,0.05)] text-[#a1a1aa]"
                          }`}
                        >
                          {step.status === "in_progress" ? "..." : step.conclusion === "success" ? "✓" : step.conclusion === "failure" ? "✗" : "○"} {step.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {runningJobs[auto.id].error && (
                    <p className="text-xs text-[#ef4444] mt-1">{runningJobs[auto.id].error}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalType === "video" && (
        <VideoModal
          onClose={() => { setModalType(null); setEditingAutomation(null); }}
          onCreated={() => { setModalType(null); setEditingAutomation(null); fetchAutomations(); }}
          editData={editingAutomation}
        />
      )}
      {modalType === "image" && (
        <ImageModal
          onClose={() => { setModalType(null); setEditingAutomation(null); }}
          onCreated={() => { setModalType(null); setEditingAutomation(null); fetchAutomations(); }}
          editData={editingAutomation}
        />
      )}

      {/* Logs Modal */}
      {logsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setLogsModal(null)}>
          <div className="glass-card max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-4 border-b border-[rgba(255,255,255,0.08)]">
              <div>
                <h3 className="text-lg font-bold">GitHub Actions Runner Logs</h3>
                <p className="text-xs text-[#a1a1aa] mt-1">Automation #{logsModal.automationId} • Job #{logsModal.jobId}</p>
              </div>
              <button onClick={() => setLogsModal(null)} className="glass-button py-1 px-3 text-sm">Close</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 scrollbar-thin space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <span className={`badge ${
                  logsModal.status === "success" ? "badge-success" :
                  logsModal.status === "failed" ? "badge-failed" :
                  logsModal.status === "running" ? "badge-running" :
                  "badge-queued"
                }`}>
                  {logsModal.status === "queued" ? "Queued" :
                   logsModal.status === "running" ? "Running" :
                   logsModal.status === "success" ? "Success" : "Failed"}
                </span>
                {logsModal.githubRunUrl && (
                  <a href={logsModal.githubRunUrl} target="_blank" rel="noopener" className="text-xs text-[#6366f1] hover:underline">
                    View on GitHub →
                  </a>
                )}
              </div>

              {/* Progress Steps */}
              {logsModal.steps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Workflow Steps</p>
                  {logsModal.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        step.conclusion === "success" ? "bg-[rgba(16,185,129,0.2)] text-[#10b981]" :
                        step.conclusion === "failure" ? "bg-[rgba(239,68,68,0.2)] text-[#ef4444]" :
                        step.status === "in_progress" ? "bg-[rgba(99,102,241,0.2)] text-[#6366f1]" :
                        "bg-[rgba(255,255,255,0.05)] text-[#a1a1aa]"
                      }`}>
                        {step.conclusion === "success" ? "✓" :
                         step.conclusion === "failure" ? "✗" :
                         step.status === "in_progress" ? (
                           <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                           </svg>
                         ) : "○"}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{step.name}</p>
                        <p className="text-xs text-[#a1a1aa] capitalize">{step.status.replace("_", " ")}</p>
                      </div>
                      <span className={`text-xs ${
                        step.conclusion === "success" ? "text-[#10b981]" :
                        step.conclusion === "failure" ? "text-[#ef4444]" :
                        step.status === "in_progress" ? "text-[#6366f1]" :
                        "text-[#a1a1aa]"
                      }`}>
                        {step.conclusion === "success" ? "Completed" :
                         step.conclusion === "failure" ? "Failed" :
                         step.status === "in_progress" ? "In Progress" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Bar */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Progress</p>
                <div className="h-3 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      logsModal.status === "success" ? "bg-[#10b981] w-full" :
                      logsModal.status === "failed" ? "bg-[#ef4444] w-full" :
                      logsModal.status === "running" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] animate-pulse" :
                      "bg-[#6366f1]"
                    }`}
                    style={{
                      width: logsModal.status === "success" || logsModal.status === "failed" ? "100%" :
                             logsModal.steps.length > 0 ?
                               `${(logsModal.steps.filter(s => s.conclusion === "success").length / logsModal.steps.length) * 100}%` :
                               "10%"
                    }}
                  />
                </div>
                {logsModal.steps.length > 0 && (
                  <p className="text-xs text-[#a1a1aa]">
                    {logsModal.steps.filter(s => s.conclusion === "success").length} / {logsModal.steps.length} steps completed
                  </p>
                )}
              </div>

              {/* Error Message */}
              {logsModal.error && (
                <div className="p-4 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
                  <p className="text-xs text-[#ef4444] font-medium mb-1">Error</p>
                  <p className="text-sm text-[#ef4444]">{logsModal.error}</p>
                </div>
              )}

              {/* Simulated Console Output */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Runner Output</p>
                <div className="bg-[#0d0d14] rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto scrollbar-thin">
                  {logsModal.steps.length > 0 ? (
                    <>
                      <p className="text-[#10b981]">$ Starting GitHub Actions workflow...</p>
                      {logsModal.steps.map((step, i) => (
                        <div key={i}>
                          <p className={`mt-1 ${step.status === "in_progress" ? "text-[#6366f1]" : step.conclusion === "success" ? "text-[#10b981]" : step.conclusion === "failure" ? "text-[#ef4444]" : "text-[#a1a1aa]"}`}>
                            {step.status === "in_progress" ? "⟳" : step.conclusion === "success" ? "✓" : step.conclusion === "failure" ? "✗" : "○"} Step {i + 1}: {step.name}
                          </p>
                          {step.conclusion === "success" && (
                            <p className="text-[#a1a1aa] ml-4">  Completed successfully</p>
                          )}
                          {step.conclusion === "failure" && (
                            <p className="text-[#ef4444] ml-4">  Step failed - check GitHub Actions for details</p>
                          )}
                        </div>
                      ))}
                      {logsModal.status === "success" && (
                        <p className="text-[#10b981] mt-2">$ Workflow completed successfully!</p>
                      )}
                      {logsModal.status === "failed" && (
                        <p className="text-[#ef4444] mt-2">$ Workflow failed. Check error above.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[#a1a1aa]">$ Waiting for runner to start...</p>
                      <p className="text-[#a1a1aa]">$ GitHub Actions is provisioning the runner</p>
                      <p className="text-[#6366f1] mt-2">⟳ This may take 1-2 minutes</p>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3">
                {logsModal.githubRunUrl && (
                  <a href={logsModal.githubRunUrl} target="_blank" rel="noopener" className="glass-button-primary text-sm py-2 px-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in GitHub
                  </a>
                )}
                <button onClick={() => setLogsModal(null)} className="glass-button text-sm py-2 px-4">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== VIDEO MODAL ========== */
function VideoModal({ onClose, onCreated, editData }: { onClose: () => void; onCreated: () => void; editData?: Automation | null }) {
  const [activeTab, setActiveTab] = useState<"basic" | "video" | "taglines" | "social" | "publish">("basic");
  const [name, setName] = useState(editData?.name || "");
  const [description, setDescription] = useState("");
  const [videoSource, setVideoSource] = useState<"direct" | "youtube" | "bunny">("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [multipleUrls, setMultipleUrls] = useState("");
  const [codec, setCodec] = useState("libx264");
  const [audioCodec, setAudioCodec] = useState("aac");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState("bottomright");
  const [watermarkSize, setWatermarkSize] = useState("24");
  const [overlayText, setOverlayText] = useState("");
  const [overlayPosition, setOverlayPosition] = useState("center");
  const [overlaySize, setOverlaySize] = useState("48");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [perPlatformContent, setPerPlatformContent] = useState<Record<string, { caption: string; hashtags: string }>>({});
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [outputQuality, setOutputQuality] = useState("high");
  const [outputResolution, setOutputResolution] = useState("1080x1920");
  const [schedule, setSchedule] = useState(editData?.schedule || "once");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Video tab - advanced features
  const [fetchMode, setFetchMode] = useState<"last_days" | "date_range" | "url">("url");
  const [lastDays, setLastDays] = useState("7");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [videosPerRun, setVideosPerRun] = useState("1");
  const [shortDuration, setShortDuration] = useState("60");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitDuration, setSplitDuration] = useState("30");
  const [playbackSpeed, setPlaybackSpeed] = useState("1");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [cropMode, setCropMode] = useState<"crop" | "fit">("crop");
  const [combineVideos, setCombineVideos] = useState(false);
  const [combineCount, setCombineCount] = useState("3");
  const [convertToShorts, setConvertToShorts] = useState(true);

  // Taglines AI state
  const [aiProviders, setAiProviders] = useState<{ id: string; label: string; hasKey: boolean }[]>([]);
  const [selectedAI, setSelectedAI] = useState("openai");
  const [generating, setGenerating] = useState(false);
  const [topTaglines, setTopTaglines] = useState<string[]>([]);
  const [bottomTaglines, setBottomTaglines] = useState<string[]>([]);
  const [selectedTopTagline, setSelectedTopTagline] = useState("");
  const [selectedBottomTagline, setSelectedBottomTagline] = useState("");
  const [taglinePrompt, setTaglinePrompt] = useState("");

  // Social Content AI state
  const [socialSelectedAI, setSocialSelectedAI] = useState("openai");
  const [socialGenerating, setSocialGenerating] = useState(false);
  const [generatedTitles, setGeneratedTitles] = useState<string[]>([]);
  const [generatedDescriptions, setGeneratedDescriptions] = useState<string[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[][]>([]);
  const [socialPrompt, setSocialPrompt] = useState("");

  // Publish state
  const [autoPublish, setAutoPublish] = useState(true);
  const [publishSchedule, setPublishSchedule] = useState("immediate");
  const [publishDelay, setPublishDelay] = useState("5");
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("");
  const [syncedAccounts, setSyncedAccounts] = useState<Array<{ platform: string; username: string; id: string; connected: boolean }>>([]);

  const allPlatforms = ["instagram", "youtube", "tiktok", "facebook", "x"];

  useEffect(() => {
    if (editData?.config) {
      try {
        const cfg = JSON.parse(editData.config);
        setVideoSource(cfg.video_source || "youtube");
        setVideoUrl(cfg.video_url || "");
        setChannelUrl(cfg.channel_url || "");
        setMultipleUrls((cfg.multiple_urls || []).join("\n"));
        setSchedule(editData.schedule || "once");
        if (cfg.ffmpeg_config) {
          setCodec(cfg.ffmpeg_config.codec || "libx264");
          setAudioCodec(cfg.ffmpeg_config.audio_codec || "aac");
        }
        if (cfg.taglines) {
          setWatermarkText(cfg.taglines.watermark?.text || "");
          setWatermarkPosition(cfg.taglines.watermark?.position || "bottomright");
          setSelectedTopTagline(cfg.taglines.top_tagline || "");
          setSelectedBottomTagline(cfg.taglines.bottom_tagline || "");
        }
        if (cfg.social_content) {
          setCaption(cfg.social_content.caption || "");
          setPostDescription(cfg.social_content.description || "");
          setHashtags((cfg.social_content.hashtags || []).join(", "));
        }
        if (cfg.short_settings) {
          setAspectRatio(cfg.short_settings.aspect_ratio || "9:16");
          setCropMode(cfg.short_settings.crop_mode || "crop");
          setPlaybackSpeed(String(cfg.short_settings.playback_speed || "1"));
          setConvertToShorts(cfg.short_settings.convert_to_shorts ?? true);
        }
        if (cfg.fetch_mode) setFetchMode(cfg.fetch_mode);
        if (cfg.fetch_config) {
          setLastDays(String(cfg.fetch_config.last_days || "7"));
          setVideosPerRun(String(cfg.fetch_config.videos_per_run || "1"));
        }
        if (cfg.split) setSplitEnabled(cfg.split.enabled || false);
        if (cfg.combine) setCombineVideos(cfg.combine.enabled || false);
        if (cfg.output_format) setOutputFormat(cfg.output_format);
        if (cfg.output_quality) setOutputQuality(cfg.output_quality);
        if (cfg.output_resolution) setOutputResolution(cfg.output_resolution);
        if (cfg.publish) {
          setAutoPublish(cfg.publish.auto_publish ?? true);
          setPublishSchedule(cfg.publish.schedule_type || "immediate");
        }
        if (cfg.platforms) setPlatforms(cfg.platforms);
      } catch {}
    }
  }, [editData]);

  useEffect(() => {
    // Fetch AI settings
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const d = data.data;
          const providers = [
            { id: "openai", label: "OpenAI", hasKey: !!d.openai_key },
            { id: "gemini", label: "Gemini", hasKey: !!d.gemini_key },
            { id: "grok", label: "Grok", hasKey: !!d.grok_key },
            { id: "cohere", label: "Cohere", hasKey: !!d.cohere_key },
            { id: "openrouter", label: "OpenRouter", hasKey: !!d.openrouter_key },
          ];
          setAiProviders(providers.filter((p) => p.hasKey));
          if (d.default_provider) setSelectedAI(d.default_provider);
        }
      })
      .catch(() => {});

    // Fetch synced Postforme accounts
    fetch("/api/settings/postforme")
      .then((r) => r.json())
      .then(async (data) => {
        if (data.success && data.data?.api_key) {
          try {
            const syncRes = await fetch("/api/settings/postforme/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: data.data.api_key }),
            });
            const syncData = await syncRes.json();
            if (syncData.success && syncData.data) {
              setSyncedAccounts(syncData.data);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const generateTaglines = async () => {
    setGenerating(true);
    setTopTaglines([]);
    setBottomTaglines([]);

    const prompt = taglinePrompt || `Generate 5 catchy top taglines and 5 catchy bottom taglines for a ${aspectRatio} ${convertToShorts ? "short" : "video"} about "${name || "social media content"}". 
    Top taglines should be hook/catchy headlines (max 8 words each). 
    Bottom taglines should be call-to-action or engaging closing lines (max 8 words each).
    Return JSON format: {"top": ["tagline1", "tagline2", ...], "bottom": ["tagline1", "tagline2", ...]}`;

    try {
      const res = await fetch("/api/settings/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedAI, prompt }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTopTaglines(data.data.top || []);
        setBottomTaglines(data.data.bottom || []);
        if (data.data.top?.[0]) setSelectedTopTagline(data.data.top[0]);
        if (data.data.bottom?.[0]) setSelectedBottomTagline(data.data.bottom[0]);
      } else {
        // Fallback mock taglines if API not available
        setTopTaglines(["Watch till the end!", "You won't believe this!", "This changed everything!", "The secret revealed!", "Nobody talks about this!"]);
        setBottomTaglines(["Follow for more!", "Like & Share!", "Comment your thoughts!", "Save for later!", "Subscribe now!"]);
        setSelectedTopTagline("Watch till the end!");
        setSelectedBottomTagline("Follow for more!");
      }
    } catch {
      // Fallback
      setTopTaglines(["Watch till the end!", "You won't believe this!", "This changed everything!", "The secret revealed!", "Nobody talks about this!"]);
      setBottomTaglines(["Follow for more!", "Like & Share!", "Comment your thoughts!", "Save for later!", "Subscribe now!"]);
      setSelectedTopTagline("Watch till the end!");
      setSelectedBottomTagline("Follow for more!");
    }
    setGenerating(false);
  };

  const generateSocialContent = async () => {
    setSocialGenerating(true);
    setGeneratedTitles([]);
    setGeneratedDescriptions([]);
    setGeneratedHashtags([]);

    const prompt = socialPrompt || `For a social media video about "${name || "social media content"}", generate 3 title options, 3 description options, and 3 hashtag sets.
    Return JSON format: {"titles": ["title1", "title2", "title3"], "descriptions": ["desc1", "desc2", "desc3"], "hashtags": [["#tag1","#tag2"],["#tag3","#tag4"],["#tag5","#tag6"]]}`;

    try {
      const res = await fetch("/api/settings/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: socialSelectedAI, prompt }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setGeneratedTitles(data.data.titles || []);
        setGeneratedDescriptions(data.data.descriptions || []);
        setGeneratedHashtags(data.data.hashtags || []);
        if (data.data.titles?.[0]) setCaption(data.data.titles[0]);
        if (data.data.descriptions?.[0]) setPostDescription(data.data.descriptions[0]);
        if (data.data.hashtags?.[0]) setHashtags(data.data.hashtags[0].join(", "));
      } else {
        // Fallback
        setGeneratedTitles(["You Won't Believe What Happens Next!", "This Will Change Your Life!", "The Secret Nobody Tells You!"]);
        setGeneratedDescriptions(["Check out this amazing video that will blow your mind!", "An incredible journey you need to see to believe!", "Discover the hidden truth in this viral video!"]);
        setGeneratedHashtags([["#viral", "#trending", "#fyp"], ["#mustwatch", "#explore", "#discover"], ["#trend", "#share", "#follow"]]);
        setCaption("You Won't Believe What Happens Next!");
        setPostDescription("Check out this amazing video that will blow your mind!");
        setHashtags("#viral, #trending, #fyp");
      }
    } catch {
      setGeneratedTitles(["You Won't Believe What Happens Next!", "This Will Change Your Life!", "The Secret Nobody Tells You!"]);
      setGeneratedDescriptions(["Check out this amazing video that will blow your mind!", "An incredible journey you need to see to believe!", "Discover the hidden truth in this viral video!"]);
      setGeneratedHashtags([["#viral", "#trending", "#fyp"], ["#mustwatch", "#explore", "#discover"], ["#trend", "#share", "#follow"]]);
      setCaption("You Won't Believe What Happens Next!");
      setPostDescription("Check out this amazing video that will blow your mind!");
      setHashtags("#viral, #trending, #fyp");
    }
    setSocialGenerating(false);
  };

  const tabs = [
    { id: "basic" as const, label: "Basic", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "video" as const, label: "Video", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
    { id: "taglines" as const, label: "Taglines", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
    { id: "social" as const, label: "Social Content", icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
    { id: "publish" as const, label: "Publish", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  ];

  const updatePlatformContent = (platform: string, field: "caption" | "hashtags", value: string) => {
    setPerPlatformContent((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }));
  };

  const handleCreate = async () => {
    setCreating(true);
    const config = {
      video_source: videoSource,
      video_url: videoUrl,
      channel_url: channelUrl,
      multiple_urls: multipleUrls.split("\n").map((u) => u.trim()).filter(Boolean),
      fetch_mode: fetchMode,
      fetch_config: {
        last_days: fetchMode === "last_days" ? parseInt(lastDays) : null,
        date_from: fetchMode === "date_range" ? dateFrom : null,
        date_to: fetchMode === "date_range" ? dateTo : null,
        videos_per_run: parseInt(videosPerRun),
      },
      short_settings: {
        max_duration: parseInt(shortDuration),
        playback_speed: parseFloat(playbackSpeed),
        aspect_ratio: aspectRatio,
        crop_mode: cropMode,
        convert_to_shorts: convertToShorts,
      },
      split: {
        enabled: splitEnabled,
        chunk_duration: splitEnabled ? parseInt(splitDuration) : null,
      },
      combine: {
        enabled: combineVideos,
        count: combineVideos ? parseInt(combineCount) : null,
      },
      ffmpeg_config: {
        codec,
        audio_codec: audioCodec,
      },
      taglines: {
        ai_provider: selectedAI,
        top_tagline: selectedTopTagline,
        bottom_tagline: selectedBottomTagline,
        all_top: topTaglines,
        all_bottom: bottomTaglines,
        watermark: { text: watermarkText, position: watermarkPosition, size: parseInt(watermarkSize) },
      },
      social_content: {
        caption,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        description: postDescription,
        per_platform: perPlatformContent,
      },
      output_format: outputFormat,
      output_quality: outputQuality,
      output_resolution: outputResolution,
      platforms,
      publish: {
        auto_publish: autoPublish,
        schedule_type: publishSchedule,
        delay_minutes: publishSchedule === "delay" ? parseInt(publishDelay) : null,
        specific_date: publishSchedule === "specific" ? publishDate : null,
        specific_time: publishSchedule === "specific" ? publishTime : null,
      },
    };
    try {
      const url = editData?.id ? `/api/automations/${editData.id}` : "/api/automations";
      const method = editData?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "video", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) onCreated();
      else alert("Failed: " + data.error);
    } catch { alert("Failed to save"); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-card max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-xl font-bold">{editData ? "Edit Video Automation" : "Create Video Automation"}</h3>
          <button onClick={onClose} className="glass-button py-1 px-3 text-sm">Close</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 mt-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                  : "text-[#a1a1aa] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin">
          {activeTab === "basic" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Automation Name</label>
                <input className="glass-input" placeholder="e.g., Daily YouTube Shorts" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Video Source</label>
                <select className="glass-select" value={videoSource} onChange={(e) => setVideoSource(e.target.value as "direct" | "youtube" | "bunny")}>
                  <option value="youtube">YouTube Channel / Video Links</option>
                  <option value="direct">Direct Links (.mp4)</option>
                  <option value="bunny">Bunny CDN</option>
                </select>
              </div>

              {/* YouTube Source Fields */}
              {videoSource === "youtube" && (
                <div className="glass-card p-5 space-y-4">
                  <p className="text-sm font-medium">YouTube Source</p>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Channel URL (fetch latest videos)</label>
                    <input
                      className="glass-input text-sm"
                      placeholder="https://www.youtube.com/@channelname"
                      value={channelUrl}
                      onChange={(e) => setChannelUrl(e.target.value)}
                    />
                    <p className="text-[10px] text-[#a1a1aa] mt-1">Automation will fetch latest videos from this channel</p>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Multiple Video URLs (one per line)</label>
                    <textarea
                      className="glass-input text-sm min-h-[80px] resize-none"
                      placeholder={"https://youtube.com/watch?v=abc123\nhttps://youtube.com/watch?v=def456\nhttps://youtube.com/watch?v=ghi789"}
                      value={multipleUrls}
                      onChange={(e) => setMultipleUrls(e.target.value)}
                    />
                    <p className="text-[10px] text-[#a1a1aa] mt-1">Paste multiple YouTube video URLs, each on a new line</p>
                  </div>
                </div>
              )}

              {/* Direct Source Fields */}
              {videoSource === "direct" && (
                <div className="glass-card p-5 space-y-4">
                  <p className="text-sm font-medium">Direct Video URLs</p>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Single Video URL</label>
                    <input
                      className="glass-input text-sm"
                      placeholder="https://example.com/video.mp4"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Multiple Video URLs (one per line)</label>
                    <textarea
                      className="glass-input text-sm min-h-[80px] resize-none"
                      placeholder={"https://example.com/video1.mp4\nhttps://example.com/video2.mp4"}
                      value={multipleUrls}
                      onChange={(e) => setMultipleUrls(e.target.value)}
                    />
                    <p className="text-[10px] text-[#a1a1aa] mt-1">Paste multiple .mp4 URLs, each on a new line</p>
                  </div>
                </div>
              )}

              {/* Bunny Source Fields */}
              {videoSource === "bunny" && (
                <div className="glass-card p-5 space-y-4">
                  <p className="text-sm font-medium">Bunny CDN Source</p>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Video URL or ID</label>
                    <input
                      className="glass-input text-sm"
                      placeholder="https://iframe.mediadelivery.net/embed/12345/abc-def"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Multiple Video IDs (one per line)</label>
                    <textarea
                      className="glass-input text-sm min-h-[80px] resize-none"
                      placeholder={"video-id-1\nvideo-id-2"}
                      value={multipleUrls}
                      onChange={(e) => setMultipleUrls(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Schedule</label>
                <select className="glass-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                  <option value="once">Manual (Run Once)</option>
                  <option value="*/15 * * * *">Every 15 Minutes</option>
                  <option value="*/30 * * * *">Every 30 Minutes</option>
                  <option value="0 * * * *">Hourly</option>
                  <option value="0 */6 * * *">Every 6 Hours</option>
                  <option value="0 */12 * * *">Every 12 Hours</option>
                  <option value="0 0 * * *">Daily</option>
                  <option value="0 0 * * 0">Weekly</option>
                  <option value="0 0 1 * *">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description (optional)</label>
                <textarea className="glass-input min-h-[60px] resize-none" placeholder="What does this automation do?" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          )}

          {activeTab === "video" && (
            <div className="space-y-5">
              {/* Fetch Mode */}
              <div>
                <label className="block text-sm font-medium mb-2">Fetch Videos</label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setFetchMode("url")} className={`px-4 py-2 rounded-xl text-sm font-medium ${fetchMode === "url" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
                    Single URL
                  </button>
                  <button onClick={() => setFetchMode("last_days")} className={`px-4 py-2 rounded-xl text-sm font-medium ${fetchMode === "last_days" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
                    Last X Days
                  </button>
                  <button onClick={() => setFetchMode("date_range")} className={`px-4 py-2 rounded-xl text-sm font-medium ${fetchMode === "date_range" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
                    Date Range
                  </button>
                </div>
              </div>

              {/* URL Input */}
              {fetchMode === "url" && (
                <div>
                  <label className="block text-sm font-medium mb-2">Video URL</label>
                  <input
                    className="glass-input"
                    placeholder={videoSource === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/video.mp4"}
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
              )}

              {/* Last X Days */}
              {fetchMode === "last_days" && (
                <div className="glass-card p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Fetch videos from last</label>
                      <select className="glass-select text-sm" value={lastDays} onChange={(e) => setLastDays(e.target.value)}>
                        <option value="1">1 Day</option>
                        <option value="3">3 Days</option>
                        <option value="7">7 Days</option>
                        <option value="14">14 Days</option>
                        <option value="30">30 Days</option>
                        <option value="60">60 Days</option>
                        <option value="90">90 Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Videos per run</label>
                      <select className="glass-select text-sm" value={videosPerRun} onChange={(e) => setVideosPerRun(e.target.value)}>
                        <option value="1">1 Video</option>
                        <option value="3">3 Videos</option>
                        <option value="5">5 Videos</option>
                        <option value="10">10 Videos</option>
                        <option value="20">20 Videos</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-[#a1a1aa] mt-3">
                    Will fetch the latest {videosPerRun} video(s) from the last {lastDays} day(s)
                  </p>
                </div>
              )}

              {/* Date Range */}
              {fetchMode === "date_range" && (
                <div className="glass-card p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">From Date</label>
                      <input type="date" className="glass-input text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">To Date</label>
                      <input type="date" className="glass-input text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">Videos per run</label>
                      <select className="glass-select text-sm" value={videosPerRun} onChange={(e) => setVideosPerRun(e.target.value)}>
                        <option value="1">1 Video</option>
                        <option value="3">3 Videos</option>
                        <option value="5">5 Videos</option>
                        <option value="10">10 Videos</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Short Duration */}
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-sm font-medium mb-3">Short Video Settings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Max Short Duration (seconds)</label>
                    <select className="glass-select text-sm" value={shortDuration} onChange={(e) => setShortDuration(e.target.value)}>
                      <option value="15">15 sec</option>
                      <option value="30">30 sec</option>
                      <option value="45">45 sec</option>
                      <option value="60">60 sec (Recommended)</option>
                      <option value="90">90 sec</option>
                      <option value="120">120 sec</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Playback Speed</label>
                    <select className="glass-select text-sm" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(e.target.value)}>
                      <option value="0.5">0.5x (Slow)</option>
                      <option value="0.75">0.75x</option>
                      <option value="1">1x (Normal)</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x (Fast)</option>
                      <option value="2">2x (Very Fast)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Splitting */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">Split Long Video</label>
                  <button onClick={() => setSplitEnabled(!splitEnabled)} className={`w-11 h-6 rounded-full transition-all ${splitEnabled ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${splitEnabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                  </button>
                </div>
                {splitEnabled && (
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Split into chunks of</label>
                    <select className="glass-select text-sm" value={splitDuration} onChange={(e) => setSplitDuration(e.target.value)}>
                      <option value="15">15 seconds each</option>
                      <option value="30">30 seconds each</option>
                      <option value="45">45 seconds each</option>
                      <option value="60">60 seconds each</option>
                    </select>
                    <p className="text-xs text-[#a1a1aa] mt-2">Each chunk becomes a separate short video</p>
                  </div>
                )}
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="block text-sm font-medium mb-2">Aspect Ratio</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: "9:16", label: "9:16", desc: "Shorts/Reels/TikTok" },
                    { value: "16:9", label: "16:9", desc: "YouTube/Horizontal" },
                    { value: "1:1", label: "1:1", desc: "Square/Instagram" },
                    { value: "4:5", label: "4:5", desc: "Instagram Feed" },
                  ].map((ar) => (
                    <button
                      key={ar.value}
                      onClick={() => setAspectRatio(ar.value)}
                      className={`px-4 py-3 rounded-xl text-center transition-all ${aspectRatio === ar.value ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}
                    >
                      <p className="text-sm font-medium">{ar.label}</p>
                      <p className="text-[10px] opacity-70">{ar.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Crop Mode */}
              <div className="glass-card p-4">
                <label className="block text-sm font-medium mb-3">Crop Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCropMode("crop")}
                    className={`p-4 rounded-xl text-left transition-all ${cropMode === "crop" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      <span className="text-sm font-medium">Crop (Fill Frame)</span>
                    </div>
                    <p className="text-[10px] opacity-70">Fills entire frame, may cut edges</p>
                  </button>
                  <button
                    onClick={() => setCropMode("fit")}
                    className={`p-4 rounded-xl text-left transition-all ${cropMode === "fit" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium">No Crop (Fit)</span>
                    </div>
                    <p className="text-[10px] opacity-70">Full video visible with black bars</p>
                  </button>
                </div>

                {/* Preview */}
                <div className="mt-4 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]">
                  <p className="text-xs text-[#a1a1aa] mb-2">Preview: {aspectRatio} ({cropMode === "crop" ? "Crop" : "No Crop"})</p>
                  <div className="flex items-center justify-center">
                    <div
                      className={`relative border-2 border-dashed border-[rgba(255,255,255,0.15)] rounded-lg flex items-center justify-center ${
                        aspectRatio === "9:16" ? "w-16 h-28" :
                        aspectRatio === "16:9" ? "w-28 h-16" :
                        aspectRatio === "1:1" ? "w-20 h-20" :
                        "w-20 h-25"
                      }`}
                    >
                      {cropMode === "crop" ? (
                        <>
                          <div className="absolute inset-0 bg-[rgba(99,102,241,0.15)] rounded-md" />
                          <svg className="w-6 h-6 text-[#6366f1] relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <div className="absolute bg-[rgba(99,102,241,0.15)] rounded-md" style={
                            aspectRatio === "9:16" ? { width: "60%", height: "35%", left: "20%", top: "32.5%" } :
                            aspectRatio === "16:9" ? { width: "35%", height: "60%", left: "32.5%", top: "20%" } :
                            { width: "70%", height: "70%", left: "15%", top: "15%" }
                          } />
                          <svg className="w-6 h-6 text-[#8b5cf6] relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                          </svg>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Combine Videos */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-medium">Combine Multiple Videos</label>
                    <p className="text-xs text-[#a1a1aa]">Merge X videos into 1 short</p>
                  </div>
                  <button onClick={() => setCombineVideos(!combineVideos)} className={`w-11 h-6 rounded-full transition-all ${combineVideos ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${combineVideos ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                  </button>
                </div>
                {combineVideos && (
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Combine how many videos</label>
                    <select className="glass-select text-sm" value={combineCount} onChange={(e) => setCombineCount(e.target.value)}>
                      <option value="2">2 Videos</option>
                      <option value="3">3 Videos</option>
                      <option value="5">5 Videos</option>
                      <option value="10">10 Videos</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Convert to Shorts */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Convert to Shorts Format</label>
                    <p className="text-xs text-[#a1a1aa]">Auto-crop and optimize for vertical shorts</p>
                  </div>
                  <button onClick={() => setConvertToShorts(!convertToShorts)} className={`w-11 h-6 rounded-full transition-all ${convertToShorts ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${convertToShorts ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                  </button>
                </div>
              </div>

              {/* FFmpeg Advanced */}
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-sm font-medium mb-3">Advanced FFmpeg</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Video Codec</label>
                    <select className="glass-select text-sm" value={codec} onChange={(e) => setCodec(e.target.value)}>
                      <option value="libx264">H.264</option>
                      <option value="libx265">H.265/HEVC</option>
                      <option value="libvpx-vp9">VP9</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Audio Codec</label>
                    <select className="glass-select text-sm" value={audioCodec} onChange={(e) => setAudioCodec(e.target.value)}>
                      <option value="aac">AAC</option>
                      <option value="mp3">MP3</option>
                      <option value="copy">Copy</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "taglines" && (
            <div className="space-y-5">
              {/* AI Provider Selection */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Generate Taglines with AI</p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-[#a1a1aa] mb-1">Select AI Provider</label>
                      <select className="glass-select text-sm" value={selectedAI} onChange={(e) => setSelectedAI(e.target.value)}>
                        {aiProviders.length > 0 ? (
                          aiProviders.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))
                        ) : (
                          <option value="">No AI configured (go to Settings → AI Settings)</option>
                        )}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={generateTaglines}
                        disabled={generating || aiProviders.length === 0}
                        className="glass-button-primary text-sm h-[42px] px-6 whitespace-nowrap"
                      >
                        {generating ? (
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Generate
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Custom Prompt (optional)</label>
                    <textarea
                      className="glass-input text-xs min-h-[50px] resize-none"
                      placeholder="e.g., Generate motivational taglines about fitness and health..."
                      value={taglinePrompt}
                      onChange={(e) => setTaglinePrompt(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Top Taglines */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">Top Taglines</p>
                    <p className="text-xs text-[#a1a1aa]">Appears at the top of video (hook/headline)</p>
                  </div>
                  {selectedTopTagline && (
                    <span className="badge badge-active text-xs">Selected</span>
                  )}
                </div>
                {topTaglines.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {topTaglines.map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedTopTagline(tag)}
                        className={`p-3 rounded-xl text-left text-sm transition-all ${
                          selectedTopTagline === tag
                            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                            : "glass-button hover:bg-[rgba(255,255,255,0.08)]"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#a1a1aa] text-sm">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Click Generate to create AI taglines
                  </div>
                )}
              </div>

              {/* Bottom Taglines */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">Bottom Taglines</p>
                    <p className="text-xs text-[#a1a1aa]">Appears at the bottom of video (CTA/closing)</p>
                  </div>
                  {selectedBottomTagline && (
                    <span className="badge badge-active text-xs">Selected</span>
                  )}
                </div>
                {bottomTaglines.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {bottomTaglines.map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedBottomTagline(tag)}
                        className={`p-3 rounded-xl text-left text-sm transition-all ${
                          selectedBottomTagline === tag
                            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                            : "glass-button hover:bg-[rgba(255,255,255,0.08)]"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#a1a1aa] text-sm">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Click Generate to create AI taglines
                  </div>
                )}
              </div>

              {/* Watermark */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Watermark</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-xs text-[#a1a1aa] mb-1">Watermark Text</label>
                    <input className="glass-input text-sm" placeholder="@yourhandle" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Position</label>
                    <select className="glass-select text-sm" value={watermarkPosition} onChange={(e) => setWatermarkPosition(e.target.value)}>
                      <option value="topleft">Top Left</option>
                      <option value="topright">Top Right</option>
                      <option value="bottomleft">Bottom Left</option>
                      <option value="bottomright">Bottom Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Font Size</label>
                    <input className="glass-input text-sm" type="number" placeholder="24" value={watermarkSize} onChange={(e) => setWatermarkSize(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="glass-card p-4">
                <p className="text-xs text-[#a1a1aa] mb-2">Preview</p>
                <div className={`relative w-full ${aspectRatio === "9:16" ? "h-72" : aspectRatio === "16:9" ? "h-40" : "h-56"} rounded-lg bg-[#1a1a2e] overflow-hidden`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-[rgba(255,255,255,0.1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  {selectedTopTagline && (
                    <div className="absolute top-3 left-0 right-0 text-center">
                      <span className="bg-black/60 text-white text-sm font-bold px-3 py-1 rounded-lg">
                        {selectedTopTagline}
                      </span>
                    </div>
                  )}
                  {selectedBottomTagline && (
                    <div className="absolute bottom-3 left-0 right-0 text-center">
                      <span className="bg-black/60 text-white text-sm font-bold px-3 py-1 rounded-lg">
                        {selectedBottomTagline}
                      </span>
                    </div>
                  )}
                  {watermarkText && (
                    <span className={`absolute text-white/50 text-xs ${watermarkPosition === "topleft" ? "top-2 left-2" : watermarkPosition === "topright" ? "top-2 right-2" : watermarkPosition === "bottomleft" ? "bottom-2 left-2" : "bottom-2 right-2"}`}>
                      {watermarkText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "social" && (
            <div className="space-y-5">
              {/* AI Generate Section */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Generate with AI</p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-[#a1a1aa] mb-1">AI Provider</label>
                      <select className="glass-select text-sm" value={socialSelectedAI} onChange={(e) => setSocialSelectedAI(e.target.value)}>
                        {aiProviders.length > 0 ? (
                          aiProviders.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))
                        ) : (
                          <option value="">No AI configured</option>
                        )}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={generateSocialContent}
                        disabled={socialGenerating || aiProviders.length === 0}
                        className="glass-button-primary text-sm h-[42px] px-6 whitespace-nowrap"
                      >
                        {socialGenerating ? (
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Generating...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Generate All
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Custom Prompt (optional)</label>
                    <textarea
                      className="glass-input text-xs min-h-[40px] resize-none"
                      placeholder="e.g., Generate engaging content for a fitness motivation video..."
                      value={socialPrompt}
                      onChange={(e) => setSocialPrompt(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Generated Titles */}
              {generatedTitles.length > 0 && (
                <div className="glass-card p-5">
                  <p className="text-sm font-medium mb-3">Generated Titles</p>
                  <div className="space-y-2">
                    {generatedTitles.map((title, i) => (
                      <button
                        key={i}
                        onClick={() => setCaption(title)}
                        className={`w-full p-3 rounded-xl text-left text-sm transition-all ${
                          caption === title
                            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                            : "glass-button"
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Descriptions */}
              {generatedDescriptions.length > 0 && (
                <div className="glass-card p-5">
                  <p className="text-sm font-medium mb-3">Generated Descriptions</p>
                  <div className="space-y-2">
                    {generatedDescriptions.map((desc, i) => (
                      <button
                        key={i}
                        onClick={() => setPostDescription(desc)}
                        className={`w-full p-3 rounded-xl text-left text-sm transition-all ${
                          postDescription === desc
                            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                            : "glass-button"
                        }`}
                      >
                        {desc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Hashtags */}
              {generatedHashtags.length > 0 && (
                <div className="glass-card p-5">
                  <p className="text-sm font-medium mb-3">Generated Hashtag Sets</p>
                  <div className="space-y-2">
                    {generatedHashtags.map((tagSet, i) => (
                      <button
                        key={i}
                        onClick={() => setHashtags(tagSet.join(", "))}
                        className={`w-full p-3 rounded-xl text-left text-sm transition-all ${
                          hashtags === tagSet.join(", ")
                            ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                            : "glass-button"
                        }`}
                      >
                        <div className="flex flex-wrap gap-1">
                          {tagSet.map((tag, j) => (
                            <span key={j} className="badge badge-active text-[10px]">{tag}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Default Content (Manual) */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Selected Content</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Caption / Title</label>
                    <textarea className="glass-input text-sm min-h-[60px] resize-none" placeholder="Write your post caption..." value={caption} onChange={(e) => setCaption(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Description</label>
                    <textarea className="glass-input text-sm min-h-[60px] resize-none" placeholder="Detailed description for the post..." value={postDescription} onChange={(e) => setPostDescription(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Hashtags (comma separated)</label>
                    <input className="glass-input text-sm" placeholder="#trending, #viral, #shorts" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Platform Specific */}
              {platforms.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3">Platform-Specific Content</p>
                  <div className="space-y-3">
                    {platforms.map((p) => (
                      <div key={p} className="glass-card p-4">
                        <p className="text-sm font-medium capitalize mb-3 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${p === "instagram" ? "bg-[#E1306C]" : p === "youtube" ? "bg-[#FF0000]" : p === "tiktok" ? "bg-white" : p === "facebook" ? "bg-[#1877F2]" : "bg-[#1DA1F2]"}`} />
                          {p}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-[#a1a1aa] mb-1">Caption</label>
                            <textarea className="glass-input text-xs min-h-[50px] resize-none" placeholder={caption || "Platform specific caption..."} value={perPlatformContent[p]?.caption || ""} onChange={(e) => updatePlatformContent(p, "caption", e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs text-[#a1a1aa] mb-1">Hashtags</label>
                            <input className="glass-input text-xs" placeholder={hashtags || "#platform"} value={perPlatformContent[p]?.hashtags || ""} onChange={(e) => updatePlatformContent(p, "hashtags", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {platforms.length === 0 && (
                <div className="glass-card p-6 text-center text-[#a1a1aa] text-sm">
                  Select platforms in the Publish tab to add platform-specific content
                </div>
              )}
            </div>
          )}

          {activeTab === "publish" && (
            <div className="space-y-5">
              {/* Auto Publish */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <label className="text-sm font-medium">Auto-Publish via Postforme</label>
                    <p className="text-xs text-[#a1a1aa]">Automatically publish to social media after processing</p>
                  </div>
                  <button onClick={() => setAutoPublish(!autoPublish)} className={`w-11 h-6 rounded-full transition-all ${autoPublish ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${autoPublish ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                  </button>
                </div>
              </div>

              {/* Platforms from Synced Accounts */}
              <div>
                <label className="block text-sm font-medium mb-3">Select Accounts to Publish</label>
                {syncedAccounts.length > 0 ? (
                  <div className="space-y-2">
                    {syncedAccounts.map((account) => (
                      <label key={account.id} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        platforms.includes(account.platform) ? "bg-gradient-to-r from-[#6366f1]/20 to-[#8b5cf6]/20 border border-[rgba(99,102,241,0.3)]" : "glass-button"
                      }`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={platforms.includes(account.platform)}
                            onChange={() => setPlatforms((prev) => prev.includes(account.platform) ? prev.filter((x) => x !== account.platform) : [...prev, account.platform])}
                            className="w-4 h-4 rounded accent-[#6366f1]"
                          />
                          <span className={`w-2 h-2 rounded-full ${
                            account.platform === "instagram" ? "bg-[#E1306C]" :
                            account.platform === "youtube" ? "bg-[#FF0000]" :
                            account.platform === "tiktok" ? "bg-white" :
                            account.platform === "facebook" ? "bg-[#1877F2]" :
                            "bg-[#1DA1F2]"
                          }`} />
                          <span className="text-sm font-medium capitalize">{account.platform}</span>
                          <span className="text-xs text-[#a1a1aa]">@{account.username}</span>
                        </div>
                        <span className={`badge text-[10px] ${account.connected ? "badge-success" : "badge-failed"}`}>
                          {account.connected ? "Active" : "Inactive"}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="glass-card p-4 text-center text-[#a1a1aa] text-sm">
                    No accounts synced. Go to <span className="text-[#6366f1]">Settings → Postforme API</span> and click "Sync Accounts"
                  </div>
                )}
              </div>

              {/* Scheduled Posting */}
              {autoPublish && (
                <div className="glass-card p-5">
                  <p className="text-sm font-medium mb-4">Scheduled Posting</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-[#a1a1aa] mb-1">When to Publish</label>
                      <select className="glass-select" value={publishSchedule} onChange={(e) => setPublishSchedule(e.target.value)}>
                        <option value="immediate">Post Immediately (after processing)</option>
                        <option value="delay">Delay After Processing</option>
                        <option value="specific">Schedule Specific Time & Date</option>
                      </select>
                    </div>

                    {publishSchedule === "delay" && (
                      <div>
                        <label className="block text-xs text-[#a1a1aa] mb-1">Delay Duration</label>
                        <select className="glass-select" value={publishDelay} onChange={(e) => setPublishDelay(e.target.value)}>
                          <option value="1">1 minute after processing</option>
                          <option value="5">5 minutes after processing</option>
                          <option value="10">10 minutes after processing</option>
                          <option value="15">15 minutes after processing</option>
                          <option value="30">30 minutes after processing</option>
                          <option value="60">1 hour after processing</option>
                          <option value="120">2 hours after processing</option>
                          <option value="360">6 hours after processing</option>
                          <option value="1440">24 hours after processing</option>
                        </select>
                      </div>
                    )}

                    {publishSchedule === "specific" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#a1a1aa] mb-1">Date</label>
                          <input type="date" className="glass-input text-sm" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-[#a1a1aa] mb-1">Time</label>
                          <input type="time" className="glass-input text-sm" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} />
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-[#a1a1aa] flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {publishSchedule === "immediate" && "Post will go live as soon as processing completes"}
                      {publishSchedule === "delay" && `Post will go live ${publishDelay} minute(s) after processing`}
                      {publishSchedule === "specific" && (publishDate && publishTime ? `Post scheduled for ${publishDate} at ${publishTime}` : "Select date and time above")}
                    </div>
                  </div>
                </div>
              )}

              {/* Output Settings */}
              <div className="glass-card p-5">
                <label className="text-sm font-medium mb-3 block">Output Settings</label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Format</label>
                    <select className="glass-select text-sm" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                      <option value="mp4">MP4</option>
                      <option value="mov">MOV</option>
                      <option value="webm">WebM</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Quality</label>
                    <select className="glass-select text-sm" value={outputQuality} onChange={(e) => setOutputQuality(e.target.value)}>
                      <option value="low">Low (fast)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High (best)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Resolution</label>
                    <select className="glass-select text-sm" value={outputResolution} onChange={(e) => setOutputResolution(e.target.value)}>
                      <option value="1080x1920">1080x1920 (Vertical)</option>
                      <option value="1920x1080">1920x1080 (Horizontal)</option>
                      <option value="1080x1080">1080x1080 (Square)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-3">Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-[#a1a1aa]">Name:</span><span>{name || "-"}</span>
                  <span className="text-[#a1a1aa]">Source:</span><span className="capitalize">{videoSource}</span>
                  <span className="text-[#a1a1aa]">Output:</span><span>{outputFormat.toUpperCase()} | {outputQuality} | {outputResolution}</span>
                  <span className="text-[#a1a1aa]">Platforms:</span><span>{platforms.length > 0 ? platforms.join(", ") : "-"}</span>
                  <span className="text-[#a1a1aa]">Auto-Publish:</span><span>{autoPublish ? "Yes (Postforme)" : "No"}</span>
                  <span className="text-[#a1a1aa]">Publish:</span><span className="capitalize">{publishSchedule === "immediate" ? "Immediately" : publishSchedule === "delay" ? `${publishDelay}min delay` : `${publishDate} ${publishTime}`}</span>
                  {selectedTopTagline && <><span className="text-[#a1a1aa]">Top:</span><span>{selectedTopTagline}</span></>}
                  {selectedBottomTagline && <><span className="text-[#a1a1aa]">Bottom:</span><span>{selectedBottomTagline}</span></>}
                  {caption && <><span className="text-[#a1a1aa]">Title:</span><span className="truncate">{caption}</span></>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 pt-4 border-t border-[rgba(255,255,255,0.08)]">
          <button
            onClick={() => {
              const idx = tabs.findIndex((t) => t.id === activeTab);
              if (idx > 0) setActiveTab(tabs[idx - 1].id);
            }}
            className={`glass-button text-sm ${activeTab === "basic" ? "opacity-30 pointer-events-none" : ""}`}
          >
            Previous
          </button>
          {activeTab !== "publish" ? (
            <button
              onClick={() => {
                const idx = tabs.findIndex((t) => t.id === activeTab);
                if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
              }}
              className="glass-button-primary text-sm"
            >
              Next
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating || !name || (!videoUrl && !channelUrl && !multipleUrls)} className="glass-button-primary text-sm">
              {creating ? "Saving..." : (editData ? "Update Automation" : "Create Automation")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== IMAGE MODAL ========== */
function ImageModal({ onClose, onCreated, editData }: { onClose: () => void; onCreated: () => void; editData?: Automation | null }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(editData?.name || "");
  const [imageSource, setImageSource] = useState<"url" | "placeholder">("url");
  const [imageUrl, setImageUrl] = useState("");
  const [placeholderText, setPlaceholderText] = useState("");
  const [bgColor, setBgColor] = useState("#000000");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState("48");
  const [width, setWidth] = useState("1080");
  const [height, setHeight] = useState("1080");
  const [watermarkText, setWatermarkText] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("once");
  const [creating, setCreating] = useState(false);

  const allPlatforms = ["instagram", "facebook", "x"];

  const handleCreate = async () => {
    setCreating(true);
    const config = {
      image_source: imageSource, image_url: imageUrl || null,
      placeholder_text: placeholderText || null,
      image_config: {
        width: parseInt(width), height: parseInt(height),
        background_color: bgColor, text_color: textColor,
        text_size: parseInt(textSize),
        watermark_text: watermarkText || null, watermark_position: "bottomright",
      },
      platforms,
    };
    try {
      const url = editData?.id ? `/api/automations/${editData.id}` : "/api/automations";
      const method = editData?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "image", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) onCreated();
      else alert("Failed: " + data.error);
    } catch { alert("Failed to save"); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-card p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">{editData ? "Edit Image Automation" : "Create Image Automation"}</h3>
          <button onClick={onClose} className="glass-button py-1 px-3 text-sm">Close</button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${s === step ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : s < step ? "bg-[#10b981] text-white" : "glass-button"}`}>{s}</div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? "bg-[#10b981]" : "bg-[rgba(255,255,255,0.1)]"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Basic Info & Source</h4>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Automation Name</label>
              <input className="glass-input" placeholder="e.g., Daily Quote" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setImageSource("url")} className={`px-4 py-2 rounded-xl text-sm font-medium ${imageSource === "url" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>Image URL</button>
              <button onClick={() => setImageSource("placeholder")} className={`px-4 py-2 rounded-xl text-sm font-medium ${imageSource === "placeholder" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>Text Placeholder</button>
            </div>
            {imageSource === "url" ? (
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-1">Image URL</label>
                <input className="glass-input" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-1">Placeholder Text</label>
                <textarea className="glass-input min-h-[80px] resize-none" placeholder="Enter text..." value={placeholderText} onChange={(e) => setPlaceholderText(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Image Configuration</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Width</label>
                <input className="glass-input text-sm" type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Height</label>
                <input className="glass-input text-sm" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Background Color</label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-9 rounded-lg border border-[rgba(255,255,255,0.1)] bg-transparent cursor-pointer" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                  <input className="glass-input text-sm flex-1" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Text Color</label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-9 rounded-lg border border-[rgba(255,255,255,0.1)] bg-transparent cursor-pointer" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                  <input className="glass-input text-sm flex-1" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Text Size</label>
                <input className="glass-input text-sm" type="number" value={textSize} onChange={(e) => setTextSize(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Watermark</label>
                <input className="glass-input text-sm" placeholder="@handle" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
              </div>
            </div>
            <div className="glass-card p-3">
              <p className="text-xs text-[#a1a1aa] mb-2">Preview</p>
              <div className="w-full h-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: bgColor }}>
                <p style={{ color: textColor, fontSize: `${Math.min(parseInt(textSize), 20)}px` }}>{placeholderText || "Your text here"}</p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Platforms & Schedule</h4>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-2">Target Platforms</label>
              <div className="flex flex-wrap gap-2">
                {allPlatforms.map((p) => (
                  <button key={p} onClick={() => setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${platforms.includes(p) ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Schedule</label>
              <select className="glass-select text-sm" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                <option value="once">Run Once</option>
                <option value="0 */6 * * *">Every 6 Hours</option>
                <option value="0 0 * * *">Daily</option>
                <option value="0 0 * * 0">Weekly</option>
              </select>
            </div>
            <div className="glass-card p-3 space-y-2">
              <div className="grid grid-cols-2 gap-1 text-xs"><span className="text-[#a1a1aa]">Name:</span><span>{name || "-"}</span><span className="text-[#a1a1aa]">Source:</span><span className="capitalize">{imageSource}</span><span className="text-[#a1a1aa]">Size:</span><span>{width}x{height}</span></div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} className={`glass-button text-sm ${step === 1 ? "opacity-30 pointer-events-none" : ""}`}>Previous</button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => Math.min(3, s + 1))} className="glass-button-primary text-sm">Next</button>
          ) : (
            <button onClick={handleCreate} disabled={creating || !name} className="glass-button-primary text-sm">{creating ? "Creating..." : "Create"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
