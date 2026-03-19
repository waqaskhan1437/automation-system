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
  const [activeTab, setActiveTab] = useState<"basic" | "video" | "taglines" | "social" | "publish">("basic");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [videoSource, setVideoSource] = useState<"direct" | "youtube" | "bunny">("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");
  const [resize, setResize] = useState("");
  const [fps, setFps] = useState("");
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
  const [schedule, setSchedule] = useState("once");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const allPlatforms = ["instagram", "youtube", "tiktok", "facebook", "x"];

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
      ffmpeg_config: {
        trim_start: trimStart || null,
        trim_end: trimEnd || null,
        resize: resize || null,
        fps: fps ? parseInt(fps) : null,
        codec,
        audio_codec: audioCodec,
        watermark_text: watermarkText || null,
        watermark_position: watermarkPosition,
        overlay_text: overlayText || null,
        overlay_position: overlayPosition,
      },
      taglines: {
        watermark: { text: watermarkText, position: watermarkPosition, size: parseInt(watermarkSize) },
        overlay: { text: overlayText, position: overlayPosition, size: parseInt(overlaySize) },
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
      <div className="glass-card max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="text-xl font-bold">Create Video Automation</h3>
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
                <p className="text-xs text-[#a1a1aa] mt-1.5">
                  {videoSource === "youtube" && "Fetch latest video from YouTube channel or paste specific video links"}
                  {videoSource === "direct" && "Provide direct .mp4 video links"}
                  {videoSource === "bunny" && "Fetch video from Bunny CDN library"}
                </p>
              </div>

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
              <div className="glass-card p-4 mb-2">
                <p className="text-xs text-[#a1a1aa]">
                  Video source: <span className="text-white font-medium capitalize">{videoSource}</span> (configured in Basic tab)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Video URL</label>
                <input
                  className="glass-input"
                  placeholder={videoSource === "youtube" ? "https://youtube.com/watch?v=..." : videoSource === "bunny" ? "https://iframe.mediadelivery.net/..." : "https://example.com/video.mp4"}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
              </div>

              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-sm font-medium mb-3">FFmpeg Processing</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Trim Start</label>
                    <input className="glass-input text-sm" placeholder="00:00:05" value={trimStart} onChange={(e) => setTrimStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Trim End</label>
                    <input className="glass-input text-sm" placeholder="00:01:00" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Resize (W:H)</label>
                    <input className="glass-input text-sm" placeholder="1080:1920" value={resize} onChange={(e) => setResize(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">FPS</label>
                    <input className="glass-input text-sm" type="number" placeholder="30" value={fps} onChange={(e) => setFps(e.target.value)} />
                  </div>
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
                      <option value="copy">Copy (no re-encode)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "taglines" && (
            <div className="space-y-5">
              {/* Watermark Section */}
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
                      <option value="center">Center</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Font Size</label>
                    <input className="glass-input text-sm" type="number" placeholder="24" value={watermarkSize} onChange={(e) => setWatermarkSize(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Overlay Text Section */}
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Overlay Text</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-xs text-[#a1a1aa] mb-1">Overlay Text</label>
                    <input className="glass-input text-sm" placeholder="Subscribe for more!" value={overlayText} onChange={(e) => setOverlayText(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Position</label>
                    <select className="glass-select text-sm" value={overlayPosition} onChange={(e) => setOverlayPosition(e.target.value)}>
                      <option value="topleft">Top Left</option>
                      <option value="topright">Top Right</option>
                      <option value="bottomleft">Bottom Left</option>
                      <option value="bottomright">Bottom Right</option>
                      <option value="center">Center</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Font Size</label>
                    <input className="glass-input text-sm" type="number" placeholder="48" value={overlaySize} onChange={(e) => setOverlaySize(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="glass-card p-4">
                <p className="text-xs text-[#a1a1aa] mb-2">Preview</p>
                <div className="relative w-full h-48 rounded-lg bg-[#1a1a2e] overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-[rgba(255,255,255,0.1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  {watermarkText && (
                    <span className={`absolute text-white/50 text-xs ${watermarkPosition === "topleft" ? "top-2 left-2" : watermarkPosition === "topright" ? "top-2 right-2" : watermarkPosition === "bottomleft" ? "bottom-2 left-2" : watermarkPosition === "center" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "bottom-2 right-2"}`}>
                      {watermarkText}
                    </span>
                  )}
                  {overlayText && (
                    <span className={`absolute text-white text-sm font-bold ${overlayPosition === "topleft" ? "top-6 left-2" : overlayPosition === "topright" ? "top-6 right-2" : overlayPosition === "bottomleft" ? "bottom-6 left-2" : overlayPosition === "bottomright" ? "bottom-6 right-2" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"}`}>
                      {overlayText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "social" && (
            <div className="space-y-5">
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4">Default Content (applies to all platforms)</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Caption</label>
                    <textarea className="glass-input text-sm min-h-[60px] resize-none" placeholder="Write your post caption..." value={caption} onChange={(e) => setCaption(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Hashtags (comma separated)</label>
                    <input className="glass-input text-sm" placeholder="#trending, #viral, #shorts" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Description</label>
                    <textarea className="glass-input text-sm min-h-[60px] resize-none" placeholder="Detailed description for the post..." value={postDescription} onChange={(e) => setPostDescription(e.target.value)} />
                  </div>
                </div>
              </div>

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
              <div>
                <label className="block text-sm font-medium mb-3">Target Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {allPlatforms.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                        platforms.includes(p) ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p === "instagram" ? "bg-[#E1306C]" : p === "youtube" ? "bg-[#FF0000]" : p === "tiktok" ? "bg-white" : p === "facebook" ? "bg-[#1877F2]" : "bg-[#1DA1F2]"}`} />
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <label className="block text-sm font-medium mb-3">Output Settings</label>
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

              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-xs text-[#a1a1aa]">
                  Schedule: <span className="text-white font-medium capitalize">{schedule === "once" ? "Manual" : schedule}</span> (configured in Basic tab)
                </p>
              </div>

              {/* Review Summary */}
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
                <p className="text-sm font-medium mb-3">Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-[#a1a1aa]">Name:</span><span>{name || "-"}</span>
                  <span className="text-[#a1a1aa]">Source:</span><span className="capitalize">{videoSource}</span>
                  <span className="text-[#a1a1aa]">Output:</span><span>{outputFormat.toUpperCase()} | {outputQuality} | {outputResolution}</span>
                  <span className="text-[#a1a1aa]">Platforms:</span><span>{platforms.length > 0 ? platforms.join(", ") : "-"}</span>
                  {watermarkText && <><span className="text-[#a1a1aa]">Watermark:</span><span>{watermarkText}</span></>}
                  {overlayText && <><span className="text-[#a1a1aa]">Overlay:</span><span>{overlayText}</span></>}
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
            <button onClick={handleCreate} disabled={creating || !name || !videoUrl} className="glass-button-primary text-sm">
              {creating ? "Creating..." : "Create Automation"}
            </button>
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
