import { TabProps } from "./types";

export default function VideoTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Video Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Select videos by</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={(data.video_selection as string || "days") === "days"} onChange={() => onChange("video_selection", "days")} className="accent-[#6366f1]" />
            <span>Last X Days</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={data.video_selection === "date_range"} onChange={() => onChange("video_selection", "date_range")} className="accent-[#6366f1]" />
            <span>Date Range</span>
          </label>
        </div>
      </div>

      {data.video_selection === "days" && (
        <div>
          <label className="block text-sm font-medium mb-1">Fetch from last (days)</label>
          <select className="glass-select" value={data.video_days as string || "7"} onChange={e => onChange("video_days", e.target.value)}>
            <option value="1">1 Day</option><option value="3">3 Days</option><option value="7">7 Days</option>
            <option value="14">14 Days</option><option value="30">30 Days</option>
          </select>
        </div>
      )}

      {data.video_selection === "date_range" && (
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">From</label><input className="glass-input" type="date" value={data.date_from as string || ""} onChange={e => onChange("date_from", e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">To</label><input className="glass-input" type="date" value={data.date_to as string || ""} onChange={e => onChange("date_to", e.target.value)} /></div>
        </div>
      )}

      {/* Videos Per Run */}
      <div>
        <label className="block text-sm font-medium mb-1">Videos Per Run</label>
        <select className="glass-select" value={data.videos_per_run as string || "1"} onChange={e => onChange("videos_per_run", e.target.value)}>
          <option value="1">1 Video</option><option value="3">3 Videos</option><option value="5">5 Videos</option><option value="10">10 Videos</option>
        </select>
      </div>

      {/* Short Settings */}
      <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
        <p className="text-sm font-medium mb-3">Short Video Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Duration (seconds)</label>
            <select className="glass-select text-sm" value={data.short_duration as string || "60"} onChange={e => onChange("short_duration", e.target.value)}>
              <option value="15">15 sec</option><option value="30">30 sec</option><option value="45">45 sec</option>
              <option value="60">60 sec</option><option value="90">90 sec</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Playback Speed</label>
            <select className="glass-select text-sm" value={data.playback_speed as string || "1.0"} onChange={e => onChange("playback_speed", e.target.value)}>
              <option value="0.5">0.5x (Slow)</option><option value="0.75">0.75x</option>
              <option value="1.0">1x (Normal)</option><option value="1.25">1.25x</option><option value="1.5">1.5x (Fast)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="block text-sm font-medium mb-2">Aspect Ratio</label>
        <select className="glass-select" value={data.aspect_ratio as string || "9:16"} onChange={e => onChange("aspect_ratio", e.target.value)}>
          <optgroup label="Crop (Fill Frame)">
            <option value="9:16">9:16 Vertical</option><option value="1:1">1:1 Square</option><option value="16:9">16:9 Horizontal</option>
          </optgroup>
          <optgroup label="No Crop (Black Bars)">
            <option value="9:16-fit">9:16 Fit</option><option value="1:1-fit">1:1 Fit</option><option value="16:9-fit">16:9 Fit</option>
          </optgroup>
        </select>
      </div>

      {/* Split Long Video */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div><label className="text-sm font-medium">Split Long Video</label><p className="text-xs text-[#a1a1aa]">Split into multiple shorts</p></div>
          <button onClick={() => onChange("split_enabled", !data.split_enabled)} className={`w-11 h-6 rounded-full transition-all ${data.split_enabled ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}><div className={`w-5 h-5 rounded-full bg-white transition-transform ${data.split_enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} /></button>
        </div>
        {data.split_enabled === true && (
          <div className="mt-3">
            <label className="block text-xs text-[#a1a1aa] mb-1">Chunk size (seconds)</label>
            <select className="glass-select text-sm" value={data.split_duration as string || "30"} onChange={e => onChange("split_duration", e.target.value)}>
              <option value="15">15 sec</option><option value="30">30 sec</option><option value="60">60 sec</option>
            </select>
          </div>
        )}
      </div>

      {/* Combine Videos */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div><label className="text-sm font-medium">Combine Videos</label><p className="text-xs text-[#a1a1aa]">Merge X videos into 1 short</p></div>
          <button onClick={() => onChange("combine_enabled", !data.combine_enabled)} className={`w-11 h-6 rounded-full transition-all ${data.combine_enabled ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}><div className={`w-5 h-5 rounded-full bg-white transition-transform ${data.combine_enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} /></button>
        </div>
        {data.combine_enabled === true && (
          <div className="mt-3">
            <label className="block text-xs text-[#a1a1aa] mb-1">Videos to combine</label>
            <select className="glass-select text-sm" value={data.combine_count as string || "3"} onChange={e => onChange("combine_count", e.target.value)}>
              <option value="2">2 Videos</option><option value="3">3 Videos</option><option value="5">5 Videos</option>
            </select>
          </div>
        )}
      </div>

      {/* Rotation */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div><label className="text-sm font-medium">Smart Video Rotation</label><p className="text-xs text-[#a1a1aa]">No repeats until all videos used</p></div>
          <button onClick={() => onChange("rotation_enabled", !data.rotation_enabled)} className={`w-11 h-6 rounded-full transition-all ${data.rotation_enabled !== false ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}><div className={`w-5 h-5 rounded-full bg-white transition-transform ${data.rotation_enabled !== false ? "translate-x-[22px]" : "translate-x-[2px]"}`} /></button>
        </div>
      </div>
    </div>
  );
}
