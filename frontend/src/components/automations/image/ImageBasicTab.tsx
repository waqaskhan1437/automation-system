import { useEffect } from "react";
import type { TabProps } from "../types";

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

export default function ImageBasicTab({ data, onChange }: TabProps) {
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

    if (value === "minutes" && !data.schedule_minutes) onChange("schedule_minutes", "30");
    if (value === "hourly" && !data.schedule_hours) onChange("schedule_hours", "1");
    if ((value === "daily" || value === "weekly") && !data.schedule_run_time) onChange("schedule_run_time", "13:00");
    if (value === "weekly" && weeklyDays.length === 0) onChange("schedule_weekdays", ["sunday"]);
  };

  const toggleWeekday = (day: string) => {
    const nextDays = weeklyDays.includes(day)
      ? weeklyDays.filter((item) => item !== day)
      : weekdayOptions.map((option) => option.value).filter((value) => weeklyDays.includes(value) || value === day);

    onChange("schedule_weekdays", nextDays);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">Automation Schedule</label>
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
                <option key={option.value} value={option.value}>{option.label}</option>
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
    </div>
  );
}
