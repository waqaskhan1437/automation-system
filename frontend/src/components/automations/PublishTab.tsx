import { TabProps } from "./types";

export default function PublishTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Auto Publish Toggle */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div><p className="text-sm font-medium">Auto-Publish (Postforme)</p><p className="text-xs text-[#a1a1aa]">Post to social media automatically</p></div>
          <button onClick={() => onChange("auto_publish", !data.auto_publish)} className={`w-11 h-6 rounded-full transition-all ${data.auto_publish === true ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" : "bg-[rgba(255,255,255,0.1)]"}`}><div className={`w-5 h-5 rounded-full bg-white transition-transform ${data.auto_publish === true ? "translate-x-[22px]" : "translate-x-[2px]"}`} /></button>
        </div>
      </div>

      {/* Schedule Mode */}
      {data.auto_publish === true && (
        <div className="glass-card p-5">
          <p className="text-sm font-medium mb-3">Post Scheduling</p>
          <select className="glass-select" value={data.publish_mode as string || "immediate"} onChange={e => onChange("publish_mode", e.target.value)}>
            <option value="immediate">Post Immediately</option>
            <option value="delay">Delay After Processing</option>
            <option value="scheduled">Schedule Specific Date/Time</option>
          </select>

          {data.publish_mode === "delay" && (
            <div className="mt-3">
              <label className="block text-xs text-[#a1a1aa] mb-1">Delay (minutes)</label>
              <select className="glass-select text-sm" value={data.delay_minutes as string || "5"} onChange={e => onChange("delay_minutes", e.target.value)}>
                <option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option>
                <option value="30">30 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option>
                <option value="1440">24 hours</option>
              </select>
            </div>
          )}

          {data.publish_mode === "scheduled" && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div><label className="block text-xs text-[#a1a1aa] mb-1">Date</label><input className="glass-input text-sm" type="date" value={data.schedule_date as string || ""} onChange={e => onChange("schedule_date", e.target.value)} /></div>
              <div><label className="block text-xs text-[#a1a1aa] mb-1">Time</label><input className="glass-input text-sm" type="time" value={data.schedule_time as string || ""} onChange={e => onChange("schedule_time", e.target.value)} /></div>
            </div>
          )}
        </div>
      )}

      {/* Output Settings */}
      <div className="glass-card p-5">
        <p className="text-sm font-medium mb-3">Output Settings</p>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs text-[#a1a1aa] mb-1">Format</label>
            <select className="glass-select text-sm" value={data.output_format as string || "mp4"} onChange={e => onChange("output_format", e.target.value)}>
              <option value="mp4">MP4</option><option value="mov">MOV</option><option value="webm">WebM</option>
            </select>
          </div>
          <div><label className="block text-xs text-[#a1a1aa] mb-1">Quality</label>
            <select className="glass-select text-sm" value={data.output_quality as string || "high"} onChange={e => onChange("output_quality", e.target.value)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div><label className="block text-xs text-[#a1a1aa] mb-1">Resolution</label>
            <select className="glass-select text-sm" value={data.output_resolution as string || "1080x1920"} onChange={e => onChange("output_resolution", e.target.value)}>
              <option value="1080x1920">1080x1920</option><option value="1920x1080">1920x1080</option><option value="1080x1080">1080x1080</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="glass-card p-4">
        <p className="text-sm font-medium mb-2">Summary</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="text-[#a1a1aa]">Source:</span><span className="capitalize">{data.video_source as string || "-"}</span>
          <span className="text-[#a1a1aa]">Duration:</span><span>{data.short_duration as string || "60"} sec</span>
          <span className="text-[#a1a1aa]">Ratio:</span><span>{data.aspect_ratio as string || "9:16"}</span>
          <span className="text-[#a1a1aa]">Publish:</span><span>{data.auto_publish === true ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
