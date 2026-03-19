import { TabProps } from "./types";

export default function BasicTab({ data, onChange }: TabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Automation Name *</label>
        <input className="glass-input" value={data.name as string || ""} onChange={e => onChange("name", e.target.value)} placeholder="e.g., Daily YouTube Shorts" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Video Source *</label>
        <select className="glass-select" value={data.video_source as string || "youtube_channel"} onChange={e => onChange("video_source", e.target.value)}>
          <option value="youtube_channel">YouTube Channel</option>
          <option value="manual_links">Direct Video Links</option>
          <option value="bunny">Bunny CDN</option>
        </select>
      </div>

      {data.video_source === "youtube_channel" && (
        <div>
          <label className="block text-sm font-medium mb-1">YouTube Channel URL</label>
          <input className="glass-input" value={data.youtube_channel_url as string || ""} onChange={e => onChange("youtube_channel_url", e.target.value)} placeholder="https://www.youtube.com/@channel" />
        </div>
      )}

      {data.video_source === "manual_links" && (
        <div>
          <label className="block text-sm font-medium mb-1">Video URLs (one per line)</label>
          <textarea className="glass-input min-h-[80px]" value={data.manual_links as string || ""} onChange={e => onChange("manual_links", e.target.value)} placeholder={"https://example.com/video1.mp4\nhttps://example.com/video2.mp4"} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={data.schedule_type as string || "daily"} onChange={e => onChange("schedule_type", e.target.value)}>
          <option value="minutes">Every X Minutes</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {data.schedule_type === "minutes" && (
        <div>
          <label className="block text-sm font-medium mb-1">Every (minutes)</label>
          <input className="glass-input" type="number" value={data.schedule_minutes as string || "30"} onChange={e => onChange("schedule_minutes", e.target.value)} min="5" max="1440" />
        </div>
      )}

      {(data.schedule_type === "daily" || data.schedule_type === "hourly") && (
        <div>
          <label className="block text-sm font-medium mb-1">Hour (0-23)</label>
          <input className="glass-input" type="number" value={data.schedule_hour as string || "9"} onChange={e => onChange("schedule_hour", e.target.value)} min="0" max="23" />
        </div>
      )}
    </div>
  );
}
