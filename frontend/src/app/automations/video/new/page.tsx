"use client";
import { useState } from "react";

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

export default function CreateVideoAutomation() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [videoSource, setVideoSource] = useState<"direct" | "youtube" | "bunny">("direct");
  const [videoUrl, setVideoUrl] = useState("");
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [outputQuality, setOutputQuality] = useState("high");
  const [outputResolution, setOutputResolution] = useState("1080x1920");
  const [schedule, setSchedule] = useState("once");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [ffmpeg, setFfmpeg] = useState<FFmpegConfig>({
    trim_start: "",
    trim_end: "",
    resize: "",
    watermark_text: "",
    watermark_position: "bottomright",
    overlay_text: "",
    overlay_position: "center",
    fps: "",
    codec: "libx264",
    audio_codec: "aac",
    custom_args: "",
  });
  const [creating, setCreating] = useState(false);

  const allPlatforms = ["instagram", "youtube", "tiktok", "facebook", "x"];

  const updateFfmpeg = (key: keyof FFmpegConfig, value: string) => {
    setFfmpeg((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setCreating(true);
    const config = {
      video_source: videoSource,
      video_url: videoUrl,
      ffmpeg_config: ffmpeg,
      output_format: outputFormat,
      output_quality: outputQuality,
      output_resolution: outputResolution,
      platforms,
    };

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "video",
          config: JSON.stringify(config),
          schedule: schedule === "once" ? null : schedule,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Video automation created!");
        window.location.href = "/automations";
      } else {
        alert("Failed: " + data.error);
      }
    } catch (err) {
      alert("Failed to create automation");
    }
    setCreating(false);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Create Video Automation</h2>
        <p className="text-[#a1a1aa] mt-1">Set up your video processing pipeline</p>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                s === step
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                  : s < step
                  ? "bg-[#10b981] text-white"
                  : "glass-button"
              }`}
            >
              {s}
            </div>
            {s < 5 && (
              <div className={`w-12 h-0.5 ${s < step ? "bg-[#10b981]" : "bg-[rgba(255,255,255,0.1)]"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="glass-card p-8">
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Basic Info</h3>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Automation Name</label>
              <input className="glass-input" placeholder="e.g., Daily YouTube Shorts" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Description (optional)</label>
              <input className="glass-input" placeholder="What does this automation do?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Video Source</h3>
            <div className="flex gap-3">
              {(["direct", "youtube", "bunny"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => setVideoSource(src)}
                  className={`px-5 py-3 rounded-xl text-sm font-medium capitalize ${
                    videoSource === src
                      ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                      : "glass-button"
                  }`}
                >
                  {src === "direct" ? "Direct URL" : src === "youtube" ? "YouTube" : "Bunny CDN"}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">
                {videoSource === "youtube" ? "YouTube Video URL" : videoSource === "bunny" ? "Bunny CDN Video URL" : "Direct Video URL"}
              </label>
              <input
                className="glass-input"
                placeholder={videoSource === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/video.mp4"}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">FFmpeg Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Trim Start</label>
                <input className="glass-input" placeholder="00:00:05" value={ffmpeg.trim_start} onChange={(e) => updateFfmpeg("trim_start", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Trim End</label>
                <input className="glass-input" placeholder="00:01:00" value={ffmpeg.trim_end} onChange={(e) => updateFfmpeg("trim_end", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Resize</label>
                <input className="glass-input" placeholder="1080:1920" value={ffmpeg.resize} onChange={(e) => updateFfmpeg("resize", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">FPS</label>
                <input className="glass-input" type="number" placeholder="30" value={ffmpeg.fps} onChange={(e) => updateFfmpeg("fps", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Watermark Text</label>
                <input className="glass-input" placeholder="@yourhandle" value={ffmpeg.watermark_text} onChange={(e) => updateFfmpeg("watermark_text", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Watermark Position</label>
                <select className="glass-select" value={ffmpeg.watermark_position} onChange={(e) => updateFfmpeg("watermark_position", e.target.value)}>
                  <option value="topleft">Top Left</option>
                  <option value="topright">Top Right</option>
                  <option value="bottomleft">Bottom Left</option>
                  <option value="bottomright">Bottom Right</option>
                  <option value="center">Center</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Overlay Text</label>
                <input className="glass-input" placeholder="Text on video" value={ffmpeg.overlay_text} onChange={(e) => updateFfmpeg("overlay_text", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Overlay Position</label>
                <select className="glass-select" value={ffmpeg.overlay_position} onChange={(e) => updateFfmpeg("overlay_position", e.target.value)}>
                  <option value="topleft">Top Left</option>
                  <option value="topright">Top Right</option>
                  <option value="bottomleft">Bottom Left</option>
                  <option value="bottomright">Bottom Right</option>
                  <option value="center">Center</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Video Codec</label>
                <select className="glass-select" value={ffmpeg.codec} onChange={(e) => updateFfmpeg("codec", e.target.value)}>
                  <option value="libx264">H.264</option>
                  <option value="libx265">H.265/HEVC</option>
                  <option value="libvpx-vp9">VP9</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Audio Codec</label>
                <select className="glass-select" value={ffmpeg.audio_codec} onChange={(e) => updateFfmpeg("audio_codec", e.target.value)}>
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="copy">Copy (no re-encode)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Custom FFmpeg Args</label>
              <input className="glass-input" placeholder="-crf 23 -preset medium" value={ffmpeg.custom_args} onChange={(e) => updateFfmpeg("custom_args", e.target.value)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Output Settings</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Format</label>
                <select className="glass-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                  <option value="webm">WebM</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Quality</label>
                <select className="glass-select" value={outputQuality} onChange={(e) => setOutputQuality(e.target.value)}>
                  <option value="low">Low (fast)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (best)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#a1a1aa] mb-2">Resolution</label>
                <select className="glass-select" value={outputResolution} onChange={(e) => setOutputResolution(e.target.value)}>
                  <option value="1080x1920">1080x1920 (Vertical/Shorts)</option>
                  <option value="1920x1080">1920x1080 (Horizontal)</option>
                  <option value="1080x1080">1080x1080 (Square)</option>
                  <option value="720x1280">720x1280 (720p Vertical)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-3">Target Platforms</label>
              <div className="flex flex-wrap gap-3">
                {allPlatforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
                      platforms.includes(p) ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#a1a1aa] mb-2">Schedule</label>
              <select className="glass-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                <option value="once">Run Once (Manual)</option>
                <option value="0 */6 * * *">Every 6 Hours</option>
                <option value="0 0 * * *">Daily</option>
                <option value="0 0 * * 0">Weekly</option>
              </select>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">Review & Create</h3>
            <div className="space-y-4">
              <div className="glass-card p-4">
                <p className="text-sm text-[#a1a1aa]">Name</p>
                <p className="font-medium">{name || "-"}</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-sm text-[#a1a1aa]">Source</p>
                <p className="font-medium capitalize">{videoSource} - {videoUrl || "-"}</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-sm text-[#a1a1aa]">Output</p>
                <p className="font-medium">{outputFormat.toUpperCase()} | {outputQuality} | {outputResolution}</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-sm text-[#a1a1aa]">Platforms</p>
                <div className="flex gap-2 mt-1">
                  {platforms.map((p) => (
                    <span key={p} className="badge badge-active capitalize">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className={`glass-button ${step === 1 ? "opacity-30 pointer-events-none" : ""}`}
          >
            Previous
          </button>
          {step < 5 ? (
            <button onClick={() => setStep((s) => Math.min(5, s + 1))} className="glass-button-primary">
              Next
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating} className="glass-button-primary">
              {creating ? "Creating..." : "Create Automation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
