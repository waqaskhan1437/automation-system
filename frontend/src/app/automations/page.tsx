"use client";
import { useState, useEffect } from "react";

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

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "image">("all");
  const [modalType, setModalType] = useState<"video" | "image" | null>(null);

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

  const handleAction = async (id: number, action: "run" | "pause" | "resume" | "delete") => {
    try {
      if (action === "delete") {
        await fetch(`/api/automations/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/automations/${id}/${action}`, { method: "POST" });
      }
      fetchAutomations();
    } catch (err) {
      console.error("Action failed");
    }
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
                {auto.status === "active" && (
                  <button onClick={() => handleAction(auto.id, "run")} className="glass-button-primary text-sm py-2 px-4">
                    Run Now
                  </button>
                )}
                {auto.status === "active" ? (
                  <button onClick={() => handleAction(auto.id, "pause")} className="glass-button text-sm py-2 px-4">
                    Pause
                  </button>
                ) : (
                  <button onClick={() => handleAction(auto.id, "resume")} className="glass-button text-sm py-2 px-4">
                    Resume
                  </button>
                )}
                <button onClick={() => handleAction(auto.id, "delete")} className="glass-button text-sm py-2 px-4 text-[#ef4444]">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalType === "video" && (
        <VideoModal onClose={() => setModalType(null)} onCreated={() => { setModalType(null); fetchAutomations(); }} />
      )}
      {modalType === "image" && (
        <ImageModal onClose={() => setModalType(null)} onCreated={() => { setModalType(null); fetchAutomations(); }} />
      )}
    </div>
  );
}

/* ========== VIDEO MODAL ========== */
function VideoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [videoSource, setVideoSource] = useState<"direct" | "youtube" | "bunny">("direct");
  const [videoUrl, setVideoUrl] = useState("");
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [outputQuality, setOutputQuality] = useState("high");
  const [outputResolution, setOutputResolution] = useState("1080x1920");
  const [schedule, setSchedule] = useState("once");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [ffmpeg, setFfmpeg] = useState<FFmpegConfig>({
    trim_start: "", trim_end: "", resize: "",
    watermark_text: "", watermark_position: "bottomright",
    overlay_text: "", overlay_position: "center",
    fps: "", codec: "libx264", audio_codec: "aac", custom_args: "",
  });
  const [creating, setCreating] = useState(false);

  const allPlatforms = ["instagram", "youtube", "tiktok", "facebook", "x"];

  const updateFfmpeg = (key: keyof FFmpegConfig, value: string) => {
    setFfmpeg((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setCreating(true);
    const config = {
      video_source: videoSource, video_url: videoUrl,
      ffmpeg_config: ffmpeg, output_format: outputFormat,
      output_quality: outputQuality, output_resolution: outputResolution, platforms,
    };
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "video", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) onCreated();
      else alert("Failed: " + data.error);
    } catch { alert("Failed to create"); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Create Video Automation</h3>
          <button onClick={onClose} className="glass-button py-1 px-3 text-sm">Close</button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${s === step ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : s < step ? "bg-[#10b981] text-white" : "glass-button"}`}>{s}</div>
              {s < 5 && <div className={`w-8 h-0.5 ${s < step ? "bg-[#10b981]" : "bg-[rgba(255,255,255,0.1)]"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Basic Info</h4>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Automation Name</label>
              <input className="glass-input" placeholder="e.g., Daily YouTube Shorts" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Video Source</h4>
            <div className="flex gap-2">
              {(["direct", "youtube", "bunny"] as const).map((src) => (
                <button key={src} onClick={() => setVideoSource(src)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${videoSource === src ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}>
                  {src === "direct" ? "Direct URL" : src === "youtube" ? "YouTube" : "Bunny CDN"}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-1">Video URL</label>
              <input className="glass-input" placeholder={videoSource === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/video.mp4"} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h4 className="font-semibold">FFmpeg Configuration</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Trim Start</label>
                <input className="glass-input text-sm" placeholder="00:00:05" value={ffmpeg.trim_start} onChange={(e) => updateFfmpeg("trim_start", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Trim End</label>
                <input className="glass-input text-sm" placeholder="00:01:00" value={ffmpeg.trim_end} onChange={(e) => updateFfmpeg("trim_end", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Resize</label>
                <input className="glass-input text-sm" placeholder="1080:1920" value={ffmpeg.resize} onChange={(e) => updateFfmpeg("resize", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">FPS</label>
                <input className="glass-input text-sm" type="number" placeholder="30" value={ffmpeg.fps} onChange={(e) => updateFfmpeg("fps", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Watermark Text</label>
                <input className="glass-input text-sm" placeholder="@yourhandle" value={ffmpeg.watermark_text} onChange={(e) => updateFfmpeg("watermark_text", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Overlay Text</label>
                <input className="glass-input text-sm" placeholder="Text on video" value={ffmpeg.overlay_text} onChange={(e) => updateFfmpeg("overlay_text", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Video Codec</label>
                <select className="glass-select text-sm" value={ffmpeg.codec} onChange={(e) => updateFfmpeg("codec", e.target.value)}>
                  <option value="libx264">H.264</option>
                  <option value="libx265">H.265/HEVC</option>
                  <option value="libvpx-vp9">VP9</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Audio Codec</label>
                <select className="glass-select text-sm" value={ffmpeg.audio_codec} onChange={(e) => updateFfmpeg("audio_codec", e.target.value)}>
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="copy">Copy</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Output & Platforms</h4>
            <div className="grid grid-cols-3 gap-3">
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
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Resolution</label>
                <select className="glass-select text-sm" value={outputResolution} onChange={(e) => setOutputResolution(e.target.value)}>
                  <option value="1080x1920">1080x1920</option>
                  <option value="1920x1080">1920x1080</option>
                  <option value="1080x1080">1080x1080</option>
                </select>
              </div>
            </div>
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
                <option value="once">Run Once (Manual)</option>
                <option value="0 */6 * * *">Every 6 Hours</option>
                <option value="0 0 * * *">Daily</option>
                <option value="0 0 * * 0">Weekly</option>
              </select>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Review</h4>
            <div className="glass-card p-3"><p className="text-xs text-[#a1a1aa]">Name</p><p className="text-sm font-medium">{name || "-"}</p></div>
            <div className="glass-card p-3"><p className="text-xs text-[#a1a1aa]">Source</p><p className="text-sm font-medium capitalize">{videoSource} - {videoUrl || "-"}</p></div>
            <div className="glass-card p-3"><p className="text-xs text-[#a1a1aa]">Output</p><p className="text-sm font-medium">{outputFormat.toUpperCase()} | {outputQuality} | {outputResolution}</p></div>
            <div className="glass-card p-3"><p className="text-xs text-[#a1a1aa]">Platforms</p><div className="flex gap-1 mt-1">{platforms.map((p) => <span key={p} className="badge badge-active text-xs capitalize">{p}</span>)}</div></div>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} className={`glass-button text-sm ${step === 1 ? "opacity-30 pointer-events-none" : ""}`}>Previous</button>
          {step < 5 ? (
            <button onClick={() => setStep((s) => Math.min(5, s + 1))} className="glass-button-primary text-sm">Next</button>
          ) : (
            <button onClick={handleCreate} disabled={creating || !name} className="glass-button-primary text-sm">{creating ? "Creating..." : "Create"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== IMAGE MODAL ========== */
function ImageModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
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
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "image", config: JSON.stringify(config), schedule: schedule === "once" ? null : schedule }),
      });
      const data = await res.json();
      if (data.success) onCreated();
      else alert("Failed: " + data.error);
    } catch { alert("Failed to create"); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-card p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Create Image Automation</h3>
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
