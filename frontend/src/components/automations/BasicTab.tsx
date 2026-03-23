import { useEffect } from "react";
import { TabProps } from "./types";

const weekdayOptions = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  const hour12 = hours % 12 || 12;
  const meridiem = hours < 12 ? "AM" : "PM";
  return {
    value: `${String(hours).padStart(2, "0")}:${minutes}`,
    label: `${hour12}:${minutes} ${meridiem}`,
  };
});

function getWeekdays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(weekdayOptions.map((option) => option.value));
  return value.filter((item): item is string => typeof item === "string" && allowed.has(item));
}

export default function BasicTab({ data, onChange }: TabProps) {
  const scheduleType = typeof data.schedule_type === "string" ? data.schedule_type : "manual";
  const weeklyDays = getWeekdays(data.schedule_weekdays);

  useEffect(() => {
    if ((scheduleType === "daily" || scheduleType === "weekly") && (typeof data.schedule_timezone !== "string" || !data.schedule_timezone)) {
      try {
        onChange("schedule_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      } catch {
        onChange("schedule_timezone", "UTC");
      }
    }
  }, [data.schedule_timezone, onChange, scheduleType]);

  useEffect(() => {
    if (scheduleType === "minutes" && !data.schedule_minutes) {
      onChange("schedule_minutes", "30");
    }
    if (scheduleType === "hourly" && !data.schedule_hours) {
      onChange("schedule_hours", "1");
    }
    if ((scheduleType === "daily" || scheduleType === "weekly") && !data.schedule_run_time) {
      onChange("schedule_run_time", "13:00");
    }
    if (scheduleType === "weekly" && weeklyDays.length === 0) {
      onChange("schedule_weekdays", ["sunday"]);
    }
  }, [data.schedule_hours, data.schedule_minutes, data.schedule_run_time, onChange, scheduleType, weeklyDays.length]);

  const handleScheduleTypeChange = (value: string) => {
    onChange("schedule_type", value);

    if (value === "minutes" && !data.schedule_minutes) {
      onChange("schedule_minutes", "30");
    }
    if (value === "hourly" && !data.schedule_hours) {
      onChange("schedule_hours", "1");
    }
    if ((value === "daily" || value === "weekly") && !data.schedule_run_time) {
      onChange("schedule_run_time", "13:00");
    }
    if (value === "weekly" && weeklyDays.length === 0) {
      onChange("schedule_weekdays", ["sunday"]);
    }
  };

  const toggleWeekday = (day: string) => {
    const nextDays = weeklyDays.includes(day)
      ? weeklyDays.filter((item) => item !== day)
      : weekdayOptions.map((option) => option.value).filter((value) => weeklyDays.includes(value) || value === day);

    onChange("schedule_weekdays", nextDays);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Video Source *</label>
        <select className="glass-select" value={data.video_source as string || "youtube"} onChange={e => {
          onChange("video_source", e.target.value);
          // Clear fields on source change
          onChange("video_url", "");
          onChange("youtube_channel_url", "");
          onChange("manual_links", "");
        }}>
          <option value="youtube">📹 Single YouTube Video</option>
          <option value="youtube_channel">📺 YouTube Channel</option>
          <option value="google_photos">🖼️ Google Photos</option>
          <option value="manual_links">🔗 Multiple Video Links</option>
        </select>
      </div>

      {/* SINGLE YOUTUBE VIDEO */}
      {(data.video_source === "youtube" || !data.video_source) && (
        <div>
          <label className="block text-sm font-medium mb-1">YouTube Video URL</label>
          <input
            type="url"
            className="glass-input"
            value={data.video_url as string || ""}
            onChange={e => onChange("video_url", e.target.value)}
            placeholder="https://www.youtube.com/watch?v=abc123"
          />
          <p className="text-xs text-[#a1a1aa] mt-1">Ek YouTube video ka link — Short, long ya Shorts sab kaam karey ga.</p>
        </div>
      )}

      {/* YOUTUBE CHANNEL */}
      {data.video_source === "youtube_channel" && (
        <div>
          <label className="block text-sm font-medium mb-1">YouTube Channel URL</label>
          <input
            type="url"
            className="glass-input"
            value={data.youtube_channel_url as string || ""}
            onChange={e => onChange("youtube_channel_url", e.target.value)}
            placeholder="https://www.youtube.com/@ChannelName"
          />
          <p className="text-xs text-[#a1a1aa] mt-1">Channel ka URL — system last {data.video_days as string || "30"} days ki videos fetch karega.</p>
        </div>
      )}

      {data.video_source === "google_photos" && (
        <div>
          <label className="block text-sm font-medium mb-1">Google Photos Video URLs (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.google_photos_album_url as string || ""}
            onChange={e => onChange("google_photos_album_url", e.target.value)}
            placeholder={"https://photos.google.com/share/.../photo/...\nhttps://photos.google.com/share/.../photo/...\nhttps://photos.google.com/share/.../photo/..."}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Har line pe ek Google Photos video URL paste karein. Automation pehlay link se shuru karey gi aur order me chalegi.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.google_photos_album_url as string || "").split("\n").filter((l: string) => l.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      {data.video_source === "manual_links" && (
        <div>
          <label className="block text-sm font-medium mb-1">Direct Video URLs (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.manual_links as string || ""}
            onChange={e => onChange("manual_links", e.target.value)}
            placeholder={"https://example.com/video1.mp4\nhttps://example.com/video2.mp4\nhttps://example.com/video3.mp4"}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Har line pe ek direct video URL paste karein. Automation pehlay link se shuru karey gi aur order me chalegi.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.manual_links as string || "").split("\n").filter((l: string) => l.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={scheduleType} onChange={e => handleScheduleTypeChange(e.target.value)}>
          <option value="manual">Manual Only</option>
          <option value="minutes">Every X Minutes</option>
          <option value="hourly">Every X Hours</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {scheduleType === "minutes" && (
        <div>
          <label className="block text-sm font-medium mb-1">Minutes</label>
          <input className="glass-input" type="number" value={data.schedule_minutes as string || "30"} onChange={e => onChange("schedule_minutes", e.target.value)} min="1" max="1440" />
        </div>
      )}

      {scheduleType === "hourly" && (
        <div>
          <label className="block text-sm font-medium mb-1">Every X Hours</label>
          <input className="glass-input" type="number" value={data.schedule_hours as string || "1"} onChange={e => onChange("schedule_hours", e.target.value)} min="1" max="168" />
        </div>
      )}

      {(scheduleType === "daily" || scheduleType === "weekly") && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Run At</label>
            <select className="glass-select" value={data.schedule_run_time as string || "13:00"} onChange={e => onChange("schedule_run_time", e.target.value)}>
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <input className="glass-input" value={data.schedule_timezone as string || "UTC"} onChange={e => onChange("schedule_timezone", e.target.value)} placeholder="Asia/Karachi" />
          </div>
        </div>
      )}

      {scheduleType === "weekly" && (
        <div>
          <label className="block text-sm font-medium mb-2">Days</label>
          <div className="flex flex-wrap gap-2">
            {weekdayOptions.map((option) => {
              const active = weeklyDays.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleWeekday(option.value)}
                  className={`px-3 py-2 rounded-xl text-sm transition-all ${active ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "glass-button"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
        <p className="text-xs text-[#a1a1aa]">Minutes aur hourly schedules last completion ke baad interval count karte hain. Daily aur weekly schedules selected time/day ka next valid slot use karte hain.</p>
      </div>
    </div>
  );
}
