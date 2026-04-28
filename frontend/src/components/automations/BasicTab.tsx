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
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(weekdayOptions.map((option) => option.value));
  return value.filter((item): item is string => typeof item === "string" && allowed.has(item));
}

export default function BasicTab({ data, onChange }: TabProps) {
  const scheduleType = typeof data.schedule_type === "string" ? data.schedule_type : "manual";
  const weeklyDays = getWeekdays(data.schedule_weekdays);
  const isPromptMode = data.short_generation_mode === "prompt";
  const sourceOptions = [
    { value: "youtube", label: "Single YouTube Video" },
    { value: "youtube_channel", label: "YouTube Channel" },
    { value: "google_photos", label: "Google Photos" },
    { value: "manual_links", label: "Multiple Video Links" },
    { value: "direct", label: "Direct Video URLs" },
    { value: "local_folder", label: "Local Folder" },
  ];

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
      {isPromptMode && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
          `Short with Prompt` select hai. Is tab ka source setup normal workflow ke liye preserve rahega, lekin prompt mode apna single-source setup `Plan` tab se lega.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Video Source *</label>
        <select
          className="glass-select"
          value={data.video_source as string || "youtube"}
          disabled={isPromptMode}
          onChange={(event) => {
            onChange("video_source", event.target.value);
            onChange("video_url", "");
            onChange("youtube_channel_url", "");
            onChange("manual_links", "");
            onChange("google_photos_album_url", "");
            onChange("local_folder_path", "");
          }}
        >
          {sourceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isPromptMode && (
          <p className="mt-1 text-xs text-cyan-200/80">
            Prompt mode mein Basic tab ka source sirf saved fallback ke liye rahega. Actual run `Plan` tab ke single-source input se hoga.
          </p>
        )}
      </div>

      {!isPromptMode && (data.video_source === "youtube" || !data.video_source) && (
        <div>
          <label className="block text-sm font-medium mb-1">YouTube Source URL(s) (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.video_url as string || ""}
            onChange={(event) => onChange("video_url", event.target.value)}
            placeholder={"https://www.youtube.com/watch?v=abc123\nhttps://www.youtube.com/watch?v=xyz789"}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Har line pe ek public YouTube source URL paste karein. Runner is URL ko resolve karke download karega.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.video_url as string || "").split("\n").filter((line: string) => line.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      {!isPromptMode && data.video_source === "direct" && (
        <div>
          <label className="block text-sm font-medium mb-1">Direct Video URL(s) (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.video_url as string || ""}
            onChange={(event) => onChange("video_url", event.target.value)}
            placeholder={"https://example.com/video1.mp4\nhttps://example.com/video2.mp4\nhttps://example.com/video3.mp4"}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Direct video URLs paste karein (Cloudinary, AWS S3, signed `googlevideo/videoplayback` links, etc.). Signed links fori use ke liye best hotay hain.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.video_url as string || "").split("\n").filter((line: string) => line.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      {!isPromptMode && data.video_source === "youtube_channel" && (
        <div>
          <label className="block text-sm font-medium mb-1">YouTube Channel URL</label>
          <input
            type="url"
            className="glass-input"
            value={data.youtube_channel_url as string || ""}
            onChange={(event) => onChange("youtube_channel_url", event.target.value)}
            placeholder="https://www.youtube.com/@ChannelName"
          />
          <p className="text-xs text-[#a1a1aa] mt-1">
            Channel ka URL. System last {data.video_days as string || "30"} days ki videos fetch karega.
          </p>
        </div>
      )}

      {!isPromptMode && data.video_source === "google_photos" && (
        <div>
          <label className="block text-sm font-medium mb-1">Google Photos Source URL(s) (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.google_photos_links as string || ""}
            onChange={(event) => onChange("google_photos_links", event.target.value)}
            placeholder={"https://photos.google.com/share/.../photo/...\nhttps://photos.google.com/share/.../photo/...\nhttps://photos.google.com/share/.../photo/..."}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Har line pe ek public Google Photos share URL paste karein. Runner browser isay khol kar video ko directly download karega, phir process aur post karega.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.google_photos_links as string || "").split("\n").filter((line: string) => line.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      {!isPromptMode && data.video_source === "manual_links" && (
        <div>
          <label className="block text-sm font-medium mb-1">Direct Video URLs (one per line)</label>
          <textarea
            className="glass-input min-h-[120px]"
            value={data.manual_links as string || ""}
            onChange={(event) => onChange("manual_links", event.target.value)}
            placeholder={"https://example.com/video1.mp4\nhttps://example.com/video2.mp4\nhttps://example.com/video3.mp4"}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-[#a1a1aa]">Har line pe ek direct video URL paste karein. MP4/CDN links ke sath signed `googlevideo/videoplayback` links bhi supported hain aur automation order me chalegi.</p>
            <span className="text-xs font-medium text-[#8b5cf6]">
              {((data.manual_links as string || "").split("\n").filter((line: string) => line.trim()).length)} links
            </span>
          </div>
        </div>
      )}

      {!isPromptMode && data.video_source === "local_folder" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Local Folder Path</label>
            <input
              type="text"
              className="glass-input"
              value={data.local_folder_path as string || ""}
              onChange={(event) => onChange("local_folder_path", event.target.value)}
              placeholder={"C:\\Videos\\Stock\\Shorts or /Users/name/Videos/Stock"}
            />
            <p className="text-xs text-[#a1a1aa] mt-1">Yeh folder user ke local runner PC par hona chahiye. Runner isi folder se next unprocessed file uthayega.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Folder Pick Strategy</label>
            <select
              className="glass-select"
              value={data.local_folder_strategy as string || "alphabetical"}
              onChange={(event) => onChange("local_folder_strategy", event.target.value)}
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="newest">Newest First</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>
      )}

      <div className="space-y-2 py-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="skip_upload"
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={!!data.skip_upload}
            onChange={(e) => onChange("skip_upload", e.target.checked)}
          />
          <label htmlFor="skip_upload" className="text-sm font-medium">Skip Upload (Save Locally Only)</label>
        </div>
        <p className="text-xs text-[#a1a1aa]">Enable this for local runners to skip Catbox/Litterbox uploading and keep videos on your PC.</p>
      </div>

      {!!data.skip_upload && (
        <div>
          <label className="block text-sm font-medium mb-1">Processed Video Save Folder</label>
          <input
            type="text"
            className="glass-input"
            value={data.local_output_dir as string || ""}
            onChange={(event) => onChange("local_output_dir", event.target.value)}
            placeholder={"D:\\Processed Videos\\Shorts or C:\\Users\\name\\Videos\\Processed"}
          />
          <p className="text-xs text-[#a1a1aa] mt-1">
            Optional. Agar blank chhor dein to local runner default output folder use karega. Agar path dein to final processed videos isi folder mein save hongi.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Schedule</label>
        <select className="glass-select" value={scheduleType} onChange={(event) => handleScheduleTypeChange(event.target.value)}>
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
          <input className="glass-input" type="number" value={data.schedule_minutes as string || "30"} onChange={(event) => onChange("schedule_minutes", event.target.value)} min="1" max="1440" />
        </div>
      )}

      {scheduleType === "hourly" && (
        <div>
          <label className="block text-sm font-medium mb-1">Every X Hours</label>
          <input className="glass-input" type="number" value={data.schedule_hours as string || "1"} onChange={(event) => onChange("schedule_hours", event.target.value)} min="1" max="168" />
        </div>
      )}

      {(scheduleType === "daily" || scheduleType === "weekly") && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Run At</label>
            <select className="glass-select" value={data.schedule_run_time as string || "13:00"} onChange={(event) => onChange("schedule_run_time", event.target.value)}>
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <input className="glass-input" value={data.schedule_timezone as string || "UTC"} onChange={(event) => onChange("schedule_timezone", event.target.value)} placeholder="Asia/Karachi" />
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
        <p className="text-xs text-[#a1a1aa]">Minutes and hourly schedules count from the last completion. Daily and weekly schedules pick the next valid slot for the selected time and timezone.</p>
      </div>
    </div>
  );
}
